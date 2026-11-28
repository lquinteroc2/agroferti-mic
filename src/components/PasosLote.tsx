import { posicionPaso, tituloPaso, type AvanceLote, type EtiquetaPaso, type IdPaso } from '../lib/avance';

/** Color de cada etiqueta: verde lo listo o en curso, oscuro lo que toca, ámbar lo que quedó sin hacer. */
const CLASE: Record<EtiquetaPaso, string> = {
  Listo: 'hecho', Ahora: 'actual', 'En curso': 'curso', 'Por corregir': 'falta', 'Sin hacer': 'falta', 'Más adelante': 'pendiente'
};

/**
 * Vista general de la ficha: los cinco pasos en una lista, cada uno con su estado y lo registrado
 * (patrón "lista de tareas" de GOV.UK: toda la fila abre el paso). El paso en que va el lote se
 * destaca con qué hacer en él.
 */
export function ListaPasos({ avance, resumenLote, onAbrir }: { avance: AvanceLote; resumenLote: string; onAbrir: (paso: IdPaso) => void }) {
  return (
    <ol className="lista-pasos" aria-label="Pasos del cultivo">
      {avance.pasos.map((p, i) => {
        const resumen = p.id === 'lote' ? resumenLote : avance.resumen[p.id];
        return <li key={p.id}>
          <button type="button" className={`tarjeta-paso tarjeta-paso-${p.estado}`} aria-current={p.estado === 'actual' ? 'step' : undefined} onClick={() => onAbrir(p.id)}>
            <span className="paso-marca" aria-hidden="true">{p.estado === 'hecho' ? '✓' : i + 1}</span>
            <span className="tarjeta-paso-texto">
              <span className="tarjeta-paso-titulo"><span className="sr-only">Paso {i + 1}: </span>{tituloPaso(p.id)}</span>
              <span className="tarjeta-paso-resumen">{resumen}</span>
              {p.estado === 'actual' && <span className="tarjeta-paso-ahora">{avance.siguiente.texto}</span>}
              {p.estado === 'actual' && <span className="tarjeta-paso-boton" aria-hidden="true">Abrir el paso {i + 1} →</span>}
            </span>
            <span className={`etiqueta-paso etiqueta-paso-${CLASE[avance.etiquetas[p.id]]}`}>{avance.etiquetas[p.id]}</span>
          </button>
        </li>;
      })}
    </ol>
  );
}

/** Avance en una línea dentro de un paso: "Paso 2 de 5" y una barra con lo hecho y el paso abierto. */
export function BarraPasos({ avance, visto }: { avance: AvanceLote; visto: IdPaso }) {
  const { numero, total } = posicionPaso(visto);
  return (
    <div className="barra-pasos">
      <span className="barra-pasos-texto">Paso {numero} de {total}</span>
      <span className="barra-pasos-segmentos" aria-hidden="true">
        {avance.pasos.map(p => <span key={p.id} className={`segmento segmento-${p.estado}${p.id === visto ? ' segmento-visto' : ''}`} />)}
      </span>
    </div>
  );
}
