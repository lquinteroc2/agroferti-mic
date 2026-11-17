/**
 * Nube: verificación del token de Google, sesión firmada, protocolo y sincronización entre dos
 * teléfonos simulados contra una nube en memoria con las mismas reglas del SQL del Worker.
 * Todos los datos son de EJEMPLO.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ErrorToken, verificarTokenGoogle, type ClavePublica } from '../worker/google.ts';
import { crearSesion, DURACION_SESION_MS, verificarSesion } from '../worker/sesion.ts';
import { MAX_BAJADA, MAX_SUBIDA, TABLAS_NUBE, validarSolicitudSincronizar, type CambioNube, type RespuestaSincronizar, type SolicitudSincronizar } from '../src/lib/protocoloNube.ts';
import { codificarRegistro, decodificarRegistro } from '../src/lib/respaldo.ts';
import { calcularPendientes, claveDe, sincronizar, type AlmacenSincronizacion, type TablasNube } from '../src/lib/sincronizacion.ts';

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

const AHORA = Date.UTC(2026, 10, 17, 15);
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

  // Firma alterada: cambiar la carga invalida la firma.
  const [c, , f] = (await firmar(cargaValida())).split('.');
  await rechaza(`${c}.${b64url(JSON.stringify(cargaValida({ sub: 'otro' })))}.${f}`, /firma del token no es válida/);
});

test('Google: si la clave no está en caché, se vuelven a descargar las claves una vez', async () => {
  const { publica, firmar } = await clavesDePrueba();
  const llamadas: boolean[] = [];
  const claves = async (forzar: boolean) => { llamadas.push(forzar); return forzar ? [publica] : []; };
  await verificarTokenGoogle(await firmar(cargaValida()), CLIENT_ID, claves, AHORA);
  assert.deepEqual(llamadas, [false, true]);
});

// ---- Sesión propia ----

const SECRETO = 'secreto-de-prueba-EJEMPLO-con-mas-de-32-caracteres';

test('sesión: firmada, con vencimiento a 30 días; se rechaza alterada, vencida o con otro secreto', async () => {
  const { token, vence } = await crearSesion('sub-1', SECRETO, AHORA);
  assert.equal(vence, AHORA + DURACION_SESION_MS);
  assert.deepEqual(await verificarSesion(token, SECRETO, AHORA + 1000), { sub: 'sub-1', vence });
  assert.equal(await verificarSesion(token, SECRETO, vence + 1), null, 'vencida');
  assert.equal(await verificarSesion(token, `${SECRETO}-otro`, AHORA), null, 'otro secreto');
  const [v, , firma] = token.split('.');
  const falsa = `${v}.${b64url(JSON.stringify({ sub: 'sub-2', vence }))}.${firma}`;
  assert.equal(await verificarSesion(falsa, SECRETO, AHORA), null, 'alterada');
  assert.equal(await verificarSesion('basura', SECRETO, AHORA), null);
  await assert.rejects(crearSesion('sub-1', 'corto'), /32 caracteres/);
});

// ---- Protocolo ----

test('protocolo: valida tabla, id, fecha, tamaño, duplicados y máximo de cambios por solicitud', () => {
  const cambio = { tabla: 'lotes', id: 'l1', datos: '{}', actualizado: '2026-11-17T10:00:00.000Z' };
  assert.ok(validarSolicitudSincronizar({ desde: 0, cambios: [cambio, { ...cambio, id: 'l2', datos: null }] }).ok);
  const error = (cuerpo: unknown) => { const r = validarSolicitudSincronizar(cuerpo); return r.ok ? '' : r.error; };
  assert.match(error({ desde: -1, cambios: [] }), /desde/);
  assert.match(error({ desde: 0, cambios: [{ ...cambio, tabla: 'usuarios' }] }), /tabla/);
  assert.match(error({ desde: 0, cambios: [{ ...cambio, id: '' }] }), /identificador/);
  assert.match(error({ desde: 0, cambios: [{ ...cambio, datos: 'x'.repeat(200_001) }] }), /demasiado grandes/);
  assert.match(error({ desde: 0, cambios: [cambio, cambio] }), /dos veces/);
  assert.match(error({ desde: 0, cambios: Array.from({ length: MAX_SUBIDA + 1 }, (_, i) => ({ ...cambio, id: `l${i}` })) }), /máximo/);
  assert.match(error(null), /estructura/);
});

// ---- Sincronización ----

/** Nube en memoria con las reglas del SQL del Worker: gana el `actualizado` mayor o igual; versión por usuario. */
function crearNube() {
  const filas = new Map<string, CambioNube>();
  let version = 0;
  let solicitudes = 0;
  const api = async (s: SolicitudSincronizar): Promise<RespuestaSincronizar> => {
    solicitudes++;
    const validada = validarSolicitudSincronizar(structuredClone(s));
    if (!validada.ok) throw new Error(validada.error);
    const rechazados: CambioNube[] = [];
    for (const c of validada.solicitud.cambios) {
      const clave = claveDe(c.tabla, c.id);
      const previa = filas.get(clave);
      if (previa && c.actualizado < previa.actualizado) { rechazados.push(previa); continue; }
      filas.set(clave, { ...c, version: ++version });
    }
    const posteriores = [...filas.values()].filter(f => f.version > s.desde).sort((a, b) => a.version - b.version);
    const lote = posteriores.slice(0, MAX_BAJADA);
    return { rechazados: structuredClone(rechazados), cambios: structuredClone(lote), hasta: lote.at(-1)?.version ?? s.desde, hayMas: posteriores.length > MAX_BAJADA };
  };
  return { api, filas, solicitudes: () => solicitudes };
}

