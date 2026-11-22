import { useId, useRef, useState, type ReactNode } from 'react';
import { terminoGlosario, type TerminoGlosario } from '../lib/glosario';

/** Definición corta de un término, debajo del botón que la abrió. */
function Burbuja({ id, termino, onCerrar }: { id: string; termino: TerminoGlosario; onCerrar: () => void }) {
  return (
    <span id={id} className="termino-burbuja" role="note">
      <strong>{termino.termino}.</strong> {termino.definicion}
      {termino.ejemplo && <span className="termino-ejemplo">Por ejemplo: {termino.ejemplo}</span>}
      <button type="button" className="link-button termino-cerrar" onClick={onCerrar}>Cerrar</button>
    </span>
  );
}

/**
 * Término dentro de un texto (p. ej. "la forma química"), subrayado con puntos. Al tocarlo se abre su
 * definición del glosario. No usar dentro de un <label>: el botón entraría en el nombre del campo.
 */
export function Termino({ id, children }: { id: string; children?: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const burbuja = useId();
  const t = terminoGlosario(id);
  if (!t) return <>{children}</>;
  // Al cerrar con "Cerrar", ese botón desaparece: el foco vuelve al término para no perder el lugar.
  const cerrar = () => { setAbierto(false); boton.current?.focus(); };
  return <>
    <button ref={boton} type="button" className="termino-boton" aria-expanded={abierto} aria-controls={abierto ? burbuja : undefined}
      onClick={() => setAbierto(a => !a)}>{children ?? t.termino}</button>
    {abierto && <Burbuja id={burbuja} termino={t} onCerrar={cerrar} />}
  </>;
}

/**
 * Fila "¿Qué significa?" con los términos clave de una sección. Se abre una definición a la vez,
 * debajo de la fila. No usar dentro de un <label>.
 */
export function Terminos({ ids }: { ids: ReadonlyArray<string> }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const botones = useRef(new Map<string, HTMLButtonElement>());
  const base = useId();
  const terminos = ids.map(terminoGlosario).filter((t): t is TerminoGlosario => !!t);
  if (!terminos.length) return null;
  const actual = terminos.find(t => t.id === abierto);
  const cerrar = () => {
    if (abierto) botones.current.get(abierto)?.focus();
    setAbierto(null);
  };
  return (
    <div className="terminos">
      <span className="terminos-titulo">¿Qué significa?</span>
      {terminos.map(t => <button key={t.id} type="button" className="termino-chip" aria-expanded={abierto === t.id}
        ref={b => { if (b) botones.current.set(t.id, b); else botones.current.delete(t.id); }}
        aria-controls={abierto === t.id ? `${base}-${t.id}` : undefined}
        onClick={() => setAbierto(a => (a === t.id ? null : t.id))}>{t.termino}</button>)}
      {actual && <Burbuja id={`${base}-${actual.id}`} termino={actual} onCerrar={cerrar} />}
    </div>
  );
}
