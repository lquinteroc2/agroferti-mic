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

export async function textoDeArchivo(archivo: File, alAvanzar: (texto: string) => void = () => undefined): Promise<string> {
  const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name);
  if (!esPdf) return ocr([archivo], alAvanzar);

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
