import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ErrorPersistencia } from '../lib/repositorioAnalisis';
import { fechaHoraDeMarca } from '../lib/formato';
import type { CalculoPlan } from '../lib/calculos';
import { FALTA_RESPONSABLE, TRANSICIONES_PLAN, motivosCambioEstado } from '../lib/validacionPlan';
import type { EstadoPlan, PlanVerificado } from '../types';

export const NOMBRE_ESTADO: Record<EstadoPlan, string> = { propuesta: 'Propuesta', revisado: 'Revisado', aprobado: 'Aprobado' };

export function EstadoPlanBadge({ estado }: { estado?: EstadoPlan }) {
  if (!estado) return <span className="badge badge-error">Estado por corregir</span>;
  const clase = estado === 'aprobado' ? 'badge-entered' : estado === 'revisado' ? 'badge-calc' : 'badge-warn';
  return <span className={`badge ${clase}`}>{NOMBRE_ESTADO[estado]}</span>;
}

export interface DatosCambio {
  responsable: string;
  nota: string;
}

interface Props {
  plan: PlanVerificado;
  /** Cálculo ya hecho para mostrar el plan; se reutiliza para los motivos de bloqueo. */
  calculo: CalculoPlan;
  onCambiarEstado: (nuevo: EstadoPlan, datos: DatosCambio) => Promise<void>;
  onCopiar: (datos: DatosCambio) => Promise<void>;
}

type Accion = EstadoPlan | 'copia';

const ACCIONES: Record<Accion, { boton: string; explicacion: string; nota: string }> = {
  revisado: {
    boton: 'Marcar como revisado',
    explicacion: 'Confirmas que revisaste las metas, sus fuentes y los productos. El plan deja de poder editarse; luego se puede aprobar o devolver a propuesta.',
    nota: 'Ej. Metas contrastadas con la fuente'
  },
  aprobado: {
    boton: 'Aprobar el plan',
    explicacion: 'El plan queda como registro de lo aprobado: ya no se edita ni se elimina. Para cambiarlo después se crea una copia.',
    nota: 'Ej. Aprobado para la siembra 2026-B'
  },
  propuesta: {
    boton: 'Devolver a propuesta',
    explicacion: 'El plan vuelve a poder editarse. Escribe en la nota qué hay que corregir.',
    nota: 'Ej. Falta confirmar la fuente del K₂O'
  },
  copia: {
    boton: 'Copiar como nueva propuesta',
    explicacion: 'Se crea una propuesta nueva con las mismas metas y productos, y el área actual del lote. Este plan aprobado no cambia.',
    nota: 'Ej. Ajuste por cambio de precio'
  }
};

