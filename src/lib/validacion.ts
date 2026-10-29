/**
 * Validaciones PURAS para el registro de lotes (área) y de análisis de suelo (fase 2).
 * No interpretan resultados ni sugieren dosis: solo verifican formato, unidades y rangos físicos/numéricos.
 * Las importaciones entre módulos de `lib` llevan extensión .ts para que las pruebas de Node las resuelvan.
 */
import type {
  AnalisisVerificado,
  NutrienteLeido,
  NutrienteReportado,
  ProblemaDato,
  UnidadNutriente
} from '../types';
import { buscarElemento, coherenciaNutriente } from './catalogoNutrientes.ts';
import { equivalenciasAnalisis } from './calculos.ts';

export const UNIDADES_NUTRIENTE: ReadonlyArray<UnidadNutriente> = ['mg/kg', 'cmol(+)/kg'];

/** Límite de la app para revisar listas (no agronómico): evita bloquear el teléfono con listas dañadas enormes. */
export const MAX_RESULTADOS = 500;

/** Campos que esta versión conoce. Cualquier otro se conserva intacto al editar. */
export const CAMPOS_ANALISIS: ReadonlySet<string> = new Set([
  'id', 'loteId', 'fechaAnalisis', 'profundidadCm', 'densidadGcm3', 'areaM2AlRegistro', 'laboratorio',
  'metodoLaboratorio', 'ph', 'nutrientes', 'nutrientesMgKg', 'observaciones', 'createdAt', 'updatedAt'
]);
const CAMPOS_NUTRIENTE: ReadonlySet<string> = new Set(['elemento', 'forma', 'valor', 'unidad']);

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

export function esUnidadValida(unidad: string): unidad is UnidadNutriente {
  return (UNIDADES_NUTRIENTE as ReadonlyArray<string>).includes(unidad);
}

const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

type Interpretacion =
  | { estado: 'vacio' }
  | { estado: 'invalido' }
  | { estado: 'subdesbordamiento' }
  | { estado: 'ok'; valor: number };

/**
 * Lectura estricta de números escritos por el productor: coma o punto decimal ("1,2" o "1.2")
 * y notación científica opcional ("1,5e-3", "1e-21"). Rechaza separadores de miles y cualquier
 * otro símbolo. Detecta valores distintos de cero que JavaScript convertiría en 0.
 */
