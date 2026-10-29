/**
 * Fase 4: seguimiento manual (aplicaciones, observaciones, tareas) y plan frente a lo aplicado.
 * Almacén en memoria con transacciones con reversión. Todos los datos son de EJEMPLO.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { avancePlan, calcularPlan, costoRegistrado, kgLoteAKgHa } from '../src/lib/calculos.ts';
import { ErrorPersistencia } from '../src/lib/repositorioAnalisis.ts';
import { crearRepositorioSeguimiento, type AlmacenSeguimiento } from '../src/lib/repositorioSeguimiento.ts';
import { copiarProducto } from '../src/lib/validacionPlan.ts';
import {
  ordenarRegistros,
  validarAplicacionFormulario,
  validarDatosRegistro,
  verificarRegistro,
  type EntradaAplicacion
} from '../src/lib/validacionSeguimiento.ts';
import type { PlanFertilizacion, ProductoFertilizante, RegistroAplicacion } from '../src/types.ts';

const HOY = new Date(2026, 9, 29, 10);
const LUEGO = new Date(2026, 9, 29, 11);
const cerca = (real: number, esperado: number, msg?: string) =>
  assert.ok(Math.abs(real - esperado) <= Math.abs(esperado) * 1e-12, `${msg ?? ''} ${real} ≠ ${esperado}`);

const DAP: ProductoFertilizante = {
  id: 'dap', nombre: 'DAP EJEMPLO', esEjemplo: true,
  contenido: [{ elemento: 'Nitrógeno', forma: 'N', porcentaje: 18 }, { elemento: 'Fósforo', forma: 'P₂O₅', porcentaje: 46 }]
};
const planEjemplo = (cambios: Partial<PlanFertilizacion> = {}): PlanFertilizacion => ({
  id: 'plan-a', loteId: 'lote-a', nombre: 'Plan EJEMPLO', areaM2AlCrear: 500,
  metas: [{ id: 'm-p', elemento: 'Fósforo', forma: 'P₂O₅', kgHa: 100, fuente: 'Fuente EJEMPLO', fechaFuente: '2026-09-15', esEjemplo: true }],
  lineas: [{ id: 'l-dap', metaId: 'm-p', producto: copiarProducto(DAP) }],
  estado: 'aprobado',
  historial: [{ estado: 'propuesta', fecha: HOY.toISOString() }, { estado: 'revisado', fecha: HOY.toISOString() }, { estado: 'aprobado', fecha: HOY.toISOString() }],
  createdAt: HOY.toISOString(), updatedAt: HOY.toISOString(), ...cambios
});
const aplicacion = (cambios: Record<string, unknown> = {}) => ({
  tipo: 'aplicacion', planId: 'plan-a', lineaId: 'l-dap', productoNombre: 'DAP EJEMPLO', fecha: '2026-10-20', cantidadKg: 5, esEjemplo: true, ...cambios
});
const observacion = (cambios: Record<string, unknown> = {}) => ({ tipo: 'observacion', fecha: '2026-10-21', descripcion: 'Hojas amarillas en el borde EJEMPLO', esEjemplo: true, ...cambios });
const tarea = (cambios: Record<string, unknown> = {}) => ({ tipo: 'tarea', descripcion: 'Segunda fracción EJEMPLO', fechaPrevista: '2026-11-15', estado: 'pendiente', esEjemplo: true, ...cambios });

// ---- Plan frente a lo aplicado ----

test('kg en el lote a kg/ha', () => {
  assert.equal(kgLoteAKgHa(8, 500), 160);
  assert.equal(kgLoteAKgHa(0, 500), 0);
  assert.throws(() => kgLoteAKgHa(8, 0), RangeError);
  assert.throws(() => kgLoteAKgHa(-1, 500), RangeError);
});

test('avance: aplicaciones parciales frente a lo planeado, en kg de producto y en la forma de la meta', () => {
  const [a] = avancePlan(planEjemplo(), [{ lineaId: 'l-dap', cantidadKg: 5 }, { lineaId: 'l-dap', cantidadKg: 3 }, { lineaId: 'otra', cantidadKg: 99 }]);
  assert.equal(a.aplicaciones, 2);
  assert.ok(a.planeadoKg.ok && a.aplicadoKg.ok && a.diferenciaKg?.ok && a.porcentaje?.ok && a.aplicadoFormaKgHa?.ok);
  if (!a.planeadoKg.ok || !a.diferenciaKg?.ok || !a.porcentaje?.ok || !a.aplicadoFormaKgHa?.ok || !a.aplicadoKg.ok) return;
  cerca(a.planeadoKg.valor, 10.869565217391303, 'planeado: 100 ÷ 46 % × 0,05 ha');
  assert.equal(a.aplicadoKg.valor, 8);
  cerca(a.diferenciaKg.valor, 8 - 10.869565217391303, 'falta por aplicar');
  cerca(a.porcentaje.valor, 73.6, 'avance');
  cerca(a.aplicadoFormaKgHa.valor, 73.6, '8 kg ÷ 0,05 ha = 160 kg/ha × 46 % = 73,6 kg/ha de P₂O₅');
  assert.equal(a.porcentajeEtiqueta, 46, 'el % de la etiqueta que usa la explicación');
});

test('avance: sin aplicaciones es cero; aplicar de más da una diferencia positiva, sin juicio', () => {
  const [cero] = avancePlan(planEjemplo(), []);
  assert.ok(cero.aplicadoKg.ok && cero.aplicadoKg.valor === 0 && cero.porcentaje?.ok && cero.porcentaje.valor === 0);
  const [demas] = avancePlan(planEjemplo(), [{ lineaId: 'l-dap', cantidadKg: 12 }]);
  assert.ok(demas.diferenciaKg?.ok && demas.diferenciaKg.valor > 0);
  if (demas.porcentaje?.ok) cerca(demas.porcentaje.valor, 110.4);
  const plan = planEjemplo({ metas: [{ ...planEjemplo().metas[0], forma: 'P' }] });
  const [sinCalculo] = avancePlan(plan, [{ lineaId: 'l-dap', cantidadKg: 5 }], calcularPlan(plan));
  assert.equal(sinCalculo.planeadoKg.ok, false);
  assert.ok(sinCalculo.aplicadoKg.ok && sinCalculo.aplicadoKg.valor === 5, 'lo aplicado se suma aunque el plan no se pueda calcular');
  assert.equal(sinCalculo.porcentaje, undefined);
});

// ---- Validación ----

test('registro: aplicación, observación y tarea válidas; descarta campos no admitidos', () => {
  for (const datos of [aplicacion({ costoCop: 15_000, nota: 'Fertilización de siembra', responsable: 'Productor EJEMPLO' }), observacion(), tarea(), tarea({ estado: 'hecha', fechaRealizada: '2026-10-28' })]) {
    const r = validarDatosRegistro({ ...datos, otro: 1 }, { hoy: HOY });
    assert.ok(r.ok, JSON.stringify(r));
    if (r.ok) assert.ok(!('otro' in r.datos));
  }
  assert.ok(validarDatosRegistro(tarea({ fechaPrevista: '2027-01-10' }), { hoy: HOY }).ok, 'una tarea puede preverse en el futuro');
});

test('registro: rechaza cantidades, fechas, estados y tipos inválidos sin lanzar', () => {
  const casos: Array<[string, unknown, RegExp]> = [
    ['cantidad cero', aplicacion({ cantidadKg: 0 }), /mayor que cero/],
    ['cantidad texto', aplicacion({ cantidadKg: '5' }), /No es un número/],
    ['costo negativo', aplicacion({ costoCop: -1 }), /No puede ser negativo/],
    ['aplicación futura', aplicacion({ fecha: '2026-10-30' }), /no puede ser una fecha futura/],
    ['sin línea', aplicacion({ lineaId: '' }), /Producto del plan/],
    ['observación vacía', observacion({ descripcion: ' ' }), /Descripción/],
    ['observación futura', observacion({ fecha: '2026-11-01' }), /futura/],
    ['tarea hecha sin fecha', tarea({ estado: 'hecha' }), /Fecha en que se hizo: Dato obligatorio/],
    ['tarea pendiente con fecha', tarea({ fechaRealizada: '2026-10-20' }), /pendiente no tiene fecha/],
    ['tarea hecha en el futuro', tarea({ estado: 'hecha', fechaRealizada: '2026-11-01' }), /futura/],
    ['estado inválido', tarea({ estado: 'en curso' }), /pendiente ni hecha/],
    ['tipo inválido', { ...observacion(), tipo: 'cosecha' }, /aplicación, observación ni tarea/],
    ['sin EJEMPLO', observacion({ esEjemplo: undefined }), /Dato de EJEMPLO/]
  ];
  for (const [nombre, datos, error] of casos) {
    const r = validarDatosRegistro(datos, { hoy: HOY });
    assert.ok(!r.ok, nombre);
    if (!r.ok) assert.match(r.errores.join(' | '), error, nombre);
  }
  for (const raro of [null, 'x', 5, []]) assert.equal(validarDatosRegistro(raro).ok, false);
});

test('registro guardado dañado: se informa con su valor original, sin lanzar ni modificarlo', () => {
  const crudo = { id: 'r1', loteId: 'lote-a', ...aplicacion({ cantidadKg: 'cinco' }), version: 9, createdAt: 'x', updatedAt: 'x' };
  const copia = structuredClone(crudo);
  const v = verificarRegistro(crudo);
  assert.equal(v.registro, undefined);
  assert.equal(v.tipo, 'aplicacion');
  assert.equal(v.problemas[0].campo, 'cantidadKg');
  assert.equal(v.problemas[0].valorOriginal, '"cinco"');
  assert.deepEqual(v.camposAdicionales, ['version']);
  assert.equal(v.fechaOrden, '2026-10-20');
  assert.deepEqual(crudo, copia);
  for (const raro of [null, undefined, 7, [], { tipo: 'x' }]) assert.ok(verificarRegistro(raro).problemas.length > 0);
});

test('orden: más reciente primero (fecha o fecha prevista); sin fecha al final', () => {
  const v = (id: string, datos: Record<string, unknown>) => verificarRegistro({ id, loteId: 'l', createdAt: HOY.toISOString(), updatedAt: HOY.toISOString(), ...datos });
  const orden = ordenarRegistros([v('a', observacion({ fecha: '2026-10-01' })), v('b', tarea({ fechaPrevista: '2026-11-15' })), v('c', { tipo: 'observacion' }), v('d', aplicacion({ fecha: '2026-10-20' }))]);
  assert.deepEqual(orden.map(x => x.id), ['b', 'd', 'a', 'c']);
});

// ---- Persistencia ----

function crearAlmacen() {
  const lotes = new Set(['lote-a', 'lote-b']);
  const planes = new Map<string, unknown>([
    ['plan-a', planEjemplo()],
    ['plan-propuesta', planEjemplo({ id: 'plan-propuesta', estado: 'propuesta', historial: [{ estado: 'propuesta', fecha: HOY.toISOString() }] })],
    ['plan-b', planEjemplo({ id: 'plan-b', loteId: 'lote-b' })],
    ['plan-danado', { ...planEjemplo({ id: 'plan-danado' }), areaM2AlCrear: 'x' }]
  ]);
  let registros = new Map<string, unknown>();
  const almacen: AlmacenSeguimiento = {
    existeLote: async id => lotes.has(id),
    obtenerPlan: async id => structuredClone(planes.get(id)),
    obtener: async id => structuredClone(registros.get(id)),
    listarPorLote: async loteId => [...registros.values()].filter(r => (r as { loteId?: unknown }).loteId === loteId).map(r => structuredClone(r)),
    guardar: async r => { registros.set(r.id, structuredClone(r)); },
    eliminar: async id => { registros.delete(id); },
    transaccion: async fn => {
      const respaldo = new Map(registros);
      try {
        return await fn();
      } catch (error) {
        registros = respaldo;
        throw error;
      }
    }
  };
  let contador = 0;
  const opciones = (extra = {}) => ({ ahora: HOY, generarId: () => `r-${++contador}`, ...extra });
  return { repo: crearRepositorioSeguimiento(almacen), registros: () => registros, opciones };
}

async function rechaza(promesa: Promise<unknown>, mensaje: RegExp) {
  await assert.rejects(promesa, (e: unknown) => e instanceof ErrorPersistencia && mensaje.test(`${e.message} ${e.detalles.join(' ')}`));
}

test('aplicaciones: solo contra un plan aprobado, sano y del mismo lote; el nombre sale del plan', async () => {
  const { repo, registros, opciones } = crearAlmacen();
  const id = await repo.guardar('lote-a', aplicacion({ productoNombre: 'Otro nombre' }), opciones());
  assert.equal((registros().get(id) as RegistroAplicacion).productoNombre, 'DAP EJEMPLO');
  await rechaza(repo.guardar('lote-a', aplicacion({ planId: 'plan-propuesta' }), opciones()), /Solo se registran aplicaciones de un plan aprobado/);
  await rechaza(repo.guardar('lote-a', aplicacion({ planId: 'plan-b' }), opciones()), /pertenece a otro lote/);
  await rechaza(repo.guardar('lote-a', aplicacion({ planId: 'no-existe' }), opciones()), /no existe/);
  await rechaza(repo.guardar('lote-a', aplicacion({ lineaId: 'otra' }), opciones()), /no está en el plan/);
  await rechaza(repo.guardar('lote-a', aplicacion({ planId: 'plan-danado' }), opciones()), /datos guardados dañados/);
  await rechaza(repo.guardar('no-existe', aplicacion(), opciones()), /El lote no existe/);
  assert.equal(registros().size, 1, 'los rechazos no dejan nada escrito');
});

test('aplicaciones parciales: el avance del plan se calcula con lo registrado', async () => {
  const { repo, opciones } = crearAlmacen();
  await repo.guardar('lote-a', aplicacion({ fecha: '2026-10-10', cantidadKg: 5 }), opciones());
  await repo.guardar('lote-a', aplicacion({ fecha: '2026-10-25', cantidadKg: 3 }), opciones());
  await repo.guardar('lote-a', observacion(), opciones());
  const lista = await repo.listar('lote-a');
  assert.deepEqual(lista.map(v => v.tipo), ['aplicacion', 'observacion', 'aplicacion']);
  const aplicaciones = lista.flatMap(v => (v.registro?.tipo === 'aplicacion' ? [v.registro] : []));
  const [avance] = avancePlan(planEjemplo(), aplicaciones);
  assert.ok(avance.porcentaje?.ok);
  if (avance.porcentaje?.ok) cerca(avance.porcentaje.valor, 73.6);
});

test('editar conserva la creación y los campos de otras versiones; no cambia el tipo; una tarea se marca hecha', async () => {
  const { repo, registros, opciones } = crearAlmacen();
  const id = await repo.guardar('lote-a', tarea(), opciones());
  registros().set(id, { ...(registros().get(id) as object), version: 9 });
  await repo.guardar('lote-a', tarea({ estado: 'hecha', fechaRealizada: '2026-10-28', responsable: 'Productor EJEMPLO' }), { id, ahora: LUEGO });
  const guardado = registros().get(id) as Record<string, unknown>;
  assert.equal(guardado.estado, 'hecha');
  assert.equal(guardado.createdAt, HOY.toISOString());
  assert.equal(guardado.updatedAt, LUEGO.toISOString());
  assert.equal(guardado.version, 9);
  await rechaza(repo.guardar('lote-a', observacion(), { id }), /No se puede cambiar el tipo/);
  await rechaza(repo.guardar('lote-b', tarea(), { id }), /pertenece a otro lote/);
});

test('un registro dañado solo se reemplaza con confirmación; eliminar exige el mismo lote', async () => {
  const { repo, registros, opciones } = crearAlmacen();
  const id = await repo.guardar('lote-a', observacion(), opciones());
  const danado = { ...(registros().get(id) as object), descripcion: 42 };
  registros().set(id, structuredClone(danado));
  assert.ok((await repo.listar('lote-a'))[0].problemas.length > 0);
  await rechaza(repo.guardar('lote-a', observacion(), { id }), /valor guardado 42/);
  assert.deepEqual(registros().get(id), danado, 'el original queda intacto');
  await repo.guardar('lote-a', observacion(), { id, descartarDanados: true });
  assert.deepEqual((await repo.listar('lote-a'))[0].problemas, []);
  await rechaza(repo.eliminar('lote-b', id), /pertenece a otro lote/);
  await repo.eliminar('lote-a', id);
  assert.equal(registros().size, 0);
  await rechaza(repo.eliminar('lote-a', id), /no existe/);
});

// ---- Fase 4b: formulario de aplicación y costo registrado ----

const formAplicacion = (cambios: Partial<EntradaAplicacion> = {}): EntradaAplicacion => ({
  fecha: '2026-10-20', cantidadKg: '5', costoCop: '', responsable: ' Productor EJEMPLO ', nota: '', origen: 'ejemplo', ...cambios
});
const destino = { planId: 'plan-a', lineaId: 'l-dap', productoNombre: 'DAP EJEMPLO' };

test('formulario de aplicación: datos válidos con coma decimal; costo opcional', () => {
  const r = validarAplicacionFormulario(formAplicacion({ cantidadKg: '3,5', costoCop: '15000' }), destino, HOY);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.datos, {
    tipo: 'aplicacion', planId: 'plan-a', lineaId: 'l-dap', productoNombre: 'DAP EJEMPLO', fecha: '2026-10-20',
    cantidadKg: 3.5, costoCop: 15_000, responsable: 'Productor EJEMPLO', nota: undefined, esEjemplo: true
  });
  const sinCosto = validarAplicacionFormulario(formAplicacion({ origen: 'real' }), destino, HOY);
  assert.ok(sinCosto.ok && sinCosto.datos.tipo === 'aplicacion' && sinCosto.datos.costoCop === undefined && sinCosto.datos.esEjemplo === false);
});

test('formulario de aplicación: rechaza escrituras ambiguas, fechas futuras y origen sin elegir', () => {
  const errores = (cambios: Partial<EntradaAplicacion>) => {
    const r = validarAplicacionFormulario(formAplicacion(cambios), destino, HOY);
    assert.ok(!r.ok);
    return r.ok ? {} : r.errores;
  };
  assert.match(errores({ cantidadKg: '1.500' }).cantidadKg ?? '', /se puede leer de dos formas/);
  assert.match(errores({ cantidadKg: '0' }).cantidadKg ?? '', /mayor que cero/);
  assert.match(errores({ cantidadKg: '' }).cantidadKg ?? '', /obligatorio/);
  assert.match(errores({ costoCop: '150.000' }).costoCop ?? '', /Escribe 150000/);
  assert.match(errores({ costoCop: '-1' }).costoCop ?? '', /negativo/);
  assert.match(errores({ fecha: '2026-10-30' }).fecha ?? '', /futura/);
  assert.match(errores({ fecha: '' }).fecha ?? '', /obligatoria/);
  assert.match(errores({ origen: '' }).origen ?? '', /real o de EJEMPLO/);
});

test('costo registrado: suma solo lo que el usuario escribió e informa cuántas aplicaciones no tienen costo', () => {
  const r = costoRegistrado([{ costoCop: 15_000 }, {}, { costoCop: 10_500 }]);
  assert.ok(r.totalCop.ok && r.totalCop.valor === 25_500);
  assert.equal(r.conCosto, 2);
  assert.equal(r.sinCosto, 1);
  const vacio = costoRegistrado([]);
  assert.ok(vacio.totalCop.ok && vacio.totalCop.valor === 0 && vacio.conCosto === 0);
});
