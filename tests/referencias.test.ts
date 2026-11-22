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
import { avisosParaSugerencias, citaDeSugerencia, regionesDelCultivo, requisitosSugerencias, sugerirMetas, usaMetodo } from '../src/lib/sugerencias.ts';
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

test('revisión UX (tanda 3): requisitos visibles para que la app proponga metas', () => {
  const completo = requisitosSugerencias({ cultivo: 'papa', region: 'Región EJEMPLO', analisis: analisisEjemplo(), reglas });
  assert.deepEqual(completo.map(r => [r.clave, r.cumple]), [
    ['analisis', true],
    ['nutriente:P|mg/kg|Bray II', true],
    ['nutriente:K|cmol(+)/kg|Acetato de amonio', true],
    ['zona', true]
  ]);
  assert.equal(completo[1].texto, 'Fósforo (P) en mg/kg (ppm), medido con Bray II', 'una fila por condición, aunque la tabla tenga varias');
  assert.equal(completo[2].texto, 'Potasio (K) en cmol(+)/kg (meq/100 g), medido con Acetato de amonio');

  const sinNada = requisitosSugerencias({ cultivo: 'papa', reglas });
  assert.ok(sinNada.every(r => !r.cumple && !r.motivo), 'sin análisis ni zona no se cumple nada y no hay motivo técnico');

  const olsen = requisitosSugerencias({ cultivo: 'papa', region: 'Región EJEMPLO', analisis: analisisEjemplo({ metodoLaboratorio: 'Olsen (fósforo), acetato de amonio' }), reglas });
  const p = olsen.find(r => r.clave.startsWith('nutriente:P'))!;
  assert.equal(p.cumple, false);
  assert.match(p.motivo ?? '', /método Bray II/);
  assert.equal(olsen.find(r => r.clave.startsWith('nutriente:K'))!.cumple, true);

  assert.equal(requisitosSugerencias({ cultivo: 'papa', region: 'Región inventada', analisis: analisisEjemplo(), reglas }).at(-1)!.cumple, false, 'una zona que no está en las referencias no sirve');
  assert.deepEqual(requisitosSugerencias({ cultivo: 'kale', reglas }), [], 'sin referencias para el cultivo no se pide nada');
  assert.deepEqual(regionesDelCultivo(reglas, 'papa').sort(), ['Otra región EJEMPLO', 'Región EJEMPLO']);
});

test('revisión UX (tanda 3): avisos al escribir el análisis si un nutriente no servirá para proponer metas', () => {
  const avisos = (nutrientes: Array<{ forma: string; unidad?: string; valor?: unknown }>, metodoLaboratorio: string) =>
    avisosParaSugerencias({ cultivo: 'papa', reglas, nutrientes, metodoLaboratorio });
  assert.deepEqual(avisos([{ forma: 'P', unidad: 'mg/kg', valor: '35' }, { forma: 'K', unidad: 'cmol(+)/kg', valor: '0,25' }], 'Bray II (fósforo), Acetato de amonio (potasio, calcio y magnesio)'), []);
  const metodo = avisos([{ forma: 'P', unidad: 'mg/kg', valor: '35' }], 'Olsen (fósforo)');
  assert.equal(metodo.length, 1);
  assert.match(metodo[0], /fósforo \(P\) medido con Bray II/);
  const unidad = avisos([{ forma: 'K⁺', unidad: 'mg/kg', valor: '120' }], 'Acetato de amonio');
  assert.equal(unidad.length, 1);
  assert.match(unidad[0], /potasio \(K\) en cmol\(\+\)\/kg \(meq\/100 g\)/);
  assert.deepEqual(avisos([], ''), [], 'no pide nutrientes que el informe no trae');
  assert.deepEqual(avisos([{ forma: 'Ca', unidad: 'cmol(+)/kg', valor: '4' }], ''), [], 'nutrientes sin referencia no generan avisos');
  assert.deepEqual(avisosParaSugerencias({ cultivo: 'kale', reglas, nutrientes: [{ forma: 'P', unidad: 'mg/kg', valor: '35' }], metodoLaboratorio: '' }), []);
});

test('revisión de la tanda 3: los requisitos y avisos usan solo las referencias de la zona elegida', () => {
  // Zona A mide el fósforo con Bray II; zona B, con Olsen.
  const porZona = [
    regla({ id: 'a', region: 'Zona A EJEMPLO', condicion: { nutriente: 'P', metodo: 'Bray II', unidad: 'mg/kg', min: null, max: null } }),
    regla({ id: 'b', region: 'Zona B EJEMPLO', condicion: { nutriente: 'P', metodo: 'Olsen', unidad: 'mg/kg', min: null, max: null } })
  ].map(r => leerReglaDosis(r)!);
  const bray = analisisEjemplo({ metodoLaboratorio: 'Bray II (fósforo)' });
  const enA = requisitosSugerencias({ cultivo: 'papa', region: 'Zona A EJEMPLO', analisis: bray, reglas: porZona });
  assert.ok(enA.every(r => r.cumple), 'con la zona A y Bray II no falta nada');
  assert.ok(!enA.some(r => /Olsen/.test(r.texto)), 'no pide el método de la otra zona');
  const sinZona = requisitosSugerencias({ cultivo: 'papa', analisis: bray, reglas: porZona });
  assert.ok(sinZona.some(r => /Olsen/.test(r.texto)), 'sin zona se muestran las condiciones de todas');
  const avisosA = avisosParaSugerencias({ cultivo: 'papa', region: 'Zona A EJEMPLO', reglas: porZona, nutrientes: [{ forma: 'P', unidad: 'mg/kg', valor: '35' }], metodoLaboratorio: 'Bray II' });
  assert.deepEqual(avisosA, []);
});

