import { useLiveQuery } from 'dexie-react-hooks';
import { repositorioAnalisis, repositorioCiclos, repositorioPlanes, repositorioSeguimiento } from '../lib/db';
import { areaM2AHa, type Calculo } from '../lib/calculos';
import {
  fechaHoraDeMarca,
  fechaLegible,
  formatearExacto,
  formatearNumero,
  formatearResultado,
  nombreCultivo,
  pesosResultado,
  textoCostoRegistrado
} from '../lib/formato';
import { datosCultivoActual } from '../lib/historial';
import { armarInforme, type DatosInforme } from '../lib/informe';
import { tareaVencida } from '../lib/validacionSeguimiento';
import type { Lote } from '../types';

type Lectura = { ok: true; informe: DatosInforme; desdeCierre?: string } | { ok: false };

const kg = (n: number) => formatearResultado(n, 2);
const sinDato = <span className="missing">No registrado</span>;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function Valor({ c, formato }: { c: Calculo<number>; formato: (n: number) => string }) {
  return c.ok ? <>{formato(c.valor)}</> : <span className="missing">{c.motivo === 'falta-dato' ? 'Sin dato' : 'No calculado'}</span>;
}

/** Área en hectáreas sin romper la pantalla si el lote guardado tiene un área inválida. */
function hectareas(areaM2: number): string {
  try {
    return `${formatearNumero(areaM2AHa(areaM2), 4)} ha`;
  } catch {
    return 'área no válida';
  }
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
    <p className="informe-nota">* Equivalencia del valor del laboratorio en la capa arable (la capa muestreada). No es una dosis ni lo que la planta puede aprovechar.</p>
  </>;
}

/** Aviso de planes aprobados con datos dañados: no se usan, y el productor debe saberlo. */
function AvisoAprobadosDanados({ d }: { d: DatosInforme }) {
  const { nombres, masReciente } = d.aprobadosDanados;
  if (!nombres.length) return null;
  const lista = nombres.map(n => `«${n}»`).join(', ');
  return <p className="informe-aviso-ejemplo">
    {masReciente && d.recomendacion
      ? <><strong>Atención:</strong> hay un plan aprobado más reciente con datos por corregir ({lista}). Este informe muestra el anterior; corrige o revisa ese plan en la app.</>
      : <><strong>Atención:</strong> {nombres.length === 1 ? 'un plan aprobado tiene' : 'hay planes aprobados con'} datos por corregir ({lista}) y no se usa en este informe.</>}
  </p>;
}

function SeccionRecomendacion({ d }: { d: DatosInforme }) {
  const r = d.recomendacion;
  if (!r) {
    return <>
      <AvisoAprobadosDanados d={d} />
      <p><strong>Este lote no tiene un plan de fertilización aprobado que se pueda usar</strong>, así que el informe no indica qué aplicar. Para incluirlo, aprueba un plan en la ficha del lote.</p>
    </>;
  }
  const area = r.plan.areaM2AlCrear;
  const aprobado = [r.aprobadoEl && `el ${fechaLegible(r.aprobadoEl)}`, r.aprobadoPor && `por ${r.aprobadoPor}`].filter(Boolean).join(' ');
  const total = r.calculo.costoTotalCop;
  return <>
    <AvisoAprobadosDanados d={d} />
    <p className="informe-destacado">
      Según el plan <strong>«{r.plan.nombre}»</strong>, aprobado{aprobado ? ` ${aprobado}` : ''}, hay que aplicar en este lote{area !== undefined ? ` (${formatearExacto(area)} m²)` : ''}:
    </p>
    <table className="soil-table informe-tabla-recomendacion">
      <caption className="sr-only">Fertilizantes y dosis del plan aprobado</caption>
      <thead><tr><th scope="col">Fertilizante</th><th scope="col">Para</th><th scope="col">Dosis por hectárea</th><th scope="col">Para tu lote</th><th scope="col">Bultos</th><th scope="col">Costo estimado</th></tr></thead>
      <tbody>{r.calculo.lineas.map(l => {
        const p = l.linea.producto;
        return <tr key={l.linea.id}>
          <td><strong>{p.nombre}</strong>{p.esEjemplo && <> <span className="badge badge-example">EJEMPLO</span></>}</td>
          <td>{l.meta ? `${l.meta.elemento} (${l.meta.forma})` : 'Meta no disponible'}</td>
          {l.estado === 'sin-calculo'
            ? <td colSpan={4}>No se pudo calcular: {l.mensaje}</td>
            : <>
              <td>{kg(l.productoKgHa)} kg/ha</td>
              <td><Valor c={l.productoKgLote} formato={n => `${kg(n)} kg`} /></td>
              <td>{p.presentacionKg !== undefined ? <><Valor c={l.bultos} formato={n => formatearResultado(n, 2)} /> de {formatearExacto(p.presentacionKg)} kg</> : '—'}</td>
              <td><Valor c={l.costoCop} formato={n => pesosResultado(n)} /></td>
            </>}
        </tr>;
      })}</tbody>
    </table>
    <p><strong>Costo total estimado:</strong> {total.ok ? pesosResultado(total.valor) : `no se calcula. ${total.mensaje}`}</p>
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
    <p className="informe-nota">Cómo se calculó: dosis por hectárea = meta ÷ (% del nutriente en la etiqueta ÷ 100). Para tu lote = dosis × área ÷ 10.000. Bultos = kg ÷ kg del bulto (número exacto; al comprar se redondea a bultos enteros). Costo = kg × precio por kg.</p>
  </>;
}

