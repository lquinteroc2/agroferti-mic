/**
 * Reglas de persistencia de análisis de suelo, independientes de Dexie para poder probarlas en Node
 * con un almacén en memoria. `db.ts` aporta el almacén real sobre IndexedDB.
 */
import type { AnalisisSuelo, AnalisisVerificado } from '../types';
import { ordenarAnalisis, validarDatosAnalisis, verificarAnalisis } from './validacion.ts';

export interface AlmacenAnalisis {
  obtenerAreaLote(loteId: string): Promise<number | undefined>;
  obtener(id: string): Promise<unknown>;
  listarPorLote(loteId: string): Promise<unknown[]>;
  guardar(registro: AnalisisSuelo): Promise<void>;
  eliminar(id: string): Promise<void>;
  /** Ejecuta `fn` de forma atómica (una transacción en IndexedDB). */
  transaccion<T>(fn: () => Promise<T>): Promise<T>;
}

export interface OpcionesGuardado {
  /** Si se indica, edita ese análisis; si no, crea uno nuevo. */
  id?: string;
  /** Al editar: reemplazar el área histórica por el área actual del lote. */
  actualizarArea?: boolean;
  /**
   * Al editar un registro con datos dañados: campos (`ProblemaDato.campo`) que el usuario corrigió
   * o decidió descartar de forma expresa. Si falta alguno, no se guarda nada.
   */
  resueltos?: ReadonlyArray<string>;
  ahora?: Date;
  generarId?: () => string;
}

export class ErrorPersistencia extends Error {
  readonly detalles: string[];
  constructor(mensaje: string, detalles: string[] = []) {
    super(mensaje);
    this.name = 'ErrorPersistencia';
    this.detalles = detalles;
  }
}

const areaValida = (area: unknown): area is number =>
  typeof area === 'number' && Number.isFinite(area) && area > 0;

export function crearRepositorioAnalisis(almacen: AlmacenAnalisis) {
  /** Lee el registro y comprueba que pertenece al lote; nunca opera sobre otro lote. */
  async function obtenerDelLote(loteId: string, id: string): Promise<Record<string, unknown>> {
    const previo = await almacen.obtener(id);
    if (!previo || typeof previo !== 'object' || (previo as { loteId?: unknown }).loteId !== loteId) {
      throw new ErrorPersistencia('El análisis no existe o pertenece a otro lote.');
    }
    return previo as Record<string, unknown>;
  }

  return {
    /** Análisis verificados de un lote, ordenados del más reciente al más antiguo. */
    async listar(loteId: string): Promise<AnalisisVerificado[]> {
      const crudos = await almacen.listarPorLote(loteId);
      return ordenarAnalisis(crudos.map(verificarAnalisis).filter(a => a.loteId === loteId));
    },

    async guardar(loteId: string, datos: unknown, opciones: OpcionesGuardado = {}): Promise<string> {
      const { id, actualizarArea = false, resueltos = [], ahora = new Date(), generarId = () => crypto.randomUUID() } = opciones;
      return almacen.transaccion(async () => {
        const areaLote = await almacen.obtenerAreaLote(loteId);
        if (areaLote === undefined) throw new ErrorPersistencia('El lote no existe.');
        const previo = id ? await obtenerDelLote(loteId, id) : undefined;
        const verificado = previo ? verificarAnalisis(previo) : undefined;

        // Ningún dato dañado se pierde sin que el usuario lo haya corregido o descartado expresamente.
        const pendientes = (verificado?.problemas ?? []).filter(p =>
          !resueltos.includes(p.campo) && !(p.campo === 'areaM2AlRegistro' && actualizarArea));
        if (pendientes.length) {
          throw new ErrorPersistencia(
            'Hay datos guardados dañados sin resolver. Corrígelos o confirma que quieres descartarlos.',
            pendientes.map(p => `${p.etiqueta}: valor guardado ${p.valorOriginal}`)
          );
        }

        // Nuevo: copia el área actual. Edición: conserva la histórica salvo petición explícita.
        // Un área histórica ausente no se reconstruye; una inválida solo se descarta si se confirmó arriba.
        const area = !previo || actualizarArea ? areaLote : areaValida(previo.areaM2AlRegistro) ? previo.areaM2AlRegistro : undefined;
        const validado = validarDatosAnalisis(datos, { hoy: ahora, areaM2: area });
        if (!validado.ok) throw new ErrorPersistencia('Los datos del análisis no son válidos.', validado.errores);
        const marca = ahora.toISOString();
        // Campos de otras versiones: se conservan tal cual (no se validan ni se editan aquí).
        const adicionales = Object.fromEntries((verificado?.camposAdicionales ?? []).map(k => [k, previo?.[k]]));
        const registro: AnalisisSuelo = {
          ...adicionales,
          ...validado.datos,
          id: id ?? generarId(),
          loteId,
          areaM2AlRegistro: area,
          createdAt: typeof previo?.createdAt === 'string' ? previo.createdAt : marca,
          updatedAt: marca
        };
        await almacen.guardar(registro);
        return registro.id;
      });
    },

    async eliminar(loteId: string, id: string): Promise<void> {
      await almacen.transaccion(async () => {
        await obtenerDelLote(loteId, id);
        await almacen.eliminar(id);
      });
    }
  };
}
