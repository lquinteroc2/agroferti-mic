import { useState, type FormEvent } from 'react';
import { areaM2AHa } from '../lib/calculos';
import { formatearExacto, formatearNumero } from '../lib/formato';
import { ErrorPersistencia } from '../lib/repositorioAnalisis';
import { areaLoteATexto, UNIDADES_AREA, validarAreaEnUnidad, type UnidadArea } from '../lib/validacion';
import { opcionesCultivo, type Cultivo, type Lote } from '../types';

export interface DatosLote {
  nombre: string;
  cultivo: Cultivo;
  areaM2: number;
  fechaSiembra?: string;
  ubicacion?: string;
}

interface Props {
  inicial?: Lote;
  /** `versionInicial`: updatedAt del lote al abrir el formulario, para no pisar cambios hechos en otra pestaña. */
  onGuardar: (datos: DatosLote, versionInicial?: string) => Promise<void>;
  onCancelar: () => void;
}

export function LoteForm({ inicial, onGuardar, onCancelar }: Props) {
  const [versionInicial] = useState(inicial?.updatedAt);
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  // Por ahora la app trabaja solo con papa; un lote guardado con otro cultivo lo conserva.
  const [cultivo, setCultivo] = useState<Cultivo | ''>(inicial?.cultivo ?? 'papa');
  const [area, setArea] = useState(inicial ? areaLoteATexto(inicial.areaM2) : '');
  const [unidad, setUnidad] = useState<UnidadArea>('m2');
  const [fecha, setFecha] = useState(inicial?.fechaSiembra ?? '');
  const [ubicacion, setUbicacion] = useState(inicial?.ubicacion ?? '');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  // Muestra cómo se interpretó el número antes de guardarlo.
  const lecturaArea = validarAreaEnUnidad(area, unidad);

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!nombre.trim()) return setError('Escribe el nombre del lote.');
    if (!cultivo) return setError('Elige el cultivo del lote.');
    if (!lecturaArea.ok) return setError(lecturaArea.error);
    setGuardando(true);
    try {
      await onGuardar({
        nombre: nombre.trim(),
        cultivo,
        areaM2: lecturaArea.valor,
        fechaSiembra: fecha || undefined,
        ubicacion: ubicacion.trim() || undefined
      }, versionInicial);
    } catch (e) {
      setError(e instanceof ErrorPersistencia ? e.message : 'No se pudo guardar. Verifica que tu navegador permita almacenamiento local.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="form-card" onSubmit={enviar} noValidate>
      <div className="section-kicker">PASO 1 · EL LOTE</div>
      <h2>{inicial ? 'Editar lote' : 'Registrar un nuevo lote'}</h2>
      <p className="muted">Estos datos identifican tu terreno.</p>
      <div className="fields">
        <label><span className="campo-titulo">Nombre del lote <span className="required" aria-hidden="true">*</span></span>
          <input value={nombre} onChange={e => { setNombre(e.target.value); setError(''); }} placeholder="Ej. Parcela de papa A" maxLength={70} required autoFocus />
        </label>
        <label><span className="campo-titulo">Cultivo <span className="required" aria-hidden="true">*</span></span>
          <select value={cultivo} onChange={e => { setCultivo(e.target.value as Cultivo); setError(''); }} required>
            {!cultivo && <option value="">Elige…</option>}
            {opcionesCultivo(inicial?.cultivo).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <small>Por ahora la app trabaja solo con papa.{inicial && ' Al cosechar, usa «Cerrar ciclo y empezar uno nuevo» en el historial del lote para no perder lo anterior.'}</small>
        </label>
        <label><span className="campo-titulo">Área del lote <span className="required" aria-hidden="true">*</span></span>
          <span className="area-unidad">
            <input inputMode="decimal" value={area} onChange={e => { setArea(e.target.value); setError(''); }} placeholder={unidad === 'm2' ? 'Ej. 500 o 1500,5' : 'Ej. 1,5'} required aria-describedby="ayuda-area" />
            <select value={unidad} onChange={e => { setUnidad(e.target.value as UnidadArea); setError(''); }} aria-label="Unidad del área">
              {UNIDADES_AREA.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </span>
          <small id="ayuda-area">{lecturaArea.ok
            ? `Se guardará como ${formatearExacto(lecturaArea.valor)} m² (${formatearNumero(areaM2AHa(lecturaArea.valor), 4)} ha).`
            : 'Sin punto de miles (1500, no 1.500); usa coma para decimales.'}
            {' '}1 hectárea = 10.000 m²; 1 fanegada = 6.400 m² (80 m × 80 m, la usual en Cundinamarca y Boyacá).</small>
        </label>
        <label>Fecha de siembra
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
        </label>
        <label className="full">Ubicación o referencia
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
