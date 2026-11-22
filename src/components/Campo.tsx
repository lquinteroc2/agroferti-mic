import type { ReactNode } from 'react';

/**
 * Título de un campo obligatorio, con asterisco. El asterisco no lo lee el lector de pantalla: el
 * control lleva `aria-required` para anunciarlo.
 */
export function Obligatorio({ children }: { children: ReactNode }) {
  return <span className="campo-titulo">{children} <span className="required" aria-hidden="true">*</span></span>;
}

/** Frase de los formularios que explica el asterisco. */
export function NotaObligatorios() {
  return <>Los campos con <span className="required">*</span> son obligatorios.</>;
}

type Origen = '' | 'real' | 'ejemplo';

/**
 * Origen del dato como casilla: sin marcar es un dato real; marcada, un dato de práctica (EJEMPLO).
 * Si el valor guardado no es válido (''), se pide elegirlo de forma expresa con una lista.
 */
export function OrigenDato({ valor, onCambiar, error, real = 'Dato real' }: {
  valor: Origen;
  onCambiar: (origen: 'real' | 'ejemplo') => void;
  error?: string;
  /** Texto de la opción real en la lista (p. ej. "Fuente técnica real"). */
  real?: string;
}) {
  if (valor === '') {
    return <label><Obligatorio>Origen del dato</Obligatorio>
      <select value="" onChange={e => { if (e.target.value === 'real' || e.target.value === 'ejemplo') onCambiar(e.target.value); }} aria-required="true" aria-invalid={!!error}>
        <option value="">Elige…</option>
        <option value="real">{real}</option>
        <option value="ejemplo">EJEMPLO (ficticio)</option>
      </select>
      {error && <span className="field-error">{error}</span>}
    </label>;
  }
  return <label className="check origen-dato">
    <input type="checkbox" checked={valor === 'ejemplo'} onChange={e => onCambiar(e.target.checked ? 'ejemplo' : 'real')} />
    <span>Es un dato de práctica (<strong>EJEMPLO</strong>, ficticio)</span>
    {error && <span className="field-error">{error}</span>}
  </label>;
}
