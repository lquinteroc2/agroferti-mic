import Dexie, { type EntityTable } from 'dexie';
import type { AnalisisSuelo, Lote, PlanFertilizacion, ProductoFertilizante, RegistroSeguimiento } from '../types';
import { crearRepositorioAnalisis } from './repositorioAnalisis';
import { crearRepositorioPlanes, crearRepositorioProductos } from './repositorioPlanes';
import { crearRepositorioRespaldo, type IdsExistentes } from './respaldo';
import { crearRepositorioSeguimiento } from './repositorioSeguimiento';

export const db = new Dexie('AgroFertiMIC') as Dexie & {
  lotes: EntityTable<Lote, 'id'>;
  analisisSuelos: EntityTable<AnalisisSuelo, 'id'>;
  planes: EntityTable<PlanFertilizacion, 'id'>;
  registros: EntityTable<RegistroSeguimiento, 'id'>;
  productos: EntityTable<ProductoFertilizante, 'id'>;
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

/** Identificadores de texto de una tabla (otros tipos de clave no pueden coincidir con los de una copia). */
async function idsDe(tabla: { toCollection(): { primaryKeys(): Promise<unknown[]> } }): Promise<Set<string>> {
  return new Set((await tabla.toCollection().primaryKeys()).filter((k): k is string => typeof k === 'string'));
}

// Copia de seguridad: lee todo en una transacción de lectura y restaura con bulkAdd en una sola
// transacción. bulkAdd nunca reemplaza: los identificadores existentes se filtran antes.
export const repositorioRespaldo = crearRepositorioRespaldo({
  esquema: () => db.verno,
  leerTodo: () => db.transaction('r', [db.lotes, db.analisisSuelos, db.productos, db.planes, db.registros], async () => ({
    lotes: await db.lotes.toArray(),
    analisisSuelos: await db.analisisSuelos.toArray(),
    productos: await db.productos.toArray(),
    planes: await db.planes.toArray(),
    registros: await db.registros.toArray()
  })),
  idsExistentes: (): Promise<IdsExistentes> => db.transaction('r', [db.lotes, db.analisisSuelos, db.productos, db.planes, db.registros], async () => ({
    lotes: await idsDe(db.lotes),
    analisisSuelos: await idsDe(db.analisisSuelos),
    productos: await idsDe(db.productos),
    planes: await idsDe(db.planes),
    registros: await idsDe(db.registros)
  })),
  agregar: async datos => {
    // Análisis, productos, planes y registros se guardan tal cual y la app los verifica al leerlos;
    // los lotes ya se comprobaron con problemaLote.
    await db.lotes.bulkAdd(datos.lotes as Lote[]);
    await db.analisisSuelos.bulkAdd(datos.analisisSuelos as AnalisisSuelo[]);
    await db.productos.bulkAdd(datos.productos as ProductoFertilizante[]);
    await db.planes.bulkAdd(datos.planes as PlanFertilizacion[]);
    await db.registros.bulkAdd(datos.registros as RegistroSeguimiento[]);
  },
  transaccion: fn => db.transaction('rw', [db.lotes, db.analisisSuelos, db.productos, db.planes, db.registros], fn)
});

export async function eliminarLoteYRelacionados(id: string): Promise<void> {
  await db.transaction('rw', db.lotes, db.analisisSuelos, db.planes, db.registros, async () => {
    await db.analisisSuelos.where('loteId').equals(id).delete();
    await db.planes.where('loteId').equals(id).delete();
    await db.registros.where('loteId').equals(id).delete();
    await db.lotes.delete(id);
  });
}
