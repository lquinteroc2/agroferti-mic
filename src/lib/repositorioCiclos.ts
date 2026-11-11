/**
 * Reglas de persistencia del historial del lote (ciclos de cultivo), independientes de Dexie para
 * probarlas en Node con un almacén en memoria. `db.ts` aporta el almacén real.
 */
import { MOTIVOS_CIERRE, type CicloCultivo, type CicloVerificado, type Lote, type MotivoCierre } from '../types.ts';
import { MAX_NOTAS_CICLO, ordenarCiclos, validarDatosCierre, verificarCiclo } from './historial.ts';
import { ErrorPersistencia } from './repositorioAnalisis.ts';
import { esObjeto, problemaLote } from './validacion.ts';

export interface AlmacenCiclos {
  obtenerLote(loteId: string): Promise<unknown>;
  guardarLote(lote: Lote): Promise<void>;
  obtener(id: string): Promise<unknown>;
  listarPorLote(loteId: string): Promise<unknown[]>;
  guardar(ciclo: CicloCultivo): Promise<void>;
  eliminar(id: string): Promise<void>;
  /** Ejecuta `fn` de forma atómica (una transacción en IndexedDB). */
  transaccion<T>(fn: () => Promise<T>): Promise<T>;
}

/** Lo único que se corrige de un ciclo cerrado: sus fechas y cultivo ordenan el historial. */
export interface DatosNotasCiclo {
  motivo: MotivoCierre;
  notas?: string;
  esEjemplo: boolean;
}

export function crearRepositorioCiclos(almacen: AlmacenCiclos) {
  async function listar(loteId: string): Promise<CicloVerificado[]> {
    return ordenarCiclos((await almacen.listarPorLote(loteId)).map(verificarCiclo).filter(v => v.loteId === loteId));
  }

  /** Lee el ciclo y comprueba que pertenece al lote; nunca opera sobre otro lote. */
  async function obtenerDelLote(loteId: string, id: string) {
    const crudo = await almacen.obtener(id);
    if (!esObjeto(crudo) || crudo.loteId !== loteId) throw new ErrorPersistencia('El ciclo no existe o pertenece a otro lote.');
    return { crudo, verificado: verificarCiclo(crudo) };
  }

  return {
    /** Ciclos verificados del lote, del cierre más reciente al más antiguo. */
    listar,

    /**
     * Guarda el cultivo actual del lote como ciclo cerrado y deja el lote con el nuevo cultivo, en
     * una sola transacción. No mueve, borra ni cambia análisis, planes ni registros.
     */
    async cerrarCiclo(loteId: string, datos: unknown, { ahora = new Date(), generarId = () => crypto.randomUUID() }: { ahora?: Date; generarId?: () => string } = {}): Promise<string> {
      return almacen.transaccion(async () => {
        const crudo = await almacen.obtenerLote(loteId);
        if (!esObjeto(crudo) || crudo.id !== loteId) throw new ErrorPersistencia('El lote no existe.');
        const problema = problemaLote(crudo);
        if (problema) throw new ErrorPersistencia(`El lote tiene datos guardados que no son válidos: ${problema}`);
        const lote = crudo as unknown as Lote;
        const ultimoCierre = (await listar(loteId)).find(v => v.fechaCierre)?.fechaCierre;
        const validado = validarDatosCierre(datos, { fechaSiembraActual: lote.fechaSiembra, ultimoCierre, hoy: ahora });
        if (!validado.ok) throw new ErrorPersistencia('Los datos del cierre no son válidos.', validado.errores);
        const d = validado.datos;
        const marca = ahora.toISOString();
        const ciclo: CicloCultivo = {
          id: generarId(),
          loteId,
          cultivo: lote.cultivo,
          fechaSiembra: lote.fechaSiembra,
          fechaCierre: d.fechaCierre,
          areaM2: lote.areaM2,
          motivo: d.motivo,
          notas: d.notas,
          esEjemplo: d.esEjemplo,
          createdAt: marca,
          updatedAt: marca
        };
        // El resto de los datos del lote (nombre, área, ubicación, campos de otras versiones) se conserva.
        const { fechaSiembra: _anterior, ...resto } = lote;
        await almacen.guardar(ciclo);
        await almacen.guardarLote({
          ...resto,
          cultivo: d.nuevoCultivo,
          ...(d.nuevaFechaSiembra ? { fechaSiembra: d.nuevaFechaSiembra } : {}),
          updatedAt: marca
        });
        return ciclo.id;
      });
    },

    /** Corrige cómo terminó, las notas y el origen de un ciclo sano. Un ciclo dañado solo se elimina. */
    async editarNotas(loteId: string, id: string, datos: DatosNotasCiclo, { ahora = new Date() }: { ahora?: Date } = {}): Promise<void> {
      await almacen.transaccion(async () => {
        const { crudo, verificado } = await obtenerDelLote(loteId, id);
        if (!verificado.ciclo) throw new ErrorPersistencia('El ciclo tiene datos guardados dañados; solo se puede eliminar.');
        const errores: string[] = [];
        if (!MOTIVOS_CIERRE.some(m => m.value === datos.motivo)) errores.push('Cómo terminó: elige una opción de la lista.');
        if (datos.notas !== undefined && (typeof datos.notas !== 'string' || datos.notas.length > MAX_NOTAS_CICLO)) errores.push(`Resultado y notas: tiene más de ${MAX_NOTAS_CICLO} caracteres.`);
        if (typeof datos.esEjemplo !== 'boolean') errores.push('Indica si es un dato real o de EJEMPLO.');
        if (errores.length) throw new ErrorPersistencia('Los datos del ciclo no son válidos.', errores);
        const { notas: _n, ...sinNotas } = crudo;
        await almacen.guardar({
          ...sinNotas,
          motivo: datos.motivo,
          ...(datos.notas?.trim() ? { notas: datos.notas.trim() } : {}),
          esEjemplo: datos.esEjemplo,
          updatedAt: ahora.toISOString()
        } as unknown as CicloCultivo);
      });
    },

    /** Quita el ciclo del historial. No cambia el lote ni borra análisis, planes o registros. */
    async eliminar(loteId: string, id: string): Promise<void> {
      await almacen.transaccion(async () => {
        await obtenerDelLote(loteId, id);
        await almacen.eliminar(id);
      });
    }
  };
}
