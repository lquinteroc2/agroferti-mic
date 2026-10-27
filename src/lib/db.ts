import Dexie, { type EntityTable } from 'dexie';
import type { AnalisisSuelo, Lote, PlanFertilizacion, RegistroMonitoreo } from '../types';

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

export async function eliminarLoteYRelacionados(id: string): Promise<void> {
  await db.transaction('rw', db.lotes, db.analisisSuelos, db.planes, db.registros, async () => {
    await db.analisisSuelos.where('loteId').equals(id).delete();
    await db.planes.where('loteId').equals(id).delete();
    await db.registros.where('loteId').equals(id).delete();
    await db.lotes.delete(id);
  });
}
