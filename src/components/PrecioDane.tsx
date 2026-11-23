import { useState } from 'react';
import { formatearExacto, pesos } from '../lib/formato';
import { datosDePrecio, nombreMes, precioDaneParaProducto, type FertilizanteReferencia } from '../lib/referencias';
import { fechaLocalISO, validarNumero } from '../lib/validacion';
import type { ProductoFertilizante } from '../types';

export type DatosPrecio = { precioPresentacionCop: number; fechaPrecio: string; fuentePrecio: string; presentacionKg?: number };

/** Fuente que queda en un precio escrito por el productor (el que le cobran en su almacén). */
export const FUENTE_PRECIO_PROPIO = 'Precio escrito por el productor (lo que le cobran en el almacén)';

/** "153.000" o "153,000": parece un precio con separador de miles; la app lo leería como 153. */
const conSeparadorDeMiles = (t: string) => /^\d{1,3}([.,]\d{3})+$/.test(t.trim());

/**
 * Precio de un producto donde hace falta: si no tiene precio (no se calcula el costo) o si el DANE
 * publicó uno más reciente. Ofrece el precio del DANE del departamento de los lotes (o del más
 * cercano que lo publica, dicho claramente) y, si no tiene precio, escribir lo que cobra el almacén.
 * No muestra nada si el producto ya tiene un precio propio o el mismo del DANE.
 */
export function PrecioDane({ producto, referencias, departamento, onGuardar }: {
  producto: ProductoFertilizante;
  referencias: ReadonlyArray<FertilizanteReferencia>;
  /** Departamento del lote (en el plan) o el más frecuente de los lotes (en Productos). */
  departamento?: string;
  onGuardar: (precio: DatosPrecio) => Promise<void>;
}) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const eleccion = precioDaneParaProducto(producto, referencias, departamento);
  const sinPrecio = producto.precioPresentacionCop === undefined;
  if (!eleccion && !sinPrecio) return null;

  async function guardar(precio: DatosPrecio) {
    setGuardando(true);
    setError('');
    try {
      await onGuardar(precio);
      setTexto('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el precio. Vuelve a intentarlo.');
    } finally {
      setGuardando(false);
    }
  }
  function guardarPropio() {
    if (conSeparadorDeMiles(texto)) { setError('Escribe el precio sin puntos ni comas de miles, por ejemplo 153000.'); return; }
    const v = validarNumero(texto, { campo: 'Precio del bulto', requerido: true, positivo: true });
    if (!v.ok) { setError(v.error); return; }
    if (!Number.isInteger(v.valor)) { setError('Precio del bulto: escribe pesos enteros, sin centavos.'); return; }
    void guardar({ precioPresentacionCop: v.valor!, fechaPrecio: fechaLocalISO(), fuentePrecio: FUENTE_PRECIO_PROPIO });
  }

  const kg = producto.presentacionKg;
  return (
    <div className="hint hint-warn precio-dane" role="group" aria-label={`Precio de ${producto.nombre}`}>
      <p><strong>{sinPrecio || !eleccion ? `${producto.nombre} no tiene precio: por eso no se calcula el costo.` : `El DANE publicó el precio de ${nombreMes(eleccion.precio.periodo)} para ${producto.nombre}.`}</strong></p>
      {eleccion && <>
        <p>Precio del DANE en {eleccion.precio.departamento}: <strong>{pesos(Math.round(eleccion.precio.precioPromedioCop))}</strong> ({eleccion.precio.presentacion}, {nombreMes(eleccion.precio.periodo)}).
          {eleccion.sinPrecioEn && <> El DANE no lo publica en {eleccion.sinPrecioEn}; es el del departamento más cercano que sí lo publica.</>}</p>
        {(() => { const kgDane = datosDePrecio(eleccion).presentacionKg; return kgDane !== undefined && producto.presentacionKg !== undefined && kgDane !== producto.presentacionKg
          && <p>Ese precio es del bulto de {formatearExacto(kgDane)} kg: al usarlo, el producto quedará con bulto de {formatearExacto(kgDane)} kg.</p>; })()}
        <button type="button" className="btn btn-outline btn-small" disabled={guardando} onClick={() => void guardar(datosDePrecio(eleccion))}>Usar este precio</button>
      </>}
      {sinPrecio && (kg === undefined
        ? <p>{eleccion ? 'O, para escribir' : 'Para escribir'} lo que te cobran, primero escribe los kg del bulto: toca Editar en el producto (en Productos).</p>
        : <label>{eleccion ? 'O escribe' : 'Escribe'} lo que te cobran por el bulto de {formatearExacto(kg)} kg (pesos)
          <span className="precio-propio">
            <input inputMode="numeric" enterKeyHint="done" value={texto} onChange={e => { setTexto(e.target.value); setError(''); }} placeholder="Ej. 150000" aria-invalid={!!error}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (texto.trim()) guardarPropio(); } }} />
            <button type="button" className="btn btn-outline btn-small" disabled={guardando || !texto.trim()} onClick={guardarPropio}>Guardar mi precio</button>
          </span>
          <small>Sin puntos de miles. Queda guardado en Mis productos con la fecha de hoy, para todos tus lotes.</small>
        </label>)}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
