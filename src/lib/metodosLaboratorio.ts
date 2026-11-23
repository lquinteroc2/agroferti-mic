/** Método del laboratorio por nutriente, guardado como un solo texto. Reglas puras. */
export const FOSFORO = ['Bray II', 'Olsen', 'Mehlich-3'];
export const BASES = ['Acetato de amonio', 'Mehlich-3'];
const ETIQUETA_P = '(fósforo)';
const ETIQUETA_BASES = '(potasio, calcio y magnesio)';

export interface Partes { p: string; bases: string; otros: string }

/** Lee un texto guardado: primero el formato que escribe esta pantalla; si no, reconoce palabras sueltas. */
export function leerMetodos(texto: string): Partes {
  let resto = texto;
  const tomar = (patron: RegExp): RegExpExecArray | null => {
    const m = patron.exec(resto);
    if (m) resto = resto.replace(m[0], '');
    return m;
  };
  // Lo que esta pantalla escribe es «<método> (fósforo)», también un método distinto de la lista
  // (p. ej. «Otro método (fósforo)»).
  const p = tomar(/([^,()]+?) \(fósforo\)/)?.[1].trim()
    ?? (tomar(/bray[\s-]*(ii|2)\b/i) ? 'Bray II' : tomar(/\bolsen\b/i) ? 'Olsen' : '');
  const bases = tomar(/(Acetato de amonio|Mehlich-3) \(potasio, calcio y magnesio\)/)?.[1]
    ?? (tomar(/acetato\s+de\s+amonio/i) ? 'Acetato de amonio' : '');
  const otros = resto.split(',').map(t => t.trim()).filter(Boolean).join(', ');
  return { p, bases, otros };
}

export function unirMetodos({ p, bases, otros }: Partes): string {
  return [p && `${p} ${ETIQUETA_P}`, bases && `${bases} ${ETIQUETA_BASES}`, otros.trim()].filter(Boolean).join(', ');
}

/** Texto que se guarda cuando el laboratorio usó otro método para el fósforo y no se sabe cuál. */
export const OTRO_METODO = 'Otro método';

/** Método declarado para un nutriente de la referencia (P: el del fósforo; K, Ca, Mg: el de las bases). */
export function metodoDeclarado(texto: string, nutriente: string): string {
  const partes = leerMetodos(texto ?? '');
  if (nutriente === 'P') return partes.p;
  if (['K', 'Ca', 'Mg'].includes(nutriente)) return partes.bases;
  return '';
}

/**
 * Mensaje para preguntarle al laboratorio cómo midió el fósforo, cuando el informe no lo dice.
 * `fechaLegible` es la fecha del análisis ya escrita para leer (p. ej. «01 de oct de 2026»).
 */
export function mensajeAlLaboratorio(fechaLegible?: string): string {
  const analisis = fechaLegible ? `el análisis de suelo del ${fechaLegible}` : 'el análisis de suelo que me hicieron';
  return `Hola. Les escribo por ${analisis}. ¿Con qué método midieron el fósforo (P)? Por ejemplo, Bray II u Olsen. Muchas gracias.`;
}