function SeccionAvance({ d }: { d: DatosInforme }) {
  const r = d.recomendacion;
  if (!r) return <p>Sin plan aprobado no hay avance que mostrar.</p>;
  const { avance, delPlan, ajenas, costo } = r.aplicado;
  // Lo que no se suma se avisa, para que el productor no crea que falta una aplicación.
  const avisos = <>
    {r.aplicacionesDanadas > 0 && <p className="informe-nota">{plural(r.aplicacionesDanadas, 'aplicación de este plan tiene', 'aplicaciones de este plan tienen')} datos por corregir y no se suman.</p>}
    {ajenas > 0 && <p className="informe-nota">{plural(ajenas, 'aplicación registrada es', 'aplicaciones registradas son')} de productos que no están en este plan y no se suman.</p>}
  </>;
  if (delPlan.length === 0) return <><p>Todavía no se han registrado aplicaciones de este plan.</p>{avisos}</>;
  const costoTexto = textoCostoRegistrado(costo, delPlan.length);
  return <>
    <table className="soil-table">
      <caption className="sr-only">Lo aplicado frente al plan</caption>
      <thead><tr><th scope="col">Fertilizante</th><th scope="col">Plan para el lote</th><th scope="col">Aplicado</th><th scope="col">Avance</th></tr></thead>
      <tbody>{avance.map(a => <tr key={a.linea.id}>
        <td>{a.linea.producto.nombre}</td>
        <td><Valor c={a.planeadoKg} formato={n => `${kg(n)} kg`} /></td>
        <td><Valor c={a.aplicadoKg} formato={n => `${kg(n)} kg`} /> ({plural(a.aplicaciones.length, 'aplicación', 'aplicaciones')})</td>
        <td>{a.porcentaje?.ok ? `${formatearResultado(a.porcentaje.valor, 1)} %` : '—'}</td>
      </tr>)}</tbody>
    </table>
    <p><strong>Costo de lo aplicado:</strong> {costoTexto ? `${costoTexto} (registrado por el usuario).` : 'no se registraron costos.'}</p>
    {avisos}
  </>;
}

function SeccionSeguimiento({ d }: { d: DatosInforme }) {
  const vacio = !d.tareasPendientes.length && !d.tareasHechas.length && !d.observaciones.length;
  return <>
    {vacio && <p>No hay tareas ni observaciones registradas.</p>}
    {d.tareasPendientes.length > 0 && <><h3>Tareas pendientes</h3><ul className="informe-lista">{d.tareasPendientes.map(t =>
      <li key={t.id}><strong>{fechaLegible(t.fechaPrevista)}</strong>{tareaVencida(t) ? ' (fecha pasada)' : ''}: {t.descripcion}</li>)}</ul></>}
    {d.tareasHechas.length > 0 && <><h3>Tareas hechas (las más recientes)</h3><ul className="informe-lista">{d.tareasHechas.map(t =>
      <li key={t.id}><strong>{fechaLegible(t.fechaRealizada)}</strong>: {t.descripcion}</li>)}</ul></>}
    {d.observaciones.length > 0 && <><h3>Observaciones (las más recientes)</h3><ul className="informe-lista">{d.observaciones.map(o =>
      <li key={o.id}><strong>{fechaLegible(o.fecha)}</strong>: {o.descripcion}</li>)}</ul></>}
    {/* Se avisa aunque no haya registros válidos: un registro dañado no debe pasar desapercibido. */}
    {d.registrosDanados > 0 && <p className="informe-nota">{plural(d.registrosDanados, 'registro de seguimiento tiene', 'registros de seguimiento tienen')} datos por corregir y no se muestran.</p>}
  </>;
}

