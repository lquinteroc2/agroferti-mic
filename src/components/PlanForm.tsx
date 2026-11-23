import { useState, type FormEvent } from 'react';
import { CATALOGO_NUTRIENTES, OPCION_OTRO, buscarElemento, mismaForma } from '../lib/catalogoNutrientes';
import { fechaLegible, formatearExacto, formatearNumero } from '../lib/formato';
import { ErrorPersistencia } from '../lib/repositorioAnalisis';
import { fechaLocalISO, numeroSinAmbiguedad } from '../lib/validacion';
import {
  COPIA_GUARDADA,
  copiaDesactualizada,
  resumenErrores,
  validarPlanFormulario,
  type DatosPlan,
  type EntradaMeta,
  type EntradaPlan,
  type ErroresPlan
} from '../lib/validacionPlan';
import type { AnalisisVerificado, CopiaProducto, Lote, MetaNutrimental, PlanVerificado, ProductoFertilizante } from '../types';
import { resumenContenido } from './ProductoDetalle';
import { SugerenciasPlan } from './SugerenciasPlan';
import { departamentoNombrado, type FertilizanteReferencia, type ReglaDosis } from '../lib/referencias';
import { PrecioDane, type DatosPrecio } from './PrecioDane';
import { ProductosSugeridos } from './ProductosSugeridos';
import type { Sugerencia } from '../lib/sugerencias';
import { citaDeSugerencia } from '../lib/sugerencias';
import { NotaObligatorios, Obligatorio, OrigenDato } from './Campo';
import { origenInicial } from '../lib/preferencias';
import { Termino, Terminos } from './Terminos';

export interface OpcionesPlanFormulario {
  actualizarArea: boolean;
  /** Nombre de quien elabora la propuesta (solo al crear). */
  responsable: string;
}

interface Props {
  inicial?: PlanVerificado;
  lote: Lote;
  /** Productos del catálogo sin datos dañados. */
  productos: ReadonlyArray<ProductoFertilizante>;
  analisis: ReadonlyArray<AnalisisVerificado>;
  onGuardar: (datos: DatosPlan, opciones: OpcionesPlanFormulario) => Promise<void>;
  onCancelar: () => void;
  /** Reglas de dosis de referencia (de la nube); undefined si aún no se han descargado. */
  reglas?: ReadonlyArray<ReglaDosis>;
  /** Catálogo de referencia (registro ICA) para sugerir fertilizantes por meta. */
  referencias?: ReadonlyArray<FertilizanteReferencia>;
  /** Agrega un fertilizante de referencia al catálogo del usuario y devuelve su id. */
  onAgregarProducto?: (referencia: FertilizanteReferencia, departamento?: string, sinPrecioEn?: string) => Promise<string>;
  /** Pone el precio a un producto de "Mis productos" (el del DANE o el que escribe el productor). */
  onGuardarPrecio?: (productoId: string, precio: DatosPrecio) => Promise<void>;
  /** Guarda la zona elegida en las sugerencias como zona del lote. */
  onGuardarZona?: (zona: string) => Promise<void>;
}

/**
 * Con rangoSugerido, la meta vino de una sugerencia: se muestra el rango junto al valor y, mientras el
 * usuario no pida ver todo (`abierta`), solo el resumen, la meta en kg/ha y el producto.
 */
type FilaMeta = EntradaMeta & { clave: number; rangoSugerido?: { min: number; max: number }; abierta?: boolean };
type CampoMeta = 'kgHa' | 'fuente' | 'fechaFuente' | 'origen' | 'productoId';

const OTRO = '__otro';
let siguienteClave = 0;
const filaVacia = (): FilaMeta => ({
  clave: siguienteClave++, id: crypto.randomUUID(), elemento: '', forma: '', kgHa: '', fuente: '', fechaFuente: '',
  origen: origenInicial(), elementoLibre: false, formaLibre: false, productoId: ''
});

