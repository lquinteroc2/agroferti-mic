/**
 * Codificación de un registro como texto para la nube. JSON no representa NaN, ±Infinity ni fechas:
 * se guardan etiquetados y se restauran al leer, para que la nube guarde exactamente lo que hay en
 * el teléfono (incluidos los datos dañados).
 */
import { esObjeto } from './validacion.ts';

const ETIQUETA = '$agroferti';

function etiquetar(this: Record<string, unknown>, clave: string, valor: unknown): unknown {
  const original = this[clave];
  if (typeof original === 'number' && !Number.isFinite(original)) return { [ETIQUETA]: 'numero', valor: String(original) };
  if (original instanceof Date) return { [ETIQUETA]: 'fecha', valor: Number.isNaN(original.getTime()) ? 'Invalid Date' : original.toISOString() };
  return valor;
}

function revivir(_clave: string, valor: unknown): unknown {
  if (esObjeto(valor) && Object.keys(valor).length === 2 && typeof valor.valor === 'string') {
    if (valor[ETIQUETA] === 'numero') return Number(valor.valor);
    if (valor[ETIQUETA] === 'fecha') return new Date(valor.valor);
  }
  return valor;
}

/** Un registro como texto, sin perder NaN, ±Infinity ni fechas. */
export const codificarRegistro = (registro: unknown): string => JSON.stringify(registro, etiquetar);

/** Inverso de `codificarRegistro`. Lanza un error si el texto no es JSON. */
export const decodificarRegistro = (texto: string): unknown => JSON.parse(texto, revivir);
