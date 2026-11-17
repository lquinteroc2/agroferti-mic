/**
 * Sincronización entre el teléfono (IndexedDB) y la nube. Reglas puras, probadas en Node con un
 * almacén en memoria; `db.ts` aporta el almacén real.
 *
 * - El teléfono guarda una "instantánea" del texto de cada registro tal como quedó en la última
 *   sincronización. Lo que difiere de la instantánea es un cambio local por subir; lo que está en la
 *   instantánea pero ya no en el teléfono es una eliminación (con la hora real en que se eliminó).
 * - En la nube gana la versión más reciente (updatedAt). Si la nube rechaza un cambio por tener una
 *   versión más reciente, el teléfono adopta la de la nube y **aparta** la suya en "versiones
 *   apartadas", que el usuario puede descargar: nada se pierde en silencio.
 * - Un cambio que llega de la nube no reemplaza un cambio local que aún no se ha subido, ni uno que
 *   el usuario hizo mientras la solicitud iba en camino: ese se sube en la siguiente sincronización.
 * - Solo se suben registros válidos (las mismas reglas que aplica la nube). Los dañados se quedan en
 *   el teléfono y se informan.
 * - Si la cuenta de la nube se borró y se volvió a crear (cambia la "época"), el teléfono olvida lo
 *   sincronizado y vuelve a subir todo lo suyo.
 */
import { actualizadoDe, MAX_SUBIDA, TABLAS_NUBE, type Cambio, type CambioNube, type RegistroInvalido, type RespuestaSincronizar, type SolicitudSincronizar, type TablaNube } from './protocoloNube.ts';
import { codificarRegistro, decodificarRegistro } from './codificacion.ts';
import { esObjeto, problemaLote } from './validacion.ts';
import { problemaParaNube } from './validacionNube.ts';

export type TablasNube = Record<TablaNube, unknown[]>;

/** Versión de un registro que se dejó de lado (conflicto perdido o dato de la nube que no se pudo aplicar). */
export interface VersionApartada {
  tabla: TablaNube;
  id: string;
  /** Texto del registro (codificado), para poder recuperarlo. */
  texto: string;
  motivo: string;
  fecha: string;
}

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
  /** Olvida toda la instantánea (la cuenta de la nube cambió). Los datos del teléfono no cambian. */
  vaciarInstantanea(): Promise<void>;
  /** Hora ISO en que se eliminó el registro en este teléfono, si se conoce. */
  fechaEliminacion(clave: string): string | undefined;
  olvidarEliminacion(clave: string): void;
  apartar(version: VersionApartada): Promise<void>;
  /** Guarda el avance dentro de la misma transacción que la instantánea. */
  guardarAvance(cursor: number, epoca: string): Promise<void>;
}

export type ApiSincronizar = (solicitud: SolicitudSincronizar) => Promise<RespuestaSincronizar>;

export interface ResultadoSincronizacion {
  cursor: number;
  epoca: string;
  subidos: number;
  recibidos: number;
  /** Versiones apartadas en esta sincronización (descargables desde la pantalla de la nube). */
  apartados: number;
  /** Cambios locales que quedaron sin subir (p. ej. se hicieron mientras se sincronizaba). */
  pendientes: number;
  /** Registros del teléfono con datos por corregir: no se suben hasta corregirlos. */
  noSubidos: RegistroInvalido[];
  /** La cuenta llegó a su cuota de almacenamiento: los cambios nuevos no se suben. */
  cuotaExcedida: boolean;
  /** Análisis, planes, registros o ciclos cuyo lote no existe en el teléfono. */
  sinLote: number;
  /** La cuenta de la nube se había borrado y vuelto a crear: se subió todo de nuevo. */
  reiniciada: boolean;
}

/** Vueltas máximas por sincronización; además se corta si una vuelta no avanza. */
const MAX_VUELTAS = 400;

export const claveDe = (tabla: string, id: string) => `${tabla}/${id}`;

const idDe = (r: unknown): string | undefined => (esObjeto(r) && typeof r.id === 'string' && r.id ? r.id : undefined);

interface CambioLocal extends Cambio {
  /** El registro no estaba en la última sincronización de este teléfono (creado o restaurado aquí). */
  nuevo: boolean;
}

/**
 * Cambios locales que no están en la nube: registros nuevos o modificados (solo si son válidos) y
 * eliminaciones (con su hora real si se conoce). Devuelve también los que no se pueden subir.
 */
