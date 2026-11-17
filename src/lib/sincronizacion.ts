/**
 * Sincronización entre el teléfono (IndexedDB) y la nube. Reglas puras, probadas en Node con un
 * almacén en memoria; `db.ts` aporta el almacén real.
 *
 * - El teléfono guarda una "instantánea" del texto de cada registro tal como quedó en la última
 *   sincronización. Lo que difiere de la instantánea es un cambio local por subir; lo que está en la
 *   instantánea pero ya no en el teléfono es una eliminación.
 * - En la nube gana la versión más reciente (updatedAt). Si la nube rechaza un cambio por tener una
 *   versión más reciente, el teléfono adopta la de la nube.
 * - Un cambio que llega de la nube no reemplaza un cambio local que aún no se ha subido: ese se sube
 *   en la siguiente vuelta y la nube decide por fecha.
 * - Los datos se guardan tal cual (incluidos los dañados); la app los verifica al leerlos. Solo se
 *   omiten lotes que romperían la lista de lotes, como en la copia de seguridad.
 */
import { MAX_SUBIDA, TABLAS_NUBE, type Cambio, type CambioNube, type RespuestaSincronizar, type SolicitudSincronizar, type TablaNube } from './protocoloNube.ts';
import { codificarRegistro, decodificarRegistro } from './respaldo.ts';
import { esObjeto, problemaLote } from './validacion.ts';

export type TablasNube = Record<TablaNube, unknown[]>;

export interface AlmacenSincronizacion {
  /** Ejecuta `fn` de forma atómica (una transacción en IndexedDB). */
  transaccion<T>(fn: () => Promise<T>): Promise<T>;
  leerTodo(): Promise<TablasNube>;
  obtener(tabla: TablaNube, id: string): Promise<unknown>;
  poner(tabla: TablaNube, registro: unknown): Promise<void>;
  borrar(tabla: TablaNube, id: string): Promise<void>;
  /** Clave "tabla/id" → texto del registro en la última sincronización. */
  leerInstantanea(): Promise<Map<string, string>>;
  obtenerInstantanea(clave: string): Promise<string | undefined>;
  /** `null` quita la clave de la instantánea. */
  ponerInstantanea(clave: string, texto: string | null): Promise<void>;
}

export type ApiSincronizar = (solicitud: SolicitudSincronizar) => Promise<RespuestaSincronizar>;

export interface ResultadoSincronizacion {
  cursor: number;
  subidos: number;
  recibidos: number;
  /** Cambios de la nube que no se aplicaron (lotes que romperían la lista o datos ilegibles). */
  omitidos: number;
  /** Cambios locales que quedaron sin subir (p. ej. se hicieron mientras se sincronizaba). */
  pendientes: number;
}

/** Vueltas máximas por sincronización: evita ciclos infinitos y protege el límite diario gratuito. */
const MAX_VUELTAS = 200;

export const claveDe = (tabla: string, id: string) => `${tabla}/${id}`;

const idDe = (r: unknown): string | undefined => (esObjeto(r) && typeof r.id === 'string' && r.id ? r.id : undefined);
const actualizadoDe = (r: unknown): string => (esObjeto(r) && typeof r.updatedAt === 'string' ? r.updatedAt.slice(0, 40) : '');

/** Cambios locales que no están en la nube: registros nuevos o modificados, y eliminaciones. */
export function calcularPendientes(local: TablasNube, instantanea: ReadonlyMap<string, string>, ahora: Date = new Date()): Cambio[] {
  const cambios: Cambio[] = [];
  const presentes = new Set<string>();
  for (const tabla of TABLAS_NUBE) {
    for (const registro of local[tabla]) {
      const id = idDe(registro);
      if (!id) continue;
      const clave = claveDe(tabla, id);
      presentes.add(clave);
      const texto = codificarRegistro(registro);
      if (instantanea.get(clave) !== texto) cambios.push({ tabla, id, datos: texto, actualizado: actualizadoDe(registro) });
    }
  }
  for (const clave of instantanea.keys()) {
    if (presentes.has(clave)) continue;
    const separador = clave.indexOf('/');
    const tabla = clave.slice(0, separador) as TablaNube;
    if (!(TABLAS_NUBE as ReadonlyArray<string>).includes(tabla)) continue;
    cambios.push({ tabla, id: clave.slice(separador + 1), datos: null, actualizado: ahora.toISOString() });
  }
  return cambios;
}

