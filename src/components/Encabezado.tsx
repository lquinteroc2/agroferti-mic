import { useEffect, useRef, useState } from 'react';
import { cerrarSesion } from '../lib/cuentaNube';
import type { EstadoNube } from '../lib/nube';

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

export type Seccion = 'inicio' | 'productos' | 'ayuda';

const SECCIONES: ReadonlyArray<[Seccion, string]> = [['inicio', 'Mis lotes'], ['productos', 'Productos'], ['ayuda', 'Cómo funciona']];

/**
 * Encabezado de la app con sesión. En computador: secciones, avatar, saludo, correo y Cerrar sesión
 * en la misma barra. En celular: avatar y un menú hamburguesa con las secciones y Cerrar sesión.
 */
export function Encabezado({ seccion, onIr, estado }: { seccion: Seccion; onIr: (s: Seccion) => void; estado: EstadoNube }) {
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
    if (!window.confirm('¿Cerrar sesión? Tus datos siguen guardados en este teléfono y en la nube. Para volver a verlos tendrás que ingresar de nuevo con la misma cuenta.')) return;
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
    <button key={s} type="button" className={`nav-link${seccion === s ? ' selected' : ''}${claseExtra}`} aria-current={seccion === s ? 'page' : undefined} onClick={() => ir(s)}>{texto}</button>);

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <button className="brand" type="button" onClick={() => ir('inicio')} aria-label="Ir a Mis lotes">
          <Logo />
          <span><strong>AgroFerti <em>MIC</em></strong><small>Fertilización y seguimiento</small></span>
        </button>

        <nav className="nav nav-escritorio" aria-label="Navegación principal">{enlaces()}</nav>

        <div className="usuario-escritorio">
          <Avatar usuario={usuario} />
          <span className="usuario-texto">
            <strong>Hola, {saludo}</strong>
            {saludo !== usuario.email && <small>{usuario.email}</small>}
          </span>
          <button type="button" className="btn btn-outline btn-salir" disabled={saliendo} onClick={() => void salir()}>Cerrar sesión</button>
        </div>

        <div className="usuario-movil">
          <span className="sr-only">Hola, {saludo}</span>
          <Avatar usuario={usuario} tamano={34} />
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
          <button type="button" className="menu-movil-enlace menu-movil-salir" disabled={saliendo} onClick={() => void salir()}>Cerrar sesión</button>
        </div>
      </div>}
    </header>
  );
}
