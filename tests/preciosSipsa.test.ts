/**
 * Actualización mensual de los precios del DANE (SIPSA-I, anexo departamental). Datos de EJEMPLO
 * (ficticios) con la misma forma del anexo real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { actualizarPrecios, filasDeFertilizantes, moverMes, periodoDeNombre, ultimoPeriodo, urlAnexo, type FilaDane } from '../scripts/precios-dane-lib.ts';
import { leerXlsx } from '../scripts/xlsx.ts';
import { leerFertilizante } from '../src/lib/referencias.ts';

/** ZIP mínimo (comprimido con deflate) para probar el lector sin archivos externos. */
function zip(archivos: Record<string, string>): Buffer {
  const locales: Buffer[] = [], central: Buffer[] = [];
  let desplazamiento = 0;
  for (const [nombre, contenido] of Object.entries(archivos)) {
    const datos = deflateRawSync(Buffer.from(contenido, 'utf8'));
    const n = Buffer.from(nombre, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(datos.length, 18);
    local.writeUInt32LE(Buffer.byteLength(contenido), 22); local.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(datos.length, 20);
    c.writeUInt32LE(Buffer.byteLength(contenido), 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(desplazamiento, 42);
    locales.push(local, n, datos); central.push(c, n);
    desplazamiento += 30 + n.length + datos.length;
  }
  const dir = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(central.length / 2, 8); fin.writeUInt16LE(central.length / 2, 10);
  fin.writeUInt32LE(dir.length, 12); fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, dir, fin]);
}

const celda = (ref: string, v: string | number) => typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
const fila = (n: number, valores: Array<string | number>) => `<row r="${n}">${valores.map((v, i) => celda(`${String.fromCharCode(65 + i)}${n}`, v)).join('')}</row>`;
const ANEXO_EJEMPLO = zip({
  'xl/workbook.xml': '<workbook><sheets><sheet name="Índice" sheetId="1" r:id="rId1"/><sheet name="1.3" sheetId="2" r:id="rId2"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<sst><si><t>1.3. Fertilizantes, enmiendas y acondicionadores de suelo</t></si><si><r><t>Registro </t></r><r><t>ICA</t></r></si></sst>',
  'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${fila(1, ['1.3. Fertilizantes, enmiendas y acondicionadores de suelo'])}</sheetData></worksheet>`,
  'xl/worksheets/sheet2.xml': `<worksheet><sheetData><row r="5"><c r="A5" t="s"><v>0</v></c></row>
    ${fila(9, ['Código departamento', 'Nombre departamento ', 'Código CPC', 'Nombre del producto', 'Artículo', 'Casa Comercial', 'REEMPLAZO', 'Presentación del producto', 'Precio promedio departamento']).replace('<c r="G9" t="inlineStr"><is><t>REEMPLAZO</t></is></c>', '<c r="G9" t="s"><v>1</v></c>')}
    ${fila(10, ['25', 'Cundinamarca', 3461101, 'Urea 46%', 'Urea EJEMPLO', 'Empresa EJEMPLO &amp; Cía', '9001', '50 kilogramos', 150000.5])}
    ${fila(11, ['15', 'Boyaca ', 3461101, 'Urea 46%', 'Urea EJEMPLO', 'Empresa EJEMPLO', '9001', '25 kilogramos', 80000])}
    ${fila(12, ['15', 'Boyacá', 3461101, 'Urea 46%', 'Urea EJEMPLO', 'Empresa EJEMPLO', '9001', '1 kilogramo', 4000])}
    ${fila(13, ['41', 'Huila', 9, 'Foliar', 'Foliar EJEMPLO', 'Empresa EJEMPLO', '9002', '1 litro', 30000])}
    ${fila(15, ['Fuente: DANE, SIPSA-I'])}</sheetData></worksheet>`
});

test('precios DANE: el lector de .xlsx encuentra la hoja de fertilizantes por su título y encabezado', () => {
  const hojas = leerXlsx(ANEXO_EJEMPLO);
  assert.deepEqual(hojas.map(h => h.nombre), ['Índice', '1.3']);
  assert.equal(hojas[1].filas[4][0], '1.3. Fertilizantes, enmiendas y acondicionadores de suelo', 'cadena compartida');
  assert.equal(hojas[1].filas[8][6], 'Registro ICA', 'cadena compartida en varios trozos');
  assert.equal(hojas[1].filas[9][5], 'Empresa EJEMPLO & Cía', 'entidades XML');
  assert.deepEqual(filasDeFertilizantes(hojas), [
    { departamento: 'Cundinamarca', registroIca: '9001', presentacion: '50 kilogramos', precio: 150000.5 },
    { departamento: 'Boyacá', registroIca: '9001', presentacion: '25 kilogramos', precio: 80000 },
    { departamento: 'Boyacá', registroIca: '9001', presentacion: '1 kilogramo', precio: 4000 },
    { departamento: 'Huila', registroIca: '9002', presentacion: '1 litro', precio: 30000 }
  ], 'el nombre del departamento se escribe como en la app; el índice y el pie no son filas');
});

