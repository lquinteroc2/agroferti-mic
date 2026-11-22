import type { AccionSiguiente, AvanceLote, IdPaso } from '../lib/avance';
import { llevarA as irA } from '../lib/navegacion';

/** Título de cada sección de la ficha (los ids los ponen las secciones). */
const SECCION_DE_PASO: Record<IdPaso, string> = {
  lote: 'titulo-ficha', analisis: 'titulo-suelo', plan: 'titulo-planes', aplicar: 'titulo-seguimiento', cosechar: 'titulo-historial'
};

const BOTON: Record<AccionSiguiente, { seccion: string; texto: string }> = {
  analisis: { seccion: 'titulo-suelo', texto: 'Ir al análisis de suelo' },
  'corregir-analisis': { seccion: 'titulo-suelo', texto: 'Ir al análisis de suelo' },
  'crear-plan': { seccion: 'titulo-planes', texto: 'Ir al plan de fertilización' },
  'revisar-plan': { seccion: 'titulo-planes', texto: 'Ir al plan de fertilización' },
  'aprobar-plan': { seccion: 'titulo-planes', texto: 'Ir al plan de fertilización' },
  aplicar: { seccion: 'titulo-seguimiento', texto: 'Ir a registrar lo aplicado' },
  cosechar: { seccion: 'titulo-historial', texto: 'Ir al historial del lote' }
};

const ESTADO_LEIDO = { hecho: 'hecho', actual: 'siguiente paso', pendiente: 'pendiente' } as const;

/** Barra de pasos del lote y su siguiente paso, arriba en la ficha. Cada paso lleva a su sección. */
export function PasosLote({ avance }: { avance: AvanceLote }) {
  const { siguiente, tareas } = avance;
  const boton = BOTON[siguiente.accion];
  return (
    <section className="pasos-lote" aria-labelledby="titulo-pasos">
      <h2 id="titulo-pasos" className="sr-only">Avance del lote</h2>
      <ol className="pasos">
        {avance.pasos.map((p, i) => <li key={p.id} className={`paso paso-${p.estado}`} aria-current={p.estado === 'actual' ? 'step' : undefined}>
          <button type="button" onClick={() => irA(SECCION_DE_PASO[p.id])}>
            <span className="paso-marca" aria-hidden="true">{p.estado === 'hecho' ? '✓' : i + 1}</span>
            <span className="paso-nombre">{p.nombre}</span>
            <span className="sr-only">: {ESTADO_LEIDO[p.estado]}</span>
          </button>
        </li>)}
      </ol>
      <div className="siguiente-paso">
        <div>
          <div className="section-kicker">SIGUIENTE PASO</div>
          <p>{siguiente.texto}</p>
          {tareas.pendientes > 0 && <p className="muted">También tienes {tareas.pendientes} {tareas.pendientes === 1 ? 'tarea pendiente' : 'tareas pendientes'}{tareas.vencidas ? ` (${tareas.vencidas} con la fecha pasada)` : ''} en Seguimiento.</p>}
        </div>
        <button type="button" className="btn btn-primary" onClick={() => irA(boton.seccion)}>{boton.texto}</button>
      </div>
    </section>
  );
}
