/**
 * Validaciones PURAS de la fase 4 (seguimiento manual): aplicaciones, observaciones y tareas.
 * No infieren mediciones de campo ni proponen dosis: revisan estructura, números y fechas.
 */
import type { ProblemaDato, RegistroSeguimiento, RegistroVerificado, TipoRegistro } from '../types';
import { describirValor, esObjeto, fechaLocalISO } from './validacion.ts';
import { lector, type ResultadoValidacion } from './validacionPlan.ts';

export const TIPOS_REGISTRO: ReadonlyArray<TipoRegistro> = ['aplicacion', 'observacion', 'tarea'];
export const ESTADOS_TAREA = ['pendiente', 'hecha'] as const;

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

/** Lee los campos de un registro; devuelve los datos completos solo si nada tiene problemas. */
function leerCampos(r: Record<string, unknown>, problemas: ProblemaDato[]): DatosRegistro | undefined {
  const antes = problemas.length;
  const l = lector(r, problemas);
  const tipo = TIPOS_REGISTRO.includes(r.tipo as TipoRegistro) ? r.tipo as TipoRegistro : undefined;
  if (!tipo) {
    l.nota('tipo', 'Tipo de registro', 'No es aplicación, observación ni tarea.');
    return undefined;
  }
  const responsable = l.texto('responsable', 'Responsable');
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
      nota: l.texto('nota', 'Nota')
    };
  } else if (tipo === 'observacion') {
    datos = { fecha: l.fecha('fecha', 'Fecha', true), descripcion: l.texto('descripcion', 'Descripción', true) };
  } else {
    const estado = (ESTADOS_TAREA as ReadonlyArray<unknown>).includes(r.estado) ? r.estado : undefined;
    if (!estado) l.nota('estado', 'Estado de la tarea', 'No es pendiente ni hecha.');
    const fechaRealizada = l.fecha('fechaRealizada', 'Fecha en que se hizo', estado === 'hecha');
    if (estado === 'pendiente' && fechaRealizada) l.nota('fechaRealizada', 'Fecha en que se hizo', 'Una tarea pendiente no tiene fecha de realización.');
    datos = {
      descripcion: l.texto('descripcion', 'Descripción', true),
      fechaPrevista: l.fecha('fechaPrevista', 'Fecha prevista', true),
      estado,
      fechaRealizada
    };
  }
  if (problemas.length > antes) return undefined;
  return { tipo, ...datos, responsable, esEjemplo } as DatosRegistro;
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
    const datos = leerCampos(r, problemas);
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
      problemas,
      camposAdicionales: tipo ? Object.keys(r).filter(k => !CAMPOS_POR_TIPO[tipo].has(k)) : []
    };
  } catch {
    return {
      id: '', loteId: '', problemas: [{ campo: 'registro', etiqueta: 'Registro', detalle: 'No se pudo leer el registro guardado.', valorOriginal: describirValor(registro) }],
      camposAdicionales: []
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
    const leido = leerCampos(datos, problemas);
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
