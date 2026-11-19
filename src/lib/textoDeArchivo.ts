/**
 * Texto de un informe de laboratorio a partir de un archivo, sin servicios de pago:
 * - PDF con texto (lo usual en informes de laboratorio): PDF.js, en el navegador.
 * - Foto o PDF escaneado: Tesseract.js (reconocimiento de texto en español), en el navegador. La
 *   primera vez descarga el idioma español (unos pocos MB), por eso necesita internet.
 * Las librerías se cargan solo cuando se usan, para no hacer más pesada la app.
 */

const MAX_PAGINAS = 5;

/** Une los fragmentos de texto de una página en líneas, según su posición vertical. */
function lineasDePagina(items: Array<{ str?: string; transform?: number[] }>): string[] {
  const filas = new Map<number, Array<{ x: number; texto: string }>>();
  for (const it of items) {
    if (!it.str?.trim() || !it.transform) continue;
    const y = Math.round(it.transform[5] / 3) * 3; // tolerancia de unos puntos entre fragmentos de la misma línea
    const fila = filas.get(y) ?? [];
    fila.push({ x: it.transform[4], texto: it.str });
    filas.set(y, fila);
  }
  return [...filas.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, fila]) => fila.sort((a, b) => a.x - b.x).map(f => f.texto).join(' '));
}

async function ocr(imagenes: Array<Blob | HTMLCanvasElement>, alAvanzar: (texto: string) => void): Promise<string> {
  alAvanzar('Preparando la lectura de la imagen (la primera vez descarga el idioma español)…');
  const { createWorker } = await import('tesseract.js');
  const trabajador = await createWorker('spa');
  try {
    const textos: string[] = [];
    for (let i = 0; i < imagenes.length; i++) {
      alAvanzar(`Leyendo la imagen${imagenes.length > 1 ? ` ${i + 1} de ${imagenes.length}` : ''}…`);
      textos.push((await trabajador.recognize(imagenes[i])).data.text);
    }
    return textos.join('\n');
  } finally {
    await trabajador.terminate();
  }
}

/** Tipos de archivo que se pueden adjuntar (para el selector de archivos). */
export const FORMATOS_ADJUNTO = '.pdf,.jpg,.jpeg,.png,.webp,.bmp,.gif,.txt,.csv,application/pdf,image/jpeg,image/png,image/webp,image/bmp,image/gif,text/plain,text/csv';

/** Formato no admitido, con un mensaje para el usuario. */
export class FormatoNoAdmitido extends Error {}

type Formato = 'pdf' | 'imagen' | 'texto' | 'heic' | 'otro';

/** Qué es el archivo, por su tipo o, si el navegador no lo indica, por su extensión. */
export function formatoDe(nombre: string, tipo: string): Formato {
  const ext = /\.([a-z0-9]+)$/i.exec(nombre)?.[1]?.toLowerCase() ?? '';
  if (tipo === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (/heic|heif/.test(tipo) || ext === 'heic' || ext === 'heif') return 'heic';
  if (/^image\/(jpeg|png|webp|bmp|gif)$/.test(tipo) || ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'].includes(ext)) return 'imagen';
  if (/^text\/(plain|csv)$/.test(tipo) || ['txt', 'csv'].includes(ext)) return 'texto';
  return 'otro';
}

export async function textoDeArchivo(archivo: File, alAvanzar: (texto: string) => void = () => undefined): Promise<string> {
  const formato = formatoDe(archivo.name, archivo.type);
  if (formato === 'heic') throw new FormatoNoAdmitido('Las fotos HEIC del iPhone no se pueden leer aquí. Guárdala como JPG (o toma una captura de pantalla) y adjúntala de nuevo.');
  if (formato === 'otro') throw new FormatoNoAdmitido('Ese tipo de archivo no se puede leer. Adjunta un PDF, una imagen (JPG, PNG, WEBP, BMP o GIF) o un texto (TXT o CSV).');
  if (formato === 'texto') return archivo.text();
  if (formato === 'imagen') return ocr([archivo], alAvanzar);

  alAvanzar('Leyendo el PDF…');
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const documento = await pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) }).promise;
  const paginas = Math.min(documento.numPages, MAX_PAGINAS);
  const lineas: string[] = [];
  for (let n = 1; n <= paginas; n++) {
    const pagina = await documento.getPage(n);
    const contenido = await pagina.getTextContent();
    lineas.push(...lineasDePagina(contenido.items as Array<{ str?: string; transform?: number[] }>));
  }
  if (lineas.join('').trim().length >= 20) return lineas.join('\n');

  // PDF escaneado (sin texto): se dibuja cada página y se lee como imagen.
  const lienzos: HTMLCanvasElement[] = [];
  for (let n = 1; n <= paginas; n++) {
    const pagina = await documento.getPage(n);
    const vista = pagina.getViewport({ scale: 2 });
    const lienzo = document.createElement('canvas');
    lienzo.width = vista.width;
    lienzo.height = vista.height;
    await pagina.render({ canvas: lienzo, canvasContext: lienzo.getContext('2d')!, viewport: vista }).promise;
    lienzos.push(lienzo);
  }
  return ocr(lienzos, alAvanzar);
}
