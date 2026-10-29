/**
 * Reglas de persistencia de la fase 3 (catálogo de productos y planes por lote), independientes
 * de Dexie para probarlas en Node con almacenes en memoria. `db.ts` aporta los almacenes reales.
 */
import type { CambioEstadoPlan, EstadoPlan, PlanFertilizacion, PlanVerificado, ProductoFertilizante, ProductoVerificado } from '../types';
import { ErrorPersistencia } from './repositorioAnalisis.ts';
import { esObjeto } from './validacion.ts';
import {
  ordenarPlanes,
  ordenarProductos,
  validarCambioEstado,
  validarDatosPlan,
  validarDatosProducto,
  verificarPlan,
  verificarProducto,
  type DatosPlan
} from './validacionPlan.ts';

export interface AlmacenProductos {
  obtener(id: string): Promise<unknown>;
  listar(): Promise<unknown[]>;
  guardar(registro: ProductoFertilizante): Promise<void>;
  eliminar(id: string): Promise<void>;
  transaccion<T>(fn: () => Promise<T>): Promise<T>;
}

export interface OpcionesProducto {
  /** Si se indica, edita ese producto; si no, crea uno nuevo. */
  id?: string;
  /** Al editar un producto con datos dañados: el usuario confirmó reemplazarlos por lo que escribió. */
  descartarDanados?: boolean;
  ahora?: Date;
  generarId?: () => string;
}

/** Campos de otras versiones: se conservan tal cual al guardar. */
function camposAdicionales(crudo: unknown, claves: ReadonlyArray<string>): Record<string, unknown> {
  return esObjeto(crudo) ? Object.fromEntries(claves.map(k => [k, crudo[k]])) : {};
}

export function crearRepositorioProductos(almacen: AlmacenProductos) {
  return {
    /** Catálogo verificado, en orden alfabético. */
    async listar(): Promise<ProductoVerificado[]> {
      return ordenarProductos((await almacen.listar()).map(verificarProducto));
    },

    async guardar(datos: unknown, opciones: OpcionesProducto = {}): Promise<string> {
      const { id, descartarDanados = false, ahora = new Date(), generarId = () => crypto.randomUUID() } = opciones;
      return almacen.transaccion(async () => {
        const previo = id !== undefined ? await almacen.obtener(id) : undefined;
        if (id !== undefined && !esObjeto(previo)) throw new ErrorPersistencia('El producto no existe.');
        const verificado = previo ? verificarProducto(previo) : undefined;
        // Ningún dato dañado se reemplaza sin que el usuario lo haya confirmado.
        if (verificado?.problemas.length && !descartarDanados) {
          throw new ErrorPersistencia(
            'El producto guardado tiene datos dañados. Confirma que quieres reemplazarlos por los que escribiste.',
            verificado.problemas.map(p => `${p.etiqueta}: valor guardado ${p.valorOriginal}`)
          );
        }
        const validado = validarDatosProducto(datos, { hoy: ahora });
        if (!validado.ok) throw new ErrorPersistencia('Los datos del producto no son válidos.', validado.errores);
        const marca = ahora.toISOString();
        const registro: ProductoFertilizante = {
          ...camposAdicionales(previo, verificado?.camposAdicionales ?? []),
          ...validado.datos,
          id: id ?? generarId(),
          createdAt: esObjeto(previo) && typeof previo.createdAt === 'string' ? previo.createdAt : marca,
          updatedAt: marca
        };
        await almacen.guardar(registro);
        return registro.id;
      });
    },

    /** Los planes guardan su propia copia del producto: borrarlo del catálogo no los altera. */
    async eliminar(id: string): Promise<void> {
      await almacen.transaccion(async () => {
        if (!esObjeto(await almacen.obtener(id))) throw new ErrorPersistencia('El producto no existe.');
        await almacen.eliminar(id);
      });
    }
  };
}

