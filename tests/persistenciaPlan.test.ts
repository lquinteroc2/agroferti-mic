/**
 * Persistencia de la fase 3 con almacenes en memoria que imitan IndexedDB (copias estructuradas
 * y transacciones con reversión). Las reglas son las mismas que usa `db.ts` con Dexie.
 * Productos, precios y metas son de EJEMPLO.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularPlan } from '../src/lib/calculos.ts';
import { ErrorPersistencia } from '../src/lib/repositorioAnalisis.ts';
import { crearRepositorioPlanes, crearRepositorioProductos } from '../src/lib/repositorioPlanes.ts';
import { copiarProducto } from '../src/lib/validacionPlan.ts';
import type { MetaNutrimental, ProductoFertilizante } from '../src/types.ts';

const HOY = new Date(2026, 9, 29, 10);
const LUEGO = new Date(2026, 9, 29, 11);

function crearAlmacenes() {
  const lotes = new Map<string, number>([['lote-a', 500], ['lote-b', 2_000]]);
  const analisis = new Map<string, string>([['an-a', 'lote-a'], ['an-b', 'lote-b']]);
  const tablas = { planes: new Map<string, unknown>(), productos: new Map<string, unknown>() };
  async function transaccion<T>(fn: () => Promise<T>): Promise<T> {
    const respaldo = { planes: new Map(tablas.planes), productos: new Map(tablas.productos) };
    try {
      return await fn();
    } catch (error) {
      Object.assign(tablas, respaldo);
      throw error;
    }
  }
  const productos = crearRepositorioProductos({
    obtener: async id => structuredClone(tablas.productos.get(id)),
    listar: async () => [...tablas.productos.values()].map(p => structuredClone(p)),
    guardar: async registro => { tablas.productos.set(registro.id, structuredClone(registro)); },
    eliminar: async id => { tablas.productos.delete(id); },
    transaccion
  });
  const planes = crearRepositorioPlanes({
    obtenerAreaLote: async id => lotes.get(id),
    analisisDelLote: async (loteId, id) => analisis.get(id) === loteId,
    obtener: async id => structuredClone(tablas.planes.get(id)),
    listarPorLote: async loteId =>
      [...tablas.planes.values()].filter(p => (p as { loteId?: unknown }).loteId === loteId).map(p => structuredClone(p)),
    guardar: async registro => { tablas.planes.set(registro.id, structuredClone(registro)); },
    eliminar: async id => { tablas.planes.delete(id); },
    transaccion
  });
  let contador = 0;
  const opciones = (extra = {}) => ({ ahora: HOY, generarId: () => `id-${++contador}`, ...extra });
  return { productos, planes, lotes, analisis, tablas, opciones };
}

const DAP = {
  nombre: 'DAP EJEMPLO', esEjemplo: true,
  contenido: [{ elemento: 'Nitrógeno', forma: 'N', porcentaje: 18 }, { elemento: 'Fósforo', forma: 'P₂O₅', porcentaje: 46 }],
  presentacionKg: 50, precioPresentacionCop: 150_000, fechaPrecio: '2026-10-01'
};
const metaP: MetaNutrimental = {
  id: 'm-p', elemento: 'Fósforo', forma: 'P₂O₅', kgHa: 100, fuente: 'Fuente técnica EJEMPLO', fechaFuente: '2026-09-15', esEjemplo: true
};
const datosPlan = (producto: ProductoFertilizante, cambios: Record<string, unknown> = {}) => ({
  nombre: 'Plan papa EJEMPLO', metas: [metaP], lineas: [{ id: 'l-1', metaId: 'm-p', producto: copiarProducto(producto) }], ...cambios
});

async function rechaza(promesa: Promise<unknown>, mensaje: RegExp) {
  await assert.rejects(promesa, (e: unknown) => e instanceof ErrorPersistencia && mensaje.test(`${e.message} ${e.detalles.join(' ')}`));
}

/** Producto del catálogo + plan en propuesta del lote A. */
async function prepararPlan(a: ReturnType<typeof crearAlmacenes>) {
  const productoId = await a.productos.guardar(DAP, a.opciones());
  const producto = (await a.productos.listar())[0].producto as ProductoFertilizante;
  const planId = await a.planes.crear('lote-a', datosPlan(producto), a.opciones({ responsable: 'Productor EJEMPLO' }));
  return { productoId, producto, planId };
}

const kgLote = (plan: Parameters<typeof calcularPlan>[0]) => {
  const l = calcularPlan(plan).lineas[0];
  return l.estado === 'calculada' && l.productoKgLote.ok ? l.productoKgLote.valor : null;
};

