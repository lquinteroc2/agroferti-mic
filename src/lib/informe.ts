/**
 * Informe del lote para el productor (fase 5): reúne y calcula, sin escribir nada, lo que muestra la
 * vista imprimible. La recomendación de fertilización es la del plan APROBADO más reciente: sus metas
 * vienen de la fuente técnica del usuario; la app no calcula dosis por su cuenta.
 */
import type {
  AnalisisVerificado,
  Lote,
  PlanVerificado,
  RegistroAplicacion,
  RegistroObservacion,
  RegistroTarea,
  RegistroVerificado
} from '../types';
import {
  calcularPlan,
  equivalenciasAnalisis,
  resumenAplicaciones,
  type CalculoPlan,
  type EquivalenciasAnalisis
} from './calculos.ts';
import { ordenarAnalisis } from './validacion.ts';
import { cambioAprobacion, fechaAprobacion } from './validacionPlan.ts';

/** Topes de lo que se lista en el seguimiento, para que el informe sea corto. */
export const MAX_TAREAS_HECHAS = 5;
export const MAX_OBSERVACIONES = 5;

export interface Recomendacion {
  plan: PlanVerificado;
  /** Fecha local (AAAA-MM-DD) de la aprobación. */
  aprobadoEl?: string;
  aprobadoPor?: string;
  /** Cálculo del plan: cada línea es un fertilizante con su dosis, cantidad, bultos y costo. */
  calculo: CalculoPlan;
  /** Fuentes técnicas distintas de las metas, con su fecha. */
  fuentes: Array<{ fuente: string; fecha: string }>;
  /** Lo aplicado frente al plan (aplicaciones de productos del plan, en orden cronológico). */
  aplicado: ReturnType<typeof resumenAplicaciones<RegistroAplicacion>>;
  /** Aplicaciones de este plan con datos dañados (no se suman). */
  aplicacionesDanadas: number;
}

export interface DatosInforme {
  lote: Lote;
  /** Marca de tiempo ISO de la generación. */
  generado: string;
  analisis?: AnalisisVerificado;
  equivalencias?: EquivalenciasAnalisis;
  totalAnalisis: number;
  recomendacion?: Recomendacion;
  /** Planes aprobados sin datos dañados (si hay más de uno, se muestra el aprobado más recientemente). */
  planesAprobados: number;
  /**
   * Planes aprobados con datos dañados: no se usan para la recomendación y el informe lo dice.
   * `masReciente` indica si alguno se aprobó después del plan que sí se muestra.
   */
  aprobadosDanados: { nombres: string[]; masReciente: boolean };
  tareasPendientes: RegistroTarea[];
  tareasHechas: RegistroTarea[];
  observaciones: RegistroObservacion[];
  /** Registros de seguimiento con datos dañados (no se muestran ni se suman). */
  registrosDanados: number;
  /** Hay datos marcados EJEMPLO (o con EJEMPLO en el nombre del lote): el informe lo advierte. */
  hayEjemplo: boolean;
}

/** Marca de tiempo completa del último paso a aprobado ('' si no la hay), para ordenar sin empates por día. */
const aprobadoA = (p: PlanVerificado) => cambioAprobacion(p)?.fecha ?? '';

function armarRecomendacion(plan: PlanVerificado, registros: ReadonlyArray<RegistroVerificado>): Recomendacion {
  const calculo = calcularPlan(plan);
  const fuentes = new Map<string, { fuente: string; fecha: string }>();
  for (const m of plan.metas) fuentes.set(`${m.fuente}|${m.fechaFuente}`, { fuente: m.fuente, fecha: m.fechaFuente });
  const aplicaciones = registros.flatMap(v => (v.registro?.tipo === 'aplicacion' && v.registro.planId === plan.id ? [v.registro] : []));
  return {
    plan,
    aprobadoEl: fechaAprobacion(plan),
    aprobadoPor: cambioAprobacion(plan)?.responsable,
    calculo,
    fuentes: [...fuentes.values()],
    aplicado: resumenAplicaciones(plan, aplicaciones, calculo),
    aplicacionesDanadas: registros.filter(v => v.tipo === 'aplicacion' && !v.registro && v.planId === plan.id).length
  };
}

/** Reúne los datos del informe. No escribe nada; los registros dañados no se muestran ni se suman, pero se avisan. */
export function armarInforme(
  entrada: { lote: Lote; analisis: ReadonlyArray<AnalisisVerificado>; planes: ReadonlyArray<PlanVerificado>; registros: ReadonlyArray<RegistroVerificado> },
  ahora: Date = new Date()
): DatosInforme {
  const { lote, registros } = entrada;
  const analisis = ordenarAnalisis([...entrada.analisis])[0];
  // Aprobado más recientemente (marca de tiempo completa); desempate por creación más reciente.
  const aprobados = entrada.planes.filter(p => p.estado === 'aprobado')
    .sort((a, b) => aprobadoA(b).localeCompare(aprobadoA(a)) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const sanos = aprobados.filter(p => p.problemas.length === 0);
  const danados = aprobados.filter(p => p.problemas.length > 0);
  const plan = sanos[0];
  const recomendacion = plan && armarRecomendacion(plan, registros);
  const validos = registros.flatMap(v => (v.registro ? [v.registro] : []));
  const tareas = validos.filter((r): r is RegistroTarea => r.tipo === 'tarea');
  const hayEjemplo = /EJEMPLO/i.test(lote.nombre)
    || validos.some(r => r.esEjemplo)
    || !!recomendacion && (recomendacion.plan.metas.some(m => m.esEjemplo) || recomendacion.plan.lineas.some(l => l.producto.esEjemplo));
  return {
    lote,
    generado: ahora.toISOString(),
    analisis,
    equivalencias: analisis && equivalenciasAnalisis(analisis),
    totalAnalisis: entrada.analisis.length,
    recomendacion,
    planesAprobados: sanos.length,
    aprobadosDanados: {
      nombres: danados.map(p => p.nombre || 'Plan sin nombre'),
      masReciente: danados.length > 0 && (!plan || aprobadoA(danados[0]) > aprobadoA(plan))
    },
    tareasPendientes: tareas.filter(t => t.estado === 'pendiente')
      .sort((a, b) => a.fechaPrevista.localeCompare(b.fechaPrevista) || a.createdAt.localeCompare(b.createdAt)),
    tareasHechas: tareas.filter(t => t.estado === 'hecha')
      .sort((a, b) => (b.fechaRealizada ?? '').localeCompare(a.fechaRealizada ?? '') || b.createdAt.localeCompare(a.createdAt))
      .slice(0, MAX_TAREAS_HECHAS),
    observaciones: validos.filter((r): r is RegistroObservacion => r.tipo === 'observacion')
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_OBSERVACIONES),
    registrosDanados: registros.filter(v => !v.registro).length,
    hayEjemplo
  };
}