export interface AlmacenPlanes {
  obtenerAreaLote(loteId: string): Promise<number | undefined>;
  /** true si el análisis existe y pertenece al lote. */
  analisisDelLote(loteId: string, analisisId: string): Promise<boolean>;
  obtener(id: string): Promise<unknown>;
  listarPorLote(loteId: string): Promise<unknown[]>;
  guardar(registro: PlanFertilizacion): Promise<void>;
  eliminar(id: string): Promise<void>;
  /** Ejecuta `fn` de forma atómica (una transacción en IndexedDB). */
  transaccion<T>(fn: () => Promise<T>): Promise<T>;
}

export interface OpcionesPlan {
  ahora?: Date;
  generarId?: () => string;
  /** Nombre escrito por el usuario para el historial; obligatorio al cambiar de estado. */
  responsable?: string;
  nota?: string;
}

function cambio(estado: EstadoPlan, fecha: string, responsable?: string, nota?: string): CambioEstadoPlan {
  return { estado, fecha, responsable: responsable?.trim() || undefined, nota: nota?.trim() || undefined };
}

/** Un plan verificado sin problemas tiene todos los campos obligatorios. */
function planCompleto(plan: PlanVerificado): PlanFertilizacion {
  const { problemas: _p, camposAdicionales: _c, ...resto } = plan;
  return resto as PlanFertilizacion;
}

