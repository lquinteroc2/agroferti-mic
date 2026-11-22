/**
 * Lectura automática del texto de un informe de laboratorio. Texto de EJEMPLO (no es un análisis real).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { extraerDatosAnalisis, extraerDeTabla, type CeldaPdf } from '../src/lib/lecturaAnalisis.ts';

const INFORME_EJEMPLO = `
LABORATORIO DE SUELOS EJEMPLO
Laboratorio: Laboratorio de Suelos EJEMPLO
Fecha de recepción: 20/08/2026
Profundidad de muestreo: 0 - 20 cm
Densidad aparente 1,1 g/cm3
pH (agua 1:1) 5,4
Materia orgánica (Walkley-Black) 12,3 %
Fósforo disponible (Bray II) 35,2 mg/kg
Potasio intercambiable (acetato de amonio 1 N pH 7) 0,25 cmol(+)/kg
Calcio 3.1 meq/100 g
Magnesio 0,9 cmol(+)/kg
Azufre (fosfato monocálcico) 8 ppm
Boro 0,3 mg/kg
Hierro DTPA 120 mg/kg
Sodio 0,1 %
`;

test('lectura: encuentra fecha, laboratorio, profundidad, densidad, pH, nutrientes y métodos con su línea', () => {
  const datos = extraerDatosAnalisis(INFORME_EJEMPLO);
  const valor = (clave: string) => datos.find(d => d.clave === clave)?.valor;
  assert.equal(valor('fecha'), '2026-08-20');
  assert.equal(valor('laboratorio'), 'Laboratorio de Suelos EJEMPLO');
  assert.equal(valor('profundidad'), '20');
  assert.equal(valor('densidad'), '1,1');
  assert.equal(valor('ph'), '5,4');
  assert.equal(valor('nutriente-P'), '35,2');
  assert.equal(valor('nutriente-K'), '0,25');
  assert.equal(valor('nutriente-Ca'), '3,1');
  assert.equal(valor('nutriente-S'), '8');
  assert.equal(valor('nutriente-Fe'), '120');
  assert.deepEqual(datos.find(d => d.clave === 'nutriente-Ca')?.nutriente, { elemento: 'Calcio', forma: 'Ca', unidad: 'cmol(+)/kg' }, 'meq/100 g se lee como cmol(+)/kg');
  assert.equal(datos.find(d => d.clave === 'nutriente-S')?.nutriente?.unidad, 'mg/kg', 'ppm se lee como mg/kg');
  assert.match(datos.find(d => d.clave === 'nutriente-P')!.linea, /Bray II/);
  assert.match(valor('metodo') ?? '', /Bray II.*Acetato de amonio.*Walkley-Black/);
});

test('lectura: no inventa lo que no está; sin unidad reconocida no se lee el nutriente', () => {
  const datos = extraerDatosAnalisis(INFORME_EJEMPLO);
  assert.ok(!datos.some(d => d.etiqueta.startsWith('Sodio')), 'el sodio en % no se toma');
  assert.deepEqual(extraerDatosAnalisis('Texto sin datos de laboratorio'), []);
  assert.deepEqual(extraerDatosAnalisis('Fósforo 35'), [], 'sin unidad no se lee');
  assert.equal(extraerDatosAnalisis('pH 54').length, 0, 'un pH imposible no se toma');
  assert.equal(extraerDatosAnalisis('P2O5 total 46 mg/kg').length, 0, 'P₂O₅ no se toma como P');
  // Caso real de una foto: la línea del pH se leyó mal y la del potasio menciona "pH 7" del método.
  const foto = extraerDatosAnalisis('pH (agua 1:1) 54\nPotasio intercambiable (acetato de amonio 1 N pH 7) 0,25 cmol(+)/kg');
  assert.equal(foto.find(d => d.clave === 'ph'), undefined, 'el valor del potasio no se toma como pH');
  assert.equal(foto.find(d => d.clave === 'nutriente-K')?.valor, '0,25');
  // La unidad del potasio mal leída en la foto: tampoco se toma su valor como pH.
  assert.equal(extraerDatosAnalisis('Potasio intercambiable (acetato de amonio 1 N pH 7) 0,25 cmol(+)/ka').find(d => d.clave === 'ph'), undefined);
  assert.equal(extraerDatosAnalisis('pH 0,8').find(d => d.clave === 'ph'), undefined, 'pH imposible en un suelo');
});

import { formatoDe } from '../src/lib/textoDeArchivo.ts';

test('adjuntar archivo: reconoce PDF, imágenes y texto por tipo o por extensión; avisa con HEIC y otros', () => {
  assert.equal(formatoDe('informe.pdf', ''), 'pdf');
  assert.equal(formatoDe('foto.JPG', ''), 'imagen');
  assert.equal(formatoDe('escaneo', 'image/png'), 'imagen');
  assert.equal(formatoDe('informe.txt', 'text/plain'), 'texto');
  assert.equal(formatoDe('resultados.csv', ''), 'texto');
  assert.equal(formatoDe('IMG_0001.HEIC', ''), 'heic');
  assert.equal(formatoDe('informe.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'otro');
});

// ─── Informes en tabla ───────────────────────────────────────────────────────────────────────────
// Posiciones como las de un informe real hecho en una hoja de cálculo (símbolos arriba, unidades en
// celdas combinadas y una fila de valores). Los valores son de EJEMPLO.

const c = (y: number, x: number, ancho: number, texto: string): CeldaPdf => ({ pagina: 1, x, y, ancho, alto: 9, texto });
/** Valor centrado en su columna. */
const v = (y: number, centro: number, texto: string) => c(y, centro - texto.length * 2.5, texto.length * 5, texto);

