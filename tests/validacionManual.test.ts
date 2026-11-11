/**
 * Fase 6: los casos de docs/VALIDACION_FASE6.md calculados A MANO, comprobados contra src/lib.
 * TODOS los datos de este archivo son de EJEMPLO (no son análisis, etiquetas, precios ni metas reales,
 * y no son recomendaciones de fertilización). Sirven para verificar la aritmética de la app.
 * Si una prueba falla, se anota en el registro de discrepancias del protocolo; no se corrige src/ sin confirmar.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { avancePlan, calcularPlan, costoRegistrado, equivalenciasAnalisis, type EntradaPlan, type ResultadoLineaPlan } from '../src/lib/calculos.ts';
import { formatearDiferencia, formatearExacto, formatearResultado, textoCostoRegistrado } from '../src/lib/formato.ts';
import { numeroSinAmbiguedad, validarAnalisis, validarAreaLote, validarNutriente, type EntradaAnalisis } from '../src/lib/validacion.ts';
import { validarMetaFormulario, type EntradaMeta } from '../src/lib/validacionPlan.ts';
import { validarAplicacionFormulario, type EntradaAplicacion } from '../src/lib/validacionSeguimiento.ts';
import type { CopiaProducto, MetaNutrimental } from '../src/types.ts';

const HOY = new Date(2026, 10, 11); // 11 nov 2026

/** Igualdad con tolerancia relativa de 1e-12: solo absorbe el error de representación binaria. */
const igual = (real: number, esperado: number, msg = '') =>
  assert.ok(Math.abs(real - esperado) <= Math.abs(esperado) * 1e-12, `${msg}: app ${real} ≠ manual ${esperado}`);

/** Formato de los resultados en pantalla: kg con 2 decimales, COP con 0, avance con 1, suelo con 4/0/3. */
const kg = (n: number) => formatearResultado(n, 2);
const cop = (n: number) => formatearResultado(n, 0);

const producto = (productoId: string, nombre: string, contenido: CopiaProducto['contenido'], presentacionKg: number, precio: number): CopiaProducto => ({
  productoId, nombre, contenido, presentacionKg, precioPresentacionCop: precio, fechaPrecio: '2026-11-01', esEjemplo: true
});
const meta = (id: string, elemento: string, forma: string, kgHa: number, cambios: Partial<MetaNutrimental> = {}): MetaNutrimental => ({
  id, elemento, forma, kgHa, fuente: 'Fuente técnica EJEMPLO (no real)', fechaFuente: '2026-10-01', esEjemplo: true, ...cambios
});
function calculada(r: ResultadoLineaPlan): Extract<ResultadoLineaPlan, { estado: 'calculada' }> {
  assert.equal(r.estado, 'calculada', r.estado === 'sin-calculo' ? r.mensaje : '');
  return r as Extract<ResultadoLineaPlan, { estado: 'calculada' }>;
}
const valor = (c: { ok: boolean; valor?: number }) => {
  assert.ok(c.ok, 'debía calcularse');
  return c.valor as number;
};

const DAP = producto('dap', 'DAP EJEMPLO', [{ elemento: 'Nitrógeno', forma: 'N', porcentaje: 18 }, { elemento: 'Fósforo', forma: 'P₂O₅', porcentaje: 46 }], 50, 145_000);
const KCL = producto('kcl', 'KCl EJEMPLO', [{ elemento: 'Potasio', forma: 'K₂O', porcentaje: 60 }], 50, 130_000);
const UREA = producto('urea', 'Urea EJEMPLO', [{ elemento: 'Nitrógeno', forma: 'N', porcentaje: 46 }], 50, 125_000);
const COMPUESTO = producto('c103010', 'Compuesto 10-30-10 EJEMPLO', [
  { elemento: 'Nitrógeno', forma: 'N', porcentaje: 10 },
  { elemento: 'Fósforo', forma: 'P₂O₅', porcentaje: 30 },
  { elemento: 'Potasio', forma: 'K₂O', porcentaje: 10 }
], 50, 152_000);

// ======================= CASO A — PAPA EJEMPLO (lote de 2500 m²) =======================

