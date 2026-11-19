/**
 * Reglas de contenido para guardar un registro en la nube. Son las MISMAS verificaciones que usa la
 * app al leer sus datos: la app las aplica antes de subir y el Worker otra vez antes de guardar.
 *
 * Un registro con datos dañados sigue en el dispositivo (nunca se borra en silencio), pero no se sube
 * hasta que se corrija. Así la nube solo guarda datos válidos.
 */
import type { PlanVerificado, ProblemaDato } from '../types.ts';
import { verificarCiclo } from './historial.ts';
import type { TablaNube } from './protocoloNube.ts';
import { esObjeto, problemaLote, verificarAnalisis } from './validacion.ts';
import { motivosCambioEstado, verificarPlan, verificarProducto } from './validacionPlan.ts';
import { verificarRegistro } from './validacionSeguimiento.ts';

const resumen = (problemas: ReadonlyArray<ProblemaDato>): string | null =>
  problemas.length ? problemas.slice(0, 3).map(p => `${p.etiqueta}: ${p.detalle}`).join(' ') : null;

/**
 * Un plan revisado o aprobado debe cumplir lo que la app exige para ese paso (metas, un producto por
 * meta y la cantidad calculada) y su historial debe terminar en ese estado.
 */
function problemaEstadoPlan(plan: PlanVerificado): string | null {
  if (plan.estado !== 'revisado' && plan.estado !== 'aprobado') return null;
  if (plan.historial.at(-1)?.estado !== plan.estado) return `El historial del plan no termina en «${plan.estado}».`;
  const anterior = plan.estado === 'revisado' ? 'propuesta' : 'revisado';
  const motivos = motivosCambioEstado({ ...plan, estado: anterior }, plan.estado);
  return motivos.length ? motivos.slice(0, 3).join(' ') : null;
}

/** Motivo por el que un registro no se puede guardar en la nube, o null si es válido. */
export function problemaParaNube(tabla: TablaNube, id: string, registro: unknown, hoy: Date = new Date()): string | null {
  try {
    if (!esObjeto(registro)) return 'El registro no tiene la estructura esperada.';
    if (registro.id !== id) return 'El identificador del registro no coincide.';
    switch (tabla) {
      case 'lotes': return problemaLote(registro);
      case 'analisisSuelos': return resumen(verificarAnalisis(registro).problemas);
      case 'productos': return resumen(verificarProducto(registro).problemas);
      case 'planes': {
        const plan = verificarPlan(registro);
        return resumen(plan.problemas) ?? problemaEstadoPlan(plan);
      }
      case 'registros': return resumen(verificarRegistro(registro).problemas);
      case 'ciclos': return resumen(verificarCiclo(registro, { hoy }).problemas);
    }
  } catch {
    return 'No se pudo revisar el registro.';
  }
}
