/**
 * Reglas puras para actualizar los precios del DANE (SIPSA-I, anexo departamental) en el catálogo de
 * referencia. El anexo trae, por departamento, el precio promedio de cada fertilizante con su
 * registro ICA: se une con el catálogo por ese número. Fuente: DANE, www.dane.gov.co.
 */
import { DEPARTAMENTOS_COLOMBIA } from '../src/lib/departamentos.ts';
import { kgDePresentacion, nombreMes } from '../src/lib/referencias.ts';
import type { Hoja } from './xlsx.ts';

export interface FilaDane { departamento: string; registroIca: string; presentacion: string; precio: number }

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Dirección del anexo departamental de un mes AAAA-MM (formato del DANE desde febrero de 2024). */
export function urlAnexo(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number);
  return `https://www.dane.gov.co/files/operaciones/SIPSA/anex-SIPSAinsumosdepartamento-${MESES[mes - 1]}${anio}.xlsx`;
}

/** Mes AAAA-MM del nombre de un anexo ("…-oct2026.xlsx" o "…-octubre2026.xlsx"), o undefined. */
export function periodoDeNombre(nombre: string): string | undefined {
  const m = /-([a-z]+)(\d{4})\.xlsx$/i.exec(nombre);
  if (!m) return undefined;
  const palabra = m[1].toLowerCase();
  const i = MESES_LARGOS.findIndex(l => l === palabra || l.slice(0, 3) === palabra || (palabra === 'sept' && l === 'septiembre'));
  return i < 0 ? undefined : `${m[2]}-${String(i + 1).padStart(2, '0')}`;
}

