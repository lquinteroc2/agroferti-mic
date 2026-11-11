import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { repositorioAnalisis, repositorioCiclos, repositorioPlanes, repositorioSeguimiento } from '../lib/db';
import { fechaLegible, formatearExacto, nombreCultivo } from '../lib/formato';
import {
  MAX_NOTAS_CICLO,
  agruparHistorial,
  duracionDias,
  fechaPlan,
  validarCierreFormulario,
  type EntradaCierre,
  type ErroresCierre,
  type HistorialLote,
  type PeriodoHistorial
} from '../lib/historial';
import { ErrorPersistencia } from '../lib/repositorioAnalisis';
import { fechaLocalISO } from '../lib/validacion';
import { resumenErrores } from '../lib/validacionPlan';
import { CULTIVOS, MOTIVOS_CIERRE, type CicloCultivo, type CicloVerificado, type Lote, type MotivoCierre } from '../types';
import { OrigenBadge } from './ProductoDetalle';

type Modo = { tipo: 'lista' } | { tipo: 'cerrar' } | { tipo: 'notas'; id: string };
type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;
type Lectura = { ok: true; historial: HistorialLote; ciclos: CicloVerificado[] } | { ok: false };

const NOMBRE_ESTADO_PLAN: Record<string, string> = { propuesta: 'Propuesta', revisado: 'Revisado', aprobado: 'Aprobado' };
const nombreMotivo = (m: MotivoCierre) => MOTIVOS_CIERRE.find(x => x.value === m)?.label ?? m;

