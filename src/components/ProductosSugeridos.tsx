import { useState } from 'react';
import { conversionEntre, otraForma } from '../lib/conversionFormas';
import { formatearExacto, pesos } from '../lib/formato';
import { departamentoNombrado, fertilizantesQueAportan, nombreMes, precioParaDepartamento, resumenComposicion, type FertilizanteReferencia } from '../lib/referencias';
import type { ProductoFertilizante } from '../types';

/**
 * Fertilizantes que aportan la forma química de una meta: primero los de tu catálogo y luego los del
 * registro del ICA (primero los que tienen precio del DANE en el departamento del lote). Un producto
 * del ICA se agrega a tu catálogo con un toque, con el precio del DANE del departamento del lote o,
 * si allí no se publica, el del departamento más cercano que lo publica (dicho claramente).
 */
export function ProductosSugeridos({ forma, elemento, productos, referencias, lote, onElegir, onAgregar }: {
  forma: string;
  /** Nutriente de la meta: también sirven las etiquetas con la otra forma (P₂O₅ para una meta en P). */
  elemento?: string;
  productos: ReadonlyArray<ProductoFertilizante>;
  referencias: ReadonlyArray<FertilizanteReferencia>;
  /** Departamento elegido y ubicación escrita del lote, para tomar el precio DANE de esa zona. */
  lote: { departamento?: string; ubicacion?: string };
  onElegir: (productoId: string) => void;
  onAgregar: (referencia: FertilizanteReferencia, departamento?: string, sinPrecioEn?: string) => Promise<string>;
}) {
  const [agregando, setAgregando] = useState('');
  const [error, setError] = useState('');
  // La forma de la etiqueta con que el producto cubre la meta: la misma o la otra forma del nutriente.
  const formaQueSirve = (contenido: ProductoFertilizante['contenido']) =>
    contenido.find(c => c.forma === forma) ?? (elemento ? contenido.find(c => conversionEntre(c, { elemento, forma })) : undefined);
  const propios = productos.filter(p => formaQueSirve(p.contenido)).slice(0, 4);
  const yaEnCatalogo = new Set(productos.map(p => p.registroIca).filter(Boolean));
  const departamentoLote = departamentoNombrado(lote);
  const delIca = fertilizantesQueAportan(referencias.filter(r => !yaEnCatalogo.has(r.registroIca)), forma, 3, departamentoLote, elemento);
  if (!propios.length && !delIca.length) return null;

  async function agregar(r: FertilizanteReferencia, departamento?: string, sinPrecioEn?: string) {
    setAgregando(r.id);
    setError('');
    try {
      onElegir(await onAgregar(r, departamento, sinPrecioEn));
    } catch {
      setError('No se pudo agregar el producto. Vuelve a intentarlo o regístralo en Productos.');
    } finally {
      setAgregando('');
    }
  }

  return (
    <div className="productos-sugeridos full-row">
      <strong>Fertilizantes que aportan {forma}{elemento && otraForma({ elemento, forma }) ? ` (también los que lo declaran como ${otraForma({ elemento, forma })})` : ''}</strong>
      <ul>
        {propios.map(p => <li key={p.id}>
          <span><strong>{p.nombre}</strong> · {formaQueSirve(p.contenido)!.forma} {formatearExacto(formaQueSirve(p.contenido)!.porcentaje)} % · en tu catálogo</span>
          <button type="button" className="btn btn-outline btn-small" onClick={() => onElegir(p.id)}>Usar</button>
        </li>)}
        {delIca.map(r => {
          const eleccion = precioParaDepartamento(r, departamentoLote);
          const precio = eleccion?.precio;
          return <li key={r.id}>
            <span>
              <strong>{r.nombre}</strong> · {resumenComposicion(r)} · registro ICA {r.registroIca}
              <small>{precio ? `Precio DANE ${precio.departamento}: ${pesos(Math.round(precio.precioPromedioCop))} (${precio.presentacion}, ${nombreMes(precio.periodo)})${eleccion.sinPrecioEn ? ` · en ${eleccion.sinPrecioEn} el DANE no lo publica; es el del departamento más cercano que sí` : ''}`
                : r.precios.length ? 'Con precio DANE en otros departamentos: elige el departamento del lote en «Editar información» para usarlo.'
                : 'Sin precio del DANE: después de agregarlo puedes escribir lo que te cobran.'}{r.verificacion !== 'ok' && ' · composición pendiente de verificar'}</small>
            </span>
            <button type="button" className="btn btn-outline btn-small" disabled={!!agregando} onClick={() => void agregar(r, precio?.departamento, eleccion?.sinPrecioEn)}>{agregando === r.id ? 'Agregando…' : 'Agregar y usar'}</button>
          </li>;
        })}
      </ul>
      {error && <p className="field-error">{error}</p>}
      <small>Lista ordenada según lo que declara cada registro (no es una recomendación agronómica). Revisa que la etiqueta de tu bulto coincida.</small>
    </div>
  );
}