/** Usa las listas solo si el texto guardado coincide exactamente; si no, conserva el texto original. */
function filaDesdeGuardado(m: MetaNutrimental, plan: PlanVerificado): FilaMeta {
  const linea = plan.lineas.find(l => l.metaId === m.id);
  const el = CATALOGO_NUTRIENTES.find(e => e.nombre === m.elemento);
  return {
    clave: siguienteClave++, id: m.id, elemento: m.elemento, forma: m.forma, kgHa: numeroSinAmbiguedad(m.kgHa),
    fuente: m.fuente, fechaFuente: m.fechaFuente, origen: m.esEjemplo ? 'ejemplo' : 'real',
    elementoLibre: !el, formaLibre: !el || !el.formas.includes(m.forma),
    productoId: linea ? COPIA_GUARDADA : '', lineaGuardada: linea, existente: true
  };
}

/** Lo que declara la etiqueta y si la meta se podrá calcular con ella (misma forma química). */
function avisoProducto(fila: FilaMeta, producto?: Pick<CopiaProducto, 'nombre' | 'contenido'>) {
  if (!producto) return null;
  const declara = `La etiqueta de ${producto.nombre} declara: ${resumenContenido(producto)}.`;
  const forma = fila.forma.trim();
  if (!fila.elemento.trim() || !forma) return <p className="hint">{declara}</p>;
  if (producto.contenido.some(c => mismaForma(c, { elemento: fila.elemento, forma }))) return <p className="hint">{declara}</p>;
  return <p className="hint hint-warn">{declara} <strong>Esta meta no se calculará:</strong> la meta está en {forma} y la etiqueta no declara esa forma. La app no convierte entre formas químicas (P y P₂O₅, K y K₂O).</p>;
}

