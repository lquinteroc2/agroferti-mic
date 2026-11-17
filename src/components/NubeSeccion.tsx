import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  borrarCuentaNube,
  borrarTelefonoYDesvincular,
  cerrarSesion,
  iniciarSesion,
  OtraCuenta,
  sincronizacionExterna,
  sincronizarAhora
} from '../lib/cuentaNube';
import { leerEstadoNube, registrosSinLote, versionesApartadas } from '../lib/db';
import { fechaHoraDeMarca } from '../lib/formato';
import { ErrorNube, GOOGLE_CLIENT_ID, sesionVencida } from '../lib/nube';
import { codificarRegistro, decodificarRegistro } from '../lib/respaldo';
import { fechaLocalISO } from '../lib/validacion';

interface GoogleId {
  initialize(opciones: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: 'popup'; auto_select?: boolean }): void;
  renderButton(elemento: HTMLElement, opciones: Record<string, string | number>): void;
}
declare global {
  interface Window { google?: { accounts: { id: GoogleId } } }
}

type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;

const NOMBRE_TABLA: Record<string, string> = {
  lotes: 'Lote', analisisSuelos: 'Análisis de suelo', productos: 'Producto', planes: 'Plan', registros: 'Registro de seguimiento', ciclos: 'Ciclo de cultivo'
};
const MAX_LISTA = 5;

let cargaGoogle: Promise<GoogleId> | null = null;
/** Carga una sola vez la librería oficial de "Sign in with Google". Sin internet, falla y se puede reintentar. */
function cargarGoogle(): Promise<GoogleId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  cargaGoogle ??= new Promise<GoogleId>((resolver, rechazar) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => (window.google?.accounts?.id ? resolver(window.google.accounts.id) : rechazar(new Error('sin google')));
    script.onerror = () => { script.remove(); rechazar(new Error('sin conexión')); };
    document.head.appendChild(script);
  }).catch(e => { cargaGoogle = null; throw e; });
  return cargaGoogle;
}

