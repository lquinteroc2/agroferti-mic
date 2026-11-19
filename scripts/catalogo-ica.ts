/**
 * Arma data/referencias/fertilizantes-ica.json con los fertilizantes VIGENTES de aplicación al suelo
 * del registro oficial del ICA ("Registros de productos fertilizantes de uso agrícola", actualizado
 * el 1 de noviembre de 2026). Entrada: las filas ya extraídas del PDF del ICA (JSON con un objeto
 * por fila: item, registro, nombre, empresa, estado, uso, comp, present, pagina).
 * Uso: node --experimental-strip-types scripts/catalogo-ica.ts <ica-recs.json>
 *
 * Solo copia lo que declara el registro: la composición garantizada en % (los líquidos en g/L no
 * se convierten) y el tamaño del empaque. No hay precios: el ICA no los publica. Lo que no se puede
 * leer sin dudas se omite o se marca "por verificar".
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { leerFertilizante } from '../src/lib/referencias.ts';

interface Fila {
  item?: string; registro?: string; nombre?: string; empresa?: string; estado?: string; uso?: string; comp?: string; present?: string; pagina?: number;
  c1?: string; c2?: string; c3?: string; tipo?: string; cultivos?: string; dosis?: string; aplic?: string; productor?: string; importador?: string; distribuidor?: string; pais?: string; fini?: string;
}

/** Texto limpio y recortado (los campos largos, como los países de origen, se cortan con "…"). */
const limpio = (t: string | undefined, max: number) => {
  const s = (t ?? '').replace(/\s+/g, ' ').replace(/[;,.\s]+$/, '').trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s || undefined;
};

/** Palabras del registro (en mayúsculas y sin tildes) escritas para leer: "COMPUESTO COMPLEJO NPK" → "compuesto complejo NPK". */
const TILDES: Record<string, string> = { inorganico: 'inorgánico', organico: 'orgánico', aminoacidos: 'aminoácidos', humico: 'húmico', suspension: 'suspensión', liquido: 'líquido', granulos: 'gránulos', biologico: 'biológico' };
const legible = (t: string | undefined) => {
  const s = limpio(t, 80);
  if (!s) return undefined;
  const r = s.toLowerCase().replace(/\p{L}+/gu, w => /^(n|p|k|np|nk|pk|npk)$/.test(w) ? w.toUpperCase() : TILDES[w] ?? w);
  return r[0].toUpperCase() + r.slice(1);
};

/** Datos del registro que ayudan a conocer el producto, tal como los publica el ICA. */
function detalleDe(f: Fila) {
  const clase = legible([f.c1, f.c2].filter(Boolean).join(' '));
  const d: Record<string, string | undefined> = {
    clase: clase ? clase + (f.c3 ? ` · ${legible(f.c3)!.toLowerCase().replace(/\b(npk|np|nk|pk|n|p|k)\b/g, x => x.toUpperCase())}` : '') : undefined,
    tipo: legible(f.tipo), uso: legible(f.uso), cultivos: limpio(f.cultivos, 200), dosisRegistrada: limpio(f.dosis, 200),
    aplicacion: limpio(f.aplic, 200), fabricante: limpio(f.productor, 120), importador: limpio(f.importador, 120),
    distribuidor: limpio(f.distribuidor, 120), origen: limpio(f.pais, 120), fechaRegistro: limpio(f.fini, 12), presentaciones: limpio(f.present, 260)
  };
  for (const k of Object.keys(d)) if (!d[k]) delete d[k];
  return d;
}

const FUENTE = 'ICA, Registros de productos fertilizantes de uso agrícola (actualizado 1 nov. 2026), www.ica.gov.co';