export function crearRepositorioPlanes(almacen: AlmacenPlanes) {
  /** Lee el plan y comprueba que pertenece al lote; nunca opera sobre otro lote. */
  async function obtenerDelLote(loteId: string, id: string) {
    const crudo = await almacen.obtener(id);
    if (!esObjeto(crudo) || crudo.loteId !== loteId) throw new ErrorPersistencia('El plan no existe o pertenece a otro lote.');
    return { crudo, plan: verificarPlan(crudo) };
  }

  async function areaDelLote(loteId: string): Promise<number> {
    const area = await almacen.obtenerAreaLote(loteId);
    if (area === undefined) throw new ErrorPersistencia('El lote no existe.');
    return area;
  }

  async function validar(loteId: string, datos: unknown, ahora: Date, areaM2: number): Promise<DatosPlan> {
    const validado = validarDatosPlan(datos, { hoy: ahora, areaM2 });
    if (!validado.ok) throw new ErrorPersistencia('Los datos del plan no son válidos.', validado.errores);
    const { analisisReferenciaId } = validado.datos;
    if (analisisReferenciaId && !(await almacen.analisisDelLote(loteId, analisisReferenciaId))) {
      throw new ErrorPersistencia('El análisis de referencia no existe o pertenece a otro lote.');
    }
    return validado.datos;
  }

  function sinDanos(plan: PlanVerificado, accion: string) {
    if (plan.problemas.length) {
      throw new ErrorPersistencia(
        `El plan tiene datos guardados dañados; no se puede ${accion}. Puedes consultarlo o crear un plan nuevo.`,
        plan.problemas.map(p => `${p.etiqueta}: valor guardado ${p.valorOriginal}`)
      );
    }
  }

  return {
    /** Planes verificados de un lote, del más reciente al más antiguo. */
    async listar(loteId: string): Promise<PlanVerificado[]> {
      const crudos = await almacen.listarPorLote(loteId);
      return ordenarPlanes(crudos.map(verificarPlan).filter(p => p.loteId === loteId));
    },

    /** Crea una propuesta con el área actual del lote. */
    async crear(loteId: string, datos: unknown, opciones: OpcionesPlan = {}): Promise<string> {
      const { ahora = new Date(), generarId = () => crypto.randomUUID(), responsable, nota } = opciones;
      return almacen.transaccion(async () => {
        const area = await areaDelLote(loteId);
        const validado = await validar(loteId, datos, ahora, area);
        const marca = ahora.toISOString();
        const registro: PlanFertilizacion = {
          ...validado,
          id: generarId(),
          loteId,
          areaM2AlCrear: area,
          estado: 'propuesta',
          historial: [cambio('propuesta', marca, responsable, nota)],
          createdAt: marca,
          updatedAt: marca
        };
        await almacen.guardar(registro);
        return registro.id;
      });
    },

    /** Solo una propuesta se edita. El área histórica se conserva salvo petición explícita. */
    async editar(loteId: string, id: string, datos: unknown, opciones: { actualizarArea?: boolean; ahora?: Date } = {}): Promise<void> {
      const { actualizarArea = false, ahora = new Date() } = opciones;
      await almacen.transaccion(async () => {
        const areaLote = await areaDelLote(loteId);
        const { crudo, plan } = await obtenerDelLote(loteId, id);
        sinDanos(plan, 'editar');
        if (plan.estado !== 'propuesta') {
          throw new ErrorPersistencia('Solo se puede editar un plan en propuesta. Devuélvelo a propuesta o, si está aprobado, crea una copia.');
        }
        const area = actualizarArea ? areaLote : plan.areaM2AlCrear as number;
        const validado = await validar(loteId, datos, ahora, area);
        await almacen.guardar({
          ...camposAdicionales(crudo, plan.camposAdicionales),
          ...planCompleto(plan),
          ...validado,
          areaM2AlCrear: area,
          updatedAt: ahora.toISOString()
        });
      });
    },

    async cambiarEstado(loteId: string, id: string, nuevo: EstadoPlan, opciones: OpcionesPlan = {}): Promise<void> {
      const { ahora = new Date(), responsable = '', nota } = opciones;
      await almacen.transaccion(async () => {
        const { crudo, plan } = await obtenerDelLote(loteId, id);
        const permitido = validarCambioEstado(plan, nuevo, responsable);
        if (!permitido.ok) throw new ErrorPersistencia('No se puede cambiar el estado del plan.', permitido.errores);
        const marca = ahora.toISOString();
        await almacen.guardar({
          ...camposAdicionales(crudo, plan.camposAdicionales),
          ...planCompleto(plan),
          estado: nuevo,
          historial: [...plan.historial, cambio(nuevo, marca, responsable, nota)],
          updatedAt: marca
        });
      });
    },

    /** Nueva propuesta a partir de un plan (p. ej. uno aprobado), con el área actual del lote. */
    async copiar(loteId: string, id: string, opciones: OpcionesPlan = {}): Promise<string> {
      const { ahora = new Date(), generarId = () => crypto.randomUUID(), responsable, nota } = opciones;
      return almacen.transaccion(async () => {
        const area = await areaDelLote(loteId);
        const { plan } = await obtenerDelLote(loteId, id);
        sinDanos(plan, 'copiar');
        const { nombre, analisisReferenciaId, metas, lineas } = planCompleto(plan);
        // Si el análisis de referencia ya se eliminó, la copia queda sin referencia en lugar de fallar.
        const referencia = analisisReferenciaId && await almacen.analisisDelLote(loteId, analisisReferenciaId) ? analisisReferenciaId : undefined;
        const nombreCopia = / \(copia\)$/.test(nombre) ? nombre : `${nombre} (copia)`;
        const validado = await validar(loteId, { nombre: nombreCopia, analisisReferenciaId: referencia, metas, lineas }, ahora, area);
        const marca = ahora.toISOString();
        const registro: PlanFertilizacion = {
          ...validado,
          id: generarId(),
          loteId,
          areaM2AlCrear: area,
          planOrigenId: id,
          estado: 'propuesta',
          historial: [cambio('propuesta', marca, responsable, nota ?? `Copia del plan «${nombre}».`)],
          createdAt: marca,
          updatedAt: marca
        };
        await almacen.guardar(registro);
        return registro.id;
      });
    },

    /** Un plan aprobado no se elimina: es el registro de lo que se aprobó. */
    async eliminar(loteId: string, id: string): Promise<void> {
      await almacen.transaccion(async () => {
        const { crudo } = await obtenerDelLote(loteId, id);
        if (crudo.estado === 'aprobado') throw new ErrorPersistencia('Un plan aprobado no se puede eliminar: conserva la trazabilidad de lo aprobado.');
        await almacen.eliminar(id);
      });
    }
  };
}
