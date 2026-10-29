/**
 * Copia de seguridad: exportar tal cual y restaurar sin borrar ni sobrescribir.
 * Almacén en memoria con transacciones con reversión, como en las demás pruebas de persistencia.
 * Todos los datos son de EJEMPLO.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMATO_RESPALDO,
  TABLAS_RESPALDO,
  contar,
  crearRepositorioRespaldo,
  leerRespaldo,
  nombreArchivoRespaldo,
  planearRestauracion,
  resumenCantidades,
  serializarRespaldo,
  type AlmacenRespaldo,
  type IdsExistentes,
  type TablasRespaldo
} from '../src/lib/respaldo.ts';

const HOY = new Date(2026, 9, 29, 10);

const lote = (id: string, cambios: Record<string, unknown> = {}) => ({
  id, nombre: `Lote ${id} EJEMPLO`, cultivo: 'papa', areaM2: 500,
  createdAt: '2026-10-27T10:00:00.000Z', updatedAt: '2026-10-27T10:00:00.000Z', ...cambios
});
const analisis = (id: string, loteId: string) => ({
  id, loteId, fechaAnalisis: '2026-10-01', profundidadCm: 20, nutrientes: [], version: 9
});
const producto = (id: string) => ({ id, nombre: `Producto ${id} EJEMPLO`, contenido: [{ elemento: 'Potasio', forma: 'K₂O', porcentaje: 60 }], esEjemplo: true });
const plan = (id: string, loteId: string) => ({ id, loteId, nombre: 'Plan EJEMPLO', estado: 'propuesta', metas: [], lineas: [], historial: [] });

const tablas = (cambios: Partial<TablasRespaldo> = {}): TablasRespaldo => ({
  lotes: [lote('l1')], analisisSuelos: [analisis('a1', 'l1')], productos: [producto('p1')], planes: [plan('pl1', 'l1')], registros: [], ...cambios
});
const sinIds = (): IdsExistentes => ({ lotes: new Set(), analisisSuelos: new Set(), productos: new Set(), planes: new Set(), registros: new Set() });

function crearAlmacen(inicial: TablasRespaldo = { lotes: [], analisisSuelos: [], productos: [], planes: [], registros: [] }) {
  let datos = structuredClone(inicial);
  let fallarAlAgregar = false;
  const almacen: AlmacenRespaldo = {
    esquema: () => 2,
    leerTodo: async () => structuredClone(datos),
    idsExistentes: async () => Object.fromEntries(TABLAS_RESPALDO.map(t =>
      [t, new Set(datos[t].map(r => (r as { id: string }).id))])) as unknown as IdsExistentes,
    agregar: async nuevos => {
      for (const t of TABLAS_RESPALDO) {
        datos[t].push(...structuredClone(nuevos[t]));
        // Simula un error a mitad de la escritura (p. ej. almacenamiento lleno).
        if (fallarAlAgregar && t === 'productos') throw new Error('Almacenamiento lleno');
      }
    },
    transaccion: async fn => {
      const respaldo = structuredClone(datos);
      try {
        return await fn();
      } catch (error) {
        datos = respaldo;
        throw error;
      }
    }
  };
  return { repo: crearRepositorioRespaldo(almacen), datos: () => datos, fallar: () => { fallarAlAgregar = true; } };
}

test('exportar: copia con formato, versión, fecha y los registros tal como están guardados', async () => {
  const conDanos = tablas({ analisisSuelos: [analisis('a1', 'l1'), { id: 'a2', loteId: 'l1', densidadGcm3: 'texto' }] });
  const { repo } = crearAlmacen(conDanos);
  const r = await repo.exportar(HOY);
  assert.equal(r.formato, FORMATO_RESPALDO);
  assert.equal(r.version, 1);
  assert.equal(r.esquema, 2);
  assert.equal(r.creado, HOY.toISOString());
  assert.deepEqual(r.datos, conDanos, 'incluye datos dañados y campos de otras versiones sin cambiarlos');
  assert.equal(nombreArchivoRespaldo(HOY), 'agroferti-respaldo-2026-10-29.json');
});

test('leer: rechaza archivos que no son una copia válida, sin lanzar', () => {
  const valido = { formato: FORMATO_RESPALDO, version: 1, datos: tablas() };
  const casos: Array<[string, string, RegExp]> = [
    ['no JSON', '{roto', /no se pudo leer como JSON/],
    ['otro formato', JSON.stringify({ ...valido, formato: 'otra-app' }), /no es una copia de seguridad de AgroFerti/],
    ['versión futura', JSON.stringify({ ...valido, version: 2 }), /versión de formato \(2\)/],
    ['sin datos', JSON.stringify({ ...valido, datos: null }), /no contiene datos/],
    ['lista inválida', JSON.stringify({ ...valido, datos: { ...tablas(), lotes: {} } }), /lista de lotes/],
    ['un número', '7', /no es una copia/]
  ];
  for (const [nombre, texto, error] of casos) {
    const r = leerRespaldo(texto);
    assert.ok(!r.ok, nombre);
    if (!r.ok) assert.match(r.error, error, nombre);
  }
});

test('leer: listas ausentes cuentan como vacías y las desconocidas se avisan', () => {
  const r = leerRespaldo(JSON.stringify({ formato: FORMATO_RESPALDO, version: 1, creado: 'x', datos: { lotes: [lote('l1')], cosechas: [] } }));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(contar(r.respaldo.datos), { lotes: 1, analisisSuelos: 0, productos: 0, planes: 0, registros: 0 });
  assert.match(r.avisos.join(' '), /no conoce y no se restaurarán \(cosechas\)/);
});

test('planear: agrega lo nuevo y deja como están los registros que ya existen', () => {
  const ids = { ...sinIds(), lotes: new Set(['l1']), productos: new Set(['p1']) };
  const plan = planearRestauracion(tablas({ lotes: [lote('l1'), lote('l2')], analisisSuelos: [analisis('a1', 'l1'), analisis('a2', 'l2')] }), ids);
  assert.deepEqual(plan.agregar.lotes.map(r => (r as { id: string }).id), ['l2']);
  assert.deepEqual(plan.agregar.analisisSuelos.map(r => (r as { id: string }).id), ['a1', 'a2'], 'a1 se agrega al lote que ya existía');
  assert.deepEqual(plan.agregar.productos, []);
  assert.equal(plan.existentes.lotes, 1);
  assert.equal(plan.existentes.productos, 1);
  assert.deepEqual(plan.omitidos, []);
});

test('planear: omite lotes que romperían la lista, registros sin lote, sin id o repetidos', () => {
  const datos = tablas({
    lotes: [lote('ok'), lote('sin-nombre', { nombre: ' ' }), lote('cultivo', { cultivo: 'maíz' }), lote('area', { areaM2: '500' }),
      lote('fechas', { createdAt: undefined }), lote('ubicacion', { ubicacion: 5 }), null, { nombre: 'sin id' }, lote('ok', { nombre: 'repetido' })],
    analisisSuelos: [analisis('a1', 'ok'), analisis('a2', 'cultivo'), analisis('a3', 'no-existe'), { id: 'a4' }],
    planes: [plan('pl1', 'area')],
    productos: [producto('p1'), producto('p1'), 'texto']
  });
  const plan_ = planearRestauracion(datos, sinIds());
  assert.deepEqual(plan_.agregar.lotes.map(r => (r as { id: string }).id), ['ok']);
  assert.equal((plan_.agregar.lotes[0] as { nombre: string }).nombre, 'Lote ok EJEMPLO', 'se usa la primera aparición');
  assert.deepEqual(plan_.agregar.analisisSuelos.map(r => (r as { id: string }).id), ['a1']);
  assert.deepEqual(plan_.agregar.planes, []);
  assert.deepEqual(plan_.agregar.productos.map(r => (r as { id: string }).id), ['p1']);
  const motivos = plan_.omitidos.map(o => `${o.tabla}:${o.id ?? '-'}:${o.motivo}`).join('\n');
  for (const esperado of [/lotes:sin-nombre:.*no tiene nombre/, /lotes:cultivo:.*cultivo/, /lotes:area:.*área/, /lotes:fechas:.*fechas de control/,
    /lotes:ubicacion:.*ubicación/, /lotes:-:.*identificador/, /lotes:ok:.*repetido/,
    /analisisSuelos:a2:.*Su lote se omitió: El cultivo del lote no es válido/, /planes:pl1:.*Su lote se omitió: El área del lote no es válida/,
    /analisisSuelos:a3:.*Su lote no está/, /analisisSuelos:a4:.*Su lote no está/, /productos:p1:.*repetido/, /productos:-:.*identificador/]) {
    assert.match(motivos, esperado);
  }
});

test('restaurar en un dispositivo vacío reproduce la copia; repetirla no duplica nada', async () => {
  const origen = crearAlmacen(tablas());
  const copia = leerRespaldo(serializarRespaldo(await origen.repo.exportar(HOY)));
  assert.ok(copia.ok);
  if (!copia.ok) return;
  const destino = crearAlmacen();
  const previa = await destino.repo.previsualizar(copia.respaldo.datos);
  assert.deepEqual(destino.datos(), { lotes: [], analisisSuelos: [], productos: [], planes: [], registros: [] }, 'previsualizar no escribe');
  assert.equal(resumenCantidades(contar(previa.agregar)), '1 lote, 1 análisis de suelo, 1 producto, 1 plan');
  await destino.repo.restaurar(copia.respaldo.datos);
  assert.deepEqual(destino.datos(), tablas());
  const segunda = await destino.repo.restaurar(copia.respaldo.datos);
  assert.equal(resumenCantidades(contar(segunda.agregar)), 'ningún registro');
  assert.equal(resumenCantidades(segunda.existentes), '1 lote, 1 análisis de suelo, 1 producto, 1 plan');
  assert.deepEqual(destino.datos(), tablas(), 'sin duplicados');
});

test('restaurar nunca borra ni sobrescribe, y un error a mitad no deja cambios', async () => {
  const propio = { ...lote('l1'), nombre: 'Mi lote real' };
  const destino = crearAlmacen({ lotes: [propio], analisisSuelos: [], productos: [], planes: [], registros: [] });
  await destino.repo.restaurar(tablas({ lotes: [lote('l1'), lote('l2')] }));
  assert.equal((destino.datos().lotes[0] as { nombre: string }).nombre, 'Mi lote real', 'el registro propio no cambia');
  assert.equal(destino.datos().lotes.length, 2);

  const conFallo = crearAlmacen();
  conFallo.fallar();
  await assert.rejects(conFallo.repo.restaurar(tablas()), /Almacenamiento lleno/);
  assert.deepEqual(conFallo.datos(), { lotes: [], analisisSuelos: [], productos: [], planes: [], registros: [] }, 'o entra todo o no entra nada');
});

// ---- Revisión de la copia de seguridad ----

test('revisión: la copia conserva NaN, ±Infinity y fechas en lugar de convertirlos en null', () => {
  const danado = { id: 'a1', loteId: 'l1', ph: Number.NaN, densidadGcm3: Number.POSITIVE_INFINITY, profundidadCm: Number.NEGATIVE_INFINITY, marca: new Date('2026-10-01T00:00:00.000Z') };
  const r = leerRespaldo(serializarRespaldo({ formato: FORMATO_RESPALDO, version: 1, app: 'AgroFerti MIC', esquema: 2, creado: HOY.toISOString(), datos: tablas({ analisisSuelos: [danado] }) }));
  assert.ok(r.ok);
  if (!r.ok) return;
  const leido = r.respaldo.datos.analisisSuelos[0] as typeof danado;
  assert.ok(Number.isNaN(leido.ph));
  assert.equal(leido.densidadGcm3, Number.POSITIVE_INFINITY);
  assert.equal(leido.profundidadCm, Number.NEGATIVE_INFINITY);
  assert.ok(leido.marca instanceof Date && leido.marca.toISOString() === '2026-10-01T00:00:00.000Z');
});

test('revisión: si la primera aparición de un id es inválida, se usa la siguiente válida', () => {
  const plan = planearRestauracion(tablas({ lotes: [lote('A', { nombre: '' }), lote('A', { nombre: 'Lote bueno EJEMPLO' })], analisisSuelos: [analisis('a1', 'A')] }), sinIds());
  assert.deepEqual(plan.agregar.lotes.map(r => (r as { nombre: string }).nombre), ['Lote bueno EJEMPLO']);
  assert.deepEqual(plan.agregar.analisisSuelos.map(r => (r as { id: string }).id), ['a1']);
  assert.ok(!plan.omitidos.some(o => /repetido/.test(o.motivo)), 'la primera no se usó: no es "repetido"');
});

test('revisión: lotes con fecha de siembra o fechas de control inválidas se omiten; el seguimiento se restaura con su lote', () => {
  const plan = planearRestauracion(tablas({
    lotes: [lote('f1', { fechaSiembra: '2026-13-45' }), lote('f2', { createdAt: 'ayer' }), lote('f3', { fechaSiembra: '2026-10-01' })],
    registros: [{ id: 'r1', loteId: 'f3', tipo: 'observacion' }, { id: 'r2', loteId: 'f1', tipo: 'observacion' }]
  }), sinIds());
  const motivos = plan.omitidos.map(o => `${o.tabla}:${o.id}:${o.motivo}`).join('\n');
  assert.match(motivos, /lotes:f1:.*fecha de siembra/);
  assert.match(motivos, /lotes:f2:.*fechas de control/);
  assert.match(motivos, /registros:r2:.*Su lote se omitió: La fecha de siembra/);
  assert.deepEqual(plan.agregar.lotes.map(r => (r as { id: string }).id), ['f3']);
  assert.deepEqual(plan.agregar.registros.map(r => (r as { id: string }).id), ['r1'], 'la fase 4 verifica los registros al leerlos');
});
