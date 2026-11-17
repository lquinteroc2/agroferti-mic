/**
 * Nube: verificación del token de Google, sesión firmada, protocolo, validación de contenido y
 * sincronización entre teléfonos simulados contra una nube en memoria con las mismas reglas del SQL
 * del Worker. Incluye un caso por cada hallazgo de las revisiones del 17 de noviembre de 2026.
 * Todos los datos son de EJEMPLO.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearObtenerClaves, ErrorToken, verificarTokenGoogle, type ClavePublica } from '../worker/google.ts';
import { crearSesion, DURACION_SESION_MS, verificarSesion } from '../worker/sesion.ts';
import { MAX_BAJADA, MAX_BYTES_BAJADA, MAX_SUBIDA, TABLAS_NUBE, validarSolicitudSincronizar, type CambioNube, type RespuestaSincronizar, type SolicitudSincronizar } from '../src/lib/protocoloNube.ts';
import { codificarRegistro, decodificarRegistro } from '../src/lib/codificacion.ts';
import { calcularPendientes, claveDe, contarSinLote, sincronizar, type AlmacenSincronizacion, type TablasNube, type VersionApartada } from '../src/lib/sincronizacion.ts';
import { problemaParaNube } from '../src/lib/validacionNube.ts';
import { copiarProducto } from '../src/lib/validacionPlan.ts';
import type { PlanFertilizacion, ProductoFertilizante } from '../src/types.ts';

const AHORA = Date.UTC(2026, 10, 17, 15);

// ---- Token de Google ----

const CLIENT_ID = 'cliente-EJEMPLO.apps.googleusercontent.com';
const b64url = (bytes: Uint8Array | string) =>
  Buffer.from(typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes).toString('base64url');

async function clavesDePrueba() {
  const par = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const publica = { ...(await crypto.subtle.exportKey('jwk', par.publicKey)), kid: 'k1' } as ClavePublica;
  const firmar = async (carga: Record<string, unknown>, cabecera: Record<string, unknown> = { alg: 'RS256', kid: 'k1', typ: 'JWT' }) => {
    const datos = `${b64url(JSON.stringify(cabecera))}.${b64url(JSON.stringify(carga))}`;
    const firma = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', par.privateKey, new TextEncoder().encode(datos)));
    return `${datos}.${b64url(firma)}`;
  };
  return { publica, firmar };
}

const cargaValida = (cambios: Record<string, unknown> = {}) => ({
  iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: '1234567890', email: 'productor.ejemplo@gmail.com',
  email_verified: true, name: 'Productor EJEMPLO', exp: AHORA / 1000 + 3600, iat: AHORA / 1000, ...cambios
});

test('Google: un token válido devuelve el usuario por sub; se rechazan firma, emisor, aplicación, vencimiento y correo sin verificar', async () => {
  const { publica, firmar } = await clavesDePrueba();
  const claves = async () => [publica];
  const usuario = await verificarTokenGoogle(await firmar(cargaValida()), CLIENT_ID, claves, AHORA);
  assert.deepEqual(usuario, { sub: '1234567890', email: 'productor.ejemplo@gmail.com', nombre: 'Productor EJEMPLO' });

  const rechaza = async (token: string, patron: RegExp) =>
    assert.rejects(verificarTokenGoogle(token, CLIENT_ID, claves, AHORA), (e: unknown) => e instanceof ErrorToken && patron.test(e.message));
  await rechaza(await firmar(cargaValida({ aud: 'otra-app' })), /otra aplicación/);
  await rechaza(await firmar(cargaValida({ iss: 'https://evil.example' })), /no lo emitió Google/);
  await rechaza(await firmar(cargaValida({ exp: AHORA / 1000 - 120 })), /venció/);
  await rechaza(await firmar(cargaValida({ email_verified: false })), /correo verificado/);
  await rechaza(await firmar(cargaValida(), { alg: 'none', kid: 'k1' }), /firma esperada/);
  await rechaza(await firmar(cargaValida(), { alg: 'RS256', kid: 'desconocida' }), /No se encontró la clave/);
  await rechaza('no.es.un-token', /formato/);
  const [c, , f] = (await firmar(cargaValida())).split('.');
  await rechaza(`${c}.${b64url(JSON.stringify(cargaValida({ sub: 'otro' })))}.${f}`, /firma del token no es válida/);
});

test('revisión backend 8: firma con base64 inválido o clave que no es RSA dan "token no válido", no un error del servidor', async () => {
  const { publica, firmar } = await clavesDePrueba();
  const [c, p] = (await firmar(cargaValida())).split('.');
  await assert.rejects(verificarTokenGoogle(`${c}.${p}.@@@###`, CLIENT_ID, async () => [publica], AHORA), ErrorToken);
  const noRsa = { ...publica, kty: 'EC' } as ClavePublica;
  await assert.rejects(verificarTokenGoogle(await firmar(cargaValida()), CLIENT_ID, async () => [noRsa], AHORA), ErrorToken);
});

test('revisión backend 9: una clave desconocida fuerza la descarga como mucho una vez por minuto', async () => {
  let descargas = 0;
  let reloj = AHORA;
  const descargar = (async () => { descargas++; return new Response(JSON.stringify({ keys: [{ kid: 'k1', kty: 'RSA' }] }), { headers: { 'cache-control': 'max-age=3600' } }); }) as typeof fetch;
  const obtener = crearObtenerClaves(descargar, () => reloj);
  await obtener(false);
  await obtener(true);
  await obtener(true);
  assert.equal(descargas, 1, 'dentro del minuto, la descarga forzada usa la caché');
  reloj += 61_000;
  await obtener(true);
  assert.equal(descargas, 2);
});

// ---- Sesión propia ----

const SECRETO = 'secreto-de-prueba-EJEMPLO-con-mas-de-32-caracteres';

test('sesión: firmada con la época, vence a los 30 días; se rechaza alterada, vencida o con otro secreto', async () => {
  const { token, vence } = await crearSesion('sub-1', 'epoca-1', SECRETO, AHORA);
  assert.equal(vence, AHORA + DURACION_SESION_MS);
  assert.deepEqual(await verificarSesion(token, SECRETO, AHORA + 1000), { sub: 'sub-1', epoca: 'epoca-1', vence });
  assert.equal(await verificarSesion(token, SECRETO, vence + 1), null, 'vencida');
  assert.equal(await verificarSesion(token, `${SECRETO}-otro`, AHORA), null, 'otro secreto');
  const [v, , firma] = token.split('.');
  assert.equal(await verificarSesion(`${v}.${b64url(JSON.stringify({ sub: 'sub-2', epoca: 'epoca-1', vence }))}.${firma}`, SECRETO, AHORA), null, 'alterada');
  assert.equal(await verificarSesion('basura', SECRETO, AHORA), null);
  await assert.rejects(crearSesion('sub-1', 'e', 'corto'), /32 caracteres/);
});

// ---- Protocolo y validación de contenido ----

test('protocolo: valida tabla, id, fecha ISO, tamaño, duplicados y máximo de cambios por solicitud', () => {
  const cambio = { tabla: 'lotes', id: 'l1', datos: '{}', actualizado: '2026-11-17T10:00:00.000Z' };
  assert.ok(validarSolicitudSincronizar({ desde: 0, cambios: [cambio, { ...cambio, id: 'l2', datos: null, actualizado: '' }] }).ok);
  const error = (cuerpo: unknown) => { const r = validarSolicitudSincronizar(cuerpo); return r.ok ? '' : r.error; };
  assert.match(error({ desde: -1, cambios: [] }), /desde/);
  assert.match(error({ desde: 0, cambios: [{ ...cambio, tabla: 'usuarios' }] }), /tabla/);
  assert.match(error({ desde: 0, cambios: [{ ...cambio, id: '' }] }), /identificador/);
  assert.match(error({ desde: 0, cambios: [{ ...cambio, actualizado: 'mañana' }] }), /fecha de actualización/);
  assert.match(error({ desde: 0, cambios: [{ ...cambio, datos: 'x'.repeat(50_001) }] }), /demasiado grandes/);
  assert.match(error({ desde: 0, cambios: [cambio, cambio] }), /dos veces/);
  assert.match(error({ desde: 0, cambios: Array.from({ length: MAX_SUBIDA + 1 }, (_, i) => ({ ...cambio, id: `l${i}` })) }), /máximo/);
  assert.match(error(null), /estructura/);
});

const lote = (id: string, cambios: Record<string, unknown> = {}) => ({
  id, nombre: `Lote ${id} EJEMPLO`, cultivo: 'papa', areaM2: 500, createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z', ...cambios
});
const analisis = (id: string, cambios: Record<string, unknown> = {}) => ({
  id, loteId: 'l1', fechaAnalisis: '2026-11-02', profundidadCm: 20, nutrientes: [], createdAt: '2026-11-02T10:00:00.000Z', updatedAt: '2026-11-02T10:00:00.000Z', ...cambios
});
const observacion = (id: string, loteId = 'l1') => ({
  id, loteId, tipo: 'observacion', fecha: '2026-11-01', descripcion: 'Observación EJEMPLO', esEjemplo: true, createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z'
});
const DAP: ProductoFertilizante = { id: 'dap', nombre: 'DAP EJEMPLO', esEjemplo: true, contenido: [{ elemento: 'Fósforo', forma: 'P₂O₅', porcentaje: 46 }] };
const planAprobado = (cambios: Partial<PlanFertilizacion> = {}): PlanFertilizacion => ({
  id: 'p1', loteId: 'l1', nombre: 'Plan EJEMPLO', areaM2AlCrear: 500,
  metas: [{ id: 'm1', elemento: 'Fósforo', forma: 'P₂O₅', kgHa: 100, fuente: 'Fuente EJEMPLO', fechaFuente: '2026-10-01', esEjemplo: true }],
  lineas: [{ id: 'x1', metaId: 'm1', producto: copiarProducto(DAP) }],
  estado: 'aprobado',
  historial: [{ estado: 'propuesta', fecha: '2026-11-01T10:00:00.000Z' }, { estado: 'revisado', fecha: '2026-11-01T11:00:00.000Z' }, { estado: 'aprobado', fecha: '2026-11-01T12:00:00.000Z' }],
  createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T12:00:00.000Z', ...cambios
});

test('opción 1: la nube aplica las mismas reglas de la app (datos dañados, plan aprobado incompleto, identificador)', () => {
  const hoy = new Date(AHORA);
  assert.equal(problemaParaNube('lotes', 'l1', lote('l1'), hoy), null);
  assert.match(problemaParaNube('lotes', 'l1', lote('l1', { areaM2: -5 }), hoy) ?? '', /área/);
  assert.equal(problemaParaNube('analisisSuelos', 'a1', analisis('a1'), hoy), null);
  assert.match(problemaParaNube('analisisSuelos', 'a1', analisis('a1', { densidadGcm3: Number.NaN }), hoy) ?? '', /Densidad/);
  assert.equal(problemaParaNube('planes', 'p1', planAprobado(), hoy), null);
  assert.match(problemaParaNube('planes', 'p1', planAprobado({ lineas: [] }), hoy) ?? '', /no tiene producto/);
  assert.match(problemaParaNube('planes', 'p1', planAprobado({ historial: [{ estado: 'propuesta', fecha: '2026-11-01T10:00:00.000Z' }] }), hoy) ?? '', /historial/i);
  assert.match(problemaParaNube('lotes', 'otro', lote('l1'), hoy) ?? '', /identificador/);
  assert.equal(problemaParaNube('registros', 'o1', observacion('o1'), hoy), null);
  assert.match(problemaParaNube('ciclos', 'c1', { id: 'c1' }, hoy) ?? '', /.+/);
});

// ---- Nube y teléfonos en memoria ----

/** Nube con las reglas del SQL del Worker: validación, reloj acotado, plan aprobado inmutable, cuota, épocas y páginas por tamaño. */
function crearNube({ cuotaBytes = Infinity } = {}) {
  let filas = new Map<string, CambioNube>();
  let version = 0;
  let epoca = 'e1';
  let solicitudes = 0;
  let antesDeResponder: (() => void) | undefined;
  const api = async (s: SolicitudSincronizar): Promise<RespuestaSincronizar> => {
    solicitudes++;
    const validada = validarSolicitudSincronizar(structuredClone(s));
    if (!validada.ok) throw new Error(validada.error);
    const hoy = new Date(AHORA);
    const tope = new Date(AHORA + 5 * 60_000).toISOString();
    const rechazados: CambioNube[] = [];
    const invalidos: RespuestaSincronizar['invalidos'] = [];
    const bytes = [...filas.values()].reduce((t, f) => t + (f.datos?.length ?? 0), 0);
    const cuotaExcedida = bytes >= cuotaBytes;
    for (const c of validada.solicitud.cambios) {
      if (c.datos !== null) {
        const problema = problemaParaNube(c.tabla, c.id, decodificarRegistro(c.datos), hoy);
        if (problema) { invalidos.push({ tabla: c.tabla, id: c.id, motivo: problema }); continue; }
        if (cuotaExcedida) continue;
      }
      const actualizado = c.actualizado > tope ? tope : c.actualizado;
      const clave = claveDe(c.tabla, c.id);
      const previa = filas.get(clave);
      const aprobadoInmutable = previa && c.tabla === 'planes' && previa.datos !== null && c.datos !== null
        && JSON.parse(previa.datos).estado === 'aprobado' && c.datos !== previa.datos;
      if (previa && (actualizado < previa.actualizado || aprobadoInmutable)) { rechazados.push(previa); continue; }
      filas.set(clave, { ...c, actualizado, version: ++version });
    }
    antesDeResponder?.();
    const posteriores = [...filas.values()].filter(f => f.version > s.desde).sort((a, b) => a.version - b.version).slice(0, MAX_BAJADA + 1);
    const lote: CambioNube[] = [];
    let acumulado = 0;
    for (const f of posteriores.slice(0, MAX_BAJADA)) {
      const n = f.datos?.length ?? 0;
      if (lote.length && acumulado + n > MAX_BYTES_BAJADA) break;
      acumulado += n;
      lote.push(f);
    }
    return {
      epoca, rechazados: structuredClone(rechazados), invalidos, cuotaExcedida,
      cambios: structuredClone(lote), hasta: lote.at(-1)?.version ?? s.desde, hayMas: lote.length < posteriores.length
    };
  };
  return {
    api, filas: () => filas, solicitudes: () => solicitudes,
    /** Simula "Borrar mis datos de la nube" y crear la cuenta de nuevo. */
    recrearCuenta() { filas = new Map(); version = 0; epoca = `${epoca}+`; },
    alResponder(fn: (() => void) | undefined) { antesDeResponder = fn; }
  };
}

