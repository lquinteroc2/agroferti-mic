/**
 * Arreglos para navegadores a los que les falta algo que usan las librerías.
 *
 * PDF.js (también su versión "legacy") recorre flujos de datos con `for await (… of flujo)`. Safari
 * (iPhone con iOS 18, por ejemplo) no sabe recorrer así un `ReadableStream` y la lectura del PDF
 * falla con "undefined is not a function". Aquí se agrega esa forma de recorrerlo, solo si falta.
 */

type ConIteracion<R> = { [Symbol.asyncIterator]?: () => AsyncGenerator<R, void, undefined> };

async function* recorrerFlujo<R>(this: ReadableStream<R>): AsyncGenerator<R, void, undefined> {
  const lector = this.getReader();
  let terminado = false;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) { terminado = true; return; }
      yield value;
    }
  } finally {
    // Si se deja de recorrer antes del final, se cancela el flujo (como hacen los navegadores que sí lo traen).
    if (!terminado) await lector.cancel().catch(() => undefined);
    lector.releaseLock();
  }
}

/**
 * Permite recorrer flujos con `for await` en navegadores que no lo traen. No cambia nada si el
 * navegador ya lo trae. `clase` es para las pruebas; por defecto, el `ReadableStream` del navegador.
 * Devuelve `true` si tuvo que agregarlo.
 */
export function permitirRecorrerFlujos(clase: { prototype: object } | undefined = globalThis.ReadableStream): boolean {
  if (!clase) return false;
  const prototipo = clase.prototype as ConIteracion<unknown>;
  if (typeof prototipo[Symbol.asyncIterator] === 'function') return false;
  Object.defineProperty(prototipo, Symbol.asyncIterator, { value: recorrerFlujo, writable: true, configurable: true });
  return true;
}
