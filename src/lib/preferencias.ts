/**
 * Preferencias de este dispositivo (no se suben a la nube). Por ahora, el modo práctica: con él, lo
 * nuevo que se registre queda marcado como EJEMPLO, para practicar o presentar sin mezclar datos reales.
 */
const CLAVE_MODO_PRACTICA = 'agroferti:modo-practica';
const oyentes = new Set<() => void>();

/** true si el modo práctica está activo en este dispositivo. Sin almacenamiento disponible, false. */
export function modoPractica(): boolean {
  try {
    return globalThis.localStorage?.getItem(CLAVE_MODO_PRACTICA) === '1';
  } catch {
    return false;
  }
}

export function cambiarModoPractica(activo: boolean): void {
  try {
    if (activo) globalThis.localStorage?.setItem(CLAVE_MODO_PRACTICA, '1');
    else globalThis.localStorage?.removeItem(CLAVE_MODO_PRACTICA);
  } catch {
    // Sin almacenamiento (p. ej. navegación privada estricta), el modo práctica no se guarda.
  }
  oyentes.forEach(avisar => avisar());
}

/** Para useSyncExternalStore: la interfaz se actualiza al activar o desactivar el modo. */
export const preferenciasExternas = {
  suscribir(avisar: () => void): () => void {
    oyentes.add(avisar);
    // Otra pestaña con la app abierta cambió el modo: el aviso y los formularios de esta se actualizan.
    const deOtraPestana = (e: StorageEvent) => { if (e.key === CLAVE_MODO_PRACTICA || e.key === null) avisar(); };
    globalThis.addEventListener?.('storage', deOtraPestana);
    return () => {
      oyentes.delete(avisar);
      globalThis.removeEventListener?.('storage', deOtraPestana);
    };
  },
  leer: modoPractica
};

/** Origen con el que empieza un registro nuevo: real, o EJEMPLO en modo práctica. */
export function origenInicial(): 'real' | 'ejemplo' {
  return modoPractica() ? 'ejemplo' : 'real';
}