test('Caso A (papa EJEMPLO) · suelo: hectáreas, masa de suelo y mg/kg → kg/ha y lote', () => {
  const eq = equivalenciasAnalisis({
    profundidadCm: 20, densidadGcm3: 1.1, areaM2AlRegistro: 2500,
    nutrientes: [
      { elemento: 'Fósforo', forma: 'P', valor: 35, unidad: 'mg/kg' },
      { elemento: 'Potasio', forma: 'K', valor: 180, unidad: 'mg/kg' },
      { elemento: 'Potasio', forma: 'K⁺', valor: 0.45, unidad: 'cmol(+)/kg' }
    ]
  });
  // A1: 2500 ÷ 10.000 = 0,25 ha
  igual(valor(eq.areaHa), 0.25, 'A1 hectáreas');
  assert.equal(formatearResultado(valor(eq.areaHa), 4), '0,25');
  // A2: 10.000 × (20 ÷ 100) × (1,1 × 1.000) = 10.000 × 0,2 × 1.100 = 2.200.000 kg/ha
  igual(valor(eq.masaKgHa), 2_200_000, 'A2 masa de suelo');
  assert.equal(formatearResultado(valor(eq.masaKgHa), 0), '2.200.000');
  const [p, k, kCmol] = eq.nutrientes;
  assert.ok(p.estado === 'calculada' && k.estado === 'calculada');
  // A3: 35 × 2.200.000 ÷ 1.000.000 = 77 kg de P/ha ; A4: 77 × 2500 ÷ 10.000 = 19,25 kg de P en el lote
  igual(p.kgHa, 77, 'A3 P kg/ha');
  igual(valor(p.kgLote), 19.25, 'A4 P en el lote');
  assert.equal(formatearResultado(p.kgHa, 3), '77');
  assert.equal(formatearResultado(valor(p.kgLote), 3), '19,25');
  // A5: 180 × 2.200.000 ÷ 1.000.000 = 396 kg de K/ha ; A6: 396 × 0,25 = 99 kg de K en el lote
  igual(k.kgHa, 396, 'A5 K kg/ha');
  igual(valor(k.kgLote), 99, 'A6 K en el lote');
  // A7: K⁺ en cmol(+)/kg NO se convierte; la forma P sigue siendo P (no P₂O₅).
  assert.equal(kCmol.estado, 'no-convertible');
  assert.equal(p.nutriente.forma, 'P');
});

const planA: EntradaPlan = {
  areaM2AlCrear: 2500,
  metas: [meta('mp', 'Fósforo', 'P₂O₅', 120), meta('mk', 'Potasio', 'K₂O', 150), meta('mn', 'Nitrógeno', 'N', 100)],
  lineas: [{ id: 'l-dap', metaId: 'mp', producto: DAP }, { id: 'l-kcl', metaId: 'mk', producto: KCL }, { id: 'l-urea', metaId: 'mn', producto: UREA }]
};

