import { useEffect, useState } from 'react';
import { useCapaAtras } from '../lib/navegacion';

export type ModoSeccion = 'lista' | 'nuevo' | 'editar' | 'ver';

/**
 * Registro abierto en una sección (lista, nuevo, editar, ver) sobre una consulta en vivo.
 * - Tras guardar, espera a que la consulta traiga el registro en lugar de mostrar la lista un instante.
 * - Si el registro abierto deja de existir (p. ej. se eliminó en otra pestaña), vuelve a la lista.
 * - El botón "atrás" del celular vuelve a la lista; al abrir, la vista va al título de la sección indicado por anclaId.
 */
export function useSeleccionViva<T extends { id: string }>(lista: ReadonlyArray<T> | undefined, anclaId?: string) {
  const [modo, setModo] = useState<ModoSeccion>('lista');
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const [pendienteId, setPendienteId] = useState<string | null>(null);
  const seleccionado = lista?.find(x => x.id === seleccionId);
  const perdido = (modo === 'ver' || modo === 'editar') && lista !== undefined && !seleccionado;
  const esperando = perdido && pendienteId !== null && pendienteId === seleccionId;
  useEffect(() => {
    if (seleccionado && seleccionado.id === pendienteId) setPendienteId(null);
  }, [seleccionado, pendienteId]);
  useCapaAtras(modo !== 'lista', () => setModo('lista'), anclaId, modo === 'nuevo' || modo === 'editar');

  return {
    /** Modo pedido por el usuario (para montar formularios y detalle). */
    modo,
    /** Modo que se muestra: la lista si el registro abierto ya no existe. */
    modoVisible: (perdido && !esperando ? 'lista' : modo) as ModoSeccion,
    seleccionado,
    esperando,
    abrir(m: ModoSeccion, id: string | null = seleccionId) {
      setPendienteId(null);
      setSeleccionId(id);
      setModo(m);
    },
    /** Muestra el detalle de un registro recién guardado. */
    verGuardado(id: string) {
      setSeleccionId(id);
      setPendienteId(id);
      setModo('ver');
    }
  };
}
