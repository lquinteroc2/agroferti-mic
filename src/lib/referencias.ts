/**
 * Referencias técnicas guardadas en la nube (tabla `referencias` de D1): fertilizantes comerciales
 * registrados ante el ICA con su precio de referencia DANE-SIPSA, y reglas de dosis por cultivo
 * según el análisis de suelo, cada una con su fuente publicada. La app las descarga y las guarda en
 * el dispositivo para usarlas sin internet. Nunca se aplican solas: el usuario decide.
 *
 * Todo lo que llega se verifica: una referencia con la estructura equivocada se descarta.
 */
import { CAPITALES, DEPARTAMENTOS_COLOMBIA } from './departamentos.ts';
import { conversionEntre } from './conversionFormas.ts';
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
  /** Más datos del registro del ICA, tal como los publica (todos opcionales). */
  detalle?: DetalleRegistro;
}

export interface DetalleRegistro {
  /** "Fertilizante inorgánico · simple N". */
  clase?: string;
  /** Presentación física: granulado, polvo, líquido… */
  tipo?: string;
  /** Uso registrado: suelo, fertirriego, foliar. */
  uso?: string;
  cultivos?: string;
  /** Dosis que el fabricante registró ante el ICA (la de la etiqueta). */
  dosisRegistrada?: string;
  aplicacion?: string;
  fabricante?: string;
  importador?: string;
  distribuidor?: string;
  /** País o países de origen. */
  origen?: string;
  /** Fecha del registro, como la publica el ICA (d/mm/aa). */
  fechaRegistro?: string;
  /** Empaques registrados. */
  presentaciones?: string;
}

const CAMPOS_DETALLE: ReadonlyArray<keyof DetalleRegistro> = ['clase', 'tipo', 'uso', 'cultivos', 'dosisRegistrada', 'aplicacion', 'fabricante', 'importador', 'distribuidor', 'origen', 'fechaRegistro', 'presentaciones'];

