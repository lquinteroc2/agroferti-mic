import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnalisisSueloSeccion } from './components/AnalisisSueloSeccion';
import { LoteForm, type DatosLote } from './components/LoteForm';
import { db, eliminarLoteYRelacionados } from './lib/db';
import { areaM2AHa } from './lib/calculos';
import { fechaLegible, formatearNumero } from './lib/formato';
import { CULTIVOS, type Lote } from './types';

type Vista = 'inicio' | 'nuevo' | 'editar' | 'detalle' | 'ayuda';

function nombreCultivo(codigo: string) {
  return CULTIVOS.find(c => c.value === codigo)?.label.replace(' (piloto)', '') ?? codigo;
}

function Logo() {
  return <span className="brand-symbol" aria-hidden="true">
    <svg viewBox="0 0 64 64" fill="none"><path d="M31 47C16 43 12 22 21 14c11 3 19 12 18 23M31 46c6-19 17-23 25-24-1 13-8 24-25 24" fill="#b3df9d"/><path d="M31 50V27" stroke="#fff" strokeWidth="4" strokeLinecap="round"/></svg>
  </span>;
}

export default function App() {
  const [vista, setVista] = useState<Vista>('inicio');
  const [loteId, setLoteId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [mensajeEsError, setMensajeEsError] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const lotes = useLiveQuery(() => db.lotes.orderBy('createdAt').reverse().toArray(), []);
  const activo = lotes?.find(l => l.id === loteId);
  const totalArea = (lotes ?? []).reduce((sum, l) => sum + l.areaM2, 0);
  const totalCultivos = new Set((lotes ?? []).map(l => l.cultivo)).size;

  function ir(v: Vista) {
    setMensaje('');
    setMensajeEsError(false);
    setVista(v);
  }

  async function guardarLote(datos: DatosLote) {
    if (guardando) return;
    setGuardando(true);
    try {
      const ahora = new Date().toISOString();
      const id = vista === 'editar' && activo ? activo.id : crypto.randomUUID();
      const lote: Lote = {
        ...datos,
        id,
        createdAt: vista === 'editar' && activo ? activo.createdAt : ahora,
        updatedAt: ahora
      };
      await db.lotes.put(lote);
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="container topbar-inner">
          <button className="brand" type="button" onClick={() => ir('inicio')} aria-label="Ir al inicio de AgroFerti MIC">
            <Logo />
            <span><strong>AgroFerti <em>MIC</em></strong><small>Fertilización y seguimiento</small></span>
          </button>
          <nav className="nav" aria-label="Navegación principal">
            <button className={vista === 'ayuda' ? 'nav-link' : 'nav-link selected'} onClick={() => ir('inicio')}>Mis lotes</button>
            <button className={vista === 'ayuda' ? 'nav-link selected' : 'nav-link'} onClick={() => ir('ayuda')}>Cómo funciona</button>
          </nav>
        </div>
      </header>

      <main className="container main-content">
        {mensaje && <div role={mensajeEsError ? 'alert' : 'status'} className={`notice ${mensajeEsError ? 'notice-error' : 'notice-ok'}`}><span aria-hidden="true">{mensajeEsError ? '!' : '✓'}</span>{mensaje}<button onClick={() => setMensaje('')} aria-label="Cerrar aviso">×</button></div>}

        {vista === 'inicio' && <>
          <section className="hero">
            <div className="hero-text">
              <div className="eyebrow">GRUPO 1 · PROTOTIPO ACADÉMICO</div>
              <h1>Tu cultivo, más organizado.</h1>
              <p>Registra tus lotes en un solo lugar. Pronto podrás calcular aportes de fertilizantes y llevar el historial de cada aplicación, con resultados fáciles de entender.</p>
              <button className="btn btn-light" onClick={() => ir('nuevo')}>+ Crear un lote</button>
            </div>
            <div className="hero-deco" aria-hidden="true"><div className="hill hill-one"/><div className="hill hill-two"/><span className="decor-sprout">✳</span></div>
          </section>
          <section className="stats" aria-label="Resumen de tus lotes">
            <div className="stat"><span>Lotes registrados</span><strong>{lotes?.length ?? '—'}</strong><small>En este dispositivo</small></div>
            <div className="stat"><span>Área total</span><strong>{lotes ? formatearNumero(totalArea) : '—'} <em>m²</em></strong><small>{lotes ? formatearNumero(totalArea / 10_000, 4) : '—'} ha</small></div>
            <div className="stat"><span>Cultivos diferentes</span><strong>{lotes ? totalCultivos : '—'}</strong><small>Estructura multicultivo</small></div>
          </section>
          <section className="section-header"><div><div className="section-kicker">TU UNIDAD PRODUCTIVA</div><h2>Mis lotes</h2><p>Crea un lote para comenzar a organizar la información de tu cultivo.</p></div><button className="btn btn-outline" onClick={() => ir('nuevo')}>+ Nuevo lote</button></section>
          {lotes === undefined ? <div className="empty"><p>Cargando tus lotes…</p></div>
            : lotes.length === 0 ? <div className="empty"><div className="empty-icon" aria-hidden="true">◎</div><h3>Aún no tienes lotes registrados</h3><p>Comienza con tu cultivo de papa o el que estés trabajando. Puedes añadir más cultivos después.</p><button className="btn btn-primary" onClick={() => ir('nuevo')}>Crear mi primer lote</button></div>
            : <div className="lots-grid">{lotes.map(l => <button key={l.id} className="lot-card" onClick={() => { setLoteId(l.id); ir('detalle'); }}>
              <span className="crop-icon" aria-hidden="true">{l.cultivo === 'papa' ? '●' : '✳'}</span><span className="lot-card-content"><strong>{l.nombre}</strong><span>{nombreCultivo(l.cultivo)} · {formatearNumero(l.areaM2)} m²</span><small>Siembra: {fechaLegible(l.fechaSiembra)}</small></span><span className="arrow" aria-hidden="true">›</span>
            </button>)}</div>}
          <div className="privacy-banner"><strong>Datos privados en tu navegador</strong><p>Esta fase guarda la información localmente. Todavía no hay sincronización ni copia de seguridad automática. No borres los datos del sitio hasta habilitar los respaldos del MVP.</p></div>
        </>}

        {vista === 'nuevo' && <div className="page-narrow"><button className="back" onClick={() => ir('inicio')}>← Volver a mis lotes</button><LoteForm onGuardar={guardarLote} onCancelar={() => ir('inicio')} /></div>}
        {vista === 'editar' && activo && <div className="page-narrow"><button className="back" onClick={() => ir('detalle')}>← Volver al lote</button><LoteForm inicial={activo} onGuardar={guardarLote} onCancelar={() => ir('detalle')} /></div>}
        {vista === 'detalle' && activo && <>
          <button className="back" onClick={() => ir('inicio')}>← Volver a mis lotes</button>
          <section className="detail-header"><div><div className="section-kicker">FICHA DEL LOTE</div><h1>{activo.nombre}</h1><p>{nombreCultivo(activo.cultivo)} · {activo.ubicacion || 'Ubicación no registrada'}</p></div><button className="btn btn-outline" onClick={() => ir('editar')}>Editar información</button></section>
          <div className="detail-grid"><div className="detail-panel"><span>Superficie</span><strong>{formatearNumero(activo.areaM2)} m²</strong><small>{formatearNumero(areaM2AHa(activo.areaM2), 4)} hectáreas</small></div><div className="detail-panel"><span>Cultivo</span><strong>{nombreCultivo(activo.cultivo)}</strong><small>Sin dosis precargadas</small></div><div className="detail-panel"><span>Fecha de siembra</span><strong className="detail-date">{fechaLegible(activo.fechaSiembra)}</strong><small>Registrada por productor</small></div></div>
          <section className="workflow"><div className="section-kicker">CÓMO SE USA</div><h2>Tres pasos para manejar tu cultivo</h2><div className="workflow-grid">
            <div className="workflow-step ready"><div className="step-number">01</div><h3>Crear el lote</h3><p>Datos del área, ubicación y cultivo.</p><span className="tag ready-tag">Disponible</span></div>
            <div className="workflow-step ready"><div className="step-number">02</div><h3>Registrar el suelo</h3><p>Análisis de laboratorio y equivalencias explicadas. El plan con fertilizantes llegará después.</p><span className="tag ready-tag">Análisis disponible</span></div>
            <div className="workflow-step"><div className="step-number">03</div><h3>Hacer seguimiento</h3><p>Registrar aplicaciones, costos y observaciones.</p><span className="tag">Fase siguiente</span></div>
          </div></section>
          <AnalisisSueloSeccion key={activo.id} lote={activo} />
          <div className="info-box"><strong>Importante:</strong> esta versión no prescribe fertilizantes. Las dosis requieren un objetivo nutricional técnico respaldado por un análisis agronómico. Convertir ppm a kg/ha no determina automáticamente una dosis.</div>
          <button className="danger-link" onClick={() => void borrarLote()}>Eliminar este lote</button>
        </>}

        {vista === 'ayuda' && <div className="page-narrow help"><div className="section-kicker">GUÍA PARA EL PRODUCTOR</div><h1>Cómo funciona AgroFerti MIC</h1><p className="muted">El objetivo es que productores de distintos cultivos comprendan sus datos de fertilización y puedan registrar lo que realmente ocurre en el lote.</p>
          <div className="help-item"><span>1</span><div><h3>Registra el lote</h3><p>Indica cultivo, área, fecha de siembra y ubicación. Eso ya funciona en esta versión.</p></div></div>
          <div className="help-item"><span>2</span><div><h3>Registra el suelo y prepara el plan</h3><p>Ya puedes registrar análisis de suelo en la ficha de cada lote y ver sus equivalencias explicadas. En la siguiente fase se registrarán productos con sus etiquetas. Para calcular una dosis será indispensable una meta nutricional validada; la aplicación explicará la operación.</p></div></div>
          <div className="help-item"><span>3</span><div><h3>Monitorea lo realizado</h3><p>En fases posteriores registrarás aplicaciones, cantidades, responsables, costos y observaciones. No hacen falta sensores para registrar estos datos manualmente.</p></div></div>
          <div className="info-box"><strong>Nota de privacidad:</strong> el almacenamiento es local. No está conectado a una nube ni permite acceder a los mismos datos desde otro teléfono.</div>
          <button className="btn btn-primary" onClick={() => ir('inicio')}>Ir a mis lotes</button>
        </div>}
        {((vista === 'editar' || vista === 'detalle') && !activo) && <div className="empty"><p>Selecciona un lote para continuar.</p><button className="btn btn-primary" onClick={() => ir('inicio')}>Ver mis lotes</button></div>}
      </main>
      <footer className="footer"><div className="container footer-inner"><span>AgroFerti MIC · Grupo 1 · SENA</span><span>Prototipo educativo · Fase 2</span></div></footer>
    </div>
  );
}
