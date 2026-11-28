/**
 * Avance de un lote en su cultivo actual: qué pasos de la app ya se hicieron y cuál sigue. Reglas
 * puras a partir de lo registrado. No juzga si el plan es bueno ni si la dosis es adecuada: solo dice
 * qué falta registrar o decidir en la app.
 */
import type { AnalisisVerificado, CicloVerificado, PlanVerificado, RegistroAplicacion, RegistroVerificado } from '../types';
import { calcularPlan, resumenAplicaciones } from './calculos.ts';
import { fechaLegible, formatearDiferencia, pesosResultado } from './formato.ts';
import { datosCultivoActual, ordenarCiclos, verificarCiclo } from './historial.ts';
import { ordenarAnalisis, verificarAnalisis } from './validacion.ts';
import { cambioAprobacion, ordenarPlanes, verificarPlan } from './validacionPlan.ts';
import { ordenarRegistros, tareasPendientesDe, verificarRegistro } from './validacionSeguimiento.ts';

export type IdPaso = 'lote' | 'analisis' | 'plan' | 'aplicar' | 'cosechar';
export type EstadoPaso = 'hecho' | 'actual' | 'pendiente';
export type AccionSiguiente = 'analisis' | 'corregir-analisis' | 'crear-plan' | 'revisar-plan' | 'aprobar-plan' | 'aplicar' | 'cosechar';

export interface PasoLote { id: IdPaso; nombre: string; estado: EstadoPaso }
/**
 * Lo que la vista general dice de cada paso. Un paso sin hacer puede quedar antes del que toca (p. ej.
 * un plan de fuente propia sin análisis), así que no siempre es "Más adelante".
 */
export type EtiquetaPaso = 'Listo' | 'Ahora' | 'En curso' | 'Por corregir' | 'Sin hacer' | 'Más adelante';

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
  /** Una línea con lo registrado en cada paso, para la vista general de la ficha (la del lote la arma la ficha). */
  resumen: Record<Exclude<IdPaso, 'lote'>, string>;
  etiquetas: Record<IdPaso, EtiquetaPaso>;
  /** Aplicaciones del plan aprobado (o todas, si no hay plan aprobado). */
  aplicaciones: { cantidad: number; delPlanAprobado: boolean };
}

const NOMBRES: Record<IdPaso, string> = { lote: 'Lote', analisis: 'Análisis', plan: 'Plan', aplicar: 'Aplicar', cosechar: 'Cosechar' };
const ORDEN: IdPaso[] = ['lote', 'analisis', 'plan', 'aplicar', 'cosechar'];
/** Los pasos de la ficha, en orden. */
export const PASOS_LOTE: ReadonlyArray<IdPaso> = ORDEN;
export const nombrePaso = (id: IdPaso) => NOMBRES[id];
/** Nombre de cada paso con lo que se hace en él, para la vista general de la ficha. */
const TITULOS: Record<IdPaso, string> = {
  lote: 'Registrar el lote', analisis: 'Registrar el análisis de suelo', plan: 'Preparar el plan de fertilización',
  aplicar: 'Aplicar y hacer seguimiento', cosechar: 'Cosechar y cerrar el ciclo'
};
export const tituloPaso = (id: IdPaso) => TITULOS[id];

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Lo aplicado y las tareas pendientes, en una línea. */
function resumenAplicar({ cantidad, delPlanAprobado }: AvanceLote['aplicaciones'], tareas: { pendientes: number; vencidas: number }): string {
  const aplicado = delPlanAprobado
    ? (cantidad ? `${plural(cantidad, 'aplicación', 'aplicaciones')} del plan aprobado` : 'Aún no hay aplicaciones del plan aprobado')
    : (cantidad ? plural(cantidad, 'aplicación registrada', 'aplicaciones registradas') : 'Aún no hay aplicaciones registradas');
  return [
    aplicado,
    tareas.pendientes ? `${plural(tareas.pendientes, 'tarea pendiente', 'tareas pendientes')}${tareas.vencidas ? ` (${tareas.vencidas} con la fecha pasada)` : ''}` : ''
  ].filter(Boolean).join(' · ');
}


/** Cultivos anteriores del lote en el historial. */
const resumenCosechar = (anteriores: number) => anteriores
  ? `${plural(anteriores, 'cultivo anterior', 'cultivos anteriores')} en el historial. Al cosechar, cierra el ciclo.`
  : 'Al cosechar, cierra el ciclo para empezar otro sin perder lo registrado.';

/** Paso de la barra al que corresponde cada acción siguiente. */
const PASO_DE: Record<AccionSiguiente, IdPaso> = {
  analisis: 'analisis', 'corregir-analisis': 'analisis', 'crear-plan': 'plan', 'revisar-plan': 'plan', 'aprobar-plan': 'plan', aplicar: 'aplicar', cosechar: 'cosechar'
};

