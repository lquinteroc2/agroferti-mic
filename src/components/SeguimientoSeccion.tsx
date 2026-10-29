import { Fragment, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { repositorioPlanes, repositorioSeguimiento } from '../lib/db';
import { fechaLegible, formatearExacto } from '../lib/formato';
import { ErrorPersistencia } from '../lib/repositorioAnalisis';
import { fechaLocalISO } from '../lib/validacion';
import { resumenErrores } from '../lib/validacionPlan';
import {
  MAX_DESCRIPCION,
  MAX_RESPONSABLE,
  tareaVencida,
  validarObservacionFormulario,
  validarTareaFormulario,
  type DatosRegistro,
  type EntradaObservacion,
  type EntradaTarea,
  type ErroresFormulario
} from '../lib/validacionSeguimiento';
import type { Lote, RegistroSeguimiento, RegistroTarea, RegistroVerificado, TipoRegistro } from '../types';
import { OrigenBadge } from './ProductoDetalle';

type Clase = 'observacion' | 'tarea';
type Modo = { tipo: 'lista' } | { tipo: 'nuevo'; clase: Clase } | { tipo: 'editar'; id: string };
type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;
type Lectura = { ok: true; registros: RegistroVerificado[] } | { ok: false };
type Filtro = 'todos' | TipoRegistro;
/** Un solo estado para los dos formularios: cada validación toma los campos que necesita. */
type Entrada = EntradaObservacion & EntradaTarea;

const NOMBRE_TIPO: Record<TipoRegistro, string> = { aplicacion: 'Aplicación', observacion: 'Observación', tarea: 'Tarea' };

/** Datos de un registro guardado, sin id, lote ni fechas de control, para volver a guardarlo. */
function datosDe(r: RegistroSeguimiento): DatosRegistro {
  const { id: _i, loteId: _l, createdAt: _c, updatedAt: _u, ...datos } = r;
  return datos as DatosRegistro;
}

/** Precarga: datos válidos del registro y, para los dañados, su texto original (no se vacían en silencio). */
function valorInicial(v: RegistroVerificado | undefined, campo: string, porDefecto = ''): string {
  if (!v) return porDefecto;
  const valor = v.parcial[campo];
  if (typeof valor === 'string') return valor;
  return v.problemas.find(p => p.campo === campo)?.textoEditable ?? '';
}

function entradaInicial(v?: RegistroVerificado): Entrada {
  const estado = v?.parcial.estado;
  return {
    fecha: valorInicial(v, 'fecha', fechaLocalISO()),
    descripcion: valorInicial(v, 'descripcion'),
    fechaPrevista: valorInicial(v, 'fechaPrevista'),
    // Un estado guardado dañado no se reemplaza en silencio por "pendiente": hay que elegirlo.
    estado: estado === 'hecha' || estado === 'pendiente' ? estado : v ? '' : 'pendiente',
    fechaRealizada: valorInicial(v, 'fechaRealizada'),
    responsable: valorInicial(v, 'responsable'),
    origen: v?.parcial.esEjemplo === true ? 'ejemplo' : v?.parcial.esEjemplo === false ? 'real' : ''
  };
}

function RegistroForm({ clase, inicial, onGuardar, onCancelar }: {
  clase: Clase;
  inicial?: RegistroVerificado;
  onGuardar: (datos: DatosRegistro, descartarDanados: boolean) => Promise<void>;
  onCancelar: () => void;
}) {
  const [entrada, setEntrada] = useState(() => entradaInicial(inicial));
  const [errores, setErrores] = useState<ErroresFormulario<Entrada>>({});
  const [errorGeneral, setErrorGeneral] = useState<string[]>([]);
  const [descartar, setDescartar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const problemas = inicial?.problemas ?? [];

  /** Al corregir un dato desaparece su error; los demás se conservan hasta volver a guardar. */
  const cambiar = (campo: keyof Entrada, valor: string) => {
    // Al marcar una tarea como hecha se propone la fecha de hoy; el usuario puede cambiarla.
    setEntrada(e => ({ ...e, [campo]: valor, ...(campo === 'estado' && valor === 'hecha' && !e.fechaRealizada ? { fechaRealizada: fechaLocalISO() } : {}) }));
    setErrorGeneral([]);
    setErrores(({ [campo]: _, ...resto }) => resto);
  };

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (problemas.length && !descartar) {
      setErrorGeneral(['Antes de guardar, confirma en el recuadro de arriba que quieres reemplazar los datos dañados.']);
      return;
    }
    const resultado = clase === 'observacion' ? validarObservacionFormulario(entrada) : validarTareaFormulario(entrada);
    if (!resultado.ok) {
      setErrores(resultado.errores);
      setErrorGeneral(resumenErrores(resultado.errores));
      return;
    }
    setGuardando(true);
    try {
      await onGuardar(resultado.datos, descartar);
    } catch (error) {
      setErrorGeneral(error instanceof ErrorPersistencia
        ? [error.message, ...error.detalles]
        : ['No se pudo guardar. Verifica que tu navegador permita almacenamiento local y vuelve a intentarlo.']);
    } finally {
      setGuardando(false);
    }
  }

  const error = (campo: keyof Entrada) => errores[campo] && <span className="field-error">{errores[campo]}</span>;

  return (
    <form className="form-card" onSubmit={enviar} noValidate aria-labelledby="titulo-form-registro">
      <div className="section-kicker">SEGUIMIENTO</div>
      <h2 id="titulo-form-registro">{inicial ? 'Editar' : 'Registrar'} {clase === 'observacion' ? 'observación' : 'tarea'}</h2>
      <p className="muted">{clase === 'observacion'
        ? 'Anota lo que viste en el lote. Es un registro manual: la app no deduce mediciones ni diagnósticos de él.'
        : 'Un recordatorio de algo por hacer en el lote. La app no envía notificaciones.'}</p>

      {problemas.length > 0 && <div className="error-box" role="group" aria-labelledby="titulo-danados-registro">
        <strong id="titulo-danados-registro">Este registro tiene datos guardados dañados.</strong>
        <ul className="damage-list">{problemas.map(p => <li key={p.campo}>{p.etiqueta}: {p.detalle} Valor guardado: <code>{p.valorOriginal}</code></li>)}</ul>
        <label className="check">
          <input type="checkbox" checked={descartar} onChange={e => setDescartar(e.target.checked)} />
          Revisé los datos dañados: reemplazarlos por lo que escriba en este formulario.
        </label>
      </div>}

      <div className="fields">
        {clase === 'observacion' ? <>
          <label>Fecha
            <input type="date" value={entrada.fecha} max={fechaLocalISO()} onChange={e => cambiar('fecha', e.target.value)} aria-invalid={!!errores.fecha} />
            {error('fecha')}
          </label>
          <label className="full">Descripción
            <textarea value={entrada.descripcion} onChange={e => cambiar('descripcion', e.target.value)} maxLength={MAX_DESCRIPCION} rows={3} placeholder="Ej. Hojas amarillas en el borde norte" aria-invalid={!!errores.descripcion} />
            {error('descripcion')}
          </label>
        </> : <>
          <label className="full">Descripción
            <textarea value={entrada.descripcion} onChange={e => cambiar('descripcion', e.target.value)} maxLength={MAX_DESCRIPCION} rows={2} placeholder="Ej. Aplicar la segunda fracción del plan" aria-invalid={!!errores.descripcion} />
            {error('descripcion')}
          </label>
          <label>Fecha prevista
            <input type="date" value={entrada.fechaPrevista} onChange={e => cambiar('fechaPrevista', e.target.value)} aria-invalid={!!errores.fechaPrevista} />
            {error('fechaPrevista')}
          </label>
          <label>Estado
            <select value={entrada.estado} onChange={e => cambiar('estado', e.target.value)} aria-invalid={!!errores.estado}>
              {!entrada.estado && <option value="">Elige…</option>}
              <option value="pendiente">Pendiente</option>
              <option value="hecha">Hecha</option>
            </select>
            {error('estado')}
          </label>
          {entrada.estado === 'hecha' && <label>Fecha en que se hizo
            <input type="date" value={entrada.fechaRealizada} max={fechaLocalISO()} onChange={e => cambiar('fechaRealizada', e.target.value)} aria-invalid={!!errores.fechaRealizada} />
            {error('fechaRealizada')}
          </label>}
        </>}
        <label>Responsable, opcional
          <input value={entrada.responsable} onChange={e => cambiar('responsable', e.target.value)} maxLength={MAX_RESPONSABLE} placeholder="Quién lo registra" aria-invalid={!!errores.responsable} />
          {error('responsable')}
        </label>
        <label>Origen del dato
          <select value={entrada.origen} onChange={e => cambiar('origen', e.target.value)} aria-invalid={!!errores.origen}>
            <option value="">Elige…</option>
            <option value="real">Dato real</option>
            <option value="ejemplo">EJEMPLO (ficticio)</option>
          </select>
          {error('origen')}
        </label>
      </div>
      {errorGeneral.length > 0 && <div role="alert" className="error">{errorGeneral.map((m, i) => <p key={i}>{m}</p>)}</div>}
      <div className="form-actions">
        <button className="btn btn-outline" type="button" disabled={guardando} onClick={onCancelar}>Cancelar</button>
        <button className="btn btn-primary" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  );
}

/** Seguimiento manual del lote: aplicaciones (de los planes), observaciones y tareas. Montar con key={lote.id}. */
export function SeguimientoSeccion({ lote }: { lote: Lote }) {
  const [modo, setModo] = useState<Modo>({ tipo: 'lista' });
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [aviso, setAviso] = useState<Aviso>(null);
  const [ocupado, setOcupado] = useState(false);
  const lectura = useLiveQuery<Lectura>(async () => {
    try {
      return { ok: true, registros: await repositorioSeguimiento.listar(lote.id) };
    } catch {
      return { ok: false };
    }
  }, [lote.id]);
  // Los nombres de los planes se leen aparte: si fallan, el seguimiento se sigue mostrando.
  const nombresPlan = useLiveQuery(async () => {
    try {
      return await repositorioPlanes.nombres(lote.id);
    } catch {
      return undefined;
    }
  }, [lote.id]);
  const registros = lectura?.ok ? lectura.registros : undefined;
  const editando = modo.tipo === 'editar' ? registros?.find(v => v.id === modo.id) : undefined;
  // Si el registro que se editaba ya no existe (p. ej. se eliminó en otra pestaña), se vuelve a la lista.
  const perdido = modo.tipo === 'editar' && registros !== undefined && !editando;
  const enLista = modo.tipo === 'lista' || perdido;
  const visibles = (registros ?? []).filter(v => filtro === 'todos' || v.tipo === filtro);
  const cuenta = (t: TipoRegistro) => (registros ?? []).filter(v => v.tipo === t).length;

  function abrir(m: Modo) {
    setAviso(null);
    setModo(m);
  }

  async function guardar(datos: DatosRegistro, opciones: { id?: string; descartarDanados?: boolean }, texto: string) {
    await repositorioSeguimiento.guardar(lote.id, datos, opciones);
    setModo({ tipo: 'lista' });
    setAviso({ tipo: 'ok', texto });
  }

  /** Acciones rápidas desde la lista: errores en el aviso de la sección. */
  async function accion(fn: () => Promise<void>, error: string) {
    setAviso(null);
    setOcupado(true);
    try {
      await fn();
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof ErrorPersistencia ? e.message : error });
    } finally {
      setOcupado(false);
    }
  }

  const marcarHecha = (t: RegistroTarea) => accion(async () => {
    await repositorioSeguimiento.guardar(lote.id, { ...datosDe(t), estado: 'hecha', fechaRealizada: fechaLocalISO() }, { id: t.id });
    setAviso({ tipo: 'ok', texto: 'La tarea quedó hecha con la fecha de hoy. Puedes editarla si se hizo otro día.' });
  }, 'No se pudo marcar la tarea. Vuelve a intentarlo.');

  function eliminar(v: RegistroVerificado) {
    // La confirmación va primero: cancelar no cambia nada, ni siquiera el aviso que se estaba mostrando.
    const nombre = v.tipo ? `esta ${NOMBRE_TIPO[v.tipo].toLowerCase()}` : 'este registro';
    if (!window.confirm(`¿Eliminar ${nombre}? Esta acción no se puede deshacer.`)) return;
    void accion(async () => {
      await repositorioSeguimiento.eliminar(lote.id, v.id);
      setAviso({ tipo: 'ok', texto: 'El registro se eliminó.' });
    }, 'No se pudo eliminar el registro. Vuelve a intentarlo.');
  }

  function nombrePlan(planId: string): string {
    if (!nombresPlan) return 'plan no disponible';
    const nombre = nombresPlan.get(planId);
    return nombre === undefined ? 'plan no disponible' : `plan «${nombre || 'Plan sin nombre'}»`;
  }

  /**
   * Elemento de la lista según el tipo de registro. Es una función que devuelve el elemento, no un
   * componente declarado dentro de otro (React lo volvería a montar en cada render).
   */
  function item(v: RegistroVerificado) {
    const r = v.registro;
    if (!r) {
      const corregible = v.id && (v.tipo === 'observacion' || v.tipo === 'tarea');
      return <li className="registro-danado">
        <span className="registro-cabeza"><strong>{v.tipo ? NOMBRE_TIPO[v.tipo] : 'Registro'}</strong>{v.fechaOrden && <span> · {fechaLegible(v.fechaOrden)}</span>} <span className="badge badge-error">Datos por corregir</span></span>
        <ul>{v.problemas.map(p => <li key={p.campo}>{p.etiqueta}: {p.detalle} Valor guardado: <code>{p.valorOriginal}</code></li>)}</ul>
        {v.tipo === 'aplicacion' && <small>Una aplicación dañada no se suma al avance de su plan. Para corregirla, elimínala y regístrala de nuevo desde el plan.</small>}
        {v.id && <span className="registro-acciones">
          {corregible && <button type="button" className="link-button" disabled={ocupado} onClick={() => abrir({ tipo: 'editar', id: v.id })}>Corregir</button>}
          <button type="button" className="link-button peligro" disabled={ocupado} onClick={() => eliminar(v)}>Eliminar</button>
        </span>}
      </li>;
    }
    if (r.tipo === 'aplicacion') {
      return <li>
        <span className="registro-cabeza"><strong>Aplicación</strong> · {fechaLegible(r.fecha)} <OrigenBadge esEjemplo={r.esEjemplo} real="Dato real" /></span>
        <span>{r.productoNombre}: {formatearExacto(r.cantidadKg)} kg{r.costoCop !== undefined ? ` · ${formatearExacto(r.costoCop)} COP` : ''}{r.responsable ? ` · ${r.responsable}` : ''}</span>
        <small>Del {nombrePlan(r.planId)}. Se edita en el detalle del plan.{r.nota ? ` Nota: ${r.nota}` : ''}</small>
      </li>;
    }
    if (r.tipo === 'observacion') {
      return <li>
        <span className="registro-cabeza"><strong>Observación</strong> · {fechaLegible(r.fecha)} <OrigenBadge esEjemplo={r.esEjemplo} real="Dato real" /></span>
        <span className="registro-texto">{r.descripcion}</span>
        {r.responsable && <small>{r.responsable}</small>}
        <span className="registro-acciones">
          <button type="button" className="link-button" disabled={ocupado} onClick={() => abrir({ tipo: 'editar', id: r.id })}>Editar</button>
          <button type="button" className="link-button peligro" disabled={ocupado} onClick={() => eliminar(v)}>Eliminar</button>
        </span>
      </li>;
    }
    const vencida = tareaVencida(r);
    return <li>
      <span className="registro-cabeza">
        <strong>Tarea</strong> · prevista para el {fechaLegible(r.fechaPrevista)}{' '}
        {r.estado === 'hecha'
          ? <span className="badge badge-entered">Hecha el {fechaLegible(r.fechaRealizada)}</span>
          : <span className="badge badge-warn">{vencida ? 'Pendiente · fecha pasada' : 'Pendiente'}</span>}{' '}
        <OrigenBadge esEjemplo={r.esEjemplo} real="Dato real" />
      </span>
      <span className="registro-texto">{r.descripcion}</span>
      {r.responsable && <small>{r.responsable}</small>}
      <span className="registro-acciones">
        {r.estado === 'pendiente' && <button type="button" className="link-button" disabled={ocupado} onClick={() => void marcarHecha(r)}>Marcar como hecha hoy</button>}
        <button type="button" className="link-button" disabled={ocupado} onClick={() => abrir({ tipo: 'editar', id: r.id })}>Editar</button>
        <button type="button" className="link-button peligro" disabled={ocupado} onClick={() => eliminar(v)}>Eliminar</button>
      </span>
    </li>;
  }

  const claseEdicion: Clase | undefined = editando?.tipo === 'observacion' || editando?.tipo === 'tarea' ? editando.tipo : undefined;

  return (
    <section className="soil-section" aria-labelledby="titulo-seguimiento">
      <div className="section-header">
        <div>
          <div className="section-kicker">PASO 4 · SEGUIMIENTO</div>
          <h2 id="titulo-seguimiento">Seguimiento del lote</h2>
          <p>Observaciones, tareas y las aplicaciones registradas en los planes aprobados. Es un registro manual: no es una medición ni un sensor.</p>
        </div>
        {enLista && lectura?.ok && <div className="seguimiento-botones">
          <button className="btn btn-outline" onClick={() => abrir({ tipo: 'nuevo', clase: 'observacion' })}>+ Observación</button>
          <button className="btn btn-outline" onClick={() => abrir({ tipo: 'nuevo', clase: 'tarea' })}>+ Tarea</button>
        </div>}
      </div>

      {perdido && <div role="status" className="notice notice-error"><span aria-hidden="true">!</span>El registro que estabas editando ya no existe; no se guardó ningún cambio.</div>}

      {aviso && <div role={aviso.tipo === 'error' ? 'alert' : 'status'} className={`notice ${aviso.tipo === 'error' ? 'notice-error' : 'notice-ok'}`}>
        <span aria-hidden="true">{aviso.tipo === 'error' ? '!' : '✓'}</span>{aviso.texto}
        <button onClick={() => setAviso(null)} aria-label="Cerrar aviso">×</button>
      </div>}

      {lectura && !lectura.ok && <div className="notice notice-error" role="alert">
        <span aria-hidden="true">!</span>
        No se pudo leer el seguimiento guardado en este navegador. Tus datos no se han borrado. Recarga la página; si el problema sigue, revisa que el navegador permita almacenamiento local y no esté en modo privado.
      </div>}

      {modo.tipo === 'nuevo' && <RegistroForm clase={modo.clase}
        onGuardar={datos => guardar(datos, {}, modo.clase === 'observacion' ? 'La observación se guardó.' : 'La tarea se guardó.')}
        onCancelar={() => abrir({ tipo: 'lista' })} />}
      {modo.tipo === 'editar' && editando && claseEdicion && <RegistroForm key={editando.id} clase={claseEdicion} inicial={editando}
        onGuardar={(datos, descartarDanados) => guardar(datos, { id: editando.id, descartarDanados }, 'Los cambios se guardaron.')}
        onCancelar={() => abrir({ tipo: 'lista' })} />}

      {enLista && (
        lectura === undefined ? <div className="empty"><p>Cargando seguimiento…</p></div>
          : !registros ? null
          : registros.length === 0 ? <div className="empty soil-empty">
            <h3>Este lote aún no tiene registros de seguimiento</h3>
            <p>Anota observaciones del lote y tareas por hacer. Las aplicaciones se registran en el detalle de un plan aprobado.</p>
          </div>
          : <>
            <label className="filtro-seguimiento">Mostrar
              <select value={filtro} onChange={e => setFiltro(e.target.value as Filtro)}>
                <option value="todos">Todo ({registros.length})</option>
                <option value="aplicacion">Aplicaciones ({cuenta('aplicacion')})</option>
                <option value="observacion">Observaciones ({cuenta('observacion')})</option>
                <option value="tarea">Tareas ({cuenta('tarea')})</option>
              </select>
            </label>
            {visibles.length === 0 ? <p className="muted">No hay registros de este tipo.</p>
              : <ul className="seguimiento-lista" aria-label="Registros de seguimiento, del más reciente al más antiguo">
                {visibles.map((v, i) => <Fragment key={v.id || `sin-id-${i}`}>{item(v)}</Fragment>)}
              </ul>}
          </>
      )}
    </section>
  );
}
