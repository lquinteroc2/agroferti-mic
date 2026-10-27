/**
 * Operaciones DIMENSIONALES (no son recomendaciones de fertilización).
 * Las metas nutricionales deben provenir de un análisis agronómico validado.
 */
import type { NutrienteLeido, ProblemaDato } from '../types';

/** Resultado fuera del rango en que JavaScript representa números con precisión (muy grande o muy pequeño). */
export class ErrorDesbordamiento extends RangeError {
  constructor(nombre: string, tipo: 'grande' | 'pequeño' = 'grande') {
    super(tipo === 'grande'
      ? `${nombre}: el resultado es demasiado grande para calcularlo con precisión. Revisa los datos.`
      : `${nombre}: el resultado es demasiado pequeño para representarlo y se perdería como cero. Revisa los datos.`);
    this.name = 'ErrorDesbordamiento';
  }
}

function positivoFinito(nombre: string, valor: number): void {
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new RangeError(`${nombre} debe ser mayor que cero y finito.`);
  }
}

function noNegativoFinito(nombre: string, valor: number): void {
  if (!Number.isFinite(valor) || valor < 0) throw new RangeError(`${nombre} debe ser no negativo y finito.`);
}

/**
 * Límite numérico (no agronómico): evita Infinity, pérdida de precisión y, si los operandos
 * son positivos, que el resultado se pierda como 0 por subdesbordamiento.
 */
function resultadoSeguro(nombre: string, valor: number, operandosPositivos = false): number {
  if (!Number.isFinite(valor) || Math.abs(valor) > Number.MAX_SAFE_INTEGER) throw new ErrorDesbordamiento(nombre);
  if (operandosPositivos && valor === 0) throw new ErrorDesbordamiento(nombre, 'pequeño');
  return valor;
}

export function areaM2AHa(areaM2: number): number {
  positivoFinito('Área', areaM2);
  return resultadoSeguro('Área en hectáreas', areaM2 / 10_000, true);
}

export function masaSueloKgHa(profundidadCm: number, densidadGcm3: number): number {
  positivoFinito('Profundidad', profundidadCm);
  positivoFinito('Densidad aparente', densidadGcm3);
  return resultadoSeguro('Masa de suelo', 10_000 * (profundidadCm / 100) * (densidadGcm3 * 1_000), true);
}

/** mg/kg = ppm en base masa. NO equivale a nutriente disponible o dosis recomendada. */
export function equivalenciaMgKgAKgHa(mgKg: number, masaKgHa: number): number {
  noNegativoFinito('mg/kg', mgKg);
  positivoFinito('Masa de suelo', masaKgHa);
  return resultadoSeguro('Equivalencia en kg/ha', (mgKg * masaKgHa) / 1_000_000, mgKg > 0);
}

/**
 * Equivalencia total en el área del lote: kg/ha × área_m² / 10.000.
 * Es una equivalencia de la concentración reportada, NO una cantidad medida ni a aplicar.
 */
export function equivalenciaTotalLoteKg(kgHa: number, areaM2: number): number {
  noNegativoFinito('kg/ha', kgHa);
  positivoFinito('Área', areaM2);
  return resultadoSeguro('Equivalencia en el lote', (kgHa * areaM2) / 10_000, kgHa > 0);
}

export type MotivoSinCalculo = 'falta-dato' | 'dato-invalido' | 'desbordamiento';
export type Calculo<T> = { ok: true; valor: T } | { ok: false; motivo: MotivoSinCalculo; mensaje: string };

export type EquivalenciaNutriente =
  | { estado: 'calculada'; nutriente: NutrienteLeido; kgHa: number; kgLote: Calculo<number> }
  | { estado: 'suspendida'; nutriente: NutrienteLeido; mensaje: string }
  | { estado: 'no-convertible'; nutriente: NutrienteLeido };

export interface EquivalenciasAnalisis {
  areaHa: Calculo<number>;
  masaKgHa: Calculo<number>;
  nutrientes: EquivalenciaNutriente[];
}

export interface EntradaEquivalencias {
  profundidadCm?: number;
  densidadGcm3?: number;
  areaM2AlRegistro?: number;
  nutrientes: ReadonlyArray<NutrienteLeido>;
  problemas?: ReadonlyArray<ProblemaDato>;
}

