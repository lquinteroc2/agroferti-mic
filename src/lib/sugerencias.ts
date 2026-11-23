/**
 * Sugerencia de metas nutricionales a partir del análisis de suelo y de las reglas de referencia
 * guardadas en la nube (cada una con su fuente publicada). Reglas puras.
 *
 * Solo se sugiere cuando coinciden el cultivo, la región (si la regla tiene región), el nutriente,
 * la forma química, la unidad y el método de laboratorio de la regla. Si algo no coincide, no se
 * sugiere nada y se explica por qué. La sugerencia es un rango: el usuario decide el valor.
 */
import type { AnalisisVerificado } from '../types.ts';
import { CATALOGO_NUTRIENTES } from './catalogoNutrientes.ts';
import { metodoDeclarado } from './metodosLaboratorio.ts';
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

/** Número con coma decimal, como en el resto de la app (0,25), sin redondear. */
const num = (n: number) => String(n).replace('.', ',');
const rangoTexto = (min: number | null, max: number | null) =>
  min !== null && max !== null ? `entre ${num(min)} y ${num(max)}` : min !== null ? `${num(min)} o más` : max !== null ? `menos de ${num(max)}` : 'cualquier valor';

function enRango(valor: number, min: number | null, max: number | null): boolean {
  // Mínimo incluido y máximo excluido: así los rangos contiguos de una tabla (< 40, 40-60, > 60) no se solapan.
  return (min === null || valor >= min) && (max === null || valor < max);
}

/** Hay un valor escrito (número guardado o texto no vacío del formulario). */
const tieneValor = (v: unknown) => v !== undefined && v !== null && !(typeof v === 'string' && !v.trim());

/** Filas del análisis que miden el nutriente de una condición (por su forma química) y tienen valor. */
function filasDelNutriente<T extends { forma: string; valor?: unknown }>(nutrientes: ReadonlyArray<T>, nutriente: string): T[] {
  const formas = FORMA_ANALISIS[nutriente] ?? [nutriente];
  return nutrientes.filter(n => formas.includes(n.forma.trim()) && tieneValor(n.valor));
}

/** Reglas que aplican a la zona elegida (o todas si aún no hay zona). */
const deLaZona = (reglas: ReadonlyArray<ReglaDosis>, region?: string) =>
  region ? reglas.filter(r => !r.region || r.region === region) : [...reglas];

/** Valor del análisis para una condición (nutriente, unidad y método), o el motivo por el que no hay. */
function valorDelAnalisis(analisis: AnalisisVerificado, regla: ReglaDosis): { valor: number } | { motivo: string } {
  const c = regla.condicion;
  if (!c.nutriente) return { motivo: '' };
  const filas = filasDelNutriente(analisis.nutrientes, c.nutriente);
  const n = filas.find(x => !c.unidad || x.unidad === c.unidad);
  if (!n || n.valor === undefined) {
    const otraUnidad = filas[0];
    return { motivo: otraUnidad ? `El análisis reporta ${c.nutriente} en ${otraUnidad.unidad}; la referencia usa ${c.unidad}. La app no convierte.` : `El análisis no tiene ${c.nutriente} (${c.unidad ?? 'sin unidad'}).` };
  }
  if (c.metodo && !usaMetodo(analisis.metodoLaboratorio, c.metodo)) {
    const nombre = nombreNutriente(c.nutriente);
    const declarado = metodoDeclarado(analisis.metodoLaboratorio ?? '', c.nutriente);
    return { motivo: declarado
      ? `El ${nombre} se midió con otro método («${declarado}») y la tabla usa ${c.metodo}: los valores no se pueden comparar. Esta meta la escribes tú con tu asistente técnico.`
      : `El análisis no dice cómo se midió el ${nombre}. Si el laboratorio usó ${c.metodo}, edita el análisis y márcalo.` };
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
  const regiones = regionesDelCultivo(reglas, cultivo);
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
      motivo = `${c.nutriente}${c.metodo ? ` (${c.metodo})` : ''} = ${num(v.valor)} ${c.unidad ?? ''}, ${rangoTexto(c.min, c.max)}`.replace(/\s+,/, ',');
    }
    for (const r of regla.recomendacion) sugerencias.push({ forma: r.forma, minKgHa: r.minKgHa, maxKgHa: r.maxKgHa, regla, motivo });
  }
  return { sugerencias, noAplican, regiones };
}

/** Regiones que distinguen las reglas de un cultivo, en el orden de las referencias. */
export function regionesDelCultivo(reglas: ReadonlyArray<ReglaDosis>, cultivo: string): string[] {
  return [...new Set(reglas.filter(r => r.cultivo === cultivo).map(r => r.region).filter((r): r is string => !!r))];
}

/** El método escrito en el análisis incluye el de la referencia (sin tildes, mayúsculas ni guiones). */
export function usaMetodo(metodoLaboratorio: string | undefined, metodo: string): boolean {
  return normalizar(metodoLaboratorio ?? '').includes(normalizar(metodo));
}