/** Solo textos no vacíos y de largo razonable; lo demás se descarta. */
function leerDetalle(v: unknown): DetalleRegistro | undefined {
  if (!esObjeto(v)) return undefined;
  const detalle: DetalleRegistro = {};
  for (const campo of CAMPOS_DETALLE) {
    const valor = v[campo];
    if (texto(valor) && valor.trim() && valor.length <= 400) detalle[campo] = valor.trim();
  }
  return Object.keys(detalle).length ? detalle : undefined;
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
    precios, verificacion: verificacion as string, fuente: fuente as string,
    ...(leerDetalle(v.detalle) ? { detalle: leerDetalle(v.detalle) } : {})
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

/**
 * Datos con que se llena el formulario de producto a partir de una referencia (el usuario puede
 * cambiarlos). `sinPrecioEn`: departamento del lote donde el DANE no publica el precio (se usó el de
 * `departamento`, el más cercano que sí lo publica); queda dicho en la fuente del precio.
 */
export function productoDesdeReferencia(f: FertilizanteReferencia, departamento?: string, sinPrecioEn?: string) {
  const precio = departamento ? f.precios.find(p => p.departamento === departamento) : undefined;
  return {
    nombre: f.nombre,
    contenido: f.contenido.map(c => ({ ...c })),
    presentacionKg: f.presentacionKg,
    // Con precio, los kg del bulto son los de la presentación que publica el DANE.
    ...(precio ? datosDePrecio({ precio, sinPrecioEn }) : { precioPresentacionCop: undefined, fechaPrecio: undefined, fuentePrecio: undefined }),
    registroIca: f.registroIca
  };
}

/** Precio del DANE elegido para un departamento. `sinPrecioEn`: el departamento pedido, si el precio es de otro. */
export interface PrecioElegido {
  precio: PrecioReferencia;
  sinPrecioEn?: string;
}

/** Largo máximo de la fuente del precio de un producto (igual que en la validación del producto). */
const MAX_FUENTE = 120;

/** Kg de una presentación del DANE ("50 kilogramos" → 50, "900 gramos" → 0,9); undefined si no es en peso (litros). */
export function kgDePresentacion(presentacion: string): number | undefined {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(kilogramos?|kg|gramos?|g)\s*$/i.exec(presentacion);
  if (!m) return undefined;
  const n = Number(m[1].replace(',', '.'));
  if (!(n > 0)) return undefined;
  return /^k/i.test(m[2]) ? n : Math.round(n) / 1000;
}

/**
 * Campos de precio de un producto tomados del DANE (pesos enteros, fecha de fin de mes y fuente). El
 * precio es de la presentación que publica el DANE, así que también se toman sus kg: un precio de
 * bulto de 25 kg con un bulto de 50 kg daría un costo por kg equivocado.
 */
export function datosDePrecio({ precio, sinPrecioEn }: PrecioElegido) {
  const base = `Precio promedio DANE-SIPSA, ${precio.departamento}, ${nombreMes(precio.periodo)}`;
  const conAviso = sinPrecioEn ? `${base} (no se publica en ${sinPrecioEn})` : base;
  const kg = kgDePresentacion(precio.presentacion);
  return {
    ...(kg !== undefined ? { presentacionKg: kg } : {}),
    // El promedio del DANE puede traer decimales; un precio de bulto se escribe en pesos enteros.
    precioPresentacionCop: Math.round(precio.precioPromedioCop),
    fechaPrecio: finDeMes(precio.periodo),
    fuentePrecio: conAviso.length <= MAX_FUENTE ? conAviso : sinPrecioEn ? `${base} (de otro departamento)`.slice(0, MAX_FUENTE) : base.slice(0, MAX_FUENTE)
  };
}

/** Distancia aproximada entre las capitales de dos departamentos (en grados; solo sirve para comparar). */
function distancia(a: string, b: string): number {
  const pa = CAPITALES[a], pb = CAPITALES[b];
  if (!pa || !pb) return Infinity;
  const dy = pa[0] - pb[0];
  const dx = (pa[1] - pb[1]) * Math.cos(((pa[0] + pb[0]) / 2) * Math.PI / 180);
  return Math.hypot(dx, dy);
}

/**
 * Precio del DANE para un fertilizante en un departamento: el de ese departamento o, si el DANE no
 * lo publica allí, el del departamento más cercano (por la distancia entre capitales) que sí lo
 * publica, con `sinPrecioEn` para decirlo. Sin departamento o sin precios, undefined.
 */
export function precioParaDepartamento(f: FertilizanteReferencia, departamento?: string): PrecioElegido | undefined {
  const nombre = departamento?.trim() ? departamentoConocido(departamento) : undefined;
  if (!nombre || !f.precios.length) return undefined;
  const propio = f.precios.find(p => sinTildes(p.departamento) === sinTildes(nombre));
  if (propio) return { precio: propio };
  const cercano = [...f.precios]
    .map(p => ({ p, d: distancia(nombre, departamentoConocido(p.departamento) ?? p.departamento) }))
    .filter(x => Number.isFinite(x.d))
    // A igual distancia (Bogotá y Cundinamarca comparten capital) se prefiere el departamento sobre el distrito.
    .sort((a, b) => a.d - b.d || Number(a.p.departamento === 'Bogotá, D.C.') - Number(b.p.departamento === 'Bogotá, D.C.') || a.p.departamento.localeCompare(b.p.departamento))[0];
  return cercano ? { precio: cercano.p, sinPrecioEn: nombre } : undefined;
}

/** Nombre del departamento tal como está en la lista (sin importar tildes ni mayúsculas), o undefined. */
function departamentoConocido(nombre: string): string | undefined {
  const clave = sinTildes(nombre.trim());
  return DEPARTAMENTOS_COLOMBIA.find(d => sinTildes(d) === clave) ?? (clave === 'bogota' ? 'Bogotá, D.C.' : undefined);
}

/** Departamento del lote: el elegido o, si no se eligió, el que se lea en la ubicación escrita. */
export function departamentoNombrado(lote: { departamento?: string; ubicacion?: string }): string | undefined {
  if (lote.departamento?.trim()) return departamentoConocido(lote.departamento) ?? lote.departamento.trim();
  if (!lote.ubicacion?.trim()) return undefined;
  const donde = sinTildes(lote.ubicacion);
  return NOMBRES_DEPARTAMENTO.find(n => contienePalabras(donde, n.clave))?.departamento;
}

/** Departamento más frecuente entre los lotes (para los productos, que sirven para todos los lotes). */
export function departamentoPreferido(lotes: ReadonlyArray<{ departamento?: string; ubicacion?: string }>): string | undefined {
  const cuenta = new Map<string, number>();
  for (const l of lotes) {
    const d = departamentoNombrado(l);
    if (d) cuenta.set(d, (cuenta.get(d) ?? 0) + 1);
  }
  return [...cuenta].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

/**
 * Precio del DANE que se puede ofrecer para un producto de "Mis productos" (por su registro ICA),
 * o undefined si no hay o si no hace falta. Con un producto sin precio se ofrece el del departamento
 * (o el más cercano). Con un precio del DANE, solo si es del mismo departamento y de un mes más
 * reciente (así no se alternan los precios de lotes en departamentos distintos ni se ofrece un mes
 * viejo). Un precio escrito por el productor (no viene del DANE) nunca se reemplaza.
 */
export function precioDaneParaProducto(
  producto: { registroIca?: string; precioPresentacionCop?: number; fechaPrecio?: string; fuentePrecio?: string },
  referencias: ReadonlyArray<FertilizanteReferencia>,
  departamento?: string
): PrecioElegido | undefined {
  if (!producto.registroIca) return undefined;
  const ref = referencias.find(r => r.registroIca === producto.registroIca);
  const eleccion = ref && precioParaDepartamento(ref, departamento);
  if (!eleccion) return undefined;
  if (producto.precioPresentacionCop === undefined) return eleccion;
  const deDane = /DANE-SIPSA, (.+?), [a-z]+ de \d{4}/.exec(producto.fuentePrecio ?? '');
  if (!deDane) return undefined;
  const mesProducto = producto.fechaPrecio?.slice(0, 7) ?? '';
  return eleccion.precio.departamento === deDane[1] && eleccion.precio.periodo > mesProducto ? eleccion : undefined;
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
 * costo), y entre ellos los que lo tienen en el departamento del lote; luego los verificados y, entre ellos, los de mayor concentración de esa forma. Solo ordena
 * lo que declara el registro: no es una recomendación agronómica.
 */
export function fertilizantesQueAportan(lista: ReadonlyArray<FertilizanteReferencia>, forma: string, limite = 5, departamento?: string, elemento?: string): FertilizanteReferencia[] {
  // Con el elemento de la meta también sirven los que declaran la otra forma del nutriente (P₂O₅ para
  // una meta en P); su concentración se compara ya convertida a la forma de la meta.
  const porcentaje = (f: FertilizanteReferencia) => {
    const igual = f.contenido.find(c => c.forma === forma);
    if (igual) return igual.porcentaje;
    if (!elemento) return 0;
    for (const c of f.contenido) {
      const conv = conversionEntre(c, { elemento, forma });
      if (conv) return c.porcentaje * conv.factor;
    }
    return 0;
  };
  // Con el departamento del lote, primero los que tienen precio allí; luego los que lo tienen en otro.
  const conPrecio = (f: FertilizanteReferencia) => {
    if (!f.precios.length) return 0;
    const eleccion = precioParaDepartamento(f, departamento);
    return eleccion && !eleccion.sinPrecioEn ? 2 : 1;
  };
  return lista
    .filter(f => porcentaje(f) > 0)
    .sort((a, b) => conPrecio(b) - conPrecio(a)
      || Number(b.verificacion === 'ok') - Number(a.verificacion === 'ok')
      || porcentaje(b) - porcentaje(a)
      || a.nombre.localeCompare(b.nombre))
    .slice(0, limite);
}

/** Departamento con precio DANE que aparece en la ubicación del lote ("Ventaquemada, Boyacá" → "Boyacá"), o undefined. */
export function departamentoDeUbicacion(f: FertilizanteReferencia, ubicacion?: string): string | undefined {
  if (!ubicacion?.trim()) return undefined;
  const donde = sinTildes(ubicacion);
  // Primero se reconoce el departamento del texto, con el nombre más largo que aparezca: "Norte de
  // Santander" se reconoce antes que "Santander". Después se busca el precio de ESE departamento.
  const nombrado = NOMBRES_DEPARTAMENTO.find(n => contienePalabras(donde, n.clave));
  if (nombrado) return f.precios.find(p => sinTildes(p.departamento) === sinTildes(nombrado.departamento))?.departamento;
  // Un nombre que no está en la lista (otra forma de escribirlo): se compara con los precios, el más largo primero.
  return [...f.precios].sort((a, b) => b.departamento.length - a.departamento.length)
    .find(p => contienePalabras(donde, sinTildes(p.departamento)))?.departamento;
}

/** El texto contiene esas palabras completas ("meta" no está en "metálica"). Ambos sin tildes ni mayúsculas. */
function contienePalabras(texto: string, palabras: string): boolean {
  const escapadas = palabras.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escapadas}($|[^a-z0-9])`).test(texto);
}

/** Nombres de departamento que se buscan en una ubicación escrita (con formas cortas comunes), del más largo al más corto. */
const NOMBRES_DEPARTAMENTO: ReadonlyArray<{ clave: string; departamento: string }> = [
  ...DEPARTAMENTOS_COLOMBIA.map(d => ({ clave: sinTildes(d), departamento: d })),
  // Forma corta sin riesgo de confundirse con un municipio de otro departamento.
  { clave: 'bogota', departamento: 'Bogotá, D.C.' }
].sort((a, b) => b.clave.length - a.clave.length);

/**
 * Departamento del lote con precio DANE para este fertilizante: el que se eligió en el lote (igual al
 * nombre del DANE) o, si no se eligió, el que se lea en la ubicación escrita.
 */
export function departamentoDelLote(f: FertilizanteReferencia, lote: { departamento?: string; ubicacion?: string }): string | undefined {
  if (lote.departamento?.trim()) {
    const clave = sinTildes(lote.departamento.trim());
    return f.precios.find(p => sinTildes(p.departamento) === clave)?.departamento;
  }
  return departamentoDeUbicacion(f, lote.ubicacion);
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
