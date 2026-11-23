import { useId, useState } from 'react';
import { BASES, FOSFORO, OTRO_METODO, leerMetodos, mensajeAlLaboratorio, unirMetodos, type Partes } from '../lib/metodosLaboratorio';

/**
 * Método del laboratorio. Solo el del fósforo cambia lo que la app propone (la tabla de metas de
 * papa usa fósforo medido con Bray II), así que es la única pregunta a la vista, con tres respuestas
 * sencillas. Si el informe no lo dice, la app ofrece un mensaje listo para preguntarle al
 * laboratorio. Los demás métodos son opcionales. Todo se guarda como un solo texto (p. ej.
 * "Bray II (fósforo), Acetato de amonio (potasio, calcio y magnesio)"), el mismo campo de siempre.
 */
type Respuesta = '' | 'bray' | 'otro' | 'no-dice';
const OTROS_P = FOSFORO.filter(m => m !== 'Bray II');
const OTRO = '__otro';

function respuestaInicial(p: string): Respuesta {
  return p === 'Bray II' ? 'bray' : p ? 'otro' : '';
}

export function MetodosLaboratorio({ valor, onChange, fechaLegible }: {
  valor: string;
  onChange: (texto: string) => void;
  /** Fecha del análisis ya escrita para leer, para el mensaje al laboratorio. */
  fechaLegible?: string;
}) {
  const id = useId();
  const [partes, setPartes] = useState(() => leerMetodos(valor));
  const [respuesta, setRespuesta] = useState<Respuesta>(() => respuestaInicial(leerMetodos(valor).p));
  const [otroBases, setOtroBases] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const cambiar = (cambios: Partial<Partes>) => {
    const nuevas = { ...partes, ...cambios };
    setPartes(nuevas);
    onChange(unirMetodos(nuevas));
  };
  const responder = (r: Respuesta) => {
    setRespuesta(r);
    setCopiado(false);
    cambiar({ p: r === 'bray' ? 'Bray II' : r === 'otro' ? (partes.p && partes.p !== 'Bray II' ? partes.p : OTRO_METODO) : '' });
  };
  const elegirBases = (v: string) => {
    setOtroBases(v === OTRO);
    cambiar({ bases: v === OTRO ? '' : v });
  };

  const mensaje = mensajeAlLaboratorio(fechaLegible);
  const puedeCompartir = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }
  async function compartir() {
    try { await navigator.share({ text: mensaje }); } catch { /* la persona cerró la ventana de compartir */ }
  }

  // Un método distinto de la lista (escrito antes o leído de un archivo) también se puede elegir.
  const opcionesOtro = partes.p && partes.p !== 'Bray II' && partes.p !== OTRO_METODO && !OTROS_P.includes(partes.p) ? [...OTROS_P, partes.p] : OTROS_P;

  return (
    <fieldset className="metodos-lab full">
      <legend>¿Cómo midió el laboratorio el fósforo?</legend>
      <p className="hint">Búscalo en el informe junto al fósforo (por ejemplo «P Bray II» o «Fósforo (Olsen)») o en la nota de métodos. Es el único método que cambia lo que te propone la app: la tabla de metas de papa (Castro Franco, 2005) usa fósforo medido con <strong>Bray II</strong>.</p>
      <div className="metodo-respuestas full">
        <label className="check"><input type="radio" name={`metodo-p-${id}`} checked={respuesta === 'bray'} onChange={() => responder('bray')} /> Bray II</label>
        <label className="check"><input type="radio" name={`metodo-p-${id}`} checked={respuesta === 'otro'} onChange={() => responder('otro')} /> Otro método (Olsen, Mehlich-3 u otro)</label>
        <label className="check"><input type="radio" name={`metodo-p-${id}`} checked={respuesta === 'no-dice'} onChange={() => responder('no-dice')} /> El informe no lo dice o no lo sé</label>
      </div>

      {respuesta === 'otro' && <label className="full">¿Cuál? (si el informe lo dice)
        <select value={partes.p === OTRO_METODO ? '' : partes.p} onChange={e => cambiar({ p: e.target.value || OTRO_METODO })}>
          <option value="">No lo dice</option>
          {opcionesOtro.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <small>Con otro método, la meta de fósforo la escribes con tu asistente técnico. Las metas de nitrógeno y potasio no dependen del método.</small>
      </label>}

      {respuesta === 'no-dice' && <div className="hint hint-warn full metodo-pregunta" role="status">
        <p>Sin este dato, la app no te propone la meta de fósforo (las de nitrógeno y potasio no dependen de él). Pregúntale al laboratorio (su teléfono o correo suele estar en el informe). Puedes enviarle este mensaje:</p>
        <p className="mensaje-laboratorio">{mensaje}</p>
        <div className="detalle-botones">
          {puedeCompartir && <button type="button" className="btn btn-outline btn-small" onClick={() => void compartir()}>Enviar el mensaje</button>}
          <button type="button" className="btn btn-outline btn-small" onClick={() => void copiar()}>{copiado ? 'Mensaje copiado' : 'Copiar el mensaje'}</button>
        </div>
        <p>Cuando te respondan, edita este análisis y marca el método.</p>
      </div>}

      <details className="full metodos-otros">
        <summary>Otros métodos del informe (opcional)</summary>
        <label>Potasio, calcio y magnesio
          <select value={otroBases ? OTRO : partes.bases} onChange={e => elegirBases(e.target.value)}>
            <option value="">No aparece en el informe</option>
            {BASES.map(m => <option key={m} value={m}>{m}</option>)}
            <option value={OTRO}>Otro (escríbelo abajo)</option>
          </select>
        </label>
        <label>Otros métodos que aparecen en el informe
          <input value={partes.otros} onChange={e => cambiar({ otros: e.target.value })} maxLength={60} placeholder="Ej. Walkley-Black (materia orgánica), DTPA" />
          <small>Escríbelos tal como aparecen, separados por coma. Puedes dejarlo vacío.</small>
        </label>
      </details>
    </fieldset>
  );
}
