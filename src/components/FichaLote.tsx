import { useEffect } from 'react';
import { AnalisisSueloSeccion } from './AnalisisSueloSeccion';
import { confirmar } from './Confirmacion';
import { HistorialLoteSeccion } from './HistorialLoteSeccion';
import { BarraPasos, ListaPasos } from './PasosLote';
import { PlanesSeccion } from './PlanesSeccion';
import { SeguimientoSeccion } from './SeguimientoSeccion';
import { Terminos } from './Terminos';
import { nombrePaso, pasoActual, posicionPaso, type AvanceLote, type EtiquetaPaso, type IdPaso } from '../lib/avance';
import { hayFormularioAbierto } from '../lib/navegacion';
import { areaM2AHa } from '../lib/calculos';
import { fechaLegible, formatearNumero, nombreCultivo } from '../lib/formato';
import type { Lote } from '../types';

/** Título de cada paso (lo ponen las secciones): recibe el foco al abrir el paso. */
const TITULO_DE_PASO: Record<IdPaso, string> = {
  lote: 'titulo-datos-lote', analisis: 'titulo-suelo', plan: 'titulo-planes', aplicar: 'titulo-seguimiento', cosechar: 'titulo-historial'
};

interface Props {
  lote: Lote;
  /** undefined mientras se leen los datos del lote. */
  avance: AvanceLote | undefined;
  /** Paso abierto; undefined muestra la vista general con los cinco pasos. */
  paso: IdPaso | undefined;
  /** Abre un paso. Con `vecino`, se pasa al paso anterior o siguiente sin dejar el actual en el historial. */
  onPaso: (paso: IdPaso, vecino?: boolean) => void;
  /** Vuelve a la vista general del lote. */
  onGeneral: () => void;
  onVolver: () => void;
  onEditar: () => void;
  onInforme: () => void;
  onEliminar: () => void;
  onIrAProductos: () => void;
}

/**
 * Ficha del lote en dos niveles, en la misma pantalla:
 * - Vista general: los cinco pasos del cultivo en una lista, con su estado, lo registrado en cada uno y
 *   el paso en que va el lote destacado con qué hacer.
 * - Un paso a la vez: su propio contenedor con "Paso N de 5", qué hacer y botones al anterior y al siguiente.
 * Ningún paso se bloquea: se puede abrir cualquiera para revisarlo.
 */
export function FichaLote(props: Props) {
  const { lote, avance, paso } = props;

  // Al abrir un paso (o volver a la vista general) se empieza arriba y el foco va al título.
  useEffect(() => {
    window.scrollTo(0, 0);
    const titulo = document.getElementById(paso ? TITULO_DE_PASO[paso] : 'titulo-ficha');
    if (titulo) {
      if (!titulo.hasAttribute('tabindex')) titulo.setAttribute('tabindex', '-1');
      titulo.focus({ preventScroll: true });
    }
  }, [paso, lote.id, !avance]);

  if (!avance) return <>
    <button className="back" onClick={props.onVolver}>← Volver a mis lotes</button>
    <div className="empty"><p>Cargando el lote…</p></div>
  </>;
  return paso ? <PasoAbierto {...props} avance={avance} paso={paso} /> : <VistaGeneral {...props} avance={avance} />;
}

function VistaGeneral({ lote, avance, onPaso, onVolver, onInforme }: Props & { avance: AvanceLote }) {
  const resumenLote = `${nombreCultivo(lote.cultivo)} · ${formatearNumero(lote.areaM2)} m² · ${lote.fechaSiembra ? `siembra el ${fechaLegible(lote.fechaSiembra).toLowerCase()}` : 'sin fecha de siembra'}`;
  return <>
    <button className="back" onClick={onVolver}>← Volver a mis lotes</button>
    <section className="ficha-encabezado" aria-labelledby="titulo-ficha">
      <div>
        <div className="section-kicker">FICHA DEL LOTE</div>
        <h1 id="titulo-ficha">{lote.nombre}</h1>
        <p>{nombreCultivo(lote.cultivo)} · {formatearNumero(lote.areaM2)} m²{lote.departamento ? ` · ${lote.departamento}` : ''}</p>
      </div>
      <button className="btn btn-outline" onClick={onInforme}>Informe para el productor</button>
    </section>
    <section className="pasos-cultivo" aria-labelledby="titulo-pasos-cultivo">
      <h2 id="titulo-pasos-cultivo">Los 5 pasos del cultivo</h2>
      <p className="muted">Elige un paso para abrirlo. El que dice <strong>Ahora</strong> es el que te toca.</p>
      <ListaPasos avance={avance} resumenLote={resumenLote} onAbrir={p => onPaso(p)} />
    </section>
  </>;
}

