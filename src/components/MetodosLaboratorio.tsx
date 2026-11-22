import { useState } from 'react';
import { BASES, FOSFORO, leerMetodos, unirMetodos, type Partes } from '../lib/metodosLaboratorio';

/**
 * Método del laboratorio, preguntado por nutriente y con opciones cerradas, en lugar de un texto
 * libre difícil de entender. Se guarda como un solo texto (p. ej. "Bray II (fósforo), Acetato de
 * amonio (potasio, calcio y magnesio)"), el mismo campo de siempre.
 */
const NO_APARECE = '';
const OTRO = '__otro';

export function MetodosLaboratorio({ valor, onChange }: { valor: string; onChange: (texto: string) => void }) {
  const [partes, setPartes] = useState(() => leerMetodos(valor));
  const [otroP, setOtroP] = useState(false);
  const [otroBases, setOtroBases] = useState(false);

  const cambiar = (cambios: Partial<Partes>) => {
    const nuevas = { ...partes, ...cambios };
    setPartes(nuevas);
    onChange(unirMetodos(nuevas));
  };
  const elegir = (campo: 'p' | 'bases', v: string, setOtro: (si: boolean) => void) => {
    setOtro(v === OTRO);
    cambiar({ [campo]: v === OTRO ? '' : v });
  };

  return (
    <fieldset className="metodos-lab full">
      <legend>¿Con qué método midió el laboratorio?</legend>
      <p className="hint">Búscalo en el informe, al lado del nombre del nutriente (por ejemplo «Fósforo <strong>Bray II</strong>» o «P-<strong>Olsen</strong>») o en una nota al pie de la tabla. Si no lo encuentras, elige «No aparece en el informe».</p>
      <label>Fósforo (P)
        <select value={otroP ? OTRO : partes.p} onChange={e => elegir('p', e.target.value, setOtroP)}>
          <option value={NO_APARECE}>No aparece en el informe</option>
          {FOSFORO.map(m => <option key={m} value={m}>{m}</option>)}
          <option value={OTRO}>Otro (escríbelo abajo)</option>
        </select>
        <small>La referencia de papa que usa la app (Castro Franco, 2005) da las metas de fósforo según el fósforo medido con <strong>Bray II</strong>.</small>
      </label>
      <label>Potasio, calcio y magnesio
        <select value={otroBases ? OTRO : partes.bases} onChange={e => elegir('bases', e.target.value, setOtroBases)}>
          <option value={NO_APARECE}>No aparece en el informe</option>
          {BASES.map(m => <option key={m} value={m}>{m}</option>)}
          <option value={OTRO}>Otro (escríbelo abajo)</option>
        </select>
      </label>
      <label className="full">Otros métodos que aparecen en el informe
        <input value={partes.otros} onChange={e => cambiar({ otros: e.target.value })} maxLength={60} placeholder="Ej. Walkley-Black (materia orgánica), DTPA" />
        <small>Escríbelos tal como aparecen, separados por coma. Puedes dejarlo vacío.</small>
      </label>
    </fieldset>
  );
}