/** Elemento del registro → nombre en la app, forma química y orden de preferencia de la fracción declarada. */
const ELEMENTOS: Record<string, { nombre: string; forma: string; codigo: string; preferir: RegExp[] }> = {
  NITROGENO: { nombre: 'Nitrógeno', forma: 'N', codigo: 'N', preferir: [/TOTAL/, /^$/] },
  FOSFORO: { nombre: 'Fósforo', forma: 'P₂O₅', codigo: 'P2O5', preferir: [/ASIMIL/, /SOLUBLE/, /^$/] },
  POTASIO: { nombre: 'Potasio', forma: 'K₂O', codigo: 'K2O', preferir: [/SOLUBLE/, /^$/] },
  CALCIO: { nombre: 'Calcio', forma: 'CaO', codigo: 'CAO', preferir: [/TOTAL/, /^$/, /SOLUBLE/] },
  MAGNESIO: { nombre: 'Magnesio', forma: 'MgO', codigo: 'MGO', preferir: [/TOTAL/, /^$/, /SOLUBLE/] },
  AZUFRE: { nombre: 'Azufre', forma: 'S', codigo: 'S', preferir: [/TOTAL/, /^$/, /SOLUBLE/] },
  BORO: { nombre: 'Boro', forma: 'B', codigo: 'B', preferir: [/TOTAL/, /^$/, /SOLUBLE/] },
  ZINC: { nombre: 'Zinc', forma: 'Zn', codigo: 'ZN', preferir: [/TOTAL/, /^$/, /SOLUBLE/] },
  COBRE: { nombre: 'Cobre', forma: 'Cu', codigo: 'CU', preferir: [/TOTAL/, /^$/, /SOLUBLE/] },
  MANGANESO: { nombre: 'Manganeso', forma: 'Mn', codigo: 'MN', preferir: [/TOTAL/, /^$/, /SOLUBLE/] },
  HIERRO: { nombre: 'Hierro', forma: 'Fe', codigo: 'FE', preferir: [/TOTAL/, /^$/, /SOLUBLE/] }
};

/**
 * Un nutriente declarado: nombre del elemento (admite errores de tipeo frecuentes del registro, como
 * "NIROGENO"), calificador y forma entre paréntesis (que puede tener cifras, como "(P₂O₅)" o
 * "P(205)"), el porcentaje y, a veces, la forma después del porcentaje ("0,7% (N)").
 */
const NUTRIENTE = /\b(NI?TROGENO|FOSFORO|POTASIO|CALCIO|MAGNESIO|AZUFRE|BORO|ZINC|COBRE|MANGANESO|HIERRO)\b((?:[^;%\d(]|\([^)]*\))*?)(\d+(?:[.,]\d+)?)\s*%\s*(\([^)]*\))?/g;

/** "P(205)", "(P₂O₅ )", "(K20)" → "P2O5", "K2O" (el registro confunde a veces la letra O con el cero). */
const formaNormal = (t: string) => t.replace(/₂/g, '2').replace(/₅/g, '5').replace(/[\s()]/g, '').toUpperCase().replace(/0/g, 'O');

function composicion(comp: string): { contenido: Array<{ elemento: string; forma: string; porcentaje: number }>; dudas: string[] } {
  const texto = comp.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/;\s*%/g, '%')            // "15;%" → "15%"
    .replace(/\)\s*;\s*(?=\d)/g, ') ') // "(K₂O); 17%" → "(K₂O) 17%"
    .replace(/\s+/g, ' ');
  const candidatos = new Map<string, Array<{ calificador: string; porcentaje: number }>>();
  const dudas: string[] = [];
  for (const m of texto.matchAll(NUTRIENTE)) {
    const el = m[1].startsWith('N') ? 'NITROGENO' : m[1];
    const def = ELEMENTOS[el];
    // La forma: lo que está entre paréntesis antes del número (con la letra pegada, como "P(205)"), o después.
    const antes = /([A-Z]?)(\([^)]*\))/.exec(m[2]);
    const opciones = antes ? [antes[2], antes[1] + antes[2]] : [m[4] ?? ''];
    const forma = opciones.map(formaNormal).find(f => f === def.codigo) ?? formaNormal(opciones[0]);
    const calificador = m[2].replace(/[A-Z]?\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (forma !== def.codigo) { dudas.push(`"${m[0].trim()}": la forma química no corresponde al elemento`); continue; }
    const porcentaje = Number(m[3].replace(',', '.'));
    if (!(porcentaje > 0 && porcentaje <= 100)) continue;
    const lista = candidatos.get(el) ?? [];
    lista.push({ calificador, porcentaje });
    candidatos.set(el, lista);
  }
  const contenido = [];
  for (const [el, lista] of candidatos) {
    const def = ELEMENTOS[el];
    const elegido = def.preferir.map(p => lista.find(c => p.test(c.calificador))).find(Boolean);
    if (!elegido) continue; // p. ej. solo "fósforo total": no es lo que la planta aprovecha; no se toma
    contenido.push({ elemento: def.nombre, forma: def.forma, porcentaje: elegido.porcentaje });
  }
  return { contenido, dudas };
}

/**
 * Compara con el grado del nombre ("15-15-15", "GRADO 0-0-60"). Si falta un nutriente del grado, el
 * producto no se incluye; si el valor difiere (p. ej. fósforo total en el nombre y asimilable en la
 * composición), se marca por verificar.
 */
