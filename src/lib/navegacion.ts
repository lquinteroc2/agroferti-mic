/**
 * Botón "atrás" del celular (y del navegador). La app no tiene rutas: cada pantalla y cada
 * formulario abierto dentro de una sección se registra en el historial del navegador. Así, "atrás"
 * cierra el formulario o vuelve a la pantalla anterior, en lugar de salir de la app.
 */
import { useEffect, useRef } from 'react';

interface Capa { id: number; cerrar: () => void }

const capas: Capa[] = [];
let siguienteId = 1;
/** Retrocesos hechos por la propia app (al cerrar un formulario con sus botones): no se procesan. */
let ignorar = 0;
let alVolverPantalla: ((estado: unknown) => void) | undefined;
let instalado = false;

function instalar() {
  if (instalado || typeof window === 'undefined') return;
  instalado = true;
  window.addEventListener('popstate', e => {
    if (ignorar > 0) { ignorar--; return; }
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

/** Vuelve a la pantalla anterior como el botón "atrás", saltando los formularios abiertos encima. */
export function volverPantalla(): void {
  instalar();
  const abiertos = capas.length;
  capas.length = 0;
  history.go(-(1 + abiertos));
}

export function reemplazarPantalla(estado: object): void {
  instalar();
  history.replaceState(estado, '');
}

/**
 * Mientras `abierto` sea true (un formulario o detalle dentro de una sección), "atrás" llama a
 * `cerrar` en vez de cambiar de pantalla. Al abrirse, lleva la vista al título de la sección
 * (`anclaId`) y le pasa el foco, para que se vea y se anuncie dónde empieza.
 */
export function useCapaAtras(abierto: boolean, cerrar: () => void, anclaId?: string): void {
  const cerrarActual = useRef(cerrar);
  cerrarActual.current = cerrar;

  useEffect(() => {
    if (!abierto) return;
    instalar();
    const capa: Capa = { id: siguienteId++, cerrar: () => cerrarActual.current() };
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
