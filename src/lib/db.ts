import Dexie, { type EntityTable, type Table } from 'dexie';
import type { AnalisisSuelo, CicloCultivo, Lote, PlanFertilizacion, ProductoFertilizante, RegistroSeguimiento } from '../types';
import { crearRepositorioAnalisis, ErrorPersistencia } from './repositorioAnalisis';
import { crearRepositorioCiclos } from './repositorioCiclos';
import { crearRepositorioPlanes, crearRepositorioProductos } from './repositorioPlanes';
import { crearRepositorioSeguimiento } from './repositorioSeguimiento';
import type { EstadoNube } from './nube';
import { TABLAS_NUBE, type TablaNube } from './protocoloNube';
import { leerConjunto, type ConjuntoReferencias } from './referencias';
import type { AlmacenSincronizacion, TablasNube, VersionApartada } from './sincronizacion';

export const db = new Dexie('AgroFertiMIC') as Dexie & {
  lotes: EntityTable<Lote, 'id'>;
  analisisSuelos: EntityTable<AnalisisSuelo, 'id'>;
  planes: EntityTable<PlanFertilizacion, 'id'>;
  registros: EntityTable<RegistroSeguimiento, 'id'>;
  productos: EntityTable<ProductoFertilizante, 'id'>;
  ciclos: EntityTable<CicloCultivo, 'id'>;
  sincronizado: EntityTable<{ clave: string; texto: string }, 'clave'>;
  ajustes: EntityTable<{ clave: string; valor: unknown }, 'clave'>;
  apartadas: EntityTable<VersionApartada & { n?: number }, 'n'>;
};

// Mantener versiones e índices estables. Cada cambio de esquema añade una versión nueva.
db.version(1).stores({
  lotes: 'id, cultivo, createdAt, updatedAt',
  analisisSuelos: 'id, loteId, fechaAnalisis',
  planes: 'id, loteId, estado',
  registros: 'id, loteId, fecha, tipo'
});

// Fase 3: solo se agrega la tabla del catálogo de productos (común a todos los lotes). Dexie conserva
// las tablas de la versión 1 y sus datos; `planes` ya tenía los índices necesarios y estaba vacía.
db.version(2).stores({
  productos: 'id, nombre'
});

// Historial del lote: solo se agrega la tabla de ciclos de cultivo cerrados. Las tablas anteriores y
// sus datos no cambian; los análisis, planes y registros se agrupan por fecha al leerlos.
db.version(3).stores({
  ciclos: 'id, loteId, fechaCierre'
});

// Nube: solo se agregan la instantánea de la última sincronización (clave "tabla/id" → texto del
// registro) y los ajustes de la sesión. Las tablas de datos no cambian.
db.version(4).stores({
  sincronizado: 'clave',
  ajustes: 'clave'
});

// Nube (revisión): versiones de registros que la sincronización dejó de lado (conflictos perdidos o
// datos de la nube que no se pudieron aplicar), para que el usuario las descargue. Nada se pierde en silencio.
db.version(5).stores({
  apartadas: '++n, fecha'
});

// Fase 2: el esquema v1 ya indexa analisisSuelos por loteId y fechaAnalisis; los campos nuevos
// (nutrientes, laboratorio, areaM2AlRegistro...) no son índices, así que no se requiere migración.
// Los registros se leen como `unknown` y se verifican: nunca se reescriben al consultarlos.
export const repositorioAnalisis = crearRepositorioAnalisis({
  obtenerAreaLote: async loteId => (await db.lotes.get(loteId))?.areaM2,
  obtener: id => db.analisisSuelos.get(id),
  listarPorLote: loteId => db.analisisSuelos.where('loteId').equals(loteId).toArray(),
  guardar: async registro => { await db.analisisSuelos.put(registro); },
  eliminar: id => db.analisisSuelos.delete(id),
  transaccion: fn => db.transaction('rw', db.lotes, db.analisisSuelos, fn)
});

export const repositorioProductos = crearRepositorioProductos({
  obtener: id => db.productos.get(id),
  listar: () => db.productos.toArray(),
  guardar: async registro => { await db.productos.put(registro); },
  eliminar: id => db.productos.delete(id),
  transaccion: fn => db.transaction('rw', db.productos, fn)
});

export const repositorioPlanes = crearRepositorioPlanes({
  obtenerAreaLote: async loteId => (await db.lotes.get(loteId))?.areaM2,
  analisisDelLote: async (loteId, analisisId) => (await db.analisisSuelos.get(analisisId))?.loteId === loteId,
  obtener: id => db.planes.get(id),
  listarPorLote: loteId => db.planes.where('loteId').equals(loteId).toArray(),
  guardar: async registro => { await db.planes.put(registro); },
  eliminar: id => db.planes.delete(id),
  transaccion: fn => db.transaction('rw', db.lotes, db.analisisSuelos, db.planes, fn)
});

