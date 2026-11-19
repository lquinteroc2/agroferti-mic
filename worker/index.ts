/**
 * Worker de AgroFerti MIC: sirve la app (archivos estáticos) y la API de la nube en /api/*.
 * Plan gratuito de Cloudflare: si se supera un límite diario, la API responde con error y la app
 * sigue funcionando con los datos del dispositivo. Nunca se pasa a un plan de pago.
 */
import {
  CUOTA_BYTES,
  CUOTA_FILAS,
  MAX_BAJADA,
  MAX_BYTES_BAJADA,
  MAX_CUERPO,
  VERSION_AUTORIZACION,
  validarSolicitudSincronizar,
  type Cambio,
  type CambioNube,
  type ErrorApi,
  type RegistroInvalido,
  type RespuestaSesion,
  type RespuestaSincronizar
} from '../src/lib/protocoloNube.ts';
import { decodificarRegistro } from '../src/lib/codificacion.ts';
import { problemaParaNube } from '../src/lib/validacionNube.ts';
import { crearObtenerClaves, ErrorDescargaClaves, ErrorToken, verificarTokenGoogle } from './google.ts';
import { crearSesion, verificarSesion } from './sesion.ts';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Client ID de Google (no es secreto). */
  GOOGLE_CLIENT_ID: string;
  /** Secreto para firmar las sesiones (`wrangler secret put SESION_SECRETO`). */
  SESION_SECRETO: string;
}

/** Fechas de actualización más adelantadas que esto (reloj del dispositivo adelantado) se recortan a la hora del servidor. */
const MARGEN_RELOJ_MS = 5 * 60_000;
const obtenerClaves = crearObtenerClaves();

/**
 * Guarda el cambio solo si es igual o más reciente que el de la nube. Un plan aprobado no se
 * modifica (solo se elimina, junto con su lote). Cada cambio aceptado recibe una versión nueva.
 */
const SQL_GUARDAR = `
INSERT INTO registros (usuario, tabla, id, datos, actualizado, version)
VALUES (?1, ?2, ?3, ?4, ?5, (SELECT COALESCE(MAX(version), 0) + 1 FROM registros WHERE usuario = ?1))
ON CONFLICT (usuario, tabla, id) DO UPDATE SET
  datos = excluded.datos, actualizado = excluded.actualizado, version = excluded.version
WHERE excluded.actualizado >= registros.actualizado
  AND NOT (registros.tabla = 'planes' AND registros.datos IS NOT NULL AND excluded.datos IS NOT NULL
    AND json_extract(registros.datos, '$.estado') = 'aprobado' AND excluded.datos IS NOT registros.datos)
RETURNING version`;

const SQL_RECHAZADOS = `
SELECT tabla, id, datos, actualizado, version FROM registros
WHERE usuario = ?1 AND (tabla, id) IN (SELECT json_extract(value, '$.t'), json_extract(value, '$.i') FROM json_each(?2))`;

/** Primero solo los tamaños, para cortar la página antes de leer los datos. */
const SQL_TAMANOS = `
SELECT version, COALESCE(length(datos), 0) AS bytes FROM registros
WHERE usuario = ?1 AND version > ?2 ORDER BY version LIMIT ?3`;

const SQL_BAJAR = `
SELECT tabla, id, datos, actualizado, version FROM registros
WHERE usuario = ?1 AND version > ?2 AND version <= ?3 ORDER BY version`;

class ErrorRespuesta extends Error {
  constructor(readonly estado: number, readonly codigo: ErrorApi['codigo'], mensaje: string) {
    super(mensaje);
  }
}