/** Teléfono en memoria: tablas, instantánea y cursor. */
function crearTelefono() {
  const tablas = Object.fromEntries(TABLAS_NUBE.map(t => [t, new Map<string, unknown>()])) as Record<string, Map<string, unknown>>;
  const instantanea = new Map<string, string>();
  let cursor = 0;
  const almacen: AlmacenSincronizacion = {
    transaccion: fn => fn(),
    leerTodo: async () => Object.fromEntries(TABLAS_NUBE.map(t => [t, [...tablas[t].values()].map(r => structuredClone(r))])) as TablasNube,
    obtener: async (t, id) => structuredClone(tablas[t].get(id)),
    poner: async (t, r) => { tablas[t].set((r as { id: string }).id, structuredClone(r)); },
    borrar: async (t, id) => { tablas[t].delete(id); },
    leerInstantanea: async () => new Map(instantanea),
    obtenerInstantanea: async clave => instantanea.get(clave),
    ponerInstantanea: async (clave, texto) => { if (texto === null) instantanea.delete(clave); else instantanea.set(clave, texto); }
  };
  return {
    tablas, instantanea, almacen,
    async sincronizarCon(api: (s: SolicitudSincronizar) => Promise<RespuestaSincronizar>, ahora = new Date(AHORA)) {
      const r = await sincronizar(almacen, api, cursor, { ahora: () => ahora });
      cursor = r.cursor;
      return r;
    }
  };
}

const lote = (id: string, cambios: Record<string, unknown> = {}) => ({
  id, nombre: `Lote ${id} EJEMPLO`, cultivo: 'papa', areaM2: 500, createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z', ...cambios
});

test('sincronizar: lo creado en un teléfono llega al otro; editar y eliminar también', async () => {
  const nube = crearNube();
  const a = crearTelefono();
  const b = crearTelefono();
  a.tablas.lotes.set('l1', lote('l1'));
  a.tablas.analisisSuelos.set('a1', { id: 'a1', loteId: 'l1', fechaAnalisis: '2026-11-02', profundidadCm: 20, densidadGcm3: Number.NaN, nutrientes: [], updatedAt: '2026-11-02T10:00:00.000Z' });
  const ra = await a.sincronizarCon(nube.api);
  assert.equal(ra.subidos, 2);
  assert.equal(ra.pendientes, 0);

  await b.sincronizarCon(nube.api);
  assert.deepEqual(b.tablas.lotes.get('l1'), lote('l1'));
  assert.ok(Number.isNaN((b.tablas.analisisSuelos.get('a1') as { densidadGcm3: number }).densidadGcm3), 'un dato dañado (NaN) llega igual');

  b.tablas.lotes.set('l1', lote('l1', { nombre: 'Editado en B', updatedAt: '2026-11-03T10:00:00.000Z' }));
  await b.sincronizarCon(nube.api);
  await a.sincronizarCon(nube.api);
  assert.equal((a.tablas.lotes.get('l1') as { nombre: string }).nombre, 'Editado en B');

  a.tablas.analisisSuelos.delete('a1');
  await a.sincronizarCon(nube.api, new Date('2026-11-04T10:00:00.000Z'));
  await b.sincronizarCon(nube.api);
  assert.equal(b.tablas.analisisSuelos.has('a1'), false, 'la eliminación llega al otro teléfono');
  assert.equal(nube.filas.get('analisisSuelos/a1')?.datos, null, 'en la nube queda la marca de borrado');

  // Sin cambios, una sincronización es una sola solicitud y no sube nada.
  const antes = nube.solicitudes();
  const r = await a.sincronizarCon(nube.api);
  assert.equal(nube.solicitudes() - antes, 1);
  assert.equal(r.subidos, 0);
});

