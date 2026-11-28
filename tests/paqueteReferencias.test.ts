/**
 * Referencias que se publican con cada despliegue (y de respaldo en D1): las de data/referencias/ son
 * válidas y el JSON que entrega la API lo lee la app igual que antes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARCHIVOS_REFERENCIAS, cuerpoReferencias, filasParaLaApp, validarReferencias } from '../src/lib/paqueteReferencias.ts';
import { leerConjunto } from '../src/lib/referencias.ts';

const leer = (archivo: string): unknown[] => JSON.parse(readFileSync(new URL(`../data/referencias/${archivo}`, import.meta.url), 'utf8'));

test('referencias: todo data/referencias/ es válido (si no, el build se detiene)', () => {
  const { filas, errores } = validarReferencias(ARCHIVOS_REFERENCIAS.map(a => ({ ...a, items: leer(a.archivo) })));
  assert.deepEqual(errores, []);
  const fertilizantes = filas.filter(f => f.tipo === 'fertilizante');
  assert.ok(fertilizantes.length > 4000, 'el registro del ICA completo');
  const conPrecio = fertilizantes.filter(f => (JSON.parse(f.datos) as { precios: unknown[] }).precios.length > 0).length;
  assert.ok(conPrecio > 26, `fase 6: más fertilizantes con precio del DANE que los 26 de antes (hay ${conPrecio})`);
});

test('referencias: el JSON de la API lo lee la app y conserva la versión', () => {
  const { filas } = validarReferencias(ARCHIVOS_REFERENCIAS.map(a => ({ ...a, items: leer(a.archivo) })));
  const conjunto = leerConjunto(JSON.parse(cuerpoReferencias(filas, 'abcdef0123456789')));
  assert.ok(conjunto);
  assert.equal(conjunto.version, 'abcdef0123456789');
  assert.equal(conjunto.fertilizantes.length, filas.filter(f => f.tipo === 'fertilizante').length);
  assert.equal(conjunto.reglasDosis.length, filas.filter(f => f.tipo === 'dosis').length);
  assert.equal(conjunto.niveles.length, filas.filter(f => f.tipo === 'nivel').length);
});

test('referencias: una referencia dañada o repetida se informa con archivo y posición', () => {
  const buena = leer('fertilizantes.json')[0];
  const { filas, errores } = validarReferencias([{ tipo: 'fertilizante', archivo: 'prueba.json', items: [buena, { nombre: 'sin datos' }, buena] }]);
  assert.equal(filas.length, 1);
  assert.equal(errores.length, 2);
  assert.match(errores[0], /prueba\.json, posición 1: no cumple el formato/);
  assert.match(errores[1], /prueba\.json: el id ".+" está repetido/);
});

test('decisión del 27 de noviembre de 2026: la app solo recibe fertilizantes con precio del DANE (y todas las reglas)', () => {
  const { filas } = validarReferencias(ARCHIVOS_REFERENCIAS.map(a => ({ ...a, items: leer(a.archivo) })));
  const app = filasParaLaApp(filas);
  const fertilizantes = app.filter(f => f.tipo === 'fertilizante');
  assert.ok(fertilizantes.length > 26 && fertilizantes.length < 1000);
  assert.ok(fertilizantes.every(f => (JSON.parse(f.datos) as { precios: unknown[] }).precios.length > 0), 'ninguno sin precio');
  assert.equal(app.filter(f => f.tipo !== 'fertilizante').length, filas.filter(f => f.tipo !== 'fertilizante').length, 'reglas de dosis y niveles completos');
});
