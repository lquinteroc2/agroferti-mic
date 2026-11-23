/**
 * Lectura de PDF en Safari (iPhone con iOS 18): PDF.js recorre flujos con `for await`, que ese
 * navegador no trae. Se simula ese navegador con un flujo al que se le quita esa forma de recorrerlo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { permitirRecorrerFlujos } from '../src/lib/compatibilidad.ts';

/** Un `ReadableStream` como el de Safari: sin `for await`. */
function flujoComoSafari() {
  class FlujoSafari<R> extends ReadableStream<R> {}
  Object.defineProperty(FlujoSafari.prototype, Symbol.asyncIterator, { value: undefined, writable: true, configurable: true });
  return FlujoSafari;
}

function flujoDe<R>(Clase: new (fuente: UnderlyingDefaultSource<R>) => ReadableStream<R>, partes: R[]) {
  let cancelado = false;
  const flujo = new Clase({
    pull(control) { const parte = partes.shift(); if (parte === undefined) control.close(); else control.enqueue(parte); },
    cancel() { cancelado = true; }
  });
  return { flujo, cancelado: () => cancelado };
}

async function recorrer<R>(flujo: ReadableStream<R>, hasta = Infinity): Promise<R[]> {
  const vistos: R[] = [];
  for await (const parte of flujo as unknown as AsyncIterable<R>) {
    vistos.push(parte);
    if (vistos.length >= hasta) break;
  }
  return vistos;
}

test('sin el arreglo, recorrer el flujo falla como en el iPhone (reproduce el error)', async () => {
  const { flujo } = flujoDe(flujoComoSafari(), ['a', 'b']);
  await assert.rejects(recorrer(flujo), TypeError);
});

test('con el arreglo, el flujo se recorre completo y queda libre', async () => {
  const Clase = flujoComoSafari();
  assert.equal(permitirRecorrerFlujos(Clase), true);
  const { flujo, cancelado } = flujoDe(Clase, ['a', 'b', 'c']);
  assert.deepEqual(await recorrer(flujo), ['a', 'b', 'c']);
  assert.equal(flujo.locked, false);
  assert.equal(cancelado(), false);
});

test('si se deja de recorrer antes del final, el flujo se cancela', async () => {
  const Clase = flujoComoSafari();
  permitirRecorrerFlujos(Clase);
  const { flujo, cancelado } = flujoDe(Clase, ['a', 'b', 'c']);
  assert.deepEqual(await recorrer(flujo, 1), ['a']);
  assert.equal(cancelado(), true);
  assert.equal(flujo.locked, false);
});

test('un error del flujo llega a quien lo recorre', async () => {
  const Clase = flujoComoSafari();
  permitirRecorrerFlujos(Clase);
  const flujo = new Clase<string>({ pull() { throw new Error('falló la lectura'); } });
  await assert.rejects(recorrer(flujo), /falló la lectura/);
});

test('no cambia nada en un navegador que ya sabe recorrer flujos', () => {
  const original = ReadableStream.prototype[Symbol.asyncIterator];
  assert.equal(permitirRecorrerFlujos(ReadableStream), false);
  assert.equal(ReadableStream.prototype[Symbol.asyncIterator], original);
});