const ENCABEZADO: CeldaPdf[] = [
  c(447, 110, 50, 'Oct – 2026'),
  c(415, 448, 68, 'Cationes de cambio'), c(415, 656, 69, 'Elementos Menores'),
  c(396, 311, 20, 'Al + H'), c(396, 366, 6, '%'),
  c(395, 238, 4, 'P'), c(395, 271, 4, 'S'), c(395, 398, 7, 'Al'), c(395, 429, 9, 'Ca'), c(395, 460, 11, 'Mg'), c(395, 496, 5, 'K'),
  c(395, 526, 9, 'Na'), c(395, 555, 15, 'CICE'), c(395, 623, 8, 'Fe'), c(395, 655, 9, 'Cu'), c(395, 686, 12, 'Mn'), c(395, 719, 9, 'Zn'), c(395, 753, 5, 'B'),
  c(386, 63, 15, 'Prof'), c(386, 102, 10, 'DA'), c(386, 590, 9, 'CE'),
  c(376, 24, 29, 'Muestra'), c(376, 134, 27, 'Textura'), c(376, 175, 10, 'pH'), c(376, 198, 21, 'MO %'), c(376, 356, 26, 'Saturac'),
  c(366, 63, 15, '(cm)'), c(366, 91, 32, '(Ton/m3)'), c(366, 243, 26, 'mg / Kg'), c(366, 304, 33, 'cmol kg-1'), c(366, 465, 34, 'cmol Kg-1'),
  c(366, 585, 19, 'dS/m'), c(366, 677, 26, 'mg / Kg'),
  c(356, 366, 7, 'Al')
];
const VALORES: ReadonlyArray<[number, string]> = [
  [39, '2'], [71, '20'], [107, '1,1'], [148, 'F A'], [180, '5,6'], [208, '8,2%'], [240, '23'], [273, '12'], [321, '0,6'], [369, '8,0'],
  [401.5, '0,4'], [434, '5,2'], [466, '1,8'], [498.5, '0,45'], [530.5, '0,08'], [563, '7,9'], [595, '0,31'], [627, '112'], [659.5, '1,4'],
  [691, '9'], [724, '2,3'], [755.5, '0,42']
];
const filaValores = (y: number) => VALORES.map(([centro, texto]) => v(y, centro, texto));
const TABLA = [...ENCABEZADO, ...filaValores(336)];
const resumen = (datos: ReturnType<typeof extraerDeTabla>) => datos.map(d => [d.clave, d.valor, d.nutriente?.unidad ?? '-']);

