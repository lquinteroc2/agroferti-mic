import { useState } from 'react';
import { formatearExacto } from '../lib/formato';
import { departamentoDeUbicacion, fertilizantesQueAportan, nombreMes, resumenComposicion, type FertilizanteReferencia } from '../lib/referencias';
import type { ProductoFertilizante } from '../types';

/**
 * Fertilizantes que aportan la forma química de una meta: primero los de tu catálogo y luego los del
 * registro del ICA (los que tienen precio del DANE primero). Un producto del ICA se agrega a tu
 * catálogo con un toque, con el precio del departamento del lote si el DANE lo publica.
 */
export function ProductosSugeridos({ forma, productos, referencias, ubicacion, onElegir, onAgregar }: {
  forma: string;
  productos: ReadonlyArray<ProductoFertilizante>;
  referencias: ReadonlyArray<FertilizanteReferencia>;
  ubicacion?: string;
  onElegir: (productoId: string) => void;
  onAgregar: (referencia: FertilizanteReferencia, departamento?: string) => Promise<string>;
}) {
  const [agregando, setAgregando] = useState('');
  const [error, setError] = useState('');
  const propios = productos.filter(p => p.contenido.some(c => c.forma === forma)).slice(0, 4);
  const yaEnCatalogo = new Set(productos.map(p => p.registroIca).filter(Boolean));
  const delIca = fertilizantesQueAportan(referencias.filter(r => !yaEnCatalogo.has(r.registroIca)), forma, 3);
  if (!propios.length && !delIca.length) return null;

  async function agregar(r: FertilizanteReferencia, departamento?: string) {
    setAgregando(r.id);
    setError('');
    try {
      onElegir(await onAgregar(r, departamento));
    } catch {
      setError('No se pudo agregar el producto. Vuelve a intentarlo o regístralo en Productos.');
    } finally {
      setAgregando('');
    }
  }

  return (
    <div className="productos-sugeridos full-row">
      <strong>Fertilizantes que aportan {forma}</strong>
      <ul>
        {propios.map(p => <li key={p.id}>
          <span><strong>{p.nombre}</strong> · {forma} {formatearExacto(p.contenido.find(c => c.forma === forma)!.porcentaje)} % · en tu catálogo</span>
          <button type="button" className="btn btn-outline btn-small" onClick={() => onElegir(p.id)}>Usar</button>
        </li>)}
        {delIca.map(r => {
          const departamento = departamentoDeUbicacion(r, ubicacion);
          const precio = departamento ? r.precios.find(p => p.departamento === departamento) : undefined;
          return <li key={r.id}>
            <span>
              <strong>{r.nombre}</strong> · {resumenComposicion(r)} · registro ICA {r.registroIca}
              <small>{precio ? `Precio DANE ${precio.departamento}: ${formatearExacto(Math.round(precio.precioPromedioCop))} COP (${precio.presentacion}, ${nombreMes(precio.periodo)})`
                : r.precios.length ? 'Con precio DANE en otros departamentos: escribe el departamento en la ubicación del lote para usarlo.'
                : 'Sin precio: agrégalo después en Productos para calcular el costo.'}{r.verificacion !== 'ok' && ' · composición pendiente de verificar'}</small>
            </span>
            <button type="button" className="btn btn-outline btn-small" disabled={!!agregando} onClick={() => void agregar(r, departamento)}>{agregando === r.id ? 'Agregando…' : 'Agregar y usar'}</button>
          </li>;
        })}
      </ul>
      {error && <p className="field-error">{error}</p>}
      <small>Lista ordenada según lo que declara cada registro (no es una recomendación agronómica). Revisa que la etiqueta de tu bulto coincida.</small>
    </div>
  );
}
