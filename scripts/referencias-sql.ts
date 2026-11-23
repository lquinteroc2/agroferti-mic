/**
 * Genera el SQL que carga las referencias técnicas de data/referencias/ en D1 (tabla `referencias`).
 * Antes valida cada referencia con las mismas reglas que usa la app; si alguna no es válida, se
 * detiene sin generar nada. Uso: `npm run referencias:local` o `npm run referencias:nube`.
 * Desde el 23 de noviembre de 2026 la app recibe las referencias del archivo que se publica con cada
 * despliegue (ver vite.config.ts); la copia en D1 queda de respaldo, por si ese archivo faltara.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ARCHIVOS_REFERENCIAS, validarReferencias } from '../src/lib/paqueteReferencias.ts';

const RAIZ = new URL('../', import.meta.url);
const leer = (archivo: string): unknown[] => JSON.parse(readFileSync(new URL(`data/referencias/${archivo}`, RAIZ), 'utf8'));

const { filas, errores } = validarReferencias(ARCHIVOS_REFERENCIAS.map(a => ({ ...a, items: leer(a.archivo) })));
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
