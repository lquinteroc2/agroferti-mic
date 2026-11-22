/**
 * Avance de un lote en su cultivo actual: qué pasos de la app ya se hicieron y cuál sigue. Reglas
 * puras a partir de lo registrado. No juzga si el plan es bueno ni si la dosis es adecuada: solo dice
 * qué falta registrar o decidir en la app.
 */
import type { AnalisisVerificado, CicloVerificado, PlanVerificado, RegistroAplicacion, RegistroVerificado } from '../types';
import { resumenAplicaciones } from './calculos.ts';
import { formatearDiferencia } from './formato.ts';
import { datosCultivoActual, ordenarCiclos, verificarCiclo } from './historial.ts';
import { ordenarAnalisis, verificarAnalisis } from './validacion.ts';
import { cambioAprobacion, ordenarPlanes, verificarPlan } from './validacionPlan.ts';
import { ordenarRegistros, tareasPendientesDe, verificarRegistro } from './validacionSeguimiento.ts';

export type IdPaso = 'lote' | 'analisis' | 'plan' | 'aplicar' | 'cosechar';
export type EstadoPaso = 'hecho' | 'actual' | 'pendiente';
export type AccionSiguiente = 'analisis' | 'corregir-analisis' | 'crear-plan' | 'revisar-plan' | 'aprobar-plan' | 'aplicar' | 'cosechar';

export interface PasoLote { id: IdPaso; nombre: string; estado: EstadoPaso }

export interface AvanceLote {
  pasos: PasoLote[];
  siguiente: {
    accion: AccionSiguiente;
    /** Frase corta para la tarjeta del lote en Mis lotes. */
    corto: string;
    /** Explicación para la ficha del lote. */
    texto: string;
  };
  tareas: { pendientes: number; vencidas: number };
}

const NOMBRES: Record<IdPaso, string> = { lote: 'Lote', analisis: 'Análisis', plan: 'Plan', aplicar: 'Aplicar', cosechar: 'Cosechar' };
const ORDEN: IdPaso[] = ['lote', 'analisis', 'plan', 'aplicar', 'cosechar'];

/** Paso de la barra al que corresponde cada acción siguiente. */
const PASO_DE: Record<AccionSiguiente, IdPaso> = {
  analisis: 'analisis', 'corregir-analisis': 'analisis', 'crear-plan': 'plan', 'revisar-plan': 'plan', 'aprobar-plan': 'plan', aplicar: 'aplicar', cosechar: 'cosechar'
};

const nombrePlan = (p: PlanVerificado) => `«${p.nombre || 'Plan sin nombre'}»`;

/** Aplicado frente al plan: 'nada', 'parcial' o 'completo' (todas las líneas con lo planeado o más). */
function estadoAplicado(plan: PlanVerificado, registros: ReadonlyArray<RegistroVerificado>): 'nada' | 'parcial' | 'completo' {
  const aplicaciones = registros.flatMap(v => (v.registro?.tipo === 'aplicacion' && v.registro.planId === plan.id ? [v.registro as RegistroAplicacion] : []));
  const { avance, delPlan } = resumenAplicaciones(plan, aplicaciones);
  if (delPlan.length === 0) return 'nada';
  // Se compara con lo que se muestra (2 decimales), para que "completo" coincida con "Se aplicó exactamente lo
  // planeado". Las líneas que no se pueden comparar (sin cantidad planeada calculada) no bloquean el avance.
  const comparables = avance.filter(a => a.diferenciaKg?.ok === true);
  const completo = comparables.length > 0 && comparables.every(a => a.diferenciaKg?.ok === true && formatearDiferencia(a.diferenciaKg.valor).signo >= 0);
  return completo ? 'completo' : 'parcial';
}

/**
 * Avance del lote con lo registrado en su cultivo actual (lo que da `datosCultivoActual`). Un plan
 * aprobado puede venir de una fuente propia sin análisis: entonces el análisis no bloquea el avance.
 */
