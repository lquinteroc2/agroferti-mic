import { useState, type FormEvent } from 'react';
import { CATALOGO_NUTRIENTES, OPCION_OTRO, buscarElemento, mismaForma } from '../lib/catalogoNutrientes';
import { fechaLegible, formatearExacto, formatearNumero } from '../lib/formato';
import { ErrorPersistencia } from '../lib/repositorioAnalisis';
import { fechaLocalISO, numeroSinAmbiguedad } from '../lib/validacion';
import { validarPlanFormulario, type DatosPlan, type EntradaMeta, type EntradaPlan, type ErroresPlan } from '../lib/validacionPlan';
import type { AnalisisVerificado, CopiaProducto, Lote, MetaNutrimental, PlanVerificado, ProductoFertilizante } from '../types';
import { resumenContenido } from './ProductoDetalle';

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
}

type FilaMeta = EntradaMeta & { clave: number };
type CampoMeta = 'kgHa' | 'fuente' | 'fechaFuente' | 'origen' | 'productoId';

const OTRO = '__otro';
let siguienteClave = 0;
const filaVacia = (): FilaMeta => ({
  clave: siguienteClave++, id: crypto.randomUUID(), elemento: '', forma: '', kgHa: '', fuente: '', fechaFuente: '',
  origen: '', elementoLibre: false, formaLibre: false, productoId: ''
});

