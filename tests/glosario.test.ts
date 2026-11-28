/**
 * Revisión UX, tanda 2: glosario para el productor. Son datos de texto: las pruebas cuidan que estén
 * completos, que el buscador encuentre lo que escribe un productor y que cada ayuda de la interfaz
 * apunte a un término que existe.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { buscarEnGlosario, CATEGORIAS_GLOSARIO, GLOSARIO, normalizarBusqueda, terminoGlosario } from '../src/lib/glosario.ts';
import { factorTexto, PARES_CONVERSION } from '../src/lib/conversionFormas.ts';

test('glosario: ids únicos y en formato estable; cada término completo y en una categoría que existe', () => {
  const ids = GLOSARIO.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length, 'hay ids repetidos');
  const categorias = new Set(CATEGORIAS_GLOSARIO.map(c => c.id));
  for (const t of GLOSARIO) {
    assert.match(t.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `id con formato inválido: ${t.id}`);
    assert.ok(categorias.has(t.categoria), `${t.id}: categoría desconocida`);
    assert.ok(t.termino.trim(), `${t.id}: sin nombre`);
    assert.match(t.definicion, /\S.*[.)]$/, `${t.id}: la definición debe terminar en punto`);
    if (t.ejemplo !== undefined) assert.ok(t.ejemplo.trim(), `${t.id}: ejemplo vacío`);
  }
  for (const c of CATEGORIAS_GLOSARIO) assert.ok(GLOSARIO.some(t => t.categoria === c.id), `categoría sin términos: ${c.id}`);
});

test('glosario: los nombres de término no se repiten (el buscador mostraría dos iguales)', () => {
  const nombres = GLOSARIO.map(t => normalizarBusqueda(t.termino));
  assert.equal(new Set(nombres).size, nombres.length);
});

test('buscador: sin tildes, sin mayúsculas y con subíndices o superíndices escritos como números', () => {
  assert.equal(normalizarBusqueda('Análisis'), 'analisis');
  assert.equal(normalizarBusqueda('K₂O'), 'k2o');
  assert.equal(normalizarBusqueda('P₂O₅'), 'p2o5');
  assert.equal(normalizarBusqueda('Ca²⁺'), 'ca2');
  assert.equal(normalizarBusqueda('Al³⁺'), 'al3');
  assert.equal(normalizarBusqueda('SO₄²⁻'), 'so42');
  assert.equal(normalizarBusqueda('  Bray II '), 'bray ii');
});

test('buscador: primero los términos cuyo nombre o alias coincide; todas las palabras deben aparecer', () => {
  assert.equal(buscarEnGlosario('p2o5')[0]?.id, 'p-p2o5');
  assert.equal(buscarEnGlosario('P₂O₅')[0]?.id, 'p-p2o5');
  assert.equal(buscarEnGlosario('bray')[0]?.id, 'bray-ii');
  assert.equal(buscarEnGlosario('COP')[0]?.id, 'pesos', 'quien busca la sigla vieja encuentra los pesos');
  assert.equal(buscarEnGlosario('aporte acompañante')[0]?.id, 'tambien-aporta', 'el nombre anterior sigue encontrando el término');
  assert.equal(buscarEnGlosario('version apartada')[0]?.id, 'cambios-que-chocaron');
  assert.ok(buscarEnGlosario('densidad aparente').some(t => t.id === 'densidad-aparente'));
  assert.deepEqual(buscarEnGlosario('palabra-que-no-existe'), []);
});

test('buscador: entiende los iones y unidades como se escriben en el celular (revisión de la tanda 2)', () => {
  assert.equal(buscarEnGlosario('K+')[0]?.id, 'k-k2o');
  assert.equal(buscarEnGlosario('Ca2+')[0]?.id, 'calcio-formas');
  assert.equal(buscarEnGlosario('Al3+')[0]?.id, 'iones-na-al');
  assert.equal(buscarEnGlosario('meq/100g')[0]?.id, 'meq');
  assert.equal(buscarEnGlosario('meq/100 g')[0]?.id, 'meq');
  assert.equal(buscarEnGlosario('10-30-10')[0]?.id, 'grado');
  assert.equal(buscarEnGlosario('kg/ha')[0]?.id, 'kg-ha');
  assert.deepEqual(buscarEnGlosario('+').length, GLOSARIO.length, 'solo signos: se muestra todo');
});

test('glosario: los nombres vigentes de la interfaz (tanda 1) y los factores de conversión son los que usa la app', () => {
  assert.equal(GLOSARIO.find(t => t.id === 'tambien-aporta')?.termino, 'También aporta');
  // Desde el 27 de noviembre de 2026 la app convierte P↔P₂O₅ y K↔K₂O: el glosario muestra los mismos factores.
  const [p, k] = ['P', 'K'].map(x => PARES_CONVERSION.find(c => c.simbolo === x)!);
  const pp = GLOSARIO.find(t => t.id === 'p-p2o5')!.definicion;
  assert.ok(pp.includes(`P × ${factorTexto(p.factor)}`) && pp.includes(`P₂O₅ × ${factorTexto(1 / p.factor)}`));
  const kk = GLOSARIO.find(t => t.id === 'k-k2o')!.definicion;
  assert.ok(kk.includes(`K × ${factorTexto(k.factor)}`) && kk.includes(`K₂O × ${factorTexto(1 / k.factor)}`));
});

test('buscador: sin texto devuelve todo o solo el tema elegido, en el orden del glosario', () => {
  assert.equal(buscarEnGlosario('').length, GLOSARIO.length);
  const medidas = buscarEnGlosario('   ', 'medidas');
  assert.ok(medidas.length > 0 && medidas.every(t => t.categoria === 'medidas'));
  assert.deepEqual(medidas.map(t => t.id), GLOSARIO.filter(t => t.categoria === 'medidas').map(t => t.id));
  assert.ok(buscarEnGlosario('bulto', 'suelo').every(t => t.categoria === 'suelo'));
});

test('interfaz: cada ayuda <Termino id> y <Terminos ids> apunta a un término del glosario', () => {
  const carpeta = new URL('../src/components/', import.meta.url);
  const archivos = [
    ...readdirSync(carpeta).filter(f => f.endsWith('.tsx')).map(f => new URL(f, carpeta)),
    new URL('../src/App.tsx', import.meta.url)
  ];
  const usados: string[] = [];
  for (const archivo of archivos) {
    const texto = readFileSync(archivo, 'utf-8');
    for (const m of texto.matchAll(/<Termino id="([^"]+)"/g)) usados.push(m[1]);
    for (const m of texto.matchAll(/<Terminos ids=\{\[([^\]]*)\]\}/g)) {
      for (const id of m[1].matchAll(/'([^']+)'/g)) usados.push(id[1]);
    }
  }
  assert.ok(usados.length > 20, 'se esperaban ayudas de términos en las pantallas');
  const faltan = [...new Set(usados)].filter(id => !terminoGlosario(id));
  assert.deepEqual(faltan, [], `ayudas que apuntan a términos inexistentes: ${faltan.join(', ')}`);
});
