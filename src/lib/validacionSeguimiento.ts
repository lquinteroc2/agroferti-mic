/**
 * Validaciones PURAS de la fase 4 (seguimiento manual): aplicaciones, observaciones y tareas.
 * No infieren mediciones de campo ni proponen dosis: revisan estructura, números y fechas.
 */
import type { ProblemaDato, RegistroSeguimiento, RegistroVerificado, TipoRegistro } from '../types';
import { describirValor, esObjeto, fechaLocalISO, validarFecha, validarNumeroSinAmbiguedad } from './validacion.ts';
import { lector, type ResultadoValidacion } from './validacionPlan.ts';

export const TIPOS_REGISTRO: ReadonlyArray<TipoRegistro> = ['aplicacion', 'observacion', 'tarea'];
export const ESTADOS_TAREA = ['pendiente', 'hecha'] as const;
/** Topes de largo de los textos libres (los mismos de los formularios). */
export const MAX_RESPONSABLE = 80;
export const MAX_NOTA = 200;
export const MAX_DESCRIPCION = 500;

const CAMPOS_COMUNES = ['id', 'loteId', 'tipo', 'responsable', 'esEjemplo', 'createdAt', 'updatedAt'];
const CAMPOS_POR_TIPO: Record<TipoRegistro, ReadonlySet<string>> = {
  aplicacion: new Set([...CAMPOS_COMUNES, 'planId', 'lineaId', 'productoNombre', 'fecha', 'cantidadKg', 'costoCop', 'nota']),
  observacion: new Set([...CAMPOS_COMUNES, 'fecha', 'descripcion']),
  tarea: new Set([...CAMPOS_COMUNES, 'descripcion', 'fechaPrevista', 'estado', 'fechaRealizada'])
};

/** Registro listo para guardar. El repositorio añade id, lote y fechas de control. */
export type DatosRegistro = RegistroSeguimiento extends infer R
  ? R extends RegistroSeguimiento ? Omit<R, 'id' | 'loteId' | 'createdAt' | 'updatedAt'> : never
  : never;

/**
 * Lee los campos de un registro. `datos` está completo solo si nada tiene problemas; `parcial`
 * conserva los datos válidos aunque otros estén dañados.
 */
function leerCampos(r: Record<string, unknown>, problemas: ProblemaDato[]): { datos?: DatosRegistro; parcial: Record<string, unknown> } {
  const antes = problemas.length;
  const l = lector(r, problemas);
  const tipo = TIPOS_REGISTRO.includes(r.tipo as TipoRegistro) ? r.tipo as TipoRegistro : undefined;
  if (!tipo) {
    l.nota('tipo', 'Tipo de registro', 'No es aplicación, observación ni tarea.');
    return { parcial: {} };
  }
  /** Texto con tope de largo (el de los formularios): un texto enorme rompería la lista. */
  const texto = (campo: string, etiqueta: string, max: number, requerido = false) => {
    const valor = l.texto(campo, etiqueta, requerido);
    if (valor && valor.length > max) l.nota(campo, etiqueta, `Tiene más de ${max} caracteres.`);
    return valor;
  };
  const responsable = texto('responsable', 'Responsable', MAX_RESPONSABLE);
  const esEjemplo = l.booleano('esEjemplo', 'Dato de EJEMPLO');
  let datos: Record<string, unknown>;
  if (tipo === 'aplicacion') {
    datos = {
      planId: l.texto('planId', 'Plan', true),
      lineaId: l.texto('lineaId', 'Producto del plan', true),
      productoNombre: l.texto('productoNombre', 'Nombre del producto', true),
      fecha: l.fecha('fecha', 'Fecha de aplicación', true),
      cantidadKg: l.numero('cantidadKg', 'Cantidad aplicada (kg)', { requerido: true, positivo: true }),
      costoCop: l.numero('costoCop', 'Costo (COP)'),
      nota: texto('nota', 'Nota', MAX_NOTA)
    };
  } else if (tipo === 'observacion') {
    datos = { fecha: l.fecha('fecha', 'Fecha', true), descripcion: texto('descripcion', 'Descripción', MAX_DESCRIPCION, true) };
  } else {
    const estado = (ESTADOS_TAREA as ReadonlyArray<unknown>).includes(r.estado) ? r.estado : undefined;
    if (!estado) l.nota('estado', 'Estado de la tarea', 'No es pendiente ni hecha.');
    const fechaRealizada = l.fecha('fechaRealizada', 'Fecha en que se hizo', estado === 'hecha');
    if (estado === 'pendiente' && fechaRealizada) l.nota('fechaRealizada', 'Fecha en que se hizo', 'Una tarea pendiente no tiene fecha de realización.');
    datos = {
      descripcion: texto('descripcion', 'Descripción', MAX_DESCRIPCION, true),
      fechaPrevista: l.fecha('fechaPrevista', 'Fecha prevista', true),
      estado,
      fechaRealizada
    };
  }
  const parcial = { tipo, ...datos, responsable, esEjemplo };
  return { datos: problemas.length > antes ? undefined : parcial as DatosRegistro, parcial };
}

