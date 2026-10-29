/**
 * Validaciones PURAS de la fase 3: productos según su etiqueta y planes de fertilización.
 * No proponen metas, productos ni dosis: revisan estructura, formas químicas, números y fechas.
 * Las metas las escribe el usuario con su fuente técnica; la app solo hace la aritmética.
 */
import type {
  CambioEstadoPlan,
  ContenidoDeclarado,
  CopiaProducto,
  EstadoPlan,
  LineaPlan,
  MetaNutrimental,
  PlanFertilizacion,
  PlanVerificado,
  ProblemaDato,
  ProductoFertilizante,
  ProductoVerificado
} from '../types';
import { calcularPlan } from './calculos.ts';
import { buscarElemento, coherenciaNutriente, mismaForma } from './catalogoNutrientes.ts';
import {
  ausente,
  comprobarNumero,
  describirValor,
  esObjeto,
  fechaLocalISO,
  MAX_RESULTADOS,
  mayuscula,
  validarFecha,
  validarNumero,
  validarNumeroSinAmbiguedad,
  type Resultado
} from './validacion.ts';

export const ESTADOS_PLAN: ReadonlyArray<EstadoPlan> = ['propuesta', 'revisado', 'aprobado'];

/** Cambios de estado permitidos. Un plan aprobado no cambia: se copia como nueva propuesta. */
export const TRANSICIONES_PLAN: Readonly<Record<EstadoPlan, ReadonlyArray<EstadoPlan>>> = {
  propuesta: ['revisado'],
  revisado: ['propuesta', 'aprobado'],
  aprobado: []
};

const CAMPOS_PRODUCTO: ReadonlySet<string> = new Set([
  'id', 'nombre', 'contenido', 'presentacionKg', 'precioPresentacionCop', 'fechaPrecio', 'esEjemplo', 'createdAt', 'updatedAt'
]);
const CAMPOS_PLAN: ReadonlySet<string> = new Set([
  'id', 'loteId', 'nombre', 'areaM2AlCrear', 'analisisReferenciaId', 'planOrigenId', 'metas', 'lineas', 'estado',
  'historial', 'createdAt', 'updatedAt'
]);

/** Producto listo para guardar. El repositorio añade id y fechas de control. */
export type DatosProducto = Omit<ProductoFertilizante, 'id' | 'createdAt' | 'updatedAt'>;
/** Parte editable de un plan. El repositorio añade lote, área, estado, historial y fechas de control. */
export type DatosPlan = Pick<PlanFertilizacion, 'nombre' | 'analisisReferenciaId' | 'metas' | 'lineas'>;

export type ResultadoValidacion<T> = { ok: true; datos: T } | { ok: false; errores: string[] };

/**
 * Lectores de campos que anotan cada dato inválido en `problemas` con su valor original.
 * `ruta` y `contexto` ubican el dato dentro de listas (p. ej. "metas.0." y "Meta 1").
 */