export const repositorioSeguimiento = crearRepositorioSeguimiento({
  existeLote: async loteId => (await db.lotes.get(loteId)) !== undefined,
  obtenerPlan: planId => db.planes.get(planId),
  obtener: id => db.registros.get(id),
  listarPorLote: loteId => db.registros.where('loteId').equals(loteId).toArray(),
  guardar: async registro => { await db.registros.put(registro); },
  eliminar: id => db.registros.delete(id),
  transaccion: fn => db.transaction('rw', db.lotes, db.planes, db.registros, fn)
});

export const repositorioCiclos = crearRepositorioCiclos({
  obtenerLote: loteId => db.lotes.get(loteId),
  guardarLote: async lote => { await db.lotes.put(lote); },
  obtener: id => db.ciclos.get(id),
  listarPorLote: loteId => db.ciclos.where('loteId').equals(loteId).toArray(),
  guardar: async ciclo => { await db.ciclos.put(ciclo); },
  eliminar: id => db.ciclos.delete(id),
  transaccion: fn => db.transaction('rw', db.lotes, db.ciclos, fn)
});

export type DatosEdicionLote = Pick<Lote, 'nombre' | 'cultivo' | 'areaM2' | 'fechaSiembra' | 'ubicacion'>;

/**
 * Guarda la edición de un lote sin pisar cambios hechos mientras el formulario estaba abierto (p. ej.
 * un cierre de ciclo en otra pestaña) y conservando los campos que el formulario no edita.
 */
export async function actualizarLote(id: string, datos: DatosEdicionLote, versionInicial?: string): Promise<void> {
  await db.transaction('rw', db.lotes, async () => {
    const actual = await db.lotes.get(id);
    if (!actual) throw new ErrorPersistencia('El lote ya no existe en este dispositivo.');
    if (versionInicial !== undefined && actual.updatedAt !== versionInicial) {
      throw new ErrorPersistencia('El lote cambió mientras lo editabas (por ejemplo, se cerró un ciclo en otra pestaña). No se guardó nada: vuelve al lote y abre de nuevo «Editar información».');
    }
    // Los campos que el formulario puede dejar vacíos no se heredan del lote guardado.
    const { fechaSiembra: _f, ubicacion: _u, ...resto } = actual;
    await db.lotes.put({
      ...resto,
      ...datos,
      id,
      createdAt: actual.createdAt,
      updatedAt: new Date().toISOString()
    });
  });
}

export async function eliminarLoteYRelacionados(id: string): Promise<void> {
  await db.transaction('rw', [db.lotes, db.analisisSuelos, db.planes, db.registros, db.ciclos], async () => {
    await db.analisisSuelos.where('loteId').equals(id).delete();
    await db.planes.where('loteId').equals(id).delete();
    await db.registros.where('loteId').equals(id).delete();
    await db.ciclos.where('loteId').equals(id).delete();
    await db.lotes.delete(id);
  });
}

// ---- Nube: almacén de la sincronización y estado de la sesión ----

const tablasNube = () => TABLAS_NUBE.map(t => db.table(t));
const CLAVE_NUBE = 'nube';

/**
 * Hora real de cada eliminación (clave "tabla/id" → ISO), para que la nube compare con la hora en que
 * el usuario eliminó y no con la de la sincronización. Se guarda en localStorage porque los ganchos
 * de Dexie no pueden escribir en otra tabla de la misma transacción. Si se pierde, se usa la hora de
 * la sincronización.
 */
const CLAVE_ELIMINADOS = 'agroferti-eliminados';
const VIGENCIA_ELIMINADOS_MS = 180 * 24 * 60 * 60 * 1000;

function leerEliminados(): Record<string, string> {
  try {
    const valor = JSON.parse(localStorage.getItem(CLAVE_ELIMINADOS) ?? '{}');
    return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {};
  } catch {
    return {};
  }
}

function guardarEliminados(eliminados: Record<string, string>): void {
  try {
    localStorage.setItem(CLAVE_ELIMINADOS, JSON.stringify(eliminados));
  } catch { /* sin almacenamiento: se usará la hora de la sincronización */ }
}

export function registrarEliminacion(clave: string, ahora: Date = new Date()): void {
  const limite = ahora.getTime() - VIGENCIA_ELIMINADOS_MS;
  const eliminados = Object.fromEntries(Object.entries(leerEliminados()).filter(([, f]) => Date.parse(f) > limite));
  eliminados[clave] ??= ahora.toISOString();
  guardarEliminados(eliminados);
}

