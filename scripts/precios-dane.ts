/**
 * Actualiza los precios del DANE (SIPSA-I, anexo departamental) en data/referencias/.
 *
 *   node --experimental-strip-types scripts/precios-dane.ts            busca el mes nuevo en el DANE
 *   node --experimental-strip-types scripts/precios-dane.ts --archivo anexo-oct2026.xlsx [--mes 2026-10]
 *
 * Sin --archivo, prueba los meses posteriores al último que ya hay (hasta el mes pasado) y descarga el
 * más reciente que el DANE haya publicado; si no hay uno nuevo, no cambia nada. Lo corre cada mes la
 * acción de GitHub "Precios DANE" (.github/workflows/precios-dane.yml). Fuente: DANE, www.dane.gov.co.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { leerFertilizante, nombreMes } from '../src/lib/referencias.ts';
import { actualizarPrecios, filasDeFertilizantes, moverMes, periodoDeNombre, ultimoPeriodo, urlAnexo } from './precios-dane-lib.ts';
import { leerXlsx } from './xlsx.ts';

const RAIZ = new URL('../', import.meta.url);
const ARCHIVOS = [
  { nombre: 'fertilizantes.json', escribir: (d: unknown) => `${JSON.stringify(d, null, 2)}\n` },
  { nombre: 'fertilizantes-ica.json', escribir: (d: unknown) => `${JSON.stringify(d)}\n` }
] as const;
const CABECERAS = { 'user-agent': 'agroferti-mic (actualizacion de precios de referencia)' };

const argumento = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const datos = ARCHIVOS.map(a => ({ ...a, refs: JSON.parse(readFileSync(new URL(`data/referencias/${a.nombre}`, RAIZ), 'utf8')) as Record<string, unknown>[] }));
const ultimo = ultimoPeriodo(datos.flatMap(d => d.refs));

let periodo: string | undefined;
let anexo: Buffer;
const archivo = argumento('--archivo');
if (archivo) {
  periodo = argumento('--mes') ?? periodoDeNombre(basename(archivo));
  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) { console.error('Indica el mes con --mes AAAA-MM.'); process.exit(1); }
  anexo = readFileSync(archivo);
} else {
  const hoy = new Date();
  const mesPasado = moverMes(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`, -1);
  // Del mes pasado hacia atrás (hasta 3 meses), sin llegar al que ya tenemos. Se descarga directamente:
  // si el mes aún no está publicado, el DANE responde 404 (o una página que no es un .xlsx).
  let descargado: Buffer | undefined;
  for (let p = mesPasado; (!ultimo || p > ultimo) && p > moverMes(mesPasado, -4); p = moverMes(p, -1)) {
    const r = await fetch(urlAnexo(p), { headers: CABECERAS });
    const cuerpo = r.ok ? Buffer.from(await r.arrayBuffer()) : undefined;
    if (cuerpo && cuerpo.subarray(0, 2).toString('latin1') === 'PK') { periodo = p; descargado = cuerpo; break; }
  }
  if (!periodo || !descargado) { console.log(`No hay un mes nuevo del DANE: el último que tenemos es ${ultimo ? nombreMes(ultimo) : 'ninguno'}.`); process.exit(0); }
  anexo = descargado;
}

const filas = filasDeFertilizantes(leerXlsx(anexo));
// Un anexo normal trae cientos de filas; muy pocas quiere decir que el DANE cambió el formato.
if (filas.length < 100) { console.error(`El anexo de ${nombreMes(periodo)} tiene solo ${filas.length} filas de fertilizantes: revisa si cambió el formato.`); process.exit(1); }

let antes = 0, despues = 0;
const errores: string[] = [];
for (const d of datos) {
  antes += d.refs.filter(r => Array.isArray(r.precios) && r.precios.length > 0).length;
  const nuevas = actualizarPrecios(d.refs, filas, periodo);
  nuevas.forEach((r, i) => { if (!leerFertilizante(r)) errores.push(`${d.nombre}, posición ${i}: no cumple el formato después de actualizar.`); });
  despues += nuevas.filter(r => r.precios.length > 0).length;
  d.refs = nuevas;
}
if (errores.length) { console.error(`No se guardó nada:\n- ${errores.slice(0, 20).join('\n- ')}`); process.exit(1); }
for (const d of datos) writeFileSync(new URL(`data/referencias/${d.nombre}`, RAIZ), d.escribir(d.refs));

const departamentos = new Set(filas.map(f => f.departamento)).size;
console.log(`Precios del DANE de ${nombreMes(periodo)}: ${despues} fertilizantes con precio (antes ${antes}), ${filas.length} filas del anexo, ${departamentos} departamentos.`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `mes=${nombreMes(periodo)}\n`);