const json = (cuerpo: unknown, estado = 200) => new Response(JSON.stringify(cuerpo), {
  status: estado,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

const muyGrande = () => new ErrorRespuesta(413, 'solicitud-invalida', 'La solicitud es demasiado grande.');

/** Lee el cuerpo sin pasar de MAX_CUERPO bytes: un cuerpo enorme se corta sin cargarlo completo en memoria. */
async function leerCuerpo(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_CUERPO) throw muyGrande();
  const partes: Uint8Array[] = [];
  let total = 0;
  if (request.body) {
    const lector = request.body.getReader();
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_CUERPO) {
        await lector.cancel();
        throw muyGrande();
      }
      partes.push(value);
    }
  }
  const bytes = new Uint8Array(total);
  let posicion = 0;
  for (const p of partes) { bytes.set(p, posicion); posicion += p.byteLength; }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ErrorRespuesta(400, 'solicitud-invalida', 'La solicitud no es JSON válido.');
  }
}

function configurado(env: Env) {
  if (!env.GOOGLE_CLIENT_ID || !env.SESION_SECRETO) {
    throw new ErrorRespuesta(503, 'no-configurado', 'La nube todavía no está configurada en el servidor.');
  }
}

interface Cuenta { sub: string; epoca: string; bytes: number; filas: number }

/** Cuenta de la sesión enviada en "Authorization: Bearer ...". Debe existir y ser de la misma época. */
async function cuentaDeSesion(request: Request, env: Env): Promise<Cuenta> {
  configurado(env);
  const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  const sesion = token ? await verificarSesion(token, env.SESION_SECRETO) : null;
  if (!sesion) throw new ErrorRespuesta(401, 'no-autorizado', 'La sesión venció o no es válida. Inicia sesión de nuevo.');
  const cuenta = await env.DB.prepare('SELECT sub, epoca, bytes, filas FROM usuarios WHERE sub = ?1').bind(sesion.sub).first<Cuenta>();
  if (!cuenta || cuenta.epoca !== sesion.epoca) {
    throw new ErrorRespuesta(401, 'no-autorizado', 'Tu cuenta en la nube cambió o se borró. Inicia sesión de nuevo.');
  }
  return cuenta;
}

const nuevaEpoca = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');

async function iniciarSesion(request: Request, env: Env): Promise<Response> {
  configurado(env);
  const cuerpo = await leerCuerpo(request) as { credencial?: unknown; consentimiento?: unknown; vinculado?: unknown };
  if (typeof cuerpo?.credencial !== 'string') throw new ErrorRespuesta(400, 'solicitud-invalida', 'Falta la credencial de Google.');
  let google;
  try {
    google = await verificarTokenGoogle(cuerpo.credencial, env.GOOGLE_CLIENT_ID, obtenerClaves);
  } catch (e) {
    if (e instanceof ErrorToken) throw new ErrorRespuesta(401, 'no-autorizado', e.message);
    if (e instanceof ErrorDescargaClaves) throw new ErrorRespuesta(503, 'error-interno', 'No se pudo comprobar el inicio de sesión con Google. Vuelve a intentarlo en unos minutos.');
    throw e;
  }
  // El dispositivo ya tiene datos de otra cuenta: no se crea ni se modifica nada.
  if (typeof cuerpo.vinculado === 'string' && cuerpo.vinculado && cuerpo.vinculado !== google.sub) {
    throw new ErrorRespuesta(409, 'otra-cuenta', 'Este dispositivo tiene datos de otra cuenta.');
  }
  const consentimiento = cuerpo.consentimiento === true;
  const existente = await env.DB.prepare('SELECT 1 FROM usuarios WHERE sub = ?1').bind(google.sub).first();
  // Ley 1581 de 2012: sin la autorización del titular no se guarda ningún dato suyo.
  if (!existente && !consentimiento) {
    throw new ErrorRespuesta(403, 'sin-consentimiento', 'Para guardar tus datos en la nube primero debes aceptar la autorización de tratamiento de datos.');
  }
  const ahora = new Date().toISOString();
  // ON CONFLICT: dos inicios de sesión simultáneos de una cuenta nueva no chocan.
  const fila = await env.DB.prepare(`
    INSERT INTO usuarios (sub, email, nombre, consentimiento_at, consentimiento_version, creado_at, epoca)
    VALUES (?1, ?2, ?3, ?4, ?5, ?4, ?6)
    ON CONFLICT (sub) DO UPDATE SET email = excluded.email, nombre = excluded.nombre,
      consentimiento_at = CASE WHEN ?7 THEN excluded.consentimiento_at ELSE usuarios.consentimiento_at END,
      consentimiento_version = CASE WHEN ?7 THEN excluded.consentimiento_version ELSE usuarios.consentimiento_version END
    RETURNING epoca`)
    .bind(google.sub, google.email, google.nombre ?? null, ahora, VERSION_AUTORIZACION, nuevaEpoca(), consentimiento ? 1 : 0)
    .first<{ epoca: string }>();
  if (!fila) throw new Error('No se pudo registrar la cuenta.');
  const sesion = await crearSesion(google.sub, fila.epoca, env.SESION_SECRETO);
  const respuesta: RespuestaSesion = { token: sesion.token, vence: new Date(sesion.vence).toISOString(), epoca: fila.epoca, usuario: google };
  return json(respuesta);
}

