/**
 * Sugerencia de metas nutricionales a partir del análisis de suelo y de las reglas de referencia
 * guardadas en la nube (cada una con su fuente publicada). Reglas puras.
 *
 * Solo se sugiere cuando coinciden el cultivo, la región (si la regla tiene región), el nutriente,
 * la forma química, la unidad y el método de laboratorio de la regla. Si algo no coincide, no se
 * sugiere nada y se explica por qué. La sugerencia es un rango: el usuario decide el valor.
 */
import type { AnalisisVerificado } from '../types.ts';
import type { NivelSuelo, ReglaDosis } from './referencias.ts';

export interface Sugerencia {
  forma: string;
  minKgHa: number;
  maxKgHa: number;
  regla: ReglaDosis;
  /** Por qué aplica esta regla (p. ej. "P (Bray II) = 35 mg/kg, menos de 40"). */
  motivo: string;
}

export interface ResultadoSugerencias {
  sugerencias: Sugerencia[];
  /** Reglas del cultivo que no se pudieron usar, con el motivo (para explicarlo al usuario). */
  noAplican: Array<{ regla: ReglaDosis; motivo: string }>;
  /** Regiones que distinguen las reglas del cultivo (el usuario elige una). */
  regiones: string[];
}

/** Compara textos sin tildes, mayúsculas ni espacios extra (p. ej. "Bray II" en "Bray-II, acetato"). */
const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s-]+/g, ' ').trim();

/** Forma química del nutriente que mide la condición (P y K se reportan como elemento en el análisis). */
const FORMA_ANALISIS: Record<string, string[]> = { P: ['P'], K: ['K', 'K⁺'], Ca: ['Ca', 'Ca²⁺'], Mg: ['Mg', 'Mg²⁺'], N: ['N'] };

const rangoTexto = (min: number | null, max: number | null) =>
  min !== null && max !== null ? `entre ${min} y ${max}` : min !== null ? `${min} o más` : max !== null ? `menos de ${max}` : 'cualquier valor';

function enRango(valor: number, min: number | null, max: number | null): boolean {
  // Mínimo incluido y máximo excluido: así los rangos contiguos de una tabla (< 40, 40-60, > 60) no se solapan.
  return (min === null || valor >= min) && (max === null || valor < max);
}

/** Valor del análisis para una condición (nutriente, unidad y método), o el motivo por el que no hay. */
function valorDelAnalisis(analisis: AnalisisVerificado, regla: ReglaDosis): { valor: number } | { motivo: string } {
  const c = regla.condicion;
  if (!c.nutriente) return { motivo: '' };
  const formas = FORMA_ANALISIS[c.nutriente] ?? [c.nutriente];
  const n = analisis.nutrientes.find(x => formas.includes(x.forma) && x.valor !== undefined && (!c.unidad || x.unidad === c.unidad));
  if (!n || n.valor === undefined) {
    const otraUnidad = analisis.nutrientes.find(x => formas.includes(x.forma) && x.valor !== undefined);
    return { motivo: otraUnidad ? `El análisis reporta ${c.nutriente} en ${otraUnidad.unidad}; la referencia usa ${c.unidad}. La app no convierte.` : `El análisis no tiene ${c.nutriente} (${c.unidad ?? 'sin unidad'}).` };
  }
  if (c.metodo && !normalizar(analisis.metodoLaboratorio ?? '').includes(normalizar(c.metodo))) {
    return { motivo: `La referencia usa el método ${c.metodo}; el análisis indica «${analisis.metodoLaboratorio || 'sin método'}». Con otro método los valores no son comparables.` };
  }
  return { valor: n.valor };
}

/**
 * Sugerencias para un cultivo y una región con un análisis. Sin análisis solo se usan las reglas
 * que no dependen de él (p. ej. nitrógeno por región).
 */
export function sugerirMetas(
  { cultivo, region, analisis, reglas }: { cultivo: string; region?: string; analisis?: AnalisisVerificado; reglas: ReadonlyArray<ReglaDosis> }
): ResultadoSugerencias {
  const delCultivo = reglas.filter(r => r.cultivo === cultivo);
  const regiones = [...new Set(delCultivo.map(r => r.region).filter((r): r is string => !!r))];
  const sugerencias: Sugerencia[] = [];
  const noAplican: ResultadoSugerencias['noAplican'] = [];
  for (const regla of delCultivo) {
    if (regla.region && region !== regla.region) {
      if (!region) noAplican.push({ regla, motivo: 'Elige la región para ver esta referencia.' });
      continue;
    }
    const c = regla.condicion;
    let motivo = regla.region ? `Región: ${regla.region}` : 'Aplica sin depender del análisis';
    if (c.nutriente) {
      if (!analisis) { noAplican.push({ regla, motivo: 'Elige un análisis de suelo para usar esta referencia.' }); continue; }
      const v = valorDelAnalisis(analisis, regla);
      if ('motivo' in v) { noAplican.push({ regla, motivo: v.motivo }); continue; }
      if (!enRango(v.valor, c.min, c.max)) continue; // otra fila de la misma tabla es la que aplica
      motivo = `${c.nutriente}${c.metodo ? ` (${c.metodo})` : ''} = ${v.valor} ${c.unidad ?? ''}, ${rangoTexto(c.min, c.max)}`.replace(/\s+,/, ',');
    }
    for (const r of regla.recomendacion) sugerencias.push({ forma: r.forma, minKgHa: r.minKgHa, maxKgHa: r.maxKgHa, regla, motivo });
  }
  return { sugerencias, noAplican, regiones };
}

/** Nivel (bajo, medio, alto…) de un valor según una tabla de interpretación, o undefined si no aplica. */
export function nivelDe(valor: number, nivel: NivelSuelo): string | undefined {
  return nivel.rangos.find(r => enRango(valor, r.min, r.max))?.nivel;
}

/** Texto de la fuente para la meta: "Castro Franco, H. E. (2005), Tabla 2, p. 34 (rango 300-350 kg/ha)". */
export function citaDeSugerencia(s: Sugerencia): string {
  const f = s.regla.fuente;
  const partes = [f.autores ? `${f.autores}${f.anio ? ` (${f.anio})` : ''}` : `${f.titulo}${f.anio ? ` (${f.anio})` : ''}`, f.tabla, f.paginaImpresa ? `p. ${f.paginaImpresa}` : undefined];
  return `${partes.filter(Boolean).join(', ')} · rango sugerido ${s.minKgHa}-${s.maxKgHa} kg/ha`.slice(0, 200);
}
