/**
 * Copia de seguridad (fase 5, adelantada): exporta todos los registros tal como están guardados y
 * los restaura SIN borrar ni sobrescribir nada. Las reglas son puras y se prueban en Node con un
 * almacén en memoria; `db.ts` aporta el almacén real sobre IndexedDB.
 */
import { CULTIVOS } from '../types.ts';
import { AREA_LOTE_MAX_M2, AREA_LOTE_MIN_M2, describirValor, esObjeto, fechaLocalISO } from './validacion.ts';

export const FORMATO_RESPALDO = 'agroferti-mic-respaldo';
export const VERSION_RESPALDO = 1;
export const TABLAS_RESPALDO = ['lotes', 'analisisSuelos', 'productos', 'planes', 'registros'] as const;
export type TablaRespaldo = typeof TABLAS_RESPALDO[number];
export type TablasRespaldo = Record<TablaRespaldo, unknown[]>;

const NOMBRE_TABLA: Record<TablaRespaldo, [singular: string, plural: string]> = {
  lotes: ['lote', 'lotes'],
  analisisSuelos: ['análisis de suelo', 'análisis de suelo'],
  productos: ['producto', 'productos'],
  planes: ['plan', 'planes'],
  registros: ['registro de seguimiento', 'registros de seguimiento']
};
/** Registros que pertenecen a un lote: sin su lote no se verían en la app. */
const DEPENDEN_DE_LOTE: ReadonlyArray<TablaRespaldo> = ['analisisSuelos', 'planes', 'registros'];

export interface Respaldo {
  formato: typeof FORMATO_RESPALDO;
  version: number;
  app: string;
  /** Versión del esquema de la base de datos que generó la copia (informativa). */
  esquema: number;
  creado: string;
  datos: TablasRespaldo;
}

const tablasVacias = (): TablasRespaldo => ({ lotes: [], analisisSuelos: [], productos: [], planes: [], registros: [] });

/** Los registros se copian tal como están guardados, incluidos los dañados y los campos de otras versiones. */
export function crearRespaldo(datos: TablasRespaldo, { ahora = new Date(), esquema }: { ahora?: Date; esquema: number }): Respaldo {
  return { formato: FORMATO_RESPALDO, version: VERSION_RESPALDO, app: 'AgroFerti MIC', esquema, creado: ahora.toISOString(), datos };
}

export function nombreArchivoRespaldo(ahora: Date = new Date()): string {
  return `agroferti-respaldo-${fechaLocalISO(ahora)}.json`;
}

/** "2 lotes, 1 producto": solo las tablas con registros. */
export function resumenCantidades(cantidades: Partial<Record<TablaRespaldo, number>>): string {
  const partes = TABLAS_RESPALDO
    .filter(t => (cantidades[t] ?? 0) > 0)
    .map(t => `${cantidades[t]} ${NOMBRE_TABLA[t][cantidades[t] === 1 ? 0 : 1]}`);
  return partes.length ? partes.join(', ') : 'ningún registro';
}

export const contar = (tablas: TablasRespaldo): Record<TablaRespaldo, number> =>
  Object.fromEntries(TABLAS_RESPALDO.map(t => [t, tablas[t].length])) as Record<TablaRespaldo, number>;

export type LecturaRespaldo = { ok: true; respaldo: Respaldo; avisos: string[] } | { ok: false; error: string };

/** Lee el texto de un archivo de copia. No escribe nada: solo comprueba formato, versión y listas. */
export function leerRespaldo(texto: string): LecturaRespaldo {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return { ok: false, error: 'El archivo no es una copia de seguridad válida: no se pudo leer como JSON.' };
  }
  if (!esObjeto(crudo) || crudo.formato !== FORMATO_RESPALDO) {
    return { ok: false, error: 'El archivo no es una copia de seguridad de AgroFerti MIC.' };
  }
  if (crudo.version !== VERSION_RESPALDO) {
    return { ok: false, error: `La copia usa una versión de formato (${describirValor(crudo.version)}) que esta app no sabe leer.` };
  }
  if (!esObjeto(crudo.datos)) return { ok: false, error: 'La copia no contiene datos.' };
  const datos = tablasVacias();
  for (const tabla of TABLAS_RESPALDO) {
    const lista = crudo.datos[tabla];
    if (lista === undefined) continue;
    if (!Array.isArray(lista)) return { ok: false, error: `La lista de ${NOMBRE_TABLA[tabla][1]} de la copia no es válida.` };
    datos[tabla] = lista;
  }
  const avisos: string[] = [];
  const otras = Object.keys(crudo.datos).filter(k => !(TABLAS_RESPALDO as ReadonlyArray<string>).includes(k));
  if (otras.length) avisos.push(`La copia tiene datos que esta versión no conoce y no se restaurarán (${otras.join(', ')}).`);
  return {
    ok: true,
    avisos,
    respaldo: {
      formato: FORMATO_RESPALDO,
      version: VERSION_RESPALDO,
      app: typeof crudo.app === 'string' ? crudo.app : '',
      esquema: typeof crudo.esquema === 'number' ? crudo.esquema : 0,
      creado: typeof crudo.creado === 'string' ? crudo.creado : '',
      datos
    }
  };
}