async function sincronizar(request: Request, env: Env): Promise<Response> {
  const cuenta = await cuentaDeSesion(request, env);
  const validada = validarSolicitudSincronizar(await leerCuerpo(request));
  if (!validada.ok) throw new ErrorRespuesta(400, 'solicitud-invalida', validada.error);
  const { desde } = validada.solicitud;
  const hoy = new Date();
  const tope = new Date(hoy.getTime() + MARGEN_RELOJ_MS).toISOString();

  // Validación de contenido: las mismas reglas que aplica la app (opción 1 de la revisión).
  const invalidos: RegistroInvalido[] = [];
  const validos: Cambio[] = [];
  for (const c of validada.solicitud.cambios) {
    if (c.datos !== null) {
      let registro: unknown;
      try {
        registro = decodificarRegistro(c.datos);
      } catch {
        invalidos.push({ tabla: c.tabla, id: c.id, motivo: 'Los datos no son JSON válido.' });
        continue;
      }
      const problema = problemaParaNube(c.tabla, c.id, registro, hoy);
      if (problema) { invalidos.push({ tabla: c.tabla, id: c.id, motivo: problema }); continue; }
    }
    // Un reloj adelantado no puede ganar a todas las ediciones futuras de los demás dispositivos.
    validos.push({ ...c, actualizado: c.actualizado > tope ? tope : c.actualizado });
  }
  // Cuota de la cuenta: al llegar, solo se aceptan eliminaciones (liberan espacio).
  const cuotaExcedida = cuenta.bytes >= CUOTA_BYTES || cuenta.filas >= CUOTA_FILAS;
  const aGuardar = cuotaExcedida ? validos.filter(c => c.datos === null) : validos;

  // Una sola transacción (batch): o se guardan todos los cambios aceptados o ninguno.
  const resultados = aGuardar.length
    ? await env.DB.batch(aGuardar.map(c => env.DB.prepare(SQL_GUARDAR).bind(cuenta.sub, c.tabla, c.id, c.datos, c.actualizado)))
    : [];
  const noAceptados = aGuardar.filter((_, i) => !resultados[i]?.results?.length);
  const rechazados = noAceptados.length
    ? (await env.DB.prepare(SQL_RECHAZADOS).bind(cuenta.sub, JSON.stringify(noAceptados.map(c => ({ t: c.tabla, i: c.id })))).all<CambioNube>()).results
    : [];

  // Página acotada por cantidad y por tamaño (al menos un registro, para avanzar siempre).
  const tamanos = (await env.DB.prepare(SQL_TAMANOS).bind(cuenta.sub, desde, MAX_BAJADA + 1).all<{ version: number; bytes: number }>()).results;
  let hasta = desde;
  let acumulado = 0;
  let incluidos = 0;
  for (const t of tamanos.slice(0, MAX_BAJADA)) {
    if (incluidos > 0 && acumulado + t.bytes > MAX_BYTES_BAJADA) break;
    acumulado += t.bytes;
    hasta = t.version;
    incluidos++;
  }
  const cambios = incluidos
    ? (await env.DB.prepare(SQL_BAJAR).bind(cuenta.sub, desde, hasta).all<CambioNube>()).results
    : [];
  const respuesta: RespuestaSincronizar = {
    epoca: cuenta.epoca,
    rechazados,
    invalidos,
    cuotaExcedida,
    cambios,
    hasta,
    hayMas: incluidos < tamanos.length
  };
  return json(respuesta);
}

