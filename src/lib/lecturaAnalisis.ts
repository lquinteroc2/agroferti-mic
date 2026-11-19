/**
 * Lectura automática de un informe de análisis de suelo (texto sacado de un PDF o de una foto).
 * Reglas puras. Solo propone datos: cada uno queda con la línea del informe de donde salió, y el
 * usuario debe confirmarlo uno por uno antes de pasarlo al formulario. Nada se guarda solo.
 *
 * Unidades: "ppm" se lee como mg/kg y "meq/100 g" como cmol(+)/kg (son equivalentes). Cualquier
 * otra unidad se deja sin leer.
 */
import type { UnidadNutriente } from '../types.ts';

export interface DatoLeido {
  /** Clave estable para la lista de confirmación. */
  clave: string;
  campo: 'fecha' | 'laboratorio' | 'profundidad' | 'densidad' | 'ph' | 'metodo' | 'nutriente';
  etiqueta: string;
  /** Valor como texto, listo para el formulario (coma decimal). */
  valor: string;
  /** Solo nutrientes. */
  nutriente?: { elemento: string; forma: string; unidad: UnidadNutriente };
  /** Línea del informe de donde salió, para compararla. */
  linea: string;
}

/**
 * Nutrientes que se buscan: el nombre se reconoce con o sin mayúsculas; el símbolo, solo exacto
 * (si no, la "mg" de "mg/kg" se tomaría por magnesio o la "k" de "kg" por potasio).
 */
const NUTRIENTES: ReadonlyArray<{ elemento: string; forma: string; nombre: RegExp; simbolo: RegExp }> = [
  { elemento: 'Fósforo', forma: 'P', nombre: /\bf[oó]sforo\b/i, simbolo: /\bP\b(?![₂2]\s*O)/ },
  { elemento: 'Potasio', forma: 'K', nombre: /\bpotasio\b/i, simbolo: /\bK\b(?![₂2]\s*O)/ },
  { elemento: 'Calcio', forma: 'Ca', nombre: /\bcalcio\b/i, simbolo: /\bCa\b/ },
  { elemento: 'Magnesio', forma: 'Mg', nombre: /\bmagnesio\b/i, simbolo: /\bMg\b/ },
  { elemento: 'Azufre', forma: 'S', nombre: /\bazufre\b/i, simbolo: /\bS\b/ },
  { elemento: 'Boro', forma: 'B', nombre: /\bboro\b/i, simbolo: /\bB\b/ },
  { elemento: 'Zinc', forma: 'Zn', nombre: /\bzinc\b/i, simbolo: /\bZn\b/ },
  { elemento: 'Cobre', forma: 'Cu', nombre: /\bcobre\b/i, simbolo: /\bCu\b/ },
  { elemento: 'Hierro', forma: 'Fe', nombre: /\bhierro\b/i, simbolo: /\bFe\b/ },
  { elemento: 'Manganeso', forma: 'Mn', nombre: /\bmanganeso\b/i, simbolo: /\bMn\b/ }
];

const METODOS: ReadonlyArray<[RegExp, string]> = [
  [/bray[\s-]*(ii|2)\b/i, 'Bray II'],
  [/\bolsen\b/i, 'Olsen'],
  [/acetato\s+de\s+amonio/i, 'Acetato de amonio'],
  [/walkley[\s-]*black/i, 'Walkley-Black'],
  [/\bdtpa\b/i, 'DTPA'],
  [/fosfato\s+monoc[aá]lcico/i, 'Fosfato monocálcico'],
  [/\bKCl\b/, 'KCl'],
  [/agua\s+caliente/i, 'Agua caliente']
];

const comoTexto = (n: string) => n.replace('.', ',');
/** pH posible en un suelo: fuera de esto, la lectura es casi seguro un error (se escribe a mano). */
const PH_MIN = 2;
const PH_MAX = 11;

/** Unidad del resultado en la línea, normalizada a las que usa la app. */
function unidadDe(linea: string): UnidadNutriente | null {
  if (/cmol\s*\(?\+?\)?\s*\/?\s*kg|meq\s*\/\s*100\s*g/i.test(linea)) return 'cmol(+)/kg';
  if (/mg\s*\/\s*kg|\bppm\b/i.test(linea)) return 'mg/kg';
  return null;
}

/** Número escrito justo antes de la unidad ("35,2 mg/kg"): evita tomar el "1" de "acetato 1 N" o de "1:1". */
function numeroAntesDeUnidad(linea: string): string | null {
  const m = /(\d+(?:[.,]\d+)?)\s*(?:mg\s*\/\s*kg|ppm|cmol|meq)/i.exec(linea);
  return m ? m[1] : null;
}

