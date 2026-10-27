/**
 * Pruebas de persistencia con un almacén en memoria que imita IndexedDB (copias estructuradas
 * y transacciones con reversión). Las reglas probadas son las mismas que usa `db.ts` con Dexie.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { equivalenciasAnalisis } from '../src/lib/calculos.ts';
import { crearRepositorioAnalisis, ErrorPersistencia, type AlmacenAnalisis } from '../src/lib/repositorioAnalisis.ts';
import type { AnalisisSuelo } from '../src/types.ts';

const HOY = new Date(2026, 9, 27, 10);

function crearAlmacen() {
  const lotes = new Map<string, number>([['lote-a', 500], ['lote-b', 2_000]]);
  let analisis = new Map<string, unknown>();
  const almacen: AlmacenAnalisis = {
    obtenerAreaLote: async id => lotes.get(id),
    obtener: async id => structuredClone(analisis.get(id)),
    listarPorLote: async loteId =>
      [...analisis.values()].filter(a => (a as { loteId?: unknown }).loteId === loteId).map(a => structuredClone(a)),
    guardar: async registro => { analisis.set(registro.id, structuredClone(registro)); },
    eliminar: async id => { analisis.delete(id); },
    transaccion: async fn => {
      const respaldo = new Map(analisis);
      try {
        return await fn();
      } catch (error) {
        analisis = respaldo;
        throw error;
      }
    }
  };
  let contador = 0;
  const repo = crearRepositorioAnalisis(almacen);
  const opciones = (extra = {}) => ({ ahora: HOY, generarId: () => `an-${++contador}`, ...extra });
  return { repo, lotes, crudo: () => analisis, opciones };
}

const datos = (cambios: Record<string, unknown> = {}) => ({
  fechaAnalisis: '2026-10-01',
  profundidadCm: 20,
  densidadGcm3: 1.2,
  laboratorio: 'Laboratorio EJEMPLO',
  metodoLaboratorio: 'Método EJEMPLO',
  nutrientes: [{ elemento: 'Fósforo', forma: 'P', valor: 20, unidad: 'mg/kg' }],
  ...cambios
});

const kgLote = (a: Parameters<typeof equivalenciasAnalisis>[0]) => {
  const n = equivalenciasAnalisis(a).nutrientes[0];
  return n.estado === 'calculada' && n.kgLote.ok ? n.kgLote.valor : null;
};

test('crear y leer: guarda el área del lote al registrar y calcula con ella', async () => {
  const { repo, opciones } = crearAlmacen();
  const id = await repo.guardar('lote-a', datos(), opciones());
  const [leido] = await repo.listar('lote-a');
  assert.equal(leido.id, id);
  assert.equal(leido.areaM2AlRegistro, 500);
  assert.deepEqual(leido.problemas, []);
  assert.equal(kgLote(leido), 2.4);
});

test('cambiar el área del lote no altera el resultado histórico', async () => {
  const { repo, lotes, opciones } = crearAlmacen();
  const id = await repo.guardar('lote-a', datos(), opciones());
  lotes.set('lote-a', 1_000);
  assert.equal(kgLote((await repo.listar('lote-a'))[0]), 2.4, 'lectura tras cambiar el área');

  await repo.guardar('lote-a', datos({ observaciones: 'Editado' }), opciones({ id }));
  const editado = (await repo.listar('lote-a'))[0];
  assert.equal(editado.areaM2AlRegistro, 500, 'editar conserva el área histórica');
  assert.equal(kgLote(editado), 2.4);

  await repo.guardar('lote-a', datos(), opciones({ id, actualizarArea: true }));
  const actualizado = (await repo.listar('lote-a'))[0];
  assert.equal(actualizado.areaM2AlRegistro, 1_000, 'solo cambia si se pide explícitamente');
  assert.equal(kgLote(actualizado), 4.8);
});

test('editar conserva id y fecha de creación y actualiza la fecha de modificación', async () => {
  const { repo, crudo, opciones } = crearAlmacen();
  const id = await repo.guardar('lote-a', datos(), opciones({ ahora: new Date(2026, 9, 1) }));
  const creado = (crudo().get(id) as AnalisisSuelo).createdAt;
  await repo.guardar('lote-a', datos({ profundidadCm: 30 }), opciones({ id }));
  const guardado = crudo().get(id) as AnalisisSuelo;
  assert.equal(crudo().size, 1);
  assert.equal(guardado.createdAt, creado);
  assert.equal(guardado.updatedAt, HOY.toISOString());
  assert.equal(guardado.profundidadCm, 30);
});

test('aislamiento entre lotes: listar, editar y eliminar no cruzan lotes', async () => {
  const { repo, crudo, opciones } = crearAlmacen();
  const idA = await repo.guardar('lote-a', datos(), opciones());
  const idB = await repo.guardar('lote-b', datos({ profundidadCm: 30 }), opciones());
  assert.deepEqual((await repo.listar('lote-a')).map(a => a.id), [idA]);
  assert.deepEqual((await repo.listar('lote-b')).map(a => a.id), [idB]);

  await assert.rejects(repo.guardar('lote-b', datos(), opciones({ id: idA })), ErrorPersistencia);
  await assert.rejects(repo.eliminar('lote-b', idA), ErrorPersistencia);
  assert.equal((crudo().get(idA) as AnalisisSuelo).loteId, 'lote-a');
  assert.equal((crudo().get(idA) as AnalisisSuelo).profundidadCm, 20);

  await repo.eliminar('lote-a', idA);
  assert.deepEqual(await repo.listar('lote-a'), []);
  assert.equal((await repo.listar('lote-b')).length, 1);
});

test('rechaza lotes inexistentes, análisis inexistentes y datos inválidos sin escribir nada', async () => {
  const { repo, crudo, opciones } = crearAlmacen();
  await assert.rejects(repo.guardar('lote-x', datos(), opciones()), /El lote no existe/);
  await assert.rejects(repo.guardar('lote-a', datos(), opciones({ id: 'no-existe' })), ErrorPersistencia);
  await assert.rejects(repo.eliminar('lote-a', 'no-existe'), ErrorPersistencia);
  for (const invalido of [
    datos({ profundidadCm: Number.NaN }),
    datos({ densidadGcm3: 0 }),
    datos({ fechaAnalisis: '2026-12-31' }),
    datos({ ph: 15 }),
    datos({ nutrientes: [{ elemento: 'Fósforo', forma: 'K₂O', valor: 5, unidad: 'mg/kg' }] }),
    datos({ nutrientes: [{ elemento: 'Potasio', forma: 'K', valor: 5, unidad: 'ppm' }] }),
    datos({ profundidadCm: 1e15, densidadGcm3: 1e3 })
  ]) {
    await assert.rejects(repo.guardar('lote-a', invalido, opciones()), ErrorPersistencia);
  }
  assert.equal(crudo().size, 0);
});

test('no guarda campos ajenos al análisis (por ejemplo, una dosis)', async () => {
  const { repo, crudo, opciones } = crearAlmacen();
  const id = await repo.guardar('lote-a', datos({ dosisKgHa: 100, loteId: 'lote-b', areaM2AlRegistro: 1 }), opciones());
  const guardado = crudo().get(id) as Record<string, unknown>;
  assert.equal(guardado.loteId, 'lote-a');
  assert.equal(guardado.areaM2AlRegistro, 500);
  assert.ok(!('dosisKgHa' in guardado));
});

test('registros antiguos sin área: se leen sin reconstruirla y no se modifican al consultarlos', async () => {
  const { repo, crudo, opciones } = crearAlmacen();
  const antiguo = { id: 'viejo', loteId: 'lote-a', fechaAnalisis: '2026-01-01', profundidadCm: 20, densidadGcm3: 1.2, nutrientesMgKg: { P: 20 } };
  crudo().set('viejo', structuredClone(antiguo));
  const [leido] = await repo.listar('lote-a');
  assert.equal(leido.areaM2AlRegistro, undefined);
  assert.equal(kgLote(leido), null, 'sin área histórica no hay total del lote');
  assert.deepEqual(crudo().get('viejo'), antiguo);

  await repo.guardar('lote-a', datos(), opciones({ id: 'viejo' }));
  assert.equal((crudo().get('viejo') as AnalisisSuelo).areaM2AlRegistro, undefined, 'editar no inventa el área');
  await repo.guardar('lote-a', datos(), opciones({ id: 'viejo', actualizarArea: true }));
  assert.equal((crudo().get('viejo') as AnalisisSuelo).areaM2AlRegistro, 500);
});

test('registros dañados se listan con sus problemas sin romper la consulta', async () => {
  const { repo, crudo } = crearAlmacen();
  crudo().set('roto', { id: 'roto', loteId: 'lote-a', fechaAnalisis: null, profundidadCm: 'veinte', nutrientes: [null] });
  crudo().set('bien', { id: 'bien', loteId: 'lote-a', fechaAnalisis: '2026-02-01', profundidadCm: 20, nutrientes: [] });
  const lista = await repo.listar('lote-a');
  assert.deepEqual(lista.map(a => a.id), ['bien', 'roto']);
  assert.ok(lista[1].problemas.length >= 3);
  assert.equal((crudo().get('roto') as { profundidadCm: unknown }).profundidadCm, 'veinte', 'el original se conserva');
});

// ---- Segunda auditoría: datos dañados no se pierden sin consentimiento ----

const danado = () => ({
  id: 'danado', loteId: 'lote-a', fechaAnalisis: '2026-09-01', profundidadCm: 20, densidadGcm3: 'abc',
  laboratorio: 'Lab EJEMPLO', metodoLaboratorio: 'Método EJEMPLO', areaM2AlRegistro: 500,
  observaciones: { texto: 'lluvia' }, versionFutura: 3,
  nutrientes: [null, { elemento: 'Fósforo', forma: 'P', valor: 20, unidad: 'mg/kg' }]
});

test('editar un registro dañado sin resolver sus datos no guarda nada y conserva el original', async () => {
  const { repo, crudo, opciones } = crearAlmacen();
  crudo().set('danado', danado());
  const error = await repo.guardar('lote-a', datos(), opciones({ id: 'danado' })).catch(e => e);
  assert.ok(error instanceof ErrorPersistencia);
  assert.match(error.message, /sin resolver/);
  assert.equal(error.detalles.length, 3, 'densidad, observaciones y resultado 1');
  // Resolver solo una parte tampoco basta.
  await assert.rejects(repo.guardar('lote-a', datos(), opciones({ id: 'danado', resueltos: ['densidadGcm3'] })), ErrorPersistencia);
  assert.deepEqual(crudo().get('danado'), danado(), 'el registro original queda intacto');
});

test('corregir y descartar expresamente: se guarda lo corregido y solo se elimina lo confirmado', async () => {
  const { repo, crudo, opciones } = crearAlmacen();
  crudo().set('danado', danado());
  await repo.guardar('lote-a', datos({ densidadGcm3: 1.3, observaciones: 'Corregido a mano' }),
    opciones({ id: 'danado', resueltos: ['densidadGcm3', 'observaciones', 'nutrientes.0'] }));
  const guardado = crudo().get('danado') as Record<string, unknown>;
  assert.equal(guardado.densidadGcm3, 1.3, 'corregido');
  assert.equal(guardado.observaciones, 'Corregido a mano');
  assert.equal(guardado.areaM2AlRegistro, 500, 'el área histórica válida se conserva');
  assert.equal(guardado.versionFutura, 3, 'campos de otras versiones se conservan');
  const [leido] = await repo.listar('lote-a');
  assert.deepEqual(leido.problemas, []);
});

test('un área histórica inválida no se descarta sin confirmación', async () => {
  const { repo, crudo, opciones } = crearAlmacen();
  const conAreaRota = { ...datos(), id: 'x', loteId: 'lote-a', areaM2AlRegistro: -5 };
  crudo().set('x', structuredClone(conAreaRota));
  await assert.rejects(repo.guardar('lote-a', datos(), opciones({ id: 'x' })), /sin resolver/);
  assert.equal((crudo().get('x') as AnalisisSuelo).areaM2AlRegistro, -5);
  await repo.guardar('lote-a', datos(), opciones({ id: 'x', resueltos: ['areaM2AlRegistro'] }));
  assert.equal((crudo().get('x') as AnalisisSuelo).areaM2AlRegistro, undefined, 'descartado con consentimiento');
  crudo().set('x', structuredClone(conAreaRota));
  await repo.guardar('lote-a', datos(), opciones({ id: 'x', actualizarArea: true }));
  assert.equal((crudo().get('x') as AnalisisSuelo).areaM2AlRegistro, 500, 'corregido con el área actual');
});

test('arrays dispersos guardados exigen resolución y no se reescriben con huecos', async () => {
  const { repo, crudo, opciones } = crearAlmacen();
  crudo().set('hueco', { ...datos(), id: 'hueco', loteId: 'lote-a', areaM2AlRegistro: 500, nutrientes: new Array(2) });
  const [leido] = await repo.listar('lote-a');
  assert.equal(leido.problemas.length, 2);
  await assert.rejects(repo.guardar('lote-a', datos(), opciones({ id: 'hueco' })), ErrorPersistencia);
  await assert.rejects(repo.guardar('lote-a', { ...datos(), nutrientes: new Array(1) }, opciones()), ErrorPersistencia, 'tampoco se crean con huecos');
  await repo.guardar('lote-a', datos(), opciones({ id: 'hueco', resueltos: ['nutrientes.0', 'nutrientes.1'] }));
  const guardado = crudo().get('hueco') as AnalisisSuelo;
  assert.equal(guardado.nutrientes.length, 1);
  assert.ok(0 in guardado.nutrientes);
});

test('ida y vuelta de números extremos a través de la persistencia', async () => {
  const { repo, crudo, opciones } = crearAlmacen();
  const id = await repo.guardar('lote-a', datos({ densidadGcm3: 1e-21, ph: 1e-21, nutrientes: [{ elemento: 'Boro', forma: 'B', valor: 1e-21, unidad: 'mg/kg' }] }), opciones());
  const g = crudo().get(id) as AnalisisSuelo;
  assert.equal(g.densidadGcm3, 1e-21, 'no se redondea a cero');
  assert.equal(g.ph, 1e-21);
  assert.equal(g.nutrientes[0].valor, 1e-21);
  // Producto con subdesbordamiento: se rechaza en lugar de guardar un resultado que sería 0.
  await assert.rejects(repo.guardar('lote-a', datos({ profundidadCm: 1e-4, densidadGcm3: 1e-4, nutrientes: [{ elemento: 'Boro', forma: 'B', valor: 5e-324, unidad: 'mg/kg' }] }), opciones()),
    (e: unknown) => e instanceof ErrorPersistencia && /demasiado pequeño/.test(e.detalles.join(' ')));
});
