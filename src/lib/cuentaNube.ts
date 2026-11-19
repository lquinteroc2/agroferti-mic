/**
 * Sesión en la nube y sincronización automática. La app funciona igual sin sesión: todo se guarda
 * primero en el teléfono, y la nube se actualiza cuando hay internet.
 */
import { almacenSincronizacion, borrarDatosDelTelefono, db, desvincularNube, guardarEstadoNube, guardarReferencias, leerEstadoNube, leerReferencias, registrarEliminacion } from './db';
import { leerConjunto } from './referencias';
import { apiNube, ErrorNube, sesionVencida, type EstadoNube } from './nube';
import { TABLAS_NUBE } from './protocoloNube';
import { sincronizar, type ResultadoSincronizacion } from './sincronizacion';

export type FaseSincronizacion =
  | { fase: 'inactiva' }
  | { fase: 'sincronizando' }
  | { fase: 'lista'; resultado: ResultadoSincronizacion; fecha: string }
  | { fase: 'error'; error: ErrorNube; fecha: string };

interface EstadoExterno {
  fase: FaseSincronizacion;
  /** Hubo cambios en el teléfono después de la última sincronización. */
  cambiosLocales: boolean;
}

let estado: EstadoExterno = { fase: { fase: 'inactiva' }, cambiosLocales: false };
const oyentes = new Set<() => void>();

function actualizar(cambios: Partial<EstadoExterno>) {
  estado = { ...estado, ...cambios };
  oyentes.forEach(f => f());
}

/** Para `useSyncExternalStore`. */
export const sincronizacionExterna = {
  suscribir: (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; },
  leer: () => estado
};

const conSesion = (e: EstadoNube | undefined): e is EstadoNube => !!e?.token && !sesionVencida(e);

/** Cambios hechos por la propia sincronización: no deben programar otra ni registrarse como eliminaciones del usuario. */
let aplicando = false;

const almacenPropio: typeof almacenSincronizacion = {
  ...almacenSincronizacion,
  transaccion: async fn => {
    aplicando = true;
    try {
      return await almacenSincronizacion.transaccion(fn);
    } finally {
      aplicando = false;
    }
  }
};

/**
 * Una sola sincronización a la vez, también entre pestañas (Web Locks). Sin soporte de Web Locks,
 * solo dentro de la pestaña.
 */
let cola: Promise<unknown> = Promise.resolve();
function exclusivo<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  const ejecutar = (): Promise<T> => (locks ? locks.request('agroferti-sincronizacion', fn) as Promise<T> : fn());
  const resultado = cola.then(ejecutar, ejecutar);
  cola = resultado.catch(() => undefined);
  return resultado;
}

let enCurso: Promise<void> | null = null;

/** Sincroniza ahora (si hay sesión). Si ya hay una en curso en esta pestaña, espera a esa. */
export function sincronizarAhora(): Promise<void> {
  enCurso ??= exclusivo(async () => {
    const inicio = await leerEstadoNube();
    if (!conSesion(inicio)) return;
    actualizar({ fase: { fase: 'sincronizando' }, cambiosLocales: false });
    try {
      const resultado = await sincronizar(almacenPropio, solicitud => apiNube.sincronizar(inicio.token, solicitud),
        { cursor: inicio.cursor, epoca: inicio.epoca ?? '' });
      const fecha = new Date().toISOString();
      const actual = await leerEstadoNube();
      if (actual?.vinculado === inicio.vinculado) await guardarEstadoNube({ ...actual, ultimaSincronizacion: fecha });
      actualizar({ fase: { fase: 'lista', resultado, fecha } });
      // Las referencias no impiden la sincronización: si fallan, se reintenta en la próxima.
      await actualizarReferencias(inicio.token).catch(() => undefined);
    } catch (e) {
      const error = e instanceof ErrorNube ? e : new ErrorNube('error-interno', 'No se pudo sincronizar. Tus datos siguen guardados en este teléfono.');
      // Sesión vencida o cuenta borrada: hay que volver a iniciar sesión (los datos del teléfono no cambian).
      if (error.codigo === 'no-autorizado') {
        const actual = await leerEstadoNube();
        if (actual) await guardarEstadoNube({ ...actual, token: '' });
      }
      actualizar({ fase: { fase: 'error', error, fecha: new Date().toISOString() } });
    }
  }).finally(() => { enCurso = null; });
  return enCurso;
}

/** Cada cuánto se pregunta a la nube si hay referencias nuevas (cambian poco). */
const VIGENCIA_REFERENCIAS_MS = 12 * 60 * 60 * 1000;

