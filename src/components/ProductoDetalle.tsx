import { precioPorKgCop } from '../lib/calculos';
import { fechaLegible, formatearExacto, formatearResultado } from '../lib/formato';
import type { ProductoFertilizante, ProductoVerificado } from '../types';

interface Props {
  producto: ProductoVerificado;
  onEditar: () => void;
  onEliminar: () => void;
}

const sinDato = <span className="missing">No registrado</span>;

export function OrigenBadge({ esEjemplo }: { esEjemplo?: boolean }) {
  if (esEjemplo === undefined) return null;
  return esEjemplo
    ? <span className="badge badge-example">EJEMPLO</span>
    : <span className="badge badge-entered">Etiqueta real</span>;
}

/** "N 18 % · P₂O₅ 46 %": las formas tal como las declara la etiqueta. */
export function resumenContenido(p: ProductoFertilizante): string {
  return p.contenido.map(c => `${c.forma} ${formatearExacto(c.porcentaje)} %`).join(' · ');
}

function PrecioPorKg({ p }: { p: ProductoFertilizante }) {
  const { precioPresentacionCop: precio, presentacionKg: kg } = p;
  if (precio === undefined || kg === undefined) {
    return <div className="missing-box"><strong>Falta un dato para calcular:</strong> {precio === undefined ? 'el producto no tiene precio registrado.' : 'faltan los kg por bulto.'} Sin precio no se calcula el costo en los planes; la cantidad de producto sí.</div>;
  }
  try {
    return <code>{formatearExacto(precio)} COP ÷ {formatearExacto(kg)} kg = <b>{formatearResultado(precioPorKgCop(precio, kg))} COP por kg</b></code>;
  } catch (error) {
    return <div className="missing-box"><strong>No se puede calcular:</strong> {error instanceof Error ? error.message : 'revisa el precio y los kg del bulto.'}</div>;
  }
}

export function ProductoDetalle({ producto: v, onEditar, onEliminar }: Props) {
  const p = v.producto;
  return (
    <article className="soil-detail" aria-labelledby={`titulo-producto-${v.id}`}>
      <div className="soil-detail-head">
        <div>
          <div className="section-kicker">PRODUCTO DEL CATÁLOGO</div>
          <h3 id={`titulo-producto-${v.id}`}>{v.nombre || 'Producto sin nombre'}</h3>
          <span className="card-badges"><OrigenBadge esEjemplo={p?.esEjemplo} />{v.problemas.length > 0 && <span className="badge badge-error">Datos por corregir</span>}</span>
        </div>
        <div className="soil-actions">
          <button className="btn btn-outline btn-small" onClick={onEditar}>Editar</button>
          <button className="btn btn-danger btn-small" onClick={onEliminar}>Eliminar</button>
        </div>
      </div>

      {v.problemas.length > 0 && <div className="error-box" role="alert">
        <strong>Hay datos guardados que deben corregirse.</strong>
        <ul>{v.problemas.map(p => <li key={p.campo}>{p.etiqueta}: {p.detalle} Valor guardado: <code>{p.valorOriginal}</code></li>)}</ul>
        <p>Este producto no se puede usar en un plan hasta corregirlo. Pulsa <strong>Editar</strong> y vuelve a escribir los datos desde la etiqueta.</p>
      </div>}

      {v.camposAdicionales.length > 0 && <div className="trace-box">
        <strong>Datos de otra versión conservados</strong>
        <p>Este registro tiene campos que esta versión no muestra ni edita ({v.camposAdicionales.join(', ')}). Se conservan intactos al guardar cambios.</p>
      </div>}

      {p && <>
        <section className="soil-block entered" aria-labelledby={`datos-producto-${v.id}`}>
          <h4 id={`datos-producto-${v.id}`}><span className="badge badge-entered">Datos ingresados</span> Lo que registraste de la etiqueta</h4>
          <div className="table-wrap"><table className="soil-table">
            <caption className="sr-only">Contenido declarado en la etiqueta</caption>
            <thead><tr><th scope="col">Elemento</th><th scope="col">Forma química</th><th scope="col">% declarado</th></tr></thead>
            <tbody>{p.contenido.map(c => <tr key={`${c.elemento}-${c.forma}`}>
              <td>{c.elemento}</td>
              <td>{c.forma}</td>
              <td>{formatearExacto(c.porcentaje)} %</td>
            </tr>)}</tbody>
          </table></div>
          <dl className="data-list">
            <div><dt>Kg por bulto</dt><dd>{p.presentacionKg !== undefined ? `${formatearExacto(p.presentacionKg)} kg` : sinDato}</dd></div>
            <div><dt>Precio del bulto</dt><dd>{p.precioPresentacionCop !== undefined ? `${formatearExacto(p.precioPresentacionCop)} COP` : sinDato}</dd></div>
            <div><dt>Fecha del precio</dt><dd>{p.fechaPrecio ? fechaLegible(p.fechaPrecio) : sinDato}</dd></div>
          </dl>
        </section>

        <section className="soil-block calculated" aria-labelledby={`calc-producto-${v.id}`}>
          <h4 id={`calc-producto-${v.id}`}><span className="badge badge-calc">Resultado calculado</span> Precio por kg</h4>
          <div className="calc-step">
            <strong>Precio del bulto ÷ kg del bulto</strong>
            <p>Se usa para calcular el costo en los planes de fertilización.</p>
            <PrecioPorKg p={p} />
          </div>
        </section>
      </>}

      <div className="warning-box" role="note">
        <span className="badge badge-warn">Importante</span>
        <p>El catálogo solo guarda lo que dice la etiqueta. <strong>La app no recomienda productos ni dosis.</strong> Los planes guardan su propia copia de cada producto: editarlo o eliminarlo aquí no cambia los planes ya creados.</p>
      </div>
    </article>
  );
}