const nombrePlan = (p: PlanVerificado) => `«${p.nombre || 'Plan sin nombre'}»`;

function costoPlan(p: PlanVerificado): string {
  const total = calcularPlan(p).costoTotalCop;
  return total.ok ? `costo estimado ${pesosResultado(total.valor)}` : 'sin costo total';
}

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

  const validos = datos.analisis.filter(a => a.problemas.length === 0)
    .sort((a, b) => (b.fechaAnalisis ?? '').localeCompare(a.fechaAnalisis ?? ''));
  const ultimo = validos[0];
  const enCursoNuevo = aprobado ? revisado ?? propuesta : undefined;
  const conProblemas = datos.analisis.length - validos.length;
  const tareas = tareasPendientesDe(datos.registros, hoy);
  // Con un plan aprobado, cuentan solo sus aplicaciones (las de un plan anterior no son de este).
  const aplicaciones = {
    cantidad: datos.registros.filter(v => v.registro?.tipo === 'aplicacion' && (!aprobado || v.registro.planId === aprobado.id)).length,
    delPlanAprobado: !!aprobado
  };
  const resumen: AvanceLote['resumen'] = {
    analisis: ultimo
      ? `Análisis del ${fechaLegible(ultimo.fechaAnalisis).toLowerCase()} · ${plural(ultimo.nutrientes.length, 'resultado', 'resultados')}${validos.length > 1 ? ` · ${validos.length} análisis guardados` : ''}${conProblemas ? ` · ${conProblemas} con datos por corregir` : ''}`
      : datos.analisis.length ? 'El análisis guardado tiene datos por corregir' : 'Aún no hay análisis de suelo',
    plan: aprobado
      ? `${nombrePlan(aprobado)} aprobado · ${costoPlan(aprobado)}${enCursoNuevo ? ' · hay un plan nuevo en curso' : ''}`
      : revisado ? `${nombrePlan(revisado)} revisado, falta aprobarlo · ${costoPlan(revisado)}`
      : propuesta ? `${nombrePlan(propuesta)} en propuesta, falta revisarlo · ${costoPlan(propuesta)}`
      : 'Aún no hay plan de fertilización',
    aplicar: resumenAplicar(aplicaciones, tareas),
    cosechar: resumenCosechar(0)
  };

  const hechos: Record<IdPaso, boolean> = {
    lote: true, analisis: hayAnalisis, plan: !!aprobado, aplicar: aplicado === 'completo', cosechar: false
  };
  // Con un plan nuevo en curso, "plan" es el paso actual aunque haya uno aprobado (ver PASO_DE).
  const actual = PASO_DE[siguiente.accion];
  const pasos = ORDEN.map(id => ({ id, nombre: NOMBRES[id], estado: (id === actual ? 'actual' : hechos[id] ? 'hecho' : 'pendiente') as EstadoPaso }));
  const etiqueta = (id: IdPaso): EtiquetaPaso => {
    if (id === actual) return 'Ahora';
    if (hechos[id]) return 'Listo';
    if (id === 'analisis' && datos.analisis.length > 0) return 'Por corregir';
    if (id === 'aplicar' && aprobado) return 'En curso';
    return ORDEN.indexOf(id) < ORDEN.indexOf(actual) ? 'Sin hacer' : 'Más adelante';
  };
  const etiquetas = Object.fromEntries(ORDEN.map(id => [id, etiqueta(id)])) as Record<IdPaso, EtiquetaPaso>;
  return { pasos, siguiente, tareas, resumen, etiquetas, aplicaciones };
}

/** Paso en que va el lote (el del siguiente paso): en la vista general dice "Ahora". */
export const pasoActual = (avance: AvanceLote): IdPaso => PASO_DE[avance.siguiente.accion];

/** Número del paso (1 a 5) y los pasos vecinos, para "Paso 2 de 5" y los botones anterior y siguiente. */
export function posicionPaso(id: IdPaso): { numero: number; total: number; anterior?: IdPaso; siguiente?: IdPaso } {
  const i = ORDEN.indexOf(id);
  return { numero: i + 1, total: ORDEN.length, anterior: ORDEN[i - 1], siguiente: ORDEN[i + 1] };
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
    const avance = avanceLote(actual, hoy);
    const tareas = tareasPendientesDe(registros.get(id) ?? [], hoy);
    const anteriores = (ciclos.get(id) ?? []).filter(c => c.problemas.length === 0).length;
    resultado.set(id, { ...avance, tareas, resumen: { ...avance.resumen, aplicar: resumenAplicar(avance.aplicaciones, tareas), cosechar: resumenCosechar(anteriores) } });
  }
  return resultado;
}