type Api = (s: SolicitudSincronizar) => Promise<RespuestaSincronizar>;

function crearTelefono() {
  const tablas = Object.fromEntries(TABLAS_NUBE.map(t => [t, new Map<string, unknown>()])) as Record<string, Map<string, unknown>>;
  const instantanea = new Map<string, string>();
  const eliminados = new Map<string, string>();
  const apartadas: VersionApartada[] = [];
  const avance = { cursor: 0, epoca: '' };
  let lecturas = 0;
  const almacen: AlmacenSincronizacion = {
    transaccion: fn => fn(),
    leerTodo: async () => { lecturas++; return Object.fromEntries(TABLAS_NUBE.map(t => [t, [...tablas[t].values()].map(r => structuredClone(r))])) as TablasNube; },
    obtener: async (t, id) => structuredClone(tablas[t].get(id)),
    poner: async (t, r) => { tablas[t].set((r as { id: string }).id, structuredClone(r)); },
    borrar: async (t, id) => { tablas[t].delete(id); },
    leerInstantanea: async () => new Map(instantanea),
    obtenerInstantanea: async clave => instantanea.get(clave),
    ponerInstantanea: async (clave, texto) => { if (texto === null) instantanea.delete(clave); else instantanea.set(clave, texto); },
    vaciarInstantanea: async () => { instantanea.clear(); },
    fechaEliminacion: clave => eliminados.get(clave),
    olvidarEliminacion: clave => { eliminados.delete(clave); },
    apartar: async v => { apartadas.push(v); },
    guardarAvance: async (cursor, epoca) => { avance.cursor = cursor; avance.epoca = epoca; }
  };
  return {
    tablas, instantanea, apartadas, avance, almacen, lecturas: () => lecturas,
    /** Eliminar como lo hace la app: el gancho de Dexie registra la hora real. */
    eliminar(tabla: string, id: string, fecha: string) { tablas[tabla].delete(id); eliminados.set(`${tabla}/${id}`, fecha); },
    async sincronizarCon(api: Api, ahora = new Date(AHORA)) {
      return sincronizar(almacen, api, { ...avance }, { ahora: () => ahora });
    }
  };
}

