import { useState } from 'react';
import type { ReglaDosis } from '../lib/referencias';
import { citaDeSugerencia, sugerirMetas, type Sugerencia } from '../lib/sugerencias';
import { nombreCultivo } from '../lib/formato';
import type { AnalisisVerificado, Cultivo } from '../types';

const TIPO_FUENTE: Record<string, string> = {
  'oficial-colombia': 'Fuente oficial colombiana',
  'academica-colombia': 'Fuente académica colombiana',
  andina: 'Fuente de la región andina',
  internacional: 'Fuente internacional'
};

/**
 * Metas sugeridas a partir del análisis de suelo y de las referencias técnicas de la nube. Muestra
 * rangos con su cita y el motivo. Al usarlas, la meta se propone con el punto medio del rango y el
 * usuario puede cambiarla antes de guardar.
 */
export function SugerenciasPlan({ cultivo, analisis, reglas, descargadas, onUsar, onUsarTodas }: {
  cultivo: Cultivo;
  analisis?: AnalisisVerificado;
  reglas: ReadonlyArray<ReglaDosis>;
  /** false: el dispositivo aún no ha descargado las referencias de la nube. */
  descargadas: boolean;
  onUsar: (s: Sugerencia) => void;
  /** Usa todas las sugerencias que aplican de una vez. */
  onUsarTodas?: (s: Sugerencia[]) => void;
}) {
  const [region, setRegion] = useState('');
  const resultado = sugerirMetas({ cultivo, region: region || undefined, analisis, reglas });
  const hayReglas = reglas.some(r => r.cultivo === cultivo);

  return (
    <section className="sugerencias" aria-labelledby="titulo-sugerencias">
      <h3 id="titulo-sugerencias">Metas que te propone la app</h3>
      {!descargadas ? <p className="hint">Las referencias técnicas se descargan de la nube al sincronizar. Conéctate a internet y vuelve a abrir el formulario.</p>
        : !hayReglas ? <p className="hint">Todavía no hay referencias publicadas para {nombreCultivo(cultivo).toLowerCase()}. Escribe las metas de tu fuente técnica.</p>
        : <>
          <p className="hint">Según tu análisis de suelo y la zona del lote, la app busca en las referencias técnicas cuánto nitrógeno, fósforo y potasio aplicar. Al usar una sugerencia, la meta queda con el <strong>punto medio del rango</strong>; puedes cambiarla.</p>
          <p className="hint hint-warn"><strong>Es una propuesta, no una prescripción.</strong> Cada rango sale de la fuente citada y puede ser antiguo o de otra zona. Revísalo con un agrónomo antes de aplicar.</p>
          {resultado.regiones.length > 0 && <label className="sugerencias-region">Zona del lote
            <select value={region} onChange={e => setRegion(e.target.value)}>
              <option value="">Elige la zona…</option>
              {resultado.regiones.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>}
          {!analisis && <p className="muted">Elige arriba el <strong>análisis de suelo de referencia</strong> para ver las sugerencias que dependen del fósforo, el potasio u otros resultados.</p>}
          {resultado.sugerencias.length > 1 && onUsarTodas && <button type="button" className="btn btn-primary btn-small" onClick={() => onUsarTodas(resultado.sugerencias)}>Usar las {resultado.sugerencias.length} metas propuestas</button>}
          {resultado.sugerencias.length > 0 && <ul className="sugerencias-lista">
            {resultado.sugerencias.map((s, i) => <li key={`${s.regla.id}-${s.forma}-${i}`}>
              <div>
                <strong>{s.forma}: {s.minKgHa === s.maxKgHa ? s.minKgHa : `${s.minKgHa} a ${s.maxKgHa}`} kg/ha</strong>
                <small>{s.motivo}</small>
                <small className="sugerencias-fuente">{citaDeSugerencia(s).split(' · ')[0]} · {TIPO_FUENTE[s.regla.fuente.tipo] ?? s.regla.fuente.tipo}{s.regla.verificacion !== 'ok' && ' · pendiente de verificar'}</small>
                {s.regla.notas && <small>{s.regla.notas}</small>}
              </div>
              <button type="button" className="btn btn-outline btn-small" onClick={() => onUsar(s)}>Usar como meta</button>
            </li>)}
          </ul>}
          {resultado.sugerencias.length === 0 && (region || !resultado.regiones.length) && analisis && <p className="muted">Con este análisis no hay una referencia que aplique.</p>}
          {resultado.noAplican.length > 0 && <details className="sugerencias-no">
            <summary>Por qué algunas referencias no aplican ({resultado.noAplican.length})</summary>
            <ul>{[...new Set(resultado.noAplican.map(n => n.motivo))].map(m => <li key={m}>{m}</li>)}</ul>
          </details>}
        </>}
    </section>
  );
}
