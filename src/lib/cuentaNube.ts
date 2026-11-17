/**
 * Sesión en la nube y sincronización automática. La app funciona igual sin sesión: todo se guarda
 * primero en el teléfono, y la nube se actualiza cuando hay internet.
 */
import { almacenSincronizacion, borrarDatosDelTelefono, db, desvincularNube, guardarEstadoNube, leerEstadoNube } from './db';
import { apiNube, ErrorNube, sesionVencida, type EstadoNube } from './nube';
import { TABLAS_NUBE } from './protocoloNube';
import { sincronizar, type ResultadoSincronizacion } from './sincronizacion';

export type FaseSincronizacion =
  | { fase: 'inactiva' }
  | { fase: 'sincronizando' }
  | { fase: 'lista'; resultado: ResultadoSincronizacion; fecha: string }
  | { fase: 'error'; error: ErrorNube; fecha: string };

let fase: FaseSincronizacion = { fase: 'inactiva' };
const oyentes = new Set<() => void>();

function cambiarFase(nueva: FaseSincronizacion) {
  fase = nueva;
  oyentes.forEach(f => f());
}

/** Para `useSyncExternalStore`. */
export const sincronizacionExterna = {
  suscribir: (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; },
  leer: () => fase
};

const conSesion = (e: EstadoNube | undefined): e is EstadoNube => !!e?.token && !sesionVencida(e);

let enCurso: Promise<void> | null = null;
/** Cambios hechos por la propia sincronización: no deben programar otra. */
let aplicando = false;

/** Mientras se aplican los cambios de la nube, los ganchos de Dexie no programan otra sincronización. */
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

/** Sincroniza ahora (si hay sesión). Si ya hay una en curso, espera a esa. */
export function sincronizarAhora(): Promise<void> {
  enCurso ??= (async () => {
    const estado = await leerEstadoNube();
    if (!conSesion(estado)) return;
    cambiarFase({ fase: 'sincronizando' });
    try {
      const resultado = await sincronizar(almacenPropio, solicitud => apiNube.sincronizar(estado.token, solicitud), estado.cursor);
      const actual = await leerEstadoNube();
      const fecha = new Date().toISOString();
      if (actual?.vinculado === estado.vinculado) await guardarEstadoNube({ ...actual, cursor: resultado.cursor, ultimaSincronizacion: fecha });
      cambiarFase({ fase: 'lista', resultado, fecha });
    } catch (e) {
      const error = e instanceof ErrorNube ? e : new ErrorNube('error-interno', 'No se pudo sincronizar. Tus datos siguen guardados en este teléfono.');
      // Sesión vencida o cuenta borrada: hay que volver a iniciar sesión (los datos del teléfono no cambian).
      if (error.codigo === 'no-autorizado') {
        const actual = await leerEstadoNube();
        if (actual) await guardarEstadoNube({ ...actual, token: '' });
      }
      cambiarFase({ fase: 'error', error, fecha: new Date().toISOString() });
    }
  })().finally(() => { enCurso = null; });
  return enCurso;
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
  const sesion = await apiNube.iniciarSesion(credencial, consentimiento);
  if (previo && previo.vinculado !== sesion.usuario.sub) throw new OtraCuenta(previo.usuario.email);
  await guardarEstadoNube({
    token: sesion.token,
    vence: sesion.vence,
    usuario: sesion.usuario,
    vinculado: sesion.usuario.sub,
    cursor: previo?.cursor ?? 0,
    ultimaSincronizacion: previo?.ultimaSincronizacion
  });
  await sincronizarAhora();
}

/** Cierra la sesión. Los datos siguen en el teléfono y en la nube; al volver a entrar con la misma cuenta, se continúa. */
export async function cerrarSesion(): Promise<void> {
  const estado = await leerEstadoNube();
  if (estado) await guardarEstadoNube({ ...estado, token: '' });
  cambiarFase({ fase: 'inactiva' });
}

/** Borra los datos de la cuenta en la nube (Ley 1581: supresión). El teléfono conserva los suyos. */
export async function borrarCuentaNube(): Promise<void> {
  const estado = await leerEstadoNube();
  if (!conSesion(estado)) throw new ErrorNube('no-autorizado', 'Inicia sesión para borrar tus datos de la nube.');
  await apiNube.borrarCuenta(estado.token);
  await desvincularNube();
  cambiarFase({ fase: 'inactiva' });
}

/** Para usar el teléfono con otra cuenta: borra sus datos y la vinculación. */
export async function borrarTelefonoYDesvincular(): Promise<void> {
  await borrarDatosDelTelefono();
  cambiarFase({ fase: 'inactiva' });
}

const ESPERA_CAMBIOS_MS = 15_000;
const INTERVALO_MS = 5 * 60_000;
let iniciada = false;

/**
 * Sincroniza al abrir la app, al recuperar internet, cada 5 minutos con la app visible y 15 segundos
 * después del último cambio. Con pocos productores esto queda muy por debajo del límite gratuito.
 */
export function iniciarSincronizacionAutomatica(): void {
  if (iniciada) return;
  iniciada = true;
  let espera: ReturnType<typeof setTimeout> | undefined;
  const programar = () => {
    if (aplicando) return;
    clearTimeout(espera);
    espera = setTimeout(() => void sincronizarAhora(), ESPERA_CAMBIOS_MS);
  };
  for (const tabla of TABLAS_NUBE) {
    const t = db.table(tabla);
    t.hook('creating', programar);
    t.hook('updating', programar);
    t.hook('deleting', programar);
  }
  window.addEventListener('online', () => void sincronizarAhora());
  setInterval(() => { if (document.visibilityState === 'visible') void sincronizarAhora(); }, INTERVALO_MS);
  void sincronizarAhora();
}
