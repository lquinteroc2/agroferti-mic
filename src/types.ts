/** Campos y estructuras del documento AgroFerti MIC aprobado (fase 1: Lote). */
export type Cultivo = 'papa' | 'lechuga' | 'kale' | 'arveja' | 'otro';

export const CULTIVOS: ReadonlyArray<{ value: Cultivo; label: string }> = [
  { value: 'papa', label: 'Papa (piloto)' },
  { value: 'lechuga', label: 'Lechuga' },
  { value: 'kale', label: 'Kale' },
  { value: 'arveja', label: 'Arveja' },
  { value: 'otro', label: 'Otro cultivo' }
];

export interface Lote {
  id: string;
  nombre: string;
  cultivo: Cultivo;
  areaM2: number;
  fechaSiembra?: string;
  ubicacion?: string;
  createdAt: string;
  updatedAt: string;
}

/** Estructuras reservadas para siguientes fases. No implican diagnóstico automático. */
export interface AnalisisSuelo {
  id: string;
  loteId: string;
  fechaAnalisis: string;
  profundidadCm: number;
  densidadGcm3?: number;
  metodoLaboratorio?: string;
  ph?: number;
  nutrientesMgKg?: Record<string, number>;
  observaciones?: string;
}

export interface PlanFertilizacion {
  id: string;
  loteId: string;
  producto: string;
  objetivoNutrienteKgHa?: number;
  fuenteObjetivo?: string;
  dosisKgHa?: number;
  precioCopKg?: number;
  estado: 'borrador' | 'revisado' | 'aprobado';
  createdAt: string;
}

export interface RegistroMonitoreo {
  id: string;
  loteId: string;
  fecha: string;
  tipo: 'aplicacion' | 'observacion' | 'tarea';
  descripcion: string;
  cantidadKg?: number;
  costoCop?: number;
  responsable?: string;
}
