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
