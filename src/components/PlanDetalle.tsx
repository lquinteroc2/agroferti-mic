import { calcularPlan, type Calculo, type ResultadoLineaPlan } from '../lib/calculos';
import { mismaForma } from '../lib/catalogoNutrientes';
import { fechaDeMarca, fechaLegible, formatearExacto, formatearResultado } from '../lib/formato';
import type { AnalisisVerificado, EstadoPlan, PlanVerificado } from '../types';
import { EstadoPlanBadge, NOMBRE_ESTADO, PlanEstado, type DatosCambio } from './PlanEstado';
import { OrigenBadge } from './ProductoDetalle';

interface Props {
  plan: PlanVerificado;
  analisis: ReadonlyArray<AnalisisVerificado>;
  onEditar: () => void;
  onEliminar: () => void;
  onCambiarEstado: (nuevo: EstadoPlan, datos: DatosCambio) => Promise<void>;
  onCopiar: (datos: DatosCambio) => Promise<void>;
  /** Plan del que se copió este, si sigue existiendo. */
  origen?: { nombre: string; estado?: EstadoPlan; abrir: () => void };
}

const sinDato = <span className="missing">No registrado</span>;
const kg = (n: number) => formatearResultado(n, 2);
const cop = (n: number) => formatearResultado(n, 0);

function Falta({ calculo }: { calculo: Extract<Calculo<number>, { ok: false }> }) {
  return <p className="calc-skip">No calculado: {calculo.mensaje}</p>;
}

/** "+39,13", "≈ -10" o "0": la diferencia la calcula calcularPlan; aquí solo se muestra con su signo. */
function diferencia(d: number): string {
  if (d === 0) return '0';
  // Una diferencia que el redondeo a 2 decimales dejaría en cero se muestra como "≈ 0", no como "-0".
  if (Math.abs(d) < 0.005) return '≈ 0';
  return `${d > 0 ? '+' : ''}${kg(d)}`;
}

function Linea({ r, areaM2 }: { r: ResultadoLineaPlan; areaM2?: number }) {
  const p = r.linea.producto;
  const titulo = <span className="calc-name">{p.nombre} {p.esEjemplo && <span className="badge badge-example">EJEMPLO</span>} <small>para la meta de {r.meta ? `${r.meta.elemento} (${r.meta.forma})` : 'una meta no disponible'}</small></span>;
  if (r.estado === 'sin-calculo') {
    return <div className="calc-nutrient">{titulo}
      <div className="missing-box"><strong>{r.motivo === 'forma-distinta' ? 'Formas químicas distintas' : 'No se puede calcular'}:</strong> {r.mensaje}</div>
    </div>;
  }
  const { meta } = r;
  // La forma de la meta aporta exactamente la meta; las demás formas de la etiqueta son aportes acompañantes.
  const acompanantes = r.aportes.filter(a => !mismaForma(a, meta));
  return (
    <div className="calc-nutrient">
      {titulo}
      <code>{formatearExacto(meta.kgHa)} kg/ha de {meta.forma} ÷ ({formatearExacto(r.porcentaje)} % ÷ 100) = <b>{kg(r.productoKgHa)} kg/ha de {p.nombre}</b></code>
      {r.productoKgLote.ok && areaM2 !== undefined
        ? <code>{kg(r.productoKgHa)} kg/ha × {formatearExacto(areaM2)} m² ÷ 10.000 = <b>{kg(r.productoKgLote.valor)} kg de {p.nombre} en el lote</b></code>
        : !r.productoKgLote.ok && <Falta calculo={r.productoKgLote} />}
      {r.bultos.ok && r.productoKgLote.ok
        ? <code>{kg(r.productoKgLote.valor)} kg ÷ {formatearExacto(p.presentacionKg!)} kg por bulto = <b>{formatearResultado(r.bultos.valor, 2)} bultos</b> <em>(número exacto; redondear lo decides tú)</em></code>
        : r.productoKgLote.ok && !r.bultos.ok && <Falta calculo={r.bultos} />}
      {r.precioKgCop.ok
        ? <code>{formatearExacto(p.precioPresentacionCop!)} COP ÷ {formatearExacto(p.presentacionKg!)} kg = <b>{cop(r.precioKgCop.valor)} COP por kg</b> <em>(precio del {fechaLegible(p.fechaPrecio)})</em></code>
        : <Falta calculo={r.precioKgCop} />}
      {r.costoCop.ok && r.productoKgLote.ok && r.precioKgCop.ok &&
        <code>{kg(r.productoKgLote.valor)} kg × {cop(r.precioKgCop.valor)} COP/kg = <b>{cop(r.costoCop.valor)} COP</b></code>}
      {acompanantes.map(a => a.kgHa.ok
        ? <code key={a.forma}>{kg(r.productoKgHa)} kg/ha × {formatearExacto(a.porcentaje)} % ÷ 100 = <b>{kg(a.kgHa.valor)} kg/ha de {a.forma}</b> <em>(aporte acompañante)</em></code>
        : <Falta key={a.forma} calculo={a.kgHa} />)}
    </div>
  );
}