/** Lo que exige la lista de lotes para mostrarse sin romperse (los demás registros se verifican al leerlos). */
function problemaLote(r: Record<string, unknown>): string | null {
  if (typeof r.nombre !== 'string' || !r.nombre.trim()) return 'El lote no tiene nombre.';
  if (!CULTIVOS.some(c => c.value === r.cultivo)) return 'El cultivo del lote no es válido.';
  const area = r.areaM2;
  if (typeof area !== 'number' || !Number.isFinite(area) || area < AREA_LOTE_MIN_M2 || area > AREA_LOTE_MAX_M2) {
    return 'El área del lote no es válida.';
  }
  if (typeof r.createdAt !== 'string' || typeof r.updatedAt !== 'string') return 'Faltan las fechas de control del lote.';
  for (const campo of ['fechaSiembra', 'ubicacion']) {
    if (r[campo] !== undefined && typeof r[campo] !== 'string') return `El dato "${campo}" del lote no es válido.`;
  }
  return null;
}

export type IdsExistentes = Record<TablaRespaldo, ReadonlySet<string>>;

export interface Omitido {
  tabla: TablaRespaldo;
  id?: string;
  motivo: string;
}

export interface PlanRestauracion {
  /** Registros nuevos que se agregarán, tal como vienen en la copia. */
  agregar: TablasRespaldo;
  /** Por tabla: registros que ya existen en el dispositivo con el mismo identificador (no se modifican). */
  existentes: Record<TablaRespaldo, number>;
  omitidos: Omitido[];
}

/**
 * Decide qué agregar sin escribir nada. Nunca borra ni sobrescribe: un registro cuyo identificador
 * ya existe se deja como está. Se omiten registros sin identificador, repetidos en la copia, lotes
 * que romperían la lista de lotes y registros cuyo lote no está en la copia ni en el dispositivo.
 */
export function planearRestauracion(datos: TablasRespaldo, ids: IdsExistentes): PlanRestauracion {
  const agregar = tablasVacias();
  const existentes = Object.fromEntries(TABLAS_RESPALDO.map(t => [t, 0])) as Record<TablaRespaldo, number>;
  const omitidos: Omitido[] = [];
  const lotesDisponibles = new Set(ids.lotes);

  const revisar = (tabla: TablaRespaldo, condicion?: (r: Record<string, unknown>) => string | null) => {
    const vistos = new Set<string>();
    for (const r of datos[tabla]) {
      const id = esObjeto(r) && typeof r.id === 'string' && r.id ? r.id : undefined;
      if (!esObjeto(r) || !id) {
        omitidos.push({ tabla, motivo: `Un registro de ${NOMBRE_TABLA[tabla][1]} no tiene identificador válido.` });
        continue;
      }
      if (vistos.has(id)) {
        omitidos.push({ tabla, id, motivo: 'Aparece repetido en la copia; se usa la primera aparición.' });
        continue;
      }
      vistos.add(id);
      if (ids[tabla].has(id)) {
        existentes[tabla]++;
        continue;
      }
      const problema = condicion?.(r);
      if (problema) {
        omitidos.push({ tabla, id, motivo: problema });
        continue;
      }
      agregar[tabla].push(r);
      if (tabla === 'lotes') lotesDisponibles.add(id);
    }
  };

  // Primero los lotes: los demás registros solo se agregan si su lote existe o se agrega.
  revisar('lotes', problemaLote);
  for (const tabla of DEPENDEN_DE_LOTE) {
    revisar(tabla, r => (typeof r.loteId === 'string' && lotesDisponibles.has(r.loteId)
      ? null
      : 'Su lote no está en la copia ni en este dispositivo.'));
  }
  revisar('productos');
  return { agregar, existentes, omitidos };
}

export interface AlmacenRespaldo {
  /** Versión del esquema de la base de datos (informativa en la copia). */
  esquema(): number;
  /** Todos los registros, leídos de forma consistente. */
  leerTodo(): Promise<TablasRespaldo>;
  idsExistentes(): Promise<IdsExistentes>;
  agregar(datos: TablasRespaldo): Promise<void>;
  /** Ejecuta `fn` de forma atómica (una transacción en IndexedDB). */
  transaccion<T>(fn: () => Promise<T>): Promise<T>;
}

export function crearRepositorioRespaldo(almacen: AlmacenRespaldo) {
  return {
    async exportar(ahora: Date = new Date()): Promise<Respaldo> {
      return crearRespaldo(await almacen.leerTodo(), { ahora, esquema: almacen.esquema() });
    },

    /** Lo que haría restaurar, sin escribir nada. */
    async previsualizar(datos: TablasRespaldo): Promise<PlanRestauracion> {
      return planearRestauracion(datos, await almacen.idsExistentes());
    },

    /** Agrega lo que no existe, en una sola transacción: o entra todo o no entra nada. */
    async restaurar(datos: TablasRespaldo): Promise<PlanRestauracion> {
      return almacen.transaccion(async () => {
        const plan = planearRestauracion(datos, await almacen.idsExistentes());
        await almacen.agregar(plan.agregar);
        return plan;
      });
    }
  };
}