const nombreDe = (r: unknown) => (r as { nombre: string }).nombre;

test('sincronizar: lo creado en un teléfono llega al otro; editar y eliminar también; sin cambios es una sola solicitud', async () => {
  const nube = crearNube();
  const a = crearTelefono();
  const b = crearTelefono();
  a.tablas.lotes.set('l1', lote('l1'));
  a.tablas.analisisSuelos.set('a1', analisis('a1'));
  assert.equal((await a.sincronizarCon(nube.api)).subidos, 2);

  await b.sincronizarCon(nube.api);
  assert.deepEqual(b.tablas.lotes.get('l1'), lote('l1'));

  b.tablas.lotes.set('l1', lote('l1', { nombre: 'Editado en B', updatedAt: '2026-11-03T10:00:00.000Z' }));
  await b.sincronizarCon(nube.api);
  await a.sincronizarCon(nube.api);
  assert.equal(nombreDe(a.tablas.lotes.get('l1')), 'Editado en B');

  a.eliminar('analisisSuelos', 'a1', '2026-11-04T10:00:00.000Z');
  await a.sincronizarCon(nube.api);
  await b.sincronizarCon(nube.api);
  assert.equal(b.tablas.analisisSuelos.has('a1'), false);
  assert.equal(nube.filas().get('analisisSuelos/a1')?.datos, null);

  const antes = nube.solicitudes();
  const r = await a.sincronizarCon(nube.api);
  assert.equal(nube.solicitudes() - antes, 1);
  assert.equal(r.subidos, 0);
});

