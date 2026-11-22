/**
 * Área del lote: misma lectura de decimales que los formularios de suelo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA_LOTE_MAX_M2, AREA_LOTE_MIN_M2, areaLoteATexto, MAX_ZONA_LOTE, problemaLote, UNIDADES_AREA, validarAreaEnUnidad, validarAreaLote, zonaLoteValida } from '../src/lib/validacion.ts';

test('área del lote: acepta coma o punto decimal', () => {
  assert.deepEqual(validarAreaLote('1500,5'), { ok: true, valor: 1500.5 });
  assert.deepEqual(validarAreaLote('1500.5'), { ok: true, valor: 1500.5 });
  assert.deepEqual(validarAreaLote(' 500 '), { ok: true, valor: 500 });
  assert.deepEqual(validarAreaLote('0,01'), { ok: true, valor: AREA_LOTE_MIN_M2 });
});

test('área del lote: rechaza "1.500" y "1,500" porque pueden ser miles o decimales', () => {
  for (const ambiguo of ['1.500', '1,500', '12.000', '999,999', ' 1.000 ']) {
    assert.equal(validarAreaLote(ambiguo).ok, false, `debe rechazar "${ambiguo}"`);
  }
  const r = validarAreaLote('1.500');
  assert.ok(!r.ok && r.error.includes('1500') && r.error.includes('1,5'), 'sugiere las dos escrituras');
  const mil = validarAreaLote('1.000');
  assert.ok(!mil.ok && mil.error.includes('1000') && mil.error.includes('escribe 1.'));
  const tresDecimales = validarAreaLote('1,125');
  assert.ok(!tresDecimales.ok && tresDecimales.error.includes('1125') && tresDecimales.error.includes('1,1250'));
});

test('área del lote: no son ambiguos los decimales con 0 inicial, otro número de cifras o 4+ enteros', () => {
  const casos: Array<[string, number]> = [
    ['1500', 1500], ['0,500', 0.5], ['0.500', 0.5], ['1.5', 1.5], ['1,50', 1.5], ['1,5000', 1.5],
    ['1,1250', 1.125], ['1234,567', 1234.567], ['1500,', 1500]
  ];
  for (const [texto, valor] of casos) assert.deepEqual(validarAreaLote(texto), { ok: true, valor }, texto);
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
  // 1.125 y 999.999 pudieron guardarse con el formulario anterior: se precargan sin ambigüedad.
  for (const area of [500, 1500.5, 0.01, 0.1 + 0.2, 123456.789, 1.125, 999.999, 1.5, AREA_LOTE_MAX_M2]) {
    assert.deepEqual(validarAreaLote(areaLoteATexto(area)), { ok: true, valor: area }, String(area));
  }
  assert.equal(areaLoteATexto(1.125), '1,1250');
  assert.equal(areaLoteATexto(1500), '1500');
});

test('área en hectáreas o fanegadas: se convierte a m² para guardar y calcular', () => {
  assert.deepEqual(validarAreaEnUnidad('1,5', 'ha'), { ok: true, valor: 15_000 });
  assert.deepEqual(validarAreaEnUnidad('0.25', 'ha'), { ok: true, valor: 2_500 });
  assert.deepEqual(validarAreaEnUnidad('1', 'fanegada'), { ok: true, valor: 6_400 });
  assert.deepEqual(validarAreaEnUnidad('0,3', 'fanegada'), { ok: true, valor: 1_920 }, 'sin restos binarios (0,3 × 6400)');
  assert.deepEqual(validarAreaEnUnidad('2,75', 'fanegada'), { ok: true, valor: 17_600 });
  assert.deepEqual(validarAreaEnUnidad('500', 'm2'), { ok: true, valor: 500 });
  assert.equal(validarAreaEnUnidad('1.500', 'ha').ok, false, 'la escritura ambigua se rechaza en cualquier unidad');
  assert.equal(validarAreaEnUnidad('0', 'fanegada').ok, false);
  assert.equal(validarAreaEnUnidad('-1', 'ha').ok, false);
  assert.equal(validarAreaEnUnidad('2000000', 'ha').ok, false, 'más de 10.000 millones de m²');
  assert.deepEqual(UNIDADES_AREA.map(u => [u.value, u.m2]), [['m2', 1], ['ha', 10_000], ['fanegada', 6_400]]);
});

test('revisión UX (tanda 3): la zona del lote es opcional; si está, debe ser un texto no vacío y corto', () => {
  const lote = { id: 'l1', nombre: 'Lote EJEMPLO', cultivo: 'papa', areaM2: 6400, createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z' };
  assert.equal(problemaLote(lote), null);
  assert.equal(problemaLote({ ...lote, zona: 'Subpáramos de Cundinamarca y Boyacá' }), null);
  assert.equal(problemaLote({ ...lote, zona: undefined }), null);
  for (const zona of [42, '', '   ', 'x'.repeat(MAX_ZONA_LOTE + 1)]) {
    assert.equal(problemaLote({ ...lote, zona }), 'La zona del lote no es válida.', `debe rechazar ${JSON.stringify(zona).slice(0, 20)}`);
  }
});

test('revisión de la tanda 3: la misma regla de zona sirve para ofrecerla, guardarla y validarla en la nube', () => {
  assert.equal(zonaLoteValida('Altiplano Cundiboyacense, Nariño y Antioquia'), true);
  assert.equal(zonaLoteValida('x'.repeat(MAX_ZONA_LOTE)), true);
  for (const zona of ['x'.repeat(MAX_ZONA_LOTE + 1), '', '  ', undefined, null, 3]) assert.equal(zonaLoteValida(zona), false);
});

test('revisión UX (tanda 5): el departamento del lote es opcional; si está, es un texto no vacío y corto', () => {
  const lote = { id: 'l1', nombre: 'Lote EJEMPLO', cultivo: 'papa', areaM2: 6400, createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z' };
  assert.equal(problemaLote({ ...lote, departamento: 'Boyacá' }), null);
  for (const departamento of [7, '', ' ', 'x'.repeat(61)]) assert.equal(problemaLote({ ...lote, departamento }), 'El departamento del lote no es válido.');
});