export const almacenSincronizacion: AlmacenSincronizacion = {
  transaccion: fn => db.transaction('rw', [...tablasNube(), db.sincronizado, db.ajustes, db.apartadas] as Table[], fn),
  leerTodo: () => db.transaction('r', tablasNube(), async () =>
    Object.fromEntries(await Promise.all(TABLAS_NUBE.map(async t => [t, await db.table(t).toArray()]))) as TablasNube),
  obtener: (tabla, id) => db.table(tabla).get(id),
  poner: async (tabla, registro) => { await db.table(tabla).put(registro); },
  borrar: (tabla, id) => db.table(tabla).delete(id),
  leerInstantanea: async () => new Map((await db.sincronizado.toArray()).map(f => [f.clave, f.texto])),
  obtenerInstantanea: async clave => (await db.sincronizado.get(clave))?.texto,
  ponerInstantanea: async (clave, texto) => {
    if (texto === null) await db.sincronizado.delete(clave);
    else await db.sincronizado.put({ clave, texto });
  },
  vaciarInstantanea: async () => { await db.sincronizado.clear(); },
  fechaEliminacion: clave => leerEliminados()[clave],
  olvidarEliminacion: clave => {
    const eliminados = leerEliminados();
    if (clave in eliminados) {
      delete eliminados[clave];
      guardarEliminados(eliminados);
    }
  },
  apartar: async version => { await db.apartadas.add(version); },
  guardarAvance: async (cursor, epoca) => {
    const fila = await db.ajustes.get(CLAVE_NUBE);
    if (fila) await db.ajustes.put({ clave: CLAVE_NUBE, valor: { ...(fila.valor as EstadoNube), cursor, epoca } });
  }
};

export async function leerEstadoNube(): Promise<EstadoNube | undefined> {
  return (await db.ajustes.get(CLAVE_NUBE))?.valor as EstadoNube | undefined;
}

export async function guardarEstadoNube(estado: EstadoNube | undefined): Promise<void> {
  if (estado) await db.ajustes.put({ clave: CLAVE_NUBE, valor: estado });
  else await db.ajustes.delete(CLAVE_NUBE);
}

/** Olvida la sincronización (instantánea y sesión) sin tocar los datos del dispositivo. */
export async function desvincularNube(): Promise<void> {
  await db.transaction('rw', db.sincronizado, db.ajustes, async () => {
    await db.sincronizado.clear();
    await db.ajustes.delete(CLAVE_NUBE);
  });
  guardarEliminados({});
}

/** Borra todos los datos de este dispositivo (para usarlo con otra cuenta). Pide confirmación antes. */
export async function borrarDatosDelTelefono(): Promise<void> {
  await db.transaction('rw', [...tablasNube(), db.sincronizado, db.ajustes, db.apartadas] as Table[], async () => {
    for (const t of tablasNube()) await t.clear();
    await db.sincronizado.clear();
    await db.apartadas.clear();
    await db.ajustes.delete(CLAVE_NUBE);
  });
  guardarEliminados({});
}

// ---- Referencias técnicas (fertilizantes ICA/DANE, dosis y niveles), copia en el dispositivo ----

const CLAVE_REFERENCIAS = 'referencias';

export interface ReferenciasGuardadas {
  conjunto: ConjuntoReferencias;
  /** Cuándo se consultó la nube por última vez (ISO). */
  consultado: string;
}

export async function leerReferencias(): Promise<ReferenciasGuardadas | undefined> {
  const fila = await db.ajustes.get(CLAVE_REFERENCIAS);
  const valor = fila?.valor as Partial<ReferenciasGuardadas> | undefined;
  const conjunto = leerConjunto(valor?.conjunto);
  return conjunto && typeof valor?.consultado === 'string' ? { conjunto, consultado: valor.consultado } : undefined;
}

export async function guardarReferencias(r: ReferenciasGuardadas): Promise<void> {
  await db.ajustes.put({ clave: CLAVE_REFERENCIAS, valor: r });
}

/** Versiones apartadas por la sincronización, para descargarlas o descartarlas. */
export const versionesApartadas = {
  listar: () => db.apartadas.orderBy('fecha').toArray(),
  contar: () => db.apartadas.count(),
  descartar: () => db.apartadas.clear()
};

/** Registros sin lote (p. ej. el lote se eliminó en otro dispositivo), para descargarlos o eliminarlos. */
export const registrosSinLote = {
  async listar(): Promise<{ tabla: TablaNube; registro: unknown }[]> {
    return db.transaction('r', tablasNube(), async () => {
      const lotes = new Set(await db.lotes.toCollection().primaryKeys());
      const resultado: { tabla: TablaNube; registro: unknown }[] = [];
      for (const tabla of ['analisisSuelos', 'planes', 'registros', 'ciclos'] as const) {
        for (const r of await db.table(tabla).toArray()) {
          if (typeof r?.loteId === 'string' && !lotes.has(r.loteId)) resultado.push({ tabla, registro: r });
        }
      }
      return resultado;
    });
  },
  async eliminar(): Promise<void> {
    await db.transaction('rw', tablasNube(), async () => {
      const lotes = new Set(await db.lotes.toCollection().primaryKeys());
      for (const tabla of ['analisisSuelos', 'planes', 'registros', 'ciclos'] as const) {
        await db.table(tabla).filter(r => typeof r?.loteId === 'string' && !lotes.has(r.loteId)).delete();
      }
    });
  }
};