test('Caso A (papa EJEMPLO) · plan: producto kg/ha, kg en el lote, bultos, precio por kg, costo y aportes', () => {
  const c = calcularPlan(planA);
  const [dap, kcl, urea] = c.lineas.map(calculada);

  // A8–A13 DAP (meta 120 kg/ha de P₂O₅, etiqueta P₂O₅ 46 %, N 18 %, bulto 50 kg a 145.000 COP)
  igual(dap.productoKgHa, 120 / 0.46, 'A8 DAP kg/ha'); // 260,869565…
  assert.equal(kg(dap.productoKgHa), '≈ 260,87');
  igual(valor(dap.productoKgLote), (120 / 0.46) * 2500 / 10_000, 'A9 DAP en el lote'); // 65,217391…
  assert.equal(kg(valor(dap.productoKgLote)), '≈ 65,22');
  igual(valor(dap.bultos), 65.21739130434783 / 50, 'A10 bultos DAP'); // 1,304347…
  assert.equal(formatearResultado(valor(dap.bultos), 2), '≈ 1,3');
  igual(valor(dap.precioKgCop), 2900, 'A11 COP/kg DAP');
  assert.equal(cop(valor(dap.precioKgCop)), '2.900');
  igual(valor(dap.costoCop), 87_000 / 0.46, 'A12 costo DAP'); // 189.130,43…
  assert.equal(cop(valor(dap.costoCop)), '≈ 189.130');
  const nDap = dap.aportes.find(a => a.forma === 'N');
  igual(valor(nDap!.kgHa), (120 / 0.46) * 0.18, 'A13 N acompañante del DAP'); // 46,956521…
  assert.equal(kg(valor(nDap!.kgHa)), '≈ 46,96');

  // A14–A17 KCl (meta 150 kg/ha de K₂O, K₂O 60 %, bulto 50 kg a 130.000 COP)
  igual(kcl.productoKgHa, 250, 'A14 KCl kg/ha');
  igual(valor(kcl.productoKgLote), 62.5, 'A15 KCl en el lote');
  igual(valor(kcl.bultos), 1.25, 'A16 bultos KCl');
  igual(valor(kcl.precioKgCop), 2600, 'A17 COP/kg KCl');
  igual(valor(kcl.costoCop), 162_500, 'A17 costo KCl');
  assert.equal(cop(valor(kcl.costoCop)), '162.500');

  // A18–A20 Urea (meta 100 kg/ha de N, N 46 %, bulto 50 kg a 125.000 COP)
  igual(urea.productoKgHa, 100 / 0.46, 'A18 Urea kg/ha'); // 217,391304…
  assert.equal(kg(urea.productoKgHa), '≈ 217,39');
  igual(valor(urea.productoKgLote), 25 / 0.46, 'A19 Urea en el lote'); // 54,347826…
  assert.equal(kg(valor(urea.productoKgLote)), '≈ 54,35');
  igual(valor(urea.bultos), (25 / 0.46) / 50, 'A19 bultos Urea'); // 1,086956…
  assert.equal(formatearResultado(valor(urea.bultos), 2), '≈ 1,09');
  igual(valor(urea.costoCop), 62_500 / 0.46, 'A20 costo Urea'); // 135.869,56…
  assert.equal(cop(valor(urea.costoCop)), '≈ 135.870');
});

test('Caso A (papa EJEMPLO) · resumen por forma química y costo total', () => {
  const c = calcularPlan(planA);
  const forma = (f: string) => c.resumen.find(r => r.forma === f)!;
  // A21: P₂O₅ y K₂O aportan exactamente su meta: diferencia 0.
  igual(valor(forma('P₂O₅').aportadoKgHa), 120, 'A21 P₂O₅ aportado');
  assert.equal(valor(forma('P₂O₅').diferenciaKgHa!), 0);
  assert.equal(valor(forma('K₂O').diferenciaKgHa!), 0);
  // A22: N = 46,956… (DAP) + 100 (Urea) = 146,956… ; diferencia = +46,956…
  igual(valor(forma('N').aportadoKgHa), 100 + (120 / 0.46) * 0.18, 'A22 N aportado');
  assert.equal(kg(valor(forma('N').aportadoKgHa)), '≈ 146,96');
  igual(valor(forma('N').diferenciaKgHa!), (120 / 0.46) * 0.18, 'A22 N aportado − meta');
  assert.equal(formatearDiferencia(valor(forma('N').diferenciaKgHa!)).signo, 1);
  assert.match(formatearDiferencia(valor(forma('N').diferenciaKgHa!)).texto, /46,96/);
  assert.ok(c.resumen.every(r => !r.incompleto));
  // A23: 189.130,43… + 162.500 + 135.869,56… = 487.500 COP
  igual(valor(c.costoTotalCop), 487_500, 'A23 costo total');
  assert.equal(cop(valor(c.costoTotalCop)), '487.500');
});

test('Caso A (papa EJEMPLO) · redondear antes de multiplicar NO coincide: la app usa el valor completo', () => {
  const dap = calculada(calcularPlan(planA).lineas[0]);
  // Error típico del cálculo manual: 65,22 (redondeado) × 2.900 = 189.138, no 189.130.
  assert.notEqual(Math.round(65.22 * 2900), Math.round(valor(dap.costoCop)));
  assert.equal(Math.round(valor(dap.costoCop)), 189_130);
});