function revisarGrado(nombre: string, contenido: Array<{ forma: string; porcentaje: number }>): 'ok' | 'falta' | string {
  // Separado con guion, guion largo o espacios ("15-15-15", "8 – 23 – 29", "9 30 10").
  const g = /(?<![\d.,])(\d{1,2}(?:[.,]\d)?)(?:\s*[-–]\s*|\s+)(\d{1,2}(?:[.,]\d)?)(?:\s*[-–]\s*|\s+)(\d{1,2}(?:[.,]\d)?)(?![\d.,]*\s*%)\b/.exec(nombre);
  if (!g) return 'ok';
  const esperado: Array<[string, number]> = [['N', +g[1].replace(',', '.')], ['P₂O₅', +g[2].replace(',', '.')], ['K₂O', +g[3].replace(',', '.')]];
  const leido = (f: string) => contenido.find(c => c.forma === f)?.porcentaje ?? 0;
  if (esperado.some(([f, v]) => v > 0 && leido(f) === 0)) return 'falta';
  const distintos = esperado.filter(([f, v]) => Math.abs(leido(f) - v) > 1);
  return distintos.length ? `el grado del nombre (${g[0]}) no coincide con la composición leída (${distintos.map(([f]) => `${f} ${String(leido(f)).replace('.', ',')} %`).join(', ')})` : 'ok';
}

/** Kg del empaque: 50 si existe (el bulto usual), si no 25, si no el mayor hasta 50. */
function presentacionKg(texto = ''): number | undefined {
  const kilos = [...texto.toUpperCase().matchAll(/(\d+(?:[.,]\d+)?)\s*(?:KGS?|KILOS?|KILOGRAMOS?)\b/g)].map(m => Number(m[1].replace(',', '.')));
  if (kilos.includes(50)) return 50;
  if (kilos.includes(25)) return 25;
  const validos = kilos.filter(k => k > 0 && k <= 50);
  return validos.length ? Math.max(...validos) : undefined;
}

const archivo = process.argv[2];
if (!archivo) { console.error('Indica el archivo con las filas del ICA.'); process.exit(1); }
const filas = (JSON.parse(readFileSync(archivo, 'utf8')) as Fila[]).filter(f => f.item && f.registro);
const curados = new Set((JSON.parse(readFileSync(new URL('../data/referencias/fertilizantes.json', import.meta.url), 'utf8')) as Array<{ registroIca: string }>).map(f => f.registroIca));

const salida = [];
const vistos = new Set<string>();
let omitidos = 0;
for (const f of filas) {
  if (f.estado !== 'VIGENTE' || !/SUELO|FERTIRRIEGO/.test(f.uso ?? '') || !/FERTILIZANTE|ENMIENDA/.test(f.c1 ?? '')) continue;
  if (curados.has(f.registro!) || vistos.has(f.registro!)) continue;
  const { contenido, dudas } = composicion(f.comp ?? '');
  if (!contenido.length) { omitidos++; continue; }
  const grado = revisarGrado(f.nombre ?? '', contenido);
  if (grado === 'falta') { omitidos++; continue; }
  if (grado !== 'ok') dudas.unshift(grado);
  vistos.add(f.registro!);
  const producto = {
    id: `ica-${f.registro}`,
    nombre: (f.nombre ?? '').replace(/\s+/g, ' ').trim(),
    empresa: (f.empresa ?? '').replace(/\s+/g, ' ').trim(),
    registroIca: f.registro!,
    estadoRegistro: 'VIGENTE',
    composicionTexto: (f.comp ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
    contenido,
    presentacionKg: presentacionKg(f.present),
    precios: [],
    verificacion: dudas.length ? `por verificar: ${dudas.join('; ')}`.slice(0, 300) : 'ok',
    fuente: `${FUENTE}, p. ${f.pagina}, ítem ${f.item}.`,
    detalle: detalleDe(f)
  };
  if (!leerFertilizante(producto)) { omitidos++; continue; }
  salida.push(producto);
}
writeFileSync(new URL('../data/referencias/fertilizantes-ica.json', import.meta.url), JSON.stringify(salida) + '\n');

// Los 26 productos con precio DANE (fertilizantes.json) reciben los mismos datos del registro.
const rutaCurados = new URL('../data/referencias/fertilizantes.json', import.meta.url);
const listaCurados = JSON.parse(readFileSync(rutaCurados, 'utf8')) as Array<{ registroIca: string; detalle?: unknown }>;
for (const c of listaCurados) {
  const fila = filas.find(f => f.registro === c.registroIca);
  if (fila) c.detalle = detalleDe(fila);
}
writeFileSync(rutaCurados, JSON.stringify(listaCurados, null, 2) + '\n');
console.log(`${salida.length} fertilizantes del ICA (${salida.filter(p => p.verificacion !== 'ok').length} por verificar); ${omitidos} omitidos sin composición en % legible.`);
