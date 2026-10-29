import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { EstadoPlanBadge, PlanDetalle } from './PlanDetalle';
import { PlanForm, type OpcionesPlanFormulario } from './PlanForm';
import { useSeleccionViva, type ModoSeccion } from './useSeleccionViva';
import { calcularPlan } from '../lib/calculos';
import { repositorioAnalisis, repositorioPlanes, repositorioProductos } from '../lib/db';
import { fechaDeMarca, formatearResultado } from '../lib/formato';
import { ErrorPersistencia } from '../lib/repositorioAnalisis';
import type { DatosPlan } from '../lib/validacionPlan';
import type { AnalisisVerificado, Lote, PlanVerificado, ProductoFertilizante } from '../types';

type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;
type Lectura =
  | { ok: true; planes: PlanVerificado[]; productos: ProductoFertilizante[]; analisis: AnalisisVerificado[] }
  | { ok: false };

function costoResumido(p: PlanVerificado): string {
  const total = calcularPlan(p).costoTotalCop;
  return total.ok ? `Costo estimado ${formatearResultado(total.valor, 0)} COP` : 'Sin costo total';
}

/** Planes de fertilización dentro de la ficha de un lote. Montar con key={lote.id}. */
export function PlanesSeccion({ lote, onIrAProductos }: { lote: Lote; onIrAProductos: () => void }) {
  const [aviso, setAviso] = useState<Aviso>(null);
  // El error de lectura se captura aquí para mostrar un mensaje en lugar de romper la pantalla.
  const lectura = useLiveQuery<Lectura>(async () => {
    try {
      const [planes, catalogo, analisis] = await Promise.all([
        repositorioPlanes.listar(lote.id), repositorioProductos.listar(), repositorioAnalisis.listar(lote.id)
      ]);
      // Solo los productos sin datos dañados se pueden elegir para un plan.
      return { ok: true, planes, productos: catalogo.flatMap(v => (v.producto ? [v.producto] : [])), analisis };
    } catch {
      return { ok: false };
    }
  }, [lote.id]);
  const planes = lectura?.ok ? lectura.planes : undefined;
  const seleccion = useSeleccionViva(planes);
  const { modo, modoVisible, seleccionado, esperando } = seleccion;

  function abrir(m: ModoSeccion, id?: string | null) {
    setAviso(null);
    seleccion.abrir(m, id);
  }

  async function guardar(datos: DatosPlan, { actualizarArea, responsable }: OpcionesPlanFormulario) {
    const editando = modo === 'editar' && seleccionado;
    let id: string;
    if (editando) {
      await repositorioPlanes.editar(lote.id, seleccionado.id, datos, { actualizarArea });
      id = seleccionado.id;
    } else {
      id = await repositorioPlanes.crear(lote.id, datos, { responsable });
    }
    seleccion.verGuardado(id);
    setAviso({ tipo: 'ok', texto: editando ? 'Los cambios de la propuesta se guardaron.' : 'La propuesta de plan se guardó en este dispositivo.' });
  }

  async function borrar(p: PlanVerificado) {
    if (!window.confirm(`¿Eliminar el plan “${p.nombre || 'sin nombre'}”? Esta acción no se puede deshacer.`)) return;
    try {
      await repositorioPlanes.eliminar(lote.id, p.id);
      abrir('lista', null);
      setAviso({ tipo: 'ok', texto: 'El plan se eliminó.' });
    } catch (error) {
      setAviso({ tipo: 'error', texto: error instanceof ErrorPersistencia ? error.message : 'No se pudo eliminar el plan. Vuelve a intentarlo.' });
    }
  }

  const productos = lectura?.ok ? lectura.productos : [];
  const analisis = lectura?.ok ? lectura.analisis : [];

  return (
    <section className="soil-section" aria-labelledby="titulo-planes">
      <div className="section-header">
        <div>
          <div className="section-kicker">PASO 3 · PLAN</div>
          <h2 id="titulo-planes">Plan de fertilización</h2>
          <p>Escribe las metas con su fuente técnica y elige un producto del catálogo para cada una. La app calcula cantidad y costo, y explica cada operación. No propone metas ni dosis.</p>
        </div>
        {modoVisible === 'lista' && lectura?.ok && <button className="btn btn-outline" onClick={() => abrir('nuevo', null)}>+ Nueva propuesta</button>}
      </div>

      {aviso && <div role={aviso.tipo === 'error' ? 'alert' : 'status'} className={`notice ${aviso.tipo === 'error' ? 'notice-error' : 'notice-ok'}`}>
        <span aria-hidden="true">{aviso.tipo === 'error' ? '!' : '✓'}</span>{aviso.texto}
        <button onClick={() => setAviso(null)} aria-label="Cerrar aviso">×</button>
      </div>}

      {lectura && !lectura.ok && <div className="notice notice-error" role="alert">
        <span aria-hidden="true">!</span>
        No se pudieron leer los planes guardados en este navegador. Tus datos no se han borrado. Recarga la página; si el problema sigue, revisa que el navegador permita almacenamiento local y no esté en modo privado.
      </div>}

      {modo === 'nuevo' && <PlanForm lote={lote} productos={productos} analisis={analisis} onGuardar={guardar} onCancelar={() => abrir('lista', null)} />}
      {modo === 'editar' && seleccionado && <PlanForm key={seleccionado.id} inicial={seleccionado} lote={lote} productos={productos} analisis={analisis} onGuardar={guardar} onCancelar={() => abrir('ver')} />}
      {modo === 'ver' && seleccionado && <>
        <button className="back" onClick={() => abrir('lista', null)}>← Volver a los planes del lote</button>
        <PlanDetalle plan={seleccionado} analisis={analisis} onEditar={() => abrir('editar')} onEliminar={() => void borrar(seleccionado)} />
      </>}
      {esperando && <div className="empty"><p>Cargando plan…</p></div>}

      {modoVisible === 'lista' && (
        lectura === undefined ? <div className="empty"><p>Cargando planes…</p></div>
          : !planes ? null
          : planes.length === 0 ? <div className="empty soil-empty">
            <h3>Este lote aún no tiene planes</h3>
            <p>Necesitas las metas nutricionales de tu fuente técnica (con su fecha) y los productos registrados en el catálogo.</p>
            <button className="btn btn-primary" onClick={() => abrir('nuevo', null)}>Crear la primera propuesta</button>
            {productos.length === 0 && <p className="hint hint-warn">Tu catálogo todavía no tiene productos. <button type="button" className="link-button" onClick={onIrAProductos}>Ir a Productos</button></p>}
          </div>
          : <ul className="soil-history" aria-label="Planes del lote, del más reciente al más antiguo">{planes.map((p, i) => (
            <li key={p.id || `sin-id-${i}`}><button className="lot-card soil-card" disabled={!p.id} title={p.id ? undefined : 'Registro sin identificador válido'} onClick={() => abrir('ver', p.id)}>
              <span className="lot-card-content">
                <strong>{p.nombre || 'Plan sin nombre'}</strong>
                <span>{p.metas.length} {p.metas.length === 1 ? 'meta' : 'metas'} · {p.lineas.length} con producto</span>
                <small>Creado el {fechaDeMarca(p.createdAt)} · {costoResumido(p)}</small>
                <span className="card-badges"><EstadoPlanBadge estado={p.estado} />{p.problemas.length > 0 && <span className="badge badge-error">Datos por corregir</span>}</span>
              </span>
              <span className="arrow" aria-hidden="true">›</span>
            </button></li>
          ))}</ul>
      )}
    </section>
  );
}
