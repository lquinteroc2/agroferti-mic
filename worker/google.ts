/**
 * Verificación del ID token de "Sign in with Google" sin librerías: firma RS256 con las claves
 * públicas de Google (JWKS) y los campos que pide la guía oficial (iss, aud, exp). El usuario se
 * identifica por `sub`, nunca por el correo.
 * https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
 */

export const URL_CLAVES_GOOGLE = 'https://www.googleapis.com/oauth2/v3/certs';
const EMISORES = ['accounts.google.com', 'https://accounts.google.com'];
/** Tolerancia de reloj entre servidores. */
const MARGEN_S = 60;

export interface ClavePublica extends JsonWebKey {
  kid?: string;
}

export interface UsuarioGoogle {
  sub: string;
  email: string;
  nombre?: string;
}

export class ErrorToken extends Error {}

const decodificador = new TextDecoder();

export function base64urlABytes(texto: string): Uint8Array {
  const base64 = texto.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(texto.length / 4) * 4, '=');
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function leerJson(parte: string): Record<string, unknown> {
  try {
    const valor = JSON.parse(decodificador.decode(base64urlABytes(parte)));
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) return valor as Record<string, unknown>;
  } catch { /* se informa abajo */ }
  throw new ErrorToken('El token no tiene un formato válido.');
}

/**
 * Comprueba el token y devuelve el usuario. `obtenerClaves(forzar)` entrega las claves públicas de
 * Google; con `forzar` debe volver a descargarlas (Google las rota).
 */
export async function verificarTokenGoogle(
  token: string,
  clientId: string,
  obtenerClaves: (forzar: boolean) => Promise<ClavePublica[]>,
  ahora: number = Date.now()
): Promise<UsuarioGoogle> {
  const partes = token.split('.');
  if (partes.length !== 3) throw new ErrorToken('El token no tiene un formato válido.');
  const [cabeceraTexto, cargaTexto, firmaTexto] = partes;
  const cabecera = leerJson(cabeceraTexto);
  const carga = leerJson(cargaTexto);
  if (cabecera.alg !== 'RS256' || typeof cabecera.kid !== 'string') throw new ErrorToken('El token no usa la firma esperada.');

  let clave = (await obtenerClaves(false)).find(k => k.kid === cabecera.kid);
  if (!clave) clave = (await obtenerClaves(true)).find(k => k.kid === cabecera.kid);
  if (!clave) throw new ErrorToken('No se encontró la clave de Google que firmó el token.');
  const publica = await crypto.subtle.importKey('jwk', { kty: clave.kty, n: clave.n, e: clave.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valida = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publica, base64urlABytes(firmaTexto),
    new TextEncoder().encode(`${cabeceraTexto}.${cargaTexto}`));
  if (!valida) throw new ErrorToken('La firma del token no es válida.');

  if (!EMISORES.includes(carga.iss as string)) throw new ErrorToken('El token no lo emitió Google.');
  if (carga.aud !== clientId) throw new ErrorToken('El token es para otra aplicación.');
  if (typeof carga.exp !== 'number' || carga.exp + MARGEN_S < ahora / 1000) throw new ErrorToken('El token venció; inicia sesión de nuevo.');
  if (typeof carga.sub !== 'string' || !carga.sub) throw new ErrorToken('El token no identifica al usuario.');
  if (typeof carga.email !== 'string' || carga.email_verified !== true) throw new ErrorToken('La cuenta de Google no tiene un correo verificado.');
  return { sub: carga.sub, email: carga.email, nombre: typeof carga.name === 'string' ? carga.name : undefined };
}

/** Caché de las claves de Google en memoria del Worker, según el Cache-Control de Google. */
export function crearObtenerClaves(descargar: typeof fetch = fetch) {
  let claves: ClavePublica[] = [];
  let vence = 0;
  return async (forzar: boolean): Promise<ClavePublica[]> => {
    if (!forzar && claves.length && Date.now() < vence) return claves;
    const respuesta = await descargar(URL_CLAVES_GOOGLE);
    if (!respuesta.ok) throw new Error(`No se pudieron descargar las claves de Google (${respuesta.status}).`);
    const cuerpo = await respuesta.json() as { keys?: ClavePublica[] };
    claves = Array.isArray(cuerpo.keys) ? cuerpo.keys : [];
    const maxAge = /max-age=(\d+)/.exec(respuesta.headers.get('cache-control') ?? '')?.[1];
    vence = Date.now() + Math.min(Number(maxAge ?? 3600), 86_400) * 1000;
    return claves;
  };
}
