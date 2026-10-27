import test from 'node:test';
import assert from 'node:assert/strict';
import {
  equivalenciaMgKgAKgHa,
  equivalenciaTotalLoteKg,
  equivalenciasAnalisis,
  masaSueloKgHa,
  productoKgHa
} from '../src/lib/calculos.ts';
import { claveForma, coherenciaNutriente } from '../src/lib/catalogoNutrientes.ts';
import { formatearNumero, numeroATexto } from '../src/lib/formato.ts';
import {
  estadoDocumentacion,
  ordenarAnalisis,
  parsearDecimal,
  validarAnalisis,
  validarDatosAnalisis,
  validarFechaAnalisis,
  validarNumero,
  validarNutriente,
  verificarAnalisis,
  type EntradaAnalisis,
  type EntradaNutriente
} from '../src/lib/validacion.ts';

const HOY = new Date(2026, 9, 27); // 27 oct 2026, hora local

const fila = (cambios: Partial<EntradaNutriente> = {}): EntradaNutriente => ({
  elemento: 'Fósforo', forma: 'P', valor: '20', unidad: 'mg/kg', elementoLibre: false, formaLibre: false, ...cambios
});

function entrada(cambios: Partial<EntradaAnalisis> = {}): EntradaAnalisis {
  return {
    fechaAnalisis: '2026-10-01',
    profundidadCm: '20',
    densidadGcm3: '1,2',
    ph: '',
    laboratorio: 'Laboratorio EJEMPLO',
    metodoLaboratorio: 'Método EJEMPLO',
    nutrientes: [fila()],
    observaciones: '',
    ...cambios
  };
}

function validos(cambios: Partial<EntradaAnalisis> = {}) {
  const r = validarAnalisis(entrada(cambios), HOY);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errores));
  return r.datos;
}

// ---- Cálculos de referencia ----

test('cadena completa: 20 cm, 1,2 g/cm³, 20 mg/kg, 500 m² => 2.400.000 kg/ha, 48 kg/ha, 2,4 kg', () => {
  const datos = validos();
  const eq = equivalenciasAnalisis({ ...datos, areaM2AlRegistro: 500 });
  assert.deepEqual(eq.masaKgHa, { ok: true, valor: 2_400_000 });
  assert.deepEqual(eq.areaHa, { ok: true, valor: 0.05 });
  const [p] = eq.nutrientes;
  assert.equal(p.estado, 'calculada');
  if (p.estado === 'calculada') {
    assert.equal(p.kgHa, 48);
    assert.deepEqual(p.kgLote, { ok: true, valor: 2.4 });
    assert.equal(p.nutriente.forma, 'P', 'la forma reportada se conserva: P no se convierte en P₂O₅');
  }
});

test('equivalencia total del lote: 48 kg/ha en 500 m² => 2,4 kg', () => {
  assert.equal(equivalenciaTotalLoteKg(48, 500), 2.4);
  assert.throws(() => equivalenciaTotalLoteKg(48, 0), RangeError);
  assert.throws(() => equivalenciaTotalLoteKg(-1, 500), RangeError);
});

test('sin área histórica: calcula kg/ha pero no el total del lote ni usa otra área', () => {
  const eq = equivalenciasAnalisis(validos());
  assert.equal(eq.areaHa.ok, false);
  if (!eq.areaHa.ok) assert.equal(eq.areaHa.motivo, 'falta-dato');
  const [p] = eq.nutrientes;
  assert.ok(p.estado === 'calculada' && p.kgHa === 48 && !p.kgLote.ok);
});

// ---- Entrada de números ----

test('acepta decimales con coma o punto', () => {
  assert.equal(parsearDecimal('1,2'), 1.2);
  assert.equal(parsearDecimal(' 1.2 '), 1.2);
  assert.equal(parsearDecimal(',5'), 0.5);
  assert.equal(parsearDecimal(''), null);
  assert.ok(Number.isNaN(parsearDecimal('1.200,5')), 'separador de miles ambiguo');
  assert.equal(parsearDecimal('1e3'), 1000, 'notación científica admitida explícitamente');
  assert.ok(Number.isNaN(parsearDecimal('abc')));
});

