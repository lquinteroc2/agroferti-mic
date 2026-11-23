/**
 * Paquete de referencias técnicas (catálogo ICA con precios DANE, reglas de dosis y niveles) tal como
 * lo recibe la app: se valida cada referencia con las mismas reglas de la app y se arma el JSON que
 * entrega `GET /api/referencias`. Lo usan el build (archivo que se publica con cada despliegue) y
 * scripts/referencias-sql.ts (copia en D1, de respaldo). Reglas puras: quien llama lee los archivos.
 */
import { leerFertilizante, leerNivelSuelo, leerReglaDosis } from './referencias.ts';

export type TipoReferencia = 'fertilizante' | 'dosis' | 'nivel';

/** Archivos de data/referencias/ y el tipo de cada uno. */
export const ARCHIVOS_REFERENCIAS: ReadonlyArray<{ tipo: TipoReferencia; archivo: string }> = [
  { tipo: 'fertilizante', archivo: 'fertilizantes.json' },
  // Todo el registro del ICA (generado con scripts/catalogo-ica.ts); precios del DANE con scripts/precios-dane.ts.
  { tipo: 'fertilizante', archivo: 'fertilizantes-ica.json' },
  { tipo: 'dosis', archivo: 'dosis.json' },
  { tipo: 'nivel', archivo: 'niveles.json' }
];

const LECTORES: Record<TipoReferencia, (v: unknown) => { id: string } | null> = {
  fertilizante: leerFertilizante, dosis: leerReglaDosis, nivel: leerNivelSuelo
};

export interface FilaReferencia { tipo: TipoReferencia; id: string; datos: string }

/** Valida cada referencia; los errores dicen archivo y posición. Un id repetido en un archivo es error. */
export function validarReferencias(conjuntos: ReadonlyArray<{ tipo: TipoReferencia; archivo: string; items: unknown[] }>): { filas: FilaReferencia[]; errores: string[] } {
  const filas: FilaReferencia[] = [];
  const errores: string[] = [];
  for (const c of conjuntos) {
    const ids = new Set<string>();
    c.items.forEach((item, i) => {
      const valido = LECTORES[c.tipo](item);
      if (!valido) { errores.push(`${c.archivo}, posición ${i}: no cumple el formato (revisa fuente, rangos y contenido).`); return; }
      if (ids.has(valido.id)) { errores.push(`${c.archivo}: el id "${valido.id}" está repetido.`); return; }
      ids.add(valido.id);
      filas.push({ tipo: c.tipo, id: valido.id, datos: JSON.stringify(valido) });
    });
  }
  return { filas, errores };
}

const DESTINO: Record<TipoReferencia, 'fertilizantes' | 'reglasDosis' | 'niveles'> = { fertilizante: 'fertilizantes', dosis: 'reglasDosis', nivel: 'niveles' };

/** JSON que entrega la API (mismo formato que arma el Worker desde D1). */
export function cuerpoReferencias(filas: ReadonlyArray<FilaReferencia>, version: string): string {
  const partes: Record<'fertilizantes' | 'reglasDosis' | 'niveles', string[]> = { fertilizantes: [], reglasDosis: [], niveles: [] };
  for (const f of filas) partes[DESTINO[f.tipo]].push(f.datos);
  return `{"version":${JSON.stringify(version)},"fertilizantes":[${partes.fertilizantes.join(',')}],"reglasDosis":[${partes.reglasDosis.join(',')}],"niveles":[${partes.niveles.join(',')}]}`;
}
