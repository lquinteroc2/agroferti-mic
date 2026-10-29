import { useRef, useState, type ChangeEvent } from 'react';
import { repositorioRespaldo } from '../lib/db';
import { fechaDeMarca } from '../lib/formato';
import {
  contar,
  leerRespaldo,
  nombreArchivoRespaldo,
  resumenCantidades,
  type PlanRestauracion,
  type Respaldo
} from '../lib/respaldo';

type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;
interface Pendiente {
  archivo: string;
  respaldo: Respaldo;
  plan: PlanRestauracion;
  avisos: string[];
}

/** Máximo de motivos de omisión que se listan; el resto se resume. */
const MAX_OMITIDOS = 8;

/** Copia de seguridad en "Mis lotes": descargar todo y restaurar sin borrar ni sobrescribir. */
export function RespaldoSeccion() {
  const [aviso, setAviso] = useState<Aviso>(null);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const entradaArchivo = useRef<HTMLInputElement>(null);

  async function descargar() {
    setAviso(null);
    try {
      const respaldo = await repositorioRespaldo.exportar();
      const url = URL.createObjectURL(new Blob([JSON.stringify(respaldo, null, 2)], { type: 'application/json' }));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombreArchivoRespaldo();
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setAviso({ tipo: 'ok', texto: `Copia descargada (${enlace.download}) con ${resumenCantidades(contar(respaldo.datos))}. Guárdala fuera de este dispositivo: correo, Drive o computador.` });
    } catch {
      setAviso({ tipo: 'error', texto: 'No se pudo crear la copia. Verifica que tu navegador permita almacenamiento local y descargas.' });
    }
  }

  async function elegirArchivo(event: ChangeEvent<HTMLInputElement>) {
    const archivo = event.target.files?.[0];
    event.target.value = ''; // permite volver a elegir el mismo archivo
    setAviso(null);
    setPendiente(null);
    if (!archivo) return;
    const lectura = leerRespaldo(await archivo.text());
    if (!lectura.ok) {
      setAviso({ tipo: 'error', texto: lectura.error });
      return;
    }
    try {
      const plan = await repositorioRespaldo.previsualizar(lectura.respaldo.datos);
      setPendiente({ archivo: archivo.name, respaldo: lectura.respaldo, plan, avisos: lectura.avisos });
    } catch {
      setAviso({ tipo: 'error', texto: 'No se pudieron leer los datos de este dispositivo para comparar. Recarga la página y vuelve a intentarlo.' });
    }
  }

  async function restaurar() {
    if (!pendiente) return;
    setTrabajando(true);
    try {
      const plan = await repositorioRespaldo.restaurar(pendiente.respaldo.datos);
      setPendiente(null);
      setAviso({ tipo: 'ok', texto: `Restauración terminada: se agregaron ${resumenCantidades(contar(plan.agregar))}. No se borró ni se cambió ningún dato que ya estaba en este dispositivo.` });
    } catch {
      setAviso({ tipo: 'error', texto: 'No se pudo restaurar la copia. No se agregó nada; tus datos siguen como estaban.' });
    } finally {
      setTrabajando(false);
    }
  }

  const agregar = pendiente ? contar(pendiente.plan.agregar) : undefined;
  const hayQueAgregar = agregar ? Object.values(agregar).some(n => n > 0) : false;
  const existentes = pendiente ? resumenCantidades(pendiente.plan.existentes) : '';

  return (
    <section className="respaldo" aria-labelledby="titulo-respaldo">
      <h2 id="titulo-respaldo">Copia de seguridad</h2>
      <p>Tus datos se guardan <strong>solo en este navegador</strong>; no hay sincronización automática. Si se borran los datos del sitio o cambias de teléfono, se pierden. Descarga una copia con frecuencia y guárdala fuera del dispositivo. Con ese archivo puedes recuperarlos aquí o en otro dispositivo.</p>
      <div className="respaldo-acciones">
        <button type="button" className="btn btn-primary" onClick={() => void descargar()}>Descargar copia (JSON)</button>
        <button type="button" className="btn btn-outline" onClick={() => entradaArchivo.current?.click()}>Restaurar desde un archivo</button>
        <input ref={entradaArchivo} type="file" accept=".json,application/json" hidden onChange={e => void elegirArchivo(e)} aria-label="Archivo de copia de seguridad" />
      </div>

      {aviso && <div role={aviso.tipo === 'error' ? 'alert' : 'status'} className={`notice ${aviso.tipo === 'error' ? 'notice-error' : 'notice-ok'}`}>
        <span aria-hidden="true">{aviso.tipo === 'error' ? '!' : '✓'}</span>{aviso.texto}
        <button onClick={() => setAviso(null)} aria-label="Cerrar aviso">×</button>
      </div>}

      {pendiente && agregar && <div className="respaldo-previa" role="group" aria-labelledby="titulo-previa">
        <strong id="titulo-previa">Revisa antes de restaurar</strong>
        <ul>
          <li>Archivo: {pendiente.archivo}{pendiente.respaldo.creado ? ` · copia del ${fechaDeMarca(pendiente.respaldo.creado)}` : ''}. Contiene {resumenCantidades(contar(pendiente.respaldo.datos))}.</li>
          <li><strong>Se agregarán:</strong> {resumenCantidades(agregar)}.</li>
          {existentes !== 'ningún registro' && <li>Ya están en este dispositivo y no se modifican: {existentes}.</li>}
          {pendiente.plan.omitidos.length > 0 && <li>Se omitirán {pendiente.plan.omitidos.length} {pendiente.plan.omitidos.length === 1 ? 'registro' : 'registros'}:
            <ul>{pendiente.plan.omitidos.slice(0, MAX_OMITIDOS).map((o, i) => <li key={i}>{o.motivo}{o.id ? ` (${o.id})` : ''}</li>)}</ul>
            {pendiente.plan.omitidos.length > MAX_OMITIDOS && <span>… y {pendiente.plan.omitidos.length - MAX_OMITIDOS} más.</span>}
          </li>}
          {pendiente.avisos.map((a, i) => <li key={`aviso-${i}`}>{a}</li>)}
        </ul>
        <p className="hint">Restaurar <strong>solo agrega</strong> lo que no existe: nunca borra ni reemplaza datos de este dispositivo.</p>
        <div className="form-actions">
          <button type="button" className="btn btn-outline" disabled={trabajando} onClick={() => setPendiente(null)}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={trabajando || !hayQueAgregar} onClick={() => void restaurar()}>
            {trabajando ? 'Restaurando…' : hayQueAgregar ? 'Agregar estos datos' : 'No hay nada nuevo que agregar'}
          </button>
        </div>
      </div>}
    </section>
  );
}