// ---- Catálogo de productos ----

test('productos: crear, listar en orden alfabético, editar y eliminar', async () => {
  const a = crearAlmacenes();
  const id = await a.productos.guardar(DAP, a.opciones());
  await a.productos.guardar({ ...DAP, nombre: 'Abono EJEMPLO' }, a.opciones());
  assert.deepEqual((await a.productos.listar()).map(p => p.nombre), ['Abono EJEMPLO', 'DAP EJEMPLO']);

  await a.productos.guardar({ ...DAP, precioPresentacionCop: 160_000 }, { id, ahora: LUEGO });
  const editado = (await a.productos.listar()).find(p => p.id === id)?.producto;
  assert.equal(editado?.precioPresentacionCop, 160_000);
  assert.equal(editado?.createdAt, HOY.toISOString(), 'conserva la fecha de creación');
  assert.equal(editado?.updatedAt, LUEGO.toISOString());

  await a.productos.eliminar(id);
  assert.equal((await a.productos.listar()).length, 1);
  await rechaza(a.productos.eliminar(id), /no existe/);
  await rechaza(a.productos.guardar(DAP, { id: 'no-existe' }), /no existe/);
});

test('productos: datos inválidos no se guardan', async () => {
  const a = crearAlmacenes();
  await rechaza(a.productos.guardar({ ...DAP, contenido: [{ elemento: 'Fósforo', forma: 'K₂O', porcentaje: 60 }] }, a.opciones()), /corresponde a Potasio/);
  assert.equal(a.tablas.productos.size, 0);
});

test('productos: un registro dañado solo se reemplaza con confirmación expresa; los campos de otras versiones se conservan', async () => {
  const a = crearAlmacenes();
  const danado = { id: 'p', nombre: 'DAP EJEMPLO', contenido: [{ elemento: 'Fósforo', forma: 'P₂O₅', porcentaje: 'x' }], esEjemplo: true, version: 9 };
  a.tablas.productos.set('p', structuredClone(danado));
  assert.ok((await a.productos.listar())[0].problemas.length > 0);
  await rechaza(a.productos.guardar(DAP, { id: 'p', ahora: HOY }), /valor guardado "x"/);
  assert.deepEqual(a.tablas.productos.get('p'), danado, 'el original queda intacto');

  await a.productos.guardar(DAP, { id: 'p', ahora: HOY, descartarDanados: true });
  const guardado = a.tablas.productos.get('p') as Record<string, unknown>;
  assert.equal(guardado.version, 9);
  assert.deepEqual((await a.productos.listar())[0].problemas, []);
});

// ---- Planes ----

test('crear un plan guarda el área del lote como propuesta, con historial', async () => {
  const a = crearAlmacenes();
  const { planId } = await prepararPlan(a);
  const [plan] = await a.planes.listar('lote-a');
  assert.equal(plan.id, planId);
  assert.deepEqual(plan.problemas, []);
  assert.equal(plan.estado, 'propuesta');
  assert.equal(plan.areaM2AlCrear, 500);
  assert.deepEqual(plan.historial, [{ estado: 'propuesta', fecha: HOY.toISOString(), responsable: 'Productor EJEMPLO', nota: undefined }]);
  assert.ok(Math.abs((kgLote(plan) ?? 0) - 10.869565217391303) < 1e-9);
});

test('cambiar el área del lote no altera el plan; solo se actualiza si se pide al editar', async () => {
  const a = crearAlmacenes();
  const { producto, planId } = await prepararPlan(a);
  a.lotes.set('lote-a', 1_000);
  assert.equal((await a.planes.listar('lote-a'))[0].areaM2AlCrear, 500);

  await a.planes.editar('lote-a', planId, datosPlan(producto, { nombre: 'Editado EJEMPLO' }), { ahora: LUEGO });
  const editado = (await a.planes.listar('lote-a'))[0];
  assert.equal(editado.areaM2AlCrear, 500, 'editar conserva el área histórica');
  assert.equal(editado.nombre, 'Editado EJEMPLO');
  assert.equal(editado.createdAt, HOY.toISOString());
  assert.equal(editado.historial.length, 1, 'editar no cambia el historial');

  await a.planes.editar('lote-a', planId, datosPlan(producto), { actualizarArea: true, ahora: LUEGO });
  assert.equal((await a.planes.listar('lote-a'))[0].areaM2AlCrear, 1_000);
});

