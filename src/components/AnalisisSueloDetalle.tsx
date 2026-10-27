import { equivalenciasAnalisis, type Calculo } from '../lib/calculos';
import { fechaLegible, formatearExacto, formatearResultado } from '../lib/formato';
import { estadoDocumentacion } from '../lib/validacion';
import type { AnalisisVerificado } from '../types';

interface Props {
  analisis: AnalisisVerificado;
  onEditar: () => void;
  onEliminar: () => void;
}

const sinDato = <span className="missing">No registrado</span>;

function SinCalculo({ calculo, explicacion }: { calculo: Extract<Calculo<number>, { ok: false }>; explicacion: string }) {
  const titulo = calculo.motivo === 'falta-dato' ? 'Falta un dato para calcular' : calculo.motivo === 'dato-invalido' ? 'Dato por corregir' : 'No se puede calcular';
  return <div className="missing-box"><strong>{titulo}:</strong> {calculo.mensaje} {explicacion}</div>;
}

export function EstadoBadge({ analisis }: { analisis: AnalisisVerificado }) {
  return estadoDocumentacion(analisis).documentado
    ? <span className="badge badge-entered">Análisis documentado</span>
    : <span className="badge badge-warn">Registro incompleto</span>;
}

export function AnalisisSueloDetalle({ analisis, onEditar, onEliminar }: Props) {
  const eq = equivalenciasAnalisis(analisis);
  const doc = estadoDocumentacion(analisis);
  const enMgKg = eq.nutrientes.filter(n => n.estado !== 'no-convertible');
  const enCmol = eq.nutrientes.filter(n => n.estado === 'no-convertible');
  const area = analisis.areaM2AlRegistro;

  return (
    <article className="soil-detail" aria-labelledby={`titulo-${analisis.id}`}>
      <div className="soil-detail-head">
        <div>
          <div className="section-kicker">ANÁLISIS DEL {fechaLegible(analisis.fechaAnalisis).toUpperCase()}</div>
          <h3 id={`titulo-${analisis.id}`}>{analisis.laboratorio || 'Laboratorio no registrado'}</h3>
          <EstadoBadge analisis={analisis} />
        </div>
        <div className="soil-actions">
          <button className="btn btn-outline btn-small" onClick={onEditar}>Editar</button>
          <button className="btn btn-danger btn-small" onClick={onEliminar}>Eliminar</button>
        </div>
      </div>

      {analisis.problemas.length > 0 && <div className="error-box" role="alert">
        <strong>Hay datos guardados que deben corregirse.</strong>
        <ul>{analisis.problemas.map(p => <li key={p.campo}>{p.etiqueta}: {p.detalle} Valor guardado: <code>{p.valorOriginal}</code></li>)}</ul>
        <p>El resto del análisis se muestra normalmente. Solo se suspenden los cálculos que dependen de estos datos. Pulsa <strong>Editar</strong> para corregirlos.</p>
      </div>}

      {analisis.camposAdicionales.length > 0 && <div className="trace-box">
        <strong>Datos de otra versión conservados</strong>
        <p>Este registro tiene campos que esta versión no muestra ni edita ({analisis.camposAdicionales.join(', ')}). Se conservan intactos al guardar cambios.</p>
      </div>}

      {!doc.documentado && <div className="trace-box">
        <strong>{doc.trazabilidadPendiente ? 'Trazabilidad pendiente' : 'Registro incompleto'}</strong>
        <ul>{doc.pendientes.map(p => <li key={p}>{p}</li>)}</ul>
        <p>Sin el laboratorio y el método no se puede saber cómo se obtuvieron los resultados. Complétalos con el informe original.</p>
      </div>}

      <section className="soil-block entered" aria-labelledby={`datos-${analisis.id}`}>
        <h4 id={`datos-${analisis.id}`}><span className="badge badge-entered">Datos ingresados</span> Lo que registraste del informe</h4>
        <dl className="data-list">
          <div><dt>Fecha</dt><dd>{analisis.fechaAnalisis ? fechaLegible(analisis.fechaAnalisis) : sinDato}</dd></div>
          <div><dt>Profundidad</dt><dd>{analisis.profundidadCm !== undefined ? `${formatearExacto(analisis.profundidadCm)} cm` : sinDato}</dd></div>
          <div><dt>Densidad aparente</dt><dd>{analisis.densidadGcm3 !== undefined ? `${formatearExacto(analisis.densidadGcm3)} g/cm³` : sinDato}</dd></div>
          <div><dt>pH</dt><dd>{analisis.ph !== undefined ? formatearExacto(analisis.ph) : sinDato}</dd></div>
          <div><dt>Método</dt><dd>{analisis.metodoLaboratorio || sinDato}</dd></div>
          <div><dt>Área del lote al registrar</dt><dd>{area !== undefined ? `${formatearExacto(area)} m²` : <span className="missing">Área histórica no registrada</span>}</dd></div>
        </dl>
        {analisis.nutrientes.length === 0 ? <p className="muted">No registraste nutrientes en este análisis.</p>
          : <div className="table-wrap"><table className="soil-table">
            <caption className="sr-only">Resultados reportados por el laboratorio</caption>
            <thead><tr><th scope="col">Elemento</th><th scope="col">Forma química</th><th scope="col">Valor</th><th scope="col">Unidad</th></tr></thead>
            <tbody>{analisis.nutrientes.map((n, i) => <tr key={i} className={n.problema ? 'row-problem' : undefined}>
              <td>{n.elemento || sinDato}</td>
              <td>{n.forma || sinDato}{n.forma && !n.reconocido && <span className="tag tag-unknown" title="Se conserva el texto original sin conversiones">No reconocida</span>}</td>
              <td>{n.valor !== undefined ? formatearExacto(n.valor) : <span className="missing">Por corregir</span>}</td>
              <td>{n.unidad ?? <span className="missing">Por corregir</span>}</td>
            </tr>)}</tbody>
          </table></div>}
        {analisis.observaciones && <p className="observations"><strong>Observaciones:</strong> {analisis.observaciones}</p>}
      </section>

      <section className="soil-block calculated" aria-labelledby={`calc-${analisis.id}`}>
        <h4 id={`calc-${analisis.id}`}><span className="badge badge-calc">Resultados calculados</span> Equivalencia dimensional de la concentración reportada</h4>
        <p className="calc-intro">Estos números cambian la unidad del resultado del laboratorio (de mg/kg a kg/ha). Dependen de la profundidad, de la densidad aparente y de que la muestra represente bien el lote.</p>

        <div className="calc-step">
          <strong>1. Área del lote en hectáreas</strong>
          <p>Se usa el área guardada cuando se registró este análisis. Una hectárea tiene 10.000 m².</p>
          {eq.areaHa.ok && area !== undefined
            ? <code>{formatearExacto(area)} m² ÷ 10.000 = <b>{formatearResultado(eq.areaHa.valor, 4)} ha</b></code>
            : !eq.areaHa.ok && <SinCalculo calculo={eq.areaHa} explicacion="Solo se omite el total del lote; las equivalencias por hectárea sí se muestran. Para usar el área actual, edita el análisis y márcalo explícitamente." />}
        </div>

        <div className="calc-step">
          <strong>2. Masa de suelo en la capa muestreada</strong>
          <p>Cuántos kilos de suelo hay en una hectárea hasta la profundidad de la muestra.</p>
          {eq.masaKgHa.ok
            ? <code>10.000 m²/ha × ({formatearExacto(analisis.profundidadCm!)} cm ÷ 100) m × ({formatearExacto(analisis.densidadGcm3!)} g/cm³ × 1.000) kg/m³ = <b>{formatearResultado(eq.masaKgHa.valor, 0)} kg de suelo/ha</b></code>
            : <SinCalculo calculo={eq.masaKgHa} explicacion="Sin este paso no se calculan equivalencias en kg/ha. La app no usa valores supuestos." />}
        </div>

        {enMgKg.length > 0 && <div className="calc-step">
          <strong>3. Equivalencia de mg/kg a kg/ha y total del lote</strong>
          <p>mg/kg indica miligramos de la forma química reportada por cada kilo de suelo. Se multiplica por la masa de suelo y se divide entre 1.000.000 para pasar de mg a kg. Luego se multiplica por las hectáreas del lote.</p>
          {enMgKg.map((n, i) => <div className="calc-nutrient" key={i}>
            <span className="calc-name">{n.nutriente.elemento || 'Resultado sin elemento'} <small>forma química reportada: {n.nutriente.forma || "—"} (sin conversión entre formas)</small></span>
            {n.estado === 'suspendida' && <p className="calc-skip">No calculado: {n.mensaje}</p>}
            {n.estado === 'calculada' && eq.masaKgHa.ok && <>
              <code>{formatearExacto(n.nutriente.valor!)} mg/kg × {formatearResultado(eq.masaKgHa.valor, 0)} kg/ha ÷ 1.000.000 = <b>{formatearResultado(n.kgHa, 3)} kg de {n.nutriente.forma} por ha</b> <em>(equivalencia dimensional)</em></code>
              {n.kgLote.ok && eq.areaHa.ok
                ? <code>{formatearResultado(n.kgHa, 3)} kg/ha × {formatearResultado(eq.areaHa.valor, 4)} ha = <b>{formatearResultado(n.kgLote.valor, 3)} kg de {n.nutriente.forma} en el lote</b> <em>(equivalencia total; no es una dosis)</em></code>
                : !n.kgLote.ok && <p className="calc-skip">Total del lote no calculado: {n.kgLote.mensaje}</p>}
            </>}
          </div>)}
        </div>}

        {enCmol.length > 0 && <div className="calc-step">
          <strong>Valores en cmol(+)/kg</strong>
          <p>{enCmol.map(n => `${n.nutriente.elemento} (${n.nutriente.forma})`).join(', ')}: se conservan tal como los reportó el laboratorio. Pasarlos a mg/kg depende de la carga y la masa de cada ion, por eso la app no los convierte automáticamente.</p>
        </div>}
      </section>

      <div className="warning-box" role="note">
        <span className="badge badge-warn">Advertencia</span>
        <p>Estos resultados son una <strong>equivalencia dimensional de la concentración reportada</strong>, no una medición del total de nutrientes en el lote. <strong>No son una dosis de fertilización ni un inventario de nutrientes disponibles para la planta.</strong> Cambian si cambian la profundidad o la densidad aparente, y solo valen si la muestra representa bien el lote. Cada resultado conserva la forma química del informe y la app no hace conversiones automáticas entre formas químicas: P no se convierte en P₂O₅ ni K en K₂O. Los valores con “≈” están redondeados para mostrarlos; el cálculo usa el valor completo. Cualquier dosis requiere una meta nutricional validada por un profesional.</p>
      </div>
    </article>
  );
}
