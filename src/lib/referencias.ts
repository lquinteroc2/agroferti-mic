/**
 * Referencias técnicas guardadas en la nube (tabla `referencias` de D1): fertilizantes comerciales
 * registrados ante el ICA con su precio de referencia DANE-SIPSA, y reglas de dosis por cultivo
 * según el análisis de suelo, cada una con su fuente publicada. La app las descarga y las guarda en
 * el dispositivo para usarlas sin internet. Nunca se aplican solas: el usuario decide.
 *
 * Todo lo que llega se verifica: una referencia con la estructura equivocada se descarta.
 */
import type { ContenidoDeclarado } from '../types.ts';
import { esObjeto, validarFecha } from './validacion.ts';
import { validarFilaContenido } from './validacionPlan.ts';

export interface PrecioReferencia {
  departamento: string;
  precioPromedioCop: number;
  /** Presentación tal como la publica el DANE (p. ej. "Bulto x 50 kg"). */
  presentacion: string;
  /** Mes del precio, AAAA-MM. */
  periodo: string;
}

export interface FertilizanteReferencia {
  id: string;
  nombre: string;
  empresa: string;
  registroIca: string;
  estadoRegistro: string;
  /** Composición garantizada tal como la publica el ICA. */
  composicionTexto: string;
  contenido: ContenidoDeclarado[];
  presentacionKg?: number;
  precios: PrecioReferencia[];
  /** "ok" o "por verificar: motivo". */
  verificacion: string;
  /** Cita de dónde salen los datos (registro ICA y precios DANE). */
  fuente: string;
}

export interface FuenteReferencia {
  titulo: string;
  autores?: string;
  anio?: number;
  url: string;
  paginaImpresa?: string;
  paginaPdf?: number;
  tabla?: string;
  licencia?: string;
  /** oficial-colombia | academica-colombia | andina | internacional */
  tipo: string;
}

export interface ReglaDosis {
  id: string;
  cultivo: string;
  region: string | null;
  condicion: { nutriente: string | null; metodo: string | null; unidad: string | null; min: number | null; max: number | null };
  recomendacion: Array<{ forma: string; minKgHa: number; maxKgHa: number }>;
  notas: string;
  fuente: FuenteReferencia;
  transcripcion: string;
  verificacion: string;
}

export interface NivelSuelo {
  id: string;
  cultivo: string;
  nutriente: string;
  metodo: string | null;
  unidad: string | null;
  /** Rangos con su nombre (bajo, medio, alto…); los límites null significan "sin límite". */
  rangos: Array<{ nivel: string; min: number | null; max: number | null }>;
  fuente: FuenteReferencia;
  transcripcion: string;
  verificacion: string;
}

export interface ConjuntoReferencias {
  /** Cambia cada vez que se actualizan las referencias en la nube. */
  version: string;
  fertilizantes: FertilizanteReferencia[];
  reglasDosis: ReglaDosis[];
  niveles: NivelSuelo[];
}

const texto = (v: unknown): v is string => typeof v === 'string';
const numero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numeroONulo = (v: unknown): v is number | null => v === null || numero(v);
const textoONulo = (v: unknown): v is string | null => v === null || texto(v);

function leerFuente(v: unknown): FuenteReferencia | null {
  if (!esObjeto(v) || !texto(v.titulo) || !v.titulo.trim() || !texto(v.url) || !texto(v.tipo)) return null;
  return {
    titulo: v.titulo, url: v.url, tipo: v.tipo,
    autores: texto(v.autores) ? v.autores : undefined,
    anio: numero(v.anio) ? v.anio : undefined,
    paginaImpresa: texto(v.paginaImpresa) ? v.paginaImpresa : undefined,
    paginaPdf: numero(v.paginaPdf) ? v.paginaPdf : undefined,
    tabla: texto(v.tabla) ? v.tabla : undefined,
    licencia: texto(v.licencia) ? v.licencia : undefined
  };
}

/** Un fertilizante de referencia válido, o null. El contenido debe pasar las mismas reglas del catálogo. */
export function leerFertilizante(v: unknown): FertilizanteReferencia | null {
  if (!esObjeto(v)) return null;
  const { id, nombre, empresa, registroIca, estadoRegistro, composicionTexto, verificacion, fuente } = v;
  if (![id, nombre, empresa, registroIca, estadoRegistro, composicionTexto, verificacion, fuente].every(texto)) return null;
  if (!Array.isArray(v.contenido) || v.contenido.length === 0) return null;
  const contenido: ContenidoDeclarado[] = [];
  for (const c of v.contenido) {
    if (!esObjeto(c) || !texto(c.elemento) || !texto(c.forma) || !numero(c.porcentaje)) return null;
    const r = validarFilaContenido({ elemento: c.elemento, forma: c.forma, porcentaje: String(c.porcentaje).replace('.', ','), elementoLibre: false, formaLibre: false });
    contenido.push(r.ok ? r.valor : { elemento: c.elemento, forma: c.forma, porcentaje: c.porcentaje });
    if (!(c.porcentaje > 0 && c.porcentaje <= 100)) return null;
  }
  const precios: PrecioReferencia[] = Array.isArray(v.precios)
    ? v.precios.filter((p): p is PrecioReferencia => esObjeto(p) && texto(p.departamento) && numero(p.precioPromedioCop) && p.precioPromedioCop > 0
      && texto(p.presentacion) && texto(p.periodo) && /^\d{4}-\d{2}$/.test(p.periodo))
    : [];
  return {
    id: id as string, nombre: nombre as string, empresa: empresa as string, registroIca: registroIca as string,
    estadoRegistro: estadoRegistro as string, composicionTexto: composicionTexto as string, contenido,
    presentacionKg: numero(v.presentacionKg) && v.presentacionKg > 0 ? v.presentacionKg : undefined,
    precios, verificacion: verificacion as string, fuente: fuente as string
  };
}

