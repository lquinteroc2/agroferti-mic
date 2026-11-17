/**
 * Sesión propia de la app: después de verificar el token de Google, la API entrega un token firmado
 * con HMAC-SHA256 (secreto `SESION_SECRETO` del Worker) que dura 30 días. Así el productor no tiene
 * que volver a iniciar sesión cada hora, y la API no consulta a Google en cada sincronización.
 */
import { base64urlABytes } from './google.ts';

export const DURACION_SESION_MS = 30 * 24 * 60 * 60 * 1000;
const VERSION = 'v1';

export interface Sesion {
  sub: string;
  /** Milisegundos desde 1970 en que vence. */
  vence: number;
}

function bytesABase64url(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function clave(secreto: string): Promise<CryptoKey> {
  if (secreto.length < 32) throw new Error('SESION_SECRETO debe tener al menos 32 caracteres.');
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function crearSesion(sub: string, secreto: string, ahora: number = Date.now()): Promise<{ token: string; vence: number }> {
  const vence = ahora + DURACION_SESION_MS;
  const carga = bytesABase64url(new TextEncoder().encode(JSON.stringify({ sub, vence })));
  const firma = new Uint8Array(await crypto.subtle.sign('HMAC', await clave(secreto), new TextEncoder().encode(`${VERSION}.${carga}`)));
  return { token: `${VERSION}.${carga}.${bytesABase64url(firma)}`, vence };
}

/** Devuelve la sesión si el token es auténtico y no ha vencido; si no, null. */
export async function verificarSesion(token: string, secreto: string, ahora: number = Date.now()): Promise<Sesion | null> {
  const partes = token.split('.');
  if (partes.length !== 3 || partes[0] !== VERSION) return null;
  try {
    const valida = await crypto.subtle.verify('HMAC', await clave(secreto), base64urlABytes(partes[2]),
      new TextEncoder().encode(`${partes[0]}.${partes[1]}`));
    if (!valida) return null;
    const carga = JSON.parse(new TextDecoder().decode(base64urlABytes(partes[1]))) as Partial<Sesion>;
    if (typeof carga.sub !== 'string' || typeof carga.vence !== 'number' || carga.vence <= ahora) return null;
    return { sub: carga.sub, vence: carga.vence };
  } catch {
    return null;
  }
}
