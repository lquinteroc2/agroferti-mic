/**
 * Fase 6, informe del equipo: «cuando tengo la recomendación no me sale cuánto cuesta el
 * fertilizante; la app dice que no tiene el precio». El producto (una urea) sí tiene precio del DANE,
 * pero se agregó sin él. Precios y productos de EJEMPLO (ficticios).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  datosDePrecio, kgDePresentacion, departamentoNombrado, departamentoPreferido, fertilizantesQueAportan, precioDaneParaProducto,
  precioParaDepartamento, productoDesdeReferencia, type FertilizanteReferencia
} from '../src/lib/referencias.ts';

const precio = (departamento: string, precioPromedioCop: number, periodo = '2026-10') => ({ departamento, precioPromedioCop, presentacion: '50 kilogramos', periodo });
const ref = (id: string, registroIca: string, forma: string, porcentaje: number, precios: ReturnType<typeof precio>[]): FertilizanteReferencia => ({
  id, nombre: `Fertilizante EJEMPLO ${id}`, empresa: 'Empresa EJEMPLO', registroIca, estadoRegistro: 'VIGENTE', composicionTexto: '',
  contenido: [{ elemento: 'Nitrógeno', forma, porcentaje }], presentacionKg: 50, precios, verificacion: 'ok', fuente: 'EJEMPLO'
});

const urea = ref('urea', '9001', 'N', 46, [precio('Santander', 150000), precio('Cundinamarca', 160000), precio('Bogotá, D.C.', 155000), precio('Huila', 170000)]);

test('fase 6: el precio del departamento del lote, si el DANE lo publica allí', () => {
  assert.deepEqual(precioParaDepartamento(urea, 'Cundinamarca'), { precio: precio('Cundinamarca', 160000) });
  assert.deepEqual(precioParaDepartamento(urea, 'santander'), { precio: precio('Santander', 150000) }, 'sin importar tildes ni mayúsculas');
});

test('fase 6: si el DANE no lo publica en el departamento del lote, el del más cercano que sí, dicho claramente', () => {
  const boyaca = precioParaDepartamento(urea, 'Boyacá');
  assert.equal(boyaca?.precio.departamento, 'Cundinamarca', 'Tunja está más cerca de Bogotá que de Bucaramanga; se prefiere el departamento sobre el distrito');
  assert.equal(boyaca?.sinPrecioEn, 'Boyacá');
  assert.equal(precioParaDepartamento(urea, 'Nariño')?.precio.departamento, 'Huila');
  assert.equal(precioParaDepartamento(urea, 'Norte de Santander')?.precio.departamento, 'Santander');
  assert.equal(precioParaDepartamento(urea, undefined), undefined, 'sin departamento no se escoge ninguno');
  assert.equal(precioParaDepartamento(urea, 'Departamento EJEMPLO'), undefined, 'un nombre que no es un departamento no se adivina');
  assert.equal(precioParaDepartamento(ref('x', '1', 'N', 46, []), 'Boyacá'), undefined, 'sin precios del DANE');
});

test('fase 6: la fuente del precio dice de dónde salió y cabe en el campo', () => {
  const otro = datosDePrecio({ precio: precio('Cundinamarca', 160000.4), sinPrecioEn: 'Boyacá' });
  assert.deepEqual(otro, { presentacionKg: 50, precioPresentacionCop: 160000, fechaPrecio: '2026-10-31', fuentePrecio: 'Precio promedio DANE-SIPSA, Cundinamarca, octubre de 2026 (no se publica en Boyacá)' });
  const largo = datosDePrecio({ precio: precio('Norte de Santander', 1, '2026-09'), sinPrecioEn: 'San Andrés, Providencia y Santa Catalina' });
  assert.ok(largo.fuentePrecio.length <= 120);
  assert.match(largo.fuentePrecio, /de otro departamento/);
  const p = productoDesdeReferencia(urea, 'Cundinamarca', 'Boyacá');
  assert.equal(p.precioPresentacionCop, 160000);
  assert.match(p.fuentePrecio ?? '', /no se publica en Boyacá/);
  assert.equal(productoDesdeReferencia(urea).precioPresentacionCop, undefined);
});

test('fase 6: departamento de un lote (elegido o escrito) y el más frecuente entre los lotes', () => {
  assert.equal(departamentoNombrado({ departamento: 'Boyacá' }), 'Boyacá');
  assert.equal(departamentoNombrado({ ubicacion: 'Vereda EJEMPLO, Ventaquemada, Boyaca' }), 'Boyacá');
  assert.equal(departamentoNombrado({ ubicacion: 'Vereda EJEMPLO' }), undefined);
  assert.equal(departamentoPreferido([{ departamento: 'Nariño' }, { departamento: 'Boyacá' }, { ubicacion: 'Tunja, Boyacá' }, {}]), 'Boyacá');
  assert.equal(departamentoPreferido([]), undefined);
});

test('fase 6 (lo reportado): un producto agregado sin precio recibe el precio del DANE que sí existe', () => {
  const sinPrecio = { registroIca: '9001' };
  assert.equal(precioDaneParaProducto(sinPrecio, [urea], 'Cundinamarca')?.precio.precioPromedioCop, 160000);
  assert.equal(precioDaneParaProducto(sinPrecio, [urea], 'Boyacá')?.sinPrecioEn, 'Boyacá');
  assert.equal(precioDaneParaProducto(sinPrecio, [urea], undefined), undefined, 'sin departamento de los lotes no se escoge uno');
  assert.equal(precioDaneParaProducto({}, [urea], 'Cundinamarca'), undefined, 'sin registro ICA no se puede saber cuál es');
});

test('fase 6: cada mes se ofrece el precio nuevo del DANE, pero nunca se cambia un precio escrito por el productor', () => {
  const daneOctubre = { registroIca: '9001', ...datosDePrecio({ precio: precio('Cundinamarca', 160000) }) };
  assert.equal(precioDaneParaProducto(daneOctubre, [urea], 'Cundinamarca'), undefined, 'ya tiene ese mismo precio');
  const ureaNoviembre = { ...urea, precios: [precio('Cundinamarca', 158000, '2026-11')] };
  assert.equal(precioDaneParaProducto(daneOctubre, [ureaNoviembre], 'Cundinamarca')?.precio.periodo, '2026-11');
  const propio = { registroIca: '9001', precioPresentacionCop: 149000, fechaPrecio: '2026-11-20', fuentePrecio: 'Factura del almacén' };
  assert.equal(precioDaneParaProducto(propio, [ureaNoviembre], 'Cundinamarca'), undefined);
});

test('fase 6: en el plan, primero los fertilizantes con precio en el departamento del lote', () => {
  const sinPrecio = ref('a', '1', 'N', 46, []);
  const enOtro = ref('b', '2', 'N', 21, [precio('Huila', 90000)]);
  const enBoyaca = ref('c', '3', 'N', 21, [precio('Boyacá', 95000)]);
  assert.deepEqual(fertilizantesQueAportan([sinPrecio, enOtro, enBoyaca], 'N', 5, 'Boyacá').map(f => f.id), ['c', 'b', 'a']);
  assert.deepEqual(fertilizantesQueAportan([sinPrecio, enOtro, enBoyaca], 'N').map(f => f.id), ['b', 'c', 'a'], 'sin departamento: con precio primero (igual que antes)');
});

test('fase 6: los kg del bulto son los de la presentación del precio del DANE', () => {
  assert.equal(kgDePresentacion('50 kilogramos'), 50);
  assert.equal(kgDePresentacion('1 kilogramo'), 1);
  assert.equal(kgDePresentacion('9.5 kilogramos'), 9.5);
  assert.equal(kgDePresentacion('900 gramos'), 0.9);
  assert.equal(kgDePresentacion('1 litro'), undefined, 'un líquido no tiene kg');
  const veinticinco = { ...urea, precios: [precio('Cundinamarca', 90000)].map(p => ({ ...p, presentacion: '25 kilogramos' })) };
  const p = productoDesdeReferencia(veinticinco, 'Cundinamarca');
  assert.equal(p.presentacionKg, 25, 'el catálogo dice 50 kg, pero el precio es del bulto de 25 kg');
  assert.equal(productoDesdeReferencia(veinticinco).presentacionKg, 50, 'sin precio se conserva la del catálogo');
});

test('revisión: el precio del DANE se vuelve a ofrecer solo si es un mes más reciente del mismo departamento', () => {
  const deBoyaca = { registroIca: '9001', ...datosDePrecio({ precio: precio('Boyacá', 150000) }) };
  const conBoyaca = { ...urea, precios: [...urea.precios, precio('Boyacá', 150000)] };
  assert.equal(precioDaneParaProducto(deBoyaca, [conBoyaca], 'Cundinamarca'), undefined, 'lotes en otro departamento: no se cambia de un lado a otro');
  const septiembre = { ...urea, precios: [precio('Cundinamarca', 140000, '2026-09')] };
  const daneOctubre = { registroIca: '9001', ...datosDePrecio({ precio: precio('Cundinamarca', 160000) }) };
  assert.equal(precioDaneParaProducto(daneOctubre, [septiembre], 'Cundinamarca'), undefined, 'una copia de referencias más vieja no ofrece un mes anterior');
  const elegidoAMano = { registroIca: '9001', ...datosDePrecio({ precio: precio('Huila', 170000) }) };
  assert.equal(precioDaneParaProducto(elegidoAMano, [urea], 'Cundinamarca'), undefined, 'un departamento elegido a mano en el catálogo se respeta');
});