function calcular(fn: () => number): Calculo<number> {
  try {
    return { ok: true, valor: fn() };
  } catch (error) {
    const desborda = error instanceof ErrorDesbordamiento;
    return {
      ok: false,
      motivo: desborda ? 'desbordamiento' : 'dato-invalido',
      mensaje: error instanceof Error ? error.message : 'No se pudo calcular con estos datos.'
    };
  }
}

function sinDato(entrada: EntradaEquivalencias, campo: string, falta: string, invalido: string): Calculo<number> {
  return entrada.problemas?.some(p => p.campo === campo)
    ? { ok: false, motivo: 'dato-invalido', mensaje: invalido }
    : { ok: false, motivo: 'falta-dato', mensaje: falta };
}

/**
 * Equivalencias dimensionales de un análisis, sin lanzar errores: cada paso informa si se pudo
 * calcular. Usa el área guardada con el análisis (nunca el área actual del lote).
 * Solo se calculan lecturas en mg/kg con densidad aparente registrada; cmol(+)/kg no se convierte.
 * La forma química se mantiene: un resultado de P sigue siendo P (no P₂O₅).
 */
export function equivalenciasAnalisis(entrada: EntradaEquivalencias): EquivalenciasAnalisis {
  const area = entrada.areaM2AlRegistro;
  const areaHa = area === undefined
    ? sinDato(entrada, 'areaM2AlRegistro', 'Área histórica no registrada.', 'El área guardada con este análisis no es válida.')
    : calcular(() => areaM2AHa(area));

  const { profundidadCm, densidadGcm3 } = entrada;
  const masaKgHa = profundidadCm === undefined
    ? sinDato(entrada, 'profundidadCm', 'Falta la profundidad de muestreo.', 'La profundidad guardada no es válida.')
    : densidadGcm3 === undefined
      ? sinDato(entrada, 'densidadGcm3', 'Falta la densidad aparente.', 'La densidad aparente guardada no es válida.')
      : calcular(() => masaSueloKgHa(profundidadCm, densidadGcm3));

  // Array.from recorre también las posiciones vacías de un array disperso (map las omitiría).
  const nutrientes = Array.from(entrada.nutrientes ?? [], (leido): EquivalenciaNutriente => {
    const nutriente: NutrienteLeido = leido ?? { elemento: '', forma: '', problema: 'Posición vacía en la lista de resultados.' };
    const { valor, unidad } = nutriente;
    if (nutriente.problema || valor === undefined || unidad === undefined) {
      return { estado: 'suspendida', nutriente, mensaje: 'Este resultado tiene datos que deben corregirse.' };
    }
    if (unidad !== 'mg/kg') return { estado: 'no-convertible', nutriente };
    if (!masaKgHa.ok) return { estado: 'suspendida', nutriente, mensaje: 'Necesita la masa de suelo del paso 2.' };
    const kgHa = calcular(() => equivalenciaMgKgAKgHa(valor, masaKgHa.valor));
    if (!kgHa.ok) return { estado: 'suspendida', nutriente, mensaje: kgHa.mensaje };
    // Sin área histórica válida, el total del lote hereda el motivo del paso 1.
    const kgLote = area !== undefined && areaHa.ok ? calcular(() => equivalenciaTotalLoteKg(kgHa.valor, area)) : areaHa;
    return { estado: 'calculada', nutriente, kgHa: kgHa.valor, kgLote };
  });
  return { areaHa, masaKgHa, nutrientes };
}

/** Cantidad de un producto para aportar una meta YA VALIDADA de un nutriente. */
export function productoKgHa(metaValidadaKgHa: number, porcentajeEnEtiqueta: number): number {
  if (!Number.isFinite(metaValidadaKgHa) || metaValidadaKgHa < 0) {
    throw new RangeError('Meta debe ser no negativa.');
  }
  if (!Number.isFinite(porcentajeEnEtiqueta) || porcentajeEnEtiqueta <= 0 || porcentajeEnEtiqueta > 100) {
    throw new RangeError('Porcentaje debe estar entre 0 (exclusivo) y 100.');
  }
  return resultadoSeguro('Producto en kg/ha', metaValidadaKgHa / (porcentajeEnEtiqueta / 100), metaValidadaKgHa > 0);
}