/** "fósforo (P)" a partir del símbolo de la condición de una regla. */
function nombreNutriente(simbolo: string): string {
  const el = CATALOGO_NUTRIENTES.find(e => e.simbolo === simbolo);
  return el ? `${el.nombre.toLowerCase()} (${simbolo})` : simbolo;
}

/** Unidad con su nombre en los informes: "cmol(+)/kg (meq/100 g)". */
const unidadConNombre = (unidad: string) =>
  unidad === 'mg/kg' ? 'mg/kg (ppm)' : unidad === 'cmol(+)/kg' ? 'cmol(+)/kg (meq/100 g)' : unidad;

export interface RequisitoSugerencias {
  clave: string;
  texto: string;
  cumple: boolean;
  /** Por qué no se cumple, cuando se sabe. */
  motivo?: string;
}

/** Reglas distintas por nutriente, unidad y método (una tabla tiene varias filas con la misma condición). */
function condicionesDistintas(reglas: ReadonlyArray<ReglaDosis>): ReglaDosis[] {
  const vistas = new Map<string, ReglaDosis>();
  for (const r of reglas) {
    const c = r.condicion;
    if (!c.nutriente) continue;
    const clave = `${c.nutriente}|${c.unidad ?? ''}|${c.metodo ?? ''}`;
    if (!vistas.has(clave)) vistas.set(clave, r);
  }
  return [...vistas.values()];
}

/**
 * Lo que necesita la app para proponer metas con las referencias del cultivo, y si ya se cumple:
 * un análisis, cada nutriente con la unidad y el método de la referencia, y la zona. Sin referencias
 * para el cultivo, la lista queda vacía.
 */
export function requisitosSugerencias(
  { cultivo, region, analisis, reglas }: { cultivo: string; region?: string; analisis?: AnalisisVerificado; reglas: ReadonlyArray<ReglaDosis> }
): RequisitoSugerencias[] {
  const delCultivo = reglas.filter(r => r.cultivo === cultivo);
  const requisitos: RequisitoSugerencias[] = [];
  const condiciones = condicionesDistintas(deLaZona(delCultivo, region));
  if (condiciones.length) {
    requisitos.push({ clave: 'analisis', texto: 'Un análisis de suelo elegido arriba', cumple: !!analisis });
    for (const regla of condiciones) {
      const c = regla.condicion;
      const nombre = nombreNutriente(c.nutriente!);
      const texto = `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)}${c.unidad ? ` en ${unidadConNombre(c.unidad)}` : ''}${c.metodo ? `, medido con ${c.metodo}` : ''}`;
      const clave = `nutriente:${c.nutriente}|${c.unidad ?? ''}|${c.metodo ?? ''}`;
      if (!analisis) { requisitos.push({ clave, texto, cumple: false }); continue; }
      const v = valorDelAnalisis(analisis, regla);
      requisitos.push('motivo' in v ? { clave, texto, cumple: false, motivo: v.motivo } : { clave, texto, cumple: true });
    }
  }
  const regiones = regionesDelCultivo(reglas, cultivo);
  if (regiones.length) requisitos.push({ clave: 'zona', texto: 'La zona del lote', cumple: !!region && regiones.includes(region) });
  return requisitos;
}

/**
 * Avisos mientras se escribe un análisis: un nutriente que la referencia del cultivo usa está en otra
 * unidad o medido con otro método, así que la app no podrá proponer la meta que depende de él.
 * Solo avisa de los nutrientes que el análisis trae; no pide datos que el informe no tiene.
 */
export function avisosParaSugerencias(
  { cultivo, region, reglas, nutrientes, metodoLaboratorio }: {
    cultivo: string;
    /** Zona del lote: si se conoce, solo cuentan las reglas de esa zona. */
    region?: string;
    reglas: ReadonlyArray<ReglaDosis>;
    nutrientes: ReadonlyArray<{ forma: string; unidad?: string; valor?: unknown }>;
    metodoLaboratorio: string;
  }
): string[] {
  const avisos = new Set<string>();
  for (const regla of condicionesDistintas(deLaZona(reglas.filter(r => r.cultivo === cultivo), region))) {
    const c = regla.condicion;
    const filas = filasDelNutriente(nutrientes, c.nutriente!);
    if (!filas.length) continue;
    const nombre = nombreNutriente(c.nutriente!);
    if (c.unidad && !filas.some(n => n.unidad === c.unidad)) {
      avisos.add(`La referencia técnica usa el ${nombre} en ${unidadConNombre(c.unidad)}. Con otra unidad, la app no podrá proponerte la meta que depende de él.`);
    } else if (c.metodo && !usaMetodo(metodoLaboratorio, c.metodo)) {
      avisos.add(metodoDeclarado(metodoLaboratorio, c.nutriente!)
        ? `Tu laboratorio midió el ${nombre} con otro método y la tabla de metas usa ${c.metodo}: la meta del ${nombre} la escribes con tu asistente técnico. Esto solo afecta esa meta.`
        : `Falta saber cómo midió el laboratorio el ${nombre} (la tabla de metas usa ${c.metodo}). Respóndelo arriba; mientras no se sepa, la app no te propone la meta del ${nombre}. Esto solo afecta esa meta.`);
    }
  }
  return [...avisos];
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