test('flujo de estados con historial; un plan aprobado no se edita, no cambia ni se elimina', async () => {
  const a = crearAlmacenes();
  const { producto, planId } = await prepararPlan(a);
  await rechaza(a.planes.cambiarEstado('lote-a', planId, 'aprobado', { responsable: 'Agrónomo EJEMPLO' }), /no puede pasar a «aprobado»/);
  await rechaza(a.planes.cambiarEstado('lote-a', planId, 'revisado', {}), /nombre de quien registra/);

  await a.planes.cambiarEstado('lote-a', planId, 'revisado', { responsable: 'Agrónomo EJEMPLO', ahora: LUEGO });
  await rechaza(a.planes.editar('lote-a', planId, datosPlan(producto)), /Solo se puede editar un plan en propuesta/);
  await a.planes.cambiarEstado('lote-a', planId, 'aprobado', { responsable: 'Agrónomo EJEMPLO', nota: 'Revisado con la fuente EJEMPLO', ahora: LUEGO });

  const [aprobado] = await a.planes.listar('lote-a');
  assert.equal(aprobado.estado, 'aprobado');
  assert.deepEqual(aprobado.historial.map(h => h.estado), ['propuesta', 'revisado', 'aprobado']);
  assert.equal(aprobado.historial[2].nota, 'Revisado con la fuente EJEMPLO');
  assert.deepEqual(aprobado.problemas, []);

  await rechaza(a.planes.editar('lote-a', planId, datosPlan(producto)), /Solo se puede editar/);
  await rechaza(a.planes.cambiarEstado('lote-a', planId, 'propuesta', { responsable: 'X' }), /crea una copia/);
  await rechaza(a.planes.eliminar('lote-a', planId), /aprobado no se puede eliminar/);
  assert.equal((await a.planes.listar('lote-a')).length, 1);
});

test('devolver a propuesta permite editar de nuevo', async () => {
  const a = crearAlmacenes();
  const { producto, planId } = await prepararPlan(a);
  await a.planes.cambiarEstado('lote-a', planId, 'revisado', { responsable: 'Agrónomo EJEMPLO' });
  await a.planes.cambiarEstado('lote-a', planId, 'propuesta', { responsable: 'Agrónomo EJEMPLO', nota: 'Falta la fuente' });
  await a.planes.editar('lote-a', planId, datosPlan(producto, { nombre: 'Corregido EJEMPLO' }));
  const [plan] = await a.planes.listar('lote-a');
  assert.equal(plan.nombre, 'Corregido EJEMPLO');
  assert.deepEqual(plan.historial.map(h => h.estado), ['propuesta', 'revisado', 'propuesta']);
});

test('copiar un plan aprobado crea una propuesta nueva con el área actual y conserva el original', async () => {
  const a = crearAlmacenes();
  const { planId } = await prepararPlan(a);
  await a.planes.cambiarEstado('lote-a', planId, 'revisado', { responsable: 'Agrónomo EJEMPLO' });
  await a.planes.cambiarEstado('lote-a', planId, 'aprobado', { responsable: 'Agrónomo EJEMPLO' });
  a.lotes.set('lote-a', 1_000);
  const copiaId = await a.planes.copiar('lote-a', planId, { ...a.opciones(), ahora: LUEGO });
  const copia = (await a.planes.listar('lote-a')).find(p => p.id === copiaId);
  assert.ok(copia);
  assert.equal(copia.estado, 'propuesta');
  assert.equal(copia.planOrigenId, planId);
  assert.equal(copia.areaM2AlCrear, 1_000);
  assert.match(copia.historial[0].nota ?? '', /Copia del plan/);
  const original = (await a.planes.listar('lote-a')).find(p => p.id === planId);
  assert.equal(original?.estado, 'aprobado');
  assert.equal(original?.areaM2AlCrear, 500);
});

test('editar o borrar el producto del catálogo no altera los planes', async () => {
  const a = crearAlmacenes();
  const { productoId, planId } = await prepararPlan(a);
  await a.productos.guardar({ ...DAP, precioPresentacionCop: 1, contenido: [{ elemento: 'Fósforo', forma: 'P₂O₅', porcentaje: 20 }] }, { id: productoId });
  await a.productos.eliminar(productoId);
  const plan = (await a.planes.listar('lote-a')).find(p => p.id === planId);
  assert.equal(plan?.lineas[0].producto.precioPresentacionCop, 150_000);
  assert.equal(plan?.lineas[0].producto.contenido[1].porcentaje, 46);
});

