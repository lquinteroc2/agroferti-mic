import test from 'node:test';
import assert from 'node:assert/strict';
import { areaM2AHa, equivalenciaMgKgAKgHa, masaSueloKgHa, productoKgHa } from '../src/lib/calculos.ts';

test('500 m² equivalen a 0,05 ha', () => {
  assert.equal(areaM2AHa(500), 0.05);
});

test('masa de suelo: 20 cm, 1,2 g/cm³ => 2.400.000 kg/ha', () => {
  assert.equal(masaSueloKgHa(20, 1.2), 2_400_000);
});

test('20 mg/kg en una capa de 2,4 M kg equivale dimensionalmente a 48 kg/ha', () => {
  assert.equal(equivalenciaMgKgAKgHa(20, 2_400_000), 48);
});

test('100 kg N/ha validados con producto al 46% requieren 217,39 kg producto/ha', () => {
  assert.ok(Math.abs(productoKgHa(100, 46) - 217.3913043478261) < 0.00001);
});

test('impide valores negativos y porcentaje cero', () => {
  assert.throws(() => areaM2AHa(-1), RangeError);
  assert.throws(() => equivalenciaMgKgAKgHa(-5, 2_000_000), RangeError);
  assert.throws(() => productoKgHa(20, 0), RangeError);
  assert.throws(() => productoKgHa(20, 101), RangeError);
});