test('Caso A (papa EJEMPLO) · plan frente a lo aplicado (aplicaciones parciales)', () => {
  const apps = [
    { lineaId: 'l-dap', cantidadKg: 30, costoCop: 87_000 },
    { lineaId: 'l-dap', cantidadKg: 20 },
    { lineaId: 'l-kcl', cantidadKg: 62.5 }
  ];
  const [dap, kcl, urea] = avancePlan(planA, apps);
  // A24 DAP: aplicado 30 + 20 = 50 kg ; 50 − 65,2173… = −15,2173… ; 50 ÷ 65,2173… × 100 = 76,666… %
  igual(valor(dap.aplicadoKg), 50, 'A24 DAP aplicado');
  igual(valor(dap.diferenciaKg!), 50 - 30 / 0.46, 'A24 DAP aplicado − planeado');
  assert.equal(formatearDiferencia(valor(dap.diferenciaKg!)).texto, '≈ -15,22');
  igual(valor(dap.porcentaje!), 50 / (30 / 0.46) * 100, 'A24 avance DAP');
  assert.equal(formatearResultado(valor(dap.porcentaje!), 1), '≈ 76,7');
  // A25: en la forma de la meta: 50 × 10.000 ÷ 2500 = 200 kg/ha de DAP × 46 ÷ 100 = 92 kg/ha de P₂O₅
  igual(valor(dap.aplicadoFormaKgHa!), 92, 'A25 P₂O₅ aplicado');
  // A26 KCl: 62,5 de 62,5 kg → diferencia 0, avance 100 %, 150 kg/ha de K₂O
  assert.equal(valor(kcl.diferenciaKg!), 0);
  igual(valor(kcl.porcentaje!), 100, 'A26 avance KCl');
  igual(valor(kcl.aplicadoFormaKgHa!), 150, 'A26 K₂O aplicado');
  // Urea sin aplicaciones: aplicado 0 kg.
  assert.equal(valor(urea.aplicadoKg), 0);
  // A27: costo registrado = solo lo escrito: 87.000 COP y 1 aplicación sin costo.
  const costo = costoRegistrado(apps.filter(a => a.lineaId === 'l-dap'));
  assert.equal(textoCostoRegistrado(costo, 2), '87.000 COP (1 aplicación sin costo registrado)');
});

// ======================= CASO B — ARVEJA EJEMPLO (lote de 800 m²) =======================

test('Caso B (arveja EJEMPLO) · suelo: equivalencias y cmol(+)/kg sin convertir', () => {
  const eq = equivalenciasAnalisis({
    profundidadCm: 15, densidadGcm3: 1.3, areaM2AlRegistro: 800,
    nutrientes: [
      { elemento: 'Fósforo', forma: 'P', valor: 12.5, unidad: 'mg/kg' },
      { elemento: 'Calcio', forma: 'Ca²⁺', valor: 2.1, unidad: 'cmol(+)/kg' }
    ]
  });
  igual(valor(eq.areaHa), 0.08, 'B1 hectáreas'); // 800 ÷ 10.000
  assert.equal(formatearResultado(valor(eq.areaHa), 4), '0,08');
  igual(valor(eq.masaKgHa), 1_950_000, 'B2 masa de suelo'); // 10.000 × 0,15 × 1.300
  const [p, ca] = eq.nutrientes;
  assert.ok(p.estado === 'calculada');
  igual(p.kgHa, 24.375, 'B3 P kg/ha'); // 12,5 × 1.950.000 ÷ 1.000.000
  assert.equal(formatearResultado(p.kgHa, 3), '24,375');
  igual(valor(p.kgLote), 1.95, 'B4 P en el lote'); // 24,375 × 800 ÷ 10.000
  assert.equal(ca.estado, 'no-convertible');
});

const planB: EntradaPlan = {
  areaM2AlCrear: 800,
  metas: [meta('mp', 'Fósforo', 'P₂O₅', 60)],
  lineas: [{ id: 'l-c', metaId: 'mp', producto: COMPUESTO }]
};

test('Caso B (arveja EJEMPLO) · plan con un compuesto 10-30-10 y aportes acompañantes sin meta', () => {
  const c = calcularPlan(planB);
  const l = calculada(c.lineas[0]);
  igual(l.productoKgHa, 200, 'B5 kg/ha'); // 60 ÷ 0,30
  igual(valor(l.productoKgLote), 16, 'B6 en el lote'); // 200 × 800 ÷ 10.000
  igual(valor(l.bultos), 0.32, 'B7 bultos'); // 16 ÷ 50
  assert.equal(formatearResultado(valor(l.bultos), 2), '0,32');
  igual(valor(l.precioKgCop), 3040, 'B8 COP/kg'); // 152.000 ÷ 50
  igual(valor(l.costoCop), 48_640, 'B9 costo'); // 16 × 3.040
  assert.equal(cop(valor(l.costoCop)), '48.640');
  const aporte = (f: string) => valor(l.aportes.find(a => a.forma === f)!.kgHa);
  igual(aporte('N'), 20, 'B10 N acompañante'); // 200 × 10 ÷ 100
  igual(aporte('K₂O'), 20, 'B10 K₂O acompañante');
  // Resumen: N y K₂O sin meta → diferencia "—" (no se calcula).
  const n = c.resumen.find(r => r.forma === 'N')!;
  assert.equal(n.metaKgHa, undefined);
  assert.equal(n.diferenciaKgHa, undefined);
  igual(valor(c.costoTotalCop), 48_640, 'B11 costo total');
});