function lector(r: Record<string, unknown>, problemas: ProblemaDato[], ruta = '', contexto = '') {
  const nota = (campo: string, etiqueta: string, detalle: string) => {
    problemas.push({
      campo: ruta + campo,
      etiqueta: contexto ? `${contexto} · ${etiqueta}` : etiqueta,
      detalle,
      valorOriginal: describirValor(r[campo])
    });
  };
  const texto = (campo: string, etiqueta: string, requerido = false): string | undefined => {
    const v = r[campo];
    if (ausente(v)) {
      if (requerido) nota(campo, etiqueta, 'Dato obligatorio ausente.');
      return undefined;
    }
    if (typeof v !== 'string') {
      nota(campo, etiqueta, 'No es un texto.');
      return undefined;
    }
    if (requerido && !v.trim()) nota(campo, etiqueta, 'Dato obligatorio vacío.');
    return v.trim() || undefined;
  };
  const numero = (campo: string, etiqueta: string, opciones: { requerido?: boolean; positivo?: boolean; max?: number } = {}) => {
    const v = r[campo];
    if (ausente(v)) {
      if (opciones.requerido) nota(campo, etiqueta, 'Dato obligatorio ausente.');
      return undefined;
    }
    if (typeof v !== 'number') {
      nota(campo, etiqueta, 'No es un número.');
      return undefined;
    }
    const error = comprobarNumero(v, opciones);
    if (error) {
      nota(campo, etiqueta, `${mayuscula(error)}.`);
      return undefined;
    }
    return v;
  };
  const fecha = (campo: string, etiqueta: string, requerido = false): string | undefined => {
    const v = r[campo];
    if (ausente(v)) {
      if (requerido) nota(campo, etiqueta, 'Dato obligatorio ausente.');
      return undefined;
    }
    if (typeof v === 'string' && validarFecha(v, etiqueta).ok) return v.trim();
    nota(campo, etiqueta, 'No es una fecha válida (AAAA-MM-DD).');
    return undefined;
  };
  const booleano = (campo: string, etiqueta: string): boolean | undefined => {
    if (typeof r[campo] === 'boolean') return r[campo] as boolean;
    nota(campo, etiqueta, 'Debe indicar sí o no.');
    return undefined;
  };
  /** Lista con tope de tamaño. Ausente y no requerida => lista vacía. */
  const lista = (campo: string, etiqueta: string, requerido = false): ReadonlyArray<unknown> | undefined => {
    const v = r[campo];
    if (ausente(v)) {
      if (requerido) nota(campo, etiqueta, 'Dato obligatorio ausente.');
      return requerido ? undefined : [];
    }
    if (!Array.isArray(v)) {
      nota(campo, etiqueta, 'La lista no tiene la estructura esperada.');
      return undefined;
    }
    if (v.length > MAX_RESULTADOS) {
      nota(campo, etiqueta, `La lista tiene ${v.length} posiciones; supera las ${MAX_RESULTADOS} que la app puede revisar.`);
      return undefined;
    }
    return v;
  };
  return { nota, texto, numero, fecha, booleano, lista };
}

/** Recorre por índice: map/forEach omitirían las posiciones vacías de un array disperso. */
function recorrer(
  lista: ReadonlyArray<unknown>,
  problemas: ProblemaDato[],
  ruta: string,
  contexto: (i: number) => string,
  leer: (item: Record<string, unknown>, i: number) => void
) {
  for (let i = 0; i < lista.length; i++) {
    const item = lista[i];
    if (!(i in lista) || !esObjeto(item)) {
      problemas.push({
        campo: `${ruta}${i}`,
        etiqueta: contexto(i),
        detalle: i in lista ? 'No tiene la estructura esperada.' : 'Posición vacía en la lista.',
        valorOriginal: i in lista ? describirValor(item) : '(posición vacía)'
      });
      continue;
    }
    leer(item, i);
  }
}

function leerContenido(lista: ReadonlyArray<unknown>, problemas: ProblemaDato[], ruta: string, contexto: string): ContenidoDeclarado[] {
  const contenido: ContenidoDeclarado[] = [];
  const nombre = (i: number) => `${contexto}Contenido ${i + 1}`;
  recorrer(lista, problemas, `${ruta}contenido.`, nombre, (item, i) => {
    const antes = problemas.length;
    const l = lector(item, problemas, `${ruta}contenido.${i}.`, nombre(i));
    const elemento = l.texto('elemento', 'Elemento', true);
    const forma = l.texto('forma', 'Forma química', true);
    const porcentaje = l.numero('porcentaje', 'Porcentaje', { requerido: true, positivo: true, max: 100 });
    if (elemento && forma) {
      const { error } = coherenciaNutriente(elemento, forma);
      if (error) l.nota('forma', 'Forma química', `${error}.`);
      else if (contenido.some(c => mismaForma(c, { elemento, forma }))) l.nota('forma', 'Forma química', 'Esta forma ya está declarada en la etiqueta.');
    }
    if (problemas.length === antes) contenido.push({ elemento, forma, porcentaje } as ContenidoDeclarado);
  });
  return contenido;
}