/** Verifica un registro leído de IndexedDB sin lanzar errores ni modificarlo. */
export function verificarRegistro(registro: unknown): RegistroVerificado {
  try {
    const problemas: ProblemaDato[] = [];
    const r = esObjeto(registro) ? registro : {};
    if (r !== registro) {
      problemas.push({ campo: 'registro', etiqueta: 'Registro', detalle: 'El registro guardado no tiene la estructura esperada.', valorOriginal: describirValor(registro) });
    }
    const id = typeof r.id === 'string' ? r.id : '';
    const loteId = typeof r.loteId === 'string' ? r.loteId : '';
    const l = lector(r, problemas);
    if (!id) l.nota('id', 'Identificador', 'El registro no tiene identificador.');
    if (!loteId) l.nota('loteId', 'Lote', 'El registro no indica a qué lote pertenece.');
    const { datos, parcial } = leerCampos(r, problemas);
    const tipo = TIPOS_REGISTRO.includes(r.tipo as TipoRegistro) ? r.tipo as TipoRegistro : undefined;
    const fechaOrden = [r.fecha, r.fechaPrevista].find((f): f is string => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f));
    const registroCompleto = datos && problemas.length === 0 ? {
      ...datos,
      id,
      loteId,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
      updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : ''
    } as RegistroSeguimiento : undefined;
    return {
      id,
      loteId,
      tipo,
      registro: registroCompleto,
      fechaOrden,
      planId: tipo === 'aplicacion' && typeof r.planId === 'string' ? r.planId : undefined,
      parcial,
      problemas,
      camposAdicionales: tipo ? Object.keys(r).filter(k => !CAMPOS_POR_TIPO[tipo].has(k)) : []
    };
  } catch {
    return {
      id: '', loteId: '', problemas: [{ campo: 'registro', etiqueta: 'Registro', detalle: 'No se pudo leer el registro guardado.', valorOriginal: describirValor(registro) }],
      camposAdicionales: [], parcial: {}
    };
  }
}

/**
 * Última barrera antes de guardar: revalida la estructura, rechaza fechas futuras (la fecha
 * prevista de una tarea sí puede serlo) y devuelve solo los campos admitidos. Nunca lanza errores.
 */
export function validarDatosRegistro(datos: unknown, { hoy = new Date() }: { hoy?: Date } = {}): ResultadoValidacion<DatosRegistro> {
  try {
    if (!esObjeto(datos)) return { ok: false, errores: ['Los datos del registro no tienen la estructura esperada.'] };
    const problemas: ProblemaDato[] = [];
    const leido = leerCampos(datos, problemas).datos;
    const errores = problemas.map(p => `${p.etiqueta}: ${p.detalle}`);
    const limite = fechaLocalISO(hoy);
    if (leido && 'fecha' in leido && leido.fecha > limite) errores.push('Fecha: no puede ser una fecha futura.');
    if (leido?.tipo === 'tarea' && leido.fechaRealizada && leido.fechaRealizada > limite) {
      errores.push('Fecha en que se hizo: no puede ser una fecha futura.');
    }
    return leido && errores.length === 0 ? { ok: true, datos: leido } : { ok: false, errores };
  } catch {
    return { ok: false, errores: ['Los datos del registro no tienen la estructura esperada.'] };
  }
}

