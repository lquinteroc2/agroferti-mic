import { useMemo, useState } from 'react';
import { formatearExacto, pesos } from '../lib/formato';
import { filtrarCatalogo, nombreMes, precioParaDepartamento, resumenComposicion, type DetalleRegistro, type FertilizanteReferencia } from '../lib/referencias';
import { Terminos } from './Terminos';

const ETIQUETAS_DETALLE: ReadonlyArray<[keyof DetalleRegistro, string]> = [
  ['clase', 'Tipo de producto'], ['tipo', 'Presentación física'], ['uso', 'Uso registrado'], ['cultivos', 'Cultivos registrados'],
  ['dosisRegistrada', 'Dosis registrada (la de la etiqueta)'], ['aplicacion', 'Época o frecuencia de aplicación'],
  ['fabricante', 'Fabricante'], ['importador', 'Importador'], ['distribuidor', 'Distribuidor'], ['origen', 'País de origen'],
  ['fechaRegistro', 'Fecha del registro'], ['presentaciones', 'Empaques registrados']
];

/** Datos del registro del ICA de un fertilizante, en lista de términos. */
export function DetalleRegistroVista({ detalle }: { detalle?: DetalleRegistro }) {
  if (!detalle) return null;
  const filas = ETIQUETAS_DETALLE.filter(([campo]) => detalle[campo]);
  if (!filas.length) return null;
  return <dl className="detalle-registro">{filas.map(([campo, etiqueta]) => <div key={campo}><dt>{etiqueta}</dt><dd>{detalle[campo]}</dd></div>)}</dl>;
}

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
export function CatalogoFertilizantes({ referencias, registrosPropios, departamentoPreferido, onAgregar }: {
  referencias: ReadonlyArray<FertilizanteReferencia>;
  /** Registros ICA que ya están en "Mis productos". */
  registrosPropios: ReadonlySet<string>;
  /** Departamento más frecuente de los lotes: su precio DANE (o el del más cercano) viene elegido. */
  departamentoPreferido?: string;
  onAgregar: (r: FertilizanteReferencia, departamento?: string, sinPrecioEn?: string) => Promise<void>;
}) {
  const [texto, setTexto] = useState('');
  const [formas, setFormas] = useState<string[]>([]);
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const resultado = useMemo(() => filtrarCatalogo(referencias, { texto, formas }), [referencias, texto, formas]);
  // Mes más reciente de los precios del DANE (cambia cada mes con la actualización automática).
  const mesPrecios = useMemo(() => {
    const ultimo = referencias.reduce((m, r) => r.precios.reduce((n, p) => (p.periodo > n ? p.periodo : n), m), '');
    return ultimo ? nombreMes(ultimo) : '';
  }, [referencias]);
  const cambiarFiltro = (f: () => void) => { f(); setMostrar(POR_PAGINA); };

  if (!referencias.length) return <div className="empty"><p>El catálogo de fertilizantes se descarga de la nube al sincronizar. Conéctate a internet y vuelve a abrir esta pantalla.</p></div>;

  return (
    <div className="catalogo-ica">
      <p className="muted">Los <strong>{formatearExacto(referencias.length)} fertilizantes</strong> con registro <strong>ICA</strong> que tienen precio promedio del <strong>DANE</strong> por departamento{mesPrecios ? ` (${mesPrecios})` : ''}, con la composición garantizada que declara el registro. Así cada plan trae su costo. Los precios se actualizan cada mes y, cuando el DANE publica un fertilizante nuevo, aparece aquí. Busca por nombre, empresa o grado, o filtra por lo que necesitas que aporte.</p>
      <Terminos ids={['composicion-garantizada', 'grado', 'sipsa', 'por-verificar-composicion']} />
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
      </div>
      <p className="hint" role="status">{resultado.length === 0 ? 'No se encontraron fertilizantes con esos filtros.' : `${formatearExacto(resultado.length)} ${resultado.length === 1 ? 'fertilizante' : 'fertilizantes'}`}</p>
      <ul className="catalogo-lista">
        {resultado.slice(0, mostrar).map(r => <FichaReferencia key={r.id} r={r} propio={registrosPropios.has(r.registroIca)} departamentoPreferido={departamentoPreferido} onAgregar={onAgregar} />)}
      </ul>
      {resultado.length > mostrar && <button type="button" className="btn btn-outline" onClick={() => setMostrar(m => m + POR_PAGINA)}>Ver {Math.min(POR_PAGINA, resultado.length - mostrar)} más</button>}
      <p className="hint">Fuente: ICA, Registros de productos fertilizantes de uso agrícola (1 nov. 2026){mesPrecios ? <>, y DANE, SIPSA insumos ({mesPrecios})</> : null}. Revisa siempre la etiqueta del bulto: es la que vale.</p>
    </div>
  );
}

