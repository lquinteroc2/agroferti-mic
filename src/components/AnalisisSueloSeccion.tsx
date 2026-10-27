import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnalisisSueloDetalle, EstadoBadge } from './AnalisisSueloDetalle';
import { AnalisisSueloForm, type OpcionesFormulario } from './AnalisisSueloForm';
import { repositorioAnalisis } from '../lib/db';
import { fechaLegible, formatearNumero } from '../lib/formato';
import type { DatosAnalisis } from '../lib/validacion';
import type { AnalisisVerificado, Lote } from '../types';

type Modo = 'lista' | 'nuevo' | 'editar' | 'ver';
type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;
type Lectura = { ok: true; analisis: AnalisisVerificado[] } | { ok: false };

/** Módulo de análisis de suelo dentro de la ficha de un lote. Montar con key={lote.id}. */
export function AnalisisSueloSeccion({ lote }: { lote: Lote }) {
  const [modo, setModo] = useState<Modo>('lista');
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  // El error de lectura se captura aquí para mostrar un mensaje en lugar de romper la pantalla.
  const lectura = useLiveQuery<Lectura>(async () => {
    try {
      return { ok: true, analisis: await repositorioAnalisis.listar(lote.id) };
    } catch {
      return { ok: false };
    }
  }, [lote.id]);
  const analisis = lectura?.ok ? lectura.analisis : undefined;
  const seleccionado = analisis?.find(a => a.id === seleccionId);

  function abrir(m: Modo, id: string | null = seleccionId) {
    setAviso(null);
    setSeleccionId(id);
    setModo(m);
  }

  async function guardar(datos: DatosAnalisis, { actualizarArea, resueltos }: OpcionesFormulario) {
    const editando = modo === 'editar' && seleccionado;
    const id = await repositorioAnalisis.guardar(lote.id, datos, { id: editando ? seleccionado.id : undefined, actualizarArea, resueltos });
    setSeleccionId(id);
    setModo('ver');
    setAviso({ tipo: 'ok', texto: editando ? 'Los cambios del análisis se guardaron.' : 'El análisis se guardó en este dispositivo.' });
  }

  async function borrar(a: AnalisisVerificado) {
    if (!window.confirm(`¿Eliminar el análisis del ${fechaLegible(a.fechaAnalisis)}? Esta acción no se puede deshacer.`)) return;
    try {
      await repositorioAnalisis.eliminar(lote.id, a.id);
      abrir('lista', null);
      setAviso({ tipo: 'ok', texto: 'El análisis se eliminó.' });
    } catch {
      setAviso({ tipo: 'error', texto: 'No se pudo eliminar el análisis. Vuelve a intentarlo.' });
    }
  }

  const mostrarLista = modo === 'lista' || ((modo === 'ver' || modo === 'editar') && analisis && !seleccionado);

  return (
    <section className="soil-section" aria-labelledby="titulo-suelo">
      <div className="section-header">
        <div>
          <div className="section-kicker">PASO 2 · SUELO</div>
          <h2 id="titulo-suelo">Análisis de suelo</h2>
          <p>Guarda los resultados del laboratorio y entiende sus unidades. No se calcula ninguna dosis.</p>
        </div>
        {modo === 'lista' && lectura?.ok && <button className="btn btn-outline" onClick={() => abrir('nuevo', null)}>+ Agregar análisis</button>}
      </div>

      {aviso && <div role={aviso.tipo === 'error' ? 'alert' : 'status'} className={`notice ${aviso.tipo === 'error' ? 'notice-error' : 'notice-ok'}`}>
        <span aria-hidden="true">{aviso.tipo === 'error' ? '!' : '✓'}</span>{aviso.texto}
        <button onClick={() => setAviso(null)} aria-label="Cerrar aviso">×</button>
      </div>}

      {lectura && !lectura.ok && <div className="notice notice-error" role="alert">
        <span aria-hidden="true">!</span>
        No se pudieron leer los análisis guardados en este navegador. Tus datos no se han borrado. Recarga la página; si el problema sigue, revisa que el navegador permita almacenamiento local y no esté en modo privado.
      </div>}

      {modo === 'nuevo' && <AnalisisSueloForm areaActualM2={lote.areaM2} onGuardar={guardar} onCancelar={() => abrir('lista', null)} />}
      {modo === 'editar' && seleccionado && <AnalisisSueloForm key={seleccionado.id} inicial={seleccionado} areaActualM2={lote.areaM2} onGuardar={guardar} onCancelar={() => abrir('ver')} />}
      {modo === 'ver' && seleccionado && <>
        <button className="back" onClick={() => abrir('lista', null)}>← Volver al historial de análisis</button>
        <AnalisisSueloDetalle analisis={seleccionado} onEditar={() => abrir('editar')} onEliminar={() => void borrar(seleccionado)} />
      </>}

      {mostrarLista && (
        lectura === undefined ? <div className="empty"><p>Cargando análisis…</p></div>
          : !analisis ? null
          : analisis.length === 0 ? <div className="empty soil-empty"><h3>Este lote aún no tiene análisis de suelo</h3><p>Cuando tengas el informe del laboratorio, regístralo aquí para conservar fecha, profundidad, unidades y método.</p><button className="btn btn-primary" onClick={() => abrir('nuevo', null)}>Agregar el primer análisis</button></div>
          : <ul className="soil-history" aria-label="Historial de análisis, del más reciente al más antiguo">{analisis.map(a => (
            <li key={a.id}><button className="lot-card soil-card" onClick={() => abrir('ver', a.id)}>
              <span className="lot-card-content">
                <strong>{fechaLegible(a.fechaAnalisis)}</strong>
                <span>{a.profundidadCm !== undefined ? `${formatearNumero(a.profundidadCm, 3)} cm de profundidad` : 'Profundidad por corregir'} · {a.nutrientes.length} {a.nutrientes.length === 1 ? 'resultado' : 'resultados'}{a.ph !== undefined ? ` · pH ${formatearNumero(a.ph, 2)}` : ''}</span>
                <small>{a.laboratorio || 'Laboratorio no registrado'}{a.densidadGcm3 === undefined ? ' · Sin densidad aparente: no se calculan equivalencias' : ''}</small>
                <span className="card-badges"><EstadoBadge analisis={a} />{a.problemas.length > 0 && <span className="badge badge-error">Datos por corregir</span>}</span>
              </span>
              <span className="arrow" aria-hidden="true">›</span>
            </button></li>
          ))}</ul>
      )}
    </section>
  );
}
