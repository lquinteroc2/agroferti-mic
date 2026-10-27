import { useState, type FormEvent } from 'react';
import { CULTIVOS, type Cultivo, type Lote } from '../types';

export interface DatosLote {
  nombre: string;
  cultivo: Cultivo;
  areaM2: number;
  fechaSiembra?: string;
  ubicacion?: string;
}

interface Props {
  inicial?: Lote;
  onGuardar: (datos: DatosLote) => Promise<void>;
  onCancelar: () => void;
}

export function LoteForm({ inicial, onGuardar, onCancelar }: Props) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [cultivo, setCultivo] = useState<Cultivo>(inicial?.cultivo ?? 'papa');
  const [area, setArea] = useState(inicial ? String(inicial.areaM2) : '');
  const [fecha, setFecha] = useState(inicial?.fechaSiembra ?? '');
  const [ubicacion, setUbicacion] = useState(inicial?.ubicacion ?? '');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const areaNumerica = Number(area);
    if (!nombre.trim()) return setError('Escribe el nombre del lote.');
    if (!area.trim() || !Number.isFinite(areaNumerica) || areaNumerica <= 0) {
      return setError('El área debe ser un número mayor que cero.');
    }
    if (areaNumerica > 10_000_000_000) return setError('Revisa el área: supera un valor razonable para esta aplicación.');
    setGuardando(true);
    try {
      await onGuardar({
        nombre: nombre.trim(),
        cultivo,
        areaM2: areaNumerica,
        fechaSiembra: fecha || undefined,
        ubicacion: ubicacion.trim() || undefined
      });
    } catch {
      setError('No se pudo guardar. Verifica que tu navegador permita almacenamiento local.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="form-card" onSubmit={enviar}>
      <div className="section-kicker">PASO 1 DE 3 · CREAR EL LOTE</div>
      <h2>{inicial ? 'Editar lote' : 'Registrar un nuevo lote'}</h2>
      <p className="muted">Estos datos identifican tu terreno. No se calcula ninguna dosis de fertilización todavía.</p>
      <div className="fields">
        <label>Nombre del lote <span className="required">*</span>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Parcela de papa A" maxLength={70} required autoFocus />
        </label>
        <label>Cultivo <span className="required">*</span>
          <select value={cultivo} onChange={e => setCultivo(e.target.value as Cultivo)}>
            {CULTIVOS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label>Área del lote en m² <span className="required">*</span>
          <input type="number" inputMode="decimal" min="0.01" max="10000000000" step="any" value={area} onChange={e => setArea(e.target.value)} placeholder="Ej. 500" required />
          <small>1 hectárea = 10.000 m².</small>
        </label>
        <label>Fecha de siembra (opcional)
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
        </label>
        <label className="full">Ubicación o referencia (opcional)
          <input value={ubicacion} onChange={e => setUbicacion(e.target.value)} maxLength={140} placeholder="Ej. Vereda, invernadero o sector" />
        </label>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="form-actions">
        <button className="btn btn-outline" type="button" onClick={onCancelar}>Cancelar</button>
        <button className="btn btn-primary" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar lote'}</button>
      </div>
    </form>
  );
}
