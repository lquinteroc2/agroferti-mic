/**
 * Revisión UX, tanda 5: modo práctica (preferencia de este dispositivo). Sin almacenamiento, la app
 * empieza los registros como datos reales; con el modo activo, como EJEMPLO.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cambiarModoPractica, modoPractica, origenInicial, preferenciasExternas } from '../src/lib/preferencias.ts';

test('modo práctica: sin almacenamiento disponible está apagado y lo nuevo empieza como dato real', () => {
  assert.equal(modoPractica(), false);
  assert.equal(origenInicial(), 'real');
  assert.doesNotThrow(() => cambiarModoPractica(true));
});

test('modo práctica: se guarda en el dispositivo, avisa a la interfaz y lo nuevo empieza como EJEMPLO', () => {
  const datos = new Map<string, string>();
  const almacen = { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => { datos.set(k, v); }, removeItem: (k: string) => { datos.delete(k); } };
  Object.defineProperty(globalThis, 'localStorage', { value: almacen, configurable: true });
  try {
    let avisos = 0;
    const quitar = preferenciasExternas.suscribir(() => { avisos++; });
    cambiarModoPractica(true);
    assert.equal(modoPractica(), true);
    assert.equal(origenInicial(), 'ejemplo');
    cambiarModoPractica(false);
    assert.equal(origenInicial(), 'real');
    assert.equal(avisos, 2);
    quitar();
    cambiarModoPractica(true);
    assert.equal(avisos, 2, 'después de quitar la suscripción ya no avisa');
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test('revisión de la tanda 5: el modo práctica se actualiza si se cambia en otra pestaña', () => {
  const manejadores = new Set<(e: { key: string | null }) => void>();
  const g = globalThis as unknown as { addEventListener?: unknown; removeEventListener?: unknown };
  const antes = { add: g.addEventListener, remove: g.removeEventListener };
  g.addEventListener = (tipo: string, fn: (e: { key: string | null }) => void) => { if (tipo === 'storage') manejadores.add(fn); };
  g.removeEventListener = (tipo: string, fn: (e: { key: string | null }) => void) => { if (tipo === 'storage') manejadores.delete(fn); };
  try {
    let avisos = 0;
    const quitar = preferenciasExternas.suscribir(() => { avisos++; });
    assert.equal(manejadores.size, 1);
    manejadores.forEach(fn => fn({ key: 'otra-clave' }));
    assert.equal(avisos, 0, 'otras claves no cuentan');
    manejadores.forEach(fn => fn({ key: 'agroferti:modo-practica' }));
    assert.equal(avisos, 1);
    quitar();
    assert.equal(manejadores.size, 0, 'al quitar la suscripción se quita el oyente');
  } finally {
    g.addEventListener = antes.add;
    g.removeEventListener = antes.remove;
  }
});
