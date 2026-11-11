/**
 * Historial del lote: ciclos de cultivo cerrados y agrupación por fechas de los análisis, planes y
 * registros. Funciones PURAS: no escriben nada ni cambian los registros que agrupan.
 */
import { CULTIVOS, MOTIVOS_CIERRE, type AnalisisVerificado, type CicloCultivo, type CicloVerificado, type Cultivo, type MotivoCierre, type PlanVerificado, type ProblemaDato, type RegistroVerificado } from '../types.ts';
import { describirValor, esObjeto, fechaLocalISO, validarFecha } from './validacion.ts';
import { lector, type ResultadoValidacion } from './validacionPlan.ts';

export const MAX_NOTAS_CICLO = 500;

const esCultivo = (v: unknown): v is Cultivo => CULTIVOS.some(c => c.value === v);
const esMotivo = (v: unknown): v is MotivoCierre => MOTIVOS_CIERRE.some(m => m.value === v);

/** Verifica un ciclo leído de IndexedDB sin lanzar errores ni modificarlo. */
export function verificarCiclo(registro: unknown): CicloVerificado {
  try {
    const problemas: ProblemaDato[] = [];
    const r = esObjeto(registro) ? registro : {};
    if (r !== registro) {
      problemas.push({ campo: 'ciclo', etiqueta: 'Ciclo', detalle: 'El ciclo guardado no tiene la estructura esperada.', valorOriginal: describirValor(registro) });
    }
    const l = lector(r, problemas);
    const id = typeof r.id === 'string' ? r.id : '';
    const loteId = typeof r.loteId === 'string' ? r.loteId : '';
    if (!id) l.nota('id', 'Identificador', 'El ciclo no tiene identificador.');
    if (!loteId) l.nota('loteId', 'Lote', 'El ciclo no indica a qué lote pertenece.');
    const cultivo = esCultivo(r.cultivo) ? r.cultivo : undefined;
    if (!cultivo) l.nota('cultivo', 'Cultivo', 'No es un cultivo de la lista.');
    const fechaSiembra = l.fecha('fechaSiembra', 'Fecha de siembra');
    const fechaCierre = l.fecha('fechaCierre', 'Fecha de cierre', true);
    if (fechaSiembra && fechaCierre && fechaSiembra > fechaCierre) l.nota('fechaSiembra', 'Fecha de siembra', 'Es posterior a la fecha de cierre.');
    const areaM2 = l.numero('areaM2', 'Área del lote (m²)', { requerido: true, positivo: true });
    const motivo = esMotivo(r.motivo) ? r.motivo : undefined;
    if (!motivo) l.nota('motivo', 'Cómo terminó', 'No es cosechado, perdido ni otro.');
    const notas = l.texto('notas', 'Resultado y notas');
    if (notas && notas.length > MAX_NOTAS_CICLO) l.nota('notas', 'Resultado y notas', `Tiene más de ${MAX_NOTAS_CICLO} caracteres.`);
    const esEjemplo = l.booleano('esEjemplo', 'Dato de EJEMPLO');
    const ciclo: CicloCultivo | undefined = problemas.length === 0 ? {
      id, loteId, cultivo: cultivo!, fechaSiembra, fechaCierre: fechaCierre!, areaM2: areaM2!, motivo: motivo!, notas, esEjemplo: esEjemplo!,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
      updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : ''
    } : undefined;
    return { id, loteId, ciclo, fechaCierre, problemas };
  } catch {
    return { id: '', loteId: '', problemas: [{ campo: 'ciclo', etiqueta: 'Ciclo', detalle: 'No se pudo leer el ciclo guardado.', valorOriginal: describirValor(registro) }] };
  }
}

/** Más reciente primero por fecha de cierre; desempate por id. Sin fecha válida, al final. */
export function ordenarCiclos(lista: CicloVerificado[]): CicloVerificado[] {
  return [...lista].sort((a, b) =>
    Number(!a.fechaCierre) - Number(!b.fechaCierre)
    || (b.fechaCierre ?? '').localeCompare(a.fechaCierre ?? '')
    || a.id.localeCompare(b.id));
}

/** Lo que se escribe al cerrar un ciclo. El cultivo, la siembra y el área cerrados salen del lote. */
export interface DatosCierre {
  fechaCierre: string;
  motivo: MotivoCierre;
  notas?: string;
  esEjemplo: boolean;
  /** Cultivo con el que sigue el lote (puede repetirse). */
  nuevoCultivo: Cultivo;
  nuevaFechaSiembra?: string;
}

