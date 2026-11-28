/**
 * Conversión entre la forma elemental y el óxido de un nutriente (decisión del 27 de noviembre de
 * 2026, sugerencia del instructor). Los factores salen de los pesos atómicos estándar de la IUPAC.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { conversionEntre, factorTexto, otraForma, PARES_CONVERSION } from '../src/lib/conversionFormas.ts';

const cerca = (a: number, b: number, tol = 1e-4) => assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`);

test('conversión: factores químicos exactos (pesos atómicos IUPAC)', () => {
  const f = Object.fromEntries(PARES_CONVERSION.map(p => [p.simbolo, p.factor]));
  cerca(f.P, 2.2914);   // P₂O₅ = P × 2,2914
  cerca(f.K, 1.2046);   // K₂O = K × 1,2046
  cerca(f.Ca, 1.3992);  // CaO = Ca × 1,3992
  cerca(f.Mg, 1.6583);  // MgO = Mg × 1,6583
  cerca(1 / f.P, 0.4364);
  cerca(1 / f.K, 0.8301);
  assert.equal(factorTexto(f.P), '2,2914');
});

test('conversión: P ↔ P₂O₅ y K ↔ K₂O en los dos sentidos, como se escriban', () => {
  const p = conversionEntre({ elemento: 'Fósforo', forma: 'P' }, { elemento: 'Fósforo', forma: 'P2O5' });
  assert.equal(p?.desde, 'P');
  assert.equal(p?.hacia, 'P₂O₅');
  cerca(p!.factor, 2.2914);
  const k = conversionEntre({ elemento: 'Potasio', forma: 'K₂O' }, { elemento: 'K', forma: 'K' });
  assert.equal(k?.hacia, 'K');
  cerca(k!.factor, 0.8301);
  cerca(140 * conversionEntre({ elemento: 'Fósforo', forma: 'P' }, { elemento: 'Fósforo', forma: 'P₂O₅' })!.factor, 320.79, 0.01);
});

test('conversión: no se convierte lo que no es elemento ↔ óxido del mismo nutriente', () => {
  assert.equal(conversionEntre({ elemento: 'Fósforo', forma: 'P' }, { elemento: 'Fósforo', forma: 'P' }), undefined, 'misma forma: no hace falta');
  assert.equal(conversionEntre({ elemento: 'Fósforo', forma: 'P₂O₅' }, { elemento: 'Potasio', forma: 'K₂O' }), undefined, 'otro nutriente');
  assert.equal(conversionEntre({ elemento: 'Potasio', forma: 'K⁺' }, { elemento: 'Potasio', forma: 'K₂O' }), undefined, 'la forma iónica del análisis no');
  assert.equal(conversionEntre({ elemento: 'Nitrógeno', forma: 'N' }, { elemento: 'Nitrógeno', forma: 'NO₃⁻' }), undefined, 'el nitrógeno no tiene óxido aquí');
  assert.equal(conversionEntre({ elemento: 'Azufre', forma: 'S' }, { elemento: 'Azufre', forma: 'SO₄²⁻' }), undefined);
});

test('conversión: la otra forma del nutriente para buscar fertilizantes', () => {
  assert.equal(otraForma({ elemento: 'Fósforo', forma: 'P' }), 'P₂O₅');
  assert.equal(otraForma({ elemento: 'Potasio', forma: 'K2O' }), 'K');
  assert.equal(otraForma({ elemento: 'Potasio', forma: 'K⁺' }), undefined);
  assert.equal(otraForma({ elemento: 'Nitrógeno', forma: 'N' }), undefined);
});