/** Descarga las referencias técnicas si no hay copia o si la copia tiene más de 12 horas y cambiaron. */
async function actualizarReferencias(token: string, ahora: Date = new Date()): Promise<void> {
  const guardadas = await leerReferencias();
  if (guardadas && ahora.getTime() - Date.parse(guardadas.consultado) < VIGENCIA_REFERENCIAS_MS) return;
  const respuesta = await apiNube.referencias(token, guardadas?.conjunto.version ?? '');
  const consultado = ahora.toISOString();
  if (guardadas && (respuesta as { sinCambios?: boolean })?.sinCambios) {
    await guardarReferencias({ ...guardadas, consultado });
    return;
  }
  const conjunto = leerConjunto(respuesta);
  if (conjunto) await guardarReferencias({ conjunto, consultado });
}

/** El teléfono ya tiene datos de otra cuenta de la nube. */
export class OtraCuenta extends Error {
  constructor(readonly emailVinculado: string) {
    super(`Este teléfono está vinculado a otra cuenta (${emailVinculado}). Para usar esta cuenta, primero borra los datos de este teléfono.`);
  }
}

/** Inicia sesión con la credencial de Google y sincroniza. */
export async function iniciarSesion(credencial: string, consentimiento: boolean): Promise<void> {
  const previo = await leerEstadoNube();
  let sesion;
  try {
    // La nube no crea ni modifica nada si el teléfono está vinculado a otra cuenta.
    sesion = await apiNube.iniciarSesion(credencial, consentimiento, previo?.vinculado);
  } catch (e) {
    if (e instanceof ErrorNube && e.codigo === 'otra-cuenta' && previo) throw new OtraCuenta(previo.usuario.email);
    throw e;
  }
  await guardarEstadoNube({
    token: sesion.token,
    vence: sesion.vence,
    usuario: sesion.usuario,
    vinculado: sesion.usuario.sub,
    cursor: previo?.cursor ?? 0,
    // Se conserva la época anterior: si la cuenta se borró y se volvió a crear, la sincronización lo
    // detecta y vuelve a subir todo. Un teléfono que nunca sincronizó empieza con la época actual.
    epoca: previo ? previo.epoca ?? '' : sesion.epoca,
    ultimaSincronizacion: previo?.ultimaSincronizacion
  });
  await sincronizarAhora();
}

/** Cierra la sesión en este teléfono. Los datos siguen en el teléfono y en la nube. */
export async function cerrarSesion(): Promise<void> {
  await exclusivo(async () => {
    const actual = await leerEstadoNube();
    if (actual) await guardarEstadoNube({ ...actual, token: '' });
  });
  actualizar({ fase: { fase: 'inactiva' } });
}

/** Borra los datos de la cuenta en la nube (Ley 1581: supresión). El teléfono conserva los suyos. */
export async function borrarCuentaNube(): Promise<void> {
  await exclusivo(async () => {
    const actual = await leerEstadoNube();
    if (!conSesion(actual)) throw new ErrorNube('no-autorizado', 'Inicia sesión para borrar tus datos de la nube.');
    await apiNube.borrarCuenta(actual.token);
    await desvincularNube();
  });
  actualizar({ fase: { fase: 'inactiva' } });
}

/** Para usar el teléfono con otra cuenta: borra sus datos y la vinculación. */
export async function borrarTelefonoYDesvincular(): Promise<void> {
  await exclusivo(async () => {
    aplicando = true;
    try {
      await borrarDatosDelTelefono();
    } finally {
      aplicando = false;
    }
  });
  actualizar({ fase: { fase: 'inactiva' }, cambiosLocales: false });
}

const ESPERA_CAMBIOS_MS = 15_000;
const INTERVALO_MS = 5 * 60_000;
let iniciada = false;

/**
 * Sincroniza al abrir la app, al recuperar internet, cada 5 minutos con la app visible y 15 segundos
 * después del último cambio. Registra la hora real de cada eliminación del usuario.
 */
export function iniciarSincronizacionAutomatica(): void {
  if (iniciada) return;
  iniciada = true;
  let espera: ReturnType<typeof setTimeout> | undefined;
  const programar = () => {
    if (aplicando) return;
    if (!estado.cambiosLocales) actualizar({ cambiosLocales: true });
    clearTimeout(espera);
    espera = setTimeout(() => void sincronizarAhora(), ESPERA_CAMBIOS_MS);
  };
  for (const tabla of TABLAS_NUBE) {
    const t = db.table(tabla);
    t.hook('creating', () => { programar(); });
    t.hook('updating', () => { programar(); });
    t.hook('deleting', clave => {
      if (aplicando) return;
      if (typeof clave === 'string') registrarEliminacion(`${tabla}/${clave}`);
      programar();
    });
  }
  window.addEventListener('online', () => void sincronizarAhora());
  setInterval(() => { if (document.visibilityState === 'visible') void sincronizarAhora(); }, INTERVALO_MS);
  void sincronizarAhora();
}