export interface ContextoCierre {
  /** Siembra del ciclo que se cierra (la del lote). */
  fechaSiembraActual?: string;
  /** Cierre más reciente de los ciclos anteriores del lote. */
  ultimoCierre?: string;
  hoy?: Date;
}

/**
 * Última barrera antes de cerrar un ciclo: estructura, fechas no futuras y en orden (siembra ≤
 * cierre, después del último cierre; la nueva siembra no antes del cierre). Nunca lanza errores.
 */
export function validarDatosCierre(datos: unknown, { fechaSiembraActual, ultimoCierre, hoy = new Date() }: ContextoCierre = {}): ResultadoValidacion<DatosCierre> {
  try {
    if (!esObjeto(datos)) return { ok: false, errores: ['Los datos del cierre no tienen la estructura esperada.'] };
    const problemas: ProblemaDato[] = [];
    const l = lector(datos, problemas);
    const fechaCierre = l.fecha('fechaCierre', 'Fecha de cierre', true);
    const motivo = esMotivo(datos.motivo) ? datos.motivo : undefined;
    if (!motivo) l.nota('motivo', 'Cómo terminó', 'Elige cómo terminó el cultivo.');
    const notas = l.texto('notas', 'Resultado y notas');
    if (notas && notas.length > MAX_NOTAS_CICLO) l.nota('notas', 'Resultado y notas', `Tiene más de ${MAX_NOTAS_CICLO} caracteres.`);
    const esEjemplo = l.booleano('esEjemplo', 'Dato de EJEMPLO');
    const nuevoCultivo = esCultivo(datos.nuevoCultivo) ? datos.nuevoCultivo : undefined;
    if (!nuevoCultivo) l.nota('nuevoCultivo', 'Nuevo cultivo', 'No es un cultivo de la lista.');
    const nuevaFechaSiembra = l.fecha('nuevaFechaSiembra', 'Siembra del nuevo cultivo');
    const errores = problemas.map(p => `${p.etiqueta}: ${p.detalle}`);
    if (fechaCierre) {
      if (fechaCierre > fechaLocalISO(hoy)) errores.push('Fecha de cierre: no puede ser una fecha futura.');
      if (fechaSiembraActual && fechaCierre < fechaSiembraActual) errores.push('Fecha de cierre: no puede ser anterior a la siembra del cultivo que se cierra.');
      if (ultimoCierre && fechaCierre < ultimoCierre) errores.push('Fecha de cierre: no puede ser anterior al cierre del ciclo anterior.');
      if (nuevaFechaSiembra && nuevaFechaSiembra < fechaCierre) errores.push('Siembra del nuevo cultivo: no puede ser anterior a la fecha de cierre.');
    }
    if (errores.length || !fechaCierre || !motivo || esEjemplo === undefined || !nuevoCultivo) return { ok: false, errores };
    return { ok: true, datos: { fechaCierre, motivo, notas, esEjemplo, nuevoCultivo, nuevaFechaSiembra } };
  } catch {
    return { ok: false, errores: ['Los datos del cierre no tienen la estructura esperada.'] };
  }
}

// ---- Formulario de cierre: texto tal como lo escribe el usuario ----

export interface EntradaCierre {
  fechaCierre: string;
  motivo: '' | MotivoCierre;
  notas: string;
  origen: '' | 'real' | 'ejemplo';
  nuevoCultivo: Cultivo;
  nuevaFechaSiembra: string;
}

export type ErroresCierre = Partial<Record<keyof EntradaCierre, string>> & { general?: string[] };

export function validarCierreFormulario(entrada: EntradaCierre, contexto: ContextoCierre): { ok: true; datos: DatosCierre } | { ok: false; errores: ErroresCierre } {
  const errores: ErroresCierre = {};
  const hoy = contexto.hoy ?? new Date();
  const cierre = entrada.fechaCierre.trim() ? validarFecha(entrada.fechaCierre, 'Fecha de cierre', hoy) : { ok: false as const, error: 'Fecha de cierre: es obligatoria.' };
  if (!cierre.ok) errores.fechaCierre = cierre.error;
  if (!entrada.motivo) errores.motivo = 'Indica cómo terminó el cultivo.';
  if (entrada.notas.trim().length > MAX_NOTAS_CICLO) errores.notas = `Resultado y notas: tiene más de ${MAX_NOTAS_CICLO} caracteres.`;
  if (!entrada.origen) errores.origen = 'Indica si es un dato real o de EJEMPLO.';
  const siembra = entrada.nuevaFechaSiembra.trim() ? validarFecha(entrada.nuevaFechaSiembra, 'Siembra del nuevo cultivo') : undefined;
  if (siembra && !siembra.ok) errores.nuevaFechaSiembra = siembra.error;
  if (Object.keys(errores).length) return { ok: false, errores };
  const final = validarDatosCierre({
    fechaCierre: entrada.fechaCierre.trim(),
    motivo: entrada.motivo,
    notas: entrada.notas.trim() || undefined,
    esEjemplo: entrada.origen === 'ejemplo',
    nuevoCultivo: entrada.nuevoCultivo,
    nuevaFechaSiembra: entrada.nuevaFechaSiembra.trim() || undefined
  }, { ...contexto, hoy });
  return final.ok ? final : { ok: false, errores: { general: final.errores } };
}