export function interpretarDecimal(texto: string): Interpretacion {
  const limpio = texto.trim();
  if (!limpio) return { estado: 'vacio' };
  const partes = /^-?(\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.exec(limpio);
  if (!partes) return { estado: 'invalido' };
  const valor = Number(limpio.replace(',', '.'));
  if (valor === 0 && /[1-9]/.test(partes[1])) return { estado: 'subdesbordamiento' };
  return { estado: 'ok', valor };
}

/** Vacío => null; texto no numérico o irrepresentable => NaN. */
export function parsearDecimal(texto: string): number | null {
  const r = interpretarDecimal(texto);
  return r.estado === 'vacio' ? null : r.estado === 'ok' ? r.valor : Number.NaN;
}

interface OpcionesNumero {
  requerido?: boolean;
  /** Si es true, el valor debe ser mayor que cero; si no, se acepta cero. */
  positivo?: boolean;
  max?: number;
}

/**
 * Reglas comunes a formulario y lectura de IndexedDB. Devuelve el motivo (sin punto final) o null.
 * El tope MAX_SAFE_INTEGER es numérico, no agronómico.
 */
export function comprobarNumero(valor: number, { positivo = false, max }: OpcionesNumero = {}): string | null {
  if (Number.isNaN(valor)) return 'no es un número válido';
  if (valor < 0) return 'no puede ser negativo';
  if (!Number.isFinite(valor) || valor > Number.MAX_SAFE_INTEGER) return 'es demasiado grande para calcular con precisión';
  if (positivo && valor === 0) return 'debe ser mayor que cero';
  if (max !== undefined && valor > max) return `debe estar entre 0 y ${max}`;
  return null;
}

/** Valida un número opcional o requerido escrito por el productor. Vacío y no requerido => undefined. */
export function validarNumero(texto: string, opciones: OpcionesNumero & { campo: string }): Resultado<number | undefined> {
  const { campo, requerido = false } = opciones;
  const lectura = interpretarDecimal(texto);
  if (lectura.estado === 'vacio') {
    return requerido ? { ok: false, error: `${campo}: este dato es obligatorio.` } : { ok: true, valor: undefined };
  }
  if (lectura.estado === 'invalido') {
    return { ok: false, error: `${campo}: escribe solo un número, por ejemplo 1,2 (sin puntos de miles).` };
  }
  if (lectura.estado === 'subdesbordamiento') {
    return { ok: false, error: `${campo}: es demasiado pequeño para guardarlo con precisión; se perdería como cero.` };
  }
  const error = comprobarNumero(lectura.valor, opciones);
  return error ? { ok: false, error: `${campo}: ${error}.` } : { ok: true, valor: lectura.valor };
}

/** Límites de la app para el área del lote (no agronómicos): los mismos que tenía el campo de la fase 1. */
export const AREA_LOTE_MIN_M2 = 0.01;
export const AREA_LOTE_MAX_M2 = 10_000_000_000;

/** Área del lote en m², escrita con coma o punto decimal como el resto de formularios. */
export function validarAreaLote(texto: string): Resultado<number> {
  const lectura = validarNumero(texto, { campo: 'Área', requerido: true, positivo: true });
  if (!lectura.ok) return lectura;
  const valor = lectura.valor as number; // requerido: nunca es undefined
  if (valor < AREA_LOTE_MIN_M2) return { ok: false, error: 'Área: debe ser de al menos 0,01 m².' };
  if (valor > AREA_LOTE_MAX_M2) return { ok: false, error: 'Área: supera un valor razonable para esta aplicación; revisa el dato.' };
  return { ok: true, valor };
}

/** Fecha local del dispositivo en formato AAAA-MM-DD. */
export function fechaLocalISO(fecha: Date = new Date()): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/** Fecha AAAA-MM-DD existente en el calendario. Si se indica `hoy`, tampoco puede ser futura. */
export function validarFechaAnalisis(texto: string, hoy?: Date): Resultado<string> {
  const valor = texto.trim();
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!partes) return { ok: false, error: 'Fecha del análisis: escribe una fecha válida.' };
  const [anio, mes, dia] = partes.slice(1).map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  if (fecha.getFullYear() !== anio || fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) {
    return { ok: false, error: 'Fecha del análisis: esa fecha no existe en el calendario.' };
  }
  if (hoy && valor > fechaLocalISO(hoy)) return { ok: false, error: 'Fecha del análisis: no puede ser una fecha futura.' };
  return { ok: true, valor };
}

/** Texto tal como lo escribe el productor en el formulario. */
export interface EntradaNutriente {
  elemento: string;
  forma: string;
  valor: string;
  unidad: string;
  /** Eligió "Otro / No reconocido" como elemento: elemento y forma son texto libre. */
  elementoLibre: boolean;
  /** Eligió una forma fuera de la lista del elemento: la forma es texto libre. */
  formaLibre: boolean;
  /** Fila cargada de un registro guardado: si queda vacía no se omite en silencio. */
  existente?: boolean;
}

export interface EntradaAnalisis {
  fechaAnalisis: string;
  profundidadCm: string;
  densidadGcm3: string;
  ph: string;
  laboratorio: string;
  metodoLaboratorio: string;
  nutrientes: EntradaNutriente[];
  observaciones: string;
}

/** Datos listos para guardar. El repositorio añade id, lote, área histórica y fechas de control. */
export interface DatosAnalisis {
  fechaAnalisis: string;
  profundidadCm: number;
  densidadGcm3?: number;
  ph?: number;
  laboratorio?: string;
  metodoLaboratorio?: string;
  nutrientes: NutrienteReportado[];
  observaciones?: string;
}

export type ErroresAnalisis = Partial<Record<'fechaAnalisis' | 'profundidadCm' | 'densidadGcm3' | 'ph', string>> & {
  nutrientes?: Record<number, string>;
  general?: string[];
};

export function filaNutrienteVacia(fila: EntradaNutriente): boolean {
  return !fila.elemento.trim() && !fila.forma.trim() && !fila.valor.trim();
}

