/**
 * Cliente de la API de la nube (/api/* en el mismo Worker que sirve la app).
 * Los errores se convierten en mensajes para el productor; sin conexión, la app sigue con los datos del dispositivo.
 */
import type { ErrorApi, RespuestaSesion, RespuestaSincronizar, SolicitudSesion, SolicitudSincronizar } from './protocoloNube.ts';

/** Client ID de "Sign in with Google" (no es secreto). Vacío: la nube no está configurada. */
export const GOOGLE_CLIENT_ID = '329265720632-bf4ig6n7s7d3guq9s269bbuoo0773m6q.apps.googleusercontent.com';

export type CodigoErrorNube = ErrorApi['codigo'] | 'sin-conexion';

export class ErrorNube extends Error {
  constructor(readonly codigo: CodigoErrorNube, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorNube';
  }
}

/** Datos de la sesión guardados en el dispositivo. */
export interface EstadoNube {
  token: string;
  vence: string;
  usuario: RespuestaSesion['usuario'];
  /** Cuenta a la que pertenecen los datos de este dispositivo. */
  vinculado: string;
  /** Última versión de la nube que este dispositivo ya recibió. */
  cursor: number;
  /** Época de la cuenta en la última sincronización ('' si nunca sincronizó): si cambia, se sube todo de nuevo. */
  epoca?: string;
  ultimaSincronizacion?: string;
}

async function llamar<T>(ruta: string, init: RequestInit, token?: string): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, {
      ...init,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }
    });
  } catch {
    throw new ErrorNube('sin-conexion', 'Sin conexión a internet. Tus datos siguen guardados en este dispositivo y se sincronizarán cuando haya conexión.');
  }
  let texto = '';
  let cuerpo: unknown;
  try {
    texto = await respuesta.text();
    cuerpo = JSON.parse(texto);
  } catch {
    cuerpo = undefined;
  }
  if (!respuesta.ok) {
    const error = cuerpo as Partial<ErrorApi> | undefined;
    // Límite diario del plan gratuito de Workers: Cloudflare responde una página con el error 1027.
    if (respuesta.status === 429 || (!error?.codigo && /1027/.test(texto))) {
      throw new ErrorNube('limite-diario', 'Se alcanzó el límite diario gratuito de la nube. Tus datos siguen en este dispositivo; se sincronizarán mañana.');
    }
    throw new ErrorNube(error?.codigo ?? 'error-interno', error?.error ?? 'La nube no respondió como se esperaba. Tus datos siguen guardados en este dispositivo.');
  }
  return cuerpo as T;
}

export const apiNube = {
  iniciarSesion: (credencial: string, consentimiento: boolean, vinculado?: string) =>
    llamar<RespuestaSesion>('/api/sesion', { method: 'POST', body: JSON.stringify({ credencial, consentimiento, vinculado } satisfies SolicitudSesion) }),
  sincronizar: (token: string, solicitud: SolicitudSincronizar) =>
    llamar<RespuestaSincronizar>('/api/sincronizar', { method: 'POST', body: JSON.stringify(solicitud) }, token),
  borrarCuenta: (token: string) => llamar<{ ok: true }>('/api/cuenta', { method: 'DELETE' }, token),
  /** Referencias técnicas; si el dispositivo ya tiene la versión, responde { sinCambios: true }. */
  referencias: (token: string, version: string) =>
    llamar<unknown>('/api/referencias?version=' + encodeURIComponent(version), { method: 'GET' }, token)
};

export const sesionVencida = (estado: Pick<EstadoNube, 'vence'>, ahora: Date = new Date()) => !(Date.parse(estado.vence) > ahora.getTime());