function CierreForm({ lote, ultimoCierre, onGuardar, onCancelar }: {
  lote: Lote;
  ultimoCierre?: string;
  onGuardar: (datos: unknown) => Promise<void>;
  onCancelar: () => void;
}) {
  const [entrada, setEntrada] = useState<EntradaCierre>({
    fechaCierre: fechaLocalISO(), motivo: '', notas: '', origen: '', nuevoCultivo: lote.cultivo, nuevaFechaSiembra: ''
  });
  const [errores, setErrores] = useState<ErroresCierre>({});
  const [errorGeneral, setErrorGeneral] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  const cambiar = (campo: keyof EntradaCierre, valor: string) => {
    setEntrada(e => ({ ...e, [campo]: valor }));
    setErrorGeneral([]);
    setErrores(({ [campo]: _, ...resto }) => resto);
  };

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const resultado = validarCierreFormulario(entrada, { fechaSiembraActual: lote.fechaSiembra, ultimoCierre });
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

  const error = (campo: keyof EntradaCierre) => errores[campo] && <span className="field-error">{errores[campo]}</span>;

  return (
    <form className="form-card" onSubmit={enviar} noValidate aria-labelledby="titulo-form-cierre">
      <div className="section-kicker">HISTORIAL DEL LOTE</div>
      <h2 id="titulo-form-cierre">Cerrar el cultivo actual y empezar otro</h2>
      <p className="muted">
        Se guardará en el historial el cultivo actual: <strong>{nombreCultivo(lote.cultivo)}</strong>, siembra {fechaLegible(lote.fechaSiembra).toLowerCase()}, {formatearExacto(lote.areaM2)} m².
        Los análisis, planes y registros no se borran ni se cambian: el historial los ubica por su fecha.
      </p>
      <div className="fields">
        <label>Fecha de cierre (cosecha o fin del cultivo)
          <input type="date" value={entrada.fechaCierre} min={lote.fechaSiembra ?? ultimoCierre} max={fechaLocalISO()} onChange={e => cambiar('fechaCierre', e.target.value)} aria-invalid={!!errores.fechaCierre} />
          {error('fechaCierre')}
        </label>
        <label>Cómo terminó
          <select value={entrada.motivo} onChange={e => cambiar('motivo', e.target.value)} aria-invalid={!!errores.motivo}>
            <option value="">Elige…</option>
            {MOTIVOS_CIERRE.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          {error('motivo')}
        </label>
        <label className="full">Resultado y notas
          <textarea value={entrada.notas} onChange={e => cambiar('notas', e.target.value)} maxLength={MAX_NOTAS_CICLO} rows={3} placeholder="Ej. Se cosecharon 40 bultos; hubo heladas en floración" aria-invalid={!!errores.notas} />
          <small>Lo escribes tú: la app no calcula rendimientos ni los interpreta.</small>
          {error('notas')}
        </label>
        <label>Origen del dato
          <select value={entrada.origen} onChange={e => cambiar('origen', e.target.value)} aria-invalid={!!errores.origen}>
            <option value="">Elige…</option>
            <option value="real">Dato real</option>
            <option value="ejemplo">EJEMPLO (ficticio)</option>
          </select>
          {error('origen')}
        </label>
        <label>Nuevo cultivo del lote
          <select value={entrada.nuevoCultivo} onChange={e => cambiar('nuevoCultivo', e.target.value)}>
            {CULTIVOS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label>Siembra del nuevo cultivo
          <input type="date" value={entrada.nuevaFechaSiembra} min={entrada.fechaCierre || undefined} onChange={e => cambiar('nuevaFechaSiembra', e.target.value)} aria-invalid={!!errores.nuevaFechaSiembra} />
          {error('nuevaFechaSiembra')}
        </label>
      </div>
      {errorGeneral.length > 0 && <div role="alert" className="error">{errorGeneral.map((m, i) => <p key={i}>{m}</p>)}</div>}
      <div className="form-actions">
        <button className="btn btn-outline" type="button" disabled={guardando} onClick={onCancelar}>Cancelar</button>
        <button className="btn btn-primary" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Cerrar ciclo'}</button>
      </div>
    </form>
  );
}

function NotasForm({ ciclo, onGuardar, onCancelar }: {
  ciclo: CicloCultivo;
  onGuardar: (datos: { motivo: MotivoCierre; notas?: string; esEjemplo: boolean }) => Promise<void>;
  onCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState<MotivoCierre>(ciclo.motivo);
  const [notas, setNotas] = useState(ciclo.notas ?? '');
  const [origen, setOrigen] = useState<'real' | 'ejemplo'>(ciclo.esEjemplo ? 'ejemplo' : 'real');
  const [error, setError] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGuardando(true);
    try {
      await onGuardar({ motivo, notas: notas.trim() || undefined, esEjemplo: origen === 'ejemplo' });
    } catch (e) {
      setError(e instanceof ErrorPersistencia ? [e.message, ...e.detalles] : ['No se pudo guardar. Vuelve a intentarlo.']);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="form-card" onSubmit={enviar} noValidate aria-labelledby="titulo-form-notas">
      <div className="section-kicker">HISTORIAL DEL LOTE</div>
      <h2 id="titulo-form-notas">{nombreCultivo(ciclo.cultivo)} · cerrado el {fechaLegible(ciclo.fechaCierre)}</h2>
      <p className="muted">Puedes corregir cómo terminó y las notas. El cultivo y las fechas no se editan porque ordenan el historial; si están mal, elimina el ciclo y ciérralo de nuevo.</p>
      <div className="fields">
        <label>Cómo terminó
          <select value={motivo} onChange={e => setMotivo(e.target.value as MotivoCierre)}>
            {MOTIVOS_CIERRE.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <label>Origen del dato
          <select value={origen} onChange={e => setOrigen(e.target.value as 'real' | 'ejemplo')}>
            <option value="real">Dato real</option>
            <option value="ejemplo">EJEMPLO (ficticio)</option>
          </select>
        </label>
        <label className="full">Resultado y notas
          <textarea value={notas} onChange={e => { setNotas(e.target.value); setError([]); }} maxLength={MAX_NOTAS_CICLO} rows={3} />
        </label>
      </div>
      {error.length > 0 && <div role="alert" className="error">{error.map((m, i) => <p key={i}>{m}</p>)}</div>}
      <div className="form-actions">
        <button className="btn btn-outline" type="button" disabled={guardando} onClick={onCancelar}>Cancelar</button>
        <button className="btn btn-primary" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  );
}

/** Lo registrado en un periodo, en listas cortas. Los registros se editan en su propia sección. */
function contenidoPeriodo(p: PeriodoHistorial) {
  const aplicaciones = p.registros.filter(r => r.registro?.tipo === 'aplicacion');
  const otros = p.registros.filter(r => r.registro?.tipo !== 'aplicacion');
  if (!p.analisis.length && !p.planes.length && !p.registros.length) return <p className="muted">No hay análisis, planes ni registros con fecha en este periodo.</p>;
  return <div className="historial-contenido">
    {p.analisis.length > 0 && <div><h4>Análisis de suelo ({p.analisis.length})</h4><ul>
      {p.analisis.map((a, i) => <li key={a.id || i}>{fechaLegible(a.fechaAnalisis)} · {a.laboratorio || 'Laboratorio no registrado'} · {a.nutrientes.length} {a.nutrientes.length === 1 ? 'resultado' : 'resultados'}{a.problemas.length > 0 && <> <span className="badge badge-error">Datos por corregir</span></>}</li>)}
    </ul></div>}
    {p.planes.length > 0 && <div><h4>Planes de fertilización ({p.planes.length})</h4><ul>
      {p.planes.map((pl, i) => <li key={pl.id || i}>{pl.nombre || 'Plan sin nombre'} · {pl.estado ? NOMBRE_ESTADO_PLAN[pl.estado] : 'estado no válido'} · creado el {fechaLegible(fechaPlan(pl))}</li>)}
    </ul></div>}
    {aplicaciones.length > 0 && <div><h4>Aplicaciones ({aplicaciones.length})</h4><ul>
      {aplicaciones.map((v, i) => v.registro?.tipo === 'aplicacion' && <li key={v.id || i}>{fechaLegible(v.registro.fecha)} · {v.registro.productoNombre}: {formatearExacto(v.registro.cantidadKg)} kg <OrigenBadge esEjemplo={v.registro.esEjemplo} real="Dato real" /></li>)}
    </ul></div>}
    {otros.length > 0 && <div><h4>Observaciones y tareas ({otros.length})</h4><ul>
      {otros.map((v, i) => {
        const r = v.registro;
        if (!r || r.tipo === 'aplicacion') return <li key={v.id || i}>{fechaLegible(v.fechaOrden)} · registro <span className="badge badge-error">Datos por corregir</span></li>;
        return <li key={v.id || i}>{r.tipo === 'observacion' ? `${fechaLegible(r.fecha)} · Observación` : `${fechaLegible(r.fechaPrevista)} · Tarea (${r.estado})`}: {r.descripcion} <OrigenBadge esEjemplo={r.esEjemplo} real="Dato real" /></li>;
      })}
    </ul></div>}
  </div>;
}

/** Historial del lote: el cultivo actual y los ciclos cerrados, con lo registrado en cada uno. Montar con key={lote.id}. */
export function HistorialLoteSeccion({ lote }: { lote: Lote }) {
  const [modo, setModo] = useState<Modo>({ tipo: 'lista' });
  const [aviso, setAviso] = useState<Aviso>(null);
  const [ocupado, setOcupado] = useState(false);
  const lectura = useLiveQuery<Lectura>(async () => {
    try {
      const [ciclos, analisis, planes, registros] = await Promise.all([
        repositorioCiclos.listar(lote.id),
        repositorioAnalisis.listar(lote.id),
        repositorioPlanes.listar(lote.id),
        repositorioSeguimiento.listar(lote.id)
      ]);
      return { ok: true, ciclos, historial: agruparHistorial({ ciclos, analisis, planes, registros }) };
    } catch {
      return { ok: false };
    }
  }, [lote.id]);
  const ciclos = lectura?.ok ? lectura.ciclos : [];
  const danados = ciclos.filter(v => !v.ciclo);
  const ultimoCierre = ciclos.find(v => v.fechaCierre)?.fechaCierre;
  const editando = modo.tipo === 'notas' ? ciclos.find(v => v.id === modo.id)?.ciclo : undefined;

  function abrir(m: Modo) {
    setAviso(null);
    setModo(m);
  }

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

  function eliminar(v: CicloVerificado) {
    const nombre = v.ciclo ? `el ciclo de ${nombreCultivo(v.ciclo.cultivo).toLowerCase()} cerrado el ${fechaLegible(v.ciclo.fechaCierre)}` : 'este ciclo';
    if (!window.confirm(`¿Quitar ${nombre} del historial? Los análisis, planes y registros no se borran: pasarán a mostrarse en el ciclo siguiente. El cultivo actual del lote no cambia.`)) return;
    void accion(async () => {
      await repositorioCiclos.eliminar(lote.id, v.id);
      setAviso({ tipo: 'ok', texto: 'El ciclo se quitó del historial.' });
    }, 'No se pudo eliminar el ciclo. Vuelve a intentarlo.');
  }

  function periodo(p: PeriodoHistorial) {
    const total = p.analisis.length + p.planes.length + p.registros.length;
    if (!p.ciclo) {
      return <details key="actual" className="historial-ciclo historial-actual">
        <summary>
          <span className="registro-cabeza"><strong>{nombreCultivo(lote.cultivo)}</strong> <span className="badge badge-entered">Cultivo actual</span></span>
          <span>Siembra: {fechaLegible(lote.fechaSiembra)}{p.desdeCierre ? ` · registros posteriores al cierre del ${fechaLegible(p.desdeCierre)}` : ''} · {total} {total === 1 ? 'registro' : 'registros'}</span>
        </summary>
        {contenidoPeriodo(p)}
      </details>;
    }
    const c = p.ciclo;
    const dias = duracionDias(c.fechaSiembra, c.fechaCierre);
    return <details key={c.id} className="historial-ciclo">
      <summary>
        <span className="registro-cabeza"><strong>{nombreCultivo(c.cultivo)}</strong> · {nombreMotivo(c.motivo).toLowerCase()} el {fechaLegible(c.fechaCierre)} <OrigenBadge esEjemplo={c.esEjemplo} real="Dato real" /></span>
        <span>Siembra: {fechaLegible(c.fechaSiembra)}{dias !== undefined ? ` · ${dias} días` : ''} · {formatearExacto(c.areaM2)} m² · {total} {total === 1 ? 'registro' : 'registros'}</span>
      </summary>
      {c.notas && <p className="registro-texto"><strong>Resultado y notas:</strong> {c.notas}</p>}
      {contenidoPeriodo(p)}
      <span className="registro-acciones">
        <button type="button" className="link-button" disabled={ocupado} onClick={() => abrir({ tipo: 'notas', id: c.id })}>Editar notas</button>
        <button type="button" className="link-button peligro" disabled={ocupado} onClick={() => eliminar({ id: c.id, loteId: c.loteId, ciclo: c, fechaCierre: c.fechaCierre, problemas: [] })}>Quitar del historial</button>
      </span>
    </details>;
  }

  const sinFecha = lectura?.ok ? lectura.historial.sinFecha : undefined;
  const totalSinFecha = sinFecha ? sinFecha.analisis.length + sinFecha.planes.length + sinFecha.registros.length : 0;

  return (
    <section className="soil-section" aria-labelledby="titulo-historial">
      <div className="section-header">
        <div>
          <div className="section-kicker">HISTORIAL</div>
          <h2 id="titulo-historial">Historial del lote</h2>
          <p>Los cultivos que ha tenido este lote y lo registrado en cada uno, para comparar con cultivos anteriores. Al cosechar, cierra el ciclo y empieza el siguiente cultivo.</p>
        </div>
        {modo.tipo === 'lista' && lectura?.ok && <button className="btn btn-outline" onClick={() => abrir({ tipo: 'cerrar' })}>Cerrar ciclo y empezar otro cultivo</button>}
      </div>

      {aviso && <div role={aviso.tipo === 'error' ? 'alert' : 'status'} className={`notice ${aviso.tipo === 'error' ? 'notice-error' : 'notice-ok'}`}>
        <span aria-hidden="true">{aviso.tipo === 'error' ? '!' : '✓'}</span>{aviso.texto}
        <button onClick={() => setAviso(null)} aria-label="Cerrar aviso">×</button>
      </div>}

      {lectura && !lectura.ok && <div className="notice notice-error" role="alert">
        <span aria-hidden="true">!</span>
        No se pudo leer el historial guardado en este navegador. Tus datos no se han borrado. Recarga la página; si el problema sigue, revisa que el navegador permita almacenamiento local.
      </div>}

      {modo.tipo === 'cerrar' && <CierreForm lote={lote} ultimoCierre={ultimoCierre}
        onGuardar={async datos => {
          await repositorioCiclos.cerrarCiclo(lote.id, datos);
          setModo({ tipo: 'lista' });
          setAviso({ tipo: 'ok', texto: 'El ciclo se cerró y quedó en el historial. El lote sigue con el nuevo cultivo.' });
        }}
        onCancelar={() => abrir({ tipo: 'lista' })} />}
      {modo.tipo === 'notas' && editando && <NotasForm key={editando.id} ciclo={editando}
        onGuardar={async datos => {
          await repositorioCiclos.editarNotas(lote.id, editando.id, datos);
          setModo({ tipo: 'lista' });
          setAviso({ tipo: 'ok', texto: 'Los cambios del ciclo se guardaron.' });
        }}
        onCancelar={() => abrir({ tipo: 'lista' })} />}

      {(modo.tipo === 'lista' || (modo.tipo === 'notas' && !editando)) && (
        lectura === undefined ? <div className="empty"><p>Cargando historial…</p></div>
          : !lectura.ok ? null
          : <>
            {lectura.historial.periodos.length === 1 && <p className="muted">Este lote aún no tiene cultivos anteriores. Cuando coseches, usa «Cerrar ciclo y empezar otro cultivo» para guardarlo en el historial.</p>}
            <div className="historial-lista">{lectura.historial.periodos.map(periodo)}</div>
            {danados.length > 0 && <div className="error-box">
              <strong>Hay ciclos guardados con datos dañados.</strong> No se usan para ordenar el historial; sus registros se muestran en el ciclo siguiente.
              <ul className="damage-list">{danados.map((v, i) => <li key={v.id || i}>
                {v.problemas.map(p => `${p.etiqueta}: ${p.detalle} Valor guardado: ${p.valorOriginal}`).join(' · ')}
                {v.id && <> <button type="button" className="link-button peligro" disabled={ocupado} onClick={() => eliminar(v)}>Quitar del historial</button></>}
              </li>)}</ul>
            </div>}
            {totalSinFecha > 0 && <p className="muted">{totalSinFecha} {totalSinFecha === 1 ? 'registro no tiene' : 'registros no tienen'} una fecha válida y no se pueden ubicar en un ciclo; revísalos en su sección.</p>}
          </>
      )}
    </section>
  );
}