/** Campos comunes al producto del catálogo y a su copia dentro de un plan. */
function leerCamposProducto(r: Record<string, unknown>, problemas: ProblemaDato[], ruta = '', contexto = ''): DatosProducto | undefined {
  const antes = problemas.length;
  const l = lector(r, problemas, ruta, contexto.replace(/ · $/, ''));
  const nombre = l.texto('nombre', 'Nombre del producto', true);
  const lista = l.lista('contenido', 'Contenido declarado', true);
  const contenido = lista ? leerContenido(lista, problemas, ruta, contexto) : [];
  if (lista && lista.length === 0) l.nota('contenido', 'Contenido declarado', 'La etiqueta debe declarar al menos un nutriente.');
  const presentacionKg = l.numero('presentacionKg', 'Kg por bulto', { positivo: true });
  const precioPresentacionCop = l.numero('precioPresentacionCop', 'Precio del bulto (COP)');
  const fechaPrecio = l.fecha('fechaPrecio', 'Fecha del precio');
  if (!ausente(r.precioPresentacionCop)) {
    if (ausente(r.presentacionKg)) l.nota('presentacionKg', 'Kg por bulto', 'Es obligatorio cuando se registra el precio.');
    if (ausente(r.fechaPrecio)) l.nota('fechaPrecio', 'Fecha del precio', 'Es obligatoria cuando se registra el precio.');
  }
  const esEjemplo = l.booleano('esEjemplo', 'Dato de EJEMPLO');
  if (problemas.length > antes) return undefined;
  return { nombre, contenido, presentacionKg, precioPresentacionCop, fechaPrecio, esEjemplo } as DatosProducto;
}

function errorDeRegistro(registro: unknown, cual: string): ProblemaDato {
  return { campo: 'registro', etiqueta: 'Registro', detalle: `No se pudo leer el ${cual} guardado.`, valorOriginal: describirValor(registro) };
}

/** Verifica un producto leído de IndexedDB sin lanzar errores ni modificarlo. */
export function verificarProducto(registro: unknown): ProductoVerificado {
  try {
    const problemas: ProblemaDato[] = [];
    const r = esObjeto(registro) ? registro : {};
    if (r !== registro) {
      problemas.push({ campo: 'registro', etiqueta: 'Registro', detalle: 'El registro guardado no tiene la estructura esperada.', valorOriginal: describirValor(registro) });
    }
    const id = typeof r.id === 'string' ? r.id : '';
    if (!id) lector(r, problemas).nota('id', 'Identificador', 'El registro no tiene identificador.');
    const datos = leerCamposProducto(r, problemas);
    const producto = datos && problemas.length === 0 ? {
      ...datos,
      id,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : undefined,
      updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : undefined
    } : undefined;
    return {
      id,
      nombre: typeof r.nombre === 'string' ? r.nombre.trim() : '',
      producto,
      problemas,
      camposAdicionales: Object.keys(r).filter(k => !CAMPOS_PRODUCTO.has(k))
    };
  } catch {
    return { id: '', nombre: '', problemas: [errorDeRegistro(registro, 'producto')], camposAdicionales: [] };
  }
}

/** Última barrera antes de guardar un producto: revalida y devuelve solo los campos admitidos. */
export function validarDatosProducto(datos: unknown, { hoy = new Date() }: { hoy?: Date } = {}): ResultadoValidacion<DatosProducto> {
  try {
    if (!esObjeto(datos)) return { ok: false, errores: ['Los datos del producto no tienen la estructura esperada.'] };
    const problemas: ProblemaDato[] = [];
    const leido = leerCamposProducto(datos, problemas);
    const errores = problemas.map(p => `${p.etiqueta}: ${p.detalle}`);
    if (leido?.fechaPrecio && leido.fechaPrecio > fechaLocalISO(hoy)) errores.push('Fecha del precio: no puede ser una fecha futura.');
    return leido && errores.length === 0 ? { ok: true, datos: leido } : { ok: false, errores };
  } catch {
    return { ok: false, errores: ['Los datos del producto no tienen la estructura esperada.'] };
  }
}

/** Copia independiente del producto para guardarla en una línea del plan. */
export function copiarProducto(producto: ProductoFertilizante): CopiaProducto {
  return {
    productoId: producto.id,
    nombre: producto.nombre,
    contenido: producto.contenido.map(c => ({ ...c })),
    presentacionKg: producto.presentacionKg,
    precioPresentacionCop: producto.precioPresentacionCop,
    fechaPrecio: producto.fechaPrecio,
    esEjemplo: producto.esEjemplo
  };
}