/** Estado del plan, sus cambios y el historial. Lo aplicado en campo se registra en la fase 4. */
export function PlanEstado({ plan, calculo, onCambiarEstado, onCopiar }: Props) {
  const [accion, setAccion] = useState<Accion | null>(null);
  const [responsable, setResponsable] = useState('');
  const [nota, setNota] = useState('');
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  /** Confirmación junto al panel: el aviso general de la sección puede quedar fuera de la pantalla. */
  const [hecho, setHecho] = useState('');
  const estadoAlAbrir = useRef(plan.estado);

  // Si el plan cambia de estado (p. ej. en otra pestaña) con un formulario abierto, se cierra con aviso.
  useEffect(() => {
    if (accion && !guardando && plan.estado !== estadoAlAbrir.current) {
      setAccion(null);
      setErrores([]);
      setHecho(`El plan cambió de estado mientras tenías el formulario abierto: ahora está «${plan.estado ? NOMBRE_ESTADO[plan.estado] : 'por corregir'}». Revisa las opciones.`);
    }
  }, [plan.estado, accion, guardando]);

  const danado = plan.problemas.length > 0;
  const siguientes = plan.estado && !danado ? TRANSICIONES_PLAN[plan.estado] : [];
  const acciones: Accion[] = plan.estado === 'aprobado' && !danado ? ['copia'] : [...siguientes];

  function elegir(a: Accion | null) {
    estadoAlAbrir.current = plan.estado;
    setAccion(a);
    setErrores([]);
    setNota('');
    if (a) setHecho('');
  }

  async function confirmar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accion) return;
    if (!responsable.trim()) {
      setErrores([FALTA_RESPONSABLE]);
      return;
    }
    setGuardando(true);
    try {
      if (accion === 'copia') await onCopiar({ responsable, nota });
      else {
        await onCambiarEstado(accion, { responsable, nota });
        setHecho(`Listo: el plan quedó en estado «${NOMBRE_ESTADO[accion]}».`);
      }
      elegir(null);
    } catch (error) {
      setErrores(error instanceof ErrorPersistencia
        ? [error.message, ...error.detalles]
        : ['No se pudo guardar el cambio. Verifica que tu navegador permita almacenamiento local y vuelve a intentarlo.']);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="soil-block plan-estado" aria-labelledby={`estado-plan-${plan.id}`}>
      <h4 id={`estado-plan-${plan.id}`}>Estado del plan: <EstadoPlanBadge estado={plan.estado} /></h4>
      <p className="hint">Propuesta: se puede editar. Revisado: alguien revisó metas, fuentes y productos. Aprobado: registro de solo lectura. El nombre lo escribe el usuario: la app no verifica identidades ni certifica aprobaciones técnicas. Lo aplicado en campo se registrará en el seguimiento (fase 4).</p>

      {danado && <p className="calc-skip">Este plan tiene datos guardados dañados: no puede cambiar de estado ni copiarse.</p>}
      {hecho && <div role="status" className="notice notice-ok"><span aria-hidden="true">✓</span>{hecho}<button onClick={() => setHecho('')} aria-label="Cerrar aviso">×</button></div>}

      {!accion && acciones.length > 0 && <div className="estado-acciones">
        {acciones.map(a => {
          const motivos = a === 'copia' ? [] : motivosCambioEstado(plan, a, calculo);
          return <div key={a} className="estado-accion">
            <button type="button" className={a === 'propuesta' ? 'btn btn-outline btn-small' : 'btn btn-primary btn-small'} disabled={motivos.length > 0} onClick={() => elegir(a)}>{ACCIONES[a].boton}</button>
            {motivos.length > 0 && <div className="hint hint-warn"><strong>Aún no se puede:</strong><ul>{motivos.map(m => <li key={m}>{m}</li>)}</ul></div>}
          </div>;
        })}
      </div>}

      {accion && <form className="estado-form" onSubmit={confirmar} noValidate aria-label={ACCIONES[accion].boton}>
        <p><strong>{ACCIONES[accion].boton}.</strong> {ACCIONES[accion].explicacion}</p>
        <div className="fields">
          <label>Nombre de quien registra el cambio <span className="required" aria-hidden="true">*</span>
            <input value={responsable} onChange={e => { setResponsable(e.target.value); setErrores([]); }} maxLength={80} placeholder="Nombre y rol, p. ej. agrónomo" autoFocus />
          </label>
          <label>Nota, opcional
            <input value={nota} onChange={e => setNota(e.target.value)} maxLength={200} placeholder={ACCIONES[accion].nota} />
          </label>
        </div>
        {errores.length > 0 && <div role="alert" className="error">{errores.map((m, i) => <p key={i}>{m}</p>)}</div>}
        <div className="form-actions">
          {/* Mientras se guarda no se puede cancelar: el cambio ya está en curso y no se deshace. */}
          <button type="button" className="btn btn-outline" disabled={guardando} onClick={() => elegir(null)}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : `Confirmar: ${ACCIONES[accion].boton.toLowerCase()}`}</button>
        </div>
      </form>}

      <h5 className="historial-titulo">Historial</h5>
      {plan.historial.length === 0 ? <p className="muted">Sin cambios registrados.</p>
        : <ol className="historial">{plan.historial.map((c, i) => <li key={i}>
          <EstadoPlanBadge estado={c.estado} /> <span>{fechaHoraDeMarca(c.fecha)}</span>
          {c.responsable ? <span> · {c.responsable}</span> : <span className="missing"> · sin nombre registrado</span>}
          {c.nota && <p>{c.nota}</p>}
        </li>)}</ol>}
    </section>
  );
}
