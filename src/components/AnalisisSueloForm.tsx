import { useState, type FormEvent } from 'react';
import { CATALOGO_NUTRIENTES, OPCION_OTRO, buscarElemento } from '../lib/catalogoNutrientes';
import { formatearNumero, numeroATexto } from '../lib/formato';
import { ErrorPersistencia } from '../lib/repositorioAnalisis';
import {
  UNIDADES_NUTRIENTE,
  fechaLocalISO,
  filaNutrienteVacia,
  validarAnalisis,
  type DatosAnalisis,
  type EntradaAnalisis,
  type EntradaNutriente,
  type ErroresAnalisis
} from '../lib/validacion';
import type { AnalisisVerificado, NutrienteLeido, ProblemaDato } from '../types';

export interface OpcionesFormulario {
  actualizarArea: boolean;
  /** Campos dañados que el usuario corrigió o decidió descartar de forma expresa. */
  resueltos: string[];
}

interface Props {
  inicial?: AnalisisVerificado;
  /** Área actual del lote, solo para informar; el repositorio decide qué área se guarda. */
  areaActualM2: number;
  onGuardar: (datos: DatosAnalisis, opciones: OpcionesFormulario) => Promise<void>;
  onCancelar: () => void;
}

/** Fila del formulario. `origen` es su posición en el registro guardado (undefined = fila nueva). */
type FilaNutriente = EntradaNutriente & { clave: number; origen?: number; aviso?: string };
type EntradaFormulario = Omit<EntradaAnalisis, 'nutrientes'> & { nutrientes: FilaNutriente[] };
type CampoSimple = Exclude<keyof EntradaAnalisis, 'nutrientes'>;

const OTRO = '__otro';
let siguienteClave = 0;
const filaVacia = (): FilaNutriente => ({ clave: siguienteClave++, elemento: '', forma: '', valor: '', unidad: 'mg/kg', elementoLibre: false, formaLibre: false });
const claveFila = (origen: number) => `nutrientes.${origen}`;

/** Usa las listas solo si el texto guardado coincide exactamente; si no, conserva el texto original. */
function filaDesdeGuardado(n: NutrienteLeido, origen: number): FilaNutriente {
  const el = CATALOGO_NUTRIENTES.find(e => e.nombre === n.elemento);
  const base = {
    clave: siguienteClave++,
    origen,
    existente: true,
    valor: n.valor !== undefined ? numeroATexto(n.valor) : n.valorTexto ?? '',
    unidad: n.unidad ?? '',
    aviso: [n.problema, n.advertencia].filter(Boolean).join(' ') || undefined
  };
  if (!el) return { ...base, elemento: n.elemento, forma: n.forma, elementoLibre: true, formaLibre: true };
  return { ...base, elemento: el.nombre, forma: n.forma, elementoLibre: false, formaLibre: !el.formas.includes(n.forma) };
}

function entradaInicial(inicial?: AnalisisVerificado): EntradaFormulario {
  // Un dato inválido se precarga con su texto original para corregirlo, no se vacía en silencio.
  const original = (campo: string) => inicial?.problemas.find(p => p.campo === campo)?.textoEditable ?? '';
  const numero = (campo: CampoSimple, valor?: number) => (valor !== undefined ? numeroATexto(valor) : original(campo));
  const texto = (campo: CampoSimple, valor?: string) => valor ?? original(campo);
  return {
    fechaAnalisis: inicial ? texto('fechaAnalisis', inicial.fechaAnalisis) : fechaLocalISO(),
    profundidadCm: numero('profundidadCm', inicial?.profundidadCm),
    densidadGcm3: numero('densidadGcm3', inicial?.densidadGcm3),
    ph: numero('ph', inicial?.ph),
    laboratorio: texto('laboratorio', inicial?.laboratorio),
    metodoLaboratorio: texto('metodoLaboratorio', inicial?.metodoLaboratorio),
    nutrientes: inicial?.nutrientes.length ? inicial.nutrientes.map(filaDesdeGuardado) : [filaVacia()],
    observaciones: texto('observaciones', inicial?.observaciones)
  };
}

