/**
 * Conversión entre la forma elemental y la forma de óxido de un nutriente (P ↔ P₂O₅, K ↔ K₂O,
 * Ca ↔ CaO, Mg ↔ MgO). Decisión del 27 de noviembre de 2026 (dueño del proyecto, por sugerencia del
 * instructor): la app convierte cuando la meta y la etiqueta usan formas distintas del mismo nutriente.
 *
 * No es un dato agronómico: es la relación química exacta entre las masas de las dos formas, calculada
 * con los pesos atómicos estándar de la IUPAC (Comisión de Abundancias Isotópicas y Pesos Atómicos,
 * CIAAW, 2021, www.ciaaw.org). Por ejemplo, en 1 kg de P₂O₅ hay 2 × 30,974 ÷ 141,943 = 0,4364 kg de P.
 * La app muestra siempre la operación. Las formas iónicas de los análisis (K⁺, Ca²⁺, Mg²⁺) y las
 * unidades cmol(+)/kg no se convierten aquí.
 */
import { buscarElemento, claveForma } from './catalogoNutrientes.ts';

/**
 * Pesos atómicos estándar (IUPAC, CIAAW 2021). Para el oxígeno, 15,9994, dentro del intervalo IUPAC
 * [15,99903; 15,99977]: es el valor con que se publican los factores usuales (P₂O₅ = P × 2,2914).
 */
export const PESOS_ATOMICOS = { P: 30.973762, K: 39.0983, Ca: 40.078, Mg: 24.305, O: 15.9994 } as const;

const P = PESOS_ATOMICOS;
/** Pares elemento → óxido y el factor: kg de óxido = kg del elemento × factor. */
export const PARES_CONVERSION: ReadonlyArray<{ simbolo: string; simple: string; oxido: string; factor: number }> = [
  { simbolo: 'P', simple: 'P', oxido: 'P₂O₅', factor: (2 * P.P + 5 * P.O) / (2 * P.P) },
  { simbolo: 'K', simple: 'K', oxido: 'K₂O', factor: (2 * P.K + P.O) / (2 * P.K) },
  { simbolo: 'Ca', simple: 'Ca', oxido: 'CaO', factor: (P.Ca + P.O) / P.Ca },
  { simbolo: 'Mg', simple: 'Mg', oxido: 'MgO', factor: (P.Mg + P.O) / P.Mg }
];

/** Conversión de una forma a otra del mismo nutriente: kg en `hacia` = kg en `desde` × factor. */
export interface Conversion {
  desde: string;
  hacia: string;
  factor: number;
}

function par(elemento: string) {
  const el = buscarElemento(elemento);
  return el ? PARES_CONVERSION.find(p => p.simbolo === el.simbolo) : undefined;
}

/**
 * Factor para pasar una cantidad de la forma `desde` a la forma `hacia` del mismo nutriente, o
 * undefined si no se puede (otro nutriente, la misma forma o una forma que no es la elemental ni el
 * óxido, como K⁺). Las formas se comparan sin importar cómo se escribieron (P2O5 = P₂O₅).
 */
export function conversionEntre(desde: { elemento: string; forma: string }, hacia: { elemento: string; forma: string }): Conversion | undefined {
  const p = par(desde.elemento);
  if (!p || par(hacia.elemento) !== p) return undefined;
  const a = claveForma(desde.forma), b = claveForma(hacia.forma);
  const simple = claveForma(p.simple), oxido = claveForma(p.oxido);
  if (a === simple && b === oxido) return { desde: p.simple, hacia: p.oxido, factor: p.factor };
  if (a === oxido && b === simple) return { desde: p.oxido, hacia: p.simple, factor: 1 / p.factor };
  return undefined;
}

/** La otra forma del mismo nutriente a la que se puede convertir ("P₂O₅" para P), o undefined. */
export function otraForma(meta: { elemento: string; forma: string }): string | undefined {
  const p = par(meta.elemento);
  if (!p) return undefined;
  return conversionEntre(meta, { elemento: meta.elemento, forma: p.oxido }) ? p.oxido
    : conversionEntre(meta, { elemento: meta.elemento, forma: p.simple }) ? p.simple : undefined;
}

/** Factor con 4 decimales y coma, para mostrarlo ("2,2914"); el cálculo usa el valor completo. */
export const factorTexto = (factor: number) => factor.toFixed(4).replace('.', ',');