test('opción 1: un registro dañado no se sube, queda en el teléfono y se informa', async () => {
  const nube = crearNube();
  const a = crearTelefono();
  a.tablas.lotes.set('l1', lote('l1'));
  a.tablas.analisisSuelos.set('a1', analisis('a1', { densidadGcm3: Number.NaN }));
  const r = await a.sincronizarCon(nube.api);
  assert.equal(r.subidos, 1);
  assert.deepEqual(r.noSubidos.map(n => n.id), ['a1']);
  assert.ok(a.tablas.analisisSuelos.has('a1'));
  assert.equal(nube.filas().has('analisisSuelos/a1'), false);
});

test('opción 1: un plan aprobado en la nube no se puede modificar; el teléfono adopta el de la nube y aparta su versión', async () => {
  const nube = crearNube();
  const a = crearTelefono();
  a.tablas.lotes.set('l1', lote('l1'));
  a.tablas.planes.set('p1', planAprobado());
  await a.sincronizarCon(nube.api);
  // Alguien cambia la meta de un plan aprobado (con la app manipulada).
  const manipulado = planAprobado({ nombre: 'Manipulado', updatedAt: '2026-11-10T10:00:00.000Z' });
  a.tablas.planes.set('p1', manipulado);
  const r = await a.sincronizarCon(nube.api);
  assert.equal(r.subidos, 0);
  assert.equal(nombreDe(a.tablas.planes.get('p1')), 'Plan EJEMPLO', 'vuelve el plan aprobado de la nube');
  assert.equal(a.apartadas.length, 1, 'la versión rechazada queda apartada, no se pierde');
  // Eliminarlo (junto con su lote) sí se permite.
  a.eliminar('planes', 'p1', '2026-11-11T10:00:00.000Z');
  await a.sincronizarCon(nube.api);
  assert.equal(nube.filas().get('planes/p1')?.datos, null);
});

