import test from 'node:test';
import assert from 'node:assert/strict';
import { leerMetodos, unirMetodos } from '../src/lib/metodosLaboratorio.ts';

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