export function calcularPendientes(
  local: TablasNube,
  instantanea: ReadonlyMap<string, string>,
  { ahora = new Date(), fechaEliminacion = () => undefined }: { ahora?: Date; fechaEliminacion?: (clave: string) => string | undefined } = {}
): { cambios: CambioLocal[]; noSubidos: RegistroInvalido[] } {
  const cambios: CambioLocal[] = [];
  const noSubidos: RegistroInvalido[] = [];
  const presentes = new Set<string>();
  for (const tabla of TABLAS_NUBE) {
    for (const registro of local[tabla]) {
      const id = idDe(registro);
      if (!id) {
        noSubidos.push({ tabla, id: '', motivo: 'El registro no tiene un identificador válido.' });
        continue;
      }
      const clave = claveDe(tabla, id);
      presentes.add(clave);
      const texto = codificarRegistro(registro);
      if (instantanea.get(clave) === texto) continue;
      const problema = problemaParaNube(tabla, id, registro, ahora);
      if (problema) noSubidos.push({ tabla, id, motivo: problema });
      else cambios.push({ tabla, id, datos: texto, actualizado: actualizadoDe(registro), nuevo: !instantanea.has(clave) });
    }
  }
  for (const clave of instantanea.keys()) {
    if (presentes.has(clave)) continue;
    const separador = clave.indexOf('/');
    const tabla = clave.slice(0, separador) as TablaNube;
    if (!(TABLAS_NUBE as ReadonlyArray<string>).includes(tabla)) continue;
    cambios.push({ tabla, id: clave.slice(separador + 1), datos: null, actualizado: fechaEliminacion(clave) ?? ahora.toISOString(), nuevo: false });
  }
  return { cambios, noSubidos };
}

/** Registros que dependen de un lote que no está en el teléfono. */
export function contarSinLote(local: TablasNube): number {
  const lotes = new Set(local.lotes.map(idDe));
  let total = 0;
  for (const tabla of ['analisisSuelos', 'planes', 'registros', 'ciclos'] as const) {
    for (const r of local[tabla]) if (esObjeto(r) && typeof r.loteId === 'string' && !lotes.has(r.loteId)) total++;
  }
  return total;
}

/**
 * Escribe en el teléfono una versión de la nube. Devuelve false si no se puede aplicar (JSON
 * ilegible o un lote que rompería la lista de lotes); quien llama la aparta.
 */