export function PlanDetalle({ plan, analisis, onEditar, onEliminar, onCambiarEstado, onCopiar, origen }: Props) {
  const calculo = calcularPlan(plan);
  const area = plan.areaM2AlCrear;
  const referencia = plan.analisisReferenciaId ? analisis.find(a => a.id === plan.analisisReferenciaId) : undefined;
  const creacion = plan.historial[0];
  const sinProducto = plan.metas.filter(m => !plan.lineas.some(l => l.metaId === m.id));
  const editable = plan.id && plan.estado === 'propuesta' && plan.problemas.length === 0;

  return (
    <article className="soil-detail" aria-labelledby={`titulo-plan-${plan.id}`}>
      <div className="soil-detail-head">
        <div>
          <div className="section-kicker">PLAN DE FERTILIZACIÓN</div>
          <h3 id={`titulo-plan-${plan.id}`}>{plan.nombre || 'Plan sin nombre'}</h3>
          <span className="card-badges"><EstadoPlanBadge estado={plan.estado} />{plan.problemas.length > 0 && <span className="badge badge-error">Datos por corregir</span>}</span>
        </div>
        {plan.id && <div className="soil-actions">
          {editable && <button className="btn btn-outline btn-small" onClick={onEditar}>Editar</button>}
          {plan.estado !== 'aprobado' && <button className="btn btn-danger btn-small" onClick={onEliminar}>Eliminar</button>}
        </div>}
      </div>

      {plan.problemas.length > 0 && <div className="error-box" role="alert">
        <strong>Hay datos guardados que deben corregirse.</strong>
        <ul>{plan.problemas.map(p => <li key={p.campo}>{p.etiqueta}: {p.detalle} Valor guardado: <code>{p.valorOriginal}</code></li>)}</ul>
        <p>Las metas y productos dañados no se muestran ni se calculan. Este plan solo se puede consultar o eliminar; para seguir, crea una propuesta nueva.</p>
      </div>}

      {plan.camposAdicionales.length > 0 && <div className="trace-box">
        <strong>Datos de otra versión conservados</strong>
        <p>Este registro tiene campos que esta versión no muestra ni edita ({plan.camposAdicionales.join(', ')}). Se conservan intactos al guardar cambios.</p>
      </div>}

      {plan.estado && plan.estado !== 'propuesta' && <div className="trace-box">
        <strong>Plan {NOMBRE_ESTADO[plan.estado].toLowerCase()}</strong>
        <p>{plan.problemas.length > 0
          ? 'Tiene datos guardados dañados: solo se puede consultar.'
          : plan.estado === 'revisado'
            ? 'Ya no se edita. Para corregirlo, devuélvelo a propuesta en «Estado del plan», al final.'
            : 'Es de solo lectura y no se puede eliminar: es el registro de lo aprobado. Para cambiarlo, crea una copia como nueva propuesta en «Estado del plan», al final.'}</p>
      </div>}

      <section className="soil-block entered" aria-labelledby={`metas-plan-${plan.id}`}>
        <h4 id={`metas-plan-${plan.id}`}><span className="badge badge-entered">Datos ingresados</span> Metas y su fuente técnica</h4>
        <dl className="data-list">
          <div><dt>Área guardada con el plan</dt><dd>{area !== undefined ? `${formatearExacto(area)} m²` : <span className="missing">Área no válida</span>}</dd></div>
          <div><dt>Análisis de referencia</dt><dd>{!plan.analisisReferenciaId ? 'Ninguno' : referencia ? `Análisis del ${fechaLegible(referencia.fechaAnalisis)}` : <span className="missing">Eliminado o no disponible</span>}</dd></div>
          <div><dt>Propuesta creada</dt><dd>{creacion ? `${fechaDeMarca(creacion.fecha)}${creacion.responsable ? ` · ${creacion.responsable}` : ''}` : sinDato}</dd></div>
          {plan.planOrigenId && <div><dt>Copia de</dt><dd>{origen
            ? <><button type="button" className="link-button" onClick={origen.abrir}>{origen.nombre}</button> <EstadoPlanBadge estado={origen.estado} /></>
            : <span className="missing">Plan eliminado o no disponible</span>}</dd></div>}
        </dl>
        {plan.analisisReferenciaId && <p className="hint">El análisis de referencia es solo contexto: no entra en ningún cálculo y la app no deriva metas de él.</p>}
        {plan.metas.length === 0 ? <p className="muted">Este plan aún no tiene metas.</p>
          : <div className="table-wrap"><table className="soil-table tabla-ancha">
            <caption className="sr-only">Metas nutricionales escritas por el usuario</caption>
            <thead><tr><th scope="col">Nutriente</th><th scope="col">Forma química</th><th scope="col">Meta (kg/ha)</th><th scope="col">Fuente técnica</th><th scope="col">Fecha</th><th scope="col">Origen</th></tr></thead>
            <tbody>{plan.metas.map(m => <tr key={m.id}>
              <td>{m.elemento}</td>
              <td>{m.forma}</td>
              <td>{formatearExacto(m.kgHa)}</td>
              <td>{m.fuente}</td>
              <td>{fechaLegible(m.fechaFuente)}</td>
              <td><OrigenBadge esEjemplo={m.esEjemplo} /></td>
            </tr>)}</tbody>
          </table></div>}
      </section>

      <section className="soil-block calculated" aria-labelledby={`calc-plan-${plan.id}`}>
        <h4 id={`calc-plan-${plan.id}`}><span className="badge badge-calc">Resultados calculados</span> Cantidad y costo de cada producto</h4>
        <p className="calc-intro">Cada cantidad sale de la meta que escribiste y del porcentaje que declara la etiqueta para <strong>la misma forma química</strong>. Los datos del producto son la copia guardada en el plan.</p>
        {calculo.lineas.length === 0 && <p className="muted">Todavía no hay productos elegidos para las metas.</p>}
        {calculo.lineas.length > 0 && <div className="calc-step">
          <strong>Producto por hectárea, en el lote, bultos y costo</strong>
          <p>Producto (kg/ha) = meta ÷ (porcentaje ÷ 100). En el lote = kg/ha × área ÷ 10.000. Bultos = kg ÷ kg por bulto. Costo = kg × precio por kg.</p>
          {calculo.lineas.map(r => <Linea key={r.linea.id} r={r} areaM2={area} />)}
        </div>}
        {sinProducto.length > 0 && <p className="calc-skip">Metas sin producto todavía: {sinProducto.map(m => `${m.elemento} (${m.forma})`).join(', ')}.</p>}

        {calculo.resumen.length > 0 && <div className="calc-step">
          <strong>Resumen por forma química</strong>
          <p>Suma de lo que aportan todos los productos del plan frente a cada meta. Es solo aritmética: la app no ajusta cantidades ni juzga si la diferencia es adecuada.</p>
          <div className="table-wrap"><table className="soil-table">
            <caption className="sr-only">Meta frente a lo aportado por forma química</caption>
            <thead><tr><th scope="col">Forma química</th><th scope="col">Meta (kg/ha)</th><th scope="col">Aportado (kg/ha)</th><th scope="col">Aportado − meta</th></tr></thead>
            <tbody>{calculo.resumen.map(x => <tr key={`${x.elemento}-${x.forma}`}>
              <td>{x.forma} <small>({x.elemento})</small></td>
              <td>{x.metaKgHa !== undefined ? formatearExacto(x.metaKgHa) : '—'}</td>
              <td>{x.aportadoKgHa.ok ? kg(x.aportadoKgHa.valor) : x.aportadoKgHa.mensaje}</td>
              <td>{x.diferenciaKgHa?.ok ? diferencia(x.diferenciaKgHa.valor) : '—'}</td>
            </tr>)}</tbody>
          </table></div>
          {calculo.resumen.some(x => x.incompleto) && <p className="calc-skip">La suma no está completa: hay productos o aportes sin calcular, o datos por corregir.</p>}
        </div>}

        <div className="calc-step">
          <strong>Costo total estimado</strong>
          {calculo.costoTotalCop.ok
            ? <code>Suma del costo de cada producto = <b>{cop(calculo.costoTotalCop.valor)} COP</b></code>
            : <Falta calculo={calculo.costoTotalCop} />}
        </div>
      </section>

      <div className="warning-box" role="note">
        <span className="badge badge-warn">Importante</span>
        <p>Las cantidades se calculan con las metas que escribiste y con lo que declara la etiqueta. <strong>La app no propone metas ni dosis</strong>, no las deduce del análisis de suelo y no convierte entre formas químicas (P y P₂O₅, K y K₂O). Revisa el plan con un profesional antes de aplicarlo. Los valores con “≈” están redondeados para mostrarlos; el cálculo usa el valor completo.</p>
      </div>

      {plan.id && <PlanEstado plan={plan} calculo={calculo} onCambiarEstado={onCambiarEstado} onCopiar={onCopiar} />}
    </article>
  );
}