test('sincronizar: en un conflicto gana la versión más reciente; el teléfono adopta la de la nube si es más nueva', async () => {
  const nube = crearNube();
  const a = crearTelefono();
  const b = crearTelefono();
  a.tablas.lotes.set('l1', lote('l1'));
  await a.sincronizarCon(nube.api);
  await b.sincronizarCon(nube.api);
  // Los dos editan sin conexión; B lo hizo después.
  a.tablas.lotes.set('l1', lote('l1', { nombre: 'A (antes)', updatedAt: '2026-11-05T09:00:00.000Z' }));
  b.tablas.lotes.set('l1', lote('l1', { nombre: 'B (después)', updatedAt: '2026-11-05T11:00:00.000Z' }));
  await b.sincronizarCon(nube.api);
  const ra = await a.sincronizarCon(nube.api);
  assert.equal(ra.subidos, 0, 'la nube rechazó la versión vieja de A');
  assert.equal((a.tablas.lotes.get('l1') as { nombre: string }).nombre, 'B (después)');
  assert.equal(JSON.parse(nube.filas.get('lotes/l1')!.datos!).nombre, 'B (después)');
});

test('sincronizar: un cambio local sin subir no se pisa con lo que llega; un lote que rompería la lista no se aplica', async () => {
  const nube = crearNube();
  const a = crearTelefono();
  const b = crearTelefono();
  a.tablas.lotes.set('l1', lote('l1'));
  await a.sincronizarCon(nube.api);
  await b.sincronizarCon(nube.api);

  // A edita y sube; B edita después, todavía sin subir, y recibe lo de A en la misma vuelta.
  a.tablas.lotes.set('l1', lote('l1', { nombre: 'A', updatedAt: '2026-11-05T09:00:00.000Z' }));
  await a.sincronizarCon(nube.api);
  b.tablas.lotes.set('l1', lote('l1', { nombre: 'B', updatedAt: '2026-11-05T10:00:00.000Z' }));
  await b.sincronizarCon(nube.api);
  assert.equal((b.tablas.lotes.get('l1') as { nombre: string }).nombre, 'B');
  await a.sincronizarCon(nube.api);
  assert.equal((a.tablas.lotes.get('l1') as { nombre: string }).nombre, 'B');

  // Un lote dañado que llega de la nube (p. ej. de otra versión de la app) no rompe la lista.
  nube.filas.set('lotes/roto', { tabla: 'lotes', id: 'roto', datos: codificarRegistro({ id: 'roto', nombre: '' }), actualizado: '', version: 999 });
  const r = await b.sincronizarCon(nube.api);
  assert.equal(r.omitidos, 1);
  assert.equal(b.tablas.lotes.has('roto'), false);
});

test('sincronizar: muchos registros se suben en lotes pequeños y se bajan por páginas', async () => {
  const nube = crearNube();
  const a = crearTelefono();
  for (let i = 0; i < 260; i++) a.tablas.registros.set(`r${i}`, { id: `r${i}`, loteId: 'l1', tipo: 'observacion', fecha: '2026-11-01', descripcion: 'EJEMPLO', esEjemplo: true, updatedAt: '2026-11-01T10:00:00.000Z' });
  const ra = await a.sincronizarCon(nube.api);
  assert.equal(ra.subidos, 260);
  assert.equal(ra.pendientes, 0);
  assert.ok(nube.solicitudes() >= Math.ceil(260 / MAX_SUBIDA));

  const b = crearTelefono();
  const rb = await b.sincronizarCon(nube.api);
  assert.equal(b.tablas.registros.size, 260);
  assert.equal(rb.cursor, 260);
});

test('pendientes: nuevos, modificados y eliminados respecto de la última sincronización; codificar conserva NaN y fechas', () => {
  const local = Object.fromEntries(TABLAS_NUBE.map(t => [t, []])) as unknown as TablasNube;
  local.lotes = [lote('nuevo'), lote('igual')];
  const instantanea = new Map([['lotes/igual', codificarRegistro(lote('igual'))], ['lotes/borrado', '{}']]);
  const pendientes = calcularPendientes(local, instantanea, new Date(AHORA));
  assert.deepEqual(pendientes.map(p => [p.id, p.datos === null]), [['nuevo', false], ['borrado', true]]);
  assert.equal(pendientes[1].actualizado, new Date(AHORA).toISOString());

  const raro = { id: 'x', a: Number.NaN, b: -Infinity, c: new Date(AHORA) };
  const vuelta = decodificarRegistro(codificarRegistro(raro)) as typeof raro;
  assert.ok(Number.isNaN(vuelta.a));
  assert.equal(vuelta.b, -Infinity);
  assert.equal(vuelta.c.getTime(), AHORA);
});
