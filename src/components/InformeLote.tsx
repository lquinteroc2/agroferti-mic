import { useLiveQuery } from 'dexie-react-hooks';
import { repositorioAnalisis, repositorioPlanes, repositorioSeguimiento } from '../lib/db';
import { areaM2AHa, type Calculo } from '../lib/calculos';
import { fechaHoraDeMarca, fechaLegible, formatearExacto, formatearNumero, formatearResultado, nombreCultivo } from '../lib/formato';
import { armarInforme, type DatosInforme } from '../lib/informe';
import { tareaVencida } from '../lib/validacionSeguimiento';
import type { Lote } from '../types';

type Lectura = { ok: true; informe: DatosInforme } | { ok: false };

const kg = (n: number) => formatearResultado(n, 2);
const sinDato = <span className="missing">No registrado</span>;

function Valor({ c, formato }: { c: Calculo<number>; formato: (n: number) => string }) {
  return c.ok ? <>{formato(c.valor)}</> : <span className="missing">{c.motivo === 'falta-dato' ? 'Sin dato' : 'No calculado'}</span>;
}

function SeccionAnalisis({ d }: { d: DatosInforme }) {
  const a = d.analisis;
  if (!a) return <p>No hay análisis de suelo registrados para este lote.</p>;
  const equivalencia = (i: number) => {
    const n = d.equivalencias?.nutrientes[i];
    return n?.estado === 'calculada' ? `${kg(n.kgHa)} kg/ha*` : '—';
  };
  return <>
    {d.totalAnalisis > 1 && <p className="informe-nota">Se muestra el más reciente de {d.totalAnalisis} análisis.</p>}
    {a.problemas.length > 0 && <p className="informe-nota">Este análisis tiene datos por corregir en la app; algunos valores pueden faltar.</p>}
    <dl className="data-list">
      <div><dt>Fecha</dt><dd>{a.fechaAnalisis ? fechaLegible(a.fechaAnalisis) : sinDato}</dd></div>
      <div><dt>Laboratorio</dt><dd>{a.laboratorio || sinDato}</dd></div>
      <div><dt>Método</dt><dd>{a.metodoLaboratorio || sinDato}</dd></div>
      <div><dt>Profundidad</dt><dd>{a.profundidadCm !== undefined ? `${formatearExacto(a.profundidadCm)} cm` : sinDato}</dd></div>
      <div><dt>Densidad aparente</dt><dd>{a.densidadGcm3 !== undefined ? `${formatearExacto(a.densidadGcm3)} g/cm³` : sinDato}</dd></div>
      <div><dt>pH</dt><dd>{a.ph !== undefined ? formatearExacto(a.ph) : sinDato}</dd></div>
    </dl>
    {a.nutrientes.length > 0 && <table className="soil-table">
      <caption className="sr-only">Resultados del laboratorio</caption>
      <thead><tr><th scope="col">Elemento</th><th scope="col">Forma química</th><th scope="col">Valor del laboratorio</th><th scope="col">Equivalencia</th></tr></thead>
      <tbody>{a.nutrientes.map((n, i) => <tr key={i}>
        <td>{n.elemento || '—'}</td>
        <td>{n.forma || '—'}</td>
        <td>{n.valor !== undefined ? `${formatearExacto(n.valor)} ${n.unidad ?? ''}` : 'Por corregir'}</td>
        <td>{equivalencia(i)}</td>
      </tr>)}</tbody>
    </table>}
    <p className="informe-nota">* Equivalencia del valor del laboratorio en la capa muestreada. No es una dosis ni lo que la planta puede aprovechar.</p>
  </>;
}

