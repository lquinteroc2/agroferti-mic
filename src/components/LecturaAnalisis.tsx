import { useState, type ChangeEvent } from 'react';
import { extraerDatosAnalisis, type DatoLeido } from '../lib/lecturaAnalisis';
import { FORMATOS_ADJUNTO, FormatoNoAdmitido, formatoDe, leerArchivo } from '../lib/textoDeArchivo';

/**
 * Leer el informe del laboratorio desde un archivo adjunto (PDF, imagen o texto). Muestra lo que se leyó con la línea de
 * donde salió; el usuario confirma (y corrige si hace falta) cada dato antes de pasarlo al
 * formulario. Lo no confirmado no se usa.
 */
export function LecturaAnalisis({ onAplicar }: { onAplicar: (datos: DatoLeido[]) => void }) {
  const [estado, setEstado] = useState<'inicio' | 'leyendo' | 'revisar' | 'error'>('inicio');
  const [mensaje, setMensaje] = useState('');
  /** Error técnico de la lectura, para quien dé soporte (el mensaje principal es para el productor). */
  const [detalle, setDetalle] = useState('');
  const [datos, setDatos] = useState<DatoLeido[]>([]);
  const [confirmados, setConfirmados] = useState<ReadonlySet<string>>(new Set());

  async function elegir(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setEstado('leyendo');
    setConfirmados(new Set());
    setDetalle('');
    try {
      const { texto, celdas } = await leerArchivo(archivo, setMensaje);
      const leidos = extraerDatosAnalisis(texto, celdas);
      setDatos(leidos);
      setEstado(leidos.length ? 'revisar' : 'error');
      if (!leidos.length) setMensaje('No se reconocieron datos en el archivo. Escríbelos en el formulario. Si es una imagen, intenta con una foto más nítida, de frente y con buena luz.');
    } catch (error) {
      setEstado('error');
      if (error instanceof FormatoNoAdmitido) { setMensaje(error.message); return; }
      setDetalle(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      setMensaje(navigator.onLine
        ? 'No se pudo leer el archivo. Intenta con otro archivo o escribe los datos en el formulario.'
        : formatoDe(archivo.name, archivo.type) === 'pdf'
          ? 'Para leer un PDF se necesita internet (la lectura se descarga al usarla). Conéctate o escribe los datos en el formulario.'
          : 'Para leer imágenes se necesita internet la primera vez (descarga el idioma español). Conéctate o escribe los datos en el formulario.');
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
      <p className="hint">Adjunta el informe del laboratorio: <strong>PDF</strong>, imagen (<strong>JPG</strong>, PNG, WEBP, BMP o GIF, por ejemplo una foto o un escaneo) o texto (TXT o CSV). La app intentará leer los datos, pero <strong>puede equivocarse</strong> (una coma o un número mal leído cambia todo el cálculo): revisa y confirma cada dato antes de pasarlo.</p>
      {estado !== 'leyendo' && <label className="btn btn-outline btn-small lectura-boton">
        Adjuntar archivo
        <input type="file" accept={FORMATOS_ADJUNTO} className="sr-only" onChange={e => void elegir(e)} />
      </label>}
      {estado === 'leyendo' && <p className="hint" role="status">{mensaje || 'Leyendo…'}</p>}
      {estado === 'error' && <div role="alert">
        <p className="hint hint-warn">{mensaje}</p>
        {detalle && <details className="muted"><summary>Ver detalle para soporte</summary><small>{detalle}</small></details>}
      </div>}
      {estado === 'revisar' && <div className="lectura-revision">
        <p><strong>Revisa lo que se leyó.</strong> Compara cada valor con la línea del informe y marca solo los que estén bien. Puedes corregir el valor antes de confirmarlo.</p>
        <ul>
          {datos.map((d, i) => <li key={d.clave}>
            <label className="check">
              <input type="checkbox" checked={confirmados.has(d.clave)} onChange={e => alternar(d.clave, e.target.checked)} />
              <span><strong>{d.etiqueta}</strong>{d.nutriente ? ` (${d.nutriente.unidad || 'unidad sin identificar: elígela en el formulario'})` : ''}</span>
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
