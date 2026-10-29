import { useState, type FormEvent } from 'react';
import { resumenAplicaciones, type AvanceLinea, type CalculoPlan } from '../lib/calculos';
import { fechaLegible, formatearDiferencia, formatearExacto, formatearResultado, textoCostoRegistrado } from '../lib/formato';
import { ErrorPersistencia } from '../lib/repositorioAnalisis';
import { fechaLocalISO, numeroSinAmbiguedad } from '../lib/validacion';
import { fechaAprobacion, resumenErrores } from '../lib/validacionPlan';
import {
  validarAplicacionFormulario,
  type DatosRegistro,
  type EntradaAplicacion,
  type ErroresAplicacion
} from '../lib/validacionSeguimiento';
import type { LineaPlan, PlanVerificado, RegistroAplicacion } from '../types';
import { OrigenBadge } from './ProductoDetalle';

interface Props {
  plan: PlanVerificado;
  calculo: CalculoPlan;
  /** Aplicaciones válidas registradas para este plan. */
  aplicaciones: ReadonlyArray<RegistroAplicacion>;
  /** Registros de aplicación del lote con datos por corregir (no se suman al avance). */
  aplicacionesDanadas: number;
  onGuardar: (datos: DatosRegistro, id?: string) => Promise<void>;
  onEliminar: (aplicacion: RegistroAplicacion) => Promise<void>;
}

const kg = (n: number) => formatearResultado(n, 2);
/** Más de estos sumandos se resume como "suma de N aplicaciones". */
const MAX_SUMANDOS = 6;

function entradaInicial(inicial?: RegistroAplicacion): EntradaAplicacion {
  return {
    fecha: inicial?.fecha ?? fechaLocalISO(),
    cantidadKg: inicial ? numeroSinAmbiguedad(inicial.cantidadKg) : '',
    costoCop: inicial?.costoCop !== undefined ? numeroSinAmbiguedad(inicial.costoCop) : '',
    responsable: inicial?.responsable ?? '',
    nota: inicial?.nota ?? '',
    origen: inicial ? (inicial.esEjemplo ? 'ejemplo' : 'real') : ''
  };
}

function AplicacionForm({ linea, planId, inicial, onGuardar, onCancelar }: {
  linea: LineaPlan;
  planId: string;
  inicial?: RegistroAplicacion;
  onGuardar: (datos: DatosRegistro) => Promise<void>;
  onCancelar: () => void;
}) {
  const [entrada, setEntrada] = useState(() => entradaInicial(inicial));
  const [errores, setErrores] = useState<ErroresAplicacion>({});
  const [errorGeneral, setErrorGeneral] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  /** Al corregir un dato desaparece su error; los demás se conservan hasta volver a guardar. */
  const cambiar = (campo: keyof EntradaAplicacion, valor: string) => {
    setEntrada(e => ({ ...e, [campo]: valor }));
    setErrorGeneral([]);
    setErrores(({ [campo]: _, ...resto }) => resto);
  };

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const resultado = validarAplicacionFormulario(entrada, { planId, lineaId: linea.id, productoNombre: linea.producto.nombre });
    if (!resultado.ok) {
      setErrores(resultado.errores);
      setErrorGeneral(resumenErrores(resultado.errores));
      return;
    }
    setGuardando(true);
    try {
      await onGuardar(resultado.datos);
    } catch (error) {
      setErrorGeneral(error instanceof ErrorPersistencia
        ? [error.message, ...error.detalles]
        : ['No se pudo guardar. Verifica que tu navegador permita almacenamiento local y vuelve a intentarlo.']);
    } finally {
      setGuardando(false);
    }
  }

  const error = (campo: keyof EntradaAplicacion) => errores[campo] && <span className="field-error">{errores[campo]}</span>;
  return (
    <form className="estado-form" onSubmit={enviar} noValidate aria-label={`${inicial ? 'Editar' : 'Registrar'} aplicación de ${linea.producto.nombre}`}>
      <p><strong>{inicial ? 'Editar aplicación' : 'Registrar aplicación'} de {linea.producto.nombre}.</strong> Escribe lo que realmente se aplicó en el lote. Escribe los números sin punto de miles.</p>
      <div className="fields">
        <label>Fecha de aplicación
          <input type="date" value={entrada.fecha} max={fechaLocalISO()} onChange={e => cambiar('fecha', e.target.value)} aria-invalid={!!errores.fecha} />
          {error('fecha')}
        </label>
        <label>Cantidad aplicada (kg de producto)
          <input inputMode="decimal" value={entrada.cantidadKg} onChange={e => cambiar('cantidadKg', e.target.value)} placeholder="Ej. 5 o 3,5" aria-invalid={!!errores.cantidadKg} />
          {error('cantidadKg')}
        </label>
        <label>Costo real (COP), opcional
          <input inputMode="decimal" value={entrada.costoCop} onChange={e => cambiar('costoCop', e.target.value)} placeholder="Lo que costó, ej. 15000" aria-invalid={!!errores.costoCop} />
          {error('costoCop')}
        </label>
        <label>Origen del dato
          <select value={entrada.origen} onChange={e => cambiar('origen', e.target.value)} aria-invalid={!!errores.origen}>
            <option value="">Elige…</option>
            <option value="real">Aplicación real</option>
            <option value="ejemplo">EJEMPLO (ficticia)</option>
          </select>
          {error('origen')}
        </label>
        <label>Responsable, opcional
          <input value={entrada.responsable} onChange={e => cambiar('responsable', e.target.value)} maxLength={80} placeholder="Quién aplicó" />
        </label>
        <label>Nota, opcional
          <input value={entrada.nota} onChange={e => cambiar('nota', e.target.value)} maxLength={200} placeholder="Ej. Primera fracción, a la siembra" />
        </label>
      </div>
      {errorGeneral.length > 0 && <div role="alert" className="error">{errorGeneral.map((m, i) => <p key={i}>{m}</p>)}</div>}
      <div className="form-actions">
        <button type="button" className="btn btn-outline" disabled={guardando} onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar aplicación'}</button>
      </div>
    </form>
  );
}