test('rechaza negativos, densidad cero, no finitos y pH fuera de 0–14', () => {
  assert.equal(validarNumero('-3', { campo: 'Valor' }).ok, false);
  assert.equal(validarNumero('0', { campo: 'Densidad', positivo: true }).ok, false);
  assert.equal(validarNumero('Infinity', { campo: 'Valor' }).ok, false);
  assert.equal(validarNumero('', { campo: 'Profundidad', requerido: true }).ok, false);
  assert.deepEqual(validarNumero('', { campo: 'pH', max: 14 }), { ok: true, valor: undefined });
  assert.equal(validarNumero('14,5', { campo: 'pH', max: 14 }).ok, false);

  const r = validarAnalisis(entrada({ profundidadCm: '0', densidadGcm3: '0', ph: '15' }), HOY);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.errores.profundidadCm);
    assert.ok(r.errores.densidadGcm3);
    assert.ok(r.errores.ph);
  }
});

test('fechas: válidas, inexistentes y futuras', () => {
  assert.deepEqual(validarFechaAnalisis('2026-10-27', HOY), { ok: true, valor: '2026-10-27' });
  assert.equal(validarFechaAnalisis('2026-10-28', HOY).ok, false);
  assert.equal(validarFechaAnalisis('2026-02-30', HOY).ok, false);
  assert.equal(validarFechaAnalisis('27/10/2026', HOY).ok, false);
  assert.equal(validarFechaAnalisis('', HOY).ok, false);
});

// ---- Desbordamientos ----

test('valores extremos: rechaza números que exceden la precisión y cálculos que dan Infinity', () => {
  assert.equal(validarNumero('9'.repeat(400), { campo: 'Valor' }).ok, false, 'Infinity al convertir');
  assert.equal(validarNumero('9007199254740993', { campo: 'Valor' }).ok, false, 'supera MAX_SAFE_INTEGER');
  assert.equal(validarNumero('9007199254740991', { campo: 'Valor' }).ok, true);
  assert.throws(() => masaSueloKgHa(1e300, 1e300), RangeError);
  assert.throws(() => equivalenciaMgKgAKgHa(1e15, 1e15), RangeError);
  assert.throws(() => equivalenciaTotalLoteKg(1e15, 1e15), RangeError);
  assert.throws(() => productoKgHa(1e15, 1e-10), RangeError);
});

test('el formulario rechaza entradas finitas cuyo cálculo se desborda, con mensaje sencillo', () => {
  const r = validarAnalisis(entrada({ profundidadCm: '1000000000000000', densidadGcm3: '1000' }), HOY);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errores.general?.join(' ') ?? '', /demasiado grande/);
});

test('equivalenciasAnalisis no lanza con datos extremos: informa desbordamiento', () => {
  const eq = equivalenciasAnalisis({
    profundidadCm: 1e15, densidadGcm3: 1e15, areaM2AlRegistro: 500,
    nutrientes: [{ elemento: 'Fósforo', forma: 'P', valor: 20, unidad: 'mg/kg' }]
  });
  assert.equal(eq.masaKgHa.ok, false);
  if (!eq.masaKgHa.ok) assert.equal(eq.masaKgHa.motivo, 'desbordamiento');
  assert.equal(eq.nutrientes[0].estado, 'suspendida');
});

// ---- Unidades y coherencia elemento / forma ----

test('rechaza unidades no admitidas y valores de nutriente negativos', () => {
  assert.equal(validarNutriente(fila({ unidad: 'ppm' })).ok, false);
  assert.equal(validarNutriente(fila({ unidad: 'kg/ha' })).ok, false);
  assert.equal(validarNutriente(fila({ valor: '-1' })).ok, false);
  const r = validarAnalisis(entrada({ nutrientes: [fila({ unidad: 'ppm' })] }), HOY);
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errores.nutrientes?.[0]);
});

test('coherencia: combinaciones correctas del catálogo', () => {
  for (const [el, forma] of [['Fósforo', 'P'], ['Fósforo', 'P₂O₅'], ['Potasio', 'K'], ['Potasio', 'K₂O'], ['Potasio', 'K⁺'], ['Nitrógeno', 'NO₃⁻'], ['Calcio', 'Ca²⁺']]) {
    assert.deepEqual(coherenciaNutriente(el, forma), { reconocido: true }, `${el}/${forma}`);
    assert.equal(validarNutriente(fila({ elemento: el, forma })).ok, true, `${el}/${forma}`);
  }
  assert.equal(coherenciaNutriente('fosforo', 'P2O5').reconocido, true, 'sin tildes ni subíndices');
  assert.equal(coherenciaNutriente('P', 'P').reconocido, true, 'por símbolo');
});

