/**
 * Catálogo de NOTACIÓN química (no de valores): qué formas corresponden a cada elemento.
 * Sirve para detectar combinaciones incoherentes como Fósforo / K₂O. No convierte entre formas:
 * P y P₂O₅, o K y K₂O, son formas distintas y se conservan tal como las reporta el laboratorio.
 */
export interface ElementoCatalogo {
  nombre: string;
  simbolo: string;
  formas: ReadonlyArray<string>;
}

export const CATALOGO_NUTRIENTES: ReadonlyArray<ElementoCatalogo> = [
  { nombre: 'Nitrógeno', simbolo: 'N', formas: ['N', 'NO₃⁻', 'NH₄⁺', 'N-NO₃⁻', 'N-NH₄⁺'] },
  { nombre: 'Fósforo', simbolo: 'P', formas: ['P', 'P₂O₅'] },
  { nombre: 'Potasio', simbolo: 'K', formas: ['K', 'K⁺', 'K₂O'] },
  { nombre: 'Calcio', simbolo: 'Ca', formas: ['Ca', 'Ca²⁺', 'CaO'] },
  { nombre: 'Magnesio', simbolo: 'Mg', formas: ['Mg', 'Mg²⁺', 'MgO'] },
  { nombre: 'Azufre', simbolo: 'S', formas: ['S', 'SO₄²⁻', 'S-SO₄²⁻'] },
  { nombre: 'Sodio', simbolo: 'Na', formas: ['Na', 'Na⁺'] },
  { nombre: 'Aluminio', simbolo: 'Al', formas: ['Al', 'Al³⁺'] },
  { nombre: 'Hierro', simbolo: 'Fe', formas: ['Fe'] },
  { nombre: 'Manganeso', simbolo: 'Mn', formas: ['Mn'] },
  { nombre: 'Cobre', simbolo: 'Cu', formas: ['Cu'] },
  { nombre: 'Zinc', simbolo: 'Zn', formas: ['Zn'] },
  { nombre: 'Boro', simbolo: 'B', formas: ['B'] }
];

export const OPCION_OTRO = 'Otro / No reconocido';

const SUBINDICES: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-'
};

/** Clave de comparación: "K2O", "k₂o" y "K₂O" son la misma forma escrita de distinta manera. */
export function claveForma(forma: string): string {
  return [...forma.trim()].map(c => SUBINDICES[c] ?? c).join('').replace(/\s+/g, '').toUpperCase();
}

const claveElemento = (texto: string) =>
  texto.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca por nombre (sin importar tildes ni mayúsculas) o por símbolo exacto. */
export function buscarElemento(texto: string): ElementoCatalogo | undefined {
  const clave = claveElemento(texto);
  return CATALOGO_NUTRIENTES.find(e => claveElemento(e.nombre) === clave || e.simbolo === texto.trim());
}

/** Mismo elemento por catálogo (nombre o símbolo); si alguno no está en el catálogo, por texto. */
export function mismoElemento(a: string, b: string): boolean {
  const ea = buscarElemento(a);
  const eb = buscarElemento(b);
  return ea || eb ? ea === eb : claveElemento(a) === claveElemento(b);
}

/** Mismo elemento y misma forma química, escrita de cualquier manera. P y P₂O₅ NO son la misma forma. */
export function mismaForma(a: { elemento: string; forma: string }, b: { elemento: string; forma: string }): boolean {
  return mismoElemento(a.elemento, b.elemento) && claveForma(a.forma) === claveForma(b.forma);
}

/** Coherencia elemento/forma. Solo rechaza combinaciones que el catálogo sabe incorrectas. */
export function coherenciaNutriente(elemento: string, forma: string): { reconocido: boolean; error?: string } {
  const el = buscarElemento(elemento);
  const clave = claveForma(forma);
  if (el?.formas.some(f => claveForma(f) === clave)) return { reconocido: true };
  const ajeno = CATALOGO_NUTRIENTES.find(e => e !== el && e.formas.some(f => claveForma(f) === clave));
  if (el && ajeno) {
    return { reconocido: false, error: `La forma ${forma.trim()} corresponde a ${ajeno.nombre}, no a ${el.nombre}` };
  }
  return { reconocido: false };
}