export function leerReglaDosis(v: unknown): ReglaDosis | null {
  if (!esObjeto(v) || !texto(v.id) || !texto(v.cultivo) || !textoONulo(v.region) || !esObjeto(v.condicion)) return null;
  const c = v.condicion;
  if (!textoONulo(c.nutriente) || !textoONulo(c.metodo) || !textoONulo(c.unidad) || !numeroONulo(c.min) || !numeroONulo(c.max)) return null;
  if (!Array.isArray(v.recomendacion) || v.recomendacion.length === 0) return null;
  const recomendacion = [];
  for (const r of v.recomendacion) {
    if (!esObjeto(r) || !texto(r.forma) || !numero(r.minKgHa) || !numero(r.maxKgHa) || r.minKgHa < 0 || r.maxKgHa < r.minKgHa) return null;
    recomendacion.push({ forma: r.forma, minKgHa: r.minKgHa, maxKgHa: r.maxKgHa });
  }
  const fuente = leerFuente(v.fuente);
  if (!fuente || !texto(v.transcripcion) || !texto(v.verificacion)) return null;
  return {
    id: v.id, cultivo: v.cultivo, region: v.region,
    condicion: { nutriente: c.nutriente, metodo: c.metodo, unidad: c.unidad, min: c.min, max: c.max },
    recomendacion, notas: texto(v.notas) ? v.notas : '', fuente, transcripcion: v.transcripcion, verificacion: v.verificacion
  };
}

export function leerNivelSuelo(v: unknown): NivelSuelo | null {
  if (!esObjeto(v) || !texto(v.id) || !texto(v.cultivo) || !texto(v.nutriente) || !textoONulo(v.metodo) || !textoONulo(v.unidad)) return null;
  if (!Array.isArray(v.rangos) || v.rangos.length === 0) return null;
  const rangos = [];
  for (const r of v.rangos) {
    if (!esObjeto(r) || !texto(r.nivel) || !numeroONulo(r.min) || !numeroONulo(r.max)) return null;
    rangos.push({ nivel: r.nivel, min: r.min, max: r.max });
  }
  const fuente = leerFuente(v.fuente);
  if (!fuente || !texto(v.transcripcion) || !texto(v.verificacion)) return null;
  return { id: v.id, cultivo: v.cultivo, nutriente: v.nutriente, metodo: v.metodo, unidad: v.unidad, rangos, fuente, transcripcion: v.transcripcion, verificacion: v.verificacion };
}

/** Conjunto de referencias recibido de la nube o guardado en el dispositivo. Lo inválido se descarta. */
export function leerConjunto(v: unknown): ConjuntoReferencias | null {
  if (!esObjeto(v) || !texto(v.version)) return null;
  const lista = <T,>(x: unknown, leer: (y: unknown) => T | null): T[] => (Array.isArray(x) ? x.map(leer).filter((y): y is T => y !== null) : []);
  return {
    version: v.version,
    fertilizantes: lista(v.fertilizantes, leerFertilizante),
    reglasDosis: lista(v.reglasDosis, leerReglaDosis),
    niveles: lista(v.niveles, leerNivelSuelo)
  };
}

/** Último día del mes AAAA-MM (fecha del precio de un promedio mensual). */
export function finDeMes(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number);
  const dia = new Date(anio, mes, 0).getDate();
  const fecha = `${periodo}-${String(dia).padStart(2, '0')}`;
  return validarFecha(fecha, 'Fecha').ok ? fecha : '';
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombreMes = (periodo: string) => {
  const [anio, mes] = periodo.split('-').map(Number);
  return MESES[mes - 1] ? `${MESES[mes - 1]} de ${anio}` : periodo;
};

