/**
 * Informe del lote para el productor: qué plan, qué análisis y qué seguimiento se muestran.
 * Todos los datos son de EJEMPLO.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { armarInforme, MAX_OBSERVACIONES, MAX_TAREAS_HECHAS } from '../src/lib/informe.ts';
import { verificarAnalisis } from '../src/lib/validacion.ts';
import { textoCostoRegistrado } from '../src/lib/formato.ts';
import { cambioAprobacion, copiarProducto, verificarPlan } from '../src/lib/validacionPlan.ts';
import { verificarRegistro } from '../src/lib/validacionSeguimiento.ts';
import type { Lote, PlanFertilizacion, ProductoFertilizante } from '../src/types.ts';

const HOY = new Date(2026, 9, 29, 10);
const cerca = (real: number, esperado: number) => assert.ok(Math.abs(real - esperado) <= Math.abs(esperado) * 1e-12, `${real} ≠ ${esperado}`);

const lote: Lote = { id: 'lote-a', nombre: 'Lote papa', cultivo: 'papa', areaM2: 500, createdAt: HOY.toISOString(), updatedAt: HOY.toISOString() };
const DAP: ProductoFertilizante = {
  id: 'dap', nombre: 'DAP', esEjemplo: false, presentacionKg: 50, precioPresentacionCop: 150_000, fechaPrecio: '2026-10-01',
  contenido: [{ elemento: 'Nitrógeno', forma: 'N', porcentaje: 18 }, { elemento: 'Fósforo', forma: 'P₂O₅', porcentaje: 46 }]
};
const plan = (id: string, cambios: Partial<PlanFertilizacion> = {}, aprobadoEl = '2026-10-20T15:00:00.000Z'): PlanFertilizacion => ({
  id, loteId: 'lote-a', nombre: `Plan ${id}`, areaM2AlCrear: 500,
  metas: [{ id: 'm-p', elemento: 'Fósforo', forma: 'P₂O₅', kgHa: 100, fuente: 'Fuente técnica X', fechaFuente: '2026-09-15', esEjemplo: false }],
  lineas: [{ id: 'l-dap', metaId: 'm-p', producto: copiarProducto(DAP) }],
  estado: 'aprobado',
  historial: [
    { estado: 'propuesta', fecha: '2026-10-01T15:00:00.000Z' },
    { estado: 'revisado', fecha: '2026-10-02T15:00:00.000Z', responsable: 'Revisor' },
    { estado: 'aprobado', fecha: aprobadoEl, responsable: 'Agrónomo' }
  ],
  createdAt: '2026-10-01T15:00:00.000Z', updatedAt: aprobadoEl, ...cambios
});
const registro = (id: string, datos: Record<string, unknown>) =>
  verificarRegistro({ id, loteId: 'lote-a', esEjemplo: false, createdAt: `2026-10-0${id.length}T10:00:00.000Z`, updatedAt: 'x', ...datos });

test('recomendación: usa el plan aprobado más reciente y sano; propuestas y dañados no cuentan', () => {
  const planes = [
    plan('viejo', {}, '2026-10-10T15:00:00.000Z'),
    plan('nuevo', {}, '2026-10-25T15:00:00.000Z'),
    plan('propuesta', { estado: 'propuesta', historial: [{ estado: 'propuesta', fecha: '2026-10-28T10:00:00.000Z' }] }),
    { ...plan('danado', {}, '2026-10-28T15:00:00.000Z'), areaM2AlCrear: 'x' as unknown as number }
  ].map(verificarPlan);
  const informe = armarInforme({ lote, analisis: [], planes, registros: [] }, HOY);
  assert.equal(informe.recomendacion?.plan.id, 'nuevo');
  assert.equal(informe.planesAprobados, 2);
  assert.deepEqual(informe.aprobadosDanados, { nombres: ['Plan danado'], masReciente: true }, 'el dañado (aprobado después) se avisa');
  assert.equal(informe.recomendacion?.aprobadoPor, 'Agrónomo');
  assert.equal(informe.recomendacion?.aprobadoEl, '2026-10-25');
  const sinAprobado = armarInforme({ lote, analisis: [], planes: [planes[2]], registros: [] }, HOY);
  assert.equal(sinAprobado.recomendacion, undefined, 'sin plan aprobado no hay recomendación');
  const soloDanado = armarInforme({ lote, analisis: [], planes: [planes[3]], registros: [] }, HOY);
  assert.equal(soloDanado.recomendacion, undefined);
  assert.equal(soloDanado.aprobadosDanados.nombres.length, 1, 'no dice simplemente que no hay plan aprobado');
});

test('recomendación: dosis, cantidad para el lote, bultos, costo, fuentes y avance de lo aplicado', () => {
  const registros = [
    registro('a1', { tipo: 'aplicacion', planId: 'p', lineaId: 'l-dap', productoNombre: 'DAP', fecha: '2026-10-21', cantidadKg: 5, costoCop: 15_000 }),
    registro('a22', { tipo: 'aplicacion', planId: 'otro-plan', lineaId: 'l-dap', productoNombre: 'DAP', fecha: '2026-10-21', cantidadKg: 99 })
  ];
  const r = armarInforme({ lote, analisis: [], planes: [verificarPlan(plan('p'))], registros }, HOY).recomendacion;
  assert.ok(r);
  if (!r) return;
  const [linea] = r.calculo.lineas;
  assert.ok(linea.estado === 'calculada');
  if (linea.estado !== 'calculada') return;
  assert.equal(linea.linea.producto.nombre, 'DAP');
  assert.equal(linea.meta.forma, 'P₂O₅');
  cerca(linea.productoKgHa, 100 / 0.46);
  assert.ok(linea.productoKgLote.ok && linea.bultos.ok && linea.costoCop.ok);
  if (linea.productoKgLote.ok) cerca(linea.productoKgLote.valor, 10.869565217391303);
  if (linea.costoCop.ok) cerca(linea.costoCop.valor, 10.869565217391303 * 3_000);
  assert.deepEqual(r.fuentes, [{ fuente: 'Fuente técnica X', fecha: '2026-09-15' }]);
  assert.equal(r.aplicado.avance[0].aplicaciones.length, 1, 'solo las aplicaciones de este plan');
  assert.ok(r.aplicado.costo.totalCop.ok && r.aplicado.costo.totalCop.valor === 15_000);
});

test('análisis: el más reciente; seguimiento: pendientes por fecha, hechas y observaciones recientes con tope', () => {
  const analisis = [
    verificarAnalisis({ id: 'an1', loteId: 'lote-a', fechaAnalisis: '2026-09-01', profundidadCm: 20, densidadGcm3: 1.2, areaM2AlRegistro: 500, nutrientes: [] }),
    verificarAnalisis({ id: 'an2', loteId: 'lote-a', fechaAnalisis: '2026-10-01', profundidadCm: 20, densidadGcm3: 1.2, areaM2AlRegistro: 500, nutrientes: [] })
  ];
  const tareas = [
    registro('t1', { tipo: 'tarea', descripcion: 'B', fechaPrevista: '2026-11-20', estado: 'pendiente' }),
    registro('t22', { tipo: 'tarea', descripcion: 'A', fechaPrevista: '2026-11-01', estado: 'pendiente' }),
    ...Array.from({ length: MAX_TAREAS_HECHAS + 2 }, (_, i) => registro(`h${'x'.repeat(i)}`, { tipo: 'tarea', descripcion: `H${i}`, fechaPrevista: '2026-10-01', estado: 'hecha', fechaRealizada: `2026-10-${String(10 + i).padStart(2, '0')}` }))
  ];
  const observaciones = Array.from({ length: MAX_OBSERVACIONES + 1 }, (_, i) => registro(`o${'x'.repeat(i)}`, { tipo: 'observacion', fecha: `2026-10-${String(10 + i).padStart(2, '0')}`, descripcion: `O${i}` }));
  const danado = registro('d', { tipo: 'observacion', fecha: '2026-10-01', descripcion: 42 });
  const informe = armarInforme({ lote, analisis, planes: [], registros: [...tareas, ...observaciones, danado] }, HOY);
  assert.equal(informe.analisis?.id, 'an2');
  assert.equal(informe.totalAnalisis, 2);
  assert.ok(informe.equivalencias?.masaKgHa.ok);
  assert.deepEqual(informe.tareasPendientes.map(t => t.descripcion), ['A', 'B']);
  assert.equal(informe.tareasHechas.length, MAX_TAREAS_HECHAS);
  assert.equal(informe.tareasHechas[0].fechaRealizada, '2026-10-16', 'las más recientes primero');
  assert.equal(informe.observaciones.length, MAX_OBSERVACIONES);
  assert.equal(informe.observaciones[0].descripcion, `O${MAX_OBSERVACIONES}`);
  assert.equal(informe.registrosDanados, 1);
  assert.equal(informe.hayEjemplo, false);
});

test('el informe advierte datos de EJEMPLO en el lote, el plan o el seguimiento', () => {
  assert.equal(armarInforme({ lote: { ...lote, nombre: 'Lote EJEMPLO' }, analisis: [], planes: [], registros: [] }, HOY).hayEjemplo, true);
  const conMetaEjemplo = verificarPlan(plan('p', { metas: [{ ...plan('p').metas[0], esEjemplo: true }] }));
  assert.equal(armarInforme({ lote, analisis: [], planes: [conMetaEjemplo], registros: [] }, HOY).hayEjemplo, true);
  const obs = registro('o', { tipo: 'observacion', fecha: '2026-10-01', descripcion: 'x', esEjemplo: true });
  assert.equal(armarInforme({ lote, analisis: [], planes: [], registros: [obs] }, HOY).hayEjemplo, true);
});

// ---- Revisión del informe ----

test('revisión: el aprobado más recientemente se decide por la hora, no solo por el día', () => {
  const x = verificarPlan(plan('x', { createdAt: '2026-10-01T09:00:00.000Z' }, '2026-10-29T15:00:00.000Z'));
  const y = verificarPlan(plan('y', { createdAt: '2026-10-01T10:00:00.000Z' }, '2026-10-29T11:00:00.000Z'));
  assert.equal(armarInforme({ lote, analisis: [], planes: [y, x], registros: [] }, HOY).recomendacion?.plan.id, 'x');
  assert.equal(cambioAprobacion(x)?.fecha, '2026-10-29T15:00:00.000Z');
});

test('revisión: las aplicaciones dañadas y las de productos que no están en el plan se cuentan para avisarlas', () => {
  const registros = [
    registro('a1', { tipo: 'aplicacion', planId: 'p', lineaId: 'l-dap', productoNombre: 'DAP', fecha: '2026-10-21', cantidadKg: 5 }),
    registro('a22', { tipo: 'aplicacion', planId: 'p', lineaId: 'no-esta', productoNombre: 'Otro', fecha: '2026-10-21', cantidadKg: 2 }),
    registro('a333', { tipo: 'aplicacion', planId: 'p', lineaId: 'l-dap', productoNombre: 'DAP', fecha: '2026-10-21', cantidadKg: 'x' })
  ];
  const r = armarInforme({ lote, analisis: [], planes: [verificarPlan(plan('p'))], registros }, HOY).recomendacion;
  assert.equal(r?.aplicado.delPlan.length, 1);
  assert.equal(r?.aplicado.ajenas, 1);
  assert.equal(r?.aplicacionesDanadas, 1);
});

test('revisión: el costo registrado no se muestra como "0 COP" si ninguna aplicación lo tiene', () => {
  assert.equal(textoCostoRegistrado({ totalCop: { ok: true, valor: 0 }, sinCosto: 2 }, 2), null);
  assert.equal(textoCostoRegistrado({ totalCop: { ok: true, valor: 15_000 }, sinCosto: 1 }, 2), '15.000 COP (1 aplicación sin costo registrado)');
  assert.equal(textoCostoRegistrado({ totalCop: { ok: true, valor: 15_000 }, sinCosto: 0 }, 1), '15.000 COP');
});