function SeccionRecomendacion({ d }: { d: DatosInforme }) {
  const r = d.recomendacion;
  if (!r) {
    return <p><strong>Este lote no tiene un plan de fertilización aprobado</strong>, así que el informe no incluye recomendación. Para incluirla, apruebe un plan en la ficha del lote.</p>;
  }
  const area = r.plan.areaM2AlCrear;
  return <>
    <p className="informe-destacado">
      Según el plan <strong>«{r.plan.nombre}»</strong>, aprobado {r.aprobadoEl ? `el ${fechaLegible(r.aprobadoEl)}` : ''}{r.aprobadoPor ? ` por ${r.aprobadoPor}` : ''}, se recomienda aplicar en este lote{area !== undefined ? ` (${formatearExacto(area)} m²)` : ''}:
    </p>
    <table className="soil-table informe-tabla-recomendacion">
      <caption className="sr-only">Fertilizantes y dosis recomendados</caption>
      <thead><tr><th scope="col">Fertilizante</th><th scope="col">Para</th><th scope="col">Dosis por hectárea</th><th scope="col">Para su lote</th><th scope="col">Bultos</th><th scope="col">Costo estimado</th></tr></thead>
      <tbody>{r.filas.map((f, i) => <tr key={i}>
        <td><strong>{f.producto}</strong>{f.esEjemplo && <> <span className="badge badge-example">EJEMPLO</span></>}</td>
        <td>{f.para}</td>
        {f.sinCalculo
          ? <td colSpan={4}>No se pudo calcular: {f.sinCalculo}</td>
          : <>
            <td>{f.dosisKgHa !== undefined ? `${kg(f.dosisKgHa)} kg/ha` : '—'}</td>
            <td><Valor c={f.kgLote} formato={n => `${kg(n)} kg`} /></td>
            <td>{f.presentacionKg !== undefined ? <><Valor c={f.bultos} formato={n => formatearResultado(n, 2)} /> de {formatearExacto(f.presentacionKg)} kg</> : '—'}</td>
            <td><Valor c={f.costoCop} formato={n => `${formatearResultado(n, 0)} COP`} /></td>
          </>}
      </tr>)}</tbody>
    </table>
    <p>
      <strong>Costo total estimado:</strong>{' '}
      {r.calculo.costoTotalCop.ok ? `${formatearResultado(r.calculo.costoTotalCop.valor, 0)} COP` : `no se calcula (${r.calculo.costoTotalCop.mensaje.replace(/\.$/, '').toLowerCase()}).`}
    </p>
    <p><strong>De dónde salen las metas:</strong> {r.fuentes.map(f => `${f.fuente} (${fechaLegible(f.fecha)})`).join('; ')}.</p>
    {d.planesAprobados > 1 && <p className="informe-nota">Hay {d.planesAprobados} planes aprobados para este lote; este informe usa el aprobado más recientemente.</p>}
    <h3>Nutrientes que aporta el plan</h3>
    <table className="soil-table">
      <caption className="sr-only">Meta frente a lo que aportan los productos</caption>
      <thead><tr><th scope="col">Nutriente</th><th scope="col">Meta (kg/ha)</th><th scope="col">Aportan los productos (kg/ha)</th></tr></thead>
      <tbody>{r.calculo.resumen.map(x => <tr key={`${x.elemento}-${x.forma}`}>
        <td>{x.elemento} ({x.forma})</td>
        <td>{x.metaKgHa !== undefined ? formatearExacto(x.metaKgHa) : 'Sin meta (aporte adicional)'}</td>
        <td><Valor c={x.aportadoKgHa} formato={kg} /></td>
      </tr>)}</tbody>
    </table>
    <p className="informe-nota">Cómo se calculó: dosis por hectárea = meta ÷ (% del nutriente en la etiqueta ÷ 100). Para su lote = dosis × área ÷ 10.000. Bultos = kg ÷ kg del bulto (número exacto; al comprar se redondea a bultos enteros). Costo = kg × precio por kg.</p>
  </>;
}

function SeccionAvance({ d }: { d: DatosInforme }) {
  const r = d.recomendacion;
  if (!r) return <p>Sin plan aprobado no hay avance que mostrar.</p>;
  const total = r.avance.reduce((s, a) => s + a.aplicaciones.length, 0);
  if (total === 0) return <p>Todavía no se han registrado aplicaciones de este plan.</p>;
  return <>
    <table className="soil-table">
      <caption className="sr-only">Lo aplicado frente a lo recomendado</caption>
      <thead><tr><th scope="col">Fertilizante</th><th scope="col">Recomendado para el lote</th><th scope="col">Aplicado</th><th scope="col">Avance</th></tr></thead>
      <tbody>{r.avance.map(a => <tr key={a.linea.id}>
        <td>{a.linea.producto.nombre}</td>
        <td><Valor c={a.planeadoKg} formato={n => `${kg(n)} kg`} /></td>
        <td><Valor c={a.aplicadoKg} formato={n => `${kg(n)} kg`} /> ({a.aplicaciones.length} {a.aplicaciones.length === 1 ? 'aplicación' : 'aplicaciones'})</td>
        <td>{a.porcentaje?.ok ? `${formatearResultado(a.porcentaje.valor, 1)} %` : '—'}</td>
      </tr>)}</tbody>
    </table>
    {r.costoAplicado.sinCosto === total
      ? <p><strong>Costo de lo aplicado:</strong> no se registraron costos.</p>
      : r.costoAplicado.totalCop.ok && <p><strong>Costo registrado de lo aplicado:</strong> {formatearExacto(r.costoAplicado.totalCop.valor)} COP{r.costoAplicado.sinCosto > 0 ? ` (${r.costoAplicado.sinCosto} ${r.costoAplicado.sinCosto === 1 ? 'aplicación' : 'aplicaciones'} sin costo registrado)` : ''}.</p>}
  </>;
}