/** Más reciente primero (por fecha o fecha prevista); desempate por creación e id. Sin fecha, al final. */
export function ordenarRegistros(lista: RegistroVerificado[]): RegistroVerificado[] {
  const creado = (v: RegistroVerificado) => v.registro?.createdAt ?? '';
  return [...lista].sort((a, b) =>
    Number(!a.fechaOrden) - Number(!b.fechaOrden)
    || (b.fechaOrden ?? '').localeCompare(a.fechaOrden ?? '')
    || creado(b).localeCompare(creado(a))
    || a.id.localeCompare(b.id));
}

// ---- Formulario de aplicación (fase 4b): texto tal como lo escribe el usuario ----

export interface EntradaAplicacion {
  fecha: string;
  cantidadKg: string;
  costoCop: string;
  responsable: string;
  nota: string;
  /** '' mientras el usuario no indique si es una aplicación real o de EJEMPLO. */
  origen: '' | 'real' | 'ejemplo';
}

export type ErroresAplicacion = Partial<Record<keyof EntradaAplicacion, string>> & { general?: string[] };

/**
 * Valida el formulario de una aplicación de un producto del plan. Los kg y el costo rechazan
 * escrituras ambiguas ("1.500", "150.000"). El plan, la línea y el producto los pone la pantalla.
 */
export function validarAplicacionFormulario(
  entrada: EntradaAplicacion,
  destino: { planId: string; lineaId: string; productoNombre: string },
  hoy: Date = new Date()
): { ok: true; datos: DatosRegistro } | { ok: false; errores: ErroresAplicacion } {
  const errores: ErroresAplicacion = {};
  const fecha = entrada.fecha.trim()
    ? validarFecha(entrada.fecha, 'Fecha de aplicación', hoy)
    : { ok: false as const, error: 'Fecha de aplicación: es obligatoria.' };
  if (!fecha.ok) errores.fecha = fecha.error;
  const cantidad = validarNumeroSinAmbiguedad(entrada.cantidadKg, { campo: 'Cantidad aplicada (kg)', requerido: true, positivo: true });
  if (!cantidad.ok) errores.cantidadKg = cantidad.error;
  const costo = validarNumeroSinAmbiguedad(entrada.costoCop, { campo: 'Costo (COP)' });
  if (!costo.ok) errores.costoCop = costo.error;
  if (!entrada.origen) errores.origen = 'Indica si es una aplicación real o de EJEMPLO.';
  if (!fecha.ok || !cantidad.ok || !costo.ok || errores.origen) return { ok: false, errores };
  const datos = {
    tipo: 'aplicacion',
    ...destino,
    fecha: fecha.valor,
    cantidadKg: cantidad.valor as number,
    costoCop: costo.valor,
    nota: entrada.nota.trim() || undefined,
    responsable: entrada.responsable.trim() || undefined,
    esEjemplo: entrada.origen === 'ejemplo'
  };
  // Misma comprobación que se hace antes de persistir.
  const final = validarDatosRegistro(datos, { hoy });
  return final.ok ? final : { ok: false, errores: { general: final.errores } };
}

// ---- Formularios de observación y tarea (fase 4c) ----

export interface EntradaObservacion {
  fecha: string;
  descripcion: string;
  responsable: string;
  origen: '' | 'real' | 'ejemplo';
}

export interface EntradaTarea {
  descripcion: string;
  fechaPrevista: string;
  estado: 'pendiente' | 'hecha';
  fechaRealizada: string;
  responsable: string;
  origen: '' | 'real' | 'ejemplo';
}

export type ErroresFormulario<T> = Partial<Record<keyof T, string>> & { general?: string[] };

/** Fecha obligatoria; `hoy` (si se indica) impide fechas futuras. */
function fechaObligatoria(texto: string, campo: string, hoy?: Date) {
  return texto.trim() ? validarFecha(texto, campo, hoy) : { ok: false as const, error: `${campo}: es obligatoria.` };
}