/** Descarga un archivo JSON (con la misma codificación de la copia de seguridad: conserva NaN y fechas). */
function descargarJson(nombre: string, contenido: unknown) {
  const url = URL.createObjectURL(new Blob([codificarRegistro(contenido)], { type: 'application/json' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Botón oficial de Google. Se muestra solo después de aceptar la autorización de datos. */
function BotonGoogle({ onCredencial }: { onCredencial: (credencial: string) => void }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredencial);
  callback.current = onCredencial;
  const [error, setError] = useState(false);

  useEffect(() => {
    let vigente = true;
    cargarGoogle().then(google => {
      if (!vigente || !contenedor.current) return;
      google.initialize({ client_id: GOOGLE_CLIENT_ID, callback: r => callback.current(r.credential), ux_mode: 'popup' });
      google.renderButton(contenedor.current, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'es', width: 280 });
    }).catch(() => { if (vigente) setError(true); });
    return () => { vigente = false; };
  }, []);

  if (error) return <p className="error">No se pudo cargar el inicio de sesión de Google. Revisa tu conexión a internet y recarga la página. Si usas Firefox con protección estricta contra rastreo, permite este sitio.</p>;
  return <div ref={contenedor} className="nube-google" />;
}

/** Autorización de tratamiento de datos personales (Ley 1581 de 2012). */
function TextoAutorizacion() {
  return <details className="nube-autorizacion">
    <summary>Leer la autorización completa</summary>
    <p>Autorizo al equipo del proyecto académico <strong>AgroFerti MIC (Grupo 1, SENA)</strong> para guardar en la nube mi nombre, el correo de mi cuenta de Google y los datos que registro en la app (lotes, análisis de suelo, productos, planes, seguimiento e historial).</p>
    <ul>
      <li><strong>Finalidad:</strong> únicamente respaldar mis datos y permitirme usarlos en mis dispositivos. No se venden ni se comparten con terceros, y no se usan para publicidad.</li>
      <li><strong>Dónde:</strong> en los servidores de Cloudflare, que pueden estar fuera de Colombia.</li>
      <li><strong>Mis derechos:</strong> puedo conocer, actualizar y corregir mis datos en la app, y borrarlos de la nube cuando quiera con «Borrar mis datos de la nube». Después de borrarlos, pueden quedar hasta 7 días en las copias de recuperación de Cloudflare antes de desaparecer.</li>
      <li><strong>Contacto del responsable</strong> para consultas, reclamos o para revocar esta autorización: <a href="mailto:leonardoquintero222@gmail.com">leonardoquintero222@gmail.com</a>.</li>
      <li>Es un prototipo académico: no lo use como único registro de un cultivo real.</li>
    </ul>
  </details>;
}

/** Guardar en la nube (Mis lotes): iniciar sesión con Google, estado de la sincronización y datos personales. */
export function NubeSeccion() {
  const estado = useLiveQuery(leerEstadoNube, [], null);
  const { fase, cambiosLocales } = useSyncExternalStore(sincronizacionExterna.suscribir, sincronizacionExterna.leer);
  const apartadas = useLiveQuery(versionesApartadas.contar, [], 0);
  const [acepto, setAcepto] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [otraCuenta, setOtraCuenta] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  if (!GOOGLE_CLIENT_ID || estado === null) return null;
  const conectado = !!estado?.token && !sesionVencida(estado);
  const resultado = fase.fase === 'lista' ? fase.resultado : undefined;

  async function accion(fn: () => Promise<void>, ok?: string) {
    setAviso(null);
    setTrabajando(true);
    try {
      await fn();
      if (ok) setAviso({ tipo: 'ok', texto: ok });
    } catch (e) {
      if (e instanceof OtraCuenta) setOtraCuenta(e.emailVinculado);
      setAviso({ tipo: 'error', texto: e instanceof ErrorNube || e instanceof OtraCuenta ? e.message : 'No se pudo completar la acción. Vuelve a intentarlo.' });
    } finally {
      setTrabajando(false);
    }
  }

  const entrar = (credencial: string) => void accion(async () => {
    setOtraCuenta(null);
    await iniciarSesion(credencial, acepto);
  });

  function salir() {
    if (!window.confirm('¿Cerrar sesión? Tus datos siguen en este teléfono y en la nube. Los cambios que hagas sin sesión se subirán cuando vuelvas a entrar con la misma cuenta.')) return;
    void accion(cerrarSesion, 'Cerraste la sesión. Tus datos siguen en este teléfono.');
  }

  function borrarNube() {
    if (!window.confirm('¿Borrar todos tus datos de la nube? Se borran de los servidores y los demás dispositivos dejarán de sincronizarse. Los datos de ESTE teléfono no se borran. Esta acción no se puede deshacer.')) return;
    void accion(borrarCuentaNube, 'Tus datos se borraron de la nube. Este teléfono conserva los suyos.');
  }

  function borrarTelefono() {
    if (!window.confirm(`¿Borrar TODOS los datos de este teléfono para usar otra cuenta? Lo que ya esté en la nube de ${otraCuenta ?? 'la cuenta anterior'} no se pierde, pero lo que no se haya sincronizado sí. Si no estás seguro, cancela y descarga antes una copia en «Copia de seguridad». Esta acción no se puede deshacer.`)) return;
    void accion(async () => {
      await borrarTelefonoYDesvincular();
      setOtraCuenta(null);
    }, 'Se borraron los datos de este teléfono. Ya puedes iniciar sesión con otra cuenta.');
  }

  const descargarApartadas = () => void accion(async () => {
    const lista = (await versionesApartadas.listar()).map(v => {
      let registro: unknown;
      try { registro = decodificarRegistro(v.texto); } catch { registro = v.texto; }
      return { tabla: v.tabla, id: v.id, motivo: v.motivo, fecha: v.fecha, registro };
    });
    descargarJson(`agroferti-versiones-apartadas-${fechaLocalISO()}.json`, lista);
  });

  function descartarApartadas() {
    if (!window.confirm('¿Descartar las versiones apartadas? Descárgalas antes si podrías necesitarlas. Esta acción no se puede deshacer.')) return;
    void accion(versionesApartadas.descartar, 'Se descartaron las versiones apartadas.');
  }

  const descargarSinLote = () => void accion(async () => {
    descargarJson(`agroferti-registros-sin-lote-${fechaLocalISO()}.json`, await registrosSinLote.listar());
  });

  function eliminarSinLote() {
    if (!window.confirm('¿Eliminar los registros cuyo lote ya no existe? Descárgalos antes si podrías necesitarlos. Esta acción no se puede deshacer.')) return;
    void accion(registrosSinLote.eliminar, 'Se eliminaron los registros sin lote.');
  }

  const textoEstado = !conectado ? null
    : fase.fase === 'sincronizando' ? 'Sincronizando…'
    : fase.fase === 'error' ? fase.error.message
    : cambiosLocales || (resultado && resultado.pendientes > 0) ? 'Hay cambios guardados en este teléfono que se subirán en unos segundos.'
    : estado?.ultimaSincronizacion ? `Todo sincronizado. Última vez: ${fechaHoraDeMarca(estado.ultimaSincronizacion)}.`
    : 'Preparando la primera sincronización…';

  return (
    <section className="respaldo nube" aria-labelledby="titulo-nube">
      <h2 id="titulo-nube">Guardar en la nube</h2>
      {conectado && estado ? <>
        <p>Conectado como <strong>{estado.usuario.nombre ? `${estado.usuario.nombre} (${estado.usuario.email})` : estado.usuario.email}</strong>. Tus datos se guardan en este teléfono y se copian a la nube cuando hay internet; puedes verlos en otros dispositivos entrando con la misma cuenta.</p>
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
          <button type="button" className="danger-link" disabled={trabajando} onClick={borrarNube}>Borrar mis datos de la nube</button>
        </div>
      </> : <>
        <p>Inicia sesión con tu cuenta de Google para <strong>no perder tus datos</strong> si se borra el navegador o cambias de teléfono, y para verlos en varios dispositivos. Es gratis. Sin internet, la app sigue funcionando igual y sincroniza después.</p>
        {estado?.vinculado && <p className="hint">Este teléfono estaba conectado a <strong>{estado.usuario.email}</strong>. Vuelve a entrar con esa cuenta para seguir sincronizando.</p>}
        <label className="check nube-check">
          <input type="checkbox" checked={acepto} onChange={e => setAcepto(e.target.checked)} />
          <span>Autorizo el tratamiento de mis datos personales para guardarlos en la nube, según la Ley 1581 de 2012.</span>
        </label>
        <TextoAutorizacion />
        {acepto
          ? (trabajando ? <p className="hint">Iniciando sesión…</p> : <BotonGoogle onCredencial={entrar} />)
          : <p className="hint">Marca la autorización para ver el botón «Iniciar sesión con Google».</p>}
        {otraCuenta && <div className="error-box">
          <strong>Este teléfono tiene datos de otra cuenta ({otraCuenta}).</strong> Para no mezclar datos de dos personas, entra con esa cuenta o borra los datos de este teléfono.
          <div className="respaldo-acciones"><button type="button" className="btn btn-outline" disabled={trabajando} onClick={borrarTelefono}>Borrar los datos de este teléfono</button></div>
        </div>}
      </>}

      {apartadas > 0 && <div className="hint">
        <strong>{apartadas} {apartadas === 1 ? 'versión apartada' : 'versiones apartadas'}.</strong> Cuando dos dispositivos cambian el mismo registro, se conserva el cambio más reciente y el otro se aparta aquí para que no se pierda.
        <div className="respaldo-acciones">
          <button type="button" className="btn btn-outline" disabled={trabajando} onClick={descargarApartadas}>Descargar (JSON)</button>
          <button type="button" className="danger-link" disabled={trabajando} onClick={descartarApartadas}>Descartar</button>
        </div>
      </div>}

      {resultado && resultado.sinLote > 0 && <div className="hint">
        <strong>{resultado.sinLote} {resultado.sinLote === 1 ? 'registro pertenece' : 'registros pertenecen'} a un lote que ya no existe</strong> (por ejemplo, se eliminó en otro dispositivo mientras en este se agregaban datos). No se muestran en ninguna ficha.
        <div className="respaldo-acciones">
          <button type="button" className="btn btn-outline" disabled={trabajando} onClick={descargarSinLote}>Descargar (JSON)</button>
          <button type="button" className="danger-link" disabled={trabajando} onClick={eliminarSinLote}>Eliminarlos</button>
        </div>
      </div>}

      {aviso && <div role={aviso.tipo === 'error' ? 'alert' : 'status'} className={`notice ${aviso.tipo === 'error' ? 'notice-error' : 'notice-ok'}`}>
        <span aria-hidden="true">{aviso.tipo === 'error' ? '!' : '✓'}</span>{aviso.texto}
        <button onClick={() => setAviso(null)} aria-label="Cerrar aviso">×</button>
      </div>}
    </section>
  );
}