test('Caso B (arveja EJEMPLO) · una aplicación igual a lo planeado', () => {
  const [a] = avancePlan(planB, [{ lineaId: 'l-c', cantidadKg: 16 }]);
  assert.equal(valor(a.diferenciaKg!), 0);
  assert.equal(formatearDiferencia(valor(a.diferenciaKg!)).texto, '0');
  igual(valor(a.porcentaje!), 100, 'B12 avance');
  igual(valor(a.aplicadoFormaKgHa!), 60, 'B13 P₂O₅ aplicado'); // 16 × 10.000 ÷ 800 × 30 ÷ 100
});

// ======================= CASOS LÍMITE: la app debe rechazar o no calcular =======================

test('Límite L1: meta en P con etiqueta en P₂O₅ → no calcula ni convierte', () => {
  const c = calcularPlan({ areaM2AlCrear: 2500, metas: [meta('mp', 'Fósforo', 'P', 52)], lineas: [{ id: 'l', metaId: 'mp', producto: DAP }] });
  const r = c.lineas[0];
  assert.equal(r.estado, 'sin-calculo');
  assert.ok(r.estado === 'sin-calculo' && r.motivo === 'forma-distinta');
  assert.equal(c.costoTotalCop.ok, false);
  // Lo mismo con K frente a K₂O.
  const k = calcularPlan({ areaM2AlCrear: 2500, metas: [meta('mk', 'Potasio', 'K', 125)], lineas: [{ id: 'l', metaId: 'mk', producto: KCL }] });
  assert.ok(k.lineas[0].estado === 'sin-calculo' && k.lineas[0].motivo === 'forma-distinta');
});

test('Límite L2: análisis sin densidad aparente → se guarda, pero no calcula masa ni kg/ha', () => {
  const entrada: EntradaAnalisis = {
    fechaAnalisis: '2026-10-20', profundidadCm: '20', densidadGcm3: '', ph: '', laboratorio: 'Laboratorio EJEMPLO',
    metodoLaboratorio: 'Método EJEMPLO', observaciones: '',
    nutrientes: [{ elemento: 'Fósforo', forma: 'P', valor: '35', unidad: 'mg/kg', elementoLibre: false, formaLibre: false }]
  };
  const r = validarAnalisis(entrada, HOY);
  assert.ok(r.ok);
  const eq = equivalenciasAnalisis({ ...r.datos, areaM2AlRegistro: 2500 });
  assert.ok(!eq.masaKgHa.ok && eq.masaKgHa.motivo === 'falta-dato');
  assert.equal(eq.nutrientes[0].estado, 'suspendida');
});

test('Límite L3: cmol(+)/kg nunca se convierte a kg/ha', () => {
  const eq = equivalenciasAnalisis({
    profundidadCm: 20, densidadGcm3: 1.1, areaM2AlRegistro: 2500,
    nutrientes: [{ elemento: 'Magnesio', forma: 'Mg²⁺', valor: 1.2, unidad: 'cmol(+)/kg' }]
  });
  assert.equal(eq.nutrientes[0].estado, 'no-convertible');
});