test('revisión sync 1 (crítica): una edición hecha mientras la solicitud está en vuelo no se pierde', async () => {
  const nube = crearNube();
  const a = crearTelefono();
  const b = crearTelefono();
  a.tablas.lotes.set('l1', lote('l1'));
  await a.sincronizarCon(nube.api);
  await b.sincronizarCon(nube.api);
  b.tablas.lotes.set('l1', lote('l1', { nombre: 'B 10h', updatedAt: '2026-11-05T10:00:00.000Z' }));
  await b.sincronizarCon(nube.api);
  a.tablas.lotes.set('l1', lote('l1', { nombre: 'A 9h', updatedAt: '2026-11-05T09:00:00.000Z' }));
  // Mientras la solicitud de A viaja, el usuario de A vuelve a editar.
  nube.alResponder(() => a.tablas.lotes.set('l1', lote('l1', { nombre: 'A 12h', updatedAt: '2026-11-05T12:00:00.000Z' })));
  await a.sincronizarCon(nube.api);
  nube.alResponder(undefined);
  assert.equal(nombreDe(a.tablas.lotes.get('l1')), 'A 12h', 'la edición de las 12 h sigue en el teléfono');
  await a.sincronizarCon(nube.api);
  assert.equal(JSON.parse(nube.filas().get('lotes/l1')!.datos!).nombre, 'A 12h', 'y se sube en la siguiente sincronización');
});

