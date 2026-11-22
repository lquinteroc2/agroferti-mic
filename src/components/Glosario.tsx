import { useMemo, useState } from 'react';
import { buscarEnGlosario, CATEGORIAS_GLOSARIO, GLOSARIO, type CategoriaGlosario, type TerminoGlosario } from '../lib/glosario';

function Definicion({ t }: { t: TerminoGlosario }) {
  return (
    <div className="glosario-termino" id={`termino-${t.id}`}>
      <dt>{t.termino}</dt>
      <dd>
        {t.definicion}
        {t.ejemplo && <span className="termino-ejemplo">Por ejemplo: {t.ejemplo}</span>}
        {t.donde && <small className="glosario-donde">Dónde aparece: {t.donde}</small>}
      </dd>
    </div>
  );
}

/** Glosario completo para el productor, con buscador y filtro por tema. */
export function Glosario({ onVolver }: { onVolver: () => void }) {
  const [texto, setTexto] = useState('');
  const [categoria, setCategoria] = useState<CategoriaGlosario | ''>('');
  const resultado = useMemo(() => buscarEnGlosario(texto, categoria || undefined), [texto, categoria]);
  const buscando = texto.trim().length > 0;

  return (
    <div className="page-narrow glosario">
      <button className="back" onClick={onVolver}>← Volver a Cómo funciona</button>
      <div className="section-kicker">GUÍA PARA EL PRODUCTOR</div>
      <h1>Glosario</h1>
      <p className="muted">Qué quiere decir cada palabra que aparece en la app, explicada en pocas líneas. Toca un tema o escribe la palabra que buscas.</p>

      <div className="glosario-herramientas">
        <label className="catalogo-buscar">Buscar un término
          <input type="search" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Ej. bulto, P₂O₅, Bray, aprobado…" autoComplete="off" />
        </label>
        <div className="glosario-temas" role="group" aria-label="Filtrar por tema">
          <button type="button" className="termino-chip" aria-pressed={categoria === ''} onClick={() => setCategoria('')}>Todos</button>
          {CATEGORIAS_GLOSARIO.map(c => <button key={c.id} type="button" className="termino-chip" aria-pressed={categoria === c.id} onClick={() => setCategoria(c.id)}>{c.nombre}</button>)}
        </div>
        <p className="hint" role="status">{resultado.length === 0
          ? `No hay términos con esa palabra. Prueba con otra${categoria ? ' o elige "Todos"' : ''}.`
          : `${resultado.length} de ${GLOSARIO.length} términos`}</p>
      </div>

      {/* Al buscar, los resultados van en orden de coincidencia; sin búsqueda, agrupados por tema. */}
      {buscando
        ? resultado.length > 0 && <dl className="glosario-lista">{resultado.map(t => <Definicion key={t.id} t={t} />)}</dl>
        : CATEGORIAS_GLOSARIO.filter(c => resultado.some(t => t.categoria === c.id)).map(c => <section key={c.id} className="glosario-tema" aria-labelledby={`tema-${c.id}`}>
          <h2 id={`tema-${c.id}`}>{c.nombre}</h2>
          <dl className="glosario-lista">{resultado.filter(t => t.categoria === c.id).map(t => <Definicion key={t.id} t={t} />)}</dl>
        </section>)}
    </div>
  );
}
