import Dexie, { type EntityTable } from 'dexie';
import type { AnalisisSuelo, Lote, PlanFertilizacion, RegistroMonitoreo } from '../types';
import { crearRepositorioAnalisis } from './repositorioAnalisis';

export const db = new Dexie('AgroFertiMIC') as Dexie & {
  lotes: EntityTable<Lote, 'id'>;
  analisisSuelos: EntityTable<AnalisisSuelo, 'id'>;
  planes: EntityTable<PlanFertilizacion, 'id'>;
  registros: EntityTable<RegistroMonitoreo, 'id'>;
};

// Mantener versión e índices estables. Añadir version(2) cuando cambie el esquema.
db.version(1).stores({
  lotes: 'id, cultivo, createdAt, updatedAt',
  analisisSuelos: 'id, loteId, fechaAnalisis',
  planes: 'id, loteId, estado',
  registros: 'id, loteId, fecha, tipo'
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

export async function eliminarLoteYRelacionados(id: string): Promise<void> {
  await db.transaction('rw', db.lotes, db.analisisSuelos, db.planes, db.registros, async () => {
    await db.analisisSuelos.where('loteId').equals(id).delete();
    await db.planes.where('loteId').equals(id).delete();
    await db.registros.where('loteId').equals(id).delete();
    await db.lotes.delete(id);
  });
}
