/**
 * Segunda auditoría: precisión al editar números, arrays dispersos y estructuras inesperadas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { areaM2AHa, equivalenciaMgKgAKgHa, equivalenciaTotalLoteKg, equivalenciasAnalisis, masaSueloKgHa } from '../src/lib/calculos.ts';
import { formatearExacto, formatearResultado, numeroATexto } from '../src/lib/formato.ts';
import {
  estadoDocumentacion,
  interpretarDecimal,
  parsearDecimal,
  validarDatosAnalisis,
  validarNumero,
  verificarAnalisis
} from '../src/lib/validacion.ts';

const HOY = new Date(2026, 9, 27);
const base = { id: 'a', loteId: 'l', fechaAnalisis: '2026-10-01', profundidadCm: 20, densidadGcm3: 1.2, laboratorio: 'Lab EJEMPLO', metodoLaboratorio: 'Método EJEMPLO' };

// ---- Corrección 1: ida y vuelta sin pérdida ----

test('ida y vuelta texto editable ↔ número sin modificar el valor', () => {
  const valores = [
    0, 1.2, 20, 0.1 + 0.2, 123456.789, 0.35, 1e-7, 1e-21, 1.5e-10, 5e-324, 2.2250738585072014e-308,
    Number.MAX_SAFE_INTEGER, 1e21, 1.7976931348623157e308, 9.87654321e-15, 4.94e-322
  ];
  for (const n of valores) {
    const texto = numeroATexto(n);
    assert.equal(parsearDecimal(texto), n, `${n} → "${texto}"`);
  }
  assert.equal(numeroATexto(1e-21), '1e-21', 'no se convierte en "0"');
  assert.equal(numeroATexto(1.2), '1,2', 'decimales normales con coma');
  assert.equal(numeroATexto(1e-7), '0,0000001');
});

test('el parser admite notación científica de forma estricta', () => {
  assert.equal(parsearDecimal('1,5e-3'), 0.0015);
  assert.equal(parsearDecimal('2.4E6'), 2_400_000);
  assert.equal(parsearDecimal('1e+2'), 100);
  for (const malo of ['e5', '1e', '1e+', '1,2,3', '1.2.3', '1 000', '0x10', '1e5.5', 'Infinity', 'NaN', '--1', '1,5 e3']) {
    assert.ok(Number.isNaN(parsearDecimal(malo)), `debe rechazar "${malo}"`);
  }
  assert.equal(interpretarDecimal('1e-400').estado, 'subdesbordamiento', 'no se pierde en silencio como 0');
  assert.equal(interpretarDecimal('0e-400').estado, 'ok', 'un cero real sigue siendo cero');
  assert.match((validarNumero('1e-400', { campo: 'Valor' }) as { error: string }).error, /demasiado pequeño/);
  assert.match((validarNumero('1e400', { campo: 'Valor' }) as { error: string }).error, /demasiado grande/);
});

test('presentación: "≈" solo cuando lo mostrado está redondeado; datos ingresados sin redondeo', () => {
  assert.equal(formatearResultado(48, 3), '48');
  assert.equal(formatearResultado(2.4, 3), '2,4');
  assert.equal(formatearResultado(2.40004, 3), '≈ 2,4');
  assert.equal(formatearResultado(0.0004, 3), '< 0,001');
  assert.equal(formatearExacto(0.123456789), '0,123456789');
  assert.equal(formatearExacto(1e-21), '1e-21');
  assert.equal(formatearExacto(2_400_000), '2.400.000');
});

test('subdesbordamiento: operandos positivos no producen 0 en silencio', () => {
  assert.throws(() => masaSueloKgHa(5e-324, 5e-324), /demasiado pequeño/);
  assert.throws(() => equivalenciaMgKgAKgHa(5e-324, 1), /demasiado pequeño/);
  assert.ok(equivalenciaMgKgAKgHa(5e-324, 2_400_000) > 0, 'si el resultado es representable, se calcula');
  assert.throws(() => equivalenciaTotalLoteKg(5e-324, 500), /demasiado pequeño/);
  assert.throws(() => areaM2AHa(5e-324), /demasiado pequeño/);
  assert.equal(equivalenciaMgKgAKgHa(0, 2_400_000), 0, 'un cero real sí da cero');
  // 1e-4 cm × 1e-4 g/cm³ => masa 1e-4 kg/ha; 5e-324 mg/kg × 1e-4 / 1e6 se perdería como 0.
  const eq = equivalenciasAnalisis({ profundidadCm: 1e-4, densidadGcm3: 1e-4, areaM2AlRegistro: 500, nutrientes: [{ elemento: 'Fósforo', forma: 'P', valor: 5e-324, unidad: 'mg/kg' }] });
  assert.ok(eq.masaKgHa.ok);
  assert.equal(eq.nutrientes[0].estado, 'suspendida');
});

// ---- Corrección 3: arrays dispersos y estructuras inesperadas ----

test('array disperso new Array(1): se detecta el hueco y no se documenta', () => {
  const v = verificarAnalisis({ ...base, nutrientes: new Array(1) });
  assert.equal(v.nutrientes.length, 1, 'el hueco se recorre explícitamente');
  assert.equal(v.problemas.find(p => p.campo === 'nutrientes.0')?.detalle, 'Posición vacía en la lista de resultados.');
  assert.equal(estadoDocumentacion(v).documentado, false);
  assert.doesNotThrow(() => equivalenciasAnalisis(v));
  const r = validarDatosAnalisis({ ...base, nutrientes: new Array(1) }, { hoy: HOY });
  assert.equal(r.ok, false);
});

test('huecos mezclados con valores: se informa cada posición', () => {
  const lista: unknown[] = [];
  lista[0] = { elemento: 'Fósforo', forma: 'P', valor: 20, unidad: 'mg/kg' };
  lista[2] = { elemento: 'Potasio', forma: 'K', valor: 3, unidad: 'mg/kg' };
  const v = verificarAnalisis({ ...base, nutrientes: lista });
  assert.equal(v.nutrientes.length, 3);
  assert.deepEqual(v.problemas.map(p => p.campo), ['nutrientes.1']);
  const eq = equivalenciasAnalisis({ ...v, areaM2AlRegistro: 500 });
  assert.deepEqual(eq.nutrientes.map(n => n.estado), ['calculada', 'suspendida', 'calculada']);
});

test('null, undefined, objetos incorrectos y primitivas en la lista de nutrientes', () => {
  const v = verificarAnalisis({ ...base, nutrientes: [null, undefined, 7, 'P', [], { elemento: 1, forma: {}, valor: '20', unidad: null }] });
  const detalles = v.problemas.map(p => p.detalle);
  assert.equal(v.problemas.length, 6);
  assert.match(detalles[0], /null/);
  assert.match(detalles[1], /undefined/);
  assert.equal(estadoDocumentacion(v).documentado, false);
  assert.equal(v.nutrientes[5].valorTexto, '20', 'el valor original se conserva para corregirlo');
});

test('lista vacía o con estructura inesperada no cuenta como resultados válidos', () => {
  assert.equal(estadoDocumentacion(verificarAnalisis({ ...base, nutrientes: [] })).documentado, false);
  assert.equal(estadoDocumentacion(verificarAnalisis({ ...base, nutrientes: [], ph: 5.5 })).documentado, true, 'el pH sí es un resultado');
  for (const raro of ['P=20', 42, { 0: 'x' }, true]) {
    const v = verificarAnalisis({ ...base, nutrientes: raro });
    assert.ok(v.problemas.some(p => p.campo === 'nutrientes'));
    assert.equal(estadoDocumentacion(v).documentado, false);
  }
  const larga = verificarAnalisis({ ...base, nutrientes: new Array(1_000_000) });
  assert.ok(larga.problemas.some(p => p.campo === 'nutrientes' && /supera/.test(p.detalle)), 'lista enorme: aviso controlado');
});

test('solo resultados dañados, aunque haya laboratorio y método, no es "documentado"', () => {
  const v = verificarAnalisis({ ...base, nutrientes: [{ elemento: 'Fósforo', forma: 'P', valor: Number.NaN, unidad: 'mg/kg' }] });
  const estado = estadoDocumentacion(v);
  assert.equal(estado.documentado, false);
  assert.ok(estado.pendientes.some(p => /válidos/.test(p)));
});

test('validarDatosAnalisis y verificarAnalisis nunca lanzan con datos malformados', () => {
  const trampa = { get nutrientes() { throw new Error('getter roto'); }, fechaAnalisis: '2026-01-01', profundidadCm: 20 };
  const proxy = new Proxy({}, { ownKeys: () => { throw new Error('proxy roto'); } });
  const circular: Record<string, unknown> = { fechaAnalisis: '2026-01-01', profundidadCm: 20 };
  circular.nutrientes = [circular];
  for (const raro of [trampa, proxy, circular, new Array(3), Object.create(null), new Date(), () => 1, Symbol('x')]) {
    assert.doesNotThrow(() => validarDatosAnalisis(raro, { hoy: HOY }));
    assert.doesNotThrow(() => verificarAnalisis(raro));
    assert.equal(validarDatosAnalisis(raro, { hoy: HOY }).ok, false);
  }
});

test('campos de otras versiones se identifican; campos extra de un nutriente avisan sin suspender el cálculo', () => {
  const v = verificarAnalisis({ ...base, areaM2AlRegistro: 500, version: 9, notasLab: 'x', nutrientes: [{ elemento: 'Fósforo', forma: 'P', valor: 20, unidad: 'mg/kg', metodo: 'Bray II' }] });
  assert.deepEqual(v.camposAdicionales, ['version', 'notasLab']);
  assert.match(v.problemas.find(p => p.campo === 'nutrientes.0')?.detalle ?? '', /metodo/);
  const [p] = equivalenciasAnalisis(v).nutrientes;
  assert.ok(p.estado === 'calculada' && p.kgHa === 48);
});

test('observaciones y textos con estructura inesperada se informan con su valor original', () => {
  const v = verificarAnalisis({ ...base, nutrientes: [], observaciones: { texto: 'lluvia' }, laboratorio: 12 });
  const obs = v.problemas.find(p => p.campo === 'observaciones');
  assert.equal(obs?.valorOriginal, '{"texto":"lluvia"}');
  assert.equal(obs?.textoEditable, undefined, 'una estructura no se convierte en texto editable');
  assert.equal(v.problemas.find(p => p.campo === 'laboratorio')?.textoEditable, '12');
});