export function avanceLote(
  datos: { analisis: ReadonlyArray<AnalisisVerificado>; planes: ReadonlyArray<PlanVerificado>; registros: ReadonlyArray<RegistroVerificado> },
  hoy: Date = new Date()
): AvanceLote {
  const hayAnalisis = datos.analisis.some(a => a.problemas.length === 0);
  const sanos = ordenarPlanes(datos.planes.filter(p => p.problemas.length === 0 && p.id));
  const aprobados = sanos.filter(p => p.estado === 'aprobado')
    .sort((a, b) => (cambioAprobacion(b)?.fecha ?? '').localeCompare(cambioAprobacion(a)?.fecha ?? ''));
  const aprobado = aprobados[0];
  // Con un plan aprobado, solo cuentan las propuestas o revisiones creadas después de esa aprobación
  // (p. ej. la copia que se hace para cambiar el plan): son el paso que sigue.
  const despuesDe = aprobado ? cambioAprobacion(aprobado)?.fecha ?? '' : '';
  const enCurso = sanos.filter(p => !aprobado || (p.createdAt ?? '') > despuesDe);
  const revisado = enCurso.find(p => p.estado === 'revisado');
  const propuesta = enCurso.find(p => p.estado === 'propuesta');
  const aplicado = aprobado ? estadoAplicado(aprobado, datos.registros) : 'nada';

  let siguiente: AvanceLote['siguiente'];
  if (aprobado && revisado) {
    siguiente = { accion: 'aprobar-plan', corto: 'Plan nuevo por aprobar', texto: `El plan ${nombrePlan(revisado)} ya se revisó. Si reemplaza al plan aprobado ${nombrePlan(aprobado)}, apruébalo al final del plan.` };
  } else if (aprobado && propuesta) {
    siguiente = { accion: 'revisar-plan', corto: 'Plan nuevo por revisar', texto: `El plan ${nombrePlan(propuesta)} está en propuesta y reemplazaría al aprobado ${nombrePlan(aprobado)}. Pídele a tu asistente técnico que lo revise; mientras tanto, el plan aprobado sigue siendo el que vale.` };
  } else if (aprobado && aplicado === 'completo') {
    siguiente = { accion: 'cosechar', corto: 'Al día: al cosechar, cierra el ciclo', texto: `Ya registraste todo lo del plan ${nombrePlan(aprobado)}. Sigue anotando observaciones y tareas; cuando coseches, cierra el ciclo en el historial del lote.` };
  } else if (aprobado) {
    siguiente = aplicado === 'nada'
      ? { accion: 'aplicar', corto: 'Registra lo que apliques', texto: `El plan ${nombrePlan(aprobado)} está aprobado. Cada vez que apliques un producto, regístralo para compararlo con el plan.` }
      : { accion: 'aplicar', corto: 'Falta aplicar parte del plan', texto: `Falta aplicar parte del plan ${nombrePlan(aprobado)}. Registra cada aplicación cuando la hagas.` };
  } else if (revisado) {
    siguiente = { accion: 'aprobar-plan', corto: 'Plan por aprobar', texto: `El plan ${nombrePlan(revisado)} ya se revisó. Si es el que vas a aplicar, apruébalo al final del plan.` };
  } else if (propuesta) {
    siguiente = { accion: 'revisar-plan', corto: 'Plan por revisar', texto: `El plan ${nombrePlan(propuesta)} está en propuesta. Pídele a tu asistente técnico, o a quien conoce el cultivo, que lo revise; después márcalo como revisado al final del plan.` };
  } else if (!hayAnalisis && datos.analisis.length > 0) {
    siguiente = { accion: 'corregir-analisis', corto: 'Análisis por corregir', texto: 'El análisis de suelo guardado tiene datos por corregir. Corrígelo para que la app te proponga las metas del plan.' };
  } else if (!hayAnalisis) {
    siguiente = { accion: 'analisis', corto: 'Falta el análisis de suelo', texto: 'Registra el análisis de suelo del lote. Con él, la app te propone las metas del plan de fertilización.' };
  } else {
    siguiente = { accion: 'crear-plan', corto: 'Falta el plan de fertilización', texto: 'Crea la propuesta de plan: la app te propone las metas según tu análisis y te sugiere fertilizantes con registro ICA.' };
  }

  const hechos: Record<IdPaso, boolean> = {
    lote: true, analisis: hayAnalisis, plan: !!aprobado, aplicar: aplicado === 'completo', cosechar: false
  };
  // Con un plan nuevo en curso, "plan" es el paso actual aunque haya uno aprobado (ver PASO_DE).
  const actual = PASO_DE[siguiente.accion];
  const pasos = ORDEN.map(id => ({ id, nombre: NOMBRES[id], estado: (id === actual ? 'actual' : hechos[id] ? 'hecho' : 'pendiente') as EstadoPaso }));
  return { pasos, siguiente, tareas: tareasPendientesDe(datos.registros, hoy) };
}

/**
 * Avance de cada lote a partir de las tablas completas (sin verificar), con lo registrado en su
 * cultivo actual. Los registros de lotes que no están en `loteIds` se ignoran.
 */
export function avancesPorLote(
  loteIds: ReadonlyArray<string>,
  crudos: { analisis: ReadonlyArray<unknown>; planes: ReadonlyArray<unknown>; registros: ReadonlyArray<unknown>; ciclos: ReadonlyArray<unknown> },
  hoy: Date = new Date()
): Map<string, AvanceLote> {
  const porLote = <T extends { loteId: string }>(lista: T[]) => {
    const mapa = new Map<string, T[]>();
    for (const x of lista) mapa.set(x.loteId, [...(mapa.get(x.loteId) ?? []), x]);
    return mapa;
  };
  const analisis = porLote(crudos.analisis.map(verificarAnalisis));
  const planes = porLote(crudos.planes.map(verificarPlan));
  const registros = porLote(crudos.registros.map(verificarRegistro));
  const ciclos = porLote<CicloVerificado>(crudos.ciclos.map(c => verificarCiclo(c, { hoy })));
  const resultado = new Map<string, AvanceLote>();
  for (const id of loteIds) {
    const actual = datosCultivoActual({
      ciclos: ordenarCiclos(ciclos.get(id) ?? []),
      analisis: ordenarAnalisis(analisis.get(id) ?? []),
      planes: ordenarPlanes(planes.get(id) ?? []),
      registros: ordenarRegistros(registros.get(id) ?? [])
    });
    // Las tareas pendientes se cuentan en todo el lote: una tarea vencida de antes del último cierre
    // sigue pendiente en Seguimiento y en el total de Mis lotes.
    resultado.set(id, { ...avanceLote(actual, hoy), tareas: tareasPendientesDe(registros.get(id) ?? [], hoy) });
  }
  return resultado;
}
