import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
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
import { Glosario } from './components/Glosario';
import { Termino } from './components/Terminos';
import { SeguimientoSeccion } from './components/SeguimientoSeccion';
import { actualizarLote, db, eliminarLoteYRelacionados, leerEstadoNube, leerReferencias } from './lib/db';
import { alVolver, reemplazarPantalla, registrarPantalla, volverPantalla } from './lib/navegacion';
import { sesionVencida } from './lib/nube';
import { contarTareasPendientes } from './lib/validacionSeguimiento';
import { problemaLote } from './lib/validacion';
import { ErrorPersistencia } from './lib/repositorioAnalisis';
import { areaM2AHa } from './lib/calculos';
import { fechaLegible, formatearNumero, nombreCultivo } from './lib/formato';
import type { Lote } from './types';
import { confirmar } from './components/Confirmacion';

/** Conexión a internet del dispositivo, actualizada con los eventos online/offline. */
function useEnLinea(): boolean {
  return useSyncExternalStore(avisar => {
    window.addEventListener('online', avisar);
    window.addEventListener('offline', avisar);
    return () => { window.removeEventListener('online', avisar); window.removeEventListener('offline', avisar); };
  }, () => navigator.onLine);
}

type Vista = 'inicio' | 'nuevo' | 'editar' | 'detalle' | 'informe' | 'informe-general' | 'productos' | 'ayuda' | 'glosario';
interface Pantalla { vista: Vista; loteId: string | null }

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
  // Tareas pendientes de todos los lotes. Se cuentan al mostrar la pantalla (no dentro de la consulta)
  // para que "fecha pasada" use la fecha de hoy aunque la app haya quedado abierta desde ayer.
  const registros = useLiveQuery(() => db.registros.toArray(), []);
  const tareas = registros && lotes ? contarTareasPendientes(registros, new Set(lotes.map(l => l.id))) : undefined;
  const estadoNube = useLiveQuery(leerEstadoNube, [], null);
  // Reglas de las referencias técnicas (para ofrecer la zona del lote).
  // undefined mientras se lee; null si el dispositivo aún no descargó las referencias.
  const reglas = useLiveQuery(async () => (await leerReferencias())?.conjunto.reglasDosis ?? null, []);
  const enLinea = useEnLinea();

  /** Pantallas abiertas, en el mismo orden que el historial del navegador (para el botón "atrás"). */
  const pila = useRef<Pantalla[]>([{ vista: 'inicio', loteId: null }]);
  /** Aviso que se muestra al llegar a la pantalla (también cuando se llega con "atrás"). */
  const avisoPendiente = useRef<{ texto: string; error: boolean } | null>(null);

  function mostrar(p: Pantalla) {
    setVisita(n => n + 1);
    const aviso = avisoPendiente.current;
    avisoPendiente.current = null;
    setMensaje(aviso?.texto ?? '');
    setMensajeEsError(aviso?.error ?? false);
    setLoteId(p.loteId);
    setVista(p.vista);
  }

  useEffect(() => {
    reemplazarPantalla(pila.current[0]);
    alVolver(estado => {
      const p = estado as Partial<Pantalla> | null;
      if (pila.current.length > 1) pila.current.pop();
      mostrar(p?.vista ? { vista: p.vista, loteId: p.loteId ?? null } : pila.current.at(-1) ?? { vista: 'inicio', loteId: null });
    });
  }, []);

  /**
   * Cambia de pantalla. Si el destino es la pantalla anterior, equivale a "atrás" (así el historial
   * no se llena de pantallas repetidas). Con reemplazar, la pantalla actual no queda en el historial.
   */
  function ir(v: Vista, lote: string | null = loteId, { aviso, reemplazar = false }: { aviso?: { texto: string; error?: boolean }; reemplazar?: boolean } = {}) {
    const destino: Pantalla = { vista: v, loteId: lote };
    avisoPendiente.current = aviso ? { texto: aviso.texto, error: aviso.error ?? false } : null;
    const anterior = pila.current.at(-2);
    if (!reemplazar && anterior && anterior.vista === destino.vista && anterior.loteId === destino.loteId) {
      volverPantalla();
      return;
    }
    if (reemplazar) {
      pila.current[pila.current.length - 1] = destino;
      reemplazarPantalla(destino);
    } else {
      pila.current.push(destino);
      registrarPantalla(destino);
    }
    mostrar(destino);
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
        // Mismas reglas que la nube: un lote inválido no se sincronizaría.
        const problema = problemaLote(lote as unknown as Record<string, unknown>);
        if (problema) throw new ErrorPersistencia(`No se guardó: ${problema}`);
        await db.lotes.put(lote);
      }
      // Tras guardar, el formulario no queda en el historial: "atrás" desde la ficha vuelve a la lista.
      ir('detalle', id, { aviso: { texto: vista === 'editar' ? 'Los cambios del lote se guardaron.' : 'El lote se guardó.' }, reemplazar: vista === 'nuevo' });
    } finally {
      setGuardando(false);
    }
  }

  async function borrarLote() {
    if (!activo) return;
    if (!(await confirmar({ titulo: 'Eliminar lote', mensaje: `¿Eliminar “${activo.nombre}” y todos los datos asociados? Esta acción no se puede deshacer.`, boton: 'Eliminar', peligro: true }))) return;
    try {
      await eliminarLoteYRelacionados(activo.id);
      ir('inicio', null, { aviso: { texto: 'El lote se eliminó.' } });
    } catch {
      setMensaje('No se pudo eliminar el lote; vuelve a intentarlo.');
      setMensajeEsError(true);
    }
  }

  // Sin sesión no se puede usar la app. Con la sesión vencida y sin internet se deja seguir usándola
  // (los datos son del dispositivo); al volver la conexión hay que ingresar de nuevo.
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
      <Encabezado seccion={vista === 'productos' || vista === 'ayuda' ? vista : vista === 'glosario' ? 'ayuda' : 'inicio'} enRaiz={vista === 'inicio' || vista === 'productos' || vista === 'ayuda'} onIr={ir} estado={estadoNube} />

      <main className="container main-content">
        {vencida && <div role="status" className="notice notice-error"><span aria-hidden="true">!</span>Tu sesión venció. Puedes seguir trabajando sin internet; cuando tengas conexión tendrás que ingresar de nuevo para sincronizar.</div>}
        {mensaje && <div role={mensajeEsError ? 'alert' : 'status'} className={`notice ${mensajeEsError ? 'notice-error' : 'notice-ok'}`}><span aria-hidden="true">{mensajeEsError ? '!' : '✓'}</span>{mensaje}<button onClick={() => setMensaje('')} aria-label="Cerrar aviso">×</button></div>}

        {vista === 'inicio' && <>
          <section className="hero">
            <div className="hero-text">
              <div className="eyebrow">GRUPO 1 · PROTOTIPO ACADÉMICO</div>
              <h1>Tu cultivo, más organizado.</h1>
              <p>Registra tus lotes, el análisis de suelo y tus fertilizantes en un solo lugar. Según tu análisis de suelo, la app te propone cuánto fertilizar, qué fertilizantes con registro ICA usar, la cantidad y el costo, con cada operación explicada.</p>
              <button className="btn btn-light" onClick={() => ir('nuevo')}>+ Crear un lote</button>
            </div>
            <div className="hero-deco" aria-hidden="true"><div className="hill hill-one"/><div className="hill hill-two"/><span className="decor-sprout">✳</span></div>
          </section>
          <section className="stats" aria-label="Resumen de tus lotes">
            <div className="stat"><span>Lotes registrados</span><strong>{lotes?.length ?? '—'}</strong><small>Guardados en tu cuenta</small></div>
            <div className="stat"><span>Área total</span><strong>{lotes ? formatearNumero(totalArea) : '—'} <em>m²</em></strong><small>{lotes ? formatearNumero(totalArea / 10_000, 4) : '—'} ha</small></div>
            <div className="stat"><span>Tareas pendientes</span><strong>{tareas ? tareas.pendientes : '—'}</strong><small>{tareas?.vencidas ? `${tareas.vencidas} con la fecha pasada` : 'En todos tus lotes'}</small></div>
          </section>
          <section className="section-header"><div><div className="section-kicker">TU UNIDAD PRODUCTIVA</div><h2>Mis lotes</h2>{lotes?.length === 0 && <p>Crea un lote para comenzar a organizar la información de tu cultivo.</p>}</div><div className="detalle-botones">{!!lotes?.length && <button className="btn btn-outline" onClick={() => ir('informe-general')}>Informe de todos los lotes (PDF)</button>}<button className="btn btn-outline" onClick={() => ir('nuevo')}>+ Nuevo lote</button></div></section>
          {lotes === undefined ? <div className="empty"><p>Cargando tus lotes…</p></div>
            : lotes.length === 0 ? <div className="empty"><div className="empty-icon" aria-hidden="true">◎</div><h3>Aún no tienes lotes registrados</h3><p>Crea tu primer lote de papa para empezar a organizar su información.</p><button className="btn btn-primary" onClick={() => ir('nuevo')}>Crear mi primer lote</button></div>
            : <div className="lots-grid">{lotes.map(l => <button key={l.id} className="lot-card" onClick={() => ir('detalle', l.id)}>
              <span className="crop-icon" aria-hidden="true">{l.cultivo === 'papa' ? '●' : '✳'}</span><span className="lot-card-content"><strong>{l.nombre}</strong><span>{nombreCultivo(l.cultivo)} · {formatearNumero(l.areaM2)} m²</span><small>Siembra: {fechaLegible(l.fechaSiembra)}</small></span><span className="arrow" aria-hidden="true">›</span>
            </button>)}</div>}
          {estadoNube && <NubeSeccion estado={estadoNube} />}
        </>}

        {vista === 'nuevo' && <div className="page-narrow"><button className="back" onClick={() => ir('inicio')}>← Volver a mis lotes</button><LoteForm reglas={reglas ?? undefined} onGuardar={guardarLote} onCancelar={() => ir('inicio')} /></div>}
        {vista === 'editar' && activo && <div className="page-narrow"><button className="back" onClick={() => ir('detalle')}>← Volver al lote</button><LoteForm inicial={activo} reglas={reglas ?? undefined} onGuardar={guardarLote} onCancelar={() => ir('detalle')} /></div>}
        {vista === 'detalle' && activo && <>
          <button className="back" onClick={() => ir('inicio')}>← Volver a mis lotes</button>
          <section className="detail-header"><div><div className="section-kicker">FICHA DEL LOTE</div><h1>{activo.nombre}</h1><p>{nombreCultivo(activo.cultivo)} · {activo.ubicacion || 'Ubicación no registrada'}{activo.zona ? ` · Zona: ${activo.zona}` : ''}</p></div><div className="detalle-botones"><button className="btn btn-primary" onClick={() => ir('informe')}>Informe para el productor</button><button className="btn btn-outline" onClick={() => ir('editar')}>Editar información</button></div></section>
          <div className="detail-grid"><div className="detail-panel"><span>Superficie</span><strong>{formatearNumero(activo.areaM2)} m²</strong><small>{formatearNumero(areaM2AHa(activo.areaM2), 4)} hectáreas</small></div><div className="detail-panel"><span>Cultivo</span><strong>{nombreCultivo(activo.cultivo)}</strong><small>Cultivo actual del lote</small></div><div className="detail-panel"><span>Fecha de siembra</span><strong className="detail-date">{fechaLegible(activo.fechaSiembra)}</strong></div></div>
          <AnalisisSueloSeccion key={activo.id} lote={activo} />
          <PlanesSeccion key={`plan-${activo.id}`} lote={activo} onIrAProductos={() => ir('productos')} />
          <SeguimientoSeccion key={`seg-${activo.id}`} lote={activo} />
          <HistorialLoteSeccion key={`hist-${activo.id}`} lote={activo} />
          <button className="danger-link" onClick={() => void borrarLote()}>Eliminar este lote</button>
        </>}

        {vista === 'informe' && activo && <InformeLote lote={activo} onVolver={() => ir('detalle')} />}
        {vista === 'informe-general' && <InformeGeneral usuario={estadoNube.usuario.nombre ? `${estadoNube.usuario.nombre} (${estadoNube.usuario.email})` : saludoDe(estadoNube.usuario)} onVolver={() => ir('inicio')} />}
        {vista === 'productos' && <ProductosSeccion key={visita} />}

        {vista === 'ayuda' && <div className="page-narrow help"><div className="section-kicker">GUÍA PARA EL PRODUCTOR</div><h1>Cómo funciona AgroFerti MIC</h1><p className="muted">Organiza la información de tus lotes y registra lo que realmente pasa en el campo. Funciona en el celular y en el computador, también sin internet.</p>
          <div className="ayuda-glosario"><p>¿Hay una palabra que no entiendes? El glosario explica cada término de la app.</p><button className="btn btn-outline" onClick={() => ir('glosario')}>Abrir el glosario</button></div>
          <div className="help-item"><span>1</span><div><h3>Crea tus lotes</h3><p>En <strong>Mis lotes</strong>, registra cada terreno con su nombre, cultivo, área, fecha de siembra y ubicación.</p></div></div>
          <div className="help-item"><span>2</span><div><h3>Registra el análisis de suelo</h3><p>En la ficha del lote, adjunta el informe del laboratorio o copia sus resultados tal como aparecen. Si el informe trae la <Termino id="profundidad">profundidad de muestreo</Termino> y la <Termino id="densidad-aparente">densidad aparente</Termino>, la app también expresa cada resultado en kilos por hectárea de la <Termino id="capa-arable">capa arable</Termino>. Esos kilos no son una dosis.</p></div></div>
          <div className="help-item"><span>3</span><div><h3>Prepara el plan de fertilización</h3><p>En la ficha del lote, crea una propuesta de plan: la app te propone las metas de nitrógeno, fósforo y potasio según tu análisis de suelo y la zona, y te sugiere fertilizantes con registro ICA para cubrirlas. Con eso calcula cuánto aplicar, cuántos bultos y cuánto cuesta. Puedes cambiar todo antes de guardar; después, el plan se revisa y se aprueba.</p></div></div>
          <div className="help-item"><span>4</span><div><h3>Haz seguimiento</h3><p>Registra lo que aplicaste, tus observaciones y las tareas pendientes. La app compara lo aplicado con el plan aprobado.</p></div></div>
          <div className="help-item"><span>5</span><div><h3>Cierra el ciclo e imprime</h3><p>Al cosechar, cierra el ciclo en el <strong>historial del lote</strong> para empezar un nuevo ciclo sin perder lo anterior. Imprime o guarda en PDF el informe de un lote o el de todos tus lotes.</p></div></div>
          <div className="info-box"><strong>Tus datos:</strong> se guardan en este dispositivo y en tu cuenta en la nube (con tu autorización), así no se pierden si cambias de dispositivo. La app funciona sin internet y se sincroniza cuando hay conexión. Para tenerlos en papel o en PDF, usa <strong>Informe para el productor</strong> en la ficha de cada lote. Puedes borrar tus datos de la nube en <strong>Mi cuenta</strong>, en Mis lotes.</div>
          <div className="detalle-botones"><button className="btn btn-primary" onClick={() => ir('inicio')}>Ir a mis lotes</button><button className="btn btn-outline" onClick={() => ir('glosario')}>Abrir el glosario</button></div>
        </div>}
        {vista === 'glosario' && <Glosario onVolver={() => ir('ayuda')} />}
        {((vista === 'editar' || vista === 'detalle' || vista === 'informe') && !activo) && <div className="empty"><p>Selecciona un lote para continuar.</p><button className="btn btn-primary" onClick={() => ir('inicio')}>Ver mis lotes</button></div>}
      </main>
      <footer className="footer"><div className="container footer-inner"><span>AgroFerti MIC · Grupo 1 · SENA</span><span>Prototipo educativo</span></div></footer>
    </div>
  );
}
