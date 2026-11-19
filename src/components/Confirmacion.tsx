import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Ventana pequeña de confirmación (reemplaza a window.confirm). Se llama desde cualquier parte con
 * `await confirmar({...})` y devuelve true solo si el usuario pulsa el botón de confirmar.
 * Escape, "Cancelar" o tocar fuera de la ventana cuentan como cancelar.
 */
export interface OpcionesConfirmacion {
  titulo: string;
  mensaje: string;
  /** Texto del botón que confirma (p. ej. "Cerrar sesión", "Eliminar"). */
  boton: string;
  /** Acción que borra o no se puede deshacer: el botón se muestra en rojo. */
  peligro?: boolean;
}

interface Pendiente extends OpcionesConfirmacion { responder: (si: boolean) => void }

let actual: Pendiente | null = null;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach(o => o());

export function confirmar(opciones: OpcionesConfirmacion): Promise<boolean> {
  actual?.responder(false); // una sola pregunta a la vez
  return new Promise(resolver => {
    actual = {
      ...opciones,
      responder: si => { actual = null; avisar(); resolver(si); }
    };
    avisar();
  });
}

export function DialogoConfirmacion() {
  const pendiente = useSyncExternalStore(o => { oyentes.add(o); return () => oyentes.delete(o); }, () => actual);
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (pendiente && !d.open) d.showModal();
    if (!pendiente && d.open) d.close();
  }, [pendiente]);

  return (
    <dialog
      ref={dialogo}
      className="confirmacion"
      aria-labelledby="confirmacion-titulo"
      aria-describedby="confirmacion-mensaje"
      onCancel={e => { e.preventDefault(); pendiente?.responder(false); }}
      onClick={e => { if (e.target === e.currentTarget) pendiente?.responder(false); }}
    >
      {pendiente && <div className="confirmacion-contenido">
        <h2 id="confirmacion-titulo">{pendiente.titulo}</h2>
        <p id="confirmacion-mensaje">{pendiente.mensaje}</p>
        <div className="confirmacion-botones">
          <button type="button" className="btn btn-outline" autoFocus onClick={() => pendiente.responder(false)}>Cancelar</button>
          <button type="button" className={`btn ${pendiente.peligro ? 'btn-peligro' : 'btn-primary'}`} onClick={() => pendiente.responder(true)}>{pendiente.boton}</button>
        </div>
      </div>}
    </dialog>
  );
}