test('revisión sync 2 y backend 1 (críticas): si la cuenta se borra y se vuelve a crear, el teléfono sube todo y recibe lo nuevo', async () => {
  const nube = crearNube();
  const b = crearTelefono();
  b.tablas.lotes.set('l1', lote('l1'));
  b.tablas.lotes.set('l2', lote('l2'));
  await b.sincronizarCon(nube.api);
  assert.equal(b.avance.epoca, 'e1');
  nube.recrearCuenta();
  const c = crearTelefono();
  c.tablas.lotes.set('x0', lote('x0'));
  await c.sincronizarCon(nube.api);
  const r = await b.sincronizarCon(nube.api);
  assert.equal(r.reiniciada, true);
  assert.ok(nube.filas().has('lotes/l1') && nube.filas().has('lotes/l2'), 'B volvió a subir lo suyo');
  assert.ok(b.tablas.lotes.has('x0'), 'B recibe lo que subió C en la cuenta nueva');
});

test('revisión sync 3: una eliminación hecha sin conexión usa su hora real y no pisa una edición posterior', async () => {
  const nube = crearNube();
  const a = crearTelefono();
  const b = crearTelefono();
  a.tablas.lotes.set('l1', lote('l1'));
  await a.sincronizarCon(nube.api);
  await b.sincronizarCon(nube.api);
  a.eliminar('lotes', 'l1', '2026-11-09T10:00:00.000Z'); // lunes, sin conexión
  b.tablas.lotes.set('l1', lote('l1', { nombre: 'Martes', updatedAt: '2026-11-10T10:00:00.000Z' }));
  await b.sincronizarCon(nube.api);
  await a.sincronizarCon(nube.api, new Date('2026-11-11T10:00:00.000Z')); // miércoles
  assert.equal(JSON.parse(nube.filas().get('lotes/l1')!.datos!).nombre, 'Martes', 'la edición del martes se conserva');
  assert.equal(nombreDe(a.tablas.lotes.get('l1')), 'Martes', 'y vuelve al teléfono que lo había eliminado antes');
});