function leerMeta(item: Record<string, unknown>, i: number, problemas: ProblemaDato[]): MetaNutrimental | undefined {
  const antes = problemas.length;
  const l = lector(item, problemas, `metas.${i}.`, `Meta ${i + 1}`);
  const id = l.texto('id', 'Identificador', true);
  const elemento = l.texto('elemento', 'Elemento', true);
  const forma = l.texto('forma', 'Forma química', true);
  if (elemento && forma) {
    const { error } = coherenciaNutriente(elemento, forma);
    if (error) l.nota('forma', 'Forma química', `${error}.`);
  }
  const kgHa = l.numero('kgHa', 'Meta (kg/ha)', { requerido: true, positivo: true });
  const fuente = l.texto('fuente', 'Fuente técnica', true);
  const fechaFuente = l.fecha('fechaFuente', 'Fecha de la fuente', true);
  const esEjemplo = l.booleano('esEjemplo', 'Dato de EJEMPLO');
  if (problemas.length > antes) return undefined;
  return { id, elemento, forma, kgHa, fuente, fechaFuente, esEjemplo } as MetaNutrimental;
}

function leerLinea(item: Record<string, unknown>, i: number, problemas: ProblemaDato[]): LineaPlan | undefined {
  const antes = problemas.length;
  const contexto = `Línea ${i + 1}`;
  const l = lector(item, problemas, `lineas.${i}.`, contexto);
  const id = l.texto('id', 'Identificador', true);
  const metaId = l.texto('metaId', 'Meta', true);
  let producto: CopiaProducto | undefined;
  if (!esObjeto(item.producto)) l.nota('producto', 'Producto', 'No tiene la estructura esperada.');
  else {
    const copia = item.producto;
    const productoId = lector(copia, problemas, `lineas.${i}.producto.`, contexto).texto('productoId', 'Producto del catálogo', true);
    const datos = leerCamposProducto(copia, problemas, `lineas.${i}.producto.`, `${contexto} · `);
    if (datos && productoId) producto = { ...datos, productoId };
  }
  if (problemas.length > antes) return undefined;
  return { id, metaId, producto } as LineaPlan;
}

function leerCambio(item: Record<string, unknown>, i: number, problemas: ProblemaDato[]): CambioEstadoPlan | undefined {
  const antes = problemas.length;
  const l = lector(item, problemas, `historial.${i}.`, `Historial ${i + 1}`);
  const estado = ESTADOS_PLAN.includes(item.estado as EstadoPlan) ? item.estado as EstadoPlan : undefined;
  if (!estado) l.nota('estado', 'Estado', 'No es un estado válido (propuesta, revisado o aprobado).');
  const fecha = l.texto('fecha', 'Fecha', true);
  if (fecha && Number.isNaN(Date.parse(fecha))) l.nota('fecha', 'Fecha', 'No es una fecha válida.');
  const responsable = l.texto('responsable', 'Responsable');
  const nota = l.texto('nota', 'Nota');
  if (problemas.length > antes) return undefined;
  return { estado, fecha, responsable, nota } as CambioEstadoPlan;
}

/**
 * Verifica un plan leído de IndexedDB sin lanzar errores ni modificarlo. Las metas y líneas
 * dañadas o inconsistentes se excluyen y se describen en `problemas` con su valor original.
 */
export function verificarPlan(registro: unknown): PlanVerificado {
  try {
    return verificarPlanSinProteccion(registro);
  } catch {
    return { id: '', loteId: '', metas: [], lineas: [], historial: [], problemas: [errorDeRegistro(registro, 'plan')], camposAdicionales: [] };
  }
}