test('coherencia: rechaza combinaciones incorrectas aunque se escriban como "Otro"', () => {
  assert.match(coherenciaNutriente('Fósforo', 'K₂O').error ?? '', /Potasio/);
  assert.equal(validarNutriente(fila({ forma: 'K₂O' })).ok, false);
  assert.equal(validarNutriente(fila({ forma: 'K2O', formaLibre: true })).ok, false);
  assert.equal(validarNutriente(fila({ elemento: 'Potasio', forma: 'P₂O₅', elementoLibre: true })).ok, false);
  assert.equal(validarNutriente(fila({ elemento: 'Fosfato' })).ok, false, 'fuera del catálogo sin elegir "Otro"');
  assert.equal(validarNutriente(fila({ forma: 'H₂PO₄⁻' })).ok, false, 'forma fuera de la lista sin elegir "Otra"');
  // P y P₂O₅ siguen siendo formas distintas.
  assert.notEqual(claveForma('P'), claveForma('P₂O₅'));
  assert.notEqual(claveForma('K'), claveForma('K₂O'));
});

test('"Otro / No reconocido" conserva el texto original sin convertir', () => {
  const forma = validarNutriente(fila({ forma: 'H₂PO₄⁻', formaLibre: true }));
  assert.deepEqual(forma, { ok: true, valor: { elemento: 'Fósforo', forma: 'H₂PO₄⁻', valor: 20, unidad: 'mg/kg' } });
  const libre = validarNutriente(fila({ elemento: ' Molibdeno ', forma: 'Mo', elementoLibre: true }));
  assert.deepEqual(libre, { ok: true, valor: { elemento: 'Molibdeno', forma: 'Mo', valor: 20, unidad: 'mg/kg' } });
  assert.equal(coherenciaNutriente('Molibdeno', 'Mo').reconocido, false);
});

test('conserva cmol(+)/kg sin convertir a mg/kg ni calcular kg/ha', () => {
  const datos = validos({ nutrientes: [fila({ elemento: 'Potasio', forma: 'K⁺', valor: '0,35', unidad: 'cmol(+)/kg' })] });
  assert.deepEqual(datos.nutrientes, [{ elemento: 'Potasio', forma: 'K⁺', valor: 0.35, unidad: 'cmol(+)/kg' }]);
  const [k] = equivalenciasAnalisis({ ...datos, areaM2AlRegistro: 500 }).nutrientes;
  assert.equal(k.estado, 'no-convertible');
  assert.deepEqual(k.nutriente, { elemento: 'Potasio', forma: 'K⁺', valor: 0.35, unidad: 'cmol(+)/kg' });
});

test('sin densidad aparente no se asume un valor ni se calculan equivalencias', () => {
  const datos = validos({ densidadGcm3: '' });
  assert.equal(datos.densidadGcm3, undefined);
  const eq = equivalenciasAnalisis({ ...datos, areaM2AlRegistro: 500 });
  assert.equal(eq.masaKgHa.ok, false);
  if (!eq.masaKgHa.ok) assert.equal(eq.masaKgHa.motivo, 'falta-dato');
  assert.equal(eq.nutrientes[0].estado, 'suspendida');
  assert.ok(!('kgHa' in eq.nutrientes[0]));
});

test('ignora filas de nutriente vacías y recorta textos opcionales', () => {
  const datos = validos({
    laboratorio: '  ',
    observaciones: ' Muestra tomada tras lluvia ',
    nutrientes: [fila({ elemento: '', forma: '', valor: '' })]
  });
  assert.deepEqual(datos.nutrientes, []);
  assert.equal(datos.laboratorio, undefined);
  assert.equal(datos.observaciones, 'Muestra tomada tras lluvia');
});

test('ningún resultado contiene dosis, recomendaciones ni prescripciones', () => {
  const datos = validos({
    nutrientes: [fila({ forma: 'P₂O₅' }), fila({ elemento: 'Calcio', forma: 'Ca²⁺', valor: '4', unidad: 'cmol(+)/kg' })]
  });
  const prohibido = /dosis|recomend|prescrip|aplicar|fertiliz/i;
  const claves = (obj: unknown): string[] =>
    obj && typeof obj === 'object' ? Object.entries(obj).flatMap(([k, v]) => [k, ...claves(v)]) : [];
  for (const clave of [...claves(datos), ...claves(equivalenciasAnalisis({ ...datos, areaM2AlRegistro: 500 }))]) {
    assert.doesNotMatch(clave, prohibido);
  }
});