function textoObligatorio(texto: string, campo: string, max: number): { ok: true; valor: string } | { ok: false; error: string } {
  const valor = texto.trim();
  if (!valor) return { ok: false, error: `${campo}: es obligatoria.` };
  if (valor.length > max) return { ok: false, error: `${campo}: tiene más de ${max} caracteres.` };
  return { ok: true, valor };
}

function cierre<T>(datos: Record<string, unknown>, hoy: Date): { ok: true; datos: DatosRegistro } | { ok: false; errores: ErroresFormulario<T> } {
  // Misma comprobación que se hace antes de persistir.
  const final = validarDatosRegistro(datos, { hoy });
  return final.ok ? final : { ok: false, errores: { general: final.errores } as ErroresFormulario<T> };
}

/** Observación de campo: texto libre con fecha (no futura). No es una medición. */
export function validarObservacionFormulario(
  entrada: EntradaObservacion,
  hoy: Date = new Date()
): { ok: true; datos: DatosRegistro } | { ok: false; errores: ErroresFormulario<EntradaObservacion> } {
  const errores: ErroresFormulario<EntradaObservacion> = {};
  const fecha = fechaObligatoria(entrada.fecha, 'Fecha', hoy);
  if (!fecha.ok) errores.fecha = fecha.error;
  const descripcion = textoObligatorio(entrada.descripcion, 'Descripción', MAX_DESCRIPCION);
  if (!descripcion.ok) errores.descripcion = descripcion.error;
  if (entrada.responsable.trim().length > MAX_RESPONSABLE) errores.responsable = `Responsable: tiene más de ${MAX_RESPONSABLE} caracteres.`;
  if (!entrada.origen) errores.origen = 'Indica si es una observación real o de EJEMPLO.';
  if (!fecha.ok || !descripcion.ok || errores.responsable || errores.origen) return { ok: false, errores };
  return cierre({
    tipo: 'observacion', fecha: fecha.valor, descripcion: descripcion.valor,
    responsable: entrada.responsable.trim() || undefined, esEjemplo: entrada.origen === 'ejemplo'
  }, hoy);
}

/** Tarea: la fecha prevista puede ser futura; si está hecha, la fecha en que se hizo no. */
export function validarTareaFormulario(
  entrada: EntradaTarea,
  hoy: Date = new Date()
): { ok: true; datos: DatosRegistro } | { ok: false; errores: ErroresFormulario<EntradaTarea> } {
  const errores: ErroresFormulario<EntradaTarea> = {};
  const descripcion = textoObligatorio(entrada.descripcion, 'Descripción', MAX_DESCRIPCION);
  if (!descripcion.ok) errores.descripcion = descripcion.error;
  const prevista = fechaObligatoria(entrada.fechaPrevista, 'Fecha prevista');
  if (!prevista.ok) errores.fechaPrevista = prevista.error;
  const hecha = entrada.estado === 'hecha';
  const realizada = hecha ? fechaObligatoria(entrada.fechaRealizada, 'Fecha en que se hizo', hoy) : undefined;
  if (realizada && !realizada.ok) errores.fechaRealizada = realizada.error;
  if (entrada.responsable.trim().length > MAX_RESPONSABLE) errores.responsable = `Responsable: tiene más de ${MAX_RESPONSABLE} caracteres.`;
  if (!entrada.origen) errores.origen = 'Indica si es una tarea real o de EJEMPLO.';
  if (!descripcion.ok || !prevista.ok || (realizada && !realizada.ok) || errores.responsable || errores.origen) return { ok: false, errores };
  return cierre({
    tipo: 'tarea', descripcion: descripcion.valor, fechaPrevista: prevista.valor, estado: entrada.estado,
    // Una tarea pendiente no conserva fecha de realización.
    fechaRealizada: realizada?.ok ? realizada.valor : undefined,
    responsable: entrada.responsable.trim() || undefined, esEjemplo: entrada.origen === 'ejemplo'
  }, hoy);
}

/** Pendiente y con fecha prevista anterior a hoy. Es un hecho de calendario, no una alerta agronómica. */
export function tareaVencida(tarea: { estado: string; fechaPrevista: string }, hoy: Date = new Date()): boolean {
  return tarea.estado === 'pendiente' && tarea.fechaPrevista < fechaLocalISO(hoy);
}