function verificarPlanSinProteccion(registro: unknown): PlanVerificado {
  const problemas: ProblemaDato[] = [];
  const r = esObjeto(registro) ? registro : {};
  if (r !== registro) {
    problemas.push({ campo: 'registro', etiqueta: 'Registro', detalle: 'El registro guardado no tiene la estructura esperada.', valorOriginal: describirValor(registro) });
  }
  const l = lector(r, problemas);
  const id = typeof r.id === 'string' ? r.id : '';
  const loteId = typeof r.loteId === 'string' ? r.loteId : '';
  if (!loteId) l.nota('loteId', 'Lote', 'El registro no indica a qué lote pertenece.');
  const nombre = l.texto('nombre', 'Nombre del plan', true);
  const areaM2AlCrear = l.numero('areaM2AlCrear', 'Área del plan', { requerido: true, positivo: true });
  const analisisReferenciaId = l.texto('analisisReferenciaId', 'Análisis de referencia');
  const planOrigenId = l.texto('planOrigenId', 'Plan de origen');

  const metas: MetaNutrimental[] = [];
  const listaMetas = l.lista('metas', 'Metas', true);
  if (listaMetas) recorrer(listaMetas, problemas, 'metas.', i => `Meta ${i + 1}`, (item, i) => {
    const meta = leerMeta(item, i, problemas);
    if (!meta) return;
    const nota = (detalle: string) => problemas.push({ campo: `metas.${i}`, etiqueta: `Meta ${i + 1}`, detalle, valorOriginal: describirValor(item) });
    if (metas.some(m => m.id === meta.id)) nota('Identificador repetido.');
    else if (metas.some(m => mismaForma(m, meta))) nota(`Ya hay una meta para ${meta.elemento} (${meta.forma}).`);
    else metas.push(meta);
  });

  const lineas: LineaPlan[] = [];
  const listaLineas = l.lista('lineas', 'Productos del plan', true);
  if (listaLineas) recorrer(listaLineas, problemas, 'lineas.', i => `Línea ${i + 1}`, (item, i) => {
    const linea = leerLinea(item, i, problemas);
    if (!linea) return;
    const nota = (detalle: string) => problemas.push({ campo: `lineas.${i}`, etiqueta: `Línea ${i + 1}`, detalle, valorOriginal: describirValor(item) });
    if (lineas.some(x => x.id === linea.id)) nota('Identificador repetido.');
    else if (!metas.some(m => m.id === linea.metaId)) nota('La meta de esta línea no existe o tiene datos dañados.');
    else if (lineas.some(x => x.metaId === linea.metaId)) nota('Ya hay otra línea para la misma meta.');
    else lineas.push(linea);
  });

  const estado = ESTADOS_PLAN.includes(r.estado as EstadoPlan) ? r.estado as EstadoPlan : undefined;
  if (!estado) l.nota('estado', 'Estado', 'No es un estado válido (propuesta, revisado o aprobado).');
  const historial: CambioEstadoPlan[] = [];
  const listaHistorial = l.lista('historial', 'Historial', true);
  if (listaHistorial) {
    recorrer(listaHistorial, problemas, 'historial.', i => `Historial ${i + 1}`, (item, i) => {
      const cambio = leerCambio(item, i, problemas);
      if (cambio) historial.push(cambio);
    });
    const ultimo = historial.at(-1);
    if (estado && historial.length === listaHistorial.length && ultimo?.estado !== estado) {
      l.nota('historial', 'Historial', 'El último cambio registrado no coincide con el estado del plan.');
    }
  }

  return {
    id,
    loteId,
    nombre,
    areaM2AlCrear,
    analisisReferenciaId,
    planOrigenId,
    metas,
    lineas,
    estado,
    historial,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : undefined,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : undefined,
    problemas,
    camposAdicionales: Object.keys(r).filter(k => !CAMPOS_PLAN.has(k))
  };
}

/**
 * Última barrera antes de guardar la parte editable de un plan: revalida la estructura, rechaza
 * fechas futuras y cantidades que se desbordan con el área que se guardará. Nunca lanza errores.
 * Una línea cuya forma no coincide con la meta se admite en propuesta: queda sin cálculo y explicada.
 */
export function validarDatosPlan(
  datos: unknown,
  { hoy = new Date(), areaM2 }: { hoy?: Date; areaM2?: number } = {}
): ResultadoValidacion<DatosPlan> {
  try {
    if (!esObjeto(datos)) return { ok: false, errores: ['Los datos del plan no tienen la estructura esperada.'] };
    const { nombre, analisisReferenciaId, metas, lineas } = datos;
    const v = verificarPlan({
      nombre, analisisReferenciaId, metas, lineas,
      id: 'validacion', loteId: 'validacion', areaM2AlCrear: areaM2, estado: 'propuesta',
      historial: [{ estado: 'propuesta', fecha: hoy.toISOString() }]
    });
    const errores = v.problemas.map(p => `${p.etiqueta}: ${p.detalle}`);
    const limite = fechaLocalISO(hoy);
    v.metas.forEach((m, i) => { if (m.fechaFuente > limite) errores.push(`Meta ${i + 1} · Fecha de la fuente: no puede ser una fecha futura.`); });
    v.lineas.forEach((x, i) => {
      if (x.producto.fechaPrecio && x.producto.fechaPrecio > limite) errores.push(`Línea ${i + 1} · Fecha del precio: no puede ser una fecha futura.`);
    });
    if (errores.length === 0) {
      calcularPlan(v).lineas.forEach((x, i) => {
        if (x.estado === 'sin-calculo' && x.motivo === 'desbordamiento') errores.push(`Línea ${i + 1}: ${x.mensaje}`);
        if (x.estado === 'calculada') {
          for (const c of [x.productoKgLote, x.costoCop, x.bultos, ...x.aportes.map(a => a.kgHa)]) {
            if (!c.ok && c.motivo === 'desbordamiento') errores.push(`Línea ${i + 1}: ${c.mensaje}`);
          }
        }
      });
    }
    if (errores.length) return { ok: false, errores };
    return { ok: true, datos: { nombre: v.nombre as string, analisisReferenciaId: v.analisisReferenciaId, metas: v.metas, lineas: v.lineas } };
  } catch {
    return { ok: false, errores: ['Los datos del plan no tienen la estructura esperada.'] };
  }
}

