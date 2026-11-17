/**
 * Worker de AgroFerti MIC: sirve la app (archivos estáticos) y la API de la nube en /api/*.
 * Plan gratuito de Cloudflare: si se supera un límite diario, la API responde con error y la app
 * sigue funcionando con los datos del teléfono. Nunca se pasa a un plan de pago.
 */
import {
  MAX_BAJADA,
  validarSolicitudSincronizar,
  type CambioNube,
  type ErrorApi,
  type RespuestaSesion,
  type RespuestaSincronizar
} from '../src/lib/protocoloNube.ts';
import { crearObtenerClaves, ErrorToken, verificarTokenGoogle } from './google.ts';
import { crearSesion, verificarSesion } from './sesion.ts';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Client ID de Google (no es secreto). */
  GOOGLE_CLIENT_ID: string;
  /** Secreto para firmar las sesiones (`wrangler secret put SESION_SECRETO`). */
  SESION_SECRETO: string;
}

const MAX_CUERPO = 6_000_000;
const obtenerClaves = crearObtenerClaves();

/** Guarda el cambio solo si es igual o más reciente que el de la nube; cada cambio aceptado recibe una versión nueva. */
const SQL_GUARDAR = `
INSERT INTO registros (usuario, tabla, id, datos, actualizado, version)
VALUES (?1, ?2, ?3, ?4, ?5, (SELECT COALESCE(MAX(version), 0) + 1 FROM registros WHERE usuario = ?1))
ON CONFLICT (usuario, tabla, id) DO UPDATE SET
  datos = excluded.datos, actualizado = excluded.actualizado, version = excluded.version
WHERE excluded.actualizado >= registros.actualizado
RETURNING version`;

const SQL_RECHAZADOS = `
SELECT tabla, id, datos, actualizado, version FROM registros
WHERE usuario = ?1 AND (tabla, id) IN (SELECT json_extract(value, '$.t'), json_extract(value, '$.i') FROM json_each(?2))`;

const SQL_BAJAR = `
SELECT tabla, id, datos, actualizado, version FROM registros
WHERE usuario = ?1 AND version > ?2 ORDER BY version LIMIT ?3`;

class ErrorRespuesta extends Error {
  constructor(readonly estado: number, readonly codigo: ErrorApi['codigo'], mensaje: string) {
    super(mensaje);
  }
}