// ---- Registros antiguos o dañados ----

test('lee registros antiguos con nutrientesMgKg sin alterar los valores', () => {
  const antiguo = { id: 'a', loteId: 'l', fechaAnalisis: '2026-01-01', profundidadCm: 20, nutrientesMgKg: { P: 15 } };
  const copia = structuredClone(antiguo);
  const v = verificarAnalisis(antiguo);
  assert.deepEqual(v.problemas, []);
  assert.equal(v.nutrientes.length, 1);
  const { elemento, forma, valor, unidad, reconocido, problema } = v.nutrientes[0];
  assert.deepEqual({ elemento, forma, valor, unidad, reconocido, problema }, { elemento: 'P', forma: 'P', valor: 15, unidad: 'mg/kg', reconocido: true, problema: undefined });
  assert.equal(v.areaM2AlRegistro, undefined, 'sin área histórica: no se reconstruye');
  assert.deepEqual(antiguo, copia, 'el registro leído no se modifica');
});

test('registros dañados (null, NaN, tipos y estructuras inesperadas) no lanzan errores', () => {
  for (const crudo of [null, undefined, 42, 'texto', [], {}]) {
    const v = verificarAnalisis(crudo);
    assert.ok(v.problemas.length > 0);
    assert.doesNotThrow(() => equivalenciasAnalisis(v));
    assert.doesNotThrow(() => estadoDocumentacion(v));
  }
  const v = verificarAnalisis({
    id: 'x', loteId: 'l', fechaAnalisis: '2026-13-40', profundidadCm: 20, densidadGcm3: Number.NaN,
    ph: null, laboratorio: 7, areaM2AlRegistro: -5,
    nutrientes: [null, { elemento: 'Fósforo', forma: 'P', valor: Number.NaN, unidad: 'mg/kg' },
      { elemento: 'Fósforo', forma: 'K₂O', valor: 5, unidad: 'mg/kg' }, { elemento: 'Potasio', forma: 'K', valor: 3, unidad: 'ppm' },
      { elemento: 'Calcio', forma: 'Ca', valor: 3, unidad: 'mg/kg' }]
  });
  const campos = v.problemas.map(p => p.campo);
  for (const campo of ['fechaAnalisis', 'densidadGcm3', 'laboratorio', 'areaM2AlRegistro', 'nutrientes.0', 'nutrientes.1', 'nutrientes.2', 'nutrientes.3']) {
    assert.ok(campos.includes(campo), `debe informar ${campo}`);
  }
  assert.ok(!campos.includes('ph'), 'null en un campo opcional es ausencia, no error');
  assert.ok(!campos.includes('nutrientes.4'));
  assert.equal(v.problemas.find(p => p.campo === 'densidadGcm3')?.valorOriginal, 'NaN', 'se conserva el valor original');
  assert.equal(v.profundidadCm, 20, 'los datos válidos se conservan');

  const eq = equivalenciasAnalisis(v);
  assert.equal(eq.masaKgHa.ok, false);
  if (!eq.masaKgHa.ok) assert.equal(eq.masaKgHa.motivo, 'dato-invalido', 'inválido se distingue de ausente');
  assert.ok(!eq.areaHa.ok && eq.areaHa.motivo === 'dato-invalido');
  assert.deepEqual(eq.nutrientes.map(n => n.estado), ['suspendida', 'suspendida', 'suspendida', 'suspendida', 'suspendida']);
  assert.equal(estadoDocumentacion(v).documentado, false);
});

test('suspende solo los cálculos que dependen del dato inválido', () => {
  const v = verificarAnalisis({
    id: 'x', loteId: 'l', fechaAnalisis: '2026-01-01', profundidadCm: 20, densidadGcm3: 1.2, areaM2AlRegistro: 500,
    nutrientes: [{ elemento: 'Fósforo', forma: 'P', valor: 'veinte', unidad: 'mg/kg' }, { elemento: 'Fósforo', forma: 'P', valor: 20, unidad: 'mg/kg' }]
  });
  const eq = equivalenciasAnalisis(v);
  assert.ok(eq.masaKgHa.ok);
  assert.equal(eq.nutrientes[0].estado, 'suspendida');
  assert.ok(eq.nutrientes[1].estado === 'calculada' && eq.nutrientes[1].kgHa === 48);
});

