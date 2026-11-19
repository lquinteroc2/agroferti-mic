import { useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnalisisSueloSeccion } from './components/AnalisisSueloSeccion';
import { HistorialLoteSeccion } from './components/HistorialLoteSeccion';
import { Encabezado, Logo, saludoDe } from './components/Encabezado';
import { InformeGeneral } from './components/InformeGeneral';
import { InformeLote } from './components/InformeLote';
import { LoteForm, type DatosLote } from './components/LoteForm';
import { PlanesSeccion } from './components/PlanesSeccion';
import { ProductosSeccion } from './components/ProductosSeccion';
import { NubeSeccion } from './components/NubeSeccion';
import { PantallaIngreso } from './components/PantallaIngreso';
import { SeguimientoSeccion } from './components/SeguimientoSeccion';
import { actualizarLote, db, eliminarLoteYRelacionados, leerEstadoNube } from './lib/db';
import { sesionVencida } from './lib/nube';
import { areaM2AHa } from './lib/calculos';
import { fechaLegible, formatearNumero, nombreCultivo } from './lib/formato';
import type { Lote } from './types';

/** Conexión a internet del dispositivo, actualizada con los eventos online/offline. */
function useEnLinea(): boolean {
  return useSyncExternalStore(avisar => {
    window.addEventListener('online', avisar);
    window.addEventListener('offline', avisar);
    return () => { window.removeEventListener('online', avisar); window.removeEventListener('offline', avisar); };
  }, () => navigator.onLine);
}

type Vista = 'inicio' | 'nuevo' | 'editar' | 'detalle' | 'informe' | 'informe-general' | 'productos' | 'ayuda';

