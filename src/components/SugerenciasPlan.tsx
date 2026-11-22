import { useState } from 'react';
import type { ReglaDosis } from '../lib/referencias';
import { citaDeSugerencia, regionesDelCultivo, requisitosSugerencias, sugerirMetas, type RequisitoSugerencias, type Sugerencia } from '../lib/sugerencias';
import { nombreCultivo } from '../lib/formato';
import type { AnalisisVerificado, Cultivo } from '../types';
import { Terminos } from './Terminos';
import { zonaLoteValida } from '../lib/validacion';

const TIPO_FUENTE: Record<string, string> = {
  'oficial-colombia': 'Fuente oficial colombiana',
  'academica-colombia': 'Fuente académica colombiana',
  andina: 'Fuente de la región andina',
  internacional: 'Fuente internacional'
};

/** Qué hacer para cumplir un requisito que falta. */
function comoCumplir(r: RequisitoSugerencias): string {
  if (r.clave === 'analisis') return 'Elígelo arriba, en «¿Con qué análisis te proponemos las metas?».';
  if (r.clave === 'zona') return 'Elígela aquí abajo.';
  return r.motivo ? `${r.motivo} Para corregirlo, edita el análisis.` : 'Depende del análisis que elijas.';
}

/**
 * Metas sugeridas a partir del análisis de suelo y de las referencias técnicas de la nube. Muestra
 * primero lo que falta para poder proponerlas y después los rangos con su cita. Al usarlas, la meta
 * se propone con el punto medio del rango y el usuario puede cambiarla antes de guardar.
 */
export function SugerenciasPlan({ cultivo, analisis, reglas, descargadas, zonaLote, onGuardarZona, onUsar, onUsarTodas }: {
  cultivo: Cultivo;
  analisis?: AnalisisVerificado;
  reglas: ReadonlyArray<ReglaDosis>;
  /** false: el dispositivo aún no ha descargado las referencias de la nube. */
  descargadas: boolean;
  /** Zona guardada en el lote: se usa sin volver a elegirla. */
  zonaLote?: string;
  /** Guarda la zona elegida en el lote, para las próximas propuestas. */
  onGuardarZona?: (zona: string) => Promise<void>;
  onUsar: (s: Sugerencia) => void;
  /** Usa todas las sugerencias que aplican de una vez. */
  onUsarTodas?: (s: Sugerencia[]) => void;
}) {
  const regiones = regionesDelCultivo(reglas, cultivo);
  // Mientras el usuario no elija otra, se usa la zona del lote (si sigue en las referencias).
  const [elegida, setElegida] = useState<string | null>(null);
  const region = elegida ?? (zonaLote && regiones.includes(zonaLote) ? zonaLote : '');
  const [guardandoZona, setGuardandoZona] = useState(false);
  const [avisoZona, setAvisoZona] = useState<{ error: boolean; texto: string } | null>(null);
  const resultado = sugerirMetas({ cultivo, region: region || undefined, analisis, reglas });
  const requisitos = requisitosSugerencias({ cultivo, region: region || undefined, analisis, reglas });
  const faltan = requisitos.filter(r => !r.cumple);
  const hayReglas = reglas.some(r => r.cultivo === cultivo);

  async function guardarZona() {
    if (!onGuardarZona || !region) return;
    setGuardandoZona(true);
    setAvisoZona(null);
    try {
      await onGuardarZona(region);
      setAvisoZona({ error: false, texto: 'Se guardó como zona del lote. Puedes cambiarla en «Editar información» del lote.' });
    } catch {
      setAvisoZona({ error: true, texto: 'No se pudo guardar la zona en el lote. Vuelve a intentarlo.' });
    } finally {
      setGuardandoZona(false);
    }
  }

  return (
    <section className="sugerencias" aria-labelledby="titulo-sugerencias">
      <h3 id="titulo-sugerencias">Metas que te propone la app</h3>
      {!descargadas ? <p className="hint">Las referencias técnicas se descargan de la nube al sincronizar. Conéctate a internet y vuelve a abrir el formulario.</p>
        : !hayReglas ? <p className="hint">Todavía no hay referencias publicadas para {nombreCultivo(cultivo).toLowerCase()}. Escribe las metas de tu fuente técnica.</p>
        : <>
          <p className="hint">Según tu análisis de suelo y la zona del lote, la app busca en las referencias técnicas cuánto nitrógeno, fósforo y potasio aplicar. Al usar una sugerencia, la meta queda con el <strong>punto medio del rango</strong>; puedes cambiarla. Cada rango sale de la fuente citada y puede ser antiguo o de otra zona.</p>
          <Terminos ids={['zona', 'rango', 'punto-medio', 'castro-franco', 'bray-ii']} />

          {requisitos.length > 0 && <div className={`requisitos${faltan.length ? '' : ' requisitos-listos'}`} role="status">
            <strong>{faltan.length ? 'Para proponerte metas necesito:' : 'La app tiene lo que necesita para proponerte metas.'}</strong>
            {faltan.length > 0 && <ul className="requisitos-lista">{requisitos.map(r => <li key={r.clave} className={r.cumple ? 'cumple' : 'falta'}>
              <span className="sr-only">{r.cumple ? 'Listo: ' : 'Falta: '}</span>{r.texto}
              {!r.cumple && <small>{comoCumplir(r)}</small>}
            </li>)}</ul>}
          </div>}

          {regiones.length > 0 && <div className="sugerencias-zona">
            <label className="sugerencias-region">Zona del lote
              <select value={region} onChange={e => { setElegida(e.target.value); setAvisoZona(null); }}>
                <option value="">Elige la zona…</option>
                {regiones.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            {region && region !== zonaLote && onGuardarZona && zonaLoteValida(region) && <button type="button" className="link-button" disabled={guardandoZona} onClick={() => void guardarZona()}>
              {guardandoZona ? 'Guardando…' : 'Guardar como zona del lote (para no elegirla otra vez)'}
            </button>}
            {region && region === zonaLote && !avisoZona && <small className="muted">Es la zona guardada en el lote.</small>}
            {avisoZona && <small className={avisoZona.error ? 'field-error' : 'muted'} role={avisoZona.error ? 'alert' : 'status'}>{avisoZona.texto}</small>}
          </div>}

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
          {resultado.sugerencias.length === 0 && faltan.length === 0 && <>
            {analisis && <p className="muted">Con este análisis no hay una referencia que aplique.</p>}
            {resultado.noAplican.length > 0 && <ul className="muted">{[...new Set(resultado.noAplican.map(n => n.motivo))].map(m => <li key={m}>{m}</li>)}</ul>}
          </>}
        </>}
    </section>
  );
}
