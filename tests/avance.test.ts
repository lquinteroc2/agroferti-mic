/**
 * Revisión UX, tanda 4: avance de un lote y su siguiente paso (barra de pasos de la ficha y tarjetas
 * de Mis lotes). Solo dice qué falta registrar o decidir en la app; no juzga el plan. Datos de EJEMPLO.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { avanceLote, avancesPorLote, pasoActual, posicionPaso, PASOS_LOTE } from '../src/lib/avance.ts';
import { verificarAnalisis } from '../src/lib/validacion.ts';
import { copiarProducto, verificarPlan } from '../src/lib/validacionPlan.ts';
import { verificarRegistro } from '../src/lib/validacionSeguimiento.ts';
import type { EstadoPlan, PlanFertilizacion, ProductoFertilizante } from '../src/types.ts';

const HOY = new Date(2026, 10, 22, 10);
const DAP: ProductoFertilizante = {
  id: 'dap', nombre: 'DAP EJEMPLO', esEjemplo: true, presentacionKg: 50,
  contenido: [{ elemento: 'Nitrógeno', forma: 'N', porcentaje: 18 }, { elemento: 'Fósforo', forma: 'P₂O₅', porcentaje: 46 }]
};
const HISTORIAL: Record<EstadoPlan, PlanFertilizacion['historial']> = {
  propuesta: [{ estado: 'propuesta', fecha: '2026-11-01T15:00:00.000Z' }],
  revisado: [{ estado: 'propuesta', fecha: '2026-11-01T15:00:00.000Z' }, { estado: 'revisado', fecha: '2026-11-02T15:00:00.000Z', responsable: 'Revisor EJEMPLO' }],
  aprobado: [
    { estado: 'propuesta', fecha: '2026-11-01T15:00:00.000Z' },
    { estado: 'revisado', fecha: '2026-11-02T15:00:00.000Z', responsable: 'Revisor EJEMPLO' },
    { estado: 'aprobado', fecha: '2026-11-03T15:00:00.000Z', responsable: 'Productor EJEMPLO' }
  ]
};
// Meta 100 kg/ha de P₂O₅ con DAP 46 % en 500 m²: 10,869565… kg de DAP en el lote.
const plan = (id: string, estado: EstadoPlan, cambios: Partial<PlanFertilizacion> = {}) => verificarPlan({
  id, loteId: 'l1', nombre: `Plan ${id}`, areaM2AlCrear: 500,
  metas: [{ id: 'm-p', elemento: 'Fósforo', forma: 'P₂O₅', kgHa: 100, fuente: 'Fuente EJEMPLO', fechaFuente: '2026-09-15', esEjemplo: true }],
  lineas: [{ id: 'l-dap', metaId: 'm-p', producto: copiarProducto(DAP) }],
  estado, historial: HISTORIAL[estado], createdAt: '2026-11-01T15:00:00.000Z', updatedAt: '2026-11-03T15:00:00.000Z', ...cambios
});
const analisis = (cambios: Record<string, unknown> = {}) => verificarAnalisis({
  id: 'a1', loteId: 'l1', fechaAnalisis: '2026-10-01', profundidadCm: 20, densidadGcm3: 1.2, areaM2AlRegistro: 500,
  nutrientes: [{ elemento: 'Fósforo', forma: 'P', valor: 35, unidad: 'mg/kg' }], ...cambios
});
const registro = (id: string, datos: Record<string, unknown>) =>
  verificarRegistro({ id, loteId: 'l1', esEjemplo: true, createdAt: '2026-11-05T10:00:00.000Z', updatedAt: 'x', ...datos });
const aplicacion = (id: string, cantidadKg: number) =>
  registro(id, { tipo: 'aplicacion', planId: 'p', lineaId: 'l-dap', productoNombre: 'DAP EJEMPLO', fecha: '2026-11-05', cantidadKg });

const estados = (a: ReturnType<typeof avanceLote>) => a.pasos.map(p => `${p.id}:${p.estado}`).join(' ');

test('avance: un lote nuevo pide el análisis; con análisis, el plan', () => {
  const nuevo = avanceLote({ analisis: [], planes: [], registros: [] }, HOY);
  assert.equal(nuevo.siguiente.accion, 'analisis');
  assert.equal(estados(nuevo), 'lote:hecho analisis:actual plan:pendiente aplicar:pendiente cosechar:pendiente');
  const conAnalisis = avanceLote({ analisis: [analisis()], planes: [], registros: [] }, HOY);
  assert.equal(conAnalisis.siguiente.accion, 'crear-plan');
  assert.equal(estados(conAnalisis), 'lote:hecho analisis:hecho plan:actual aplicar:pendiente cosechar:pendiente');
});

test('avance: un análisis con datos por corregir pide corregirlo (no "falta el análisis")', () => {
  const danado = analisis({ profundidadCm: 'veinte' });
  assert.ok(danado.problemas.length > 0);
  const a = avanceLote({ analisis: [danado], planes: [], registros: [] }, HOY);
  assert.equal(a.siguiente.accion, 'corregir-analisis');
  assert.equal(a.pasos.find(p => p.id === 'analisis')!.estado, 'actual');
});

test('avance: propuesta → revisar; revisado → aprobar; nombra el plan', () => {
  const propuesta = avanceLote({ analisis: [analisis()], planes: [plan('p', 'propuesta')], registros: [] }, HOY);
  assert.equal(propuesta.siguiente.accion, 'revisar-plan');
  assert.match(propuesta.siguiente.texto, /«Plan p»/);
  const revisado = avanceLote({ analisis: [analisis()], planes: [plan('p', 'revisado')], registros: [] }, HOY);
  assert.equal(revisado.siguiente.accion, 'aprobar-plan');
  assert.equal(revisado.siguiente.corto, 'Plan por aprobar');
});

test('avance: con plan aprobado, aplicar (nada o parcial) y, con todo aplicado, cosechar', () => {
  const base = { analisis: [analisis()], planes: [plan('p', 'aprobado')] };
  const nada = avanceLote({ ...base, registros: [] }, HOY);
  assert.equal(nada.siguiente.accion, 'aplicar');
  assert.equal(nada.siguiente.corto, 'Registra lo que apliques');
  assert.equal(estados(nada), 'lote:hecho analisis:hecho plan:hecho aplicar:actual cosechar:pendiente');
  const parcial = avanceLote({ ...base, registros: [aplicacion('x1', 5)] }, HOY);
  assert.equal(parcial.siguiente.corto, 'Falta aplicar parte del plan');
  // 10,87 kg (lo que se ve con 2 decimales) cuenta como todo lo planeado (10,8695… kg).
  const completo = avanceLote({ ...base, registros: [aplicacion('x1', 5), aplicacion('x2', 5.87)] }, HOY);
  assert.equal(completo.siguiente.accion, 'cosechar');
  assert.equal(estados(completo), 'lote:hecho analisis:hecho plan:hecho aplicar:hecho cosechar:actual');
});

test('avance: un plan aprobado de fuente propia avanza sin análisis; planes dañados no cuentan', () => {
  const sinAnalisis = avanceLote({ analisis: [], planes: [plan('p', 'aprobado')], registros: [] }, HOY);
  assert.equal(sinAnalisis.siguiente.accion, 'aplicar');
  assert.equal(sinAnalisis.pasos.find(p => p.id === 'analisis')!.estado, 'pendiente');
  const danado = plan('p', 'aprobado', { areaM2AlCrear: 'x' as unknown as number });
  assert.ok(danado.problemas.length > 0);
  assert.equal(avanceLote({ analisis: [analisis()], planes: [danado], registros: [] }, HOY).siguiente.accion, 'crear-plan');
});

test('avance: cuenta las tareas pendientes y las de fecha pasada', () => {
  const tareas = [
    registro('t1', { tipo: 'tarea', descripcion: 'Aporque EJEMPLO', fechaPrevista: '2026-11-20', estado: 'pendiente' }),
    registro('t2', { tipo: 'tarea', descripcion: 'Riego EJEMPLO', fechaPrevista: '2026-11-25', estado: 'pendiente' }),
    registro('t3', { tipo: 'tarea', descripcion: 'Hecha EJEMPLO', fechaPrevista: '2026-11-01', estado: 'hecha', fechaRealizada: '2026-11-02' })
  ];
  assert.deepEqual(avanceLote({ analisis: [], planes: [], registros: tareas }, HOY).tareas, { pendientes: 2, vencidas: 1 });
});

test('avance por lote: agrupa las tablas completas, usa solo el cultivo actual e ignora lotes que no existen', () => {
  const crudo = (o: object) => JSON.parse(JSON.stringify(o)) as unknown;
  const ciclo = { id: 'c1', loteId: 'l1', cultivo: 'papa', fechaSiembra: '2026-03-01', fechaCierre: '2026-10-15', areaM2: 500, motivo: 'cosechado', esEjemplo: true, createdAt: '2026-10-15T10:00:00.000Z', updatedAt: '2026-10-15T10:00:00.000Z' };
  const mapa = avancesPorLote(['l1', 'l2'], {
    // El análisis es del 1 de octubre, antes del cierre: pertenece al cultivo anterior.
    analisis: [crudo({ id: 'a1', loteId: 'l1', fechaAnalisis: '2026-10-01', profundidadCm: 20, densidadGcm3: 1.2, areaM2AlRegistro: 500, nutrientes: [] })],
    planes: [],
    registros: [crudo({ id: 't1', loteId: 'l2', tipo: 'tarea', descripcion: 'Tarea EJEMPLO', fechaPrevista: '2026-11-30', estado: 'pendiente', esEjemplo: true, createdAt: 'x', updatedAt: 'x' }),
      crudo({ id: 't9', loteId: 'borrado', tipo: 'tarea', descripcion: 'Tarea EJEMPLO', fechaPrevista: '2026-11-30', estado: 'pendiente', esEjemplo: true, createdAt: 'x', updatedAt: 'x' })],
    ciclos: [crudo(ciclo)]
  }, HOY);
  assert.deepEqual([...mapa.keys()], ['l1', 'l2']);
  assert.equal(mapa.get('l1')!.siguiente.accion, 'analisis', 'el análisis del ciclo cerrado no cuenta para el cultivo actual');
  assert.deepEqual(mapa.get('l2')!.tareas, { pendientes: 1, vencidas: 0 });
});

// ---- Revisión de la tanda 4 ----

test('revisión 4: una propuesta o revisión creada después de la aprobación es el paso que sigue', () => {
  const aprobado = plan('p', 'aprobado');
  const copia = plan('copia', 'propuesta', { createdAt: '2026-11-10T10:00:00.000Z', historial: [{ estado: 'propuesta', fecha: '2026-11-10T10:00:00.000Z' }] });
  const a = avanceLote({ analisis: [analisis()], planes: [aprobado, copia], registros: [aplicacion('x1', 10.87)] }, HOY);
  assert.equal(a.siguiente.accion, 'revisar-plan');
  assert.equal(a.siguiente.corto, 'Plan nuevo por revisar');
  assert.match(a.siguiente.texto, /«Plan copia».*«Plan p»/);
  assert.equal(a.pasos.find(x => x.id === 'plan')!.estado, 'actual');
  const revisada = plan('copia', 'revisado', { createdAt: '2026-11-10T10:00:00.000Z' });
  assert.equal(avanceLote({ analisis: [analisis()], planes: [aprobado, revisada], registros: [] }, HOY).siguiente.corto, 'Plan nuevo por aprobar');
  // Una propuesta vieja (creada antes de la aprobación) no cambia el paso.
  const vieja = plan('vieja', 'propuesta', { createdAt: '2026-10-20T10:00:00.000Z', historial: [{ estado: 'propuesta', fecha: '2026-10-20T10:00:00.000Z' }] });
  assert.equal(avanceLote({ analisis: [analisis()], planes: [aprobado, vieja], registros: [] }, HOY).siguiente.accion, 'aplicar');
});

test('revisión 4: una línea que no se puede comparar no impide dar por aplicado el plan', () => {
  // Meta de K₂O cubierta con DAP (que no declara K₂O): esa línea no tiene cantidad calculada.
  const conLineaSinCalculo = plan('p', 'aprobado', {
    metas: [
      { id: 'm-p', elemento: 'Fósforo', forma: 'P₂O₅', kgHa: 100, fuente: 'Fuente EJEMPLO', fechaFuente: '2026-09-15', esEjemplo: true },
      { id: 'm-k', elemento: 'Potasio', forma: 'K₂O', kgHa: 100, fuente: 'Fuente EJEMPLO', fechaFuente: '2026-09-15', esEjemplo: true }
    ],
    lineas: [{ id: 'l-dap', metaId: 'm-p', producto: copiarProducto(DAP) }, { id: 'l-k', metaId: 'm-k', producto: copiarProducto(DAP) }]
  });
  assert.equal(conLineaSinCalculo.problemas.length, 0);
  const a = avanceLote({ analisis: [analisis()], planes: [conLineaSinCalculo], registros: [aplicacion('x1', 10.87)] }, HOY);
  assert.equal(a.siguiente.accion, 'cosechar');
});

test('revisión 4: las tareas de la tarjeta del lote incluyen las pendientes de antes del último cierre', () => {
  const crudo = (o: object) => JSON.parse(JSON.stringify(o)) as unknown;
  const ciclo = { id: 'c1', loteId: 'l1', cultivo: 'papa', fechaSiembra: '2026-03-01', fechaCierre: '2026-10-15', areaM2: 500, motivo: 'cosechado', esEjemplo: true, createdAt: '2026-10-15T10:00:00.000Z', updatedAt: '2026-10-15T10:00:00.000Z' };
  const tareaVieja = { id: 't1', loteId: 'l1', tipo: 'tarea', descripcion: 'Tarea EJEMPLO', fechaPrevista: '2026-10-01', estado: 'pendiente', esEjemplo: true, createdAt: 'x', updatedAt: 'x' };
  const mapa = avancesPorLote(['l1'], { analisis: [], planes: [], registros: [crudo(tareaVieja)], ciclos: [crudo(ciclo)] }, HOY);
  assert.deepEqual(mapa.get('l1')!.tareas, { pendientes: 1, vencidas: 1 });
});

test('ficha por pasos (28 nov 2026): el paso que toca ("Ahora") y la numeración de los cinco pasos', () => {
  assert.equal(pasoActual(avanceLote({ analisis: [], planes: [], registros: [] }, HOY)), 'analisis', 'lote nuevo: paso 2');
  assert.equal(pasoActual(avanceLote({ analisis: [analisis()], planes: [], registros: [] }, HOY)), 'plan');
  assert.equal(pasoActual(avanceLote({ analisis: [analisis()], planes: [plan('p1', 'propuesta')], registros: [] }, HOY)), 'plan', 'plan por revisar: sigue en el plan');
  assert.equal(pasoActual(avanceLote({ analisis: [analisis()], planes: [plan('p1', 'aprobado')], registros: [] }, HOY)), 'aplicar');
  const conTodo = avanceLote({ analisis: [analisis()], planes: [plan('p', 'aprobado')], registros: [aplicacion('x1', 10.87)] }, HOY);
  assert.equal(pasoActual(conTodo), 'cosechar');
  // El paso que se abre es el que la barra marca como actual.
  assert.equal(conTodo.pasos.find(p => p.estado === 'actual')?.id, pasoActual(conTodo));
  assert.deepEqual(PASOS_LOTE, ['lote', 'analisis', 'plan', 'aplicar', 'cosechar']);
  assert.deepEqual(posicionPaso('lote'), { numero: 1, total: 5, anterior: undefined, siguiente: 'analisis' });
  assert.deepEqual(posicionPaso('plan'), { numero: 3, total: 5, anterior: 'analisis', siguiente: 'aplicar' });
  assert.deepEqual(posicionPaso('cosechar'), { numero: 5, total: 5, anterior: 'aplicar', siguiente: undefined });
});

test('ficha por pasos: la vista general resume lo registrado en cada paso, con el costo del plan', () => {
  const nuevo = avanceLote({ analisis: [], planes: [], registros: [] }, HOY);
  assert.equal(nuevo.resumen.analisis, 'Aún no hay análisis de suelo');
  assert.equal(nuevo.resumen.plan, 'Aún no hay plan de fertilización');
  assert.equal(nuevo.resumen.aplicar, 'Aún no hay aplicaciones registradas');
  assert.match(nuevo.resumen.cosechar, /cierra el ciclo/);
  assert.equal(avanceLote({ analisis: [analisis({ profundidadCm: 'veinte' })], planes: [], registros: [] }, HOY).resumen.analisis, 'El análisis guardado tiene datos por corregir');

  const conPlan = avanceLote({ analisis: [analisis()], planes: [plan('p', 'propuesta')], registros: [] }, HOY);
  assert.match(conPlan.resumen.analisis, /^Análisis del 1 de oct\.? de 2026 · 1 resultado$|^Análisis del 01 de oct\.? de 2026 · 1 resultado$/);
  assert.match(conPlan.resumen.plan, /^«Plan p» en propuesta, falta revisarlo · /);
  // El DAP de EJEMPLO no tiene precio: el resumen no inventa un costo.
  assert.match(conPlan.resumen.plan, /sin costo total$/);

  const aplicado = avanceLote({ analisis: [analisis()], planes: [plan('p', 'aprobado')], registros: [aplicacion('x1', 5)] }, HOY);
  assert.match(aplicado.resumen.plan, /^«Plan p» aprobado · /);
  assert.equal(aplicado.resumen.aplicar, '1 aplicación del plan aprobado');
});

test('ficha por pasos: el resumen del plan muestra el costo estimado cuando el producto tiene precio', () => {
  const conPrecio = plan('p', 'aprobado', { lineas: [{ id: 'l-dap', metaId: 'm-p', producto: copiarProducto({ ...DAP, precioPresentacionCop: 150000, fechaPrecio: '2026-10-15', fuentePrecio: 'Precio EJEMPLO' }) }] });
  const a = avanceLote({ analisis: [analisis()], planes: [conPrecio], registros: [] }, HOY);
  assert.match(a.resumen.plan, /^«Plan p» aprobado · costo estimado ≈\s\$\s32\.609$/);
});

test('ficha por pasos: tareas y cultivos anteriores en el resumen de Mis lotes', () => {
  const crudo = (o: object) => JSON.parse(JSON.stringify(o)) as unknown;
  const ciclo = { id: 'c1', loteId: 'l1', cultivo: 'papa', fechaSiembra: '2026-03-01', fechaCierre: '2026-10-15', areaM2: 500, motivo: 'cosechado', esEjemplo: true, createdAt: '2026-10-15T10:00:00.000Z', updatedAt: '2026-10-15T10:00:00.000Z' };
  const tarea = { id: 't1', loteId: 'l1', tipo: 'tarea', descripcion: 'Tarea EJEMPLO', fechaPrevista: '2026-11-01', estado: 'pendiente', esEjemplo: true, createdAt: '2026-10-20T10:00:00.000Z', updatedAt: 'x' };
  const a = avancesPorLote(['l1'], { analisis: [], planes: [], registros: [crudo(tarea)], ciclos: [crudo(ciclo)] }, HOY).get('l1')!;
  assert.equal(a.resumen.aplicar, 'Aún no hay aplicaciones registradas · 1 tarea pendiente (1 con la fecha pasada)');
  assert.match(a.resumen.cosechar, /^1 cultivo anterior en el historial/);
});

test('revisión de la ficha por pasos: un paso sin hacer antes del que toca no dice "Más adelante"', () => {
  // Plan de fuente propia sin análisis (permitido): el análisis quedó sin hacer, no viene después.
  const sinAnalisis = avanceLote({ analisis: [], planes: [plan('p', 'propuesta')], registros: [] }, HOY);
  assert.equal(sinAnalisis.etiquetas.analisis, 'Sin hacer');
  assert.equal(sinAnalisis.etiquetas.plan, 'Ahora');
  assert.equal(sinAnalisis.etiquetas.aplicar, 'Más adelante');
  // Análisis dañado con un plan en curso: dice que hay que corregirlo.
  const danado = avanceLote({ analisis: [analisis({ profundidadCm: 'veinte' })], planes: [plan('p', 'propuesta')], registros: [] }, HOY);
  assert.equal(danado.etiquetas.analisis, 'Por corregir');
  // Plan aprobado a medio aplicar y una copia nueva por revisar: aplicar sigue en curso.
  const copia = plan('p2', 'propuesta', { createdAt: '2026-11-10T15:00:00.000Z' });
  const conCopia = avanceLote({ analisis: [analisis()], planes: [plan('p', 'aprobado'), copia], registros: [aplicacion('x1', 5)] }, HOY);
  assert.equal(conCopia.etiquetas.plan, 'Ahora');
  assert.equal(conCopia.etiquetas.aplicar, 'En curso');
  assert.equal(conCopia.etiquetas.lote, 'Listo');
  assert.equal(conCopia.etiquetas.cosechar, 'Más adelante');
});

test('revisión de la ficha por pasos: cuenta solo las aplicaciones del plan aprobado y avisa de análisis por corregir', () => {
  const otroPlan = registro('x9', { tipo: 'aplicacion', planId: 'viejo', lineaId: 'l-dap', productoNombre: 'DAP EJEMPLO', fecha: '2026-11-05', cantidadKg: 3 });
  const a = avanceLote({ analisis: [analisis()], planes: [plan('p', 'aprobado')], registros: [otroPlan] }, HOY);
  assert.equal(a.resumen.aplicar, 'Aún no hay aplicaciones del plan aprobado');
  const conDanado = avanceLote({ analisis: [analisis(), analisis({ id: 'a2', fechaAnalisis: '2026-10-20', profundidadCm: 'veinte' })], planes: [], registros: [] }, HOY);
  assert.match(conDanado.resumen.analisis, / · 1 con datos por corregir$/);
});
