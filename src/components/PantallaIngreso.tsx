import { useEffect, useRef, useState } from 'react';
import { borrarTelefonoYDesvincular, iniciarSesion, OtraCuenta } from '../lib/cuentaNube';
import { ErrorNube, GOOGLE_CLIENT_ID, type EstadoNube } from '../lib/nube';
import { confirmar } from './Confirmacion';

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

const VENTAJAS: ReadonlyArray<[titulo: string, texto: string]> = [
  ['Tus lotes en un solo lugar', 'Área, cultivo, siembra, análisis de suelo e historial de cultivos anteriores.'],
  ['Plan de fertilización explicado', 'La app propone metas según tu análisis de suelo y fertilizantes con registro ICA; calcula cantidad y costo, con cada operación paso a paso.'],
  ['Funciona sin internet', 'Registra en el campo; se sincroniza solo cuando hay conexión.'],
  ['Informes en PDF', 'Imprime o guarda en PDF el informe de un lote o de todos tus lotes.']
];

/**
 * Primera pantalla: sin iniciar sesión con Google no se puede usar la app. Después de ingresar, la
 * app funciona también sin internet y sincroniza cuando hay conexión. Ingresar con el botón, después
 * del aviso que lo explica, es la autorización de tratamiento de datos (Ley 1581 de 2012).
 */
export function PantallaIngreso({ estado, enLinea }: { estado?: EstadoNube; enLinea: boolean }) {
  const [error, setError] = useState('');
  const [otraCuenta, setOtraCuenta] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const vencida = !!estado?.token;

  async function entrar(credencial: string) {
    setError('');
    setOtraCuenta(null);
    setTrabajando(true);
    try {
      await iniciarSesion(credencial, true);
    } catch (e) {
      if (e instanceof OtraCuenta) setOtraCuenta(e.emailVinculado);
      setError(e instanceof ErrorNube || e instanceof OtraCuenta ? e.message : 'No se pudo iniciar sesión. Vuelve a intentarlo.');
    } finally {
      setTrabajando(false);
    }
  }

  async function borrarTelefono() {
    if (!(await confirmar({ titulo: 'Usar otra cuenta', mensaje: `¿Borrar TODOS los datos de este dispositivo para usar otra cuenta? Lo que ya esté en la nube de ${otraCuenta ?? 'la cuenta anterior'} no se pierde, pero lo que no se haya sincronizado sí. Esta acción no se puede deshacer.`, boton: 'Borrar y continuar', peligro: true }))) return;
    setTrabajando(true);
    try {
      await borrarTelefonoYDesvincular();
      setOtraCuenta(null);
      setError('');
    } catch {
      setError('No se pudieron borrar los datos de este dispositivo. Vuelve a intentarlo.');
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div className="ingreso">
      <section className="ingreso-presentacion">
        <div className="eyebrow">GRUPO 1 · SENA · PROTOTIPO ACADÉMICO</div>
        <h1>Tu cultivo, más organizado.</h1>
        <p>AgroFerti MIC te ayuda a registrar tus lotes, el análisis de suelo y tus fertilizantes, y a preparar el plan de fertilización con cada cálculo explicado. Para papa y otros cultivos.</p>
        <ul className="ingreso-ventajas">
          {VENTAJAS.map(([titulo, texto]) => <li key={titulo}><span aria-hidden="true">✓</span><div><strong>{titulo}</strong><small>{texto}</small></div></li>)}
        </ul>
      </section>

      <section className="ingreso-tarjeta" aria-labelledby="titulo-ingreso">
        <h2 id="titulo-ingreso">Ingresa a tu cuenta</h2>
        <p className="muted">Usa tu cuenta de Google. Es gratis y no necesitas crear una contraseña.</p>

        {vencida && <p className="hint">Tu sesión venció. Vuelve a ingresar; tus datos siguen guardados en este dispositivo.</p>}
        {estado?.vinculado && !vencida && <p className="hint">Este dispositivo tiene datos de <strong>{estado.usuario.email}</strong>. Ingresa con esa cuenta para verlos.</p>}

        {!enLinea
          ? <p className="error">Necesitas conexión a internet para ingresar. Conéctate y vuelve a intentarlo.</p>
          : trabajando ? <p className="hint">Ingresando…</p> : <BotonGoogle onCredencial={c => void entrar(c)} />}

        <p className="ingreso-aviso">Al ingresar con Google autorizas el tratamiento de tus datos personales (nombre, correo y los datos que registres) para guardarlos en la nube, según la Ley 1581 de 2012.</p>
        <TextoAutorizacion />

        {otraCuenta && <div className="error-box">
          <strong>Este dispositivo tiene datos de otra cuenta ({otraCuenta}).</strong> Para no mezclar datos de dos personas, ingresa con esa cuenta o borra los datos de este dispositivo.
          <div className="respaldo-acciones"><button type="button" className="btn btn-outline" disabled={trabajando} onClick={() => void borrarTelefono()}>Borrar los datos de este dispositivo</button></div>
        </div>}
        {error && !otraCuenta && <p role="alert" className="error">{error}</p>}
      </section>
    </div>
  );
}
