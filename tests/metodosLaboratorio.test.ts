import test from 'node:test';
import assert from 'node:assert/strict';
import { OTRO_METODO, leerMetodos, mensajeAlLaboratorio, metodoDeclarado, unirMetodos } from '../src/lib/metodosLaboratorio.ts';

test('métodos: se guardan como un texto y se vuelven a leer igual', () => {
  const partes = { p: 'Bray II', bases: 'Acetato de amonio', otros: 'Walkley-Black, DTPA' };
  const texto = unirMetodos(partes);
  assert.equal(texto, 'Bray II (fósforo), Acetato de amonio (potasio, calcio y magnesio), Walkley-Black, DTPA');
  assert.deepEqual(leerMetodos(texto), partes);
  assert.equal(unirMetodos({ p: '', bases: '', otros: '' }), '', 'si no aparece en el informe, queda vacío');
});

test('métodos: un texto escrito antes o leído de un archivo se reconoce sin perder el resto', () => {
  assert.deepEqual(leerMetodos('Bray II, Acetato de amonio, Walkley-Black'), { p: 'Bray II', bases: 'Acetato de amonio', otros: 'Walkley-Black' });
  assert.deepEqual(leerMetodos('Método propio del laboratorio'), { p: '', bases: '', otros: 'Método propio del laboratorio' });
});

// Fase 6, informe del equipo: «lo del método de laboratorio es confuso; el productor no lo sabe o el
// laboratorio no lo dice». Solo el método del fósforo cambia lo que la app propone.
test('fase 6: un fósforo medido con otro método (sin saber cuál) se guarda y se vuelve a leer igual', () => {
  const partes = { p: OTRO_METODO, bases: '', otros: 'Walkley-Black' };
  const texto = unirMetodos(partes);
  assert.equal(texto, 'Otro método (fósforo), Walkley-Black');
  assert.deepEqual(leerMetodos(texto), partes);
  assert.deepEqual(leerMetodos('Truog (fósforo)'), { p: 'Truog', bases: '', otros: '' }, 'un método escrito a mano tampoco se pierde');
});

test('fase 6: método declarado por nutriente (solo el del fósforo y el de las bases)', () => {
  const texto = 'Olsen (fósforo), Acetato de amonio (potasio, calcio y magnesio)';
  assert.equal(metodoDeclarado(texto, 'P'), 'Olsen');
  assert.equal(metodoDeclarado(texto, 'K'), 'Acetato de amonio');
  assert.equal(metodoDeclarado(texto, 'N'), '');
  assert.equal(metodoDeclarado('', 'P'), '', 'sin método: el informe no lo dice');
});

test('fase 6: mensaje para preguntarle al laboratorio por el método del fósforo', () => {
  const m = mensajeAlLaboratorio('01 de oct de 2026');
  assert.match(m, /análisis de suelo del 01 de oct de 2026/);
  assert.match(m, /método midieron el fósforo \(P\)/);
  assert.match(m, /Bray II u Olsen/);
  assert.match(mensajeAlLaboratorio(), /el análisis de suelo que me hicieron/, 'sin fecha también sirve');
});