export function AnalisisSueloForm({ inicial, areaActualM2, onGuardar, onCancelar }: Props) {
  const [entrada, setEntrada] = useState(() => entradaInicial(inicial));
  const [actualizarArea, setActualizarArea] = useState(false);
  const [confirmados, setConfirmados] = useState<ReadonlySet<string>>(new Set());
  const [quitados, setQuitados] = useState<ReadonlySet<string>>(new Set());
  const [errores, setErrores] = useState<ErroresAnalisis>({});
  const [errorGeneral, setErrorGeneral] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  const problemas = inicial?.problemas ?? [];
  const problema = (campo: string) => problemas.find(p => p.campo === campo);
  const problemasFila = new Set(problemas.filter(p => p.campo.startsWith('nutrientes.')).map(p => p.campo));
  const problemasGenerales = problemas.filter(p => !problemasFila.has(p.campo));

  const cambiar = (campo: CampoSimple, valor: string) => setEntrada(e => ({ ...e, [campo]: valor }));
  const cambiarFila = (indice: number, cambios: Partial<FilaNutriente>) =>
    setEntrada(e => ({ ...e, nutrientes: e.nutrientes.map((n, i) => (i === indice ? { ...n, ...cambios } : n)) }));
  const confirmar = (campo: string, si: boolean) => setConfirmados(c => {
    const nuevo = new Set(c);
    if (si) nuevo.add(campo); else nuevo.delete(campo);
    return nuevo;
  });

  function quitarFila(indice: number) {
    const fila = entrada.nutrientes[indice];
    // Quitar una fila guardada es una decisión expresa: queda registrada como resuelta.
    if (fila.origen !== undefined) setQuitados(q => new Set(q).add(claveFila(fila.origen!)));
    setEntrada(e => ({ ...e, nutrientes: e.nutrientes.filter((_, i) => i !== indice) }));
    setErrores(({ nutrientes: _, ...resto }) => resto);
  }

  function elegirElemento(indice: number, valor: string) {
    if (valor === OTRO) cambiarFila(indice, { elemento: '', forma: '', elementoLibre: true, formaLibre: true });
    else cambiarFila(indice, { elemento: valor, forma: '', elementoLibre: false, formaLibre: false });
  }

  function elegirForma(indice: number, valor: string) {
    if (valor === OTRO) cambiarFila(indice, { forma: '', formaLibre: true });
    else cambiarFila(indice, { forma: valor, formaLibre: false });
  }

  const resuelto = (p: ProblemaDato) =>
    confirmados.has(p.campo) || quitados.has(p.campo) || (p.campo === 'areaM2AlRegistro' && actualizarArea);

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorGeneral([]);
    const sinResolver = problemas.filter(p => !resuelto(p));
    if (sinResolver.length) {
      setErrorGeneral(['Antes de guardar, confirma qué hacer con cada dato guardado dañado:', ...sinResolver.map(p => `• ${p.etiqueta}`)]);
      return;
    }
    // Una fila dañada confirmada y dejada vacía se descarta (con consentimiento); el resto se valida.
    const filas = entrada.nutrientes.filter(n =>
      !(n.origen !== undefined && confirmados.has(claveFila(n.origen)) && filaNutrienteVacia(n)));
    const resultado = validarAnalisis({ ...entrada, nutrientes: filas });
    if (!resultado.ok) {
      // Los errores de fila se indexan sobre `filas`; se reubican en la lista visible.
      const porClave: Record<number, string> = {};
      for (const [i, mensaje] of Object.entries(resultado.errores.nutrientes ?? {})) {
        porClave[entrada.nutrientes.indexOf(filas[Number(i)])] = mensaje;
      }
      setErrores({ ...resultado.errores, nutrientes: resultado.errores.nutrientes ? porClave : undefined });
      setErrorGeneral(resultado.errores.general ?? ['Revisa los datos marcados en rojo antes de guardar.']);
      return;
    }
    setErrores({});
    setGuardando(true);
    try {
      await onGuardar(resultado.datos, { actualizarArea, resueltos: [...confirmados, ...quitados] });
    } catch (error) {
      setErrorGeneral(error instanceof ErrorPersistencia
        ? [error.message, ...error.detalles]
        : ['No se pudo guardar. Verifica que tu navegador permita almacenamiento local y vuelve a intentarlo.']);
    } finally {
      setGuardando(false);
    }
  }

  const areaHistorica = inicial?.areaM2AlRegistro;
  const faltaTrazabilidad = !entrada.laboratorio.trim() || !entrada.metodoLaboratorio.trim();
  const errorProps = (id: string, mensaje?: string) =>
    ({ 'aria-invalid': !!mensaje, 'aria-describedby': mensaje ? id : undefined });
  const avisoCampo = (campo: string) => {
    const p = problema(campo);
    return p && <span className="field-warning">Dato guardado no válido: {p.valorOriginal}. {confirmados.has(campo) ? 'Confirmado: se guardará lo que escribas aquí.' : 'Confírmalo en el recuadro de arriba.'}</span>;
  };

  return (
    <form className="form-card" onSubmit={enviar} noValidate aria-labelledby="titulo-form-suelo">
      <div className="section-kicker">ANÁLISIS DE SUELO</div>
      <h2 id="titulo-form-suelo">{inicial ? 'Editar análisis de suelo' : 'Registrar un análisis de suelo'}</h2>
      <p className="muted">Copia los datos tal como aparecen en el informe del laboratorio. Puedes usar coma o punto para los decimales (1,2 o 1.2). Los campos con <span className="required">*</span> son obligatorios.</p>

      {problemasGenerales.length > 0 && <div className="error-box" role="group" aria-labelledby="titulo-danados">
        <strong id="titulo-danados">Este análisis tiene datos guardados que deben corregirse.</strong>
        <p>Nada se borra por sí solo. Para cada dato, corrígelo en su campo y marca la casilla. Si dejas el campo vacío, se descartará el dato guardado. El registro original no cambia hasta que guardes.</p>
        <ul className="damage-list">{problemasGenerales.map(p => <li key={p.campo}>
          <span>{p.etiqueta}: {p.detalle} Valor guardado: <code>{p.valorOriginal}</code></span>
          <label className="check">
            <input type="checkbox" checked={confirmados.has(p.campo)} onChange={e => confirmar(p.campo, e.target.checked)} />
            {p.campo === 'nutrientes' || p.campo === 'nutrientesMgKg'
              ? 'Descartar esta lista guardada (no se puede editar); registraré los resultados de nuevo.'
              : p.campo === 'areaM2AlRegistro'
                ? 'Descartar el área guardada no válida (o marca abajo usar el área actual).'
                : 'Revisé este dato: guardar lo que deje en el campo (vacío = descartar).'}
          </label>
        </li>)}</ul>
      </div>}

      <fieldset className="form-group">
        <legend>Datos de la muestra</legend>
        <div className="fields">
          <label>Fecha del análisis <span className="required" aria-hidden="true">*</span>
            <input type="date" value={entrada.fechaAnalisis} max={fechaLocalISO()} onChange={e => cambiar('fechaAnalisis', e.target.value)} required {...errorProps('err-fecha', errores.fechaAnalisis)} />
            {avisoCampo('fechaAnalisis')}
            {errores.fechaAnalisis && <span id="err-fecha" className="field-error">{errores.fechaAnalisis}</span>}
          </label>
          <label>Profundidad de muestreo (cm) <span className="required" aria-hidden="true">*</span>
            <input inputMode="decimal" value={entrada.profundidadCm} onChange={e => cambiar('profundidadCm', e.target.value)} placeholder="Ej. 20" required {...errorProps('err-prof', errores.profundidadCm)} />
            <small>Hasta dónde se tomó la muestra de suelo.</small>
            {avisoCampo('profundidadCm')}
            {errores.profundidadCm && <span id="err-prof" className="field-error">{errores.profundidadCm}</span>}
          </label>
          <label>Densidad aparente (g/cm³), opcional
            <input inputMode="decimal" value={entrada.densidadGcm3} onChange={e => cambiar('densidadGcm3', e.target.value)} placeholder="Ej. 1,2" {...errorProps('err-dens', errores.densidadGcm3)} />
            <small>Sin este dato no se calculan equivalencias en kg/ha. No se usa ningún valor supuesto.</small>
            {avisoCampo('densidadGcm3')}
            {errores.densidadGcm3 && <span id="err-dens" className="field-error">{errores.densidadGcm3}</span>}
          </label>
          <label>pH del suelo, opcional
            <input inputMode="decimal" value={entrada.ph} onChange={e => cambiar('ph', e.target.value)} placeholder="Entre 0 y 14" {...errorProps('err-ph', errores.ph)} />
            {avisoCampo('ph')}
            {errores.ph && <span id="err-ph" className="field-error">{errores.ph}</span>}
          </label>
          <label>Laboratorio
            <input value={entrada.laboratorio} onChange={e => cambiar('laboratorio', e.target.value)} maxLength={100} placeholder="Nombre del laboratorio" />
            {avisoCampo('laboratorio')}
          </label>
          <label>Método de análisis
            <input value={entrada.metodoLaboratorio} onChange={e => cambiar('metodoLaboratorio', e.target.value)} maxLength={100} placeholder="Como aparece en el informe" />
            {avisoCampo('metodoLaboratorio')}
          </label>
        </div>
        {faltaTrazabilidad && <p className="hint hint-warn">Puedes guardar sin laboratorio o sin método, pero el análisis quedará como <strong>Registro incompleto</strong>. La app no completa estos datos por ti.</p>}
      </fieldset>

      <fieldset className="form-group">
        <legend>Nutrientes reportados</legend>
        <p className="hint">Elige el elemento y la <strong>forma química</strong> exactamente como la reporta el laboratorio: P no es lo mismo que P₂O₅, ni K es lo mismo que K₂O, y la app no convierte entre formas. Si tu informe usa otra forma, elige “{OPCION_OTRO}” y escríbela tal cual. Los valores en cmol(+)/kg se guardan sin convertir. Para valores muy pequeños puedes usar notación científica (por ejemplo, 1,5e-3).</p>
        {entrada.nutrientes.map((n, i) => {
          const el = n.elementoLibre ? undefined : buscarElemento(n.elemento);
          const error = errores.nutrientes?.[i];
          const idError = `err-nut-${n.clave}`;
          const idAviso = `aviso-nut-${n.clave}`;
          const danada = n.origen !== undefined && problemasFila.has(claveFila(n.origen));
          const describe = [error ? idError : '', n.aviso ? idAviso : ''].filter(Boolean).join(' ') || undefined;
          return (
            <fieldset className={`nutrient-row${danada ? ' nutrient-row-damaged' : ''}`} key={n.clave} aria-describedby={describe}>
              <legend className="nutrient-legend">Resultado {i + 1}{n.origen !== undefined ? ' (guardado)' : ' (nuevo)'}</legend>
              {n.aviso && <div id={idAviso} className="field-warning">
                <p>Dato guardado por corregir: {n.aviso}</p>
                {danada && <label className="check">
                  <input type="checkbox" checked={confirmados.has(claveFila(n.origen!))} onChange={e => confirmar(claveFila(n.origen!), e.target.checked)} />
                  Revisé este resultado: guardar lo que deje aquí (si queda vacío, se descarta).
                </label>}
              </div>}
              <div className="nutrient-fields fields">
                <label>Elemento
                  <select value={n.elementoLibre ? OTRO : n.elemento} onChange={e => elegirElemento(i, e.target.value)} aria-invalid={!!error}>
                    <option value="">Elige…</option>
                    {CATALOGO_NUTRIENTES.map(c => <option key={c.nombre} value={c.nombre}>{c.nombre} ({c.simbolo})</option>)}
                    <option value={OTRO}>{OPCION_OTRO}</option>
                  </select>
                </label>
                {n.elementoLibre && <label>Nombre del elemento
                  <input value={n.elemento} onChange={e => cambiarFila(i, { elemento: e.target.value })} maxLength={40} placeholder="Como aparece en el informe" aria-invalid={!!error} />
                </label>}
                {el && <label>Forma química
                  <select value={n.formaLibre ? OTRO : n.forma} onChange={e => elegirForma(i, e.target.value)} aria-invalid={!!error}>
                    <option value="">Elige…</option>
                    {el.formas.map(f => <option key={f} value={f}>{f}</option>)}
                    <option value={OTRO}>Otra forma / No reconocida</option>
                  </select>
                </label>}
                {(n.elementoLibre || n.formaLibre) && <label>Forma química (texto del informe)
                  <input value={n.forma} onChange={e => cambiarFila(i, { forma: e.target.value })} maxLength={20} placeholder="Ej. H₂PO₄⁻" aria-invalid={!!error} />
                </label>}
                <label>Valor
                  <input inputMode="decimal" value={n.valor} onChange={e => cambiarFila(i, { valor: e.target.value })} placeholder="Ej. 20" aria-invalid={!!error} />
                </label>
                <label>Unidad
                  <select value={n.unidad} onChange={e => cambiarFila(i, { unidad: e.target.value })} aria-invalid={!!error}>
                    {!n.unidad && <option value="">Elige…</option>}
                    {UNIDADES_NUTRIENTE.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </label>
              </div>
              <button type="button" className="row-remove" onClick={() => quitarFila(i)}>{n.origen !== undefined ? `Quitar el resultado guardado ${i + 1}` : `Quitar resultado ${i + 1}`}</button>
              {error && <span id={idError} className="field-error full-row">{error}</span>}
            </fieldset>
          );
        })}
        {quitados.size > 0 && <p className="hint hint-warn">Quitaste {quitados.size} {quitados.size === 1 ? 'resultado guardado' : 'resultados guardados'}. Se eliminarán al guardar; si cancelas, no cambia nada.</p>}
        <button type="button" className="btn btn-outline btn-small" onClick={() => setEntrada(e => ({ ...e, nutrientes: [...e.nutrientes, filaVacia()] }))}>+ Agregar nutriente</button>
      </fieldset>

      <fieldset className="form-group">
        <legend>Área para la equivalencia del lote</legend>
        {!inicial
          ? <p className="hint">Con este análisis se guardará el área actual del lote: <strong>{formatearNumero(areaActualM2)} m²</strong>. Si después cambias el área del lote, este análisis conservará este valor.</p>
          : <>
            <p className="hint">{areaHistorica !== undefined
              ? <>Área guardada con este análisis: <strong>{formatearNumero(areaHistorica)} m²</strong>. Se conserva al editar.</>
              : problema('areaM2AlRegistro')
                ? <><strong>El área guardada no es válida</strong> ({problema('areaM2AlRegistro')!.valorOriginal}). Usa el área actual o confirma arriba que quieres descartarla.</>
                : <><strong>Área histórica no registrada.</strong> No se usa el área actual automáticamente.</>}</p>
            {areaHistorica !== areaActualM2 && <label className="check">
              <input type="checkbox" checked={actualizarArea} onChange={e => setActualizarArea(e.target.checked)} />
              Usar el área actual del lote ({formatearNumero(areaActualM2)} m²) para este análisis
            </label>}
          </>}
      </fieldset>

      <div className="fields">
        <label className="full">Observaciones del productor, opcional
          <textarea value={entrada.observaciones} onChange={e => cambiar('observaciones', e.target.value)} maxLength={500} rows={3} placeholder="Ej. Muestra tomada después de la cosecha anterior" />
          {avisoCampo('observaciones')}
        </label>
      </div>

      {errorGeneral.length > 0 && <div role="alert" className="error">{errorGeneral.map((m, i) => <p key={i}>{m}</p>)}</div>}
      <div className="form-actions">
        <button className="btn btn-outline" type="button" onClick={onCancelar}>Cancelar</button>
        <button className="btn btn-primary" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar análisis'}</button>
      </div>
    </form>
  );
}