const TIPOS_REFERENCIA: Record<string, 'fertilizantes' | 'reglasDosis' | 'niveles'> = { fertilizante: 'fertilizantes', dosis: 'reglasDosis', nivel: 'niveles' };

/**
 * Referencias técnicas (iguales para todos). Si el dispositivo ya tiene la versión actual, no se leen
 * las filas: así se cuida el límite diario de lecturas del plan gratuito.
 */
async function referencias(request: Request, env: Env): Promise<Response> {
  await cuentaDeSesion(request, env);
  const meta = await env.DB.prepare("SELECT valor FROM referencias_meta WHERE clave = 'version'").first<{ valor: string }>();
  if (!meta) return json({ version: '', fertilizantes: [], reglasDosis: [], niveles: [] });
  if (new URL(request.url).searchParams.get('version') === meta.valor) return json({ sinCambios: true, version: meta.valor });
  const filas = (await env.DB.prepare('SELECT tipo, datos FROM referencias ORDER BY tipo, id').all<{ tipo: string; datos: string }>()).results;
  // Con miles de fertilizantes, leer y volver a escribir cada fila gastaría el tiempo de CPU del plan
  // gratuito: se unen los textos tal como están (los escribió scripts/referencias-sql.ts con
  // JSON.stringify, y la app verifica cada referencia al recibirla).
  const partes: Record<'fertilizantes' | 'reglasDosis' | 'niveles', string[]> = { fertilizantes: [], reglasDosis: [], niveles: [] };
  for (const f of filas) {
    const destino = TIPOS_REFERENCIA[f.tipo];
    if (destino && f.datos.startsWith('{') && f.datos.endsWith('}')) partes[destino].push(f.datos);
  }
  const cuerpo = `{"version":${JSON.stringify(meta.valor)},"fertilizantes":[${partes.fertilizantes.join(',')}],"reglasDosis":[${partes.reglasDosis.join(',')}],"niveles":[${partes.niveles.join(',')}]}`;
  return new Response(cuerpo, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

/** Derecho de supresión (Ley 1581): borra todos los datos del usuario en la nube. El dispositivo no cambia. */
async function borrarCuenta(request: Request, env: Env): Promise<Response> {
  const cuenta = await cuentaDeSesion(request, env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM registros WHERE usuario = ?1').bind(cuenta.sub),
    env.DB.prepare('DELETE FROM usuarios WHERE sub = ?1').bind(cuenta.sub)
  ]);
  return json({ ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (url.pathname === '/api/sesion' && request.method === 'POST') return await iniciarSesion(request, env);
      if (url.pathname === '/api/sincronizar' && request.method === 'POST') return await sincronizar(request, env);
      if (url.pathname === '/api/cuenta' && request.method === 'DELETE') return await borrarCuenta(request, env);
      if (url.pathname === '/api/referencias' && request.method === 'GET') return await referencias(request, env);
      return json({ error: 'Ruta no encontrada.', codigo: 'solicitud-invalida' } satisfies ErrorApi, 404);
    } catch (e) {
      if (e instanceof ErrorRespuesta) return json({ error: e.message, codigo: e.codigo } satisfies ErrorApi, e.estado);
      console.error(e);
      // Incluye el límite diario del plan gratuito de D1: no se cobra, solo falla hasta el día siguiente.
      return json({
        error: 'La nube no está disponible en este momento (puede ser el límite diario del plan gratuito). Tus datos siguen guardados en este dispositivo.',
        codigo: 'error-interno'
      } satisfies ErrorApi, 503);
    }
  }
} satisfies ExportedHandler<Env>;
