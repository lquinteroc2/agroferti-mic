/**
 * Reglas de persistencia de la fase 4 (seguimiento manual por lote), independientes de Dexie para
 * probarlas en Node con un almacén en memoria. `db.ts` aporta el almacén real.
 */
import type { LineaPlan, RegistroSeguimiento, RegistroVerificado } from '../types';
import { ErrorPersistencia } from './repositorioAnalisis.ts';
import { esObjeto } from './validacion.ts';
import { verificarPlan } from './validacionPlan.ts';
import { ordenarRegistros, validarDatosRegistro, verificarRegistro } from './validacionSeguimiento.ts';

export interface AlmacenSeguimiento {
  existeLote(loteId: string): Promise<boolean>;
  obtenerPlan(planId: string): Promise<unknown>;
  obtener(id: string): Promise<unknown>;
  listarPorLote(loteId: string): Promise<unknown[]>;
  guardar(registro: RegistroSeguimiento): Promise<void>;
  eliminar(id: string): Promise<void>;
  /** Ejecuta `fn` de forma atómica (una transacción en IndexedDB). */
  transaccion<T>(fn: () => Promise<T>): Promise<T>;
}

export interface OpcionesRegistro {
  /** Si se indica, edita ese registro; si no, crea uno nuevo. */
  id?: string;
  /** Al editar un registro con datos dañados: el usuario confirmó reemplazarlos por lo que escribió. */
  descartarDanados?: boolean;
  ahora?: Date;
  generarId?: () => string;
}

export function crearRepositorioSeguimiento(almacen: AlmacenSeguimiento) {
  /** Lee el registro y comprueba que pertenece al lote; nunca opera sobre otro lote. */
  async function obtenerDelLote(loteId: string, id: string) {
    const crudo = await almacen.obtener(id);
    if (!esObjeto(crudo) || crudo.loteId !== loteId) throw new ErrorPersistencia('El registro no existe o pertenece a otro lote.');
    return { crudo, verificado: verificarRegistro(crudo) };
  }

  /** Una aplicación solo se registra contra una línea de un plan aprobado, sano y del mismo lote. */
  async function lineaAprobada(loteId: string, planId: string, lineaId: string): Promise<LineaPlan> {
    const plan = verificarPlan(await almacen.obtenerPlan(planId));
    if (!plan.id || plan.loteId !== loteId) throw new ErrorPersistencia('El plan no existe o pertenece a otro lote.');
    if (plan.problemas.length) throw new ErrorPersistencia('El plan tiene datos guardados dañados; no se pueden registrar aplicaciones.');
    if (plan.estado !== 'aprobado') throw new ErrorPersistencia('Solo se registran aplicaciones de un plan aprobado.');
    const linea = plan.lineas.find(l => l.id === lineaId);
    if (!linea) throw new ErrorPersistencia('El producto elegido no está en el plan.');
    return linea;
  }

  return {
    /** Registros verificados del lote, del más reciente al más antiguo. */
    async listar(loteId: string): Promise<RegistroVerificado[]> {
      return ordenarRegistros((await almacen.listarPorLote(loteId)).map(verificarRegistro).filter(v => v.loteId === loteId));
    },

    async guardar(loteId: string, datos: unknown, opciones: OpcionesRegistro = {}): Promise<string> {
      const { id, descartarDanados = false, ahora = new Date(), generarId = () => crypto.randomUUID() } = opciones;
      return almacen.transaccion(async () => {
        if (!(await almacen.existeLote(loteId))) throw new ErrorPersistencia('El lote no existe.');
        const previo = id !== undefined ? await obtenerDelLote(loteId, id) : undefined;
        // Ningún dato dañado se reemplaza sin que el usuario lo haya confirmado.
        if (previo?.verificado.problemas.length && !descartarDanados) {
          throw new ErrorPersistencia(
            'El registro guardado tiene datos dañados. Confirma que quieres reemplazarlos por los que escribiste.',
            previo.verificado.problemas.map(p => `${p.etiqueta}: valor guardado ${p.valorOriginal}`)
          );
        }
        const validado = validarDatosRegistro(datos, { hoy: ahora });
        if (!validado.ok) throw new ErrorPersistencia('Los datos del registro no son válidos.', validado.errores);
        let datosFinales = validado.datos;
        if (previo?.verificado.tipo && previo.verificado.tipo !== datosFinales.tipo) {
          throw new ErrorPersistencia('No se puede cambiar el tipo de un registro: elimínalo y crea uno nuevo.');
        }
        if (datosFinales.tipo === 'aplicacion') {
          // El nombre del producto sale del plan, no del formulario.
          const linea = await lineaAprobada(loteId, datosFinales.planId, datosFinales.lineaId);
          datosFinales = { ...datosFinales, productoNombre: linea.producto.nombre };
        }
        const marca = ahora.toISOString();
        // Campos de otras versiones: se conservan tal cual al editar.
        const adicionales = previo ? Object.fromEntries(previo.verificado.camposAdicionales.map(k => [k, previo.crudo[k]])) : {};
        const registro = {
          ...adicionales,
          ...datosFinales,
          id: id ?? generarId(),
          loteId,
          createdAt: typeof previo?.crudo.createdAt === 'string' ? previo.crudo.createdAt : marca,
          updatedAt: marca
        } as RegistroSeguimiento;
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