test('revisión sync 4: restaurar desde la copia un registro eliminado lo vuelve a subir', async () => {
  const nube = crearNube();
  const a = crearTelefono();
  a.tablas.lotes.set('l1', lote('l1'));
  await a.sincronizarCon(nube.api);
  a.eliminar('lotes', 'l1', '2026-11-12T10:00:00.000Z');
  await a.sincronizarCon(nube.api);
  a.tablas.lotes.set('l1', lote('l1')); // restaurado con su updatedAt antiguo
  await a.sincronizarCon(nube.api);
  assert.ok(a.tablas.lotes.has('l1'), 'no se vuelve a borrar');
  assert.notEqual(nube.filas().get('lotes/l1')?.datos, null, 'quedó en la nube');
});

test('revisión sync 5: en un conflicto, la versión que pierde se aparta y se puede recuperar', async () => {
  const nube = crearNube();
  const a = crearTelefono();
  const b = crearTelefono();
  a.tablas.lotes.set('l1', lote('l1'));
  await a.sincronizarCon(nube.api);
  await b.sincronizarCon(nube.api);
  a.tablas.lotes.set('l1', lote('l1', { nombre: 'A (antes)', updatedAt: '2026-11-05T09:00:00.000Z' }));
  b.tablas.lotes.set('l1', lote('l1', { nombre: 'B (después)', updatedAt: '2026-11-05T11:00:00.000Z' }));
  await b.sincronizarCon(nube.api);
  const r = await a.sincronizarCon(nube.api);
  assert.equal(nombreDe(a.tablas.lotes.get('l1')), 'B (después)');
  assert.equal(r.apartados, 1);
  assert.equal(nombreDe(decodificarRegistro(a.apartadas[0].texto)), 'A (antes)');
});

test('revisión backend 7 y sync 5: un reloj adelantado no gana a todas las ediciones futuras', async () => {
  const nube = crearNube();
  const a = crearTelefono();
  const b = crearTelefono();
  a.tablas.lotes.set('l1', lote('l1', { nombre: 'Reloj en 2030', updatedAt: '2030-01-01T00:00:00.000Z' }));
  await a.sincronizarCon(nube.api);
  assert.equal(nube.filas().get('lotes/l1')?.actualizado, new Date(AHORA + 5 * 60_000).toISOString(), 'recortado a la hora del servidor');
  await b.sincronizarCon(nube.api);
  b.tablas.lotes.set('l1', lote('l1', { nombre: 'Edición real', updatedAt: new Date(AHORA + 10 * 60_000).toISOString() }));
  await b.sincronizarCon(nube.api, new Date(AHORA + 10 * 60_000));
  assert.equal(JSON.parse(nube.filas().get('lotes/l1')!.datos!).nombre, 'Edición real');
});

test('revisión sync 6: los registros cuyo lote se eliminó en otro teléfono se cuentan para mostrarlos', async () => {
  const local = Object.fromEntries(TABLAS_NUBE.map(t => [t, []])) as unknown as TablasNube;
  local.lotes = [lote('l1')];
  local.analisisSuelos = [analisis('a1'), analisis('a2', { loteId: 'borrado' })];
  local.registros = [observacion('o1', 'borrado')];
  assert.equal(contarSinLote(local), 2);
});

test('revisión sync 7 y backend 5: un rechazo que no se puede aplicar no provoca 200 solicitudes ni bloquea la cola', async () => {
  const nube = crearNube();
  const a = crearTelefono();
  for (let i = 0; i < 30; i++) a.tablas.lotes.set(`l${i}`, lote(`l${i}`, { updatedAt: '2026-11-01T10:00:00.000Z' }));
  a.tablas.lotes.set('nuevo', lote('nuevo'));
  // En la nube, 30 lotes más recientes que no se pueden aplicar en el teléfono (por ejemplo, de otra versión de la app).
  for (let i = 0; i < 30; i++) {
    nube.filas().set(`lotes/l${i}`, { tabla: 'lotes', id: `l${i}`, datos: codificarRegistro({ id: `l${i}`, nombre: '' }), actualizado: '2026-11-09T10:00:00.000Z', version: 1000 + i });
  }
  const antes = nube.solicitudes();
  const r = await a.sincronizarCon(nube.api);
  assert.ok(nube.solicitudes() - antes <= 5, `pocas solicitudes (${nube.solicitudes() - antes})`);
  assert.ok(nube.filas().has('lotes/nuevo'), 'el resto de la cola se sube');
  assert.equal(r.pendientes, 0);
  assert.equal(a.tablas.lotes.size, 31, 'los lotes del teléfono no se borran');
  assert.ok(r.apartados >= 30, 'las versiones de la nube que no se pudieron aplicar quedan apartadas');
});