/** Último número de la línea sin contar proporciones como "1:1" o "1:2,5" (para el pH). */
function ultimoNumero(linea: string): string | null {
  const sinProporciones = linea.replace(/\d+(?:[.,]\d+)?\s*:\s*\d+(?:[.,]\d+)?/g, ' ');
  const todos = sinProporciones.match(/\d+(?:[.,]\d+)?/g);
  return todos ? todos[todos.length - 1] : null;
}

/**
 * Datos que se pudieron leer del texto del informe. Cada nutriente se toma una sola vez (la
 * primera línea con nombre, número y unidad reconocida).
 */
export function extraerDatosAnalisis(texto: string): DatoLeido[] {
  const lineas = texto.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const datos: DatoLeido[] = [];
  const vistos = new Set<string>();
  const agregar = (d: DatoLeido) => { if (!vistos.has(d.clave)) { vistos.add(d.clave); datos.push(d); } };

  for (const linea of lineas) {
    const fecha = /fecha[^0-9]{0,25}(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/i.exec(linea) ?? /fecha[^0-9]{0,25}(\d{4})-(\d{2})-(\d{2})/i.exec(linea);
    if (fecha) {
      const [d, m, a] = fecha[1].length === 4 ? [fecha[3], fecha[2], fecha[1]] : [fecha[1], fecha[2], fecha[3]];
      agregar({ clave: 'fecha', campo: 'fecha', etiqueta: 'Fecha del análisis', valor: `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`, linea });
    }
    const lab = /laboratorio\s*[:-]\s*(.{3,80})$/i.exec(linea);
    if (lab) agregar({ clave: 'laboratorio', campo: 'laboratorio', etiqueta: 'Laboratorio', valor: lab[1].trim(), linea });
    const prof = /profundidad[^0-9]{0,20}(?:\d+\s*(?:-|a)\s*)?(\d+(?:[.,]\d+)?)\s*cm/i.exec(linea);
    if (prof) agregar({ clave: 'profundidad', campo: 'profundidad', etiqueta: 'Profundidad (cm)', valor: comoTexto(prof[1]), linea });
    const dens = /densidad\s+aparente[^0-9]{0,25}(\d+(?:[.,]\d+)?)\s*(?:g\s*\/\s*cm3|g\s*\/\s*cm³|g\/cc)/i.exec(linea);
    if (dens) agregar({ clave: 'densidad', campo: 'densidad', etiqueta: 'Densidad aparente (g/cm³)', valor: comoTexto(dens[1]), linea });
    // La línea del pH no es la de un nutriente, aunque esta mencione el pH del método ("acetato de
    // amonio pH 7") o su unidad se haya leído mal en una foto. Y el valor debe ser posible en un suelo.
    if (/\bpH\b/.test(linea) && !unidadDe(linea) && !NUTRIENTES.some(n => n.nombre.test(linea))) {
      const ph = ultimoNumero(linea.slice(linea.search(/\bpH\b/)));
      const valor = ph ? Number(ph.replace(',', '.')) : NaN;
      if (ph && valor >= PH_MIN && valor <= PH_MAX) agregar({ clave: 'ph', campo: 'ph', etiqueta: 'pH', valor: comoTexto(ph), linea });
    }

    const unidad = unidadDe(linea);
    if (!unidad) continue;
    // El nombre completo tiene prioridad sobre el símbolo ("Azufre (fosfato…)" es azufre, no fósforo).
    const encontrado = NUTRIENTES.find(n => n.nombre.test(linea)) ?? NUTRIENTES.find(n => n.simbolo.test(linea));
    for (const n of encontrado ? [encontrado] : []) {
      const valor = numeroAntesDeUnidad(linea);
      if (!valor) continue;
      agregar({ clave: `nutriente-${n.forma}`, campo: 'nutriente', etiqueta: `${n.elemento} (${n.forma})`, valor: comoTexto(valor), nutriente: { elemento: n.elemento, forma: n.forma, unidad }, linea });
      break; // una línea, un nutriente: evita tomar el "K" de "Bray" o el "S" de otra palabra
    }
  }

  const metodos = METODOS.filter(([p]) => p.test(texto)).map(([, nombre]) => nombre);
  if (metodos.length) {
    const linea = lineas.find(l => METODOS.some(([p]) => p.test(l))) ?? '';
    agregar({ clave: 'metodo', campo: 'metodo', etiqueta: 'Método de análisis', valor: metodos.join(', '), linea });
  }
  return datos;
}
