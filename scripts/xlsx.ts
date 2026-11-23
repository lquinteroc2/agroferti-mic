/**
 * Lector mínimo de archivos .xlsx (los anexos del DANE), solo con la librería estándar de Node: un
 * .xlsx es un ZIP con XML adentro. Lee el texto y los números de cada celda; no interpreta fórmulas,
 * estilos ni fechas. Sin dependencias nuevas.
 */
import { inflateRawSync } from 'node:zlib';

export interface Hoja { nombre: string; filas: string[][] }

/** Archivos de un ZIP (solo los que pide `quiero`), descomprimidos. */
export function leerZip(zip: Buffer, quiero: (nombre: string) => boolean): Map<string, Buffer> {
  // Fin del directorio central: firma 0x06054b50, buscada desde el final (puede haber un comentario).
  let fin = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error('No es un archivo ZIP/XLSX válido.');
  const total = zip.readUInt16LE(fin + 10);
  let p = zip.readUInt32LE(fin + 16);
  const archivos = new Map<string, Buffer>();
  for (let n = 0; n < total; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('Directorio del ZIP dañado.');
    const metodo = zip.readUInt16LE(p + 10);
    const comprimido = zip.readUInt32LE(p + 20);
    const largoNombre = zip.readUInt16LE(p + 28);
    const largoExtra = zip.readUInt16LE(p + 30);
    const largoComentario = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const nombre = zip.toString('utf8', p + 46, p + 46 + largoNombre);
    p += 46 + largoNombre + largoExtra + largoComentario;
    if (!quiero(nombre)) continue;
    if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error(`Encabezado dañado en ${nombre}.`);
    const inicio = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const datos = zip.subarray(inicio, inicio + comprimido);
    if (metodo === 0) archivos.set(nombre, Buffer.from(datos));
    else if (metodo === 8) archivos.set(nombre, inflateRawSync(datos));
    else throw new Error(`Compresión no soportada (${metodo}) en ${nombre}.`);
  }
  return archivos;
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function texto(xml: string): string {
  return xml.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTIDADES[e] ?? m);
}
/** Todo el texto de los <t> de un fragmento (una cadena puede venir en varios trozos con formato). */
const textoDeT = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => texto(m[1])).join('');

function columna(ref: string): number {
  const letras = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const l of letras) n = n * 26 + (l.charCodeAt(0) - 64);
  return n - 1;
}

/** Hojas de un .xlsx con sus filas (texto de cada celda; vacío si no hay nada). */
export function leerXlsx(xlsx: Buffer): Hoja[] {
  const archivos = leerZip(xlsx, n => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  const libro = archivos.get('xl/workbook.xml')?.toString('utf8');
  const relaciones = archivos.get('xl/_rels/workbook.xml.rels')?.toString('utf8');
  if (!libro || !relaciones) throw new Error('El archivo no tiene la estructura de un libro de Excel.');
  const compartidas = [...(archivos.get('xl/sharedStrings.xml')?.toString('utf8') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => textoDeT(m[1]));
  const destino = new Map([...relaciones.matchAll(/<Relationship\b[^>]*>/g)].map(m => {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1] ?? '';
    const t = /\bTarget="([^"]+)"/.exec(m[0])?.[1] ?? '';
    return [id, t.startsWith('/') ? t.slice(1) : `xl/${t}`] as const;
  }));
  return [...libro.matchAll(/<sheet\b[^>]*>/g)].map(m => {
    const nombre = texto(/\bname="([^"]*)"/.exec(m[0])?.[1] ?? '');
    const id = /\br:id="([^"]+)"/.exec(m[0])?.[1] ?? '';
    const xml = archivos.get(destino.get(id) ?? '')?.toString('utf8') ?? '';
    const filas: string[][] = [];
    for (const f of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const r = Number(/\br="(\d+)"/.exec(f[1])?.[1] ?? filas.length + 1) - 1;
      const fila: string[] = [];
      for (const c of f[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const atributos = c[1];
        const contenido = c[2] ?? '';
        const tipo = /\bt="([^"]+)"/.exec(atributos)?.[1];
        const v = /<v>([\s\S]*?)<\/v>/.exec(contenido)?.[1];
        const valor = tipo === 's' ? compartidas[Number(v)] ?? '' : tipo === 'inlineStr' ? textoDeT(contenido) : v !== undefined ? texto(v) : '';
        fila[columna(/\br="([A-Z]+\d+)"/.exec(atributos)?.[1] ?? '')] = valor;
      }
      filas[r] = Array.from(fila, x => x ?? '');
    }
    return { nombre, filas: Array.from(filas, x => x ?? []) };
  });
}