export function PlanForm({ inicial, lote, productos, analisis, onGuardar, onCancelar, reglas, referencias = [], onAgregarProducto, onGuardarPrecio, onGuardarZona }: Props) {
  const departamentoLote = departamentoNombrado(lote);
  // Si el análisis de referencia se eliminó, la referencia se quita al guardar (con aviso), en lugar de impedir guardar.
  const [referenciaPerdida] = useState(() =>
    !!inicial?.analisisReferenciaId && !analisis.some(a => a.id === inicial.analisisReferenciaId));
  // En una propuesta nueva se elige el análisis más reciente sin datos dañados (la lista viene ordenada).
  const [preseleccionado] = useState(() => (inicial ? '' : analisis.find(a => a.problemas.length === 0)?.id ?? ''));
  const [entrada, setEntrada] = useState<Omit<EntradaPlan, 'metas'> & { metas: FilaMeta[] }>(() => ({
    nombre: inicial?.nombre ?? '',
    analisisReferenciaId: referenciaPerdida ? '' : inicial ? inicial.analisisReferenciaId ?? '' : preseleccionado,
    metas: inicial?.metas.length ? inicial.metas.map(m => filaDesdeGuardado(m, inicial)) : [filaVacia()]
  }));
  const [actualizarArea, setActualizarArea] = useState(false);
  const [responsable, setResponsable] = useState('');
  const [errores, setErrores] = useState<ErroresPlan>({});
  const [errorGeneral, setErrorGeneral] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [quitadas, setQuitadas] = useState(0);

  // Solo se editan planes sin datos dañados: su área guardada siempre es válida.
  const areaHistorica = inicial?.areaM2AlCrear as number;
  const areaUsada = !inicial || actualizarArea ? lote.areaM2 : areaHistorica;

  /** Al corregir un dato desaparece su error; los demás se conservan hasta volver a guardar. */
  function corregido(campo: 'nombre' | 'metas', indice?: number) {
    setErrorGeneral([]);
    setErrores(previos => {
      const { [campo]: _, ...resto } = previos;
      if (campo !== 'metas' || indice === undefined || !previos.metas) return resto;
      const { [indice]: __, ...filas } = previos.metas;
      return Object.keys(filas).length ? { ...resto, metas: filas } : resto;
    });
  }
  const cambiarFila = (indice: number, cambios: Partial<FilaMeta>) => {
    setEntrada(e => ({ ...e, metas: e.metas.map((m, i) => (i === indice ? { ...m, ...cambios } : m)) }));
    corregido('metas', indice);
  };
  const cambiarCampo = (indice: number, campo: CampoMeta, valor: string) => cambiarFila(indice, { [campo]: valor });

  function quitarFila(indice: number) {
    // Quitar una meta guardada es una decisión expresa; se avisa que se eliminará al guardar.
    if (entrada.metas[indice]?.existente) setQuitadas(n => n + 1);
    setEntrada(e => ({ ...e, metas: e.metas.filter((_, i) => i !== indice) }));
    setErrores(({ metas: _, ...resto }) => resto);
  }

  /**
   * Agrega una meta a partir de una sugerencia: nutriente, forma, fuente y, como propuesta, el punto
   * medio del rango (el usuario puede cambiarlo). Si ya hay una meta de esa forma, se actualiza.
   */
  function usarSugerencia(s: Sugerencia) {
    const el = CATALOGO_NUTRIENTES.find(e => e.formas.includes(s.forma));
    const fila: FilaMeta = {
      ...filaVacia(),
      elemento: el?.nombre ?? s.forma, forma: s.forma, elementoLibre: !el, formaLibre: !el,
      fuente: citaDeSugerencia(s),
      fechaFuente: s.regla.fuente.anio ? String(s.regla.fuente.anio) + '-01-01' : '',
      // Como cualquier registro nuevo: real, o EJEMPLO en modo práctica.
      origen: origenInicial(),
      kgHa: numeroSinAmbiguedad((s.minKgHa + s.maxKgHa) / 2),
      rangoSugerido: { min: s.minKgHa, max: s.maxKgHa }
    };
    setEntrada(e => {
      const misma = e.metas.findIndex(m => m.forma === s.forma && m.elemento === fila.elemento);
      if (misma >= 0) {
        // Se conserva el origen que ya tenía la meta (el usuario pudo marcarla como EJEMPLO).
        const { clave: _, productoId: __, origen: ___, ...datos } = fila;
        return { ...e, metas: e.metas.map((m, i) => (i === misma ? { ...m, ...datos, origen: m.origen || fila.origen } : m)) };
      }
      // Una primera meta nueva y vacía se reemplaza en lugar de dejarla en blanco.
      const vacia = e.metas.length === 1 && !e.metas[0].existente && !e.metas[0].elemento && !e.metas[0].kgHa;
      return { ...e, metas: vacia ? [fila] : [...e.metas, fila] };
    });
    corregido('metas');
  }

  function elegirElemento(indice: number, valor: string) {
    if (valor === OTRO) cambiarFila(indice, { elemento: '', forma: '', elementoLibre: true, formaLibre: true });
    else cambiarFila(indice, { elemento: valor, forma: '', elementoLibre: false, formaLibre: false });
  }

  function elegirForma(indice: number, valor: string) {
    if (valor === OTRO) cambiarFila(indice, { forma: '', formaLibre: true });
    else cambiarFila(indice, { forma: valor, formaLibre: false });
  }

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorGeneral([]);
    const resultado = validarPlanFormulario(entrada, { productos, areaM2: areaUsada });
    if (!resultado.ok) {
      setErrores(resultado.errores);
      setErrorGeneral(resumenErrores(resultado.errores));
      // Una meta sugerida con error se abre y no se vuelve a plegar al corregirla.
      const conError = resultado.errores.metas ?? {};
      setEntrada(e => ({ ...e, metas: e.metas.map((m, i) => (conError[i] ? { ...m, abierta: true } : m)) }));
      return;
    }
    setErrores({});
    setGuardando(true);
    try {
      await onGuardar(resultado.datos, { actualizarArea, responsable });
    } catch (error) {
      setErrorGeneral(error instanceof ErrorPersistencia
        ? [error.message, ...error.detalles]
        : ['No se pudo guardar. Verifica que tu navegador permita almacenamiento local y vuelve a intentarlo.']);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="form-card" onSubmit={enviar} noValidate aria-labelledby="titulo-form-plan">
      <div className="section-kicker">PLAN DE FERTILIZACIÓN</div>
      <h2 id="titulo-form-plan">{inicial ? 'Editar propuesta de plan' : 'Nueva propuesta de plan'}</h2>
      <p className="muted">La app te <strong>propone las metas</strong> (cuántos kg/ha de cada nutriente) según tu análisis de suelo y las referencias técnicas para papa, y te <strong>sugiere fertilizantes</strong> con registro ICA que las cubren. Con eso calcula la dosis de cada producto (kg/ha y kg del lote), los bultos y el costo. Tú decides qué guardar. <NotaObligatorios /></p>

      <fieldset className="form-group">
        <legend>Plan</legend>
        <div className="fields">
          <label><span className="campo-titulo">Nombre del plan <span className="required" aria-hidden="true">*</span></span>
            <input value={entrada.nombre} onChange={e => { setEntrada(x => ({ ...x, nombre: e.target.value })); corregido('nombre'); }} maxLength={80} placeholder="Ej. Siembra 2026-B" aria-invalid={!!errores.nombre} aria-describedby={errores.nombre ? 'err-nombre-plan' : undefined} />
            {errores.nombre && <span id="err-nombre-plan" className="field-error">{errores.nombre}</span>}
          </label>
          <label>¿Con qué análisis te proponemos las metas?
            <select value={entrada.analisisReferenciaId} onChange={e => setEntrada(x => ({ ...x, analisisReferenciaId: e.target.value }))}>
              <option value="">Ninguno</option>
              {analisis.filter(a => a.problemas.length === 0 || a.id === entrada.analisisReferenciaId).map(a =>
                <option key={a.id} value={a.id}>Análisis del {fechaLegible(a.fechaAnalisis)}{a.laboratorio ? ` · ${a.laboratorio}` : ''}</option>)}
            </select>
            <small>{preseleccionado && entrada.analisisReferenciaId === preseleccionado ? 'Se eligió el análisis más reciente; puedes cambiarlo. ' : ''}Con él, la app busca las metas en las referencias técnicas (abajo). Las cantidades se calculan con las metas que guardes.</small>
            {referenciaPerdida && <span className="field-warning">El análisis que este plan tenía como referencia ya no existe. Al guardar, el plan quedará sin referencia.</span>}
          </label>
          {!inicial && <label>Elaborado por
            <input value={responsable} onChange={e => setResponsable(e.target.value)} maxLength={80} placeholder="Nombre de quien prepara la propuesta" />
          </label>}
        </div>
      </fieldset>

      <SugerenciasPlan cultivo={lote.cultivo} analisis={analisis.find(a => a.id === entrada.analisisReferenciaId)}
        reglas={reglas ?? []} descargadas={reglas !== undefined} zonaLote={lote.zona} onGuardarZona={onGuardarZona}
        onUsar={usarSugerencia} onUsarTodas={s => s.forEach(usarSugerencia)} />

      <fieldset className="form-group">
        <legend>Metas y productos</legend>
        <p className="hint">Cada meta tiene el nutriente, su <Termino id="forma-quimica"><strong>forma química</strong></Termino>, la cantidad en kg/ha y de dónde sale. Para cada una, elige el producto que la cubrirá: la app te muestra los fertilizantes que aportan esa forma. Solo se calcula si la meta y la etiqueta usan la misma forma química (una meta en P no se calcula con una etiqueta en P₂O₅). Puedes guardar una meta sin producto y completarla después; los demás datos de cada meta son obligatorios.</p>
        <Terminos ids={['meta', 'fuente-tecnica', 'formas-distintas', 'copia-guardada', 'agregar-y-usar']} />
        {productos.length === 0 && <p className="hint hint-warn">Tu catálogo no tiene productos disponibles. Puedes guardar las metas ahora y registrar los productos en <strong>Productos</strong>.</p>}
        {entrada.metas.map((m, i) => {
          const el = m.elementoLibre ? undefined : buscarElemento(m.elemento);
          const error = errores.metas?.[i];
          const idError = `err-meta-${m.clave}`;
          // La copia guardada es una opción propia; el mismo producto del catálogo copia sus datos actuales.
          const guardada = m.lineaGuardada?.producto;
          const enCatalogo = guardada && productos.find(p => p.id === guardada.productoId);
          const elegidoDelCatalogo = productos.find(p => p.id === m.productoId);
          const elegido = m.productoId === COPIA_GUARDADA ? guardada : elegidoDelCatalogo;
          // Meta sugerida: tarjeta corta, hasta que el usuario la abra o tenga un error (ver enviar).
          const compacta = !!m.rangoSugerido && !m.abierta && !error;
          // Productos que declaran la forma de la meta primero; los demás no permitirían calcularla.
          const forma = m.elemento.trim() ? m.forma.trim() : '';
          const aportan = forma ? productos.filter(p => p.contenido.some(c => mismaForma(c, { elemento: m.elemento, forma }))) : [];
          const otros = productos.filter(p => !aportan.includes(p));
          const opcion = (p: ProductoFertilizante) => <option key={p.id} value={p.id}>{p.nombre}{p.esEjemplo ? ' (EJEMPLO)' : ''}{p.id === guardada?.productoId ? ' — datos actuales del catálogo' : ''}</option>;
          return (
            <fieldset className="nutrient-row" key={m.clave} aria-describedby={error ? idError : undefined}>
              <legend className="nutrient-legend">Meta {i + 1}</legend>
              <div className="nutrient-fields fields meta-fields">
                {compacta && <div className="meta-compacta full">
                  <p><strong>{m.elemento} ({m.forma})</strong> · {m.fuente.split(' · ')[0]}{m.origen === 'ejemplo' ? ' · EJEMPLO' : ''}</p>
                  <button type="button" className="link-button" onClick={() => cambiarFila(i, { abierta: true })}>Ver o cambiar el nutriente y la fuente</button>
                </div>}
                {!compacta && <>
                <label><Obligatorio>Elemento</Obligatorio>
                  <select value={m.elementoLibre ? OTRO : m.elemento} onChange={e => elegirElemento(i, e.target.value)} aria-required="true" aria-invalid={!!error}>
                    <option value="">Elige…</option>
                    {CATALOGO_NUTRIENTES.map(n => <option key={n.nombre} value={n.nombre}>{n.nombre} ({n.simbolo})</option>)}
                    <option value={OTRO}>{OPCION_OTRO}</option>
                  </select>
                </label>
                {m.elementoLibre && <label><Obligatorio>Nombre del elemento</Obligatorio>
                  <input value={m.elemento} onChange={e => cambiarFila(i, { elemento: e.target.value })} maxLength={40} placeholder="Como aparece en la fuente" aria-required="true" aria-invalid={!!error} />
                </label>}
                {el && <label><Obligatorio>Forma química</Obligatorio>
                  <select value={m.formaLibre ? OTRO : m.forma} onChange={e => elegirForma(i, e.target.value)} aria-required="true" aria-invalid={!!error}>
                    <option value="">Elige…</option>
                    {el.formas.map(f => <option key={f} value={f}>{f}</option>)}
                    <option value={OTRO}>Otra forma / No reconocida</option>
                  </select>
                </label>}
                {(m.elementoLibre || m.formaLibre) && <label><Obligatorio>Forma química (texto de la fuente)</Obligatorio>
                  <input value={m.forma} onChange={e => cambiarFila(i, { forma: e.target.value })} maxLength={20} placeholder="Ej. SO₃" aria-required="true" aria-invalid={!!error} />
                </label>}
                </>}
                <label><Obligatorio>Meta (kg/ha)</Obligatorio>
                  <input inputMode="decimal" value={m.kgHa} onChange={e => cambiarCampo(i, 'kgHa', e.target.value)} aria-required="true" placeholder={m.rangoSugerido ? `Entre ${m.rangoSugerido.min} y ${m.rangoSugerido.max}` : 'Según tu fuente'} aria-invalid={!!error} />
                  {m.rangoSugerido && <small>Propuesta: punto medio del rango de la referencia ({m.rangoSugerido.min} a {m.rangoSugerido.max} kg/ha). Puedes cambiarla.</small>}
                </label>
                {!compacta && <>
                <label><Obligatorio>Fuente técnica</Obligatorio>
                  <input value={m.fuente} onChange={e => cambiarCampo(i, 'fuente', e.target.value)} aria-required="true" maxLength={200} placeholder="Documento, profesional o laboratorio" aria-invalid={!!error} />
                </label>
                <label><Obligatorio>Fecha de la fuente</Obligatorio>
                  <input type="date" aria-required="true" value={m.fechaFuente} max={fechaLocalISO()} onChange={e => cambiarCampo(i, 'fechaFuente', e.target.value)} aria-invalid={!!error} />
                </label>
                <OrigenDato valor={m.origen} onCambiar={o => cambiarCampo(i, 'origen', o)} real="Fuente técnica real" />
                </>}
                <label className="full">Producto para esta meta
                  <select value={m.productoId} onChange={e => cambiarCampo(i, 'productoId', e.target.value)} aria-invalid={!!error}>
                    <option value="">Sin producto todavía</option>
                    {guardada && <option value={COPIA_GUARDADA}>{guardada.nombre}{guardada.esEjemplo ? ' (EJEMPLO)' : ''} — copia guardada en el plan{guardada.fechaPrecio ? `, precio del ${fechaLegible(guardada.fechaPrecio)}` : ''}</option>}
                    {aportan.length > 0 && <optgroup label={`Declaran ${forma}`}>{aportan.map(opcion)}</optgroup>}
                    {forma ? otros.length > 0 && <optgroup label={`No declaran ${forma}: esta meta no se calcularía`}>{otros.map(opcion)}</optgroup> : otros.map(opcion)}
                  </select>
                </label>
              </div>
              <button type="button" className="row-remove" onClick={() => quitarFila(i)}>Quitar meta {i + 1}</button>
              {!m.productoId && m.forma && onAgregarProducto && <ProductosSugeridos forma={m.forma} productos={productos} referencias={referencias}
                lote={lote} onElegir={id => cambiarCampo(i, 'productoId', id)} onAgregar={onAgregarProducto} />}
              <div className="full-row">
                {avisoProducto(m, elegido)}
                {onGuardarPrecio && m.productoId && m.productoId !== COPIA_GUARDADA && elegidoDelCatalogo &&
                  <PrecioDane key={elegidoDelCatalogo.id} producto={elegidoDelCatalogo} referencias={referencias} departamento={departamentoLote} onGuardar={p => onGuardarPrecio(elegidoDelCatalogo.id, p)} />}
                {/* Copia guardada sin precio (al editar o copiar un plan): se le pone precio al producto de
                    Mis productos y la meta pasa a usar sus datos actuales, para que el costo se calcule. */}
                {onGuardarPrecio && m.productoId === COPIA_GUARDADA && guardada && guardada.precioPresentacionCop === undefined && enCatalogo &&
                  <PrecioDane key={enCatalogo.id} producto={enCatalogo} referencias={referencias} departamento={departamentoLote}
                    onGuardar={async p => { await onGuardarPrecio(enCatalogo.id, p); cambiarCampo(i, 'productoId', enCatalogo.id); }} />}
                {m.productoId === COPIA_GUARDADA && guardada && enCatalogo && copiaDesactualizada(guardada, enCatalogo) &&
                  <p className="hint hint-warn">Este producto cambió en el catálogo después de copiarlo al plan. Para usar los datos nuevos, elige “{enCatalogo.nombre} — datos actuales del catálogo”.</p>}
              </div>
              {error && <span id={idError} className="field-error full-row">{error}</span>}
            </fieldset>
          );
        })}
        {quitadas > 0 && <p className="hint hint-warn">Quitaste {quitadas} {quitadas === 1 ? 'meta guardada' : 'metas guardadas'} (con su producto). Se eliminarán al guardar; si cancelas, no cambia nada.</p>}
        <button type="button" className="btn btn-outline btn-small" onClick={() => setEntrada(e => ({ ...e, metas: [...e.metas, filaVacia()] }))}>+ Agregar meta</button>
      </fieldset>

      <fieldset className="form-group">
        <legend>Área para las cantidades del lote</legend>
        {!inicial
          ? <p className="hint">Con este plan se guardará el área actual del lote: <strong>{formatearNumero(lote.areaM2)} m²</strong>. Si después cambias el área del lote, el plan conservará este valor.</p>
          : <>
            <p className="hint">Área guardada con este plan: <strong>{formatearExacto(areaHistorica)} m²</strong>. Se conserva al editar.</p>
            {areaHistorica !== lote.areaM2 && <label className="check">
              <input type="checkbox" checked={actualizarArea} onChange={e => setActualizarArea(e.target.checked)} />
              Usar el área actual del lote ({formatearNumero(lote.areaM2)} m²) para este plan
            </label>}
          </>}
      </fieldset>

      {errorGeneral.length > 0 && <div role="alert" className="error">{errorGeneral.map((m, i) => <p key={i}>{m}</p>)}</div>}
      <div className="form-actions">
        <button className="btn btn-outline" type="button" onClick={onCancelar}>Cancelar</button>
        <button className="btn btn-primary" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar propuesta'}</button>
      </div>
    </form>
  );
}