function FichaReferencia({ r, propio, departamentoPreferido, onAgregar }: { r: FertilizanteReferencia; propio: boolean; departamentoPreferido?: string; onAgregar: (r: FertilizanteReferencia, departamento?: string, sinPrecioEn?: string) => Promise<void> }) {
  // Viene elegido el precio del departamento de tus lotes o, si el DANE no lo publica allí, el del más cercano.
  // Mientras la persona no elija, se sigue al departamento de los lotes (puede llegar después de mostrar la lista).
  const eleccion = precioParaDepartamento(r, departamentoPreferido);
  const [elegido, setDepartamento] = useState<string | null>(null);
  const departamento = elegido ?? eleccion?.precio.departamento ?? '';
  const sinPrecioEn = eleccion?.sinPrecioEn && departamento === eleccion.precio.departamento ? eleccion.sinPrecioEn : undefined;
  const [agregando, setAgregando] = useState(false);
  return (
    <li>
      <details className="catalogo-ficha">
        <summary>
          <strong>{r.nombre}</strong>
          <span>{resumenComposicion(r)}</span>
          <small>{r.detalle?.clase ? `${r.detalle.clase} · ` : ''}{r.detalle?.tipo ? `${r.detalle.tipo.toLowerCase()} · ` : ''}{r.empresa} · registro ICA {r.registroIca}{r.presentacionKg ? ` · bulto de ${formatearExacto(r.presentacionKg)} kg` : ''}{r.precios.length ? ' · con precio DANE' : ''}{propio ? ' · ya está en Mis productos' : ''}</small>
        </summary>
        <div className="catalogo-detalle">
          <p><strong>Composición garantizada (registro ICA):</strong> {r.composicionTexto}</p>
          <DetalleRegistroVista detalle={r.detalle} />
          {r.verificacion !== 'ok' && <p className="hint hint-warn">Pendiente de verificar: {r.verificacion.replace(/^por verificar:\s*/, '')}</p>}
          {r.precios.length > 0 && <label>Precio promedio por departamento (DANE)
            <select value={departamento} onChange={e => setDepartamento(e.target.value)}>
              <option value="">Agregar sin precio</option>
              {r.precios.map(p => <option key={p.departamento} value={p.departamento}>{p.departamento}: {pesos(Math.round(p.precioPromedioCop))} ({p.presentacion}, {nombreMes(p.periodo)})</option>)}
            </select>
            {sinPrecioEn && <small>El DANE no lo publica en {sinPrecioEn} (el departamento de tus lotes); viene elegido el del departamento más cercano que sí lo publica.</small>}
          </label>}
          <p className="referencia-fuente">Fuente: {r.fuente}</p>
          <button type="button" className="btn btn-outline btn-small" disabled={agregando} onClick={async () => { setAgregando(true); try { await onAgregar(r, departamento || undefined, sinPrecioEn); } finally { setAgregando(false); } }}>
            {agregando ? 'Agregando…' : propio ? 'Agregar otra copia a Mis productos' : 'Agregar a Mis productos'}
          </button>
        </div>
      </details>
    </li>
  );
}