const json = (cuerpo: unknown, estado = 200) => new Response(JSON.stringify(cuerpo), {
  status: estado,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

async function leerCuerpo(request: Request): Promise<unknown> {
  const texto = await request.text();
  if (texto.length > MAX_CUERPO) throw new ErrorRespuesta(413, 'solicitud-invalida', 'La solicitud es demasiado grande.');
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErrorRespuesta(400, 'solicitud-invalida', 'La solicitud no es JSON válido.');
  }
}

function configurado(env: Env) {
  if (!env.GOOGLE_CLIENT_ID || !env.SESION_SECRETO) {
    throw new ErrorRespuesta(503, 'no-configurado', 'La nube todavía no está configurada en el servidor.');
  }
}

/** Usuario de la sesión enviada en "Authorization: Bearer ...", que además debe existir en la nube. */
async function usuarioDeSesion(request: Request, env: Env): Promise<string> {
  configurado(env);
  const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  const sesion = token ? await verificarSesion(token, env.SESION_SECRETO) : null;
  if (!sesion) throw new ErrorRespuesta(401, 'no-autorizado', 'La sesión venció o no es válida. Inicia sesión de nuevo.');
  const existe = await env.DB.prepare('SELECT 1 FROM usuarios WHERE sub = ?1').bind(sesion.sub).first();
  if (!existe) throw new ErrorRespuesta(401, 'no-autorizado', 'Tu cuenta no está en la nube (pudo haberse borrado). Inicia sesión de nuevo.');
  return sesion.sub;
}

async function iniciarSesion(request: Request, env: Env): Promise<Response> {
  configurado(env);
  const cuerpo = await leerCuerpo(request) as { credencial?: unknown; consentimiento?: unknown };
  if (typeof cuerpo?.credencial !== 'string') throw new ErrorRespuesta(400, 'solicitud-invalida', 'Falta la credencial de Google.');
  let google;
  try {
    google = await verificarTokenGoogle(cuerpo.credencial, env.GOOGLE_CLIENT_ID, obtenerClaves);
  } catch (e) {
    if (e instanceof ErrorToken) throw new ErrorRespuesta(401, 'no-autorizado', e.message);
    throw e;
  }
  const ahora = new Date().toISOString();
  const existe = await env.DB.prepare('SELECT 1 FROM usuarios WHERE sub = ?1').bind(google.sub).first();
  if (!existe) {
    // Ley 1581 de 2012: sin la autorización del titular no se guarda ningún dato suyo.
    if (cuerpo.consentimiento !== true) {
      throw new ErrorRespuesta(403, 'sin-consentimiento', 'Para guardar tus datos en la nube primero debes aceptar la autorización de tratamiento de datos.');
    }
    await env.DB.prepare('INSERT INTO usuarios (sub, email, nombre, consentimiento_at, creado_at) VALUES (?1, ?2, ?3, ?4, ?4)')
      .bind(google.sub, google.email, google.nombre ?? null, ahora).run();
  } else {
    await env.DB.prepare('UPDATE usuarios SET email = ?2, nombre = ?3 WHERE sub = ?1').bind(google.sub, google.email, google.nombre ?? null).run();
  }
  const sesion = await crearSesion(google.sub, env.SESION_SECRETO);
  const respuesta: RespuestaSesion = { token: sesion.token, vence: new Date(sesion.vence).toISOString(), usuario: google };
  return json(respuesta);
}

type FilaCambio = Omit<CambioNube, 'tabla'> & { tabla: CambioNube['tabla'] };

async function sincronizar(request: Request, env: Env): Promise<Response> {
  const sub = await usuarioDeSesion(request, env);
  const validada = validarSolicitudSincronizar(await leerCuerpo(request));
  if (!validada.ok) throw new ErrorRespuesta(400, 'solicitud-invalida', validada.error);
  const { desde, cambios } = validada.solicitud;

  // Una sola transacción (batch): o se guardan todos los cambios aceptados o ninguno.
  const resultados = cambios.length
    ? await env.DB.batch(cambios.map(c => env.DB.prepare(SQL_GUARDAR).bind(sub, c.tabla, c.id, c.datos, c.actualizado)))
    : [];
  const noAceptados = cambios.filter((_, i) => !resultados[i]?.results?.length);
  const rechazados = noAceptados.length
    ? (await env.DB.prepare(SQL_RECHAZADOS).bind(sub, JSON.stringify(noAceptados.map(c => ({ t: c.tabla, i: c.id })))).all<FilaCambio>()).results
    : [];

  const filas = (await env.DB.prepare(SQL_BAJAR).bind(sub, desde, MAX_BAJADA + 1).all<FilaCambio>()).results;
  const hayMas = filas.length > MAX_BAJADA;
  const lote = filas.slice(0, MAX_BAJADA);
  const respuesta: RespuestaSincronizar = {
    rechazados,
    cambios: lote,
    hasta: lote.length ? lote[lote.length - 1].version : desde,
    hayMas
  };
  return json(respuesta);
}

/** Derecho de supresión (Ley 1581): borra todos los datos del usuario en la nube. El teléfono no cambia. */
async function borrarCuenta(request: Request, env: Env): Promise<Response> {
  const sub = await usuarioDeSesion(request, env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM registros WHERE usuario = ?1').bind(sub),
    env.DB.prepare('DELETE FROM usuarios WHERE sub = ?1').bind(sub)
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
      return json({ error: 'Ruta no encontrada.', codigo: 'solicitud-invalida' } satisfies ErrorApi, 404);
    } catch (e) {
      if (e instanceof ErrorRespuesta) return json({ error: e.message, codigo: e.codigo } satisfies ErrorApi, e.estado);
      console.error(e);
      // Incluye el límite diario del plan gratuito de D1: no se cobra, solo falla hasta el día siguiente.
      return json({
        error: 'La nube no está disponible en este momento (puede ser el límite diario del plan gratuito). Tus datos siguen guardados en este teléfono.',
        codigo: 'error-interno'
      } satisfies ErrorApi, 503);
    }
  }
} satisfies ExportedHandler<Env>;
