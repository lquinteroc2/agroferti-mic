/**
 * Historial del lote: ciclos de cultivo cerrados y agrupación por fechas. Almacén en memoria con
 * transacciones con reversión. Todos los datos son de EJEMPLO.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparHistorial, duracionDias, ordenarCiclos, validarCierreFormulario, validarDatosCierre, verificarCiclo, type EntradaCierre } from '../src/lib/historial.ts';
import { ErrorPersistencia } from '../src/lib/repositorioAnalisis.ts';
import { crearRepositorioCiclos, type AlmacenCiclos } from '../src/lib/repositorioCiclos.ts';
import { planearRestauracion, TABLAS_RESPALDO, type IdsExistentes } from '../src/lib/respaldo.ts';
import { verificarAnalisis } from '../src/lib/validacion.ts';
import { verificarPlan } from '../src/lib/validacionPlan.ts';
import { verificarRegistro } from '../src/lib/validacionSeguimiento.ts';
import type { CicloCultivo, Lote } from '../src/types.ts';

const HOY = new Date(2026, 10, 11, 10);

const loteEjemplo = (cambios: Partial<Lote> = {}): Lote => ({
  id: 'lote-a', nombre: 'Lote EJEMPLO', cultivo: 'papa', areaM2: 500, fechaSiembra: '2026-03-01', ubicacion: 'Vereda EJEMPLO',
  createdAt: '2026-02-01T10:00:00.000Z', updatedAt: '2026-02-01T10:00:00.000Z', ...cambios
});
const cicloEjemplo = (cambios: Partial<CicloCultivo> = {}): CicloCultivo => ({
  id: 'c1', loteId: 'lote-a', cultivo: 'papa', fechaSiembra: '2026-03-01', fechaCierre: '2026-07-15', areaM2: 500,
  motivo: 'cosechado', notas: 'Cosecha EJEMPLO', esEjemplo: true,
  createdAt: '2026-07-15T10:00:00.000Z', updatedAt: '2026-07-15T10:00:00.000Z', ...cambios
});
const cierre = (cambios: Record<string, unknown> = {}) => ({
  fechaCierre: '2026-07-15', motivo: 'cosechado', notas: 'Cosecha EJEMPLO', esEjemplo: true, nuevoCultivo: 'arveja', nuevaFechaSiembra: '2026-08-01', ...cambios
});

function crearAlmacen(lotes: Record<string, unknown>[] = [loteEjemplo()], ciclos: Record<string, unknown>[] = []) {
  const tablaLotes = new Map(lotes.map(l => [l.id as string, structuredClone(l)]));
  const tablaCiclos = new Map(ciclos.map(c => [c.id as string, structuredClone(c)]));
  const almacen: AlmacenCiclos = {
    obtenerLote: async id => structuredClone(tablaLotes.get(id)),
    guardarLote: async lote => { tablaLotes.set(lote.id, structuredClone(lote)); },
    obtener: async id => structuredClone(tablaCiclos.get(id)),
    listarPorLote: async loteId => [...tablaCiclos.values()].filter(c => c.loteId === loteId).map(c => structuredClone(c)),
    guardar: async ciclo => { tablaCiclos.set(ciclo.id, structuredClone(ciclo)); },
    eliminar: async id => { tablaCiclos.delete(id); },
    async transaccion(fn) {
      const copiaLotes = structuredClone(tablaLotes);
      const copiaCiclos = structuredClone(tablaCiclos);
      try {
        return await fn();
      } catch (e) {
        tablaLotes.clear(); copiaLotes.forEach((v, k) => tablaLotes.set(k, v));
        tablaCiclos.clear(); copiaCiclos.forEach((v, k) => tablaCiclos.set(k, v));
        throw e;
      }
    }
  };
  return { almacen, lotes: tablaLotes, ciclos: tablaCiclos };
}

// ---- Verificación y validación ----

test('verificar: un ciclo sano se lee completo; uno dañado conserva el valor original y no se usa', () => {
  const sano = verificarCiclo(cicloEjemplo());
  assert.equal(sano.problemas.length, 0);
  assert.deepEqual(sano.ciclo, cicloEjemplo());

  const danado = verificarCiclo({ ...cicloEjemplo(), fechaCierre: '2026-02-30', areaM2: Number.NaN, cultivo: 'maíz' });
  assert.equal(danado.ciclo, undefined);
  assert.deepEqual(danado.problemas.map(p => p.campo).sort(), ['areaM2', 'cultivo', 'fechaCierre']);
  assert.equal(danado.problemas.find(p => p.campo === 'fechaCierre')?.valorOriginal, '"2026-02-30"');

  assert.ok(verificarCiclo({ ...cicloEjemplo(), fechaSiembra: '2026-08-01' }).problemas.some(p => p.detalle.includes('posterior a la fecha de cierre')));
  for (const raro of [null, 42, 'texto', [cicloEjemplo()]]) {
    assert.equal(verificarCiclo(raro).ciclo, undefined, `no rompe con ${String(raro)}`);
  }
});

test('cierre: fechas no futuras y en orden; cultivo y motivo de la lista; EJEMPLO obligatorio', () => {
  const ctx = { fechaSiembraActual: '2026-03-01', ultimoCierre: '2025-12-01', hoy: HOY };
  assert.ok(validarDatosCierre(cierre(), ctx).ok);
  assert.ok(validarDatosCierre(cierre({ nuevaFechaSiembra: undefined }), ctx).ok, 'la nueva siembra es opcional');
  assert.ok(validarDatosCierre(cierre({ fechaCierre: '2026-03-01', nuevaFechaSiembra: '2026-03-01' }), ctx).ok, 'el mismo día vale');
  const errores = (cambios: Record<string, unknown>, c = ctx) => {
    const r = validarDatosCierre(cierre(cambios), c);
    return r.ok ? '' : r.errores.join(' ');
  };
  assert.match(errores({ fechaCierre: '2026-11-12' }), /futura/);
  assert.match(errores({ fechaCierre: '2026-02-28' }), /anterior a la siembra/);
  assert.match(errores({ fechaCierre: '2025-11-30' }, { ...ctx, fechaSiembraActual: undefined }), /cierre del ciclo anterior/);
  assert.match(errores({ nuevaFechaSiembra: '2026-07-14' }), /Siembra del nuevo cultivo/);
  assert.match(errores({ motivo: 'vendido' }), /Cómo terminó/);
  assert.match(errores({ nuevoCultivo: 'maíz' }), /Nuevo cultivo/);
  assert.match(errores({ esEjemplo: undefined }), /EJEMPLO/);
  assert.match(errores({ notas: 'x'.repeat(501) }), /500 caracteres/);
  assert.equal(validarDatosCierre(null).ok, false);
});

test('cierre (formulario): errores por campo y sin escribir nada', () => {
  const entrada: EntradaCierre = { fechaCierre: '', motivo: '', notas: '', origen: '', nuevoCultivo: 'papa', nuevaFechaSiembra: '2026-02-30' };
  const r = validarCierreFormulario(entrada, { hoy: HOY });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(Object.keys(r.errores).sort(), ['fechaCierre', 'motivo', 'nuevaFechaSiembra', 'origen']);

  const bien = validarCierreFormulario({ ...entrada, fechaCierre: '2026-07-15', motivo: 'perdido', origen: 'real', nuevaFechaSiembra: '', notas: '  Granizo  ' }, { fechaSiembraActual: '2026-03-01', hoy: HOY });
  assert.ok(bien.ok);
  if (bien.ok) assert.deepEqual(bien.datos, { fechaCierre: '2026-07-15', motivo: 'perdido', notas: 'Granizo', esEjemplo: false, nuevoCultivo: 'papa', nuevaFechaSiembra: undefined });

  const orden = validarCierreFormulario({ ...entrada, fechaCierre: '2026-02-01', motivo: 'otro', origen: 'real', nuevaFechaSiembra: '' }, { fechaSiembraActual: '2026-03-01', hoy: HOY });
  assert.ok(!orden.ok && orden.errores.general?.some(e => /anterior a la siembra/.test(e)));
});

test('duración del ciclo en días y orden de los ciclos', () => {
  assert.equal(duracionDias('2026-03-01', '2026-07-15'), 136);
  assert.equal(duracionDias('2026-03-01', '2026-03-01'), 0);
  assert.equal(duracionDias(undefined, '2026-07-15'), undefined);
  assert.equal(duracionDias('2026-08-01', '2026-07-15'), undefined);
  const lista = [cicloEjemplo({ id: 'b', fechaCierre: '2025-01-01' }), { foo: 1 }, cicloEjemplo({ id: 'a', fechaCierre: '2026-01-01' })].map(verificarCiclo);
  assert.deepEqual(ordenarCiclos(lista).map(v => v.id), ['a', 'b', '']);
});

// ---- Agrupación ----

const analisis = (id: string, fechaAnalisis: string) => verificarAnalisis({ id, loteId: 'lote-a', fechaAnalisis, profundidadCm: 20, nutrientes: [] });
const plan = (id: string, createdAt: string) => verificarPlan({
  id, loteId: 'lote-a', nombre: `Plan ${id}`, areaM2AlCrear: 500, metas: [], lineas: [], estado: 'propuesta',
  historial: [{ estado: 'propuesta', fecha: createdAt }], createdAt, updatedAt: createdAt
});
const observacion = (id: string, fecha: string) => verificarRegistro({
  id, loteId: 'lote-a', tipo: 'observacion', fecha, descripcion: 'Observación EJEMPLO', esEjemplo: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
});

test('agrupar: cada registro cae en un solo ciclo según su fecha; el día del cierre pertenece al ciclo', () => {
  const ciclos = [
    cicloEjemplo({ id: 'c2', cultivo: 'arveja', fechaSiembra: '2026-08-01', fechaCierre: '2026-10-20' }),
    cicloEjemplo({ id: 'c1' })
  ].map(verificarCiclo);
  const h = agruparHistorial({
    ciclos,
    analisis: [analisis('a-antes', '2026-02-20'), analisis('a-cierre', '2026-07-15'), analisis('a-luego', '2026-07-16'), analisis('a-actual', '2026-11-01')],
    planes: [plan('p1', '2026-03-05T15:00:00'), plan('p2', '2026-08-05T15:00:00')],
    registros: [observacion('o1', '2026-10-20'), observacion('o2', '2026-10-21')]
  });
  assert.deepEqual(h.periodos.map(p => p.ciclo?.id ?? 'actual'), ['actual', 'c2', 'c1']);
  const ids = (i: number) => [...h.periodos[i].analisis, ...h.periodos[i].planes, ...h.periodos[i].registros].map(x => x.id).sort();
  assert.deepEqual(ids(2), ['a-antes', 'a-cierre', 'p1'], 'el primer ciclo incluye lo anterior a su cierre, sin límite inferior');
  assert.deepEqual(ids(1), ['a-luego', 'o1', 'p2'], 'el análisis tomado antes de sembrar va con el cultivo siguiente');
  assert.deepEqual(ids(0), ['a-actual', 'o2']);
  assert.equal(h.periodos[1].desdeCierre, '2026-07-15');
  assert.equal(h.periodos[0].desdeCierre, '2026-10-20');
});

test('agrupar: sin ciclos todo es del cultivo actual; ciclos dañados no agrupan; lo sin fecha se aparta', () => {
  const sinCiclos = agruparHistorial({ ciclos: [], analisis: [analisis('a', '2026-01-01')], planes: [], registros: [] });
  assert.equal(sinCiclos.periodos.length, 1);
  assert.equal(sinCiclos.periodos[0].analisis.length, 1);

  const h = agruparHistorial({
    ciclos: [verificarCiclo({ ...cicloEjemplo(), fechaCierre: 'mal' })],
    analisis: [analisis('a', '2026-01-01'), analisis('sin', 'no-es-fecha')],
    planes: [plan('p', 'no-es-fecha')],
    registros: [observacion('o', 'mal')]
  });
  assert.equal(h.periodos.length, 1, 'el ciclo dañado no crea periodo');
  assert.deepEqual(h.periodos[0].analisis.map(a => a.id), ['a']);
  assert.deepEqual([h.sinFecha.analisis.length, h.sinFecha.planes.length, h.sinFecha.registros.length], [1, 1, 1]);
});

// ---- Persistencia ----

test('cerrar ciclo: guarda el cultivo, la siembra y el área del lote y deja el lote con el nuevo cultivo', async () => {
  const { almacen, lotes, ciclos } = crearAlmacen([{ ...loteEjemplo(), campoFuturo: 'se conserva' }]);
  const repo = crearRepositorioCiclos(almacen);
  const id = await repo.cerrarCiclo('lote-a', cierre(), { ahora: HOY, generarId: () => 'nuevo' });
  assert.equal(id, 'nuevo');
  const ciclo = ciclos.get('nuevo') as unknown as CicloCultivo;
  assert.deepEqual(
    [ciclo.cultivo, ciclo.fechaSiembra, ciclo.fechaCierre, ciclo.areaM2, ciclo.motivo, ciclo.esEjemplo],
    ['papa', '2026-03-01', '2026-07-15', 500, 'cosechado', true]
  );
  assert.equal(verificarCiclo(ciclo).problemas.length, 0);
  const lote = lotes.get('lote-a')!;
  assert.deepEqual([lote.cultivo, lote.fechaSiembra, lote.areaM2, lote.nombre, lote.campoFuturo, lote.createdAt], ['arveja', '2026-08-01', 500, 'Lote EJEMPLO', 'se conserva', '2026-02-01T10:00:00.000Z']);
  assert.equal(lote.updatedAt, HOY.toISOString());

  // Sin nueva siembra, el lote queda sin fecha de siembra (no hereda la anterior).
  await repo.cerrarCiclo('lote-a', cierre({ fechaCierre: '2026-10-01', nuevoCultivo: 'papa', nuevaFechaSiembra: undefined }), { ahora: HOY, generarId: () => 'otro' });
  assert.equal(lotes.get('lote-a')!.fechaSiembra, undefined);
  assert.equal((ciclos.get('otro') as unknown as CicloCultivo).cultivo, 'arveja');
  assert.deepEqual((await repo.listar('lote-a')).map(v => v.id), ['otro', 'nuevo']);
});

test('cerrar ciclo: rechaza cierres desordenados, lotes ajenos o dañados, y no deja cambios a medias', async () => {
  const { almacen, lotes, ciclos } = crearAlmacen([loteEjemplo({ fechaSiembra: undefined }), { ...loteEjemplo({ id: 'roto' }), areaM2: -1 }], [cicloEjemplo({ fechaCierre: '2026-09-01' })]);
  const repo = crearRepositorioCiclos(almacen);
  await assert.rejects(repo.cerrarCiclo('lote-a', cierre({ fechaCierre: '2026-08-31' }), { ahora: HOY }), (e: unknown) =>
    e instanceof ErrorPersistencia && e.detalles.some(d => /ciclo anterior/.test(d)));
  await assert.rejects(repo.cerrarCiclo('no-existe', cierre(), { ahora: HOY }), /no existe/);
  await assert.rejects(repo.cerrarCiclo('roto', cierre(), { ahora: HOY }), /no son válidos/);
  assert.equal(ciclos.size, 1);
  assert.equal(lotes.get('lote-a')!.cultivo, 'papa');

  // Si guardar el lote falla, el ciclo tampoco queda guardado.
  const fallo = crearAlmacen();
  fallo.almacen.guardarLote = async () => { throw new Error('disco lleno'); };
  await assert.rejects(crearRepositorioCiclos(fallo.almacen).cerrarCiclo('lote-a', cierre(), { ahora: HOY }), /disco lleno/);
  assert.equal(fallo.ciclos.size, 0);
  assert.equal(fallo.lotes.get('lote-a')!.cultivo, 'papa');
});

test('editar notas y quitar un ciclo: solo del mismo lote; un ciclo dañado no se edita; el lote no cambia', async () => {
  const { almacen, lotes, ciclos } = crearAlmacen([loteEjemplo()], [
    { ...cicloEjemplo(), extra: 'de otra versión' },
    { ...cicloEjemplo({ id: 'danado' }), areaM2: 'mucho' },
    cicloEjemplo({ id: 'ajeno', loteId: 'lote-b' })
  ]);
  const repo = crearRepositorioCiclos(almacen);
  await repo.editarNotas('lote-a', 'c1', { motivo: 'perdido', notas: '  Helada  ', esEjemplo: false }, { ahora: HOY });
  const editado = ciclos.get('c1')!;
  assert.deepEqual([editado.motivo, editado.notas, editado.esEjemplo, editado.fechaCierre, editado.extra], ['perdido', 'Helada', false, '2026-07-15', 'de otra versión']);
  await repo.editarNotas('lote-a', 'c1', { motivo: 'perdido', notas: undefined, esEjemplo: false }, { ahora: HOY });
  assert.equal('notas' in ciclos.get('c1')!, false, 'vaciar las notas las quita');

  await assert.rejects(repo.editarNotas('lote-a', 'danado', { motivo: 'otro', esEjemplo: true }), /solo se puede eliminar/);
  await assert.rejects(repo.editarNotas('lote-a', 'c1', { motivo: 'vendido' as never, esEjemplo: true }), /no son válidos/);
  await assert.rejects(repo.eliminar('lote-a', 'ajeno'), /otro lote/);
  await repo.eliminar('lote-a', 'danado');
  assert.deepEqual([...ciclos.keys()].sort(), ['ajeno', 'c1']);
  assert.equal(lotes.get('lote-a')!.cultivo, 'papa');
});

test('copia de seguridad: los ciclos dependen de su lote', () => {
  assert.ok((TABLAS_RESPALDO as ReadonlyArray<string>).includes('ciclos'));
  const vacio = Object.fromEntries(TABLAS_RESPALDO.map(t => [t, new Set<string>()])) as unknown as IdsExistentes;
  const plan = planearRestauracion({
    lotes: [loteEjemplo()], analisisSuelos: [], productos: [], planes: [], registros: [],
    ciclos: [cicloEjemplo(), cicloEjemplo({ id: 'huerfano', loteId: 'no-esta' })]
  }, vacio);
  assert.deepEqual(plan.agregar.ciclos.map(c => (c as CicloCultivo).id), ['c1']);
  assert.ok(plan.omitidos.some(o => o.tabla === 'ciclos' && o.id === 'huerfano'));
});