/** Pasos del avance de una línea, con los números del plan y de las aplicaciones. */
function PasosAvance({ a, areaM2 }: { a: AvanceLinea<RegistroAplicacion>; areaM2?: number }) {
  const propias = a.aplicaciones;
  if (!a.planeadoKg.ok) return <p className="calc-skip">No se puede comparar: {a.planeadoKg.mensaje}</p>;
  const planeado = a.planeadoKg.valor;
  if (!a.aplicadoKg.ok) return <p className="calc-skip">No calculado: {a.aplicadoKg.mensaje}</p>;
  const aplicado = a.aplicadoKg.valor;
  if (propias.length === 0) {
    return <>
      <code>Planeado en el lote: <b>{kg(planeado)} kg</b> <em>(del plan aprobado)</em></code>
      <p className="calc-skip">Aún no hay aplicaciones de este producto.</p>
    </>;
  }
  const sumandos = propias.length > MAX_SUMANDOS
    ? `suma de ${propias.length} aplicaciones`
    : propias.map(p => formatearExacto(p.cantidadKg)).join(' + ');
  const forma = a.meta?.forma ?? '';
  const porcentajeEtiqueta = a.porcentajeEtiqueta;
  return <>
    <code>Planeado en el lote: <b>{kg(planeado)} kg</b> <em>(del plan aprobado)</em></code>
    <code>Aplicado: {sumandos} = <b>{kg(aplicado)} kg</b> <em>({propias.length} {propias.length === 1 ? 'aplicación' : 'aplicaciones'})</em></code>
    {a.diferenciaKg?.ok && (() => {
      const d = formatearDiferencia(a.diferenciaKg.valor);
      return <code>Aplicado − planeado: {kg(aplicado)} − {kg(planeado)} = <b>{d.texto} kg</b> <em>({d.signo < 0 ? 'falta por aplicar' : d.signo > 0 ? 'se aplicó más de lo planeado' : 'igual a lo planeado'})</em></code>;
    })()}
    {a.porcentaje?.ok && <code>Avance: {kg(aplicado)} ÷ {kg(planeado)} × 100 = <b>{formatearResultado(a.porcentaje.valor, 1)} %</b></code>}
    {a.aplicadoFormaKgHa?.ok && areaM2 !== undefined && porcentajeEtiqueta !== undefined &&
      <code>En la forma de la meta: {kg(aplicado)} kg × 10.000 ÷ {formatearExacto(areaM2)} m² × {formatearExacto(porcentajeEtiqueta)} % ÷ 100 = <b>{kg(a.aplicadoFormaKgHa.valor)} kg/ha de {forma}</b> <em>(meta: {a.meta ? formatearExacto(a.meta.kgHa) : '—'} kg/ha)</em></code>}
  </>;
}