async function escribir(almacen: AlmacenSincronizacion, cambio: CambioNube): Promise<boolean> {
  const clave = claveDe(cambio.tabla, cambio.id);
  if (cambio.datos === null) {
    await almacen.borrar(cambio.tabla, cambio.id);
    await almacen.ponerInstantanea(clave, null);
    almacen.olvidarEliminacion(clave);
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

/** Texto actual del registro en el teléfono (null si no existe). */
async function textoLocal(almacen: AlmacenSincronizacion, tabla: TablaNube, id: string): Promise<string | null> {
  const actual = await almacen.obtener(tabla, id);
  return actual === undefined ? null : codificarRegistro(actual);
}

/**
 * Sube los cambios locales y baja los de la nube hasta quedar al día. `epoca` es la de la última
 * sincronización ('' si nunca se sincronizó).
 */
export async function sincronizar(
  almacen: AlmacenSincronizacion,
  api: ApiSincronizar,
  inicio: { cursor: number; epoca: string },
  { ahora = () => new Date() }: { ahora?: () => Date } = {}
): Promise<ResultadoSincronizacion> {
  let { cursor, epoca } = inicio;
  let subidos = 0, recibidos = 0, apartados = 0;
  let cuotaExcedida = false, reiniciada = false;
  const calcular = async () => {
    const local = await almacen.leerTodo();
    return { ...calcularPendientes(local, await almacen.leerInstantanea(), { ahora: ahora(), fechaEliminacion: c => almacen.fechaEliminacion(c) }), sinLote: contarSinLote(local) };
  };
  // Los pendientes se calculan una sola vez: leer y codificar todo en cada vuelta sería lento en el teléfono.
  let { cambios: cola, noSubidos, sinLote } = await calcular();
  const noSubidosServidor: RegistroInvalido[] = [];
  /** Registros creados o restaurados aquí que la nube tenía eliminados: se vuelven a subir con la hora actual. */
  const revivir = new Set<string>();

  const apartar = async (tabla: TablaNube, id: string, texto: string, motivo: string) => {
    await almacen.apartar({ tabla, id, texto, motivo, fecha: ahora().toISOString() });
    apartados++;
  };

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const lote = (cuotaExcedida ? cola.filter(c => c.datos === null) : cola).slice(0, MAX_SUBIDA);
    const enviados = lote.map(c => ({ ...c, actualizado: revivir.has(claveDe(c.tabla, c.id)) ? ahora().toISOString() : c.actualizado }));
    const respuesta = await api({ desde: cursor, cambios: enviados.map(({ nuevo: _n, ...c }) => c) });

    if (epoca && respuesta.epoca !== epoca) {
      // La cuenta se borró y se volvió a crear: lo sincronizado ya no está en la nube. Se sube todo de nuevo.
      if (reiniciada) throw new Error('La cuenta de la nube cambió dos veces durante la sincronización.');
      reiniciada = true;
      await almacen.transaccion(async () => {
        await almacen.vaciarInstantanea();
        await almacen.guardarAvance(0, respuesta.epoca);
      });
      cursor = 0;
      epoca = respuesta.epoca;
      ({ cambios: cola, noSubidos, sinLote } = await calcular());
      continue;
    }
    epoca = respuesta.epoca;
    cuotaExcedida = respuesta.cuotaExcedida;

    const rechazados = new Map(respuesta.rechazados.map(c => [claveDe(c.tabla, c.id), c]));
    const invalidos = new Map(respuesta.invalidos.map(c => [claveDe(c.tabla, c.id), c]));
    const terminados = new Set<string>();
    let avance = respuesta.cambios.length;

    await almacen.transaccion(async () => {
      for (const c of enviados) {
        const clave = claveDe(c.tabla, c.id);
        const invalido = invalidos.get(clave);
        if (invalido) {
          noSubidosServidor.push(invalido);
          terminados.add(clave);
          continue;
        }
        const enNube = rechazados.get(clave);
        if (!enNube) {
          if (cuotaExcedida && c.datos !== null) continue;
          // Aceptado: así quedó en la nube. Si el teléfono cambió mientras tanto, se subirá en la próxima sincronización.
          await almacen.ponerInstantanea(clave, c.datos);
          if (c.datos === null) almacen.olvidarEliminacion(clave);
          subidos++;
          avance++;
          terminados.add(clave);
          continue;
        }
        terminados.add(clave);
        if (enNube.datos === null && c.datos !== null && c.nuevo && !revivir.has(clave)) {
          // Creado o restaurado en este teléfono sobre algo eliminado en la nube: se vuelve a subir con la hora actual.
          revivir.add(clave);
          terminados.delete(clave);
          avance++;
          continue;
        }
        // La nube tiene una versión más reciente. Si el usuario cambió el registro mientras la
        // solicitud iba en camino, se conserva su cambio (se subirá en la próxima sincronización).
        if ((await textoLocal(almacen, c.tabla, c.id)) !== c.datos) continue;
        if (c.datos !== null) await apartar(c.tabla, c.id, c.datos, 'La nube tenía una versión más reciente de este registro.');
        if (!(await escribir(almacen, enNube))) {
          if (enNube.datos !== null) await apartar(c.tabla, c.id, enNube.datos, 'La versión de la nube no se pudo aplicar en este teléfono.');
        } else {
          avance++;
        }
      }

      for (const c of respuesta.cambios) {
        const clave = claveDe(c.tabla, c.id);
        const actual = await textoLocal(almacen, c.tabla, c.id);
        const sincronizado = (await almacen.obtenerInstantanea(clave)) ?? null;
        // Cambio local sin subir (distinto de lo sincronizado y de lo que llega): se conserva.
        if (actual !== sincronizado && actual !== c.datos) continue;
        if (await escribir(almacen, c)) recibidos++;
        else if (c.datos !== null) await apartar(c.tabla, c.id, c.datos, 'La versión de la nube no se pudo aplicar en este teléfono.');
      }
      await almacen.guardarAvance(respuesta.hasta, respuesta.epoca);
    });

    cursor = respuesta.hasta;
    cola = cola.filter(c => {
      const clave = claveDe(c.tabla, c.id);
      if (terminados.has(clave)) return false;
      if (!lote.includes(c)) return true;
      // Se vuelven a enviar: los que se reviven y los que la cuota no dejó guardar (quedan pendientes).
      return revivir.has(clave) || (cuotaExcedida && c.datos !== null);
    });
    const quedanPorSubir = cuotaExcedida ? cola.filter(c => c.datos === null).length : cola.length;
    if (quedanPorSubir === 0 && !respuesta.hayMas) break;
    // Una vuelta que no avanza no se repite: protege el límite diario gratuito.
    if (avance === 0 && !respuesta.hayMas) break;
  }
  return {
    cursor,
    epoca,
    subidos,
    recibidos,
    apartados,
    pendientes: cola.length,
    noSubidos: [...noSubidos, ...noSubidosServidor],
    cuotaExcedida,
    sinLote,
    reiniciada
  };
}
