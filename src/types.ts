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

/** Contenido declarado en la etiqueta: porcentaje en masa de una forma química (p. ej. P₂O₅ 46 %). */
export interface ContenidoDeclarado {
  elemento: string;
  forma: string;
  porcentaje: number;
}

/** Fertilizante del catálogo (fase 3), común a todos los lotes, tal como lo declara su etiqueta. */
export interface ProductoFertilizante {
  id: string;
  nombre: string;
  contenido: ContenidoDeclarado[];
  /** Kg de una presentación (bulto). */
  presentacionKg?: number;
  /** Precio de una presentación en COP; exige kg de la presentación y fecha del precio. */
  precioPresentacionCop?: number;
  fechaPrecio?: string;
  /** Dato ficticio: la interfaz debe mostrar "EJEMPLO". */
  esEjemplo: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Producto leído y verificado. `producto` falta si el registro tiene datos dañados. */
export interface ProductoVerificado {
  id: string;
  nombre: string;
  producto?: ProductoFertilizante;
  problemas: ProblemaDato[];
  camposAdicionales: string[];
}

/** Copia del producto dentro del plan: editar o borrar el producto del catálogo no altera el plan. */
export type CopiaProducto = Omit<ProductoFertilizante, 'id' | 'createdAt' | 'updatedAt'> & { productoId: string };

/** Meta escrita por el usuario y respaldada por una fuente técnica. La app no la calcula ni la sugiere. */
export interface MetaNutrimental {
  id: string;
  elemento: string;
  forma: string;
  kgHa: number;
  fuente: string;
  fechaFuente: string;
  esEjemplo: boolean;
}

/** Un producto elegido para cubrir una meta. Cada meta tiene como máximo una línea. */
export interface LineaPlan {
  id: string;
  metaId: string;
  producto: CopiaProducto;
}

/** Lo aplicado no es un estado del plan: se registra en la fase 4 como aplicaciones vinculadas. */
export type EstadoPlan = 'propuesta' | 'revisado' | 'aprobado';

export interface CambioEstadoPlan {
  estado: EstadoPlan;
  /** Fecha y hora ISO del cambio. */
  fecha: string;
  /** Nombre escrito por el usuario; la app no verifica identidades ni certifica aprobaciones técnicas. */
  responsable?: string;
  nota?: string;
}

export interface PlanFertilizacion {
  id: string;
  loteId: string;
  nombre: string;
  /** Copia del área del lote al crear el plan; conserva la trazabilidad como en los análisis. */
  areaM2AlCrear: number;
  /** Solo contexto: el análisis de suelo no entra en ningún cálculo del plan. */
  analisisReferenciaId?: string;
  /** Plan del que se copió (p. ej. para cambiar uno aprobado). */
  planOrigenId?: string;
  metas: MetaNutrimental[];
  lineas: LineaPlan[];
  estado: EstadoPlan;
  historial: CambioEstadoPlan[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Plan leído y verificado. Las metas y líneas dañadas se excluyen y se describen en `problemas`;
 * un plan con problemas solo se consulta (no se edita, no cambia de estado ni se copia).
 */
export interface PlanVerificado {
  id: string;
  loteId: string;
  nombre?: string;
  areaM2AlCrear?: number;
  analisisReferenciaId?: string;
  planOrigenId?: string;
  metas: MetaNutrimental[];
  lineas: LineaPlan[];
  estado?: EstadoPlan;
  historial: CambioEstadoPlan[];
  createdAt?: string;
  updatedAt?: string;
  problemas: ProblemaDato[];
  camposAdicionales: string[];
}

/** Estructura reservada para la fase 4 (monitoreo). */
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