test('tabla: cada valor sale de su columna, con la unidad de la celda combinada que la cubre', () => {
  const datos = extraerDeTabla(TABLA);
  // Solo esto: ni la materia orgánica, ni la CICE, ni la CE, ni la acidez (Al + H), ni la saturación de Al.
  assert.deepEqual(resumen(datos), [
    ['profundidad', '20', '-'], ['densidad', '1,1', '-'], ['ph', '5,6', '-'],
    ['nutriente-P', '23', 'mg/kg'], ['nutriente-S', '12', 'mg/kg'],
    ['nutriente-Al', '0,4', 'cmol(+)/kg'], ['nutriente-Ca', '5,2', 'cmol(+)/kg'], ['nutriente-Mg', '1,8', 'cmol(+)/kg'],
    ['nutriente-K', '0,45', 'cmol(+)/kg'], ['nutriente-Na', '0,08', 'cmol(+)/kg'],
    ['nutriente-Fe', '112', 'mg/kg'], ['nutriente-Cu', '1,4', 'mg/kg'], ['nutriente-Mn', '9', 'mg/kg'], ['nutriente-Zn', '2,3', 'mg/kg'], ['nutriente-B', '0,42', 'mg/kg']
  ]);
  const linea = (clave: string) => datos.find(d => d.clave === clave)?.linea;
  assert.equal(linea('nutriente-Al'), 'Tabla, columna Al (cmol Kg-1): 0,4', 'el aluminio, no la acidez ni la saturación');
  assert.equal(linea('nutriente-Fe'), 'Tabla, columna Fe (mg / Kg): 112', 'el hierro no queda bajo los dS/m de la CE');
  assert.equal(linea('profundidad'), 'Tabla, columna Prof (cm): 20');
  assert.match(linea('densidad') ?? '', /1 t\/m³ es lo mismo que 1 g\/cm³/);
  assert.equal(linea('ph'), 'Tabla, columna pH: 5,6');
});

test('tabla: una unidad partida en pedazos se lee igual', () => {
  const partida = TABLA.flatMap(x => (x.texto === 'mg / Kg' && x.x === 243 ? [c(366, 243, 8, 'mg'), c(366, 253, 3, '/'), c(366, 258, 11, 'Kg')] : [x]));
  assert.deepEqual(resumen(extraerDeTabla(partida)), resumen(extraerDeTabla(TABLA)));
});

test('tabla: si no se sabe con certeza la unidad, el valor se propone sin unidad (no se supone)', () => {
  const datos = extraerDeTabla(TABLA.filter(x => x.texto !== 'cmol Kg-1'));
  const calcio = datos.find(d => d.clave === 'nutriente-Ca');
  assert.equal(calcio?.valor, '5,2');
  assert.equal(calcio?.nutriente?.unidad, '');
  assert.match(calcio?.linea ?? '', /sin unidad clara/);
  assert.equal(datos.find(d => d.clave === 'nutriente-P')?.nutriente?.unidad, '', 'si las unidades no cuadran en toda la tabla, ninguna se toma');
});

test('tabla: con varias muestras no se adivina cuál es la del lote; con menos de 3 símbolos no hay tabla', () => {
  assert.deepEqual(extraerDeTabla([...TABLA, ...filaValores(320)]), []);
  assert.deepEqual(extraerDeTabla([c(500, 98, 5, 'P'), c(500, 158, 5, 'K'), v(485, 100, '18'), v(485, 160, '0,3')]), []);
});

test('tabla: la unidad puede venir en el título de la columna', () => {
  const datos = extraerDeTabla([
    v(500, 40, 'pH'), v(500, 120, 'P (mg/kg)'), v(500, 200, 'K (cmol(+)/kg)'), v(500, 280, 'Ca (cmol(+)/kg)'),
    v(485, 40, '5,4'), v(485, 120, '18'), v(485, 200, '0,32'), v(485, 280, '4,1')
  ]);
  assert.deepEqual(resumen(datos), [['ph', '5,4', '-'], ['nutriente-P', '18', 'mg/kg'], ['nutriente-K', '0,32', 'cmol(+)/kg'], ['nutriente-Ca', '4,1', 'cmol(+)/kg']]);
  assert.equal(datos[1].linea, 'Tabla, columna P (mg/kg): 18');
});

test('tabla: tiene prioridad sobre las líneas de texto; las recomendaciones del informe no se toman como datos', () => {
  const texto = [
    'Fósforo 99 mg/kg',
    'Preparar el suelo con una profundidad de 30-40 cm, buscando la ruptura de capas',
    'Potasio', 'KCl 0-0-60', '12-15 g/ m²'
  ].join('\n');
  const datos = extraerDatosAnalisis(texto, TABLA);
  assert.equal(datos.find(d => d.clave === 'nutriente-P')?.valor, '23');
  assert.equal(datos.find(d => d.clave === 'profundidad')?.valor, '20');
  const sinTabla = extraerDatosAnalisis(texto);
  assert.equal(sinTabla.find(d => d.clave === 'profundidad'), undefined, 'la profundidad de la labranza no es la del muestreo');
  assert.equal(sinTabla.find(d => d.clave === 'metodo'), undefined, 'el fertilizante KCl no es el método KCl 1 N');
  assert.equal(extraerDatosAnalisis('Al+H: Acidez intercambiable, KCl 1 N').find(d => d.clave === 'metodo')?.valor, 'KCl');
});