/** Conserva el valor y la unidad originales: nunca convierte cmol(+)/kg a mg/kg ni P a P₂O₅. */
export function validarNutriente(fila: EntradaNutriente): Resultado<NutrienteReportado> {
  const elemento = fila.elemento.trim();
  const forma = fila.forma.trim();
  if (!elemento) return { ok: false, error: 'Elige el elemento o escríbelo en "Otro / No reconocido".' };
  if (!fila.elementoLibre && !buscarElemento(elemento)) {
    return { ok: false, error: 'Elige un elemento de la lista o la opción "Otro / No reconocido".' };
  }
  if (!forma) return { ok: false, error: 'Indica la forma química tal como aparece en el informe (por ejemplo, P o P₂O₅).' };
  const coherencia = coherenciaNutriente(elemento, forma);
  if (coherencia.error) return { ok: false, error: `${coherencia.error}. Revisa el informe del laboratorio.` };
  if (!fila.elementoLibre && !fila.formaLibre && !coherencia.reconocido) {
    return { ok: false, error: 'Elige una forma de la lista o la opción "Otra forma / No reconocida".' };
  }
  if (!esUnidadValida(fila.unidad)) return { ok: false, error: 'Unidad no válida: usa mg/kg o cmol(+)/kg.' };
  const valor = validarNumero(fila.valor, { campo: 'Valor', requerido: true });
  if (!valor.ok) return valor;
  return { ok: true, valor: { elemento, forma, valor: valor.valor as number, unidad: fila.unidad } };
}

export function validarAnalisis(
  entrada: EntradaAnalisis,
  hoy: Date = new Date()
): { ok: true; datos: DatosAnalisis } | { ok: false; errores: ErroresAnalisis } {
  const errores: ErroresAnalisis = {};
  const fecha = validarFechaAnalisis(entrada.fechaAnalisis, hoy);
  if (!fecha.ok) errores.fechaAnalisis = fecha.error;
  const profundidad = validarNumero(entrada.profundidadCm, { campo: 'Profundidad', requerido: true, positivo: true });
  if (!profundidad.ok) errores.profundidadCm = profundidad.error;
  const densidad = validarNumero(entrada.densidadGcm3, { campo: 'Densidad aparente', positivo: true });
  if (!densidad.ok) errores.densidadGcm3 = densidad.error;
  const ph = validarNumero(entrada.ph, { campo: 'pH', max: 14 });
  if (!ph.ok) errores.ph = ph.error;

  const nutrientes: NutrienteReportado[] = [];
  for (let indice = 0; indice < entrada.nutrientes.length; indice++) {
    const fila = entrada.nutrientes[indice];
    if (!fila) continue;
    if (filaNutrienteVacia(fila)) {
      // Una fila nueva vacía se ignora; una fila que ya estaba guardada no se borra en silencio.
      if (fila.existente) (errores.nutrientes ??= {})[indice] = 'Este resultado ya estaba guardado y quedó vacío: complétalo o usa "Quitar".';
      continue;
    }
    const resultado = validarNutriente(fila);
    if (resultado.ok) nutrientes.push(resultado.valor);
    else (errores.nutrientes ??= {})[indice] = resultado.error;
  }

  if (!fecha.ok || !profundidad.ok || !densidad.ok || !ph.ok || errores.nutrientes) return { ok: false, errores };
  const datos: DatosAnalisis = {
    fechaAnalisis: fecha.valor,
    profundidadCm: profundidad.valor as number,
    densidadGcm3: densidad.valor,
    ph: ph.valor,
    laboratorio: entrada.laboratorio.trim() || undefined,
    metodoLaboratorio: entrada.metodoLaboratorio.trim() || undefined,
    nutrientes,
    observaciones: entrada.observaciones.trim() || undefined
  };
  // Misma comprobación que se hace antes de persistir: detecta cálculos que se desbordan.
  const final = validarDatosAnalisis(datos, { hoy });
  return final.ok ? final : { ok: false, errores: { general: final.errores } };
}

/** Representación legible de un valor guardado, incluso NaN, null o estructuras extrañas. */
export function describirValor(valor: unknown): string {
  try {
    if (valor === undefined) return '(vacío)';
    if (typeof valor === 'number' || typeof valor === 'boolean' || typeof valor === 'bigint') return String(valor);
    if (typeof valor === 'string') return `"${valor}"`;
    if (Array.isArray(valor) && valor.length > 20) return `(lista de ${valor.length} posiciones)`;
    const texto = JSON.stringify(valor) ?? String(valor);
    return texto.length > 300 ? `${texto.slice(0, 300)}…` : texto;
  } catch {
    return '(valor no representable)';
  }
}

