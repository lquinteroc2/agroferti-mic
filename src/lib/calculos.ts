/**
 * Operaciones DIMENSIONALES (no son recomendaciones de fertilización).
 * Las metas nutricionales deben provenir de un análisis agronómico validado.
 */
function positivoFinito(nombre: string, valor: number): void {
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new RangeError(`${nombre} debe ser mayor que cero y finito.`);
  }
}

export function areaM2AHa(areaM2: number): number {
  positivoFinito('Área', areaM2);
  return areaM2 / 10_000;
}

export function masaSueloKgHa(profundidadCm: number, densidadGcm3: number): number {
  positivoFinito('Profundidad', profundidadCm);
  positivoFinito('Densidad aparente', densidadGcm3);
  return 10_000 * (profundidadCm / 100) * (densidadGcm3 * 1_000);
}

/** mg/kg = ppm en base masa. NO equivale a nutriente disponible o dosis recomendada. */
export function equivalenciaMgKgAKgHa(mgKg: number, masaKgHa: number): number {
  if (!Number.isFinite(mgKg) || mgKg < 0) throw new RangeError('mg/kg debe ser no negativo.');
  positivoFinito('Masa de suelo', masaKgHa);
  return (mgKg * masaKgHa) / 1_000_000;
}

/** Cantidad de un producto para aportar una meta YA VALIDADA de un nutriente. */
export function productoKgHa(metaValidadaKgHa: number, porcentajeEnEtiqueta: number): number {
  if (!Number.isFinite(metaValidadaKgHa) || metaValidadaKgHa < 0) {
    throw new RangeError('Meta debe ser no negativa.');
  }
  if (!Number.isFinite(porcentajeEnEtiqueta) || porcentajeEnEtiqueta <= 0 || porcentajeEnEtiqueta > 100) {
    throw new RangeError('Porcentaje debe estar entre 0 (exclusivo) y 100.');
  }
  return metaValidadaKgHa / (porcentajeEnEtiqueta / 100);
}
