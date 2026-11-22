import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cerrarSesion, sincronizacionExterna, type FaseSincronizacion } from '../lib/cuentaNube';
import type { EstadoNube } from '../lib/nube';
import { confirmar } from './Confirmacion';

export function Logo() {
  return <span className="brand-symbol" aria-hidden="true">
    <svg viewBox="0 0 64 64" fill="none"><path d="M31 47C16 43 12 22 21 14c11 3 19 12 18 23M31 46c6-19 17-23 25-24-1 13-8 24-25 24" fill="#b3df9d"/><path d="M31 50V27" stroke="#fff" strokeWidth="4" strokeLinecap="round"/></svg>
  </span>;
}

/** Primer nombre de la cuenta de Google o, si no hay nombre, el correo. */
export function saludoDe(usuario: EstadoNube['usuario']): string {
  const nombre = usuario.nombre?.trim().split(/\s+/)[0];
  return nombre || usuario.email;
}

/** Foto de perfil de Google o, si no hay (o no carga sin internet), un círculo con la inicial. */
export function Avatar({ usuario, tamano = 36 }: { usuario: EstadoNube['usuario']; tamano?: number }) {
  const [fallo, setFallo] = useState(false);
  const inicial = (usuario.nombre?.trim() || usuario.email).charAt(0).toUpperCase();
  if (usuario.foto && !fallo) {
    return <img className="avatar" src={usuario.foto} alt="" width={tamano} height={tamano} referrerPolicy="no-referrer" onError={() => setFallo(true)} />;
  }
  return <span className="avatar avatar-inicial" style={{ width: tamano, height: tamano, fontSize: tamano * 0.45 }} aria-hidden="true">{inicial}</span>;
}

export type Seccion = 'inicio' | 'productos' | 'ayuda' | 'cuenta';

/** Estado de la copia en la nube, para el punto de color sobre la foto y su texto para lectores de pantalla. */
function estadoSincronizacion(enLinea: boolean, fase: FaseSincronizacion, cambiosLocales: boolean): { clase: string; texto: string } {
  if (!enLinea) return { clase: 'sin-internet', texto: 'sin internet: los cambios se guardan en este dispositivo' };
  if (fase.fase === 'error') return { clase: 'error', texto: 'no se pudo sincronizar' };
  if (fase.fase === 'sincronizando' || cambiosLocales) return { clase: 'pendiente', texto: 'subiendo cambios' };
  if (fase.fase === 'lista' && (fase.resultado.pendientes > 0 || fase.resultado.cuotaExcedida || fase.resultado.noSubidos.length > 0)) {
    return { clase: 'error', texto: 'hay cambios que no se subieron: revisa Mi cuenta' };
  }
  if (fase.fase === 'lista') return { clase: 'ok', texto: 'todo sincronizado' };
  return { clase: 'pendiente', texto: 'preparando la sincronización' };
}

const SECCIONES: ReadonlyArray<[Seccion, string]> = [['inicio', 'Mis lotes'], ['productos', 'Productos'], ['ayuda', 'Cómo funciona']];

/**
 * Encabezado de la app con sesión. En computador: secciones, avatar, saludo, correo y Cerrar sesión
 * en la misma barra. En celular: avatar y un menú hamburguesa con las secciones, Mi cuenta y Cerrar
 * sesión. La foto y el nombre llevan a Mi cuenta; el punto de color muestra el estado de la nube.
 */