test('revisión sync 9: los pendientes se calculan una sola vez por sincronización, aunque sean muchos', async () => {
  const nube = crearNube();
  const a = crearTelefono();
  a.tablas.lotes.set('l1', lote('l1'));
  for (let i = 0; i < 600; i++) a.tablas.registros.set(`r${i}`, observacion(`r${i}`));
  const r = await a.sincronizarCon(nube.api);
  assert.equal(r.subidos, 601);
  assert.equal(r.pendientes, 0);
  assert.equal(a.lecturas(), 1, 'una sola lectura completa del teléfono');

  const b = crearTelefono();
  await b.sincronizarCon(nube.api);
  assert.equal(b.tablas.registros.size, 600, 'baja todo en páginas');
});

test('revisión backend 3: las páginas que baja la nube están acotadas por tamaño', async () => {
  const nube = crearNube();
  const a = crearTelefono();
  a.tablas.lotes.set('l1', lote('l1'));
  for (let i = 0; i < 60; i++) a.tablas.registros.set(`r${i}`, { ...observacion(`r${i}`), descripcion: 'x'.repeat(480) });
  for (let i = 0; i < 60; i++) {
    const r = a.tablas.registros.get(`r${i}`) as Record<string, unknown>;
    r.descripcion = `${'Observación larga EJEMPLO '.repeat(18)}`.slice(0, 480);
  }
  await a.sincronizarCon(nube.api);
  const respuesta = await nube.api({ desde: 0, cambios: [] });
  const tamano = respuesta.cambios.reduce((t, c) => t + (c.datos?.length ?? 0), 0);
  assert.ok(tamano <= MAX_BYTES_BAJADA);
});

test('cuota: al llegar al límite de la cuenta, los cambios nuevos se quedan en el teléfono y se informa; eliminar sí se permite', async () => {
  const nube = crearNube({ cuotaBytes: 200 });
  const a = crearTelefono();
  a.tablas.lotes.set('l1', lote('l1'));
  a.tablas.lotes.set('l2', lote('l2'));
  await a.sincronizarCon(nube.api);
  a.tablas.lotes.set('l3', lote('l3'));
  const r = await a.sincronizarCon(nube.api);
  assert.equal(r.cuotaExcedida, true);
  assert.equal(nube.filas().has('lotes/l3'), false);
  assert.equal(r.pendientes, 1);
  a.eliminar('lotes', 'l1', '2026-11-17T10:00:00.000Z');
  await a.sincronizarCon(nube.api);
  assert.equal(nube.filas().get('lotes/l1')?.datos, null);
});

test('pendientes: nuevos, modificados y eliminados; codificar conserva NaN y fechas', () => {
  const local = Object.fromEntries(TABLAS_NUBE.map(t => [t, []])) as unknown as TablasNube;
  local.lotes = [lote('nuevo'), lote('igual')];
  const instantanea = new Map([['lotes/igual', codificarRegistro(lote('igual'))], ['lotes/borrado', '{}']]);
  const { cambios } = calcularPendientes(local, instantanea, { ahora: new Date(AHORA), fechaEliminacion: () => '2026-11-10T10:00:00.000Z' });
  assert.deepEqual(cambios.map(p => [p.id, p.datos === null, p.nuevo]), [['nuevo', false, true], ['borrado', true, false]]);
  assert.equal(cambios[1].actualizado, '2026-11-10T10:00:00.000Z');

  const raro = { id: 'x', a: Number.NaN, b: -Infinity, c: new Date(AHORA) };
  const vuelta = decodificarRegistro(codificarRegistro(raro)) as typeof raro;
  assert.ok(Number.isNaN(vuelta.a));
  assert.equal(vuelta.b, -Infinity);
  assert.equal(vuelta.c.getTime(), AHORA);
});