/** Texto para precargar el formulario con el valor dañado (solo si es texto o número). */
function textoEditable(valor: unknown): string | undefined {
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number') return String(valor);
  return undefined;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const ausente = (v: unknown) => v === undefined || v === null;

function verificarNutriente(crudo: unknown, hueco: boolean): NutrienteLeido {
  const original = hueco ? '(posición vacía)' : describirValor(crudo);
  if (hueco) return { elemento: '', forma: '', original, problema: 'Posición vacía en la lista de resultados.' };
  if (crudo === undefined) return { elemento: '', forma: '', original, problema: 'El resultado guardado no tiene valor (undefined).' };
  if (crudo === null) return { elemento: '', forma: '', original, problema: 'El resultado guardado está vacío (null).' };
  if (!esObjeto(crudo)) {
    return { elemento: '', forma: '', original, problema: 'El resultado guardado no tiene la estructura esperada.' };
  }
  const fallas: string[] = [];
  const elemento = typeof crudo.elemento === 'string' ? crudo.elemento.trim() : '';
  const forma = typeof crudo.forma === 'string' ? crudo.forma.trim() : '';
  if (!elemento) fallas.push('falta el elemento');
  if (!forma) fallas.push('falta la forma química');
  let valor: number | undefined;
  if (typeof crudo.valor !== 'number') fallas.push('el valor no es un número');
  else {
    const error = comprobarNumero(crudo.valor);
    if (error) fallas.push(`el valor ${error}`);
    else valor = crudo.valor;
  }
  const unidad = typeof crudo.unidad === 'string' && esUnidadValida(crudo.unidad) ? crudo.unidad : undefined;
  if (!unidad) fallas.push('la unidad no es mg/kg ni cmol(+)/kg');
  const coherencia = elemento && forma ? coherenciaNutriente(elemento, forma) : { reconocido: false, error: undefined };
  if (coherencia.error) fallas.push(coherencia.error);
  const extras = Object.keys(crudo).filter(k => !CAMPOS_NUTRIENTE.has(k));
  const leido: NutrienteLeido = { elemento, forma, valor, unidad, reconocido: coherencia.reconocido, original };
  if (fallas.length) leido.problema = `${mayuscula(fallas.join('; '))}.`;
  if (valor === undefined) {
    const texto = textoEditable(crudo.valor);
    if (texto !== undefined) leido.valorTexto = texto;
  }
  if (extras.length) {
    leido.advertencia = `Tiene campos adicionales que esta versión no edita (${extras.join(', ')}); se descartarán si guardas este resultado.`;
  }
  return leido;
}

/**
 * Verifica un registro leído de IndexedDB sin lanzar errores ni modificarlo.
 * Distingue datos ausentes (campo `undefined` sin problema) de inválidos (campo `undefined`
 * con un `ProblemaDato` que conserva el valor original para que el productor lo corrija).
 */
export function verificarAnalisis(registro: unknown): AnalisisVerificado {
  try {
    return verificarSinProteccion(registro);
  } catch {
    return {
      id: '', loteId: '', nutrientes: [], camposAdicionales: [],
      problemas: [{ campo: 'registro', etiqueta: 'Registro', detalle: 'No se pudo leer el registro guardado.', valorOriginal: describirValor(registro) }]
    };
  }
}

function verificarSinProteccion(registro: unknown): AnalisisVerificado {
  const problemas: ProblemaDato[] = [];
  const r = esObjeto(registro) ? registro : {};
  if (r !== registro) {
    problemas.push({ campo: 'registro', etiqueta: 'Registro', detalle: 'El registro guardado no tiene la estructura esperada.', valorOriginal: describirValor(registro) });
  }
  const anotar = (campo: string, etiqueta: string, detalle: string) => {
    const problema: ProblemaDato = { campo, etiqueta, detalle, valorOriginal: describirValor(r[campo]) };
    const texto = textoEditable(r[campo]);
    if (texto !== undefined) problema.textoEditable = texto;
    problemas.push(problema);
  };

  const numero = (campo: string, etiqueta: string, opciones: OpcionesNumero): number | undefined => {
    const v = r[campo];
    if (ausente(v)) {
      if (opciones.requerido) anotar(campo, etiqueta, 'Dato obligatorio ausente.');
      return undefined;
    }
    if (typeof v !== 'number') {
      anotar(campo, etiqueta, 'No es un número.');
      return undefined;
    }
    const error = comprobarNumero(v, opciones);
    if (error) {
      anotar(campo, etiqueta, `${mayuscula(error)}.`);
      return undefined;
    }
    return v;
  };
  const texto = (campo: string, etiqueta: string): string | undefined => {
    const v = r[campo];
    if (ausente(v)) return undefined;
    if (typeof v === 'string') return v.trim() || undefined;
    anotar(campo, etiqueta, 'No es un texto.');
    return undefined;
  };

  const id = typeof r.id === 'string' ? r.id : '';
  const loteId = typeof r.loteId === 'string' ? r.loteId : '';
  if (!loteId) anotar('loteId', 'Lote', 'El registro no indica a qué lote pertenece.');

  let fechaAnalisis: string | undefined;
  if (ausente(r.fechaAnalisis)) anotar('fechaAnalisis', 'Fecha del análisis', 'Dato obligatorio ausente.');
  else if (typeof r.fechaAnalisis === 'string' && validarFechaAnalisis(r.fechaAnalisis).ok) fechaAnalisis = r.fechaAnalisis.trim();
  else anotar('fechaAnalisis', 'Fecha del análisis', 'No es una fecha válida (AAAA-MM-DD).');

  // Recorrido explícito por índice: map/forEach omitirían las posiciones vacías de un array disperso.
  const nutrientes: NutrienteLeido[] = [];
  const revisarLista = (lista: ReadonlyArray<unknown>) => {
    for (let i = 0; i < lista.length; i++) nutrientes.push(verificarNutriente(lista[i], !(i in lista)));
  };
  if (Array.isArray(r.nutrientes)) {
    if (r.nutrientes.length > MAX_RESULTADOS) {
      anotar('nutrientes', 'Nutrientes', `La lista tiene ${r.nutrientes.length} posiciones; supera las ${MAX_RESULTADOS} que la app puede revisar.`);
    } else revisarLista(r.nutrientes);
  } else if (!ausente(r.nutrientes)) anotar('nutrientes', 'Nutrientes', 'La lista de resultados no tiene la estructura esperada.');
  else if (esObjeto(r.nutrientesMgKg)) {
    // Estructura reservada en fase 1: se lee como mg/kg sin alterar los valores guardados.
    const entradas = Object.entries(r.nutrientesMgKg);
    if (entradas.length > MAX_RESULTADOS) anotar('nutrientesMgKg', 'Nutrientes (formato anterior)', 'Tiene demasiados resultados para revisarlos.');
    else revisarLista(entradas.map(([elemento, valor]) => ({ elemento, forma: elemento, valor, unidad: 'mg/kg' })));
  } else if (!ausente(r.nutrientesMgKg)) anotar('nutrientesMgKg', 'Nutrientes (formato anterior)', 'No tiene la estructura esperada.');

  nutrientes.forEach((n, i) => {
    const detalle = [n.problema, n.advertencia].filter(Boolean).join(' ');
    if (detalle) {
      problemas.push({ campo: `nutrientes.${i}`, etiqueta: `Resultado ${i + 1}${n.elemento ? ` (${n.elemento})` : ''}`, detalle, valorOriginal: n.original ?? '' });
    }
  });

  return {
    id,
    loteId,
    fechaAnalisis,
    profundidadCm: numero('profundidadCm', 'Profundidad', { requerido: true, positivo: true }),
    densidadGcm3: numero('densidadGcm3', 'Densidad aparente', { positivo: true }),
    areaM2AlRegistro: numero('areaM2AlRegistro', 'Área histórica', { positivo: true }),
    ph: numero('ph', 'pH', { max: 14 }),
    laboratorio: texto('laboratorio', 'Laboratorio'),
    metodoLaboratorio: texto('metodoLaboratorio', 'Método de análisis'),
    observaciones: texto('observaciones', 'Observaciones'),
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : undefined,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : undefined,
    nutrientes,
    problemas,
    camposAdicionales: Object.keys(r).filter(k => !CAMPOS_ANALISIS.has(k))
  };
}

/**
 * Última barrera antes de persistir: revalida la estructura (aunque venga del formulario),
 * rechaza fechas futuras y cálculos que se desbordan con el área que se guardará.
 * Nunca lanza errores. Devuelve solo los campos admitidos.
 */
export function validarDatosAnalisis(
  datos: unknown,
  opciones: { hoy?: Date; areaM2?: number } = {}
): { ok: true; datos: DatosAnalisis } | { ok: false; errores: string[] } {
  try {
    return validarDatosSinProteccion(datos, opciones);
  } catch {
    return { ok: false, errores: ['Los datos del análisis no tienen la estructura esperada.'] };
  }
}

function validarDatosSinProteccion(
  datos: unknown,
  { hoy = new Date(), areaM2 }: { hoy?: Date; areaM2?: number }
): { ok: true; datos: DatosAnalisis } | { ok: false; errores: string[] } {
  if (!esObjeto(datos)) return { ok: false, errores: ['Los datos del análisis no tienen la estructura esperada.'] };
  const v = verificarAnalisis({ ...datos, id: 'validacion', loteId: 'validacion', areaM2AlRegistro: areaM2 });
  const errores = v.problemas.map(p => `${p.etiqueta}: ${p.detalle}`);
  if (!Array.isArray(datos.nutrientes) && !v.problemas.some(p => p.campo === 'nutrientes')) {
    errores.push('Nutrientes: la lista de resultados no es válida.');
  }
  if (v.fechaAnalisis && v.fechaAnalisis > fechaLocalISO(hoy)) errores.push('Fecha del análisis: no puede ser una fecha futura.');
  if (errores.length === 0) {
    const eq = equivalenciasAnalisis(v);
    if (!eq.masaKgHa.ok && eq.masaKgHa.motivo === 'desbordamiento') errores.push(eq.masaKgHa.mensaje);
    if (!eq.areaHa.ok && eq.areaHa.motivo === 'desbordamiento') errores.push(eq.areaHa.mensaje);
    for (const n of eq.nutrientes) {
      if (n.estado === 'suspendida' && eq.masaKgHa.ok) errores.push(`${n.nutriente.elemento}: ${n.mensaje}`);
      if (n.estado === 'calculada' && !n.kgLote.ok && n.kgLote.motivo === 'desbordamiento') errores.push(`${n.nutriente.elemento}: ${n.kgLote.mensaje}`);
    }
  }
  if (errores.length) return { ok: false, errores };
  const nutrientes: NutrienteReportado[] = [];
  for (const n of v.nutrientes) nutrientes.push({ elemento: n.elemento, forma: n.forma, valor: n.valor as number, unidad: n.unidad as UnidadNutriente });
  return {
    ok: true,
    datos: {
      fechaAnalisis: v.fechaAnalisis as string,
      profundidadCm: v.profundidadCm as number,
      densidadGcm3: v.densidadGcm3,
      ph: v.ph,
      laboratorio: v.laboratorio,
      metodoLaboratorio: v.metodoLaboratorio,
      nutrientes,
      observaciones: v.observaciones
    }
  };
}

export interface EstadoDocumentacion {
  documentado: boolean;
  pendientes: string[];
  /** Hay resultados de nutrientes sin método de laboratorio. */
  trazabilidadPendiente: boolean;
}

/**
 * "Análisis documentado" solo si no hay datos por corregir, hay laboratorio y método, y existe
 * al menos un resultado VÁLIDO (nutriente con valor y unidad, o pH). Una lista vacía o con
 * huecos no cuenta como resultados.
 */
export function estadoDocumentacion(a: AnalisisVerificado): EstadoDocumentacion {
  const lista = Array.from(a.nutrientes ?? []);
  const validos = lista.filter(n => n && !n.problema && n.valor !== undefined && n.unidad !== undefined).length;
  const pendientes: string[] = [];
  const trazabilidadPendiente = lista.length > 0 && !a.metodoLaboratorio;
  if ((a.problemas ?? []).length || lista.some(n => !n)) pendientes.push('Hay datos guardados que deben corregirse.');
  if (!a.laboratorio) pendientes.push('Falta el nombre del laboratorio.');
  if (trazabilidadPendiente) pendientes.push('Trazabilidad pendiente: hay resultados de nutrientes sin método de laboratorio.');
  else if (!a.metodoLaboratorio) pendientes.push('Falta el método de análisis.');
  if (validos === 0 && a.ph === undefined) pendientes.push('No hay resultados de laboratorio válidos registrados.');
  return { documentado: pendientes.length === 0, pendientes, trazabilidadPendiente };
}

/** Más reciente primero; desempate por fecha de creación y luego por id. Fechas inválidas al final. */
export function ordenarAnalisis<T extends Pick<AnalisisVerificado, 'id' | 'fechaAnalisis' | 'createdAt'>>(lista: T[]): T[] {
  const desc = (a = '', b = '') => (a < b ? 1 : a > b ? -1 : 0);
  return [...lista].sort((a, b) =>
    desc(a.fechaAnalisis, b.fechaAnalisis) || desc(a.createdAt, b.createdAt) || desc(a.id, b.id));
}
