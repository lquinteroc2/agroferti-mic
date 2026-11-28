/**
 * Botón "atrás" del celular (y del navegador). La app no tiene rutas: cada pantalla y cada
 * formulario abierto dentro de una sección se registra en el historial del navegador. Así, "atrás"
 * cierra el formulario o vuelve a la pantalla anterior, en lugar de salir de la app.
 */
import { useEffect, useRef } from 'react';

interface Capa { id: number; cerrar: () => void; conDatos: () => boolean }

const capas: Capa[] = [];
let siguienteId = 1;
/** Retrocesos hechos por la propia app (al cerrar un formulario con sus botones): no se procesan. */
let ignorar = 0;
let alVolverPantalla: ((estado: unknown) => void) | undefined;
/** Pantalla que reemplaza a la actual cuando termine de salir de los formularios abiertos. */
let reemplazoPendiente: object | undefined;
let instalado = false;

function instalar() {
  if (instalado || typeof window === 'undefined') return;
  instalado = true;
  window.addEventListener('popstate', e => {
    if (ignorar > 0) {
      ignorar--;
      if (ignorar === 0 && reemplazoPendiente) {
        history.replaceState(reemplazoPendiente, '');
        reemplazoPendiente = undefined;
        // El navegador pudo devolver la posición del formulario que se dejó: la pantalla nueva empieza arriba.
        window.scrollTo(0, 0);
      }
      return;
    }
    const capa = capas.pop();
    if (capa) { capa.cerrar(); return; }
    const estado = e.state as { capa?: number } | null;
    // Entrada de un formulario que ya se cerró por otra vía: se salta.
    if (estado?.capa) { history.back(); return; }
    alVolverPantalla?.(estado);
  });
}

/** La app registra cómo volver a una pantalla anterior a partir del estado guardado. */
export function alVolver(fn: (estado: unknown) => void): void {
  instalar();
  alVolverPantalla = fn;
}

/** Registra una pantalla nueva en el historial. */
export function registrarPantalla(estado: object): void {
  instalar();
  capas.length = 0;
  history.pushState(estado, '');
}

/** Vuelve `pantallas` pantallas atrás como el botón "atrás", saltando los formularios abiertos encima. */
export function volverPantalla(pantallas = 1): void {
  instalar();
  const abiertos = capas.length;
  capas.length = 0;
  history.go(-(pantallas + abiertos));
}

/** true si hay un formulario abierto (con datos que se perderían al cambiar de pantalla). */
export const hayFormularioAbierto = (): boolean => capas.some(c => c.conDatos());

/**
 * Cambia la pantalla actual sin dejarla en el historial (p. ej. pasar al paso siguiente del lote). Si
 * hay formularios abiertos encima, primero se sale de ellos para que "atrás" no vuelva a un formulario
 * que ya no se ve.
 */
export function reemplazarPantalla(estado: object): void {
  instalar();
  const abiertos = capas.length;
  if (abiertos === 0) { history.replaceState(estado, ''); return; }
  capas.length = 0;
  ignorar++;
  reemplazoPendiente = estado;
  history.go(-abiertos);
}

/**
 * Mientras `abierto` sea true (un formulario o detalle dentro de una sección), "atrás" llama a
 * `cerrar` en vez de cambiar de pantalla. Al abrirse, lleva la vista al título de la sección
 * (`anclaId`) y le pasa el foco, para que se vea y se anuncie dónde empieza. `conDatos` dice si es un
 * formulario (lo escrito se perdería al salir) o solo un detalle.
 */
export function useCapaAtras(abierto: boolean, cerrar: () => void, anclaId?: string, conDatos = true): void {
  const cerrarActual = useRef(cerrar);
  cerrarActual.current = cerrar;
  const conDatosActual = useRef(conDatos);
  conDatosActual.current = conDatos;

  useEffect(() => {
    if (!abierto) return;
    instalar();
    const capa: Capa = { id: siguienteId++, cerrar: () => cerrarActual.current(), conDatos: () => conDatosActual.current };
    capas.push(capa);
    history.pushState({ capa: capa.id }, '');
    if (anclaId) {
      const titulo = document.getElementById(anclaId);
      titulo?.scrollIntoView({ block: 'start' });
      if (titulo) {
        if (!titulo.hasAttribute('tabindex')) titulo.setAttribute('tabindex', '-1');
        titulo.focus({ preventScroll: true });
      }
    }
    return () => {
      const i = capas.indexOf(capa);
      if (i < 0) return; // ya la cerró el botón "atrás"
      capas.splice(i, 1);
      // Cerrado con los botones de la app: se quita su entrada del historial, si sigue arriba.
      if ((history.state as { capa?: number } | null)?.capa === capa.id) {
        ignorar++;
        history.back();
      }
    };
  }, [abierto, anclaId]);
}

/** Lleva la vista a un título de la página y le pasa el foco, para que se vea y se anuncie dónde empieza. */
export function llevarA(id: string): void {
  const titulo = document.getElementById(id);
  if (!titulo) return;
  titulo.scrollIntoView({ block: 'start' });
  if (!titulo.hasAttribute('tabindex')) titulo.setAttribute('tabindex', '-1');
  titulo.focus({ preventScroll: true });
}