export function Encabezado({ seccion, enRaiz = true, onIr, estado, enLinea }: {
  seccion: Seccion;
  /** false si se está dentro de la sección (p. ej. el glosario dentro de Cómo funciona): no se anuncia como la página actual. */
  enRaiz?: boolean;
  onIr: (s: Seccion) => void;
  estado: EstadoNube;
  enLinea: boolean;
}) {
  const { fase, cambiosLocales } = useSyncExternalStore(sincronizacionExterna.suscribir, sincronizacionExterna.leer);
  const nube = estadoSincronizacion(enLinea, fase, cambiosLocales);
  const enCuenta = seccion === 'cuenta';
  const [abierto, setAbierto] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  // El menú se cierra con Escape o al tocar fuera de él.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAbierto(false); boton.current?.focus(); } };
    const alTocar = (e: PointerEvent) => {
      const objetivo = e.target as Node;
      if (!menu.current?.contains(objetivo) && !boton.current?.contains(objetivo)) setAbierto(false);
    };
    document.addEventListener('keydown', alTeclear);
    document.addEventListener('pointerdown', alTocar);
    return () => { document.removeEventListener('keydown', alTeclear); document.removeEventListener('pointerdown', alTocar); };
  }, [abierto]);

  function ir(s: Seccion) {
    setAbierto(false);
    onIr(s);
  }

  async function salir() {
    setAbierto(false);
    if (!(await confirmar({ titulo: 'Cerrar sesión', mensaje: '¿Cerrar sesión? Tus datos siguen guardados en este dispositivo y en la nube. Para volver a verlos tendrás que ingresar de nuevo con la misma cuenta.', boton: 'Cerrar sesión' }))) return;
    setSaliendo(true);
    try {
      await cerrarSesion();
    } finally {
      setSaliendo(false);
    }
  }

  const { usuario } = estado;
  const saludo = saludoDe(usuario);
  const enlaces = (claseExtra = '') => SECCIONES.map(([s, texto]) =>
    <button key={s} type="button" className={`nav-link${seccion === s ? ' selected' : ''}${claseExtra}`} aria-current={seccion === s ? (enRaiz ? 'page' : 'true') : undefined} onClick={() => ir(s)}>{texto}</button>);

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <button className="brand" type="button" onClick={() => ir('inicio')} aria-label="Ir a Mis lotes">
          <Logo />
          <span><strong>AgroFerti <em>MIC</em></strong><small>Fertilización y seguimiento</small></span>
        </button>

        <nav className="nav nav-escritorio" aria-label="Navegación principal">{enlaces()}</nav>

        <div className="usuario-escritorio">
          <button type="button" className={`usuario-boton${enCuenta ? ' selected' : ''}`} aria-current={enCuenta ? 'page' : undefined} onClick={() => ir('cuenta')}>
            <span className="avatar-nube"><Avatar usuario={usuario} /><span className={`punto-nube punto-nube-${nube.clase}`} aria-hidden="true" /></span>
            <span className="usuario-texto">
              <strong>Hola, {saludo}</strong>
              <small>Mi cuenta{saludo !== usuario.email && <span className="usuario-correo"> · {usuario.email}</span>}</small>
            </span>
            <span className="sr-only">: Mi cuenta, {nube.texto}</span>
          </button>
          <button type="button" className="btn btn-outline btn-salir" disabled={saliendo} onClick={() => void salir()}>Cerrar sesión</button>
        </div>

        <div className="usuario-movil">
          <button type="button" className="usuario-boton" aria-current={enCuenta ? 'page' : undefined} onClick={() => ir('cuenta')}>
            <span className="avatar-nube"><Avatar usuario={usuario} tamano={34} /><span className={`punto-nube punto-nube-${nube.clase}`} aria-hidden="true" /></span>
            <span className="sr-only">Hola, {saludo}: Mi cuenta, {nube.texto}</span>
          </button>
          <button ref={boton} type="button" className="hamburguesa" aria-expanded={abierto} aria-controls="menu-movil" aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setAbierto(a => !a)}>
            <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
          </button>
        </div>
      </div>

      {abierto && <div ref={menu} id="menu-movil" className="menu-movil">
        <div className="container">
          <div className="menu-movil-usuario">
            <Avatar usuario={usuario} tamano={40} />
            <span className="usuario-texto"><strong>Hola, {saludo}</strong>{saludo !== usuario.email && <small>{usuario.email}</small>}</span>
          </div>
          <nav aria-label="Navegación principal">{enlaces(' menu-movil-enlace')}</nav>
          <button type="button" className={`nav-link menu-movil-enlace${enCuenta ? ' selected' : ''}`} aria-current={enCuenta ? 'page' : undefined} onClick={() => ir('cuenta')}>Mi cuenta <small className="menu-movil-nube">({nube.texto})</small></button>
          <button type="button" className="menu-movil-enlace menu-movil-salir" disabled={saliendo} onClick={() => void salir()}>Cerrar sesión</button>
        </div>
      </div>}
    </header>
  );
}