/** Datos del informe de un lote: solo el cultivo actual (los cultivos cerrados quedan en el historial). */
export async function leerInformeLote(lote: Lote): Promise<{ informe: DatosInforme; desdeCierre?: string }> {
  const [ciclos, analisis, planes, registros] = await Promise.all([
    repositorioCiclos.listar(lote.id), repositorioAnalisis.listar(lote.id), repositorioPlanes.listar(lote.id), repositorioSeguimiento.listar(lote.id)
  ]);
  const actual = datosCultivoActual({ ciclos, analisis, planes, registros });
  return { informe: armarInforme({ lote, ...actual }), desdeCierre: actual.desdeCierre };
}

/** Secciones 1 a 5 de un lote. Las usan el informe del lote y el informe de todos los lotes. */
export function SeccionesLote({ lote, d, desdeCierre }: { lote: Lote; d: DatosInforme; desdeCierre?: string }) {
  return <>
    <section>
      <h2>1. El lote</h2>
      <dl className="data-list">
        <div><dt>Cultivo</dt><dd>{nombreCultivo(lote.cultivo)}</dd></div>
        <div><dt>Área</dt><dd>{formatearExacto(lote.areaM2)} m² ({hectareas(lote.areaM2)})</dd></div>
        <div><dt>Fecha de siembra</dt><dd>{fechaLegible(lote.fechaSiembra)}</dd></div>
        <div><dt>Ubicación</dt><dd>{lote.ubicacion || 'No registrada'}</dd></div>
        {lote.departamento && <div><dt>Departamento</dt><dd>{lote.departamento}</dd></div>}
        {lote.zona && <div><dt>Zona (referencias técnicas)</dt><dd>{lote.zona}</dd></div>}
      </dl>
      {desdeCierre && <p className="informe-nota">Este informe muestra solo el cultivo actual: lo registrado después del cierre del cultivo anterior ({fechaLegible(desdeCierre)}). Los cultivos anteriores están en el historial del lote.</p>}
    </section>

    <section>
      <h2>2. Análisis de suelo</h2>
      <SeccionAnalisis d={d} />
    </section>

    <section className="informe-recomendacion">
      <h2>3. Plan aprobado: qué aplicar</h2>
      <SeccionRecomendacion d={d} />
    </section>

    <section>
      <h2>4. Lo aplicado frente al plan</h2>
      <SeccionAvance d={d} />
    </section>

    <section>
      <h2>5. Seguimiento</h2>
      <SeccionSeguimiento d={d} />
    </section>
  </>;
}

/** Advertencias en lenguaje claro al final del informe. */
export function AdvertenciasInforme({ hayEjemplo, aprobadoPor }: { hayEjemplo: boolean; aprobadoPor?: string }) {
  return <section className="informe-advertencias">
    <h2>Importante</h2>
    <ul>
      <li>Lo que hay que aplicar sale del <strong>plan aprobado</strong>{aprobadoPor ? ` por ${aprobadoPor}` : ''}. Sus metas vienen de la fuente técnica indicada en cada una (las propuestas por la app citan su referencia) y el plan fue revisado y aprobado por una persona.</li>
      <li>Antes de aplicar, revisa el plan con tu asistente técnico: la dosis adecuada depende del suelo, la variedad, el rendimiento esperado y el clima.</li>
      <li>El nombre de quien aprobó lo escribió el usuario de la app; la app no verifica identidades.</li>
      <li>El seguimiento es un registro manual, no una medición de campo. Los valores con “≈” están redondeados.</li>
      {hayEjemplo && <li>Los datos marcados EJEMPLO son ficticios.</li>}
    </ul>
  </section>;
}

/** Informe del lote para el productor, listo para imprimir o guardar como PDF desde el navegador. */
export function InformeLote({ lote, onVolver }: { lote: Lote; onVolver: () => void }) {
  const lectura = useLiveQuery<Lectura>(async () => {
    try {
      return { ok: true, ...(await leerInformeLote(lote)) };
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
          {d.hayEjemplo && <p className="informe-aviso-ejemplo"><strong>Contiene datos de EJEMPLO (ficticios).</strong> No los uses para decidir sobre un cultivo real.</p>}
          <SeccionesLote lote={lote} d={d} desdeCierre={lectura.desdeCierre} />
          <AdvertenciasInforme hayEjemplo={d.hayEjemplo} aprobadoPor={d.recomendacion?.aprobadoPor} />
          <footer className="informe-pie">Generado con AgroFerti MIC · Prototipo académico · Grupo 1 · SENA</footer>
        </article>;
      })()}
    </div>
  );
}
