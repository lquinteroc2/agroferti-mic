import { useEffect, useRef, useState } from 'react';
import { borrarTelefonoYDesvincular, iniciarSesion, OtraCuenta } from '../lib/cuentaNube';
import { ErrorNube, GOOGLE_CLIENT_ID, type EstadoNube } from '../lib/nube';

interface GoogleId {
  initialize(opciones: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: 'popup'; auto_select?: boolean }): void;
  renderButton(elemento: HTMLElement, opciones: Record<string, string | number>): void;
}
declare global {
  interface Window { google?: { accounts: { id: GoogleId } } }
}

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
      google.renderButton(contenedor.current, { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', locale: 'es', width: 300 });
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
      <li><strong>Finalidad:</strong> únicamente guardar mis datos y permitirme usarlos en mis dispositivos. No se venden ni se comparten con terceros, y no se usan para publicidad.</li>
      <li><strong>Dónde:</strong> en los servidores de Cloudflare, que pueden estar fuera de Colombia.</li>
      <li><strong>Mis derechos:</strong> puedo conocer, actualizar y corregir mis datos en la app, y borrarlos de la nube cuando quiera con «Borrar mis datos de la nube». Después de borrarlos, pueden quedar hasta 7 días en las copias de recuperación de Cloudflare antes de desaparecer.</li>
      <li><strong>Contacto del responsable</strong> para consultas, reclamos o para revocar esta autorización: <a href="mailto:leonardoquintero222@gmail.com">leonardoquintero222@gmail.com</a>.</li>
      <li>Es un prototipo académico: no lo use como único registro de un cultivo real.</li>
    </ul>
  </details>;
}

/**
 * Primera pantalla: sin iniciar sesión con Google no se puede usar la app. Después de ingresar, la
 * app funciona también sin internet y sincroniza cuando hay conexión.
 */
export function PantallaIngreso({ estado, enLinea }: { estado?: EstadoNube; enLinea: boolean }) {
  const [acepto, setAcepto] = useState(false);
  const [error, setError] = useState('');
  const [otraCuenta, setOtraCuenta] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const vencida = !!estado?.token;

  async function entrar(credencial: string) {
    setError('');
    setOtraCuenta(null);
    setTrabajando(true);
    try {
      await iniciarSesion(credencial, acepto);
    } catch (e) {
      if (e instanceof OtraCuenta) setOtraCuenta(e.emailVinculado);
      setError(e instanceof ErrorNube || e instanceof OtraCuenta ? e.message : 'No se pudo iniciar sesión. Vuelve a intentarlo.');
    } finally {
      setTrabajando(false);
    }
  }

  async function borrarTelefono() {
    if (!window.confirm(`¿Borrar TODOS los datos de este teléfono para usar otra cuenta? Lo que ya esté en la nube de ${otraCuenta ?? 'la cuenta anterior'} no se pierde, pero lo que no se haya sincronizado sí. Esta acción no se puede deshacer.`)) return;
    setTrabajando(true);
    try {
      await borrarTelefonoYDesvincular();
      setOtraCuenta(null);
      setError('');
    } catch {
      setError('No se pudieron borrar los datos de este teléfono. Vuelve a intentarlo.');
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div className="page-narrow ingreso">
      <div className="form-card">
        <div className="section-kicker">GRUPO 1 · PROTOTIPO ACADÉMICO</div>
        <h1>Ingresa para usar AgroFerti MIC</h1>
        <p className="muted">Tus lotes, análisis de suelo, planes y seguimiento quedan guardados en tu cuenta y puedes verlos en cualquier dispositivo. Después de ingresar, la app funciona también <strong>sin internet</strong> y se sincroniza cuando hay conexión.</p>

        {vencida && <p className="hint">Tu sesión venció. Vuelve a ingresar con tu cuenta de Google; tus datos siguen guardados en este teléfono.</p>}
        {estado?.vinculado && !vencida && <p className="hint">Este teléfono tiene datos de <strong>{estado.usuario.email}</strong>. Ingresa con esa cuenta para verlos.</p>}

        {!enLinea ? <p className="error">Necesitas conexión a internet para ingresar la primera vez. Conéctate y vuelve a intentarlo.</p> : <>
          <label className="check nube-check">
            <input type="checkbox" checked={acepto} onChange={e => setAcepto(e.target.checked)} />
            <span>Autorizo el tratamiento de mis datos personales para guardarlos en la nube, según la Ley 1581 de 2012.</span>
          </label>
          <TextoAutorizacion />
          {acepto
            ? (trabajando ? <p className="hint">Ingresando…</p> : <BotonGoogle onCredencial={c => void entrar(c)} />)
            : <p className="hint">Marca la autorización para ver el botón «Iniciar sesión con Google».</p>}
        </>}

        {otraCuenta && <div className="error-box">
          <strong>Este teléfono tiene datos de otra cuenta ({otraCuenta}).</strong> Para no mezclar datos de dos personas, ingresa con esa cuenta o borra los datos de este teléfono.
          <div className="respaldo-acciones"><button type="button" className="btn btn-outline" disabled={trabajando} onClick={() => void borrarTelefono()}>Borrar los datos de este teléfono</button></div>
        </div>}
        {error && !otraCuenta && <p role="alert" className="error">{error}</p>}
      </div>
    </div>
  );
}
