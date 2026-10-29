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
  avancePlan,
  calcularPlan,
  costoRegistrado,
  equivalenciasAnalisis,
  type AvanceLinea,
  type CalculoPlan,
  type Calculo,
  type EquivalenciasAnalisis
} from './calculos.ts';
import { ordenarAnalisis } from './validacion.ts';
import { fechaAprobacion, ordenarPlanes } from './validacionPlan.ts';

/** Topes de lo que se lista en el seguimiento, para que el informe sea corto. */
export const MAX_TAREAS_HECHAS = 5;
export const MAX_OBSERVACIONES = 5;

/** Una fila de la tabla de recomendación: qué producto, para qué nutriente y cuánto. */
export interface FilaRecomendacion {
  producto: string;
  esEjemplo: boolean;
  /** "Fósforo (P₂O₅)". */
  para: string;
  /** Kg de producto por hectárea; falta si la línea no se pudo calcular. */
  dosisKgHa?: number;
  kgLote: Calculo<number>;
  presentacionKg?: number;
  bultos: Calculo<number>;
  costoCop: Calculo<number>;
  /** Motivo si la línea no se pudo calcular. */
  sinCalculo?: string;
}

export interface Recomendacion {
  plan: PlanVerificado;
  /** Fecha local (AAAA-MM-DD) de la aprobación. */
  aprobadoEl?: string;
  aprobadoPor?: string;
  calculo: CalculoPlan;
  filas: FilaRecomendacion[];
  /** Fuentes técnicas distintas de las metas, con su fecha. */
  fuentes: Array<{ fuente: string; fecha: string }>;
  avance: AvanceLinea<RegistroAplicacion>[];
  costoAplicado: ReturnType<typeof costoRegistrado>;
}

export interface DatosInforme {
  lote: Lote;
  /** Marca de tiempo ISO de la generación. */
  generado: string;
  analisis?: AnalisisVerificado;
  equivalencias?: EquivalenciasAnalisis;
  totalAnalisis: number;
  recomendacion?: Recomendacion;
  /** Planes aprobados sin datos dañados (si hay más de uno, se muestra el más reciente). */
  planesAprobados: number;
  tareasPendientes: RegistroTarea[];
  tareasHechas: RegistroTarea[];
  observaciones: RegistroObservacion[];
  /** Registros de seguimiento con datos dañados (no se muestran ni se suman). */
  registrosDanados: number;
  /** Hay datos marcados EJEMPLO (o con EJEMPLO en el nombre del lote): el informe lo advierte. */
  hayEjemplo: boolean;
}

/** Plan aprobado más reciente, sin datos dañados. Desempate por creación (ordenarPlanes). */
function planAprobado(planes: ReadonlyArray<PlanVerificado>): { plan?: PlanVerificado; total: number } {
  const aprobados = ordenarPlanes(planes.filter(p => p.estado === 'aprobado' && p.problemas.length === 0));
  const masReciente = [...aprobados].sort((a, b) => (fechaAprobacion(b) ?? '').localeCompare(fechaAprobacion(a) ?? ''))[0];
  return { plan: masReciente, total: aprobados.length };
}

function armarRecomendacion(plan: PlanVerificado, aplicaciones: ReadonlyArray<RegistroAplicacion>): Recomendacion {
  const calculo = calcularPlan(plan);
  const aprobacion = [...plan.historial].reverse().find(c => c.estado === 'aprobado');
  const filas = calculo.lineas.map((r): FilaRecomendacion => {
    const p = r.linea.producto;
    const base = {
      producto: p.nombre,
      esEjemplo: p.esEjemplo,
      para: r.meta ? `${r.meta.elemento} (${r.meta.forma})` : 'Meta no disponible',
      presentacionKg: p.presentacionKg
    };
    if (r.estado === 'calculada') {
      return { ...base, dosisKgHa: r.productoKgHa, kgLote: r.productoKgLote, bultos: r.bultos, costoCop: r.costoCop };
    }
    const falta: Calculo<number> = { ok: false, motivo: 'dato-invalido', mensaje: r.mensaje };
    return { ...base, kgLote: falta, bultos: falta, costoCop: falta, sinCalculo: r.mensaje };
  });
  const fuentes = new Map<string, { fuente: string; fecha: string }>();
  for (const m of plan.metas) fuentes.set(`${m.fuente}|${m.fechaFuente}`, { fuente: m.fuente, fecha: m.fechaFuente });
  const ordenadas = [...aplicaciones].sort((x, y) => x.fecha.localeCompare(y.fecha) || x.createdAt.localeCompare(y.createdAt));
  const avance = avancePlan(plan, ordenadas, calculo);
  return {
    plan,
    aprobadoEl: fechaAprobacion(plan),
    aprobadoPor: aprobacion?.responsable,
    calculo,
    filas,
    fuentes: [...fuentes.values()],
    avance,
    // Solo cuentan las aplicaciones de productos del plan (las demás no se suman, como en la pantalla).
    costoAplicado: costoRegistrado(avance.flatMap(a => a.aplicaciones))
  };
}

/** Reúne los datos del informe. No escribe nada; los registros dañados no se muestran ni se suman. */
export function armarInforme(
  entrada: { lote: Lote; analisis: ReadonlyArray<AnalisisVerificado>; planes: ReadonlyArray<PlanVerificado>; registros: ReadonlyArray<RegistroVerificado> },
  ahora: Date = new Date()
): DatosInforme {
  const { lote } = entrada;
  const analisis = ordenarAnalisis([...entrada.analisis])[0];
  const { plan, total } = planAprobado(entrada.planes);
  const validos = entrada.registros.flatMap(v => (v.registro ? [v.registro] : []));
  const aplicaciones = validos.filter((r): r is RegistroAplicacion => r.tipo === 'aplicacion' && r.planId === plan?.id);
  const tareas = validos.filter((r): r is RegistroTarea => r.tipo === 'tarea');
  const recomendacion = plan && armarRecomendacion(plan, aplicaciones);
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
    planesAprobados: total,
    tareasPendientes: tareas.filter(t => t.estado === 'pendiente').sort((a, b) => a.fechaPrevista.localeCompare(b.fechaPrevista)),
    tareasHechas: tareas.filter(t => t.estado === 'hecha')
      .sort((a, b) => (b.fechaRealizada ?? '').localeCompare(a.fechaRealizada ?? '')).slice(0, MAX_TAREAS_HECHAS),
    observaciones: validos.filter((r): r is RegistroObservacion => r.tipo === 'observacion')
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_OBSERVACIONES),
    registrosDanados: entrada.registros.filter(v => !v.registro).length,
    hayEjemplo
  };
}