/**
 * Reglas para cambiar de estado. Revisar o aprobar exige que todas las líneas tengan cantidad
 * calculada. El responsable es un nombre escrito por el usuario: la app no verifica identidades.
 */
export function validarCambioEstado(plan: PlanVerificado, nuevo: EstadoPlan, responsable: string): { ok: true } | { ok: false; errores: string[] } {
  const errores: string[] = [];
  if (plan.problemas.length) errores.push('El plan tiene datos guardados dañados; no puede cambiar de estado.');
  else if (plan.estado === 'aprobado') errores.push('Un plan aprobado no cambia de estado: crea una copia como nueva propuesta.');
  else if (!plan.estado || !TRANSICIONES_PLAN[plan.estado].includes(nuevo)) {
    errores.push(`Un plan en estado «${plan.estado ?? 'desconocido'}» no puede pasar a «${nuevo}».`);
  }
  if (!responsable.trim()) errores.push('Escribe el nombre de quien registra este cambio.');
  if (errores.length === 0 && nuevo !== 'propuesta') {
    const calculo = calcularPlan(plan);
    if (calculo.lineas.length === 0) errores.push('El plan no tiene productos.');
    calculo.lineas.forEach((x, i) => {
      if (x.estado === 'sin-calculo') errores.push(`Línea ${i + 1}: ${x.mensaje}`);
      else if (!x.productoKgLote.ok) errores.push(`Línea ${i + 1}: ${x.productoKgLote.mensaje}`);
    });
  }
  return errores.length ? { ok: false, errores } : { ok: true };
}

/** Más reciente primero; desempate por id. */
export function ordenarPlanes<T extends Pick<PlanVerificado, 'id' | 'createdAt'>>(lista: T[]): T[] {
  return [...lista].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || a.id.localeCompare(b.id));
}

/** Orden alfabético en español; los registros sin nombre al final. */
export function ordenarProductos<T extends Pick<ProductoVerificado, 'id' | 'nombre'>>(lista: T[]): T[] {
  return [...lista].sort((a, b) =>
    Number(!a.nombre) - Number(!b.nombre) || a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id));
}

// ---- Formulario del catálogo (fase 3b): texto tal como lo escribe el usuario ----

export interface EntradaContenido {
  elemento: string;
  forma: string;
  porcentaje: string;
  /** Eligió "Otro / No reconocido" como elemento: elemento y forma son texto libre. */
  elementoLibre: boolean;
  /** Eligió una forma fuera de la lista del elemento: la forma es texto libre. */
  formaLibre: boolean;
}

export interface EntradaProducto {
  nombre: string;
  contenido: EntradaContenido[];
  presentacionKg: string;
  precioPresentacionCop: string;
  fechaPrecio: string;
  /** null: el usuario aún no indicó si los datos son de una etiqueta real o de EJEMPLO. */
  esEjemplo: boolean | null;
}

export type ErroresProducto = Partial<Record<'nombre' | 'presentacionKg' | 'precioPresentacionCop' | 'fechaPrecio' | 'esEjemplo', string>> & {
  contenido?: Record<number, string>;
  general?: string[];
};

export function filaContenidoVacia(fila: EntradaContenido): boolean {
  return !fila.elemento.trim() && !fila.forma.trim() && !fila.porcentaje.trim();
}

