/**
 * Operaciones DIMENSIONALES (no son recomendaciones de fertilización).
 * Las metas nutricionales deben provenir de un análisis agronómico validado.
 */
import type { ContenidoDeclarado, LineaPlan, MetaNutrimental, NutrienteLeido, ProblemaDato } from '../types';
import { mismaForma, mismoElemento } from './catalogoNutrientes.ts';

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

function sinDato(entrada: { problemas?: ReadonlyArray<ProblemaDato> }, campo: string, falta: string, invalido: string): Calculo<number> {
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

// ---- Fase 3: cantidad y costo de producto para una meta YA VALIDADA (fuente y fecha del usuario) ----

/** Kg de producto en el área del plan: kg/ha × área_m² / 10.000. */
export function productoEnLoteKg(kgHa: number, areaM2: number): number {
  noNegativoFinito('kg/ha', kgHa);
  positivoFinito('Área', areaM2);
  return resultadoSeguro('Producto en el lote', (kgHa * areaM2) / 10_000, kgHa > 0);
}

/** COP por kg a partir del precio de una presentación (bulto). */
export function precioPorKgCop(precioPresentacionCop: number, presentacionKg: number): number {
  noNegativoFinito('Precio del bulto', precioPresentacionCop);
  positivoFinito('Kg por bulto', presentacionKg);
  return resultadoSeguro('Precio por kg', precioPresentacionCop / presentacionKg, precioPresentacionCop > 0);
}

export function costoCop(kg: number, copPorKg: number): number {
  noNegativoFinito('Kg de producto', kg);
  noNegativoFinito('Precio por kg', copPorKg);
  return resultadoSeguro('Costo', kg * copPorKg, kg > 0 && copPorKg > 0);
}

/** Número exacto de bultos; redondear a bultos enteros lo decide el productor. */
export function bultosNecesarios(kg: number, presentacionKg: number): number {
  noNegativoFinito('Kg de producto', kg);
  positivoFinito('Kg por bulto', presentacionKg);
  return resultadoSeguro('Bultos', kg / presentacionKg, kg > 0);
}

/** Kg/ha de una forma química que aporta el producto: kg/ha de producto × % de la etiqueta / 100. */
export function aporteKgHa(productoKgHa: number, porcentajeEnEtiqueta: number): number {
  noNegativoFinito('Producto en kg/ha', productoKgHa);
  if (!Number.isFinite(porcentajeEnEtiqueta) || porcentajeEnEtiqueta <= 0 || porcentajeEnEtiqueta > 100) {
    throw new RangeError('Porcentaje debe estar entre 0 (exclusivo) y 100.');
  }
  return resultadoSeguro('Aporte en kg/ha', productoKgHa * (porcentajeEnEtiqueta / 100), productoKgHa > 0);
}

export type MotivoSinCalculoLinea = MotivoSinCalculo | 'forma-distinta';

/** Lo que aporta el producto de cada forma declarada en su etiqueta. */
export interface AporteForma extends ContenidoDeclarado {
  kgHa: Calculo<number>;
}

export type ResultadoLineaPlan =
  | {
      estado: 'calculada';
      linea: LineaPlan;
      meta: MetaNutrimental;
      /** % de la forma de la meta en la etiqueta. */
      porcentaje: number;
      productoKgHa: number;
      productoKgLote: Calculo<number>;
      precioKgCop: Calculo<number>;
      costoCop: Calculo<number>;
      bultos: Calculo<number>;
      aportes: AporteForma[];
    }
  | { estado: 'sin-calculo'; linea: LineaPlan; meta?: MetaNutrimental; motivo: MotivoSinCalculoLinea; mensaje: string };

/** Meta frente a lo aportado por todas las líneas, por forma química. La app no ajusta nada. */
export interface ResumenForma {
  elemento: string;
  forma: string;
  metaKgHa?: number;
  aportadoKgHa: Calculo<number>;
  /** Aportado − meta: solo aritmética, sin juicio agronómico. Falta si no hay meta o aporte calculado. */
  diferenciaKgHa?: Calculo<number>;
  /** Hay líneas o aportes sin calcular, o datos dañados: la suma no está completa. */
  incompleto: boolean;
}

export interface CalculoPlan {
  areaHa: Calculo<number>;
  lineas: ResultadoLineaPlan[];
  resumen: ResumenForma[];
  /** Solo si todas las líneas tienen costo calculado; un total parcial se prestaría a confusión. */
  costoTotalCop: Calculo<number>;
}

export interface EntradaPlan {
  areaM2AlCrear?: number;
  metas: ReadonlyArray<MetaNutrimental>;
  lineas: ReadonlyArray<LineaPlan>;
  problemas?: ReadonlyArray<ProblemaDato>;
}

const sinPrecio: Calculo<number> = { ok: false, motivo: 'falta-dato', mensaje: 'El producto no tiene precio registrado.' };
const sinBulto: Calculo<number> = { ok: false, motivo: 'falta-dato', mensaje: 'El producto no tiene registrados los kg por bulto.' };

function calcularLinea(linea: LineaPlan, entrada: EntradaPlan, areaHa: Calculo<number>): ResultadoLineaPlan {
  const meta = entrada.metas.find(m => m.id === linea.metaId);
  if (!meta) return { estado: 'sin-calculo', linea, motivo: 'dato-invalido', mensaje: 'La meta de esta línea no existe o tiene datos dañados.' };
  if (!meta.fuente || !meta.fechaFuente) {
    return { estado: 'sin-calculo', linea, meta, motivo: 'falta-dato', mensaje: 'La meta no tiene fuente técnica y fecha: no se calcula ninguna cantidad.' };
  }
  const { producto } = linea;
  const contenido = producto.contenido.find(c => mismaForma(c, meta));
  if (!contenido) {
    const otras = producto.contenido.filter(c => mismoElemento(c.elemento, meta.elemento)).map(c => c.forma);
    return {
      estado: 'sin-calculo', linea, meta, motivo: 'forma-distinta',
      mensaje: otras.length
        ? `La meta está en ${meta.forma} y la etiqueta de ${producto.nombre} declara ${otras.join(', ')}. La app no convierte entre formas químicas: escribe la meta en la misma forma que la etiqueta, según la fuente técnica.`
        : `La etiqueta de ${producto.nombre} no declara ${meta.elemento} (${meta.forma}).`
    };
  }
  const kgHa = calcular(() => productoKgHa(meta.kgHa, contenido.porcentaje));
  if (!kgHa.ok) return { estado: 'sin-calculo', linea, meta, motivo: kgHa.motivo, mensaje: kgHa.mensaje };

  // Sin área válida, el total del lote hereda el motivo del área.
  const area = entrada.areaM2AlCrear;
  const productoKgLote = area !== undefined && areaHa.ok ? calcular(() => productoEnLoteKg(kgHa.valor, area)) : areaHa;
  const { precioPresentacionCop: precio, presentacionKg } = producto;
  const precioKgCop = precio === undefined ? sinPrecio
    : presentacionKg === undefined ? sinBulto
      : calcular(() => precioPorKgCop(precio, presentacionKg));
  const costo = !productoKgLote.ok ? productoKgLote
    : !precioKgCop.ok ? precioKgCop
      : calcular(() => costoCop(productoKgLote.valor, precioKgCop.valor));
  const bultos = !productoKgLote.ok ? productoKgLote
    : presentacionKg === undefined ? sinBulto
      : calcular(() => bultosNecesarios(productoKgLote.valor, presentacionKg));
  // La forma de la meta aporta exactamente la meta (evita redondeos de ida y vuelta).
  const aportes = producto.contenido.map((c): AporteForma => ({
    ...c,
    kgHa: c === contenido ? { ok: true, valor: meta.kgHa } : calcular(() => aporteKgHa(kgHa.valor, c.porcentaje))
  }));
  return {
    estado: 'calculada', linea, meta, porcentaje: contenido.porcentaje, productoKgHa: kgHa.valor,
    productoKgLote, precioKgCop, costoCop: costo, bultos, aportes
  };
}

/**
 * Cantidad y costo de cada línea del plan, sin lanzar errores. Solo calcula si la meta tiene fuente
 * y fecha y si su forma química coincide con la de la etiqueta: nunca convierte P↔P₂O₅ ni K↔K₂O.
 * Usa el área guardada con el plan (nunca el área actual del lote).
 */
export function calcularPlan(entrada: EntradaPlan): CalculoPlan {
  const area = entrada.areaM2AlCrear;
  const areaHa = area === undefined
    ? sinDato(entrada, 'areaM2AlCrear', 'El plan no tiene área registrada.', 'El área guardada con este plan no es válida.')
    : calcular(() => areaM2AHa(area));
  const lineas = entrada.lineas.map(linea => calcularLinea(linea, entrada, areaHa));
  const hayFaltas = (entrada.problemas ?? []).length > 0 || lineas.some(l => l.estado !== 'calculada');

  const grupos: Array<{ elemento: string; forma: string; metaKgHa?: number; valores: number[]; incompleto: boolean }> = [];
  const grupo = (f: { elemento: string; forma: string }) => {
    let g = grupos.find(x => mismaForma(x, f));
    if (!g) grupos.push(g = { elemento: f.elemento, forma: f.forma, valores: [], incompleto: hayFaltas });
    return g;
  };
  for (const meta of entrada.metas) grupo(meta).metaKgHa = meta.kgHa;
  for (const l of lineas) {
    if (l.estado !== 'calculada') continue;
    for (const aporte of l.aportes) {
      const g = grupo(aporte);
      if (aporte.kgHa.ok) g.valores.push(aporte.kgHa.valor);
      else g.incompleto = true;
    }
  }
  const resumen = grupos.map(({ elemento, forma, metaKgHa, valores, incompleto }): ResumenForma => {
    const aportadoKgHa = calcular(() => resultadoSeguro('Aporte total', valores.reduce((a, b) => a + b, 0)));
    const diferenciaKgHa = metaKgHa !== undefined && aportadoKgHa.ok
      ? calcular(() => resultadoSeguro('Diferencia', aportadoKgHa.valor - metaKgHa))
      : undefined;
    return { elemento, forma, metaKgHa, incompleto, aportadoKgHa, diferenciaKgHa };
  });

  const costos = lineas.map(l => (l.estado === 'calculada' ? l.costoCop : null));
  const costoTotalCop: Calculo<number> = lineas.length === 0
    ? { ok: false, motivo: 'falta-dato', mensaje: 'El plan no tiene productos.' }
    : costos.every(c => c?.ok)
      ? calcular(() => resultadoSeguro('Costo total', costos.reduce((a, c) => a + (c?.ok ? c.valor : 0), 0)))
      : { ok: false, motivo: 'falta-dato', mensaje: 'Hay productos sin costo calculado; no se muestra un total parcial.' };
  return { areaHa, lineas, resumen, costoTotalCop };
}