test('validación previa a persistir rechaza datos dañados aunque no vengan del formulario', () => {
  const base = { fechaAnalisis: '2026-10-01', profundidadCm: 20, nutrientes: [] };
  assert.equal(validarDatosAnalisis(base, { hoy: HOY }).ok, true);
  assert.equal(validarDatosAnalisis(null, { hoy: HOY }).ok, false);
  assert.equal(validarDatosAnalisis({ ...base, profundidadCm: Number.NaN }, { hoy: HOY }).ok, false);
  assert.equal(validarDatosAnalisis({ ...base, densidadGcm3: 0 }, { hoy: HOY }).ok, false);
  assert.equal(validarDatosAnalisis({ ...base, fechaAnalisis: '2027-01-01' }, { hoy: HOY }).ok, false);
  assert.equal(validarDatosAnalisis({ ...base, nutrientes: 'P=20' }, { hoy: HOY }).ok, false);
  assert.equal(validarDatosAnalisis({ ...base, nutrientes: undefined }, { hoy: HOY }).ok, false);
  assert.equal(validarDatosAnalisis({ ...base, nutrientes: [{ elemento: 'Fósforo', forma: 'K₂O', valor: 1, unidad: 'mg/kg' }] }, { hoy: HOY }).ok, false);
  const r = validarDatosAnalisis({ ...base, campoExtra: 'x', dosisKgHa: 99 }, { hoy: HOY });
  assert.ok(r.ok && !('campoExtra' in r.datos) && !('dosisKgHa' in r.datos), 'solo guarda campos admitidos');
});

// ---- Trazabilidad del laboratorio ----

test('trazabilidad: documentado vs registro incompleto, sin inventar el método', () => {
  const documentado = verificarAnalisis({ id: 'a', loteId: 'l', ...validos() });
  assert.deepEqual(estadoDocumentacion(documentado), { documentado: true, pendientes: [], trazabilidadPendiente: false });

  const sinMetodo = verificarAnalisis({ id: 'a', loteId: 'l', ...validos({ metodoLaboratorio: '' }) });
  const estado = estadoDocumentacion(sinMetodo);
  assert.equal(estado.documentado, false);
  assert.equal(estado.trazabilidadPendiente, true);
  assert.equal(sinMetodo.metodoLaboratorio, undefined, 'no se completa automáticamente');

  const soloPh = verificarAnalisis({ id: 'a', loteId: 'l', ...validos({ nutrientes: [], ph: '5,5' }) });
  assert.equal(estadoDocumentacion(soloPh).documentado, true);
  const vacio = verificarAnalisis({ id: 'a', loteId: 'l', ...validos({ nutrientes: [] }) });
  assert.equal(estadoDocumentacion(vacio).documentado, false);
});

// ---- Presentación y orden ----

test('formato: una cantidad positiva muy pequeña no se muestra como cero', () => {
  assert.equal(formatearNumero(0.0004, 3), '< 0,001');
  assert.equal(formatearNumero(0, 3), '0');
  assert.equal(formatearNumero(2_400_000, 0), '2.400.000');
  assert.equal(formatearNumero(Number.NaN), '—');
  assert.equal(numeroATexto(1e-7), '0,0000001');
  assert.equal(numeroATexto(1.2), '1,2');
});

test('orden cronológico con desempate por creación e id; fechas inválidas al final', () => {
  const lista = [
    { id: 'a', fechaAnalisis: '2026-01-01', createdAt: '2026-01-02T00:00:00Z' },
    { id: 'b', fechaAnalisis: undefined, createdAt: '2026-09-01T00:00:00Z' },
    { id: 'c', fechaAnalisis: '2026-05-01', createdAt: '2026-05-01T00:00:00Z' },
    { id: 'd', fechaAnalisis: '2026-01-01', createdAt: '2026-01-03T00:00:00Z' },
    { id: 'e', fechaAnalisis: '2026-01-01', createdAt: '2026-01-03T00:00:00Z' }
  ];
  assert.deepEqual(ordenarAnalisis(lista).map(a => a.id), ['c', 'e', 'd', 'a', 'b']);
});