/** Datos con que se llena el formulario de producto a partir de una referencia (el usuario puede cambiarlos). */
export function productoDesdeReferencia(f: FertilizanteReferencia, departamento?: string) {
  const precio = departamento ? f.precios.find(p => p.departamento === departamento) : undefined;
  return {
    nombre: f.nombre,
    contenido: f.contenido.map(c => ({ ...c })),
    presentacionKg: f.presentacionKg,
    // El promedio del DANE puede traer decimales; un precio de bulto se escribe en pesos enteros.
    precioPresentacionCop: precio ? Math.round(precio.precioPromedioCop) : undefined,
    fechaPrecio: precio ? finDeMes(precio.periodo) : undefined,
    registroIca: f.registroIca,
    fuentePrecio: precio ? `Precio promedio DANE-SIPSA, ${precio.departamento}, ${nombreMes(precio.periodo)}` : undefined
  };
}

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Resumen de la composición para listas: "N 18 · P₂O₅ 46". */
export const resumenComposicion = (f: FertilizanteReferencia) =>
  f.contenido.map(c => `${c.forma} ${String(c.porcentaje).replace('.', ',')}`).join(' · ');

/**
 * Busca en el catálogo de referencia por nombre, empresa, registro ICA o grado ("urea", "dap",
 * "15-15-15", "yara"). Todas las palabras deben aparecer. Primero los que tienen precio del DANE
 * (los más vendidos) y los verificados.
 */
export function buscarFertilizantes(lista: ReadonlyArray<FertilizanteReferencia>, texto: string, limite = 20): FertilizanteReferencia[] {
  const palabras = sinTildes(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const encontrados = lista.filter(f => {
    const donde = sinTildes(`${f.nombre} ${f.empresa} ${f.registroIca} ${resumenComposicion(f)}`);
    return palabras.every(p => donde.includes(p));
  });
  const puntaje = (f: FertilizanteReferencia) => (f.precios.length ? 2 : 0) + (f.verificacion === 'ok' ? 1 : 0);
  return encontrados.sort((a, b) => puntaje(b) - puntaje(a) || a.nombre.localeCompare(b.nombre)).slice(0, limite);
}

/**
 * Fertilizantes del catálogo que aportan una forma química (p. ej. P₂O₅), para cubrir una meta.
 * Orden: primero los que tienen precio del DANE (se consiguen en el mercado y se puede estimar el
 * costo), luego los verificados y, entre ellos, los de mayor concentración de esa forma. Solo ordena
 * lo que declara el registro: no es una recomendación agronómica.
 */
export function fertilizantesQueAportan(lista: ReadonlyArray<FertilizanteReferencia>, forma: string, limite = 5): FertilizanteReferencia[] {
  const porcentaje = (f: FertilizanteReferencia) => f.contenido.find(c => c.forma === forma)?.porcentaje ?? 0;
  return lista
    .filter(f => porcentaje(f) > 0)
    .sort((a, b) => Number(b.precios.length > 0) - Number(a.precios.length > 0)
      || Number(b.verificacion === 'ok') - Number(a.verificacion === 'ok')
      || porcentaje(b) - porcentaje(a)
      || a.nombre.localeCompare(b.nombre))
    .slice(0, limite);
}

/** Departamento con precio DANE que aparece en la ubicación del lote ("Ventaquemada, Boyacá" → "Boyacá"), o undefined. */
export function departamentoDeUbicacion(f: FertilizanteReferencia, ubicacion?: string): string | undefined {
  if (!ubicacion?.trim()) return undefined;
  const donde = sinTildes(ubicacion);
  return f.precios.find(p => donde.includes(sinTildes(p.departamento)))?.departamento;
}

export interface FiltroCatalogo {
  /** Palabras del nombre, la empresa, el registro o la composición ("urea", "15-15-15", "yara"). */
  texto?: string;
  /** Formas químicas que debe aportar el producto (todas), p. ej. ['P₂O₅', 'K₂O']. */
  formas?: string[];
  soloConPrecio?: boolean;
}

/**
 * Catálogo completo filtrado para explorarlo. Orden: con precio del DANE, verificados y, si se pide
 * una sola forma química, mayor concentración; si no, por nombre.
 */
export function filtrarCatalogo(lista: ReadonlyArray<FertilizanteReferencia>, filtro: FiltroCatalogo): FertilizanteReferencia[] {
  const palabras = sinTildes(filtro.texto ?? '').split(/\s+/).filter(Boolean);
  const formas = filtro.formas ?? [];
  const porcentaje = (f: FertilizanteReferencia, forma: string) => f.contenido.find(c => c.forma === forma)?.porcentaje ?? 0;
  return lista
    .filter(f => !filtro.soloConPrecio || f.precios.length > 0)
    .filter(f => formas.every(forma => porcentaje(f, forma) > 0))
    .filter(f => {
      if (!palabras.length) return true;
      const donde = sinTildes(`${f.nombre} ${f.empresa} ${f.registroIca} ${resumenComposicion(f)} ${f.composicionTexto}`);
      return palabras.every(p => donde.includes(p));
    })
    .sort((a, b) => Number(b.precios.length > 0) - Number(a.precios.length > 0)
      || Number(b.verificacion === 'ok') - Number(a.verificacion === 'ok')
      || (formas.length === 1 ? porcentaje(b, formas[0]) - porcentaje(a, formas[0]) : 0)
      || a.nombre.localeCompare(b.nombre));
}
