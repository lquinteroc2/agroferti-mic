/**
 * Fase 3: cantidad y costo de producto a partir de una meta escrita por el usuario con su fuente.
 * Todos los productos, precios y metas de estas pruebas son de EJEMPLO.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aporteKgHa,
  bultosNecesarios,
  calcularPlan,
  costoCop,
  precioPorKgCop,
  productoEnLoteKg,
  type ResultadoLineaPlan
} from '../src/lib/calculos.ts';
import { mismaForma } from '../src/lib/catalogoNutrientes.ts';
import {
  copiarProducto,
  validarCambioEstado,
  validarDatosPlan,
  validarDatosProducto,
  verificarPlan,
  verificarProducto
} from '../src/lib/validacionPlan.ts';
import type { LineaPlan, MetaNutrimental, PlanVerificado, ProductoFertilizante } from '../src/types.ts';

const HOY = new Date(2026, 9, 29);
const cerca = (real: number, esperado: number, msg?: string) =>
  assert.ok(Math.abs(real - esperado) <= Math.abs(esperado) * 1e-12, `${msg ?? ''} ${real} ≠ ${esperado}`);

const DAP: ProductoFertilizante = {
  id: 'dap', nombre: 'DAP EJEMPLO', esEjemplo: true,
  contenido: [{ elemento: 'Nitrógeno', forma: 'N', porcentaje: 18 }, { elemento: 'Fósforo', forma: 'P₂O₅', porcentaje: 46 }],
  presentacionKg: 50, precioPresentacionCop: 150_000, fechaPrecio: '2026-10-01'
};
const UREA: ProductoFertilizante = {
  id: 'urea', nombre: 'Urea EJEMPLO', esEjemplo: true,
  contenido: [{ elemento: 'Nitrógeno', forma: 'N', porcentaje: 46 }],
  presentacionKg: 50, precioPresentacionCop: 120_000, fechaPrecio: '2026-10-01'
};
const KCL: ProductoFertilizante = {
  id: 'kcl', nombre: 'KCl EJEMPLO', esEjemplo: true, contenido: [{ elemento: 'Potasio', forma: 'K₂O', porcentaje: 60 }]
};

const meta = (cambios: Partial<MetaNutrimental> = {}): MetaNutrimental => ({
  id: 'm-p', elemento: 'Fósforo', forma: 'P₂O₅', kgHa: 100, fuente: 'Fuente técnica EJEMPLO', fechaFuente: '2026-09-15', esEjemplo: true, ...cambios
});
const metaN = meta({ id: 'm-n', elemento: 'Nitrógeno', forma: 'N', kgHa: 120 });
const linea = (id: string, metaId: string, producto: ProductoFertilizante): LineaPlan => ({ id, metaId, producto: copiarProducto(producto) });

function plan(cambios: Partial<PlanVerificado> = {}): PlanVerificado {
  return {
    id: 'plan', loteId: 'lote', nombre: 'Plan papa EJEMPLO', areaM2AlCrear: 500,
    metas: [meta(), metaN], lineas: [linea('l-dap', 'm-p', DAP), linea('l-urea', 'm-n', UREA)],
    estado: 'propuesta', historial: [{ estado: 'propuesta', fecha: '2026-10-29T10:00:00.000Z' }],
    problemas: [], camposAdicionales: [], ...cambios
  };
}

function calculada(r: ResultadoLineaPlan) {
  assert.equal(r.estado, 'calculada', r.estado === 'sin-calculo' ? r.mensaje : '');
  return r as Extract<ResultadoLineaPlan, { estado: 'calculada' }>;
}
const valor = (c: { ok: boolean; valor?: number }) => {
  assert.ok(c.ok, 'debía calcularse');
  return c.valor as number;
};

// ---- Cálculos ----

test('fórmulas de cantidad, precio, costo, bultos y aporte', () => {
  cerca(productoEnLoteKg(217.39130434782606, 500), 10.869565217391303);
  assert.equal(precioPorKgCop(150_000, 50), 3_000);
  assert.equal(costoCop(10, 3_000), 30_000);
  assert.equal(bultosNecesarios(25, 50), 0.5);
  cerca(aporteKgHa(217.39130434782606, 18), 39.130434782608695);
  assert.equal(productoEnLoteKg(0, 500), 0);
  assert.equal(precioPorKgCop(0, 50), 0, 'un producto regalado cuesta 0');
  assert.throws(() => productoEnLoteKg(10, 0), RangeError);
  assert.throws(() => precioPorKgCop(1000, 0), RangeError);
  assert.throws(() => bultosNecesarios(-1, 50), RangeError);
  assert.throws(() => aporteKgHa(10, 0), RangeError);
  assert.throws(() => aporteKgHa(10, 101), RangeError);
  assert.throws(() => costoCop(Number.MAX_SAFE_INTEGER, 10), /demasiado grande/);
});

test('plan de EJEMPLO: DAP para P₂O₅, paso a paso', () => {
  const r = calculada(calcularPlan(plan()).lineas[0]);
  assert.equal(r.porcentaje, 46);
  cerca(r.productoKgHa, 100 / 0.46, 'kg/ha de DAP');
  cerca(valor(r.productoKgLote), 10.869565217391303, 'kg en 500 m²');
  assert.equal(valor(r.precioKgCop), 3_000);
  cerca(valor(r.costoCop), 32_608.69565217391, 'costo');
  cerca(valor(r.bultos), 0.21739130434782608, 'bultos exactos, sin redondear');
  const [n, p] = r.aportes;
  assert.equal(p.forma, 'P₂O₅');
  assert.equal(valor(p.kgHa), 100, 'la forma de la meta aporta exactamente la meta');
  cerca(valor(n.kgHa), 39.130434782608695, 'N acompañante del DAP');
});

test('resumen por forma: meta frente a la suma de aportes, sin ajustar nada', () => {
  const c = calcularPlan(plan());
  const n = c.resumen.find(x => x.forma === 'N');
  const p = c.resumen.find(x => x.forma === 'P₂O₅');
  assert.ok(n && p);
  assert.deepEqual(c.resumen.map(x => x.forma), ['P₂O₅', 'N'], 'primero las metas, en su orden');
  assert.equal(n.metaKgHa, 120);
  cerca(valor(n.aportadoKgHa), 120 + 39.130434782608695, 'N de la urea + N acompañante del DAP');
  assert.equal(valor(p.aportadoKgHa), 100);
  assert.equal(n.incompleto, false);
  cerca(valor(c.costoTotalCop), 32_608.69565217391 + 31_304.347826086956);
  assert.equal(calculada(c.lineas[1]).productoKgHa, 120 / 0.46);
});

test('nunca convierte P↔P₂O₅ ni K↔K₂O: si la forma no coincide, no calcula y explica', () => {
  const c = calcularPlan(plan({ metas: [meta({ forma: 'P', kgHa: 40 }), metaN] }));
  const r = c.lineas[0];
  assert.equal(r.estado, 'sin-calculo');
  if (r.estado !== 'sin-calculo') return;
  assert.equal(r.motivo, 'forma-distinta');
  assert.match(r.mensaje, /meta está en P y la etiqueta de DAP EJEMPLO declara P₂O₅/);
  assert.match(r.mensaje, /no convierte/);
  assert.ok(!('productoKgHa' in r), 'sin cantidad de producto');
  assert.equal(c.costoTotalCop.ok, false, 'sin total parcial');
  assert.ok(c.resumen.every(x => x.incompleto));

  const k = calcularPlan(plan({ metas: [meta({ id: 'm-k', elemento: 'Potasio', forma: 'K', kgHa: 80 })], lineas: [linea('l', 'm-k', KCL)] }));
  assert.equal(k.lineas[0].estado, 'sin-calculo');
});

test('la forma se compara sin importar cómo se escriba, pero distingue elemento y forma', () => {
  assert.ok(mismaForma({ elemento: 'Potasio', forma: 'K2O' }, { elemento: 'K', forma: 'K₂O' }));
  assert.ok(mismaForma({ elemento: 'potasio', forma: 'k₂o' }, { elemento: 'Potasio', forma: 'K₂O' }));
  assert.ok(!mismaForma({ elemento: 'Fósforo', forma: 'P' }, { elemento: 'Fósforo', forma: 'P₂O₅' }));
  assert.ok(!mismaForma({ elemento: 'Calcio', forma: 'CaO' }, { elemento: 'Magnesio', forma: 'CaO' }));
  assert.ok(mismaForma({ elemento: 'Silicio', forma: 'SiO2' }, { elemento: 'silicio', forma: 'SiO₂' }), 'fuera del catálogo, por texto');

  const c = calcularPlan(plan({ metas: [meta({ id: 'm-k', elemento: 'Potasio', forma: 'K2O', kgHa: 90 })], lineas: [linea('l', 'm-k', KCL)] }));
  assert.equal(calculada(c.lineas[0]).productoKgHa, 150);
});

test('sin fuente técnica y fecha, o sin meta, no se calcula ninguna cantidad', () => {
  const sinFuente = calcularPlan(plan({ metas: [meta({ fuente: '' }), metaN] })).lineas[0];
  assert.ok(sinFuente.estado === 'sin-calculo' && sinFuente.motivo === 'falta-dato');
  const sinMeta = calcularPlan(plan({ metas: [metaN] })).lineas[0];
  assert.ok(sinMeta.estado === 'sin-calculo' && sinMeta.motivo === 'dato-invalido');
  const ajeno = calcularPlan(plan({ metas: [meta(), metaN], lineas: [linea('l', 'm-n', KCL)] })).lineas[0];
  assert.ok(ajeno.estado === 'sin-calculo' && /no declara Nitrógeno/.test(ajeno.mensaje));
});

test('sin precio o sin kg por bulto: cantidad sí, costo no; sin área válida: nada en el lote', () => {
  const c = calcularPlan(plan({ metas: [meta({ id: 'm-k', elemento: 'Potasio', forma: 'K₂O', kgHa: 90 })], lineas: [linea('l', 'm-k', KCL)] }));
  const r = calculada(c.lineas[0]);
  assert.equal(valor(r.productoKgLote), 7.5);
  assert.ok(!r.precioKgCop.ok && r.precioKgCop.motivo === 'falta-dato');
  assert.ok(!r.costoCop.ok && !r.bultos.ok);
  assert.equal(c.costoTotalCop.ok, false);

  const sinArea = calcularPlan(plan({
    areaM2AlCrear: undefined,
    problemas: [{ campo: 'areaM2AlCrear', etiqueta: 'Área del plan', detalle: 'No es un número.', valorOriginal: '"x"' }]
  }));
  assert.ok(!sinArea.areaHa.ok && sinArea.areaHa.motivo === 'dato-invalido');
  const l = calculada(sinArea.lineas[0]);
  assert.ok(!l.productoKgLote.ok && l.productoKgLote.motivo === 'dato-invalido', 'hereda el motivo del área');
  assert.equal(l.productoKgHa, 100 / 0.46, 'el kg/ha no depende del área');
});

// ---- Validación de productos ----

test('producto: acepta la etiqueta válida y descarta campos no admitidos', () => {
  const r = validarDatosProducto({ ...DAP, id: 'ignorar', otro: 1 }, { hoy: HOY });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.datos.nombre, 'DAP EJEMPLO');
  assert.ok(!('id' in r.datos) && !('otro' in r.datos));
  assert.ok(validarDatosProducto(KCL, { hoy: HOY }).ok, 'precio opcional');
});

test('producto: rechaza porcentajes, formas, precios y fechas inválidos sin lanzar', () => {
  const casos: Array<[string, Record<string, unknown>, RegExp]> = [
    ['0 %', { contenido: [{ elemento: 'Potasio', forma: 'K₂O', porcentaje: 0 }] }, /Debe ser mayor que cero/],
    ['101 %', { contenido: [{ elemento: 'Potasio', forma: 'K₂O', porcentaje: 101 }] }, /entre 0 y 100/],
    ['NaN', { contenido: [{ elemento: 'Potasio', forma: 'K₂O', porcentaje: Number.NaN }] }, /No es un número válido/],
    ['texto', { contenido: [{ elemento: 'Potasio', forma: 'K₂O', porcentaje: '60' }] }, /No es un número/],
    ['incoherente', { contenido: [{ elemento: 'Fósforo', forma: 'K₂O', porcentaje: 60 }] }, /corresponde a Potasio/],
    ['repetida', { contenido: [{ elemento: 'Potasio', forma: 'K₂O', porcentaje: 30 }, { elemento: 'K', forma: 'K2O', porcentaje: 30 }] }, /ya está declarada/],
    ['vacía', { contenido: [] }, /al menos un nutriente/],
    ['dispersa', { contenido: [, { elemento: 'Potasio', forma: 'K₂O', porcentaje: 60 }] }, /Posición vacía/],
    ['precio sin bulto', { presentacionKg: undefined, precioPresentacionCop: 1000, fechaPrecio: '2026-10-01' }, /Kg por bulto: Es obligatorio/],
    ['precio sin fecha', { presentacionKg: 50, precioPresentacionCop: 1000, fechaPrecio: undefined }, /Fecha del precio: Es obligatoria/],
    ['fecha futura', { presentacionKg: 50, precioPresentacionCop: 1000, fechaPrecio: '2026-10-30' }, /no puede ser una fecha futura/],
    ['precio negativo', { presentacionKg: 50, precioPresentacionCop: -1, fechaPrecio: '2026-10-01' }, /No puede ser negativo/],
    ['sin EJEMPLO', { esEjemplo: undefined }, /Dato de EJEMPLO/],
    ['sin nombre', { nombre: '  ' }, /Nombre del producto/]
  ];
  for (const [nombre, cambios, error] of casos) {
    const r = validarDatosProducto({ ...KCL, ...cambios }, { hoy: HOY });
    assert.ok(!r.ok, nombre);
    if (!r.ok) assert.match(r.errores.join(' | '), error, nombre);
  }
  for (const raro of [null, 5, 'x', [], { contenido: 'x' }]) assert.equal(validarDatosProducto(raro).ok, false);
});

test('producto guardado dañado: se informa con su valor original, sin lanzar ni modificarlo', () => {
  const crudo = { id: 'p', nombre: 'X', contenido: [{ elemento: 'Potasio', forma: 'K₂O', porcentaje: 'mucho' }], esEjemplo: true, version: 9 };
  const copia = structuredClone(crudo);
  const v = verificarProducto(crudo);
  assert.equal(v.producto, undefined);
  assert.equal(v.problemas[0].campo, 'contenido.0.porcentaje');
  assert.equal(v.problemas[0].valorOriginal, '"mucho"');
  assert.deepEqual(v.camposAdicionales, ['version']);
  assert.deepEqual(crudo, copia);
  for (const raro of [null, undefined, 3, [], { contenido: new Array(1000) }]) assert.ok(verificarProducto(raro).problemas.length > 0);
});

test('la copia del producto en el plan es independiente del catálogo', () => {
  const producto = structuredClone(DAP);
  const copia = copiarProducto(producto);
  producto.contenido[1].porcentaje = 10;
  producto.precioPresentacionCop = 1;
  assert.equal(copia.contenido[1].porcentaje, 46);
  assert.equal(copia.precioPresentacionCop, 150_000);
  assert.equal(copia.productoId, 'dap');
});

// ---- Validación de planes ----

const datosPlan = (cambios: Record<string, unknown> = {}) => {
  const { nombre, metas, lineas } = plan();
  return { nombre, metas, lineas, ...cambios };
};

test('plan: acepta datos válidos y una forma distinta (queda sin cálculo hasta corregirla)', () => {
  assert.ok(validarDatosPlan(datosPlan(), { hoy: HOY, areaM2: 500 }).ok);
  assert.ok(validarDatosPlan(datosPlan({ metas: [meta({ forma: 'P' }), metaN] }), { hoy: HOY, areaM2: 500 }).ok);
  assert.ok(validarDatosPlan(datosPlan({ metas: [], lineas: [] }), { hoy: HOY, areaM2: 500 }).ok, 'propuesta vacía');
});

test('plan: exige fuente y fecha de la meta y rechaza inconsistencias', () => {
  const casos: Array<[string, Record<string, unknown>, RegExp]> = [
    ['sin fuente', { metas: [meta({ fuente: '' }), metaN] }, /Fuente técnica/],
    ['sin fecha', { metas: [{ ...meta(), fechaFuente: undefined }, metaN] }, /Fecha de la fuente: Dato obligatorio/],
    ['fecha futura', { metas: [meta({ fechaFuente: '2026-11-01' }), metaN] }, /no puede ser una fecha futura/],
    ['meta cero', { metas: [meta({ kgHa: 0 }), metaN] }, /mayor que cero/],
    ['meta incoherente', { metas: [meta({ forma: 'K₂O' }), metaN] }, /corresponde a Potasio/],
    ['metas repetidas', { metas: [meta(), meta({ id: 'otra', forma: 'P2O5' })], lineas: [] }, /Ya hay una meta para Fósforo/],
    ['línea sin meta', { lineas: [linea('l', 'no-existe', DAP)] }, /no existe o tiene datos dañados/],
    ['dos líneas misma meta', { lineas: [linea('a', 'm-p', DAP), linea('b', 'm-p', DAP)] }, /misma meta/],
    ['sin nombre', { nombre: '' }, /Nombre del plan/],
    ['desbordamiento', { metas: [meta(), meta({ ...metaN, kgHa: 1e15 })], lineas: [linea('l', 'm-n', UREA)] }, /Costo: el resultado es demasiado grande/]
  ];
  for (const [nombre, cambios, error] of casos) {
    const r = validarDatosPlan(datosPlan(cambios), { hoy: HOY, areaM2: 500 });
    assert.ok(!r.ok, nombre);
    if (!r.ok) assert.match(r.errores.join(' | '), error, nombre);
  }
  for (const raro of [null, 'x', { metas: 'x', lineas: [] }, { nombre: 'x', metas: [null], lineas: [{}] }]) {
    assert.equal(validarDatosPlan(raro, { hoy: HOY, areaM2: 500 }).ok, false);
  }
});

test('plan guardado dañado: no lanza, excluye lo dañado y conserva el valor original', () => {
  const v = verificarPlan({
    id: 'x', loteId: 'l', nombre: 5, areaM2AlCrear: Number.NaN, metas: [null, meta(), , ], lineas: 'x',
    estado: 'aplicado', historial: [{ estado: 'propuesta', fecha: 'nope' }]
  });
  const campos = v.problemas.map(p => p.campo);
  for (const c of ['nombre', 'areaM2AlCrear', 'metas.0', 'metas.2', 'lineas', 'estado', 'historial.0.fecha']) {
    assert.ok(campos.includes(c), `debe informar ${c}`);
  }
  assert.equal(v.metas.length, 1);
  assert.equal(v.areaM2AlCrear, undefined);
  const c = calcularPlan(v);
  assert.ok(!c.areaHa.ok && c.areaHa.motivo === 'dato-invalido');
  for (const raro of [null, 7, [], { metas: new Array(1000) }]) assert.ok(verificarPlan(raro).problemas.length > 0);
});

// ---- Estados ----

test('estados: propuesta → revisado → aprobado; nada cambia un plan aprobado', () => {
  assert.ok(validarCambioEstado(plan(), 'revisado', 'Agrónomo EJEMPLO').ok);
  assert.ok(validarCambioEstado(plan({ estado: 'revisado' }), 'aprobado', 'Agrónomo EJEMPLO').ok);
  assert.ok(validarCambioEstado(plan({ estado: 'revisado' }), 'propuesta', 'Agrónomo EJEMPLO').ok, 'devolver a propuesta');

  const errores = (p: PlanVerificado, nuevo: Parameters<typeof validarCambioEstado>[1], responsable = 'Agrónomo EJEMPLO') => {
    const r = validarCambioEstado(p, nuevo, responsable);
    return r.ok ? '' : r.errores.join(' | ');
  };
  assert.match(errores(plan(), 'aprobado'), /no puede pasar a «aprobado»/);
  assert.match(errores(plan(), 'revisado', '  '), /nombre de quien registra/);
  assert.match(errores(plan({ estado: 'aprobado' }), 'propuesta'), /crea una copia/);
  assert.match(errores(plan({ lineas: [] }), 'revisado'), /no tiene productos/);
  assert.match(errores(plan({ metas: [meta({ forma: 'P' }), metaN] }), 'revisado'), /Línea 1: .*no convierte/);
  const danado = plan({ problemas: [{ campo: 'x', etiqueta: 'X', detalle: 'd', valorOriginal: 'v' }] });
  assert.match(errores(danado, 'revisado'), /datos guardados dañados/);
});

test('ningún cálculo usa el análisis de suelo ni propone metas', () => {
  const sinMetas = calcularPlan(plan({ metas: [], lineas: [], analisisReferenciaId: 'an-1' }));
  assert.deepEqual(sinMetas.lineas, []);
  assert.deepEqual(sinMetas.resumen, []);
});
