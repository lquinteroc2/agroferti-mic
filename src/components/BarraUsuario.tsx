import { useState } from 'react';
import { cerrarSesion } from '../lib/cuentaNube';
import type { EstadoNube } from '../lib/nube';

/** Primer nombre de la cuenta de Google o, si no hay nombre, el correo. */
export function saludoDe(usuario: EstadoNube['usuario']): string {
  const nombre = usuario.nombre?.trim().split(/\s+/)[0];
  return nombre || usuario.email;
}

/** Foto de perfil de Google o, si no hay (o no carga sin internet), un círculo con la inicial del correo. */
export function Avatar({ usuario, tamano = 36 }: { usuario: EstadoNube['usuario']; tamano?: number }) {
  const [fallo, setFallo] = useState(false);
  const inicial = (usuario.nombre?.trim() || usuario.email).charAt(0).toUpperCase();
  if (usuario.foto && !fallo) {
    return <img className="avatar" src={usuario.foto} alt="" width={tamano} height={tamano} referrerPolicy="no-referrer" onError={() => setFallo(true)} />;
  }
  return <span className="avatar avatar-inicial" style={{ width: tamano, height: tamano, fontSize: tamano * 0.45 }} aria-hidden="true">{inicial}</span>;
}

/** Barra bajo el encabezado: deja claro quién ingresó y permite cerrar sesión desde cualquier pantalla. */
export function BarraUsuario({ estado }: { estado: EstadoNube }) {
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    if (!window.confirm('¿Cerrar sesión? Tus datos siguen guardados en este teléfono y en la nube. Para volver a verlos tendrás que ingresar de nuevo con la misma cuenta.')) return;
    setSaliendo(true);
    try {
      await cerrarSesion();
    } finally {
      setSaliendo(false);
    }
  }

  return (
    <div className="barra-usuario">
      <div className="container barra-usuario-interior">
        <Avatar usuario={estado.usuario} />
        <div className="barra-usuario-texto">
          <strong>Hola, {saludoDe(estado.usuario)}</strong>
          {saludoDe(estado.usuario) !== estado.usuario.email && <small>{estado.usuario.email}</small>}
        </div>
        <button type="button" className="btn btn-outline barra-usuario-salir" disabled={saliendo} onClick={() => void salir()}>Cerrar sesión</button>
      </div>
    </div>
  );
}
