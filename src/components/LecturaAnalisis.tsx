import { useState, type ChangeEvent } from 'react';
import { extraerDatosAnalisis, type DatoLeido } from '../lib/lecturaAnalisis';
import { textoDeArchivo } from '../lib/textoDeArchivo';

/**
 * Leer el informe del laboratorio desde un PDF o una foto. Muestra lo que se leyó con la línea de
 * donde salió; el usuario confirma (y corrige si hace falta) cada dato antes de pasarlo al
 * formulario. Lo no confirmado no se usa.
 */
export function LecturaAnalisis({ onAplicar }: { onAplicar: (datos: DatoLeido[]) => void }) {
  const [estado, setEstado] = useState<'inicio' | 'leyendo' | 'revisar' | 'error'>('inicio');
  const [mensaje, setMensaje] = useState('');
  const [datos, setDatos] = useState<DatoLeido[]>([]);
  const [confirmados, setConfirmados] = useState<ReadonlySet<string>>(new Set());

  async function elegir(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setEstado('leyendo');
    setConfirmados(new Set());
    try {
      const texto = await textoDeArchivo(archivo, setMensaje);
      const leidos = extraerDatosAnalisis(texto);
      setDatos(leidos);
      setEstado(leidos.length ? 'revisar' : 'error');
      if (!leidos.length) setMensaje('No se reconocieron datos en el archivo. Escríbelos en el formulario. Si es una foto, intenta con una más nítida, de frente y con buena luz.');
    } catch {
      setEstado('error');
      setMensaje(navigator.onLine
        ? 'No se pudo leer el archivo. Intenta con otro (PDF o foto) o escribe los datos en el formulario.'
        : 'Para leer fotos se necesita internet la primera vez (descarga el idioma español). Conéctate o escribe los datos en el formulario.');
    }
  }

  const alternar = (clave: string, si: boolean) => setConfirmados(c => {
    const nuevo = new Set(c);
    if (si) nuevo.add(clave); else nuevo.delete(clave);
    return nuevo;
  });

  function aplicar() {
    onAplicar(datos.filter(d => confirmados.has(d.clave)));
    setEstado('inicio');
    setDatos([]);
  }

  return (
    <fieldset className="form-group lectura-analisis">
      <legend>Leer el informe desde un archivo</legend>
      <p className="hint">Elige el <strong>PDF</strong> del laboratorio o una <strong>foto</strong> del informe. La app intentará leer los datos, pero <strong>puede equivocarse</strong> (una coma o un número mal leído cambia todo el cálculo): revisa y confirma cada dato antes de pasarlo.</p>
      {estado !== 'leyendo' && <label className="btn btn-outline btn-small lectura-boton">
        Elegir PDF o foto
        <input type="file" accept="application/pdf,image/*" className="sr-only" onChange={e => void elegir(e)} />
      </label>}
      {estado === 'leyendo' && <p className="hint" role="status">{mensaje || 'Leyendo…'}</p>}
      {estado === 'error' && <p className="hint hint-warn" role="alert">{mensaje}</p>}
      {estado === 'revisar' && <div className="lectura-revision">
        <p><strong>Revisa lo que se leyó.</strong> Compara cada valor con la línea del informe y marca solo los que estén bien. Puedes corregir el valor antes de confirmarlo.</p>
        <ul>
          {datos.map((d, i) => <li key={d.clave}>
            <label className="check">
              <input type="checkbox" checked={confirmados.has(d.clave)} onChange={e => alternar(d.clave, e.target.checked)} />
              <span><strong>{d.etiqueta}</strong>{d.nutriente ? ` (${d.nutriente.unidad})` : ''}</span>
            </label>
            <input aria-label={`Valor leído: ${d.etiqueta}`} value={d.valor} onChange={e => { const valor = e.target.value; setDatos(ds => ds.map((x, j) => (j === i ? { ...x, valor } : x))); }} />
            <small>Del informe: «{d.linea}»</small>
          </li>)}
        </ul>
        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={() => { setEstado('inicio'); setDatos([]); }}>Descartar</button>
          <button type="button" className="btn btn-primary" disabled={confirmados.size === 0} onClick={aplicar}>Pasar {confirmados.size} {confirmados.size === 1 ? 'dato confirmado' : 'datos confirmados'} al formulario</button>
        </div>
      </div>}
    </fieldset>
  );
}
