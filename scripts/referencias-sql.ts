/**
 * Genera el SQL que carga las referencias técnicas de data/referencias/ en D1 (tabla `referencias`).
 * Antes valida cada referencia con las mismas reglas que usa la app; si alguna no es válida, se
 * detiene sin generar nada. Uso: `npm run referencias:local` o `npm run referencias:nube`.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { leerFertilizante, leerNivelSuelo, leerReglaDosis } from '../src/lib/referencias.ts';

const RAIZ = new URL('../', import.meta.url);
const leer = (archivo: string): unknown[] => JSON.parse(readFileSync(new URL(`data/referencias/${archivo}`, RAIZ), 'utf8'));

const conjuntos = [
  { tipo: 'fertilizante', archivo: 'fertilizantes.json', leer: leerFertilizante },
  { tipo: 'dosis', archivo: 'dosis.json', leer: leerReglaDosis },
  { tipo: 'nivel', archivo: 'niveles.json', leer: leerNivelSuelo }
] as const;

const filas: Array<{ tipo: string; id: string; datos: string }> = [];
const errores: string[] = [];
for (const c of conjuntos) {
  const ids = new Set<string>();
  leer(c.archivo).forEach((item, i) => {
    const valido = c.leer(item);
    if (!valido) { errores.push(`${c.archivo}, posición ${i}: no cumple el formato (revisa fuente, rangos y contenido).`); return; }
    if (ids.has(valido.id)) { errores.push(`${c.archivo}: el id "${valido.id}" está repetido.`); return; }
    ids.add(valido.id);
    filas.push({ tipo: c.tipo, id: valido.id, datos: JSON.stringify(valido) });
  });
}
if (errores.length) {
  console.error(`No se generó el SQL. ${errores.length} problema(s):\n- ${errores.join('\n- ')}`);
  process.exit(1);
}

const version = createHash('sha256').update(JSON.stringify(filas)).digest('hex').slice(0, 16);
const cadena = (s: string) => `'${s.replace(/'/g, "''")}'`;
const sql = [
  'DELETE FROM referencias;',
  ...filas.map(f => `INSERT INTO referencias (tipo, id, datos) VALUES (${cadena(f.tipo)}, ${cadena(f.id)}, ${cadena(f.datos)});`),
  `INSERT OR REPLACE INTO referencias_meta (clave, valor) VALUES ('version', ${cadena(version)});`
].join('\n');
mkdirSync(new URL('.wrangler/', RAIZ), { recursive: true });
writeFileSync(new URL('.wrangler/referencias.sql', RAIZ), sql);
const cuenta = (t: string) => filas.filter(f => f.tipo === t).length;
console.log(`Referencias válidas: ${cuenta('fertilizante')} fertilizantes, ${cuenta('dosis')} reglas de dosis, ${cuenta('nivel')} niveles. Versión ${version}.`);