/** Antes de salir del paso con un formulario abierto, pregunta: lo escrito se perdería. */
async function puedeSalir(): Promise<boolean> {
  return !hayFormularioAbierto() || confirmar({
    titulo: 'Salir sin guardar',
    mensaje: 'Tienes un formulario abierto en este paso. Si sales ahora, lo que escribiste y no guardaste se pierde.',
    boton: 'Salir sin guardar',
    peligro: true
  });
}

function PasoAbierto({ lote, avance, paso, onPaso, onGeneral: irAGeneral, onEditar, onInforme, onEliminar, onIrAProductos }: Props & { avance: AvanceLote; paso: IdPaso }) {
  const vecino = async (p: IdPaso) => { if (await puedeSalir()) onPaso(p, true); };
  const onGeneral = async () => { if (await puedeSalir()) irAGeneral(); };
  return <div className="paso-abierto">
    <button className="back" onClick={onGeneral}>← {lote.nombre}: todos los pasos</button>
    <BarraPasos avance={avance} visto={paso} />
    <GuiaPaso avance={avance} visto={paso} onElegir={vecino} />
    {paso === 'lote' && <DatosLote lote={lote} onEditar={onEditar} onInforme={onInforme} onEliminar={onEliminar} />}
    {paso === 'analisis' && <AnalisisSueloSeccion key={lote.id} lote={lote} />}
    {paso === 'plan' && <PlanesSeccion key={`plan-${lote.id}`} lote={lote} onIrAProductos={onIrAProductos} />}
    {paso === 'aplicar' && <SeguimientoSeccion key={`seg-${lote.id}`} lote={lote} />}
    {paso === 'cosechar' && <HistorialLoteSeccion key={`hist-${lote.id}`} lote={lote} />}
    <NavegacionPasos avance={avance} visto={paso} onElegir={vecino} onGeneral={onGeneral} />
  </div>;
}

/** Qué hacer en el paso abierto o, si es otro, en qué paso va el lote. */
function GuiaPaso({ avance, visto, onElegir }: { avance: AvanceLote; visto: IdPaso; onElegir: (p: IdPaso) => void }) {
  const actual = pasoActual(avance);
  const { siguiente, tareas } = avance;
  const estado = avance.pasos.find(p => p.id === visto)?.estado;
  const tareasTexto = tareas.pendientes > 0
    ? `${tareas.pendientes} ${tareas.pendientes === 1 ? 'tarea pendiente' : 'tareas pendientes'}${tareas.vencidas ? ` (${tareas.vencidas} con la fecha pasada)` : ''}`
    : '';
  if (visto === actual) {
    return <div className="siguiente-paso" role="note">
      <div>
        <div className="section-kicker">QUÉ HACER AHORA</div>
        <p>{siguiente.texto}</p>
        {tareasTexto && (visto === 'aplicar'
          ? <p className="muted">Tienes {tareasTexto}: están en la lista de abajo.</p>
          : <p className="muted">También tienes {tareasTexto} en el paso {posicionPaso('aplicar').numero}. <button type="button" className="link-button" onClick={() => onElegir('aplicar')}>Ver las tareas</button></p>)}
      </div>
    </div>;
  }
  const n = posicionPaso(actual).numero;
  const etiqueta = avance.etiquetas[visto];
  const corto = siguiente.corto.endsWith('.') ? siguiente.corto : `${siguiente.corto}.`;
  return <div className={`paso-aviso${estado === 'hecho' ? ' paso-aviso-hecho' : ''}`} role="note">
    <p>
      {etiqueta === 'Listo' && <span aria-hidden="true">✓ </span>}{ESTADO_DEL_PASO[etiqueta]} Ahora te toca el <strong>paso {n}, {nombrePaso(actual)}</strong>. {corto}
    </p>
    <button type="button" className="btn btn-outline btn-small" onClick={() => onElegir(actual)}>Ir al paso {n}</button>
  </div>;
}