test('precios DANE: dirección y mes de cada anexo', () => {
  assert.equal(urlAnexo('2026-11'), 'https://www.dane.gov.co/files/operaciones/SIPSA/anex-SIPSAinsumosdepartamento-nov2026.xlsx');
  assert.equal(periodoDeNombre('anex-SIPSAinsumosdepartamento-oct2026.xlsx'), '2026-10');
  assert.equal(periodoDeNombre('anex-SIPSAinsumosdepartamento-enero2024.xlsx'), '2024-01');
  assert.equal(periodoDeNombre('otro.xlsx'), undefined);
  assert.equal(moverMes('2026-01', -1), '2025-12');
  assert.equal(moverMes('2026-11', 2), '2027-01');
});

const filas: FilaDane[] = [
  { departamento: 'Cundinamarca', registroIca: '9001', presentacion: '50 kilogramos', precio: 150000.5 },
  { departamento: 'Boyacá', registroIca: '9001', presentacion: '25 kilogramos', precio: 80000 },
  { departamento: 'Boyacá', registroIca: '9001', presentacion: '1 kilogramo', precio: 4000 },
  { departamento: 'Huila', registroIca: '9002', presentacion: '1 litro', precio: 30000 }
];
type PrecioEjemplo = { departamento: string; precioPromedioCop: number; presentacion: string; periodo: string };
const ref = (registroIca: string, precios: PrecioEjemplo[] = []) => ({
  id: `ref-${registroIca}`, nombre: `Fertilizante EJEMPLO ${registroIca}`, empresa: 'Empresa EJEMPLO', registroIca, estadoRegistro: 'VIGENTE',
  composicionTexto: 'N 46%', contenido: [{ elemento: 'Nitrógeno', forma: 'N', porcentaje: 46 }], presentacionKg: 50, precios,
  verificacion: 'ok', fuente: 'ICA, registro de EJEMPLO, www.ica.gov.co. Precios: DANE, SIPSA-I insumos, anexo departamental, septiembre de 2026, www.dane.gov.co.'
});

test('precios DANE: cada fertilizante recibe el precio del mes por su registro ICA (más de los 26 de antes)', () => {
  const [urea, foliar, sinDane] = actualizarPrecios([ref('9001'), ref('9002'), ref('9003')], filas, '2026-10');
  assert.deepEqual(urea.precios, [
    { departamento: 'Boyacá', precioPromedioCop: 80000, presentacion: '25 kilogramos', periodo: '2026-10' },
    { departamento: 'Cundinamarca', precioPromedioCop: 150000.5, presentacion: '50 kilogramos', periodo: '2026-10' }
  ], 'sin bulto de 50 kg en Boyacá, la presentación más grande');
  assert.equal(urea.fuente, 'ICA, registro de EJEMPLO, www.ica.gov.co. Precios: DANE, SIPSA-I insumos, anexo departamental, octubre de 2026, www.dane.gov.co.');
  assert.deepEqual(foliar.precios, [], 'un líquido (litros) no es un bulto: no recibe precio');
  assert.equal(foliar.fuente, 'ICA, registro de EJEMPLO, www.ica.gov.co.', 'sin precios no se cita el DANE');
  assert.deepEqual(sinDane.precios, []);
  assert.ok(leerFertilizante(urea), 'sigue siendo una referencia válida');
});

test('precios DANE: un precio que este mes no aparece se conserva hasta 2 meses; uno más viejo se quita', () => {
  const anteriores = [
    { departamento: 'Nariño', precioPromedioCop: 170000, presentacion: '50 kilogramos', periodo: '2026-09' },
    { departamento: 'Huila', precioPromedioCop: 160000, presentacion: '50 kilogramos', periodo: '2026-07' },
    { departamento: 'Cundinamarca', precioPromedioCop: 140000, presentacion: '50 kilogramos', periodo: '2026-09' }
  ];
  const [urea] = actualizarPrecios([ref('9001', anteriores)], filas, '2026-10');
  assert.deepEqual(urea.precios.map(p => `${p.departamento} ${p.periodo}`), ['Boyacá 2026-10', 'Cundinamarca 2026-10', 'Nariño 2026-09']);
  assert.equal(ultimoPeriodo([urea]), '2026-10');
  const repetido = actualizarPrecios([urea], filas, '2026-10')[0];
  assert.deepEqual(repetido.precios, urea.precios, 'correrlo dos veces con el mismo mes no cambia nada');
});

test('revisión: al cambiar el mes solo se reemplaza la frase de los precios; las notas de la fuente se conservan', () => {
  const conNotas = { ...ref('9001'), fuente: 'ICA, registro de EJEMPLO, www.ica.gov.co. Precios: DANE, SIPSA-I insumos, anexo departamental, septiembre de 2026, www.dane.gov.co. Notas: "K20" leído como K₂O (EJEMPLO).' };
  const [nuevo] = actualizarPrecios([conNotas], filas, '2026-10');
  assert.equal(nuevo.fuente, 'ICA, registro de EJEMPLO, www.ica.gov.co. Precios: DANE, SIPSA-I insumos, anexo departamental, octubre de 2026, www.dane.gov.co. Notas: "K20" leído como K₂O (EJEMPLO).');
  const [sinPrecios] = actualizarPrecios([{ ...conNotas, registroIca: '9003' }], filas, '2026-10');
  assert.equal(sinPrecios.fuente, 'ICA, registro de EJEMPLO, www.ica.gov.co. Notas: "K20" leído como K₂O (EJEMPLO).');
});
