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

/** Unidades admitidas en fase 2. Se guardan tal como las reporta el laboratorio. */
export type UnidadNutriente = 'mg/kg' | 'cmol(+)/kg';

/** Lectura de laboratorio sin conversiones: la forma química distingue, p. ej., P de P₂O₅. */
export interface NutrienteReportado {
  elemento: string;
  forma: string;
  valor: number;
  unidad: UnidadNutriente;
}

/** Análisis de suelo de un lote (fase 2), tal como se guarda. No implica diagnóstico ni dosis. */
export interface AnalisisSuelo {
  id: string;
  loteId: string;
  fechaAnalisis: string;
  profundidadCm: number;
  densidadGcm3?: number;
  /** Copia del área del lote al registrar el análisis; conserva la trazabilidad histórica. */
  areaM2AlRegistro?: number;
  laboratorio?: string;
  metodoLaboratorio?: string;
  ph?: number;
  nutrientes: NutrienteReportado[];
  /** Estructura reservada de fase 1; solo se lee para compatibilidad. */
  nutrientesMgKg?: Record<string, number>;
  observaciones?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Dato guardado que no cumple el formato esperado. Se informa, no se corrige solo. */
export interface ProblemaDato {
  campo: string;
  etiqueta: string;
  detalle: string;
  valorOriginal: string;
  /** Texto con el que se precarga el formulario para corregirlo (si el original es representable). */
  textoEditable?: string;
}

/** Nutriente leído de IndexedDB: los campos inválidos quedan sin valor y se describen en `problema`. */
export interface NutrienteLeido {
  elemento: string;
  forma: string;
  valor?: number;
  unidad?: UnidadNutriente;
  /** true si la combinación elemento/forma está en el catálogo. */
  reconocido?: boolean;
  /** Dato inválido: suspende los cálculos de este resultado. */
  problema?: string;
  /** Aviso que no afecta el cálculo (p. ej. campos adicionales que se descartarían al guardar). */
  advertencia?: string;
  original?: string;
  /** Valor guardado inválido, como texto, para precargarlo en el formulario. */
  valorTexto?: string;
}

/**
 * Análisis leído y verificado. Un campo `undefined` está ausente o es inválido;
 * `problemas` indica cuáles son inválidos y conserva su valor original.
 */
export interface AnalisisVerificado {
  id: string;
  loteId: string;
  fechaAnalisis?: string;
  profundidadCm?: number;
  densidadGcm3?: number;
  areaM2AlRegistro?: number;
  laboratorio?: string;
  metodoLaboratorio?: string;
  ph?: number;
  nutrientes: NutrienteLeido[];
  observaciones?: string;
  createdAt?: string;
  updatedAt?: string;
  problemas: ProblemaDato[];
  /** Campos de otras versiones que la app no edita; se conservan intactos al guardar. */
  camposAdicionales: string[];
}

/** Estructuras reservadas para siguientes fases. No implican diagnóstico automático. */

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