function SeccionSeguimiento({ d }: { d: DatosInforme }) {
  const vacio = !d.tareasPendientes.length && !d.tareasHechas.length && !d.observaciones.length;
  if (vacio) return <p>No hay tareas ni observaciones registradas.</p>;
  return <>
    {d.tareasPendientes.length > 0 && <><h3>Tareas pendientes</h3><ul className="informe-lista">{d.tareasPendientes.map(t =>
      <li key={t.id}><strong>{fechaLegible(t.fechaPrevista)}</strong>{tareaVencida(t) ? ' (fecha pasada)' : ''}: {t.descripcion}</li>)}</ul></>}
    {d.tareasHechas.length > 0 && <><h3>Tareas hechas (las más recientes)</h3><ul className="informe-lista">{d.tareasHechas.map(t =>
      <li key={t.id}><strong>{fechaLegible(t.fechaRealizada)}</strong>: {t.descripcion}</li>)}</ul></>}
    {d.observaciones.length > 0 && <><h3>Observaciones (las más recientes)</h3><ul className="informe-lista">{d.observaciones.map(o =>
      <li key={o.id}><strong>{fechaLegible(o.fecha)}</strong>: {o.descripcion}</li>)}</ul></>}
    {d.registrosDanados > 0 && <p className="informe-nota">{d.registrosDanados} {d.registrosDanados === 1 ? 'registro tiene' : 'registros tienen'} datos por corregir y no se muestran.</p>}
  </>;
}

/** Informe del lote para el productor, listo para imprimir o guardar como PDF desde el navegador. */
export function InformeLote({ lote, onVolver }: { lote: Lote; onVolver: () => void }) {
  const lectura = useLiveQuery<Lectura>(async () => {
    try {
      const [analisis, planes, registros] = await Promise.all([
        repositorioAnalisis.listar(lote.id), repositorioPlanes.listar(lote.id), repositorioSeguimiento.listar(lote.id)
      ]);
      return { ok: true, informe: armarInforme({ lote, analisis, planes, registros }) };
    } catch {
      return { ok: false };
    }
  }, [lote]);

  return (
    <div className="informe-pagina">
      <div className="informe-acciones no-imprimir">
        <button className="back" onClick={onVolver}>← Volver al lote</button>
        <button className="btn btn-primary" disabled={!lectura?.ok} onClick={() => window.print()}>Imprimir o guardar como PDF</button>
      </div>
      {lectura === undefined && <div className="empty"><p>Preparando el informe…</p></div>}
      {lectura && !lectura.ok && <div className="notice notice-error" role="alert"><span aria-hidden="true">!</span>No se pudieron leer los datos del lote para el informe. Recarga la página y vuelve a intentarlo.</div>}
      {lectura?.ok && (() => {
        const d = lectura.informe;
        return <article className="informe" aria-labelledby="titulo-informe">
          <header className="informe-cabeza">
            <div className="section-kicker">AGROFERTI MIC · INFORME DEL LOTE PARA EL PRODUCTOR</div>
            <h1 id="titulo-informe">{lote.nombre}</h1>
            <p>Generado el {fechaHoraDeMarca(d.generado)}</p>
          </header>
          {d.hayEjemplo && <p className="informe-aviso-ejemplo"><strong>Contiene datos de EJEMPLO (ficticios).</strong> No los use para decidir sobre un cultivo real.</p>}

          <section>
            <h2>1. El lote</h2>
            <dl className="data-list">
              <div><dt>Cultivo</dt><dd>{nombreCultivo(lote.cultivo)}</dd></div>
              <div><dt>Área</dt><dd>{formatearExacto(lote.areaM2)} m² ({formatearNumero(areaM2AHa(lote.areaM2), 4)} ha)</dd></div>
              <div><dt>Fecha de siembra</dt><dd>{fechaLegible(lote.fechaSiembra)}</dd></div>
              <div><dt>Ubicación</dt><dd>{lote.ubicacion || 'No registrada'}</dd></div>
            </dl>
          </section>

          <section>
            <h2>2. Análisis de suelo</h2>
            <SeccionAnalisis d={d} />
          </section>

          <section className="informe-recomendacion">
            <h2>3. Recomendación de fertilización</h2>
            <SeccionRecomendacion d={d} />
          </section>

          <section>
            <h2>4. Lo aplicado frente a lo recomendado</h2>
            <SeccionAvance d={d} />
          </section>

          <section>
            <h2>5. Seguimiento</h2>
            <SeccionSeguimiento d={d} />
          </section>

          <section className="informe-advertencias">
            <h2>6. Importante</h2>
            <ul>
              <li>La recomendación es la del <strong>plan aprobado</strong>{d.recomendacion?.aprobadoPor ? ` por ${d.recomendacion.aprobadoPor}` : ''}. Sus metas vienen de la fuente técnica indicada; <strong>la app no calcula dosis por su cuenta</strong> ni a partir del análisis de suelo.</li>
              <li>Antes de aplicar, revise la recomendación con su asistente técnico: la dosis adecuada depende del suelo, la variedad, el rendimiento esperado y el clima.</li>
              <li>El nombre de quien aprobó lo escribió el usuario de la app; la app no verifica identidades.</li>
              <li>El seguimiento es un registro manual, no una medición de campo. Los valores con “≈” están redondeados.</li>
              {d.hayEjemplo && <li>Los datos marcados EJEMPLO son ficticios.</li>}
            </ul>
          </section>

          <footer className="informe-pie">Generado con AgroFerti MIC · Prototipo académico · Grupo 1 · SENA</footer>
        </article>;
      })()}
    </div>
  );
}