/** Conserva la forma declarada en la etiqueta: nunca convierte P₂O₅ en P ni K₂O en K. */
export function validarFilaContenido(fila: EntradaContenido): Resultado<ContenidoDeclarado> {
  const elemento = fila.elemento.trim();
  const forma = fila.forma.trim();
  if (!elemento) return { ok: false, error: 'Elige el elemento o escríbelo en "Otro / No reconocido".' };
  if (!fila.elementoLibre && !buscarElemento(elemento)) {
    return { ok: false, error: 'Elige un elemento de la lista o la opción "Otro / No reconocido".' };
  }
  if (!forma) return { ok: false, error: 'Indica la forma química tal como aparece en la etiqueta (por ejemplo, P₂O₅ o K₂O).' };
  const coherencia = coherenciaNutriente(elemento, forma);
  if (coherencia.error) return { ok: false, error: `${coherencia.error}. Revisa la etiqueta.` };
  if (!fila.elementoLibre && !fila.formaLibre && !coherencia.reconocido) {
    return { ok: false, error: 'Elige una forma de la lista o la opción "Otra forma / No reconocida".' };
  }
  const porcentaje = validarNumero(fila.porcentaje, { campo: 'Porcentaje', requerido: true, positivo: true, max: 100 });
  if (!porcentaje.ok) return porcentaje;
  return { ok: true, valor: { elemento, forma, porcentaje: porcentaje.valor as number } };
}

const valorDe = <T>(r: Resultado<T | undefined>): T | undefined => (r.ok ? r.valor : undefined);

/**
 * Valida el formulario del producto. Los kg y el precio rechazan escrituras ambiguas ("150.000"):
 * en COP es común el punto de miles y se leería como 150. Las filas nuevas vacías se ignoran.
 */
export function validarProducto(
  entrada: EntradaProducto,
  hoy: Date = new Date()
): { ok: true; datos: DatosProducto } | { ok: false; errores: ErroresProducto } {
  const errores: ErroresProducto = {};
  const nombre = entrada.nombre.trim();
  if (!nombre) errores.nombre = 'Escribe el nombre del producto como aparece en la etiqueta.';

  const contenido: ContenidoDeclarado[] = [];
  entrada.contenido.forEach((fila, i) => {
    if (filaContenidoVacia(fila)) return;
    const r = validarFilaContenido(fila);
    if (!r.ok) (errores.contenido ??= {})[i] = r.error;
    else if (contenido.some(c => mismaForma(c, r.valor))) (errores.contenido ??= {})[i] = `${r.valor.forma} ya está declarada en otra fila.`;
    else contenido.push(r.valor);
  });
  if (!errores.contenido && contenido.length === 0) errores.general = ['Registra al menos un nutriente de la etiqueta con su porcentaje.'];

  const kg = validarNumeroSinAmbiguedad(entrada.presentacionKg, { campo: 'Kg por bulto', positivo: true });
  if (!kg.ok) errores.presentacionKg = kg.error;
  const precio = validarNumeroSinAmbiguedad(entrada.precioPresentacionCop, { campo: 'Precio del bulto' });
  if (!precio.ok) errores.precioPresentacionCop = precio.error;
  const hayPrecio = valorDe(precio) !== undefined;
  let fechaPrecio: string | undefined;
  if (entrada.fechaPrecio.trim()) {
    const fecha = validarFecha(entrada.fechaPrecio, 'Fecha del precio', hoy);
    if (!fecha.ok) errores.fechaPrecio = fecha.error;
    else if (precio.ok && !hayPrecio) errores.fechaPrecio = 'Fecha del precio: escribe también el precio o deja la fecha vacía.';
    else fechaPrecio = fecha.valor;
  } else if (hayPrecio) errores.fechaPrecio = 'Fecha del precio: es obligatoria cuando registras el precio, porque los precios cambian.';
  if (hayPrecio && kg.ok && kg.valor === undefined) errores.presentacionKg = 'Kg por bulto: es obligatorio cuando registras el precio del bulto.';
  if (entrada.esEjemplo === null) errores.esEjemplo = 'Indica si los datos vienen de una etiqueta real o son de EJEMPLO.';

  if (Object.keys(errores).length) return { ok: false, errores };
  const datos: DatosProducto = {
    nombre, contenido, presentacionKg: valorDe(kg), precioPresentacionCop: valorDe(precio), fechaPrecio, esEjemplo: entrada.esEjemplo as boolean
  };
  // Misma comprobación que se hace antes de persistir.
  const final = validarDatosProducto(datos, { hoy });
  return final.ok ? final : { ok: false, errores: { general: final.errores } };
}