/** Lo aplicado frente a un plan aprobado. El plan no cambia; no es una medición de campo. */
export function AplicacionesPlan({ plan, calculo, aplicaciones, aplicacionesDanadas, onGuardar, onEliminar }: Props) {
  const [abierto, setAbierto] = useState<{ lineaId: string; aplicacionId?: string } | null>(null);
  const [error, setError] = useState('');
  /** Mientras se elimina, los botones quedan bloqueados (evita una segunda confirmación por doble toque). */
  const [eliminando, setEliminando] = useState(false);
  // Solo cuentan las aplicaciones de productos de este plan; las demás se avisan y no se suman.
  const { avance, delPlan, ajenas, costo } = resumenAplicaciones(plan, aplicaciones, calculo);
  const costoTexto = textoCostoRegistrado(costo, delPlan.length);
  const aprobado = fechaAprobacion(plan);
  const ocupado = !!abierto || eliminando;

  async function eliminar(a: RegistroAplicacion) {
    setError('');
    setEliminando(true);
    try {
      await onEliminar(a);
    } catch (e) {
      setError(e instanceof ErrorPersistencia ? e.message : 'No se pudo eliminar la aplicación. Vuelve a intentarlo.');
    } finally {
      setEliminando(false);
    }
  }

  return (
    <section className="soil-block calculated" aria-labelledby={`aplicado-${plan.id}`}>
      <h4 id={`aplicado-${plan.id}`}><span className="badge badge-calc">Seguimiento</span> Lo aplicado frente al plan</h4>
      <p className="calc-intro">Registra cada aplicación real de un producto; puede hacerse en varias partes. El plan aprobado no cambia: aquí se compara lo planeado con lo que registras. Es un registro manual, no una medición de campo.</p>
      {aplicacionesDanadas > 0 && <p className="calc-skip">Hay {aplicacionesDanadas} {aplicacionesDanadas === 1 ? 'aplicación' : 'aplicaciones'} de este plan con datos por corregir: no se suman al avance.</p>}
      {ajenas > 0 && <p className="calc-skip">Hay {ajenas} {ajenas === 1 ? 'aplicación' : 'aplicaciones'} de productos que no están en este plan: no se suman al avance ni al costo.</p>}
      {error && <div role="alert" className="error"><p>{error}</p></div>}

      {avance.map(a => {
        const propias = a.aplicaciones;
        const formaAbierta = abierto?.lineaId === a.linea.id;
        return (
          <div className="calc-step" key={a.linea.id}>
            <strong>{a.linea.producto.nombre} {a.linea.producto.esEjemplo && <span className="badge badge-example">EJEMPLO</span>}</strong>
            <p>Para la meta de {a.meta ? `${a.meta.elemento} (${a.meta.forma})` : 'una meta no disponible'}.</p>
            <PasosAvance a={a} areaM2={plan.areaM2AlCrear} />
            {propias.length > 0 && <ul className="aplicaciones-lista" aria-label={`Aplicaciones de ${a.linea.producto.nombre}`}>
              {propias.map(p => <li key={p.id}>
                {abierto?.aplicacionId === p.id
                  ? <AplicacionForm linea={a.linea} planId={plan.id} inicial={p}
                    onGuardar={async datos => { await onGuardar(datos, p.id); setAbierto(null); }} onCancelar={() => setAbierto(null)} />
                  : <>
                    <span><strong>{fechaLegible(p.fecha)}</strong> · {formatearExacto(p.cantidadKg)} kg{p.costoCop !== undefined ? ` · ${formatearExacto(p.costoCop)} COP` : ''}{p.responsable ? ` · ${p.responsable}` : ''} <OrigenBadge esEjemplo={p.esEjemplo} real="Dato real" />{aprobado && p.fecha < aprobado && <span className="badge badge-warn" title={`El plan se aprobó el ${fechaLegible(aprobado)}`}>Antes de la aprobación</span>}</span>
                    {p.nota && <small>{p.nota}</small>}
                    <span className="aplicacion-acciones">
                      <button type="button" className="link-button" disabled={ocupado} onClick={() => setAbierto({ lineaId: a.linea.id, aplicacionId: p.id })}>Editar</button>
                      <button type="button" className="link-button peligro" disabled={ocupado} onClick={() => void eliminar(p)}>Eliminar</button>
                    </span>
                  </>}
              </li>)}
            </ul>}
            {formaAbierta && !abierto?.aplicacionId
              ? <AplicacionForm linea={a.linea} planId={plan.id}
                onGuardar={async datos => { await onGuardar(datos); setAbierto(null); }} onCancelar={() => setAbierto(null)} />
              : <button type="button" className="btn btn-outline btn-small" disabled={ocupado} onClick={() => { setError(''); setAbierto({ lineaId: a.linea.id }); }}>+ Registrar aplicación</button>}
          </div>
        );
      })}

      {delPlan.length > 0 && <div className="calc-step">
        <strong>Costo registrado</strong>
        <p>Suma de los costos reales que escribiste; la app no los calcula.</p>
        {costoTexto ? <code>Total registrado: <b>{costoTexto}</b></code> : <p className="calc-skip">Ninguna aplicación tiene costo registrado.</p>}
      </div>}
    </section>
  );
}
