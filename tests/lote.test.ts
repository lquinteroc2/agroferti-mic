/**
 * Área del lote: misma lectura de decimales que los formularios de suelo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { numeroATexto } from '../src/lib/formato.ts';
import { AREA_LOTE_MAX_M2, AREA_LOTE_MIN_M2, validarAreaLote } from '../src/lib/validacion.ts';

test('área del lote: acepta coma o punto decimal', () => {
  assert.deepEqual(validarAreaLote('1500,5'), { ok: true, valor: 1500.5 });
  assert.deepEqual(validarAreaLote('1500.5'), { ok: true, valor: 1500.5 });
  assert.deepEqual(validarAreaLote(' 500 '), { ok: true, valor: 500 });
  assert.deepEqual(validarAreaLote('0,01'), { ok: true, valor: AREA_LOTE_MIN_M2 });
});

test('área del lote: rechaza vacío, cero, negativos, texto y separadores de miles', () => {
  for (const malo of ['', '   ', '0', '-5', 'abc', '1.500,5', '1 500', '500 m²', 'Infinity', 'NaN']) {
    assert.equal(validarAreaLote(malo).ok, false, `debe rechazar "${malo}"`);
  }
});

test('área del lote: conserva los límites del formulario de la fase 1', () => {
  assert.equal(validarAreaLote('0,009').ok, false);
  assert.deepEqual(validarAreaLote(String(AREA_LOTE_MAX_M2)), { ok: true, valor: AREA_LOTE_MAX_M2 });
  assert.equal(validarAreaLote('10000000000,5').ok, false);
  assert.equal(validarAreaLote('1e300').ok, false);
});

test('área del lote: al editar, el texto precargado se lee igual que el valor guardado', () => {
  for (const area of [500, 1500.5, 0.01, 0.1 + 0.2, 123456.789, AREA_LOTE_MAX_M2]) {
    assert.deepEqual(validarAreaLote(numeroATexto(area)), { ok: true, valor: area });
  }
});