test('cada plan pertenece a su lote; el análisis de referencia debe ser del mismo lote', async () => {
  const a = crearAlmacenes();
  const { producto, planId } = await prepararPlan(a);
  assert.deepEqual(await a.planes.listar('lote-b'), []);
  await rechaza(a.planes.editar('lote-b', planId, datosPlan(producto)), /pertenece a otro lote/);
  await rechaza(a.planes.cambiarEstado('lote-b', planId, 'revisado', { responsable: 'X' }), /pertenece a otro lote/);
  await rechaza(a.planes.eliminar('lote-b', planId), /pertenece a otro lote/);
  await rechaza(a.planes.copiar('lote-b', planId), /pertenece a otro lote/);
  await rechaza(a.planes.crear('no-existe', datosPlan(producto)), /El lote no existe/);

  await rechaza(a.planes.crear('lote-a', datosPlan(producto, { analisisReferenciaId: 'an-b' }), a.opciones()), /otro lote/);
  const id = await a.planes.crear('lote-a', datosPlan(producto, { analisisReferenciaId: 'an-a' }), a.opciones());
  assert.equal((await a.planes.listar('lote-a')).find(p => p.id === id)?.analisisReferenciaId, 'an-a');
});

test('un error de validación al editar deja el plan original intacto', async () => {
  const a = crearAlmacenes();
  const { producto, planId } = await prepararPlan(a);
  const antes = structuredClone(a.tablas.planes.get(planId));
  await rechaza(a.planes.editar('lote-a', planId, datosPlan(producto, { metas: [{ ...metaP, fuente: '' }] })), /Fuente técnica/);
  assert.deepEqual(a.tablas.planes.get(planId), antes);
});

test('un plan guardado dañado se consulta, pero no se edita, no cambia de estado ni se copia', async () => {
  const a = crearAlmacenes();
  const { producto, planId } = await prepararPlan(a);
  const crudo = a.tablas.planes.get(planId) as Record<string, unknown>;
  a.tablas.planes.set(planId, { ...crudo, areaM2AlCrear: 'quinientos', version: 9 });
  const [plan] = await a.planes.listar('lote-a');
  assert.equal(plan.problemas[0].campo, 'areaM2AlCrear');
  assert.deepEqual(plan.camposAdicionales, ['version']);
  await rechaza(a.planes.editar('lote-a', planId, datosPlan(producto)), /datos guardados dañados.*valor guardado "quinientos"/);
  await rechaza(a.planes.cambiarEstado('lote-a', planId, 'revisado', { responsable: 'X' }), /dañados/);
  await rechaza(a.planes.copiar('lote-a', planId), /dañados/);
  await a.planes.eliminar('lote-a', planId);
  assert.equal(a.tablas.planes.size, 0, 'una propuesta dañada sí se puede eliminar');
});

test('los campos de otras versiones del plan se conservan al editar y al cambiar de estado', async () => {
  const a = crearAlmacenes();
  const { producto, planId } = await prepararPlan(a);
  a.tablas.planes.set(planId, { ...(a.tablas.planes.get(planId) as object), version: 9 });
  await a.planes.editar('lote-a', planId, datosPlan(producto));
  await a.planes.cambiarEstado('lote-a', planId, 'revisado', { responsable: 'Agrónomo EJEMPLO' });
  assert.equal((a.tablas.planes.get(planId) as Record<string, unknown>).version, 9);
});

test('revisión: editar con un id vacío (registro con identificador dañado) no crea un registro nuevo', async () => {
  const a = crearAlmacenes();
  await rechaza(a.productos.guardar(DAP, { id: '', ahora: HOY, descartarDanados: true }), /no existe/);
  assert.equal(a.tablas.productos.size, 0);
});

test('revisión 3c: copiar un plan cuyo análisis de referencia se eliminó no falla; la copia queda sin referencia', async () => {
  const a = crearAlmacenes();
  const productoId = await a.productos.guardar(DAP, a.opciones());
  const producto = (await a.productos.listar()).find(p => p.id === productoId)?.producto as ProductoFertilizante;
  const planId = await a.planes.crear('lote-a', datosPlan(producto, { analisisReferenciaId: 'an-a' }), a.opciones());
  await a.planes.cambiarEstado('lote-a', planId, 'revisado', { responsable: 'Agrónomo EJEMPLO' });
  await a.planes.cambiarEstado('lote-a', planId, 'aprobado', { responsable: 'Agrónomo EJEMPLO' });
  a.analisis.delete('an-a');
  const copiaId = await a.planes.copiar('lote-a', planId, a.opciones());
  const planes = await a.planes.listar('lote-a');
  assert.equal(planes.find(p => p.id === copiaId)?.analisisReferenciaId, undefined);
  assert.equal(planes.find(p => p.id === planId)?.analisisReferenciaId, 'an-a', 'el plan aprobado no cambia');
});
