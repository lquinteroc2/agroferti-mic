/**
 * Protocolo entre la app y la API de la nube (Worker + D1). Lo usan los dos lados: la app para
 * armar las solicitudes y el Worker para validarlas antes de tocar la base de datos.
 *
 * Los límites mantienen cada solicitud dentro del plan gratuito de Cloudflare (50 consultas a D1,
 * 10 ms de CPU y 128 MB de memoria por solicitud): la app sube los cambios en lotes pequeños y la
 * nube los devuelve en páginas acotadas también por tamaño.
 */
import { esObjeto } from './validacion.ts';

/** Tablas del dispositivo que se guardan en la nube (las mismas de la copia de seguridad). */
export const TABLAS_NUBE = ['lotes', 'analisisSuelos', 'productos', 'planes', 'registros', 'ciclos'] as const;
export type TablaNube = typeof TABLAS_NUBE[number];

/** Cambios que la app sube por solicitud (cada uno es una consulta a D1). */
export const MAX_SUBIDA = 25;
/** Cambios que la nube devuelve como máximo por solicitud. */
export const MAX_BAJADA = 200;
/** Tamaño que la nube devuelve como máximo por solicitud (texto de los registros). */
export const MAX_BYTES_BAJADA = 1_000_000;
/** Tamaño máximo de un registro codificado (un lote o un plan pesan unos pocos KB). */
export const MAX_DATOS = 50_000;
/** Tamaño máximo del cuerpo de una solicitud: 25 cambios de 50 KB más la estructura. */
export const MAX_CUERPO = 1_400_000;
/** Cuota por cuenta: protege el almacenamiento gratuito (500 MB) compartido por todos los usuarios. */
export const CUOTA_BYTES = 20_000_000;
export const CUOTA_FILAS = 50_000;
/** Versión del texto de autorización de datos (Ley 1581) que se registra al aceptarlo. */
export const VERSION_AUTORIZACION = '2026-11-17';

const MAX_ID = 200;
/** Fecha de actualización: ISO UTC como la de `toISOString()`, o vacía en registros sin fecha. */
export const FORMATO_ACTUALIZADO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Un cambio de un registro: `datos` es el registro codificado, o null si se eliminó. */
export interface Cambio {
  tabla: TablaNube;
  id: string;
  datos: string | null;
  /** updatedAt del registro (o la hora de la eliminación). Gana el más reciente. */
  actualizado: string;
}

/** Cambio guardado en la nube, con su número de versión. */
export interface CambioNube extends Cambio {
  version: number;
}

export interface SolicitudSincronizar {
  /** Última versión que el dispositivo ya recibió (0 la primera vez). */
  desde: number;
  cambios: Cambio[];
}

export interface RegistroInvalido {
  tabla: TablaNube;
  id: string;
  motivo: string;
}

export interface RespuestaSincronizar {
  /**
   * Identifica la cuenta en la nube. Cambia si la cuenta se borra y se vuelve a crear: entonces el
   * dispositivo debe olvidar lo sincronizado y subir todo de nuevo.
   */
  epoca: string;
  /** Cambios que la nube no aceptó porque tenía una versión más reciente: se devuelve la de la nube. */
  rechazados: CambioNube[];
  /** Cambios que la nube no guardó por tener datos no válidos (no se reintentan hasta corregirlos). */
  invalidos: RegistroInvalido[];
  /** La cuenta llegó a su cuota: no se guardó ningún cambio (las eliminaciones sí). */
  cuotaExcedida: boolean;
  /** Cambios posteriores a `desde`, en orden de versión. */
  cambios: CambioNube[];
  /** Versión hasta la que el dispositivo queda al día. */
  hasta: number;
  /** Hay más cambios: pedir de nuevo desde `hasta`. */
  hayMas: boolean;
}

export interface SolicitudSesion {
  /** ID token de Google (Sign in with Google). */
  credencial: string;
  /** El usuario aceptó la autorización de tratamiento de datos en esta sesión. */
  consentimiento: boolean;
  /** Cuenta a la que está vinculado el dispositivo: si es otra, la nube no crea nada. */
  vinculado?: string;
}

export interface RespuestaSesion {
  token: string;
  /** Fecha ISO en que vence la sesión. */
  vence: string;
  epoca: string;
  usuario: { sub: string; email: string; nombre?: string; foto?: string };
}

/** Respuesta de error de la API: `codigo` permite a la app decidir qué mostrar. */
export interface ErrorApi {
  error: string;
  codigo: 'no-autorizado' | 'sin-consentimiento' | 'otra-cuenta' | 'solicitud-invalida' | 'limite-diario' | 'no-configurado' | 'error-interno';
}

export const esTablaNube = (v: unknown): v is TablaNube => (TABLAS_NUBE as ReadonlyArray<unknown>).includes(v);

/** Valida el cuerpo de /api/sincronizar. Devuelve la solicitud limpia o el motivo del rechazo. */
export function validarSolicitudSincronizar(cuerpo: unknown): { ok: true; solicitud: SolicitudSincronizar } | { ok: false; error: string } {
  if (!esObjeto(cuerpo)) return { ok: false, error: 'La solicitud no tiene la estructura esperada.' };
  const { desde, cambios } = cuerpo;
  if (typeof desde !== 'number' || !Number.isSafeInteger(desde) || desde < 0) return { ok: false, error: '"desde" debe ser un entero no negativo.' };
  if (!Array.isArray(cambios)) return { ok: false, error: '"cambios" debe ser una lista.' };
  if (cambios.length > MAX_SUBIDA) return { ok: false, error: `Se admiten como máximo ${MAX_SUBIDA} cambios por solicitud.` };
  const limpios: Cambio[] = [];
  const vistos = new Set<string>();
  for (const c of cambios) {
    if (!esObjeto(c) || !esTablaNube(c.tabla)) return { ok: false, error: 'Un cambio no indica una tabla válida.' };
    if (typeof c.id !== 'string' || !c.id || c.id.length > MAX_ID) return { ok: false, error: 'Un cambio no tiene un identificador válido.' };
    if (typeof c.actualizado !== 'string' || (c.actualizado !== '' && !FORMATO_ACTUALIZADO.test(c.actualizado))) {
      return { ok: false, error: 'Un cambio no tiene una fecha de actualización válida.' };
    }
    if (c.datos !== null && (typeof c.datos !== 'string' || c.datos.length > MAX_DATOS)) return { ok: false, error: 'Los datos de un cambio no son válidos o son demasiado grandes.' };
    const clave = `${c.tabla}/${c.id}`;
    if (vistos.has(clave)) return { ok: false, error: 'Un registro aparece dos veces en la misma solicitud.' };
    vistos.add(clave);
    limpios.push({ tabla: c.tabla, id: c.id, datos: c.datos, actualizado: c.actualizado });
  }
  return { ok: true, solicitud: { desde, cambios: limpios } };
}

/** Fecha de actualización de un registro, en el formato que acepta la nube ('' si no tiene). */
export function actualizadoDe(registro: unknown): string {
  return esObjeto(registro) && typeof registro.updatedAt === 'string' && FORMATO_ACTUALIZADO.test(registro.updatedAt) ? registro.updatedAt : '';
}
