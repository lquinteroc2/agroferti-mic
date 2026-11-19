/**
 * Lectura automática del texto de un informe de laboratorio. Texto de EJEMPLO (no es un análisis real).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { extraerDatosAnalisis } from '../src/lib/lecturaAnalisis.ts';

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