// ---- Agrupación por ciclos ----

export interface PeriodoHistorial {
  /** Ciclo cerrado; falta en el periodo del cultivo actual del lote. */
  ciclo?: CicloCultivo;
  /** Cierre del ciclo anterior: el periodo empieza el día siguiente. */
  desdeCierre?: string;
  analisis: AnalisisVerificado[];
  planes: PlanVerificado[];
  registros: RegistroVerificado[];
}

export interface HistorialLote {
  /** Primero el cultivo actual; luego los ciclos cerrados, del más reciente al más antiguo. */
  periodos: PeriodoHistorial[];
  /** Registros sin fecha válida: no se pueden ubicar en un ciclo. */
  sinFecha: { analisis: AnalisisVerificado[]; planes: PlanVerificado[]; registros: RegistroVerificado[] };
}

/** Día local en que se creó un plan, si la marca de tiempo es válida. */
export function fechaPlan(plan: Pick<PlanVerificado, 'createdAt'>): string | undefined {
  if (!plan.createdAt) return undefined;
  const fecha = new Date(plan.createdAt);
  return Number.isNaN(fecha.getTime()) ? undefined : fechaLocalISO(fecha);
}

/**
 * Ubica cada análisis (fecha del análisis), plan (día de creación) y registro (fecha, o fecha
 * prevista de una tarea) en el ciclo cuyo periodo contiene su fecha: desde el día siguiente al
 * cierre anterior hasta su cierre, inclusive. Lo posterior al último cierre es del cultivo actual.
 * Los ciclos con datos dañados no agrupan nada. Ningún registro se repite ni se pierde.
 */
export function agruparHistorial(datos: {
  ciclos: CicloVerificado[];
  analisis: AnalisisVerificado[];
  planes: PlanVerificado[];
  registros: RegistroVerificado[];
}): HistorialLote {
  const cerrados = datos.ciclos.flatMap(v => v.ciclo ? [v.ciclo] : [])
    .sort((a, b) => a.fechaCierre.localeCompare(b.fechaCierre) || a.id.localeCompare(b.id));
  const periodos: PeriodoHistorial[] = cerrados.map((ciclo, i) => ({ ciclo, desdeCierre: cerrados[i - 1]?.fechaCierre, analisis: [], planes: [], registros: [] }));
  const actual: PeriodoHistorial = { desdeCierre: cerrados.at(-1)?.fechaCierre, analisis: [], planes: [], registros: [] };
  const sinFecha: HistorialLote['sinFecha'] = { analisis: [], planes: [], registros: [] };
  const periodoDe = (fecha: string) => periodos.find(p => fecha <= p.ciclo!.fechaCierre) ?? actual;
  for (const a of datos.analisis) (a.fechaAnalisis ? periodoDe(a.fechaAnalisis).analisis : sinFecha.analisis).push(a);
  for (const p of datos.planes) {
    const fecha = fechaPlan(p);
    (fecha ? periodoDe(fecha).planes : sinFecha.planes).push(p);
  }
  for (const r of datos.registros) (r.fechaOrden ? periodoDe(r.fechaOrden).registros : sinFecha.registros).push(r);
  return { periodos: [actual, ...periodos.reverse()], sinFecha };
}

/** Días entre la siembra y el cierre (ambas AAAA-MM-DD válidas), o undefined. */
export function duracionDias(fechaSiembra: string | undefined, fechaCierre: string): number | undefined {
  if (!fechaSiembra) return undefined;
  const dias = Math.round((Date.parse(`${fechaCierre}T12:00:00Z`) - Date.parse(`${fechaSiembra}T12:00:00Z`)) / 86_400_000);
  return Number.isFinite(dias) && dias >= 0 ? dias : undefined;
}