test('revisión de la tanda 3: formulario y plan reconocen igual la fila del nutriente (forma sin espacios y con valor)', () => {
  const avisos = (nutrientes: Array<{ forma: string; unidad?: string; valor?: unknown }>) =>
    avisosParaSugerencias({ cultivo: 'papa', reglas, nutrientes, metodoLaboratorio: 'Olsen' });
  assert.equal(avisos([{ forma: ' P ', unidad: 'mg/kg', valor: '35' }]).length, 1, 'la forma con espacios cuenta como P');
  assert.deepEqual(avisos([{ forma: 'P', unidad: 'mg/kg', valor: '' }]), [], 'una fila sin valor no cuenta, igual que en el plan');
  const sinValor = requisitosSugerencias({ cultivo: 'papa', region: 'Región EJEMPLO', reglas,
    analisis: analisisEjemplo({ nutrientes: [{ elemento: 'Potasio', forma: 'K', valor: 0.25, unidad: 'cmol(+)/kg' }] }) });
  assert.match(sinValor.find(r => r.clave.startsWith('nutriente:P'))!.motivo ?? '', /no tiene P/);
});

test('revisión UX (tanda 3): el método se reconoce sin importar mayúsculas, tildes ni guiones', () => {
  assert.equal(usaMetodo('Bray-II (fósforo)', 'Bray II'), true);
  assert.equal(usaMetodo('bray ii', 'Bray II'), true);
  assert.equal(usaMetodo('Olsen', 'Bray II'), false);
  assert.equal(usaMetodo(undefined, 'Bray II'), false);
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

import { departamentoDelLote, departamentoDeUbicacion } from '../src/lib/referencias.ts';
import { DEPARTAMENTOS_COLOMBIA } from '../src/lib/departamentos.ts';

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

test('revisión UX (tanda 5): el departamento elegido en el lote toma su precio exacto; "Norte de Santander" no es "Santander"', () => {
  const precio = (departamento: string, precioPromedioCop: number) => ({ departamento, precioPromedioCop, presentacion: 'Bulto x 50 kg', periodo: '2026-10' });
  const f = leerFertilizante(fertilizante({ precios: [precio('Santander', 140000), precio('Norte de Santander', 150000), precio('Bogotá, D.C.', 160000)] }))!;
  assert.equal(departamentoDelLote(f, { departamento: 'Norte de Santander' }), 'Norte de Santander');
  assert.equal(departamentoDelLote(f, { departamento: 'Santander', ubicacion: 'Vereda X, Norte de Santander' }), 'Santander', 'el campo elegido manda sobre el texto');
  assert.equal(departamentoDelLote(f, { departamento: 'bogota, d.c.' }), 'Bogotá, D.C.', 'sin importar tildes ni mayúsculas');
  assert.equal(departamentoDelLote(f, { departamento: 'Boyacá', ubicacion: 'Santander' }), undefined, 'sin precio en el departamento elegido no se toma otro');
  assert.equal(departamentoDelLote(f, { ubicacion: 'Pamplona, Norte de Santander' }), 'Norte de Santander', 'en el texto, el nombre más largo primero');
  assert.equal(departamentoDeUbicacion(f, 'Pamplona, Norte de Santander'), 'Norte de Santander');
  assert.equal(departamentoDelLote(f, {}), undefined);
});

test('revisión UX (tanda 5): la lista de departamentos tiene los 32 y Bogotá, sin repetidos', () => {
  assert.equal(DEPARTAMENTOS_COLOMBIA.length, 33);
  assert.equal(new Set(DEPARTAMENTOS_COLOMBIA).size, 33);
  // Los departamentos con precio DANE en el catálogo cargado están escritos igual en la lista.
  const datos = JSON.parse(readFileSync(new URL('../data/referencias/fertilizantes.json', import.meta.url), 'utf8')) as Array<{ precios?: Array<{ departamento: string }> }>;
  const conPrecio = new Set(datos.flatMap(f => (f.precios ?? []).map(p => p.departamento)));
  assert.deepEqual([...conPrecio].filter(d => !DEPARTAMENTOS_COLOMBIA.includes(d)), []);
});

test('revisión de la tanda 5: en la ubicación escrita se reconoce el departamento antes de buscar su precio', () => {
  const precio = (departamento: string) => ({ departamento, precioPromedioCop: 150000, presentacion: 'Bulto x 50 kg', periodo: '2026-10' });
  const soloSantander = leerFertilizante(fertilizante({ precios: [precio('Santander')] }))!;
  assert.equal(departamentoDeUbicacion(soloSantander, 'Pamplona, Norte de Santander'), undefined, 'no toma el precio de Santander para Norte de Santander');
  assert.equal(departamentoDeUbicacion(soloSantander, 'Bucaramanga, Santander'), 'Santander');
  const varios = leerFertilizante(fertilizante({ precios: [precio('Bogotá, D.C.'), precio('Córdoba'), precio('Cesar'), precio('Meta')] }))!;
  assert.equal(departamentoDeUbicacion(varios, 'Usme, Bogotá'), 'Bogotá, D.C.', 'la forma corta de Bogotá');
  assert.equal(departamentoDeUbicacion(varios, 'San Andrés de Sotavento, Córdoba'), 'Córdoba', 'el municipio San Andrés no es el archipiélago');
  assert.equal(departamentoDeUbicacion(varios, 'Valledupar, Cesar'), 'Cesar');
  assert.equal(departamentoDeUbicacion(varios, 'Vereda La Metálica'), undefined, 'palabras completas: "Metálica" no es Meta');
  assert.equal(departamentoDeUbicacion(varios, 'Granada, Meta'), 'Meta');
});
