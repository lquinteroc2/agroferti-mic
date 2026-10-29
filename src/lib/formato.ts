/**
 * Dos formatos distintos:
 * - PRESENTACIÓN (formatearNumero, formatearResultado, formatearExacto): para leer, en es-CO.
 * - EDITABLE (numeroATexto): para precargar formularios; `parsearDecimal` lo recupera sin cambiar el valor.
 */
export function formatearNumero(n: number, max = 2): string {
  if (!Number.isFinite(n)) return '—';
  const formato = new Intl.NumberFormat('es-CO', { maximumFractionDigits: max });
  // Una cantidad positiva que el redondeo dejaría en 0 se muestra como "< 0,01".
  const minimo = 10 ** -max;
  if (n > 0 && n < minimo / 2) return `< ${formato.format(minimo)}`;
  return formato.format(n);
}

/** Resultado calculado: antepone "≈" cuando lo mostrado está redondeado. */
export function formatearResultado(n: number, max = 2): string {
  const texto = formatearNumero(n, max);
  if (texto.startsWith('<') || texto === '—') return texto;
  return Number(n.toFixed(max)) === n ? texto : `≈ ${texto}`;
}

/**
 * Diferencia con su signo, redondeada a `max` decimales. Lo que el redondeo deja en cero se muestra
 * como "≈ 0" (nunca "-0") con signo 0, para que el texto que la acompaña coincida con lo que se ve.
 */
export function formatearDiferencia(d: number, max = 2): { texto: string; signo: -1 | 0 | 1 } {
  if (d === 0) return { texto: '0', signo: 0 };
  if (Math.abs(d) < 0.5 * 10 ** -max) return { texto: '≈ 0', signo: 0 };
  return { texto: `${d > 0 ? '+' : ''}${formatearResultado(d, max)}`, signo: d > 0 ? 1 : -1 };
}

/** Dato ingresado: se muestra completo, sin redondear. */
export function formatearExacto(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const texto = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 20 }).format(n);
  return Number(texto.replace(/\./g, '').replace(',', '.')) === n ? texto : numeroATexto(n);
}

const FORMATO_FECHA: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };

function fechaLocal(valor: Date, conHora = false): string {
  if (Number.isNaN(valor.getTime())) return 'Fecha no válida';
  return conHora
    ? valor.toLocaleString('es-CO', { ...FORMATO_FECHA, hour: '2-digit', minute: '2-digit' })
    : valor.toLocaleDateString('es-CO', FORMATO_FECHA);
}

/** Fecha AAAA-MM-DD escrita por el usuario (se lee a mediodía local para no cambiar de día). */
export function fechaLegible(fecha?: string) {
  return fecha ? fechaLocal(new Date(`${fecha}T12:00:00`)) : 'Sin registrar';
}

/** Fecha local de una marca de tiempo ISO (p. ej. la del historial de un plan). */
export function fechaDeMarca(iso?: string) {
  return iso ? fechaLocal(new Date(iso)) : 'Sin registrar';
}

/** Fecha y hora local de una marca de tiempo ISO (historial de cambios). */
export function fechaHoraDeMarca(iso?: string) {
  return iso ? fechaLocal(new Date(iso), true) : 'Sin registrar';
}

/**
 * Número a texto editable con coma decimal, SIN pérdida: `parsearDecimal(numeroATexto(n)) === n`
 * para todo número finito. Usa decimales normales si lo representan exactamente; si no,
 * la notación científica mínima de JavaScript (p. ej. 1e-21), que el parser admite.
 */
export function numeroATexto(n?: number): string {
  if (n === undefined || !Number.isFinite(n)) return '';
  const minimo = String(n);
  if (minimo.includes('e')) {
    const llano = n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
    if (llano.length <= 25 && Number(llano) === n) return llano.replace('.', ',');
  }
  return minimo.replace('.', ',');
}
