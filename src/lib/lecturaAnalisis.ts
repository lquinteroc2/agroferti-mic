/**
 * Lectura automática de un informe de análisis de suelo (texto sacado de un PDF o de una foto).
 * Reglas puras. Solo propone datos: cada uno queda con la línea del informe de donde salió, y el
 * usuario debe confirmarlo uno por uno antes de pasarlo al formulario. Nada se guarda solo.
 *
 * Dos formas de informe:
 * - Una línea por resultado ("Fósforo (Bray II) 35,2 mg/kg"): se lee del texto.
 * - Una tabla con los símbolos arriba y los valores en una fila ("P  S  Ca …" / "11  9  4,0 …"): se
 *   lee de la posición de cada celda del PDF (solo PDF con texto; en fotos no hay posiciones).
 *
 * Unidades: "ppm" se lee como mg/kg y "meq/100 g" como cmol(+)/kg (son equivalentes). Cualquier
 * otra unidad se deja sin leer. En una tabla, si no se sabe con certeza qué unidad corresponde a una
 * columna, el valor se propone sin unidad y el usuario la elige en el formulario.
 */
import type { UnidadNutriente } from '../types.ts';

export interface DatoLeido {
  /** Clave estable para la lista de confirmación. */
  clave: string;
  campo: 'fecha' | 'laboratorio' | 'profundidad' | 'densidad' | 'ph' | 'metodo' | 'nutriente';
  etiqueta: string;
  /** Valor como texto, listo para el formulario (coma decimal). */
  valor: string;
  /** Solo nutrientes. Unidad vacía: no se pudo saber con certeza; la elige el usuario. */
  nutriente?: { elemento: string; forma: string; unidad: UnidadNutriente | '' };
  /** Línea del informe de donde salió, para compararla. */
  linea: string;
}

/** Fragmento de texto de un PDF con su posición en la página (en puntos; la y crece hacia arriba). */
export interface CeldaPdf {
  pagina: number;
  x: number;
  y: number;
  ancho: number;
  alto: number;
  texto: string;
}

/**
 * Nutrientes que se buscan: el nombre se reconoce con o sin mayúsculas; el símbolo, solo exacto
 * (si no, la "mg" de "mg/kg" se tomaría por magnesio o la "k" de "kg" por potasio). `excluir`: líneas
 * que mencionan el elemento pero no son su resultado.
 */
const NUTRIENTES: ReadonlyArray<{ elemento: string; forma: string; nombre: RegExp; simbolo: RegExp; excluir?: RegExp }> = [
  { elemento: 'Fósforo', forma: 'P', nombre: /\bf[oó]sforo\b/i, simbolo: /\bP\b(?![₂2]\s*O)/ },
  { elemento: 'Potasio', forma: 'K', nombre: /\bpotasio\b/i, simbolo: /\bK\b(?![₂2]\s*O)/ },
  { elemento: 'Calcio', forma: 'Ca', nombre: /\bcalcio\b/i, simbolo: /\bCa\b/ },
  { elemento: 'Magnesio', forma: 'Mg', nombre: /\bmagnesio\b/i, simbolo: /\bMg\b/ },
  { elemento: 'Azufre', forma: 'S', nombre: /\bazufre\b/i, simbolo: /\bS\b/ },
  { elemento: 'Boro', forma: 'B', nombre: /\bboro\b/i, simbolo: /\bB\b/ },
  { elemento: 'Zinc', forma: 'Zn', nombre: /\bzinc\b/i, simbolo: /\bZn\b/ },
  { elemento: 'Cobre', forma: 'Cu', nombre: /\bcobre\b/i, simbolo: /\bCu\b/ },
  { elemento: 'Hierro', forma: 'Fe', nombre: /\bhierro\b/i, simbolo: /\bFe\b/ },
  { elemento: 'Manganeso', forma: 'Mn', nombre: /\bmanganeso\b/i, simbolo: /\bMn\b/ },
  { elemento: 'Sodio', forma: 'Na', nombre: /\bsodio\b/i, simbolo: /\bNa\b/ },
  // La acidez intercambiable ("Al + H") y la saturación de aluminio no son el aluminio intercambiable.
  { elemento: 'Aluminio', forma: 'Al', nombre: /\baluminio\b/i, simbolo: /\bAl\b/, excluir: /acidez|hidr[oó]geno|satura|\bAl\s*\+\s*H\b|\bH\s*\+\s*Al\b/i }
];

