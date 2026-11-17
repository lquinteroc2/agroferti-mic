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
import { almacenSincronizacion, leerEstadoNube } from '../lib/db';
import { fechaHoraDeMarca } from '../lib/formato';
import { ErrorNube, GOOGLE_CLIENT_ID, sesionVencida } from '../lib/nube';
import { contarPendientes } from '../lib/sincronizacion';

interface GoogleId {
  initialize(opciones: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: 'popup'; auto_select?: boolean }): void;
  renderButton(elemento: HTMLElement, opciones: Record<string, string | number>): void;
}
declare global {
  interface Window { google?: { accounts: { id: GoogleId } } }
}

type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;

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

  if (error) return <p className="error">No se pudo cargar el inicio de sesión de Google. Revisa tu conexión a internet y recarga la página.</p>;
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
      <li><strong>Mis derechos:</strong> puedo conocer, actualizar y corregir mis datos en la app, y borrarlos de la nube cuando quiera con «Borrar mis datos de la nube».</li>
      <li>Es un prototipo académico: no lo use como único registro de un cultivo real.</li>
    </ul>
  </details>;
}

/** Guardar en la nube (Mis lotes): iniciar sesión con Google, estado de la sincronización y datos personales. */
export function NubeSeccion() {
  const estado = useLiveQuery(leerEstadoNube, [], null);
  const fase = useSyncExternalStore(sincronizacionExterna.suscribir, sincronizacionExterna.leer);
  const pendientes = useLiveQuery(() => contarPendientes(almacenSincronizacion), []);
  const [acepto, setAcepto] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [otraCuenta, setOtraCuenta] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  if (!GOOGLE_CLIENT_ID || estado === null) return null;
  const conectado = !!estado?.token && !sesionVencida(estado);

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
    if (!window.confirm('¿Borrar todos tus datos de la nube? Se borran de los servidores y de los demás dispositivos dejarán de sincronizarse. Los datos de ESTE teléfono no se borran. Esta acción no se puede deshacer.')) return;
    void accion(borrarCuentaNube, 'Tus datos se borraron de la nube. Este teléfono conserva los suyos.');
  }

  function borrarTelefono() {
    if (!window.confirm(`¿Borrar TODOS los datos de este teléfono para usar otra cuenta? Los datos de ${otraCuenta ?? 'la cuenta anterior'} que ya estén en la nube no se pierden, pero lo que no se haya sincronizado sí. Esta acción no se puede deshacer.`)) return;
    void accion(async () => {
      await borrarTelefonoYDesvincular();
      setOtraCuenta(null);
    }, 'Se borraron los datos de este teléfono. Ya puedes iniciar sesión con otra cuenta.');
  }

  const textoEstado = !conectado ? null
    : fase.fase === 'sincronizando' ? 'Sincronizando…'
    : fase.fase === 'error' ? fase.error.message
    : pendientes ? `${pendientes} ${pendientes === 1 ? 'cambio pendiente' : 'cambios pendientes'} de subir.`
    : estado?.ultimaSincronizacion ? `Todo sincronizado. Última vez: ${fechaHoraDeMarca(estado.ultimaSincronizacion)}.`
    : 'Preparando la primera sincronización…';

  return (
    <section className="respaldo nube" aria-labelledby="titulo-nube">
      <h2 id="titulo-nube">Guardar en la nube</h2>
      {conectado && estado ? <>
        <p>Conectado como <strong>{estado.usuario.nombre ? `${estado.usuario.nombre} (${estado.usuario.email})` : estado.usuario.email}</strong>. Tus datos se guardan en este teléfono y se copian a la nube cuando hay internet; puedes verlos en otros dispositivos entrando con la misma cuenta.</p>
        <p className={`nube-estado${fase.fase === 'error' ? ' nube-estado-error' : ''}`} role="status">{textoEstado}</p>
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
      {aviso && <div role={aviso.tipo === 'error' ? 'alert' : 'status'} className={`notice ${aviso.tipo === 'error' ? 'notice-error' : 'notice-ok'}`}>
        <span aria-hidden="true">{aviso.tipo === 'error' ? '!' : '✓'}</span>{aviso.texto}
        <button onClick={() => setAviso(null)} aria-label="Cerrar aviso">×</button>
      </div>}
    </section>
  );
}
