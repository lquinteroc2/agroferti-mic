import { useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { borrarCuentaNube, cerrarSesion, sincronizacionExterna, sincronizarAhora } from '../lib/cuentaNube';
import { decodificarRegistro } from '../lib/codificacion';
import { registrosSinLote, versionesApartadas } from '../lib/db';
import { fechaHoraDeMarca } from '../lib/formato';
import { ErrorNube, type EstadoNube } from '../lib/nube';
import { confirmar } from './Confirmacion';

type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;

const NOMBRE_TABLA: Record<string, string> = {
  lotes: 'Lote', analisisSuelos: 'Análisis de suelo', productos: 'Producto', planes: 'Plan', registros: 'Registro de seguimiento', ciclos: 'Ciclo de cultivo'
};
const MAX_LISTA = 5;

/** Nombre legible de una versión apartada (nombre, descripción o fecha del registro). */
function describirApartada(texto: string): string {
  try {
    const r = decodificarRegistro(texto) as Record<string, unknown>;
    const nombre = [r.nombre, r.descripcion, r.fechaAnalisis, r.fecha].find(v => typeof v === 'string' && v.trim());
    return nombre ? `«${String(nombre).slice(0, 60)}»` : '';
  } catch {
    return '';
  }
}

/** Mi cuenta (Mis lotes): estado de la sincronización, cerrar sesión y borrar los datos de la nube. */
export function NubeSeccion({ estado }: { estado: EstadoNube }) {
  const { fase, cambiosLocales } = useSyncExternalStore(sincronizacionExterna.suscribir, sincronizacionExterna.leer);
  const apartadas = useLiveQuery(versionesApartadas.listar, [], []);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [trabajando, setTrabajando] = useState(false);
  const resultado = fase.fase === 'lista' ? fase.resultado : undefined;

  async function accion(fn: () => Promise<void>, ok?: string) {
    setAviso(null);
    setTrabajando(true);
    try {
      await fn();
      if (ok) setAviso({ tipo: 'ok', texto: ok });
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof ErrorNube ? e.message : 'No se pudo completar la acción. Vuelve a intentarlo.' });
    } finally {
      setTrabajando(false);
    }
  }

  async function salir() {
    if (!(await confirmar({ titulo: 'Cerrar sesión', mensaje: '¿Cerrar sesión? Tus datos siguen guardados en este teléfono y en la nube. Para volver a verlos tendrás que ingresar de nuevo con la misma cuenta.', boton: 'Cerrar sesión' }))) return;
    void accion(cerrarSesion);
  }

  async function borrarNube() {
    if (!(await confirmar({ titulo: 'Borrar mis datos de la nube', mensaje: '¿Borrar todos tus datos de la nube? Se borran de los servidores y los demás dispositivos dejarán de verlos. Los datos de ESTE teléfono no se borran. Esta acción no se puede deshacer.', boton: 'Borrar de la nube', peligro: true }))) return;
    void accion(borrarCuentaNube);
  }

  async function descartarApartadas() {
    if (!(await confirmar({ titulo: 'Descartar versiones apartadas', mensaje: '¿Descartar las versiones apartadas? Esta acción no se puede deshacer.', boton: 'Descartar', peligro: true }))) return;
    void accion(versionesApartadas.descartar, 'Se descartaron las versiones apartadas.');
  }

  async function eliminarSinLote() {
    if (!(await confirmar({ titulo: 'Eliminar registros sin lote', mensaje: '¿Eliminar los registros cuyo lote ya no existe? Esta acción no se puede deshacer.', boton: 'Eliminar', peligro: true }))) return;
    void accion(registrosSinLote.eliminar, 'Se eliminaron los registros sin lote.');
  }

  const textoEstado = fase.fase === 'sincronizando' ? 'Sincronizando…'
    : fase.fase === 'error' ? fase.error.message
    : cambiosLocales || (resultado && resultado.pendientes > 0) ? 'Hay cambios guardados en este teléfono que se subirán en unos segundos.'
    : estado.ultimaSincronizacion ? `Todo sincronizado. Última vez: ${fechaHoraDeMarca(estado.ultimaSincronizacion)}.`
    : 'Preparando la primera sincronización…';

  return (
    <section className="respaldo nube" aria-labelledby="titulo-nube">
      <h2 id="titulo-nube">Mi cuenta</h2>
      <p>Ingresaste como <strong>{estado.usuario.nombre ? `${estado.usuario.nombre} (${estado.usuario.email})` : estado.usuario.email}</strong>. Tus datos se guardan en este teléfono y se copian a la nube cuando hay internet. Para tener tus datos en papel o en PDF, usa <strong>Informe para el productor</strong> en la ficha de cada lote.</p>
      <p className={`nube-estado${fase.fase === 'error' ? ' nube-estado-error' : ''}`} role="status">{textoEstado}</p>
      {resultado?.reiniciada && <p className="hint">Tu cuenta en la nube se había borrado y se creó de nuevo: este teléfono volvió a subir todos sus datos.</p>}
      {resultado?.cuotaExcedida && <p className="error">Tu cuenta llegó al espacio máximo de la nube para este prototipo. Los cambios nuevos se guardan en este teléfono, pero no se suben. Elimina lotes o registros que ya no necesites.</p>}
      {resultado && resultado.noSubidos.length > 0 && <div className="hint">
        <strong>{resultado.noSubidos.length} {resultado.noSubidos.length === 1 ? 'registro tiene' : 'registros tienen'} datos por corregir y no se suben a la nube</strong> (siguen en este teléfono). Corrígelos en su sección:
        <ul>{resultado.noSubidos.slice(0, MAX_LISTA).map((r, i) => <li key={i}>{NOMBRE_TABLA[r.tabla] ?? r.tabla}: {r.motivo}</li>)}</ul>
        {resultado.noSubidos.length > MAX_LISTA && <span>… y {resultado.noSubidos.length - MAX_LISTA} más.</span>}
      </div>}
      <div className="respaldo-acciones">
        <button type="button" className="btn btn-primary" disabled={trabajando || fase.fase === 'sincronizando'} onClick={() => void accion(sincronizarAhora)}>Sincronizar ahora</button>
        <button type="button" className="btn btn-outline" disabled={trabajando} onClick={salir}>Cerrar sesión</button>
      </div>
      <button type="button" className="danger-link" disabled={trabajando} onClick={borrarNube}>Borrar mis datos de la nube</button>

      {apartadas.length > 0 && <div className="hint">
        <strong>{apartadas.length} {apartadas.length === 1 ? 'versión apartada' : 'versiones apartadas'}.</strong> Cuando dos dispositivos cambian el mismo registro, se conserva el cambio más reciente y el otro queda apartado aquí:
        <ul>{apartadas.slice(-MAX_LISTA).reverse().map(v => <li key={`${v.tabla}/${v.id}/${v.fecha}`}>{NOMBRE_TABLA[v.tabla] ?? v.tabla} {describirApartada(v.texto)} · {fechaHoraDeMarca(v.fecha)}: {v.motivo}</li>)}</ul>
        {apartadas.length > MAX_LISTA && <span>… y {apartadas.length - MAX_LISTA} más.</span>}
        <div className="respaldo-acciones"><button type="button" className="danger-link" disabled={trabajando} onClick={descartarApartadas}>Descartar las versiones apartadas</button></div>
      </div>}

      {resultado && resultado.sinLote > 0 && <div className="hint">
        <strong>{resultado.sinLote} {resultado.sinLote === 1 ? 'registro pertenece' : 'registros pertenecen'} a un lote que ya no existe</strong> (por ejemplo, se eliminó en otro dispositivo mientras en este se agregaban datos). No se muestran en ninguna ficha.
        <div className="respaldo-acciones"><button type="button" className="danger-link" disabled={trabajando} onClick={eliminarSinLote}>Eliminarlos</button></div>
      </div>}

      {aviso && <div role={aviso.tipo === 'error' ? 'alert' : 'status'} className={`notice ${aviso.tipo === 'error' ? 'notice-error' : 'notice-ok'}`}>
        <span aria-hidden="true">{aviso.tipo === 'error' ? '!' : '✓'}</span>{aviso.texto}
        <button onClick={() => setAviso(null)} aria-label="Cerrar aviso">×</button>
      </div>}
    </section>
  );
}