export default function App() {
  const [vista, setVista] = useState<Vista>('inicio');
  const [loteId, setLoteId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [mensajeEsError, setMensajeEsError] = useState(false);
  const [guardando, setGuardando] = useState(false);
  /** Cambia en cada navegación: el catálogo vuelve a su lista al pulsar "Productos" aunque ya esté abierto. */
  const [visita, setVisita] = useState(0);
  const lotes = useLiveQuery(() => db.lotes.orderBy('createdAt').reverse().toArray(), []);
  const activo = lotes?.find(l => l.id === loteId);
  const totalArea = (lotes ?? []).reduce((sum, l) => sum + l.areaM2, 0);
  const totalCultivos = new Set((lotes ?? []).map(l => l.cultivo)).size;
  const estadoNube = useLiveQuery(leerEstadoNube, [], null);
  const enLinea = useEnLinea();

  function ir(v: Vista) {
    setVisita(n => n + 1);
    setMensaje('');
    setMensajeEsError(false);
    setVista(v);
  }

  async function guardarLote(datos: DatosLote, versionInicial?: string) {
    if (guardando) return;
    setGuardando(true);
    try {
      const ahora = new Date().toISOString();
      let id: string;
      if (vista === 'editar' && activo) {
        id = activo.id;
        await actualizarLote(id, datos, versionInicial);
      } else {
        id = crypto.randomUUID();
        const lote: Lote = { ...datos, id, createdAt: ahora, updatedAt: ahora };
        await db.lotes.put(lote);
      }
      setLoteId(id);
      setMensaje(vista === 'editar' ? 'Los cambios del lote se guardaron.' : 'El lote se guardó en este dispositivo.');
      setVista('detalle');
    } finally {
      setGuardando(false);
    }
  }

  async function borrarLote() {
    if (!activo) return;
    if (!window.confirm(`¿Eliminar “${activo.nombre}” y todos los datos asociados? Esta acción no se puede deshacer.`)) return;
    try {
      await eliminarLoteYRelacionados(activo.id);
      setLoteId(null);
      setVista('inicio');
      setMensaje('El lote se eliminó.');
    } catch {
      setMensaje('No se pudo eliminar el lote; vuelve a intentarlo.');
      setMensajeEsError(true);
    }
  }

  // Sin sesión no se puede usar la app. Con la sesión vencida y sin internet se deja seguir usándola
  // (los datos son del teléfono); al volver la conexión hay que ingresar de nuevo.
  const vencida = !!estadoNube?.token && sesionVencida(estadoNube);
  const sesionActiva = !!estadoNube?.token && (!vencida || !enLinea);
  if (estadoNube === null || !sesionActiva) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <div className="container topbar-inner">
            <span className="brand"><Logo /><span><strong>AgroFerti <em>MIC</em></strong><small>Fertilización y seguimiento</small></span></span>
          </div>
        </header>
        <main className="container main-content">
          {estadoNube === null ? <div className="empty"><p>Cargando…</p></div> : <PantallaIngreso estado={estadoNube} enLinea={enLinea} />}
        </main>
        <footer className="footer"><div className="container footer-inner"><span>AgroFerti MIC · Grupo 1 · SENA</span><span>Prototipo educativo</span></div></footer>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Encabezado seccion={vista === 'productos' || vista === 'ayuda' ? vista : 'inicio'} onIr={ir} estado={estadoNube} />

      <main className="container main-content">
        {vencida && <div role="status" className="notice notice-error"><span aria-hidden="true">!</span>Tu sesión venció. Puedes seguir trabajando sin internet; cuando tengas conexión tendrás que ingresar de nuevo para sincronizar.</div>}
        {mensaje && <div role={mensajeEsError ? 'alert' : 'status'} className={`notice ${mensajeEsError ? 'notice-error' : 'notice-ok'}`}><span aria-hidden="true">{mensajeEsError ? '!' : '✓'}</span>{mensaje}<button onClick={() => setMensaje('')} aria-label="Cerrar aviso">×</button></div>}

        {vista === 'inicio' && <>
          <section className="hero">
            <div className="hero-text">
              <div className="eyebrow">GRUPO 1 · PROTOTIPO ACADÉMICO</div>
              <h1>Tu cultivo, más organizado.</h1>
              <p>Registra tus lotes, el análisis de suelo y tus fertilizantes en un solo lugar. Calcula la cantidad y el costo de producto para las metas que valida tu fuente técnica, con cada operación explicada.</p>
              <button className="btn btn-light" onClick={() => ir('nuevo')}>+ Crear un lote</button>
            </div>
            <div className="hero-deco" aria-hidden="true"><div className="hill hill-one"/><div className="hill hill-two"/><span className="decor-sprout">✳</span></div>
          </section>
          <section className="stats" aria-label="Resumen de tus lotes">
            <div className="stat"><span>Lotes registrados</span><strong>{lotes?.length ?? '—'}</strong><small>En este dispositivo</small></div>
            <div className="stat"><span>Área total</span><strong>{lotes ? formatearNumero(totalArea) : '—'} <em>m²</em></strong><small>{lotes ? formatearNumero(totalArea / 10_000, 4) : '—'} ha</small></div>
            <div className="stat"><span>Cultivos diferentes</span><strong>{lotes ? totalCultivos : '—'}</strong><small>Estructura multicultivo</small></div>
          </section>
          <section className="section-header"><div><div className="section-kicker">TU UNIDAD PRODUCTIVA</div><h2>Mis lotes</h2><p>Crea un lote para comenzar a organizar la información de tu cultivo.</p></div><div className="detalle-botones">{!!lotes?.length && <button className="btn btn-outline" onClick={() => ir('informe-general')}>Informe de todos los lotes (PDF)</button>}<button className="btn btn-outline" onClick={() => ir('nuevo')}>+ Nuevo lote</button></div></section>
          {lotes === undefined ? <div className="empty"><p>Cargando tus lotes…</p></div>
            : lotes.length === 0 ? <div className="empty"><div className="empty-icon" aria-hidden="true">◎</div><h3>Aún no tienes lotes registrados</h3><p>Comienza con tu cultivo de papa o el que estés trabajando. Puedes añadir más cultivos después.</p><button className="btn btn-primary" onClick={() => ir('nuevo')}>Crear mi primer lote</button></div>
            : <div className="lots-grid">{lotes.map(l => <button key={l.id} className="lot-card" onClick={() => { setLoteId(l.id); ir('detalle'); }}>
              <span className="crop-icon" aria-hidden="true">{l.cultivo === 'papa' ? '●' : '✳'}</span><span className="lot-card-content"><strong>{l.nombre}</strong><span>{nombreCultivo(l.cultivo)} · {formatearNumero(l.areaM2)} m²</span><small>Siembra: {fechaLegible(l.fechaSiembra)}</small></span><span className="arrow" aria-hidden="true">›</span>
            </button>)}</div>}
          {estadoNube && <NubeSeccion estado={estadoNube} />}
        </>}

        {vista === 'nuevo' && <div className="page-narrow"><button className="back" onClick={() => ir('inicio')}>← Volver a mis lotes</button><LoteForm onGuardar={guardarLote} onCancelar={() => ir('inicio')} /></div>}
        {vista === 'editar' && activo && <div className="page-narrow"><button className="back" onClick={() => ir('detalle')}>← Volver al lote</button><LoteForm inicial={activo} onGuardar={guardarLote} onCancelar={() => ir('detalle')} /></div>}
        {vista === 'detalle' && activo && <>
          <button className="back" onClick={() => ir('inicio')}>← Volver a mis lotes</button>
          <section className="detail-header"><div><div className="section-kicker">FICHA DEL LOTE</div><h1>{activo.nombre}</h1><p>{nombreCultivo(activo.cultivo)} · {activo.ubicacion || 'Ubicación no registrada'}</p></div><div className="detalle-botones"><button className="btn btn-primary" onClick={() => ir('informe')}>Informe para el productor</button><button className="btn btn-outline" onClick={() => ir('editar')}>Editar información</button></div></section>
          <div className="detail-grid"><div className="detail-panel"><span>Superficie</span><strong>{formatearNumero(activo.areaM2)} m²</strong><small>{formatearNumero(areaM2AHa(activo.areaM2), 4)} hectáreas</small></div><div className="detail-panel"><span>Cultivo</span><strong>{nombreCultivo(activo.cultivo)}</strong><small>Sin dosis precargadas</small></div><div className="detail-panel"><span>Fecha de siembra</span><strong className="detail-date">{fechaLegible(activo.fechaSiembra)}</strong><small>Registrada por productor</small></div></div>
          <section className="workflow"><div className="section-kicker">CÓMO SE USA</div><h2>Tres pasos para manejar tu cultivo</h2><div className="workflow-grid">
            <div className="workflow-step ready"><div className="step-number">01</div><h3>Crear el lote</h3><p>Datos del área, ubicación y cultivo.</p><span className="tag ready-tag">Disponible</span></div>
            <div className="workflow-step ready"><div className="step-number">02</div><h3>Suelo y plan</h3><p>Análisis de laboratorio con equivalencias explicadas y plan de fertilización con metas de tu fuente técnica.</p><span className="tag ready-tag">Disponible</span></div>
            <div className="workflow-step ready"><div className="step-number">03</div><h3>Hacer seguimiento</h3><p>Aplicaciones de un plan aprobado, observaciones y tareas, con fecha y responsable.</p><span className="tag ready-tag">Disponible</span></div>
          </div></section>
          <AnalisisSueloSeccion key={activo.id} lote={activo} />
          <PlanesSeccion key={`plan-${activo.id}`} lote={activo} onIrAProductos={() => ir('productos')} />
          <SeguimientoSeccion key={`seg-${activo.id}`} lote={activo} />
          <HistorialLoteSeccion key={`hist-${activo.id}`} lote={activo} />
          <div className="info-box"><strong>Importante:</strong> esta versión no prescribe fertilizantes: solo calcula la cantidad de producto para las metas que escribes con su fuente técnica. Las dosis requieren un objetivo nutricional técnico respaldado por un análisis agronómico. Convertir ppm a kg/ha no determina automáticamente una dosis.</div>
          <button className="danger-link" onClick={() => void borrarLote()}>Eliminar este lote</button>
        </>}

        {vista === 'informe' && activo && <InformeLote lote={activo} onVolver={() => ir('detalle')} />}
        {vista === 'informe-general' && <InformeGeneral usuario={estadoNube.usuario.nombre ? `${estadoNube.usuario.nombre} (${estadoNube.usuario.email})` : saludoDe(estadoNube.usuario)} onVolver={() => ir('inicio')} />}
        {vista === 'productos' && <ProductosSeccion key={visita} />}

        {vista === 'ayuda' && <div className="page-narrow help"><div className="section-kicker">GUÍA PARA EL PRODUCTOR</div><h1>Cómo funciona AgroFerti MIC</h1><p className="muted">El objetivo es que productores de distintos cultivos comprendan sus datos de fertilización y puedan registrar lo que realmente ocurre en el lote.</p>
          <div className="help-item"><span>1</span><div><h3>Registra el lote</h3><p>Indica cultivo, área, fecha de siembra y ubicación. Eso ya funciona en esta versión.</p></div></div>
          <div className="help-item"><span>2</span><div><h3>Registra el suelo y prepara el plan</h3><p>Ya puedes registrar análisis de suelo en la ficha de cada lote y ver sus equivalencias explicadas. En <strong>Productos</strong> registras los fertilizantes tal como aparecen en su etiqueta, y en la ficha del lote preparas el plan: escribes cada meta nutricional con su fuente técnica y fecha, eliges el producto y la aplicación explica la cantidad y el costo. La app no propone metas ni convierte entre formas químicas.</p></div></div>
          <div className="help-item"><span>3</span><div><h3>Monitorea lo realizado</h3><p>En fases posteriores registrarás aplicaciones, cantidades, responsables, costos y observaciones. No hacen falta sensores para registrar estos datos manualmente.</p></div></div>
          <div className="info-box"><strong>Tus datos:</strong> se guardan en este teléfono y en tu cuenta en la nube (con tu autorización), así no se pierden si cambias de teléfono. La app funciona sin internet y se sincroniza cuando hay conexión. Para tenerlos en papel o en PDF, usa <strong>Informe para el productor</strong> en la ficha de cada lote. Puedes borrar tus datos de la nube en <strong>Mi cuenta</strong>, en Mis lotes.</div>
          <button className="btn btn-primary" onClick={() => ir('inicio')}>Ir a mis lotes</button>
        </div>}
        {((vista === 'editar' || vista === 'detalle' || vista === 'informe') && !activo) && <div className="empty"><p>Selecciona un lote para continuar.</p><button className="btn btn-primary" onClick={() => ir('inicio')}>Ver mis lotes</button></div>}
      </main>
      <footer className="footer"><div className="container footer-inner"><span>AgroFerti MIC · Grupo 1 · SENA</span><span>Prototipo educativo · Fases 1 a 5</span></div></footer>
    </div>
  );
}