/**
 * Aplica en el teléfono un cambio de la nube. `forzar`: la nube rechazó el cambio local porque tiene
 * una versión más reciente, así que se adopta la de la nube aunque haya un cambio local.
 * Devuelve false si se omitió.
 */
async function aplicarRemoto(almacen: AlmacenSincronizacion, cambio: CambioNube, forzar: boolean): Promise<boolean> {
  const clave = claveDe(cambio.tabla, cambio.id);
  if (!forzar) {
    const actual = await almacen.obtener(cambio.tabla, cambio.id);
    const textoLocal = actual === undefined ? null : codificarRegistro(actual);
    const sincronizado = (await almacen.obtenerInstantanea(clave)) ?? null;
    // Cambio local sin subir (distinto de lo sincronizado y de lo que llega): se conserva.
    if (textoLocal !== sincronizado && textoLocal !== cambio.datos) return true;
  }
  if (cambio.datos === null) {
    await almacen.borrar(cambio.tabla, cambio.id);
    await almacen.ponerInstantanea(clave, null);
    return true;
  }
  let registro: unknown;
  try {
    registro = decodificarRegistro(cambio.datos);
  } catch {
    return false;
  }
  if (idDe(registro) !== cambio.id) return false;
  if (cambio.tabla === 'lotes' && (!esObjeto(registro) || problemaLote(registro))) return false;
  await almacen.poner(cambio.tabla, registro);
  await almacen.ponerInstantanea(clave, cambio.datos);
  return true;
}

/** Sube los cambios locales y baja los de la nube hasta quedar al día. */
export async function sincronizar(
  almacen: AlmacenSincronizacion,
  api: ApiSincronizar,
  cursorInicial: number,
  { ahora = () => new Date() }: { ahora?: () => Date } = {}
): Promise<ResultadoSincronizacion> {
  let cursor = cursorInicial;
  let subidos = 0, recibidos = 0, omitidos = 0, pendientes = 0;
  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const todos = calcularPendientes(await almacen.leerTodo(), await almacen.leerInstantanea(), ahora());
    const lote = todos.slice(0, MAX_SUBIDA);
    const respuesta = await api({ desde: cursor, cambios: lote });
    const rechazados = new Set(respuesta.rechazados.map(c => claveDe(c.tabla, c.id)));
    await almacen.transaccion(async () => {
      for (const c of lote) {
        if (rechazados.has(claveDe(c.tabla, c.id))) continue;
        // Aceptado: así quedó en la nube. Si el teléfono cambió mientras tanto, se subirá en la próxima vuelta.
        await almacen.ponerInstantanea(claveDe(c.tabla, c.id), c.datos);
        subidos++;
      }
      for (const c of respuesta.rechazados) if (!(await aplicarRemoto(almacen, c, true))) omitidos++;
      for (const c of respuesta.cambios) {
        if (await aplicarRemoto(almacen, c, false)) recibidos++;
        else omitidos++;
      }
    });
    cursor = respuesta.hasta;
    pendientes = todos.length - lote.length;
    if (pendientes === 0 && !respuesta.hayMas) break;
  }
  return { cursor, subidos, recibidos, omitidos, pendientes };
}

/** Cuántos cambios locales faltan por subir (para mostrar el estado). */
export async function contarPendientes(almacen: Pick<AlmacenSincronizacion, 'leerTodo' | 'leerInstantanea'>): Promise<number> {
  return calcularPendientes(await almacen.leerTodo(), await almacen.leerInstantanea()).length;
}