const METODOS: ReadonlyArray<[RegExp, string]> = [
  [/bray[\s-]*(ii|2)\b/i, 'Bray II'],
  [/\bolsen\b/i, 'Olsen'],
  [/acetato\s+de\s+amonio/i, 'Acetato de amonio'],
  [/walkley[\s-]*black/i, 'Walkley-Black'],
  [/\bdtpa\b/i, 'DTPA'],
  [/fosfato\s+monoc[aá]lcico/i, 'Fosfato monocálcico'],
  // El extractante ("KCl 1 N", "acidez intercambiable, KCl", "aluminio (KCl)"), no el fertilizante
  // cloruro de potasio de una recomendación ("KCl 0-0-60", "Monómeros KCl").
  // Distingue mayúsculas: "Al" es el aluminio; "al" ("aplicar al suelo KCl") no.
  [/\bKCl\s*1\s*(?:N|M|mol)\b|(?:[Aa]cidez|ACIDEZ|[Aa]lumin|ALUMIN|\bAl\b|[Ee]xtra[ií]|EXTRA[IÍ])[^\n]*\bKCl\b|\bKCl\b[^\n]*(?:[Aa]cidez|ACIDEZ|[Aa]lumin|ALUMIN|\bAl\b)/, 'KCl'],
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

// ─── Tablas ───────────────────────────────────────────────────────────────────────────────────────

interface Celda { x0: number; x1: number; cx: number; y: number; texto: string }

const NUMERO = /^\d+(?:[.,]\d+)?$/;
/** Celda que solo tiene una unidad ("mg / Kg", "cmol kg-1", "(cm)", "dS/m", "(Ton/m3)"…). */
const UNIDAD_CELDA = /^\(?\s*(?:mg\s*\/\s*kg|ppm|cmol\s*\(?\s*\+?\s*\)?\s*(?:\/\s*)?kg(?:\s*-\s*1|⁻¹)?|meq\s*\/\s*100\s*g|ds\s*\/\s*m|cm|g\s*\/\s*(?:cm\s*[3³]|cc)|t(?:on)?\s*[/(]\s*m\s*[3³])\s*\)?$/i;
/** Unidades de densidad aparente equivalentes a g/cm³ (1 t/m³ = 1 g/cm³). */
const UNIDAD_DENSIDAD = /g\s*\/\s*(?:cm\s*[3³]|cc)|t(?:on)?\s*[/(]\s*m\s*[3³]/i;
/** Columnas que no pueden quedar bajo una unidad de otras: traen su propia unidad, son el pH o tienen texto. */
const UNIDAD_EN_ETIQUETA = /%|\bpH\b|mg\s*\/\s*kg|\bppm\b|cmol|meq|ds\s*\/\s*m|\bcm\b|g\s*\/\s*cm|t(?:on)?\s*[/(]\s*m\s*[3³]/i;
const LIMITE_COMBINACIONES = 5000;

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const mediana = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const separaciones = (cs: Celda[]) => cs.slice(1).map((c, i) => c.cx - cs[i].cx);

/** Nutriente que nombra el título de una columna: el símbolo o el nombre, solos o con un paréntesis ("P (Bray II)"). */
function nutrienteDeEtiqueta(etiqueta: string) {
  const base = etiqueta.replace(/\s*\(.*\)$/, '').trim();
  return NUTRIENTES.find(n => base === n.forma || sinTildes(base) === sinTildes(n.elemento));
}

/** Agrupa los fragmentos en filas (por altura) y une los pedazos de una misma celda. */
function filasDeCeldas(celdas: CeldaPdf[]): Celda[][] {
  const ordenadas = celdas.filter(c => c.texto.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const filas: CeldaPdf[][] = [];
  for (const c of ordenadas) {
    const fila = filas[filas.length - 1];
    if (fila && Math.abs(fila[0].y - c.y) <= Math.max(1.5, 0.35 * c.alto)) fila.push(c);
    else filas.push([c]);
  }
  return filas.map(fila => {
    const unidas: Celda[] = [];
    for (const c of [...fila].sort((a, b) => a.x - b.x)) {
      const ultima = unidas[unidas.length - 1];
      const hueco = ultima ? c.x - ultima.x1 : Infinity;
      if (ultima && hueco <= Math.max(1, 0.3 * c.alto)) {
        ultima.texto += (hueco > 0.1 * c.alto ? ' ' : '') + c.texto.trim();
        ultima.x1 = Math.max(ultima.x1, c.x + c.ancho);
        ultima.cx = (ultima.x0 + ultima.x1) / 2;
      } else {
        unidas.push({ x0: c.x, x1: c.x + c.ancho, cx: c.x + c.ancho / 2, y: c.y, texto: c.texto.trim() });
      }
    }
    return unidas;
  });
}

/**
 * Unidad de cada columna cuando las unidades van en celdas combinadas ("mg / Kg" sobre P y S). Una
 * celda combinada queda centrada sobre sus columnas, así que cada unidad cubre un tramo continuo de
 * columnas centrado bajo ella; los tramos no se cruzan y toda columna de nutriente sin unidad propia
 * debe quedar cubierta. Se prueban todas las formas de repartir las unidades que cumplen esto: una
 * columna recibe unidad solo si en todas sale la misma. Si no hay ninguna, ninguna columna la recibe.
 */
function unidadesPorColumna(columnas: Celda[], unidades: Celda[], barrera: boolean[], debeCubrir: boolean[], tolerancia: number): Array<string | null> {
  const ordenadas = [...unidades].sort((a, b) => a.cx - b.cx);
  const candidatos = ordenadas.map(u => {
    const tramos: Array<[number, number]> = [];
    for (let i = 0; i < columnas.length; i++) {
      for (let j = i; j < columnas.length && !barrera[j]; j++) {
        if (Math.abs((columnas[i].cx + columnas[j].cx) / 2 - u.cx) <= tolerancia) tramos.push([i, j]);
      }
    }
    return tramos;
  });
  const clave = (texto: string) => unidadDe(texto) ?? texto.replace(/[\s()]/g, '').toLowerCase();
  const vistas: Array<Set<string>> = columnas.map(() => new Set());
  /** Texto de la unidad tal como está en el informe (de la primera forma válida), para mostrarlo. */
  const textos: Array<string | null> = columnas.map(() => null);
  let validas = 0;
  let revisadas = 0;
  const elegidos: Array<[number, number]> = [];
  const recorrer = (k: number, desde: number): boolean => {
    if (++revisadas > LIMITE_COMBINACIONES) return false;
    if (k === ordenadas.length) {
      const unidad: Array<string | null> = columnas.map(() => null);
      elegidos.forEach(([i, j], n) => { for (let c = i; c <= j; c++) unidad[c] = ordenadas[n].texto; });
      if (debeCubrir.some((d, c) => d && unidad[c] === null)) return true;
      validas++;
      unidad.forEach((u, c) => { vistas[c].add(u === null ? '' : clave(u)); textos[c] ??= u; });
      return true;
    }
    for (const tramo of candidatos[k]) {
      if (tramo[0] < desde) continue;
      elegidos.push(tramo);
      const seguir = recorrer(k + 1, tramo[1] + 1);
      elegidos.pop();
      if (!seguir) return false;
    }
    return true;
  };
  if (!recorrer(0, 0) || validas === 0) return columnas.map(() => null);
  return columnas.map((_, c) => (vistas[c].size === 1 && !vistas[c].has('') ? textos[c] : null));
}

/** De dónde salió un dato de la tabla, para compararlo con el informe: "Tabla, columna P (mg / Kg): 11". */
function lineaTabla(etiqueta: string, unidad: string | null, valor: string, sinUnidad: boolean): string {
  const textoUnidad = sinUnidad ? ' (sin unidad clara)' : unidad ? (unidad.startsWith('(') ? ` ${unidad}` : ` (${unidad})`) : '';
  return `Tabla, columna ${etiqueta}${textoUnidad}: ${valor}`;
}

/** Datos de la tabla de resultados de una página, si la hay y tiene una sola muestra. */
function tablaDePagina(filas: Celda[][]): DatoLeido[] {
  const iEncabezado = filas.findIndex(f => f.filter(c => nutrienteDeEtiqueta(c.texto)).length >= 3);
  if (iEncabezado < 0) return [];
  const encabezado = filas[iEncabezado];
  const nutrientesEncabezado = encabezado.filter(c => nutrienteDeEtiqueta(c.texto));
  const tolEncabezado = 0.4 * mediana(separaciones(encabezado));
  const esFilaDeDatos = (fila: Celda[]) =>
    nutrientesEncabezado.filter(h => fila.some(d => NUMERO.test(d.texto) && Math.abs(d.cx - h.cx) <= tolEncabezado)).length >= 3;
  const debajo = filas.slice(iEncabezado + 1);
  const iDatos = debajo.findIndex(esFilaDeDatos);
  // Sin valores, o con varias muestras en el mismo informe: no se adivina cuál es la del lote.
  if (iDatos < 0 || debajo.filter(esFilaDeDatos).length > 1) return [];
  const columnas = debajo[iDatos];
  const separacion = mediana(separaciones(columnas));
  if (!(separacion > 0)) return [];

  // Títulos y unidades: las filas entre los símbolos y los valores, más las de justo encima de los
  // símbolos (un título centrado en un encabezado de dos filas). No el título del informe ni la fecha.
  const paso = encabezado[0].y - debajo[0][0].y;
  const bloque = [
    ...filas.slice(0, iEncabezado).filter(f => f[0].y - encabezado[0].y <= paso),
    encabezado,
    ...debajo.slice(0, iDatos)
  ].flat();
  const etiquetas: string[][] = columnas.map(() => []);
  const unidades: Celda[] = [];
  for (const c of bloque) {
    if (UNIDAD_CELDA.test(c.texto)) { unidades.push(c); continue; }
    if (c.x1 - c.x0 > 1.2 * separacion) continue; // título de un grupo de columnas ("Cationes de cambio")
    let cercana = 0;
    columnas.forEach((col, i) => { if (Math.abs(col.cx - c.cx) < Math.abs(columnas[cercana].cx - c.cx)) cercana = i; });
    if (Math.abs(columnas[cercana].cx - c.cx) <= 0.4 * separacion) etiquetas[cercana].push(c.texto);
  }
  const etiqueta = etiquetas.map(e => e.join(' '));
  const nutriente = etiqueta.map(nutrienteDeEtiqueta);
  const unidadPropia = etiqueta.map(unidadDe);
  const barrera = columnas.map((col, i) => UNIDAD_EN_ETIQUETA.test(etiqueta[i]) || /\p{L}/u.test(col.texto));
  const debeCubrir = columnas.map((col, i) => !!nutriente[i] && !barrera[i] && NUMERO.test(col.texto));
  const unidadTramo = unidadesPorColumna(columnas, unidades, barrera, debeCubrir, Math.max(2, 0.2 * separacion));

  const datos: DatoLeido[] = [];
  columnas.forEach((col, i) => {
    const et = etiqueta[i];
    const unidadTexto = unidadPropia[i] ? null : unidadTramo[i];
    const n = nutriente[i];
    // La unidad del nutriente: la de su título o la de la celda que lo cubre, si es mg/kg o cmol(+)/kg.
    const unidad = n ? unidadPropia[i] ?? (unidadTexto ? unidadDe(unidadTexto) : null) ?? '' : '';
    const linea = lineaTabla(et, unidadPropia[i] ? null : unidadTexto, col.texto, !!n && !unidad);
    if (n && NUMERO.test(col.texto)) {
      datos.push({ clave: `nutriente-${n.forma}`, campo: 'nutriente', etiqueta: `${n.elemento} (${n.forma})`, valor: comoTexto(col.texto), nutriente: { elemento: n.elemento, forma: n.forma, unidad }, linea });
    } else if (/^pH\b/i.test(et) && !/kcl|cacl|naf/i.test(et) && NUMERO.test(col.texto)) { // pH en agua, no en KCl ni CaCl₂
      const valor = Number(col.texto.replace(',', '.'));
      if (valor >= PH_MIN && valor <= PH_MAX) datos.push({ clave: 'ph', campo: 'ph', etiqueta: 'pH', valor: comoTexto(col.texto), linea });
    } else if (/^prof(?:undidad)?\b/i.test(et) && /\bcm\b/i.test(`${et} ${unidadTexto ?? ''}`)) {
      const prof = /^(?:\d+(?:[.,]\d+)?\s*(?:-|–|a)\s*)?(\d+(?:[.,]\d+)?)$/.exec(col.texto);
      if (prof) datos.push({ clave: 'profundidad', campo: 'profundidad', etiqueta: 'Profundidad (cm)', valor: comoTexto(prof[1]), linea });
    } else if (/^(?:DA|Dap|D\.\s*A\.|densidad(?:\s+aparente)?)\b/i.test(et) && UNIDAD_DENSIDAD.test(`${et} ${unidadTexto ?? ''}`) && NUMERO.test(col.texto)) {
      const equivalencia = /g\s*\/\s*(?:cm|cc)/i.test(`${et} ${unidadTexto ?? ''}`) ? '' : ' (1 t/m³ es lo mismo que 1 g/cm³)';
      datos.push({ clave: 'densidad', campo: 'densidad', etiqueta: 'Densidad aparente (g/cm³)', valor: comoTexto(col.texto), linea: linea + equivalencia });
    }
  });
  return datos;
}

/** Datos de la primera tabla de resultados que se encuentre en las páginas del PDF. */
export function extraerDeTabla(celdas: ReadonlyArray<CeldaPdf>): DatoLeido[] {
  const paginas = [...new Set(celdas.map(c => c.pagina))].sort((a, b) => a - b);
  for (const p of paginas) {
    const datos = tablaDePagina(filasDeCeldas(celdas.filter(c => c.pagina === p)));
    if (datos.length) return datos;
  }
  return [];
}

// ─── Lectura completa ─────────────────────────────────────────────────────────────────────────────

/**
 * Datos que se pudieron leer del informe: primero los de la tabla de resultados (si el PDF trae
 * posiciones) y después los de cada línea del texto. Cada dato se toma una sola vez.
 */
export function extraerDatosAnalisis(texto: string, celdas: ReadonlyArray<CeldaPdf> = []): DatoLeido[] {
  const lineas = texto.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const datos: DatoLeido[] = [];
  const vistos = new Set<string>();
  const agregar = (d: DatoLeido) => {
    if (!vistos.has(d.clave)) { vistos.add(d.clave); datos.push(d); return; }
    // Un valor de la tabla sin unidad clara la toma de una línea del informe con el mismo valor y unidad.
    const previo = datos.find(x => x.clave === d.clave);
    if (previo?.nutriente && previo.nutriente.unidad === '' && d.nutriente?.unidad && previo.valor === d.valor) {
      previo.nutriente = { ...previo.nutriente, unidad: d.nutriente.unidad };
      previo.linea = `${previo.linea} · ${d.linea}`;
    }
  };

  for (const d of extraerDeTabla(celdas)) agregar(d);

  for (const linea of lineas) {
    const fecha = /fecha[^0-9]{0,25}(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/i.exec(linea) ?? /fecha[^0-9]{0,25}(\d{4})-(\d{2})-(\d{2})/i.exec(linea);
    if (fecha) {
      const [d, m, a] = fecha[1].length === 4 ? [fecha[3], fecha[2], fecha[1]] : [fecha[1], fecha[2], fecha[3]];
      agregar({ clave: 'fecha', campo: 'fecha', etiqueta: 'Fecha del análisis', valor: `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`, linea });
    }
    const lab = /laboratorio\s*[:-]\s*(.{3,80})$/i.exec(linea);
    if (lab) agregar({ clave: 'laboratorio', campo: 'laboratorio', etiqueta: 'Laboratorio', valor: lab[1].trim(), linea });
    // La profundidad del muestreo, no la de una recomendación ("preparar el suelo a 30-40 cm").
    const prof = /prepar|labranza|\bar(?:ar|ado)\b|recomend|incorpor|subsol/i.test(linea)
      ? null
      : /profundidad[^0-9]{0,20}(?:\d+\s*(?:-|a)\s*)?(\d+(?:[.,]\d+)?)\s*cm/i.exec(linea);
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
    const posibles = NUTRIENTES.filter(n => !n.excluir?.test(linea));
    const encontrado = posibles.find(n => n.nombre.test(linea)) ?? posibles.find(n => n.simbolo.test(linea));
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