/** Suma (o resta) meses a AAAA-MM. */
export function moverMes(periodo: string, meses: number): string {
  const [anio, mes] = periodo.split('-').map(Number);
  const total = anio * 12 + (mes - 1) + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
/** Nombre del departamento como en la lista de la app (el DANE a veces deja espacios o cambia tildes). */
function departamento(nombre: string): string {
  const clave = sinTildes(nombre);
  return DEPARTAMENTOS_COLOMBIA.find(d => sinTildes(d) === clave) ?? nombre.trim();
}
const registro = (t: string) => t.trim().replace(/\.0+$/, '');

/**
 * Filas de la hoja de fertilizantes del anexo. La hoja se reconoce por su título ("Fertilizantes…")
 * y su encabezado (registro ICA y precio promedio), no por su número, que cambia entre meses.
 */
export function filasDeFertilizantes(hojas: ReadonlyArray<Hoja>): FilaDane[] {
  for (const h of hojas) {
    if (!h.filas.slice(0, 8).some(f => f.some(c => /^\s*[\d.]*\s*fertilizantes/i.test(c)))) continue;
    const iEncabezado = h.filas.findIndex(f => f.some(c => /registro\s+ica/i.test(c)) && f.some(c => /precio\s+promedio/i.test(c)));
    if (iEncabezado < 0) continue;
    const enc = h.filas[iEncabezado];
    const col = (re: RegExp) => enc.findIndex(c => re.test(c));
    const cDep = col(/nombre\s+departamento/i), cIca = col(/registro\s+ica/i), cPres = col(/presentaci[oó]n/i), cPrecio = col(/precio\s+promedio/i);
    if ([cDep, cIca, cPres, cPrecio].some(c => c < 0)) continue;
    return h.filas.slice(iEncabezado + 1).flatMap(f => {
      const precio = Number(f[cPrecio]);
      const ica = registro(f[cIca] ?? '');
      if (!f[cDep]?.trim() || !ica || !f[cPres]?.trim() || !(precio > 0)) return [];
      return [{ departamento: departamento(f[cDep]), registroIca: ica, presentacion: f[cPres].trim(), precio }];
    });
  }
  return [];
}

/** Texto de la fuente de los precios para un mes. */
export const fuentePrecios = (periodo: string) => `Precios: DANE, SIPSA-I insumos, anexo departamental, ${nombreMes(periodo)}, www.dane.gov.co.`;

/** La frase de los precios dentro de la fuente (solo esa frase: lo que sigue, como las notas, se conserva). */
const FRASE_PRECIOS = /\s*Precios: DANE[^]*?www\.dane\.gov\.co\./;

/** Fuente con la frase de los precios del mes en su lugar (o sin ella, si ya no hay precios). */
function fuenteConPrecios(fuente: string, periodo: string): string {
  if (!periodo) return fuente.replace(FRASE_PRECIOS, '');
  return FRASE_PRECIOS.test(fuente) ? fuente.replace(FRASE_PRECIOS, ` ${fuentePrecios(periodo)}`) : `${fuente} ${fuentePrecios(periodo)}`;
}

type Precio = { departamento: string; precioPromedioCop: number; presentacion: string; periodo: string };
type Referencia = Record<string, unknown> & { registroIca?: unknown; presentacionKg?: unknown; precios?: unknown; fuente?: unknown };

/**
 * Pone los precios del mes a cada referencia con el mismo registro ICA. Por departamento se toma la
 * presentación en peso igual al bulto del catálogo o, si no está, la más grande. Un precio anterior
 * de un departamento que este mes no aparece se conserva si tiene hasta `mesesConservar` meses (el
 * DANE no recoge todos los productos todos los meses; la app muestra el mes de cada precio).
 */
export function actualizarPrecios<T extends Referencia>(referencias: ReadonlyArray<T>, filas: ReadonlyArray<FilaDane>, periodo: string, mesesConservar = 2): Array<T & { precios: Precio[] }> {
  const porRegistro = new Map<string, FilaDane[]>();
  for (const f of filas) {
    if (kgDePresentacion(f.presentacion) === undefined) continue; // líquidos (litros, cc): no son un bulto
    porRegistro.set(f.registroIca, [...(porRegistro.get(f.registroIca) ?? []), f]);
  }
  const limite = moverMes(periodo, -mesesConservar);
  return referencias.map(r => {
    const ica = typeof r.registroIca === 'string' ? registro(r.registroIca) : '';
    const delMes = porRegistro.get(ica) ?? [];
    const bulto = typeof r.presentacionKg === 'number' ? r.presentacionKg : undefined;
    const nuevos = new Map<string, Precio>();
    for (const f of delMes) {
      const actual = nuevos.get(f.departamento);
      const kg = kgDePresentacion(f.presentacion)!;
      const kgActual = actual ? kgDePresentacion(actual.presentacion)! : -1;
      const mejor = !actual || (kg === bulto && kgActual !== bulto) || (kgActual !== bulto && kg > kgActual);
      if (mejor) nuevos.set(f.departamento, { departamento: f.departamento, precioPromedioCop: f.precio, presentacion: f.presentacion, periodo });
    }
    const anteriores = (Array.isArray(r.precios) ? r.precios as Precio[] : [])
      .filter(p => !nuevos.has(p.departamento) && typeof p.periodo === 'string' && p.periodo >= limite && p.periodo < periodo);
    const precios = [...nuevos.values(), ...anteriores].sort((a, b) => a.departamento.localeCompare(b.departamento, 'es'));
    const masReciente = precios.reduce((m, p) => (p.periodo > m ? p.periodo : m), '');
    return { ...r, precios, ...(typeof r.fuente === 'string' ? { fuente: fuenteConPrecios(r.fuente, masReciente) } : {}) };
  });
}

/** Mes más reciente de los precios guardados, o '' si no hay ninguno. */
export function ultimoPeriodo(referencias: ReadonlyArray<Referencia>): string {
  let ultimo = '';
  for (const r of referencias) for (const p of (Array.isArray(r.precios) ? r.precios as Precio[] : [])) if (p.periodo > ultimo) ultimo = p.periodo;
  return ultimo;
}
