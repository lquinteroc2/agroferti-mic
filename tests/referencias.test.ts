/**
 * Referencias técnicas: verificación de lo que llega de la nube, llenado del formulario de producto
 * y validez de los archivos de data/referencias/ (los que se cargan en D1). Datos de prueba: EJEMPLO.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { finDeMes, leerConjunto, leerFertilizante, leerNivelSuelo, leerReglaDosis, nombreMes, productoDesdeReferencia } from '../src/lib/referencias.ts';

const fertilizante = (cambios: Record<string, unknown> = {}) => ({
  id: 'dap-ejemplo', nombre: 'DAP EJEMPLO', empresa: 'Empresa EJEMPLO', registroIca: 'ICA 0000', estadoRegistro: 'VIGENTE',
  composicionTexto: 'NITRÓGENO TOTAL (N) 18 %, FÓSFORO ASIMILABLE (P₂O₅) 46 %',
  contenido: [{ elemento: 'Nitrógeno', forma: 'N', porcentaje: 18 }, { elemento: 'Fósforo', forma: 'P₂O₅', porcentaje: 46 }],
  presentacionKg: 50,
  precios: [{ departamento: 'Cundinamarca', precioPromedioCop: 150000, presentacion: 'Bulto x 50 kg', periodo: '2026-10' }],
  verificacion: 'ok', fuente: 'Fuente EJEMPLO', ...cambios
});
const fuente = { titulo: 'Fuente EJEMPLO', url: 'https://ejemplo.org/doc.pdf', tipo: 'oficial-colombia', anio: 2005, paginaImpresa: '34', tabla: 'Tabla 2' };
const regla = (cambios: Record<string, unknown> = {}) => ({
  id: 'papa-ejemplo', cultivo: 'papa', region: 'Región EJEMPLO',
  condicion: { nutriente: 'P', metodo: 'Bray II', unidad: 'mg/kg', min: null, max: 40 },
  recomendacion: [{ forma: 'P₂O₅', minKgHa: 300, maxKgHa: 350 }],
  notas: '', fuente, transcripcion: 'fila EJEMPLO', verificacion: 'ok', ...cambios
});

test('fertilizante de referencia: se aceptan datos completos y se descartan los incompletos o fuera de rango', () => {
  const f = leerFertilizante(fertilizante());
  assert.ok(f);
  assert.equal(f.contenido.length, 2);
  assert.equal(leerFertilizante(fertilizante({ registroIca: undefined })), null, 'sin registro ICA');
  assert.equal(leerFertilizante(fertilizante({ contenido: [] })), null, 'sin contenido');
  assert.equal(leerFertilizante(fertilizante({ contenido: [{ elemento: 'Nitrógeno', forma: 'N', porcentaje: 146 }] })), null, 'porcentaje imposible');
  const sinPrecioValido = leerFertilizante(fertilizante({ precios: [{ departamento: 'X', precioPromedioCop: -1, presentacion: 'b', periodo: '2026-10' }, { departamento: 'Y', precioPromedioCop: 10, presentacion: 'b', periodo: 'octubre' }] }));
  assert.deepEqual(sinPrecioValido?.precios, [], 'los precios inválidos se omiten');
  assert.equal(leerFertilizante(null), null);
});

test('regla de dosis y nivel de suelo: exigen fuente con URL y rangos coherentes', () => {
  assert.ok(leerReglaDosis(regla()));
  assert.equal(leerReglaDosis(regla({ fuente: { titulo: 'x', tipo: 'oficial-colombia' } })), null, 'fuente sin URL');
  assert.equal(leerReglaDosis(regla({ recomendacion: [{ forma: 'N', minKgHa: 200, maxKgHa: 100 }] })), null, 'mínimo mayor que el máximo');
  assert.equal(leerReglaDosis(regla({ recomendacion: [] })), null);
  const nivel = { id: 'n', cultivo: 'papa', nutriente: 'P', metodo: 'Bray II', unidad: 'mg/kg', rangos: [{ nivel: 'bajo', min: null, max: 40 }], fuente, transcripcion: 't', verificacion: 'ok' };
  assert.ok(leerNivelSuelo(nivel));
  assert.equal(leerNivelSuelo({ ...nivel, rangos: [] }), null);
  const conjunto = leerConjunto({ version: 'v1', fertilizantes: [fertilizante(), { roto: true }], reglasDosis: [regla()], niveles: [nivel] });
  assert.deepEqual([conjunto?.fertilizantes.length, conjunto?.reglasDosis.length, conjunto?.niveles.length], [1, 1, 1], 'lo inválido se descarta');
  assert.equal(leerConjunto({ fertilizantes: [] }), null, 'sin versión');
});

test('llenar el formulario de producto: composición, registro ICA y precio del departamento con su fuente', () => {
  const f = leerFertilizante(fertilizante())!;
  const d = productoDesdeReferencia(f, 'Cundinamarca');
  assert.equal(d.precioPresentacionCop, 150000);
  assert.equal(d.fechaPrecio, '2026-10-31');
  assert.equal(d.fuentePrecio, 'Precio promedio DANE-SIPSA, Cundinamarca, octubre de 2026');
  assert.equal(d.registroIca, 'ICA 0000');
  const sinPrecio = productoDesdeReferencia(f);
  assert.equal(sinPrecio.precioPresentacionCop, undefined);
  assert.equal(sinPrecio.fuentePrecio, undefined);
  assert.equal(finDeMes('2028-02'), '2028-02-29');
  assert.equal(nombreMes('2026-10'), 'octubre de 2026');
});

test('los archivos de data/referencias/ son válidos: cada referencia pasa la verificación y los ids no se repiten', () => {
  const leer = (a: string) => JSON.parse(readFileSync(new URL(`../data/referencias/${a}`, import.meta.url), 'utf8')) as unknown[];
  for (const [archivo, verificar] of [['fertilizantes.json', leerFertilizante], ['fertilizantes-ica.json', leerFertilizante], ['dosis.json', leerReglaDosis], ['niveles.json', leerNivelSuelo]] as const) {
    const datos = leer(archivo);
    const ids = new Set<string>();
    datos.forEach((item, i) => {
      const v = (verificar as (x: unknown) => { id: string } | null)(item);
      assert.ok(v, `${archivo}, posición ${i}: no es válida`);
      assert.ok(!ids.has(v.id), `${archivo}: id repetido ${v.id}`);
      ids.add(v.id);
    });
  }
});

// ---- Sugerencias de metas ----
import { citaDeSugerencia, sugerirMetas } from '../src/lib/sugerencias.ts';
import { verificarAnalisis } from '../src/lib/validacion.ts';

const reglas = [
  regla({ id: 'p-bajo', condicion: { nutriente: 'P', metodo: 'Bray II', unidad: 'mg/kg', min: null, max: 40 }, recomendacion: [{ forma: 'P₂O₅', minKgHa: 300, maxKgHa: 375 }] }),
  regla({ id: 'p-medio', condicion: { nutriente: 'P', metodo: 'Bray II', unidad: 'mg/kg', min: 40, max: 60 }, recomendacion: [{ forma: 'P₂O₅', minKgHa: 250, maxKgHa: 300 }] }),
  regla({ id: 'k-bajo', condicion: { nutriente: 'K', metodo: 'Acetato de amonio', unidad: 'cmol(+)/kg', min: null, max: 0.3 }, recomendacion: [{ forma: 'K₂O', minKgHa: 125, maxKgHa: 150 }] }),
  regla({ id: 'n', condicion: { nutriente: null, metodo: null, unidad: null, min: null, max: null }, recomendacion: [{ forma: 'N', minKgHa: 120, maxKgHa: 160 }] }),
  regla({ id: 'otra-region', region: 'Otra región EJEMPLO', condicion: { nutriente: null, metodo: null, unidad: null, min: null, max: null }, recomendacion: [{ forma: 'N', minKgHa: 150, maxKgHa: 170 }] }),
  regla({ id: 'arveja', cultivo: 'arveja' })
].map(r => leerReglaDosis(r)!);
const analisisEjemplo = (cambios: Record<string, unknown> = {}) => verificarAnalisis({
  id: 'a1', loteId: 'l1', fechaAnalisis: '2026-08-20', profundidadCm: 20, metodoLaboratorio: 'Bray II, acetato de amonio',
  nutrientes: [{ elemento: 'Fósforo', forma: 'P', valor: 35, unidad: 'mg/kg' }, { elemento: 'Potasio', forma: 'K', valor: 0.25, unidad: 'cmol(+)/kg' }], ...cambios
});

test('sugerencias: el nivel del análisis elige la fila de la tabla; el nitrógeno sale por región', () => {
  const r = sugerirMetas({ cultivo: 'papa', region: 'Región EJEMPLO', analisis: analisisEjemplo(), reglas });
  assert.deepEqual(r.sugerencias.map(s => [s.regla.id, s.forma, s.minKgHa, s.maxKgHa]).sort(), [['k-bajo', 'K₂O', 125, 150], ['n', 'N', 120, 160], ['p-bajo', 'P₂O₅', 300, 375]]);
  assert.match(r.sugerencias.find(s => s.forma === 'P₂O₅')!.motivo, /P \(Bray II\) = 35 mg\/kg, menos de 40/);
  assert.deepEqual(r.regiones.sort(), ['Otra región EJEMPLO', 'Región EJEMPLO']);
  // El límite de 40 pertenece a la fila siguiente (los rangos de la tabla no se solapan).
  const en40 = sugerirMetas({ cultivo: 'papa', region: 'Región EJEMPLO', analisis: analisisEjemplo({ nutrientes: [{ elemento: 'Fósforo', forma: 'P', valor: 40, unidad: 'mg/kg' }] }), reglas });
  assert.deepEqual(en40.sugerencias.filter(s => s.forma === 'P₂O₅').map(s => s.regla.id), ['p-medio']);
});

test('sugerencias: no se sugiere si el método, la unidad o la forma no coinciden, y se explica por qué', () => {
  const otroMetodo = sugerirMetas({ cultivo: 'papa', region: 'Región EJEMPLO', analisis: analisisEjemplo({ metodoLaboratorio: 'Olsen' }), reglas });
  assert.ok(!otroMetodo.sugerencias.some(s => s.forma === 'P₂O₅'));
  assert.ok(otroMetodo.noAplican.some(n => /método Bray II/.test(n.motivo)));
  const p2o5 = sugerirMetas({ cultivo: 'papa', region: 'Región EJEMPLO', analisis: analisisEjemplo({ nutrientes: [{ elemento: 'Fósforo', forma: 'P₂O₅', valor: 35, unidad: 'mg/kg' }] }), reglas });
  assert.ok(!p2o5.sugerencias.some(s => s.forma === 'P₂O₅'), 'P₂O₅ del análisis no se toma como P');
  const kMgKg = sugerirMetas({ cultivo: 'papa', region: 'Región EJEMPLO', analisis: analisisEjemplo({ nutrientes: [{ elemento: 'Potasio', forma: 'K', valor: 120, unidad: 'mg/kg' }] }), reglas });
  assert.ok(kMgKg.noAplican.some(n => /no convierte/.test(n.motivo)));
  const sinRegion = sugerirMetas({ cultivo: 'papa', analisis: analisisEjemplo(), reglas });
  assert.ok(sinRegion.noAplican.some(n => /Elige la región/.test(n.motivo)));
  assert.deepEqual(sugerirMetas({ cultivo: 'kale', reglas }).sugerencias, [], 'sin referencias para el cultivo, no se sugiere nada');
});

test('sugerencias: la cita incluye autor, año, tabla, página y el rango', () => {
  const r = sugerirMetas({ cultivo: 'papa', region: 'Región EJEMPLO', analisis: analisisEjemplo(), reglas });
  assert.match(citaDeSugerencia(r.sugerencias[0]), /Fuente EJEMPLO \(2005\), Tabla 2, p\. 34 · rango sugerido \d+-\d+ kg\/ha/);
});

test('datos cargados: papa en el Altiplano con un análisis de EJEMPLO (Bray II) da los rangos de la Tabla 2 de Castro (2005)', () => {
  const datos = JSON.parse(readFileSync(new URL('../data/referencias/dosis.json', import.meta.url), 'utf8')) as unknown[];
  const cargadas = datos.map(leerReglaDosis).filter(r => r !== null);
  const analisis = analisisEjemplo({
    metodoLaboratorio: 'Bray II (fósforo), acetato de amonio 1 N (potasio)',
    nutrientes: [{ elemento: 'Fósforo', forma: 'P', valor: 35, unidad: 'mg/kg' }, { elemento: 'Potasio', forma: 'K', valor: 0.45, unidad: 'cmol(+)/kg' }]
  });
  const r = sugerirMetas({ cultivo: 'papa', region: 'Altiplano Cundiboyacense, Nariño y Antioquia', analisis, reglas: cargadas });
  const rango = (forma: string) => r.sugerencias.filter(s => s.forma === forma).map(s => `${s.minKgHa}-${s.maxKgHa}`);
  assert.deepEqual([rango('P₂O₅'), rango('K₂O'), rango('N')], [['300-375'], ['100-125'], ['120-160']]);
  // La app trabaja solo con papa (decisión del 19 de noviembre de 2026).
  assert.ok(cargadas.every(r => r.cultivo === 'papa'));
});

import { buscarFertilizantes, fertilizantesQueAportan } from '../src/lib/referencias.ts';

test('catálogo: buscar por nombre o grado y elegir los que aportan una forma química', () => {
  const lista = [
    fertilizante(),
    leerFertilizante(fertilizante({ id: 'dap', nombre: 'Fosfato Diamónico DAP 18-46-0', registroIca: '9', contenido: [{ elemento: 'Nitrógeno', forma: 'N', porcentaje: 18 }, { elemento: 'Fósforo', forma: 'P₂O₅', porcentaje: 46 }], precios: [] })),
    leerFertilizante(fertilizante({ id: 'tsp', nombre: 'Superfosfato triple', registroIca: '10', contenido: [{ elemento: 'Fósforo', forma: 'P₂O₅', porcentaje: 46 }], precios: [], verificacion: 'por verificar: ejemplo' }))
  ].map(f => leerFertilizante(f)!);
  assert.deepEqual(buscarFertilizantes(lista, 'diamonico 18-46').map(f => f.id), ['dap'], 'sin tildes y por grado');
  assert.deepEqual(buscarFertilizantes(lista, '   '), []);
  const p = fertilizantesQueAportan(lista, 'P₂O₅');
  assert.deepEqual(p.map(f => f.id), ['dap-ejemplo', 'dap', 'tsp'], 'primero el que tiene precio; a igual concentración, el verificado');
  assert.deepEqual(fertilizantesQueAportan(lista, 'Mo'), []);
});

import { departamentoDeUbicacion } from '../src/lib/referencias.ts';

test('catálogo: el precio del departamento se toma de la ubicación del lote', () => {
  const f = leerFertilizante(fertilizante())!;
  assert.equal(departamentoDeUbicacion(f, 'Vereda El Rosal, Zipaquirá, CUNDINAMARCA'), 'Cundinamarca');
  assert.equal(departamentoDeUbicacion(f, 'Tunja, Boyacá'), undefined);
  assert.equal(departamentoDeUbicacion(f, undefined), undefined);
});

import { filtrarCatalogo } from '../src/lib/referencias.ts';

test('catálogo para explorar: filtra por texto, por nutrientes que aporta y por precio', () => {
  const lista = [
    fertilizante(),
    fertilizante({ id: 'kcl', nombre: 'Cloruro de potasio 0-0-60', registroIca: '11', composicionTexto: 'POTASIO SOLUBLE EN AGUA (K₂O) 60 %', contenido: [{ elemento: 'Potasio', forma: 'K₂O', porcentaje: 60 }], precios: [] }),
    fertilizante({ id: 'npk', nombre: 'Triple 15', registroIca: '12', composicionTexto: 'NITRÓGENO TOTAL (N) 15 %, POTASIO (K₂O) 15 %', contenido: [{ elemento: 'Nitrógeno', forma: 'N', porcentaje: 15 }, { elemento: 'Fósforo', forma: 'P₂O₅', porcentaje: 15 }, { elemento: 'Potasio', forma: 'K₂O', porcentaje: 15 }], precios: [] })
  ].map(f => leerFertilizante(f)!);
  assert.equal(filtrarCatalogo(lista, {}).length, 3, 'sin filtros, todo el catálogo');
  assert.deepEqual(filtrarCatalogo(lista, { formas: ['K₂O'] }).map(f => f.id), ['kcl', 'npk'], 'mayor concentración primero');
  assert.deepEqual(filtrarCatalogo(lista, { formas: ['N', 'K₂O'] }).map(f => f.id), ['npk']);
  assert.deepEqual(filtrarCatalogo(lista, { soloConPrecio: true }).map(f => f.id), ['dap-ejemplo']);
  assert.deepEqual(filtrarCatalogo(lista, { texto: 'FÓSFORO asimilable' }).map(f => f.id), ['dap-ejemplo'], 'busca también en la composición garantizada');
});

test('catálogo: los datos del registro se conservan si son textos razonables; lo demás se descarta', () => {
  const f = leerFertilizante(fertilizante({ detalle: { clase: 'Fertilizante inorgánico · simple N', tipo: 'Granulado', origen: 'x'.repeat(500), cultivos: 7, uso: '  ' } }))!;
  assert.deepEqual(f.detalle, { clase: 'Fertilizante inorgánico · simple N', tipo: 'Granulado' });
  assert.equal(leerFertilizante(fertilizante())!.detalle, undefined);
});