test('Límite L4: "1.500" ambiguo se rechaza en área, meta y kg aplicados', () => {
  assert.equal(validarAreaLote('1.500').ok, false);
  assert.equal(validarAreaLote('1,500').ok, false);
  assert.deepEqual(validarAreaLote('1500'), { ok: true, valor: 1500 });
  const fila: EntradaMeta = {
    id: 'm', elemento: 'Fósforo', forma: 'P₂O₅', elementoLibre: false, formaLibre: false, kgHa: '1.200',
    fuente: 'Fuente EJEMPLO', fechaFuente: '2026-10-01', origen: 'ejemplo', productoId: ''
  };
  assert.equal(validarMetaFormulario(fila, HOY).ok, false);
  const aplicacion: EntradaAplicacion = { fecha: '2026-11-10', cantidadKg: '1.500', costoCop: '', responsable: '', nota: '', origen: 'ejemplo' };
  const r = validarAplicacionFormulario(aplicacion, { planId: 'p', lineaId: 'l', productoNombre: 'DAP EJEMPLO' }, HOY);
  assert.ok(!r.ok && /dos formas/.test(r.errores.cantidadKg ?? ''));
});

test('Límite L7: "1.500" en el valor del laboratorio o en la profundidad se rechaza; editar no lo vuelve ambiguo', () => {
  const nutriente = (valor: string) => ({ elemento: 'Hierro', forma: 'Fe', elementoLibre: false, formaLibre: false, valor, unidad: 'mg/kg' as const });
  for (const escrito of ['1.500', '1,500']) {
    const r = validarNutriente(nutriente(escrito));
    assert.ok(!r.ok && /dos formas/.test(r.error), `valor ${escrito}`);
  }
  assert.ok(validarNutriente(nutriente('1500')).ok);
  assert.ok(validarNutriente(nutriente('0,500')).ok, '0,500 no es ambiguo');
  assert.ok(validarNutriente(nutriente('12,5')).ok);
  // Un valor guardado como 1,125 se precarga como "1,1250": se vuelve a guardar igual, sin rechazo.
  assert.equal(numeroSinAmbiguedad(1.125), '1,1250');
  const editado = validarNutriente(nutriente(numeroSinAmbiguedad(1.125)));
  assert.ok(editado.ok && editado.valor.valor === 1.125);
  const analisis = validarAnalisis({
    fechaAnalisis: '2026-11-01', profundidadCm: '1.000', densidadGcm3: '', ph: '', laboratorio: '', metodoLaboratorio: '', observaciones: '', nutrientes: []
  }, HOY);
  assert.ok(!analisis.ok && /dos formas/.test(analisis.errores.profundidadCm ?? ''));
});

test('Límite L5: fechas futuras se rechazan (análisis, fuente de la meta y aplicación)', () => {
  const entrada: EntradaAnalisis = {
    fechaAnalisis: '2026-11-12', profundidadCm: '20', densidadGcm3: '1,1', ph: '', laboratorio: '', metodoLaboratorio: '', observaciones: '', nutrientes: []
  };
  const a = validarAnalisis(entrada, HOY);
  assert.ok(!a.ok && /futura/.test(a.errores.fechaAnalisis ?? ''));
  const fila: EntradaMeta = {
    id: 'm', elemento: 'Fósforo', forma: 'P₂O₅', elementoLibre: false, formaLibre: false, kgHa: '120',
    fuente: 'Fuente EJEMPLO', fechaFuente: '2026-11-12', origen: 'ejemplo', productoId: ''
  };
  const m = validarMetaFormulario(fila, HOY);
  assert.ok(!m.ok && /futura/.test(m.error));
  const ap = validarAplicacionFormulario(
    { fecha: '2026-11-12', cantidadKg: '10', costoCop: '', responsable: '', nota: '', origen: 'ejemplo' },
    { planId: 'p', lineaId: 'l', productoNombre: 'DAP EJEMPLO' }, HOY
  );
  assert.ok(!ap.ok && /futura/.test(ap.errores.fecha ?? ''));
});

test('Límite L6: meta sin fuente técnica o sin fecha → no se calcula ninguna cantidad', () => {
  for (const cambios of [{ fuente: '' }, { fechaFuente: '' }]) {
    const c = calcularPlan({ areaM2AlCrear: 2500, metas: [meta('mp', 'Fósforo', 'P₂O₅', 120, cambios)], lineas: [{ id: 'l', metaId: 'mp', producto: DAP }] });
    assert.ok(c.lineas[0].estado === 'sin-calculo' && c.lineas[0].motivo === 'falta-dato');
  }
});

test('Datos ingresados se muestran completos, sin "≈"', () => {
  assert.equal(formatearExacto(1500.5), '1.500,5');
  assert.equal(formatearExacto(2500), '2.500');
  assert.equal(formatearExacto(0.45), '0,45');
});