test('líneas: sodio y aluminio (no la acidez intercambiable); sin leer valores después de la unidad ni sumas', () => {
  const valor = (texto: string, clave: string) => extraerDatosAnalisis(texto).find(d => d.clave === clave);
  assert.equal(valor('Sodio intercambiable 0,1 cmol(+)/kg', 'nutriente-Na')?.valor, '0,1');
  assert.equal(valor('Aluminio intercambiable 0,7 cmol(+)/kg', 'nutriente-Al')?.valor, '0,7');
  assert.deepEqual(extraerDatosAnalisis('Acidez intercambiable (Al + H) 0,9 cmol(+)/kg'), []);
  assert.deepEqual(extraerDatosAnalisis('H + Al 0,9 cmol(+)/kg'), []);
  // El número después de la unidad no se toma: puede ser de otra columna o de una suma.
  assert.deepEqual(extraerDatosAnalisis('Suma de bases (Ca+Mg+K+Na) cmol(+)/kg 7,6'), []);
  assert.deepEqual(extraerDatosAnalisis('Ca Mg K Na cmol(+)/kg 5,2 1,8 0,45 0,08'), []);
});

test('líneas: profundidad del muestreo junto a otros campos, no la de una labranza; método KCl, no el fertilizante', () => {
  const valor = (texto: string, clave: string) => extraerDatosAnalisis(texto).find(d => d.clave === clave)?.valor;
  assert.equal(valor('Cultivo: papa Profundidad: 0-20 cm', 'profundidad'), '20');
  assert.equal(valor('Lote 3 Profundidad 0 - 20 cm', 'profundidad'), '20');
  assert.equal(valor('Preparar el suelo con una profundidad de 30-40 cm', 'profundidad'), undefined);
  assert.equal(valor('Aluminio intercambiable (KCl) 0,5 cmol(+)/kg', 'metodo'), 'KCl');
  assert.equal(valor('Extracción con KCl 1 mol/L', 'metodo'), 'KCl');
  for (const fertilizante of ['KCl 0-0-60', 'Monómeros KCl', 'Aplicar al suelo KCl 0-0-60', 'Cloruro de potasio (KCl)']) {
    assert.equal(valor(fertilizante, 'metodo'), undefined, fertilizante);
  }
});

test('tabla: un valor sin unidad clara toma la unidad de una línea del informe con el mismo valor', () => {
  const sinUnidad = TABLA.filter(x => x.texto !== 'cmol Kg-1');
  const igual = extraerDatosAnalisis('Fósforo (Bray II) 23 mg/kg', sinUnidad).find(d => d.clave === 'nutriente-P');
  assert.equal(igual?.nutriente?.unidad, 'mg/kg');
  assert.match(igual?.linea ?? '', /Tabla, columna P \(sin unidad clara\): 23 · Fósforo \(Bray II\) 23 mg\/kg/);
  const distinto = extraerDatosAnalisis('Fósforo (Bray II) 25 mg/kg', sinUnidad).find(d => d.clave === 'nutriente-P');
  assert.deepEqual([distinto?.valor, distinto?.nutriente?.unidad], ['23', ''], 'con otro valor no se mezclan');
});

test('tabla: pH con proporción sí; pH en KCl no (es otra medida)', () => {
  const tabla = (titulo: string) => extraerDeTabla([
    v(500, 40, titulo), v(500, 120, 'P (mg/kg)'), v(500, 200, 'K (cmol(+)/kg)'), v(500, 280, 'Ca (cmol(+)/kg)'),
    v(485, 40, '5,2'), v(485, 120, '18'), v(485, 200, '0,3'), v(485, 280, '4')
  ]).find(d => d.clave === 'ph')?.valor;
  assert.equal(tabla('pH 1:1'), '5,2');
  assert.equal(tabla('pH (1:2,5)'), '5,2');
  assert.equal(tabla('pH KCl'), undefined);
});
