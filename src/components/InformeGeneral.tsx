import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { fechaHoraDeMarca, fechaLegible, formatearExacto, formatearNumero, formatearResultado, nombreCultivo } from '../lib/formato';
import type { DatosInforme } from '../lib/informe';
import type { Lote } from '../types';
import { AdvertenciasInforme, leerInformeLote, SeccionesLote } from './InformeLote';

type Lectura = { ok: true; lotes: Array<{ lote: Lote; informe: DatosInforme; desdeCierre?: string }>; generado: string } | { ok: false };

const costo = (d: DatosInforme): string => {
  const total = d.recomendacion?.calculo.costoTotalCop;
  return total?.ok ? `${formatearResultado(total.valor, 0)} COP` : d.recomendacion ? 'Sin precio' : '—';
};

/**
 * Informe de todos los lotes del productor, listo para imprimir o guardar como PDF: un resumen y,
 * después, la misma información del informe de cada lote (cada lote empieza en una página nueva).
 */
export function InformeGeneral({ usuario, onVolver }: { usuario: string; onVolver: () => void }) {
  const lectura = useLiveQuery<Lectura>(async () => {
    try {
      const lotes = (await db.lotes.toArray()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      return { ok: true, generado: new Date().toISOString(), lotes: await Promise.all(lotes.map(async lote => ({ lote, ...(await leerInformeLote(lote)) }))) };
    } catch {
      return { ok: false };
    }
  }, []);

  return (
    <div className="informe-pagina">
      <div className="informe-acciones no-imprimir">
        <button className="back" onClick={onVolver}>← Volver a mis lotes</button>
        <button className="btn btn-primary" disabled={!lectura?.ok || lectura.lotes.length === 0} onClick={() => window.print()}>Imprimir o guardar como PDF</button>
      </div>
      {lectura === undefined && <div className="empty"><p>Preparando el informe…</p></div>}
      {lectura && !lectura.ok && <div className="notice notice-error" role="alert"><span aria-hidden="true">!</span>No se pudieron leer los datos para el informe. Recarga la página y vuelve a intentarlo.</div>}
      {lectura?.ok && lectura.lotes.length === 0 && <div className="empty"><p>Todavía no tienes lotes registrados.</p></div>}
      {lectura?.ok && lectura.lotes.length > 0 && (() => {
        const hayEjemplo = lectura.lotes.some(l => l.informe.hayEjemplo);
        const areaTotal = lectura.lotes.reduce((t, l) => t + (Number.isFinite(l.lote.areaM2) ? l.lote.areaM2 : 0), 0);
        return <article className="informe" aria-labelledby="titulo-informe-general">
          <header className="informe-cabeza">
            <div className="section-kicker">AGROFERTI MIC · INFORME DE TODOS LOS LOTES</div>
            <h1 id="titulo-informe-general">Mis lotes</h1>
            <p>{usuario} · Generado el {fechaHoraDeMarca(lectura.generado)}</p>
          </header>
          {hayEjemplo && <p className="informe-aviso-ejemplo"><strong>Contiene datos de EJEMPLO (ficticios).</strong> No los uses para decidir sobre un cultivo real.</p>}

          <section>
            <h2>Resumen</h2>
            <p>{lectura.lotes.length} {lectura.lotes.length === 1 ? 'lote' : 'lotes'} · área total {formatearExacto(areaTotal)} m² ({formatearNumero(areaTotal / 10_000, 4)} ha).</p>
            <table className="soil-table informe-resumen">
              <caption className="sr-only">Resumen de los lotes</caption>
              <thead><tr><th scope="col">Lote</th><th scope="col">Cultivo</th><th scope="col">Área (m²)</th><th scope="col">Siembra</th><th scope="col">Último análisis</th><th scope="col">Plan aprobado</th><th scope="col">Costo estimado</th></tr></thead>
              <tbody>{lectura.lotes.map(({ lote, informe: d }) => <tr key={lote.id}>
                <td>{lote.nombre}</td>
                <td>{nombreCultivo(lote.cultivo)}</td>
                <td>{formatearExacto(lote.areaM2)}</td>
                <td>{fechaLegible(lote.fechaSiembra)}</td>
                <td>{d.analisis?.fechaAnalisis ? fechaLegible(d.analisis.fechaAnalisis) : '—'}</td>
                <td>{d.recomendacion ? `«${d.recomendacion.plan.nombre ?? 'Plan'}»` : 'No'}</td>
                <td>{costo(d)}</td>
              </tr>)}</tbody>
            </table>
          </section>

          {lectura.lotes.map(({ lote, informe, desdeCierre }) => <section key={lote.id} className="informe-lote" aria-label={`Lote ${lote.nombre}`}>
            <h2 className="informe-titulo-lote">Lote: {lote.nombre}</h2>
            {informe.hayEjemplo && <p className="informe-nota">Este lote contiene datos de EJEMPLO.</p>}
            <SeccionesLote lote={lote} d={informe} desdeCierre={desdeCierre} />
          </section>)}

          <AdvertenciasInforme hayEjemplo={hayEjemplo} />
          <footer className="informe-pie">Generado con AgroFerti MIC · Prototipo académico · Grupo 1 · SENA</footer>
        </article>;
      })()}
    </div>
  );
}
