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
  const p = tomar(/(Bray II|Olsen|Mehlich-3) \(fósforo\)/)?.[1]
    ?? (tomar(/bray[\s-]*(ii|2)\b/i) ? 'Bray II' : tomar(/\bolsen\b/i) ? 'Olsen' : '');
  const bases = tomar(/(Acetato de amonio|Mehlich-3) \(potasio, calcio y magnesio\)/)?.[1]
    ?? (tomar(/acetato\s+de\s+amonio/i) ? 'Acetato de amonio' : '');
  const otros = resto.split(',').map(t => t.trim()).filter(Boolean).join(', ');
  return { p, bases, otros };
}

export function unirMetodos({ p, bases, otros }: Partes): string {
  return [p && `${p} ${ETIQUETA_P}`, bases && `${bases} ${ETIQUETA_BASES}`, otros.trim()].filter(Boolean).join(', ');
}
