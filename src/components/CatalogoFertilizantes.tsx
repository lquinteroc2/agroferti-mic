import { useMemo, useState } from 'react';
import { formatearExacto } from '../lib/formato';
import { filtrarCatalogo, nombreMes, resumenComposicion, type FertilizanteReferencia } from '../lib/referencias';

/** Nutrientes para filtrar "qué aporta" (formas como las declara la etiqueta). */
const FILTROS: ReadonlyArray<[string, string]> = [
  ['N', 'Nitrógeno (N)'], ['P₂O₅', 'Fósforo (P₂O₅)'], ['K₂O', 'Potasio (K₂O)'], ['CaO', 'Calcio (CaO)'],
  ['MgO', 'Magnesio (MgO)'], ['S', 'Azufre (S)'], ['B', 'Boro (B)'], ['Zn', 'Zinc (Zn)']
];
const POR_PAGINA = 30;

/**
 * Todos los fertilizantes del catálogo de referencia (registro ICA vigente y precios DANE), para
 * buscar qué existe en el mercado y de qué está compuesto. Uno se agrega a "Mis productos" con un toque.
 */
export function CatalogoFertilizantes({ referencias, registrosPropios, onAgregar }: {
  referencias: ReadonlyArray<FertilizanteReferencia>;
  /** Registros ICA que ya están en "Mis productos". */
  registrosPropios: ReadonlySet<string>;
  onAgregar: (r: FertilizanteReferencia, departamento?: string) => Promise<void>;
}) {
  const [texto, setTexto] = useState('');
  const [formas, setFormas] = useState<string[]>([]);
  const [soloConPrecio, setSoloConPrecio] = useState(false);
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const resultado = useMemo(() => filtrarCatalogo(referencias, { texto, formas, soloConPrecio }), [referencias, texto, formas, soloConPrecio]);
  const cambiarFiltro = (f: () => void) => { f(); setMostrar(POR_PAGINA); };

  if (!referencias.length) return <div className="empty"><p>El catálogo de fertilizantes se descarga de la nube al sincronizar. Conéctate a internet y vuelve a abrir esta pantalla.</p></div>;

  return (
    <div className="catalogo-ica">
      <p className="muted">Los <strong>{formatearExacto(referencias.length)} fertilizantes</strong> con registro <strong>vigente ante el ICA</strong> para aplicar al suelo, con la composición garantizada que declara el registro. Los más comunes traen además el precio promedio del <strong>DANE</strong> por departamento. Busca por nombre, empresa o grado, o filtra por lo que necesitas que aporte.</p>
      <div className="catalogo-filtros">
        <label className="catalogo-buscar">Buscar
          <input type="search" value={texto} onChange={e => { const v = e.target.value; cambiarFiltro(() => setTexto(v)); }} placeholder="Ej. urea, DAP, 15-15-15, Yara, sulfato…" />
        </label>
        <fieldset className="catalogo-formas">
          <legend>Que aporte</legend>
          {FILTROS.map(([forma, etiqueta]) => <label key={forma} className="chip">
            <input type="checkbox" checked={formas.includes(forma)} onChange={e => { const si = e.target.checked; cambiarFiltro(() => setFormas(fs => si ? [...fs, forma] : fs.filter(x => x !== forma))); }} />
            {etiqueta}
          </label>)}
        </fieldset>
        <label className="check"><input type="checkbox" checked={soloConPrecio} onChange={e => { const si = e.target.checked; cambiarFiltro(() => setSoloConPrecio(si)); }} /> Solo los que tienen precio del DANE</label>
      </div>
      <p className="hint" role="status">{resultado.length === 0 ? 'No se encontraron fertilizantes con esos filtros.' : `${formatearExacto(resultado.length)} ${resultado.length === 1 ? 'fertilizante' : 'fertilizantes'}`}</p>
      <ul className="catalogo-lista">
        {resultado.slice(0, mostrar).map(r => <FichaReferencia key={r.id} r={r} propio={registrosPropios.has(r.registroIca)} onAgregar={onAgregar} />)}
      </ul>
      {resultado.length > mostrar && <button type="button" className="btn btn-outline" onClick={() => setMostrar(m => m + POR_PAGINA)}>Ver {Math.min(POR_PAGINA, resultado.length - mostrar)} más</button>}
      <p className="hint">Fuente: ICA, Registros de productos fertilizantes de uso agrícola (1 nov. 2026), y DANE, SIPSA insumos (oct. 2026). Revisa siempre la etiqueta del bulto: es la que vale.</p>
    </div>
  );
}

function FichaReferencia({ r, propio, onAgregar }: { r: FertilizanteReferencia; propio: boolean; onAgregar: (r: FertilizanteReferencia, departamento?: string) => Promise<void> }) {
  const [departamento, setDepartamento] = useState('');
  const [agregando, setAgregando] = useState(false);
  return (
    <li>
      <details className="catalogo-ficha">
        <summary>
          <strong>{r.nombre}</strong>
          <span>{resumenComposicion(r)}</span>
          <small>{r.empresa} · registro ICA {r.registroIca}{r.presentacionKg ? ` · bulto de ${formatearExacto(r.presentacionKg)} kg` : ''}{r.precios.length ? ' · con precio DANE' : ''}{propio ? ' · ya está en Mis productos' : ''}</small>
        </summary>
        <div className="catalogo-detalle">
          <p><strong>Composición garantizada (registro ICA):</strong> {r.composicionTexto}</p>
          {r.verificacion !== 'ok' && <p className="hint hint-warn">Pendiente de verificar: {r.verificacion.replace(/^por verificar:\s*/, '')}</p>}
          {r.precios.length > 0 && <label>Precio promedio por departamento (DANE)
            <select value={departamento} onChange={e => setDepartamento(e.target.value)}>
              <option value="">Agregar sin precio</option>
              {r.precios.map(p => <option key={p.departamento} value={p.departamento}>{p.departamento}: {formatearExacto(Math.round(p.precioPromedioCop))} COP ({p.presentacion}, {nombreMes(p.periodo)})</option>)}
            </select>
          </label>}
          <p className="referencia-fuente">Fuente: {r.fuente}</p>
          <button type="button" className="btn btn-outline btn-small" disabled={agregando} onClick={async () => { setAgregando(true); try { await onAgregar(r, departamento || undefined); } finally { setAgregando(false); } }}>
            {agregando ? 'Agregando…' : propio ? 'Agregar otra copia a Mis productos' : 'Agregar a Mis productos'}
          </button>
        </div>
      </details>
    </li>
  );
}