/** Qué decir de un paso que no es el que toca. */
const ESTADO_DEL_PASO: Record<EtiquetaPaso, string> = {
  Listo: 'Paso listo: puedes revisarlo.',
  Ahora: '',
  'En curso': 'Este paso sigue en curso: registra aquí cada aplicación del plan aprobado.',
  'Por corregir': 'El análisis guardado tiene datos por corregir.',
  'Sin hacer': 'Este paso quedó sin hacer.',
  'Más adelante': 'Este paso viene más adelante.'
};

/** Botones al final del paso: anterior, siguiente y volver a la vista general. */
function NavegacionPasos({ avance, visto, onElegir, onGeneral }: { avance: AvanceLote; visto: IdPaso; onElegir: (p: IdPaso) => void; onGeneral: () => void }) {
  const { anterior, siguiente } = posicionPaso(visto);
  const hecho = avance.pasos.find(p => p.id === visto)?.estado === 'hecho';
  return <nav className="pasos-navegacion" aria-label="Cambiar de paso">
    {anterior ? <button type="button" className="btn btn-outline" onClick={() => onElegir(anterior)}>← Paso {posicionPaso(anterior).numero}: {nombrePaso(anterior)}</button> : <span />}
    <button type="button" className="link-button" onClick={onGeneral}>Ver todos los pasos</button>
    {siguiente ? <button type="button" className={`btn ${hecho ? 'btn-primary' : 'btn-outline'}`} onClick={() => onElegir(siguiente)}>Paso {posicionPaso(siguiente).numero}: {nombrePaso(siguiente)} →</button> : <span />}
  </nav>;
}

/** Paso 1: los datos del lote, para revisarlos o corregirlos. */
function DatosLote({ lote, onEditar, onInforme, onEliminar }: { lote: Lote; onEditar: () => void; onInforme: () => void; onEliminar: () => void }) {
  return (
    <section className="soil-section" aria-labelledby="titulo-datos-lote">
      <div className="section-header">
        <div>
          <div className="section-kicker">PASO 1 DE 5 · LOTE</div>
          <h2 id="titulo-datos-lote">Datos del lote</h2>
          <p>Revisa que el área y la fecha de siembra estén bien: con el área, la app calcula cuántos kilos y bultos comprar y cuánto cuestan.</p>
          <Terminos ids={['lote', 'zona']} />
        </div>
        <button className="btn btn-outline" onClick={onEditar}>Editar información</button>
      </div>
      <div className="detail-grid">
        <div className="detail-panel"><span>Superficie</span><strong>{formatearNumero(lote.areaM2)} m²</strong><small>{formatearNumero(areaM2AHa(lote.areaM2), 4)} hectáreas</small></div>
        <div className="detail-panel"><span>Fecha de siembra</span><strong className="detail-date">{fechaLegible(lote.fechaSiembra)}</strong><small>Cultivo actual: {nombreCultivo(lote.cultivo).toLowerCase()}</small></div>
        <div className="detail-panel"><span>Ubicación</span><strong className="detail-date">{[lote.ubicacion, lote.departamento].filter(Boolean).join(', ') || 'No registrada'}</strong><small>{lote.zona ? `Zona: ${lote.zona}` : 'Sin zona: la app la usa para proponer las metas del plan'}</small></div>
      </div>
      <div className="detalle-botones datos-lote-botones">
        <button className="btn btn-outline" onClick={onInforme}>Informe para el productor (PDF)</button>
        <button className="danger-link" onClick={onEliminar}>Eliminar este lote</button>
      </div>
    </section>
  );
}