/** Usa las listas solo si el texto guardado coincide exactamente; si no, conserva el texto original. */
function filaDesdeGuardado(m: MetaNutrimental, plan: PlanVerificado): FilaMeta {
  const linea = plan.lineas.find(l => l.metaId === m.id);
  const el = CATALOGO_NUTRIENTES.find(e => e.nombre === m.elemento);
  return {
    clave: siguienteClave++, id: m.id, elemento: m.elemento, forma: m.forma, kgHa: numeroSinAmbiguedad(m.kgHa),
    fuente: m.fuente, fechaFuente: m.fechaFuente, origen: m.esEjemplo ? 'ejemplo' : 'real',
    elementoLibre: !el, formaLibre: !el || !el.formas.includes(m.forma),
    productoId: linea?.producto.productoId ?? '', lineaGuardada: linea, existente: true
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

/** Resumen de errores: los generales y, si hay campos marcados, el aviso de revisarlos. */
function resumenErrores(errores: ErroresPlan): string[] {
  const hayCampos = errores.nombre !== undefined || errores.metas !== undefined;
  return [...(errores.general ?? []), ...(hayCampos ? ['Revisa los datos marcados en rojo antes de guardar.'] : [])];
}

export function PlanForm({ inicial, lote, productos, analisis, onGuardar, onCancelar }: Props) {
  const [entrada, setEntrada] = useState<Omit<EntradaPlan, 'metas'> & { metas: FilaMeta[] }>(() => ({
    nombre: inicial?.nombre ?? '',
    analisisReferenciaId: inicial?.analisisReferenciaId ?? '',
    metas: inicial?.metas.length ? inicial.metas.map(m => filaDesdeGuardado(m, inicial)) : [filaVacia()]
  }));
  const [actualizarArea, setActualizarArea] = useState(false);
  const [responsable, setResponsable] = useState('');
  const [errores, setErrores] = useState<ErroresPlan>({});
  const [errorGeneral, setErrorGeneral] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [quitadas, setQuitadas] = useState(0);

  const areaHistorica = inicial?.areaM2AlCrear;
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
    if (areaUsada === undefined) {
      setErrorGeneral(['El plan no tiene un área válida guardada. Marca "Usar el área actual del lote" para continuar.']);
      return;
    }
    const resultado = validarPlanFormulario(entrada, { productos, areaM2: areaUsada });
    if (!resultado.ok) {
      setErrores(resultado.errores);
      setErrorGeneral(resumenErrores(resultado.errores));
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
      <p className="muted">Escribe cada meta nutricional <strong>tal como la indica tu fuente técnica</strong> (documento, profesional o laboratorio) y elige un producto del catálogo para cubrirla. La app calcula la cantidad y el costo, pero <strong>no propone metas ni dosis</strong> ni las deduce del análisis de suelo.</p>

      <fieldset className="form-group">
        <legend>Plan</legend>
        <div className="fields">
          <label>Nombre del plan <span className="required" aria-hidden="true">*</span>
            <input value={entrada.nombre} onChange={e => { setEntrada(x => ({ ...x, nombre: e.target.value })); corregido('nombre'); }} maxLength={80} placeholder="Ej. Siembra 2026-B" aria-invalid={!!errores.nombre} aria-describedby={errores.nombre ? 'err-nombre-plan' : undefined} />
            {errores.nombre && <span id="err-nombre-plan" className="field-error">{errores.nombre}</span>}
          </label>
          <label>Análisis de suelo de referencia, opcional
            <select value={entrada.analisisReferenciaId} onChange={e => setEntrada(x => ({ ...x, analisisReferenciaId: e.target.value }))}>
              <option value="">Ninguno</option>
              {analisis.filter(a => a.problemas.length === 0 || a.id === entrada.analisisReferenciaId).map(a =>
                <option key={a.id} value={a.id}>Análisis del {fechaLegible(a.fechaAnalisis)}{a.laboratorio ? ` · ${a.laboratorio}` : ''}</option>)}
            </select>
            <small>Solo como contexto: el análisis no entra en ningún cálculo del plan.</small>
          </label>
          {!inicial && <label>Elaborado por, opcional
            <input value={responsable} onChange={e => setResponsable(e.target.value)} maxLength={80} placeholder="Nombre de quien prepara la propuesta" />
          </label>}
        </div>
      </fieldset>

      <fieldset className="form-group">
        <legend>Metas y productos</legend>
        <p className="hint">Para cada meta escribe el nutriente, su <strong>forma química</strong>, la cantidad en kg/ha y de dónde sale (fuente y fecha). Luego elige el producto que la cubrirá. Solo se calcula si la meta y la etiqueta usan la misma forma química: una meta en P no se calcula con una etiqueta en P₂O₅. Puedes guardar una meta sin producto y completarla después.</p>
        {productos.length === 0 && <p className="hint hint-warn">Tu catálogo no tiene productos disponibles. Puedes guardar las metas ahora y registrar los productos en <strong>Productos</strong>.</p>}
        {entrada.metas.map((m, i) => {
          const el = m.elementoLibre ? undefined : buscarElemento(m.elemento);
          const error = errores.metas?.[i];
          const idError = `err-meta-${m.clave}`;
          const guardada = m.lineaGuardada?.producto;
          // La copia guardada se muestra como opción propia: elegirla conserva los datos del producto del plan.
          const opciones = productos.filter(p => p.id !== guardada?.productoId);
          const elegido = guardada && guardada.productoId === m.productoId ? guardada : productos.find(p => p.id === m.productoId);
          return (
            <fieldset className="nutrient-row" key={m.clave} aria-describedby={error ? idError : undefined}>
              <legend className="nutrient-legend">Meta {i + 1}</legend>
              <div className="nutrient-fields fields meta-fields">
                <label>Elemento
                  <select value={m.elementoLibre ? OTRO : m.elemento} onChange={e => elegirElemento(i, e.target.value)} aria-invalid={!!error}>
                    <option value="">Elige…</option>
                    {CATALOGO_NUTRIENTES.map(n => <option key={n.nombre} value={n.nombre}>{n.nombre} ({n.simbolo})</option>)}
                    <option value={OTRO}>{OPCION_OTRO}</option>
                  </select>
                </label>
                {m.elementoLibre && <label>Nombre del elemento
                  <input value={m.elemento} onChange={e => cambiarFila(i, { elemento: e.target.value })} maxLength={40} placeholder="Como aparece en la fuente" aria-invalid={!!error} />
                </label>}
                {el && <label>Forma química
                  <select value={m.formaLibre ? OTRO : m.forma} onChange={e => elegirForma(i, e.target.value)} aria-invalid={!!error}>
                    <option value="">Elige…</option>
                    {el.formas.map(f => <option key={f} value={f}>{f}</option>)}
                    <option value={OTRO}>Otra forma / No reconocida</option>
                  </select>
                </label>}
                {(m.elementoLibre || m.formaLibre) && <label>Forma química (texto de la fuente)
                  <input value={m.forma} onChange={e => cambiarFila(i, { forma: e.target.value })} maxLength={20} placeholder="Ej. SO₃" aria-invalid={!!error} />
                </label>}
                <label>Meta (kg/ha)
                  <input inputMode="decimal" value={m.kgHa} onChange={e => cambiarCampo(i, 'kgHa', e.target.value)} placeholder="Según tu fuente" aria-invalid={!!error} />
                </label>
                <label>Fuente técnica
                  <input value={m.fuente} onChange={e => cambiarCampo(i, 'fuente', e.target.value)} maxLength={200} placeholder="Documento, profesional o laboratorio" aria-invalid={!!error} />
                </label>
                <label>Fecha de la fuente
                  <input type="date" value={m.fechaFuente} max={fechaLocalISO()} onChange={e => cambiarCampo(i, 'fechaFuente', e.target.value)} aria-invalid={!!error} />
                </label>
                <label>Origen de la meta
                  <select value={m.origen} onChange={e => cambiarCampo(i, 'origen', e.target.value)} aria-invalid={!!error}>
                    <option value="">Elige…</option>
                    <option value="real">Fuente técnica real</option>
                    <option value="ejemplo">EJEMPLO (ficticia)</option>
                  </select>
                </label>
                <label className="full">Producto para esta meta
                  <select value={m.productoId} onChange={e => cambiarCampo(i, 'productoId', e.target.value)} aria-invalid={!!error}>
                    <option value="">Sin producto todavía</option>
                    {guardada && <option value={guardada.productoId}>{guardada.nombre} (copia guardada en el plan)</option>}
                    {opciones.map(p => <option key={p.id} value={p.id}>{p.nombre}{p.esEjemplo ? ' (EJEMPLO)' : ''}</option>)}
                  </select>
                </label>
              </div>
              <button type="button" className="row-remove" onClick={() => quitarFila(i)}>Quitar meta {i + 1}</button>
              <div className="full-row">{avisoProducto(m, elegido)}</div>
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
            <p className="hint">{areaHistorica !== undefined
              ? <>Área guardada con este plan: <strong>{formatearExacto(areaHistorica)} m²</strong>. Se conserva al editar.</>
              : <><strong>El área guardada no es válida.</strong> Usa el área actual del lote para poder guardar.</>}</p>
            {areaHistorica !== lote.areaM2 && <label className="check">
              <input type="checkbox" checked={actualizarArea} onChange={e => setActualizarArea(e.target.checked)} />
              Usar el área actual del lote ({formatearNumero(lote.areaM2)} m²) para este plan
            </label>}
          </>}
      </fieldset>

      {errorGeneral.length > 0 && <div role="alert" className="error">{errorGeneral.map(m => <p key={m}>{m}</p>)}</div>}
      <div className="form-actions">
        <button className="btn btn-outline" type="button" onClick={onCancelar}>Cancelar</button>
        <button className="btn btn-primary" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar propuesta'}</button>
      </div>
    </form>
  );
}
