/**
 * Glosario para el productor: cada término que aparece en la app, en palabras sencillas. Son datos,
 * no reglas: no cambian ningún cálculo. Los ejemplos numéricos solo ilustran la operación.
 */

export type CategoriaGlosario = 'app' | 'medidas' | 'suelo' | 'nutrientes' | 'plan' | 'productos' | 'seguimiento';

export const CATEGORIAS_GLOSARIO: ReadonlyArray<{ id: CategoriaGlosario; nombre: string }> = [
  { id: 'app', nombre: 'La app y tus datos' },
  { id: 'medidas', nombre: 'Medidas y unidades' },
  { id: 'suelo', nombre: 'Suelo y análisis' },
  { id: 'nutrientes', nombre: 'Nutrientes y formas químicas' },
  { id: 'plan', nombre: 'Plan de fertilización' },
  { id: 'productos', nombre: 'Fertilizantes y productos' },
  { id: 'seguimiento', nombre: 'Seguimiento, cosecha e informes' }
];

export interface TerminoGlosario {
  /** Identificador estable para enlazar el término desde la interfaz. */
  id: string;
  termino: string;
  categoria: CategoriaGlosario;
  definicion: string;
  ejemplo?: string;
  /** Dónde aparece en la app. */
  donde?: string;
  /** Otras formas de escribirlo, para el buscador. */
  alias?: ReadonlyArray<string>;
}

export const GLOSARIO: ReadonlyArray<TerminoGlosario> = [
  // ---- La app y tus datos ----
  { id: 'lote', categoria: 'app', termino: 'Lote', definicion: 'Terreno que manejas como una sola unidad: el mismo cultivo, sembrado en la misma fecha y con el mismo manejo. Si una parte de la finca se siembra en otra fecha o recibe otro abono, conviene registrarla como otro lote.', donde: 'Mis lotes, ficha del lote.' },
  { id: 'unidad-productiva', categoria: 'app', termino: 'Unidad productiva', definicion: 'La finca o el conjunto de lotes que maneja un productor.', donde: 'Mis lotes.', alias: ['finca'] },
  { id: 'ficha-del-lote', categoria: 'app', termino: 'Ficha del lote', definicion: 'Pantalla con todo lo de un lote: sus datos, el análisis de suelo, el plan de fertilización, el seguimiento y el historial.', donde: 'Al tocar un lote en Mis lotes.' },
  { id: 'ubicacion', categoria: 'app', termino: 'Ubicación o referencia', definicion: 'Texto para encontrar el lote: vereda, sector o municipio. Si incluye el departamento, la app usa el precio del DANE de ese departamento al sugerir fertilizantes.', donde: 'Formulario del lote.', alias: ['vereda', 'departamento'] },
  { id: 'dato-real', categoria: 'app', termino: 'Dato real', definicion: 'Información de tu cultivo: lo que pasó, lo que aplicaste o lo que dice una etiqueta o una fuente de verdad. También aparece como "Etiqueta real" o "Fuente real".', donde: 'Metas, productos, aplicaciones, observaciones, tareas y cierres de ciclo.', alias: ['etiqueta real', 'fuente real'] },
  { id: 'ejemplo', categoria: 'app', termino: 'EJEMPLO', definicion: 'Marca de un dato inventado para practicar o presentar. La app lo señala en pantallas e informes para que nadie lo use en un cultivo real.', donde: 'Cualquier registro marcado así y el aviso al inicio del informe.', alias: ['ficticio', 'dato de práctica'] },
  { id: 'origen-del-dato', categoria: 'app', termino: 'Origen del dato', definicion: 'Campo donde dices si un registro es un dato real o de EJEMPLO.', donde: 'Metas, productos, aplicaciones, observaciones, tareas y cierres de ciclo.' },
  { id: 'responsable', categoria: 'app', termino: 'Responsable', definicion: 'Nombre de quien hizo o registró algo. También aparece como "Elaborado por" o "Nombre de quien registra el cambio". La app no verifica identidades: guarda el nombre como se escribe.', donde: 'Aplicaciones, observaciones, tareas y estados del plan.', alias: ['elaborado por', 'nombre de quien registra el cambio'] },
  { id: 'datos-ingresados', categoria: 'app', termino: 'Datos ingresados', definicion: 'Etiqueta verde. Marca lo que escribiste tú, copiado del informe del laboratorio o de la etiqueta.', donde: 'Detalle del análisis, del producto y del plan.' },
  { id: 'resultados-calculados', categoria: 'app', termino: 'Resultados calculados', definicion: 'Etiqueta azul. Marca los números que calcula la app a partir de tus datos, con la operación a la vista.', donde: 'Detalle del análisis, del producto y del plan.' },
  { id: 'aproximado', categoria: 'app', termino: '≈ (aproximado)', definicion: 'El número se redondeó para mostrarlo. La app calcula con el valor completo.', donde: 'Resultados de los cálculos.', alias: ['redondeado'] },
  { id: 'datos-por-corregir', categoria: 'app', termino: 'Datos por corregir', definicion: 'Un dato guardado que no pasa la revisión de la app, por ejemplo un número imposible o una fecha que no existe. No se borra solo: se muestra para que lo corrijas o lo descartes. También aparece como "dato guardado dañado".', donde: 'Etiqueta roja en listas y detalles.', alias: ['dato dañado'] },
  { id: 'analisis-documentado', categoria: 'app', termino: 'Análisis documentado', definicion: 'Análisis guardado con el nombre del laboratorio y el método. Se sabe cómo se obtuvieron los resultados.', donde: 'Lista de análisis del lote.' },
  { id: 'registro-incompleto', categoria: 'app', termino: 'Registro incompleto', definicion: 'Análisis guardado sin laboratorio o sin método. Se puede usar, pero no se sabe cómo se midió.', donde: 'Lista y detalle de análisis.' },
  { id: 'trazabilidad', categoria: 'app', termino: 'Trazabilidad', definicion: 'Poder saber de dónde salió cada dato: quién lo registró, cuándo y con qué método o fuente. Cuando falta el método del laboratorio, la app dice "Falta saber cómo se midió".', donde: 'Detalle del análisis.', alias: ['falta saber cómo se midió'] },
  { id: 'nube', categoria: 'app', termino: 'Nube', definicion: 'Copia de tus datos en servidores de internet (Cloudflare), para no perderlos y verlos en otro dispositivo. Pueden estar fuera de Colombia.', donde: 'Ingreso y Mi cuenta.' },
  { id: 'sincronizar', categoria: 'app', termino: 'Sincronizar', definicion: 'Subir a la nube los cambios de este dispositivo y traer los de otros. Pasa sola cuando hay internet; "Sincronizar ahora" la hace de inmediato.', donde: 'Mi cuenta.' },
  { id: 'sin-internet', categoria: 'app', termino: 'Funciona sin internet', definicion: 'La app guarda todo en el dispositivo y sube los cambios cuando vuelve la conexión. Para ingresar la primera vez sí se necesita internet.', donde: 'Ingreso y Cómo funciona.', alias: ['sin conexión'] },
  { id: 'sesion', categoria: 'app', termino: 'Sesión', definicion: 'El tiempo en que estás dentro de la app con tu cuenta de Google. La sesión vence; sin internet puedes seguir trabajando y, al volver la conexión, hay que ingresar de nuevo. "Cerrar sesión" sale de la cuenta sin borrar datos.', donde: 'Encabezado y Mi cuenta.', alias: ['cerrar sesión', 'sesión vencida'] },
  { id: 'mi-cuenta', categoria: 'app', termino: 'Mi cuenta', definicion: 'Recuadro con el estado de la sincronización, cerrar sesión y borrar tus datos de la nube.', donde: 'Al final de Mis lotes.' },
  { id: 'borrar-nube', categoria: 'app', termino: 'Borrar mis datos de la nube', definicion: 'Elimina tus datos de los servidores. Los de este dispositivo no se borran. Pueden quedar hasta 7 días en copias de recuperación de Cloudflare antes de desaparecer.', donde: 'Mi cuenta.' },
  { id: 'cambios-que-chocaron', categoria: 'app', termino: 'Cambios que chocaron entre dispositivos', definicion: 'Si dos dispositivos cambian el mismo registro, la app guarda el cambio más reciente y aparta el otro para que lo revises. Si lo que quedó guardado está bien, puedes descartarlos.', donde: 'Mi cuenta.', alias: ['versión apartada', 'versiones apartadas', 'conflicto'] },
  { id: 'registros-sin-lote', categoria: 'app', termino: 'Registros sin lote', definicion: 'Datos cuyo lote ya no existe, por ejemplo porque se borró en otro dispositivo mientras en este se agregaban datos. No aparecen en ninguna ficha; si no los necesitas, puedes eliminarlos.', donde: 'Mi cuenta.' },
  { id: 'otra-version', categoria: 'app', termino: 'Datos de otra versión conservados', definicion: 'Campos guardados por otra versión de la app que esta versión no muestra. Se conservan sin tocarlos al guardar; no tienes que hacer nada.', donde: 'Detalles de análisis, plan y producto.' },
  { id: 'espacio-nube', categoria: 'app', termino: 'Espacio máximo de la nube', definicion: 'Límite gratuito de almacenamiento del prototipo. Al llegar, lo nuevo se guarda en el dispositivo pero no se sube.', donde: 'Mi cuenta.' },
  { id: 'ley-1581', categoria: 'app', termino: 'Autorización de datos (Ley 1581 de 2012)', definicion: 'Ley colombiana de protección de datos personales. Al ingresar autorizas guardar en la nube tu nombre, tu correo y los datos de tus lotes, solo para que puedas usarlos. Puedes borrarlos cuando quieras.', donde: 'Pantalla de ingreso.', alias: ['habeas data', 'datos personales'] },
  { id: 'asistente-tecnico', categoria: 'app', termino: 'Asistente técnico', definicion: 'Profesional del agro (agrónomo o técnico) que revisa el plan antes de aplicarlo. La app propone; esta persona y el productor deciden.', donde: 'Ficha del lote, plan e informe.', alias: ['agrónomo', 'técnico'] },
  { id: 'prototipo', categoria: 'app', termino: 'Prototipo académico', definicion: 'La app es un proyecto de formación del SENA (Grupo 1). No la uses como único registro de un cultivo real.', donde: 'Ingreso, pie de página e informes.', alias: ['SENA'] },

  // ---- Medidas y unidades ----
  { id: 'm2', categoria: 'medidas', termino: 'm² (metro cuadrado)', definicion: 'Un cuadrado de 1 metro por 1 metro. La app guarda el área de los lotes en m².', donde: 'Lote, análisis y plan.', alias: ['metro cuadrado', 'm2'] },
  { id: 'hectarea', categoria: 'medidas', termino: 'Hectárea (ha)', definicion: '10.000 m², un cuadrado de 100 m por 100 m. Las metas y las dosis se expresan por hectárea.', donde: 'Lote, plan e informe.', alias: ['ha'] },
  { id: 'fanegada', categoria: 'medidas', termino: 'Fanegada', definicion: '6.400 m², un cuadrado de 80 m por 80 m. Es la medida usual en Cundinamarca y Boyacá. 1 fanegada = 0,64 ha.', donde: 'Formulario del lote.' },
  { id: 'kg-ha', categoria: 'medidas', termino: 'kg/ha', definicion: 'Kilos por hectárea. Para saber cuánto va en tu lote: kg/ha × área del lote en m² ÷ 10.000.', ejemplo: '600 kg/ha en un lote de 6.400 m²: 600 × 6.400 ÷ 10.000 = 384 kg.', donde: 'Metas, dosis y equivalencias.', alias: ['kilos por hectárea'] },
  { id: 'g-cm3', categoria: 'medidas', termino: 'g/cm³', definicion: 'Gramos por centímetro cúbico. Es la unidad de la densidad aparente. 1 g/cm³ = 1.000 kg/m³.', donde: 'Análisis de suelo.' },
  { id: 'mg-kg', categoria: 'medidas', termino: 'mg/kg', definicion: 'Miligramos del nutriente por cada kilo de suelo. Es lo mismo que ppm.', donde: 'Análisis de suelo.' },
  { id: 'ppm', categoria: 'medidas', termino: 'ppm', definicion: 'Partes por millón. En un análisis de suelo, 1 ppm = 1 mg/kg. Si tu informe dice ppm, elige "mg/kg (ppm)".', donde: 'Informes de laboratorio.', alias: ['partes por millón'] },
  { id: 'cmol-kg', categoria: 'medidas', termino: 'cmol(+)/kg', definicion: 'Centimoles de carga por kilo de suelo. Mide cuánto retiene el suelo de los nutrientes con carga eléctrica, como potasio, calcio, magnesio, sodio y aluminio. Es igual a meq/100 g. La app no lo convierte a mg/kg porque la conversión es distinta para cada elemento.', donde: 'Análisis de suelo.', alias: ['centimoles'] },
  { id: 'meq', categoria: 'medidas', termino: 'meq/100 g', definicion: 'Miliequivalentes por cada 100 gramos de suelo. Tiene el mismo valor que cmol(+)/kg: 1 meq/100 g = 1 cmol(+)/kg. Si tu informe dice meq/100 g, elige "cmol(+)/kg (meq/100 g)".', donde: 'Informes de laboratorio.', alias: ['miliequivalentes'] },
  { id: 'porcentaje-etiqueta', categoria: 'medidas', termino: '% en la etiqueta', definicion: 'Porcentaje en peso: kilos del nutriente por cada 100 kg de producto.', ejemplo: 'Urea 46 % N: 100 kg de urea traen 46 kg de nitrógeno.', donde: 'Productos y plan.', alias: ['porcentaje'] },
  { id: 'bulto', categoria: 'medidas', termino: 'Bulto', definicion: 'Empaque del fertilizante, casi siempre de 50 kg. "Kg por bulto" es lo que pesa ese empaque. También se le dice presentación.', donde: 'Productos, plan e informe.', alias: ['presentación', 'kg por bulto'] },
  { id: 'bultos-exactos', categoria: 'medidas', termino: 'Bultos (número exacto)', definicion: 'La app muestra los bultos con decimales, por ejemplo 3,27. Al comprar se redondea a bultos enteros; esa decisión es tuya.', donde: 'Plan e informe.' },
  { id: 'pesos', categoria: 'medidas', termino: '$ (pesos colombianos)', definicion: 'Los precios y los costos se muestran en pesos colombianos, por ejemplo $ 150.000. Algunos documentos usan la sigla COP.', donde: 'Precios y costos.', alias: ['COP', 'pesos'] },
  { id: 'precio-por-kg', categoria: 'medidas', termino: 'Precio por kg', definicion: 'Precio del bulto dividido por los kg del bulto. Se usa para calcular el costo en los planes.', ejemplo: '$ 150.000 ÷ 50 kg = $ 3.000 por kg.', donde: 'Detalle del producto y plan.' },
  { id: 'punto-de-miles', categoria: 'medidas', termino: 'Coma decimal y punto de miles', definicion: 'La app usa coma para los decimales (1,5) y pide escribir los miles sin punto (1500, no 1.500), para no confundir mil quinientos con uno coma cinco.', donde: 'Todos los campos numéricos.', alias: ['decimales', 'miles'] },
  { id: 'notacion-cientifica', categoria: 'medidas', termino: 'Notación científica', definicion: 'Forma corta de escribir números muy pequeños: 1,5e-3 quiere decir 0,0015.', donde: 'Valores de nutrientes del análisis.' },

  // ---- Suelo y análisis ----
  { id: 'analisis-de-suelo', categoria: 'suelo', termino: 'Análisis de suelo', definicion: 'Informe del laboratorio con lo que tiene una muestra del suelo de tu lote: pH, nutrientes y otros datos. Es la base para proponer las metas del plan.', donde: 'Ficha del lote, paso 2.' },
  { id: 'muestra', categoria: 'suelo', termino: 'Muestra de suelo', definicion: 'Suelo recogido en varios puntos del lote y mezclado, para que represente todo el lote. Si la muestra no representa el lote, los resultados tampoco.', donde: 'Análisis de suelo.', alias: ['muestreo'] },
  { id: 'laboratorio', categoria: 'suelo', termino: 'Laboratorio', definicion: 'Entidad que analizó la muestra. Su nombre hace parte de la trazabilidad del análisis.', donde: 'Formulario del análisis.' },
  { id: 'profundidad', categoria: 'suelo', termino: 'Profundidad de muestreo', definicion: 'Hasta dónde se tomó la muestra, en centímetros; normalmente 20 cm. La app la usa como el grosor de la capa arable.', donde: 'Formulario del análisis.' },
  { id: 'capa-arable', categoria: 'suelo', termino: 'Capa arable', definicion: 'La capa de arriba del suelo, donde están casi todas las raíces y se mezcla el fertilizante. En la app es la capa que se muestreó: desde la superficie hasta la profundidad de la muestra.', donde: 'Detalle del análisis.' },
  { id: 'densidad-aparente', categoria: 'suelo', termino: 'Densidad aparente', definicion: 'Cuánto pesa un volumen de suelo tal como está en el campo, con sus poros. Se mide en g/cm³ y viene en algunos informes. Sin este dato la app no calcula equivalencias en kg/ha y no usa un valor supuesto.', donde: 'Formulario del análisis.' },
  { id: 'masa-de-suelo', categoria: 'suelo', termino: 'Masa de suelo de la capa arable', definicion: 'Kilos de suelo que hay en una hectárea dentro de la capa arable: 10.000 m² × profundidad (m) × densidad (kg/m³). Con esa masa, un resultado en mg/kg se puede expresar en kg por hectárea.', ejemplo: '20 cm y 1,1 g/cm³: 10.000 × 0,20 × 1.100 = 2.200.000 kg de suelo por hectárea. Un fósforo de 35 mg/kg equivale a 35 × 2.200.000 ÷ 1.000.000 = 77 kg de P por hectárea en la capa arable (no es una dosis).', donde: 'Detalle del análisis.' },
  { id: 'equivalencia-dimensional', categoria: 'suelo', termino: 'Equivalencia dimensional', definicion: 'Cambiar la unidad de un resultado del laboratorio, de mg/kg a kg/ha, usando la masa de suelo. No es una dosis de fertilizante ni lo que la planta puede aprovechar.', donde: 'Detalle del análisis ("Tu resultado en kilos por hectárea") e informe.', alias: ['tu resultado en kilos por hectárea'] },
  { id: 'disponible', categoria: 'suelo', termino: 'Disponible para la planta', definicion: 'Parte de un nutriente que la raíz puede tomar. Los métodos del laboratorio dan un indicador de esa parte, no la cantidad exacta; por eso la app no convierte el resultado en kilos que la planta tiene.', donde: 'Advertencias del análisis y del informe.', alias: ['aprovechable'] },
  { id: 'ph', categoria: 'suelo', termino: 'pH', definicion: 'Mide qué tan ácido o alcalino es el suelo, en una escala de 0 a 14: menos de 7 es ácido, 7 es neutro y más de 7 es alcalino. Influye en qué nutrientes puede tomar la planta.', donde: 'Formulario y detalle del análisis.', alias: ['acidez'] },
  { id: 'metodo-laboratorio', categoria: 'suelo', termino: 'Método del laboratorio', definicion: 'Procedimiento con el que el laboratorio sacó y midió cada nutriente. Con métodos distintos, los números no se pueden comparar. Suele aparecer junto al nombre del nutriente ("Fósforo Bray II") o en una nota al pie.', donde: 'Formulario del análisis.', alias: ['método de análisis', 'extractante'] },
  { id: 'bray-ii', categoria: 'suelo', termino: 'Bray II', definicion: 'Método para medir el fósforo, usado en suelos ácidos. La referencia de papa que usa la app (Castro Franco, 2005) da las metas de fósforo según el fósforo medido con Bray II.', donde: 'Método del laboratorio y sugerencias del plan.', alias: ['bray 2', 'bray'] },
  { id: 'olsen', categoria: 'suelo', termino: 'Olsen', definicion: 'Método para medir el fósforo, usado sobre todo en suelos neutros o alcalinos.', donde: 'Método del laboratorio.' },
  { id: 'mehlich-3', categoria: 'suelo', termino: 'Mehlich-3', definicion: 'Método que mide varios nutrientes a la vez: fósforo, potasio, calcio, magnesio y otros.', donde: 'Método del laboratorio.', alias: ['mehlich'] },
  { id: 'acetato-de-amonio', categoria: 'suelo', termino: 'Acetato de amonio', definicion: 'Método para medir potasio, calcio, magnesio y sodio intercambiables.', donde: 'Método del laboratorio.' },
  { id: 'walkley-black', categoria: 'suelo', termino: 'Walkley-Black', definicion: 'Método para estimar la materia orgánica del suelo.', donde: '"Otros métodos" del análisis.' },
  { id: 'dtpa', categoria: 'suelo', termino: 'DTPA', definicion: 'Método para medir micronutrientes como hierro, manganeso, cobre y zinc.', donde: '"Otros métodos" del análisis.' },
  { id: 'materia-organica', categoria: 'suelo', termino: 'Materia orgánica', definicion: 'Restos de plantas y animales descompuestos en el suelo. Ayuda a retener agua y nutrientes.', donde: '"Otros métodos" del análisis.' },
  { id: 'intercambiable', categoria: 'suelo', termino: 'Intercambiable', definicion: 'Nutriente pegado a las partículas del suelo que puede pasar al agua del suelo y a la raíz. Potasio, calcio y magnesio intercambiables se reportan en cmol(+)/kg.', donde: 'Informes de laboratorio y sugerencias del plan.' },
  { id: 'leer-archivo', categoria: 'suelo', termino: 'Leer el informe desde un archivo', definicion: 'La app intenta leer un PDF, una foto o un escaneo del informe. Muestra cada dato con la línea de donde salió y solo pasa al formulario lo que confirmas. Puede equivocarse: revisa cada número.', donde: 'Formulario de un análisis nuevo, "Adjuntar archivo".', alias: ['adjuntar archivo', 'foto', 'pdf'] },
  { id: 'area-al-registrar', categoria: 'suelo', termino: 'Área del lote al registrar', definicion: 'Área que se guarda junto con un análisis o un plan. Si después cambias el área del lote, ese análisis o plan conserva la suya. "Área histórica no registrada" quiere decir que no se guardó.', donde: 'Análisis y plan.', alias: ['área histórica', 'área guardada con el plan'] },
  { id: 'historial-de-analisis', categoria: 'suelo', termino: 'Historial de análisis', definicion: 'Lista de los análisis de un lote, del más reciente al más antiguo.', donde: 'Ficha del lote, paso 2.' },

  // ---- Nutrientes y formas químicas ----
  { id: 'nutriente', categoria: 'nutrientes', termino: 'Nutriente o elemento', definicion: 'Sustancia que la planta necesita para crecer. La app usa su nombre y su símbolo: nitrógeno (N), fósforo (P), potasio (K) y otros.', donde: 'Análisis, productos y metas.', alias: ['elemento'] },
  { id: 'npk', categoria: 'nutrientes', termino: 'Nutrientes principales: N, P y K', definicion: 'Nitrógeno, fósforo y potasio. Son los que la planta usa en mayor cantidad y la base del plan de fertilización.', donde: 'Plan.', alias: ['nitrógeno', 'fósforo', 'potasio', 'macronutrientes'] },
  { id: 'secundarios', categoria: 'nutrientes', termino: 'Nutrientes secundarios: Ca, Mg y S', definicion: 'Calcio, magnesio y azufre. Se necesitan en cantidades medianas.', donde: 'Análisis y productos.', alias: ['calcio', 'magnesio', 'azufre'] },
  { id: 'micronutrientes', categoria: 'nutrientes', termino: 'Micronutrientes: Fe, Mn, Cu, Zn y B', definicion: 'Hierro, manganeso, cobre, zinc y boro. Se necesitan en cantidades pequeñas.', donde: 'Análisis y productos.', alias: ['hierro', 'manganeso', 'cobre', 'zinc', 'boro', 'menores'] },
  { id: 'sodio-aluminio', categoria: 'nutrientes', termino: 'Sodio (Na) y aluminio (Al)', definicion: 'No son nutrientes de la papa. El laboratorio los reporta porque en exceso afectan el suelo y la raíz; el aluminio es común en suelos ácidos.', donde: 'Análisis.' },
  { id: 'forma-quimica', categoria: 'nutrientes', termino: 'Forma química', definicion: 'Cómo está escrito el nutriente: como elemento solo (P, K) o como compuesto (P₂O₅, K₂O). La misma cantidad de nutriente da números distintos según la forma. Por eso hay que copiar la forma exacta del informe o de la etiqueta, y la meta y el producto deben usar la misma.', donde: 'Análisis, productos y metas.' },
  { id: 'p-p2o5', categoria: 'nutrientes', termino: 'P y P₂O₅', definicion: 'P es el fósforo como elemento; así lo reportan muchos laboratorios. P₂O₅ (pentóxido de fósforo) es como lo expresan las etiquetas y muchas recomendaciones. Para el mismo fósforo dan números distintos. La app no convierte entre ellas: en el plan, la meta y el producto deben estar en la misma forma.', donde: 'Análisis, productos y metas.', alias: ['P2O5', 'fosfato', 'pentóxido'] },
  { id: 'k-k2o', categoria: 'nutrientes', termino: 'K, K⁺ y K₂O', definicion: 'K es el potasio como elemento; K⁺ es el potasio con carga, como lo reportan los laboratorios; K₂O (óxido de potasio) es como lo expresan las etiquetas. Para el mismo potasio dan números distintos, y la app no convierte entre ellas.', donde: 'Análisis, productos y metas.', alias: ['K2O', 'potasa'] },
  { id: 'n', categoria: 'nutrientes', termino: 'N', definicion: 'Nitrógeno expresado como elemento. Es la forma de las etiquetas y de las metas de nitrógeno.', donde: 'Productos y metas.' },
  { id: 'nitrato-amonio', categoria: 'nutrientes', termino: 'NO₃⁻ (nitrato) y NH₄⁺ (amonio)', definicion: 'Las dos formas de nitrógeno que toman las raíces. N-NO₃⁻ y N-NH₄⁺ indican el nitrógeno que hay dentro del nitrato o del amonio, expresado como N.', donde: 'Análisis.', alias: ['nitrato', 'amonio', 'NO3', 'NH4'] },
  { id: 'calcio-formas', categoria: 'nutrientes', termino: 'Ca²⁺ y CaO', definicion: 'Ca²⁺ es el calcio con carga, como lo reporta el laboratorio. CaO (óxido de calcio) es como lo expresan las etiquetas y las cales.', donde: 'Análisis y productos.', alias: ['CaO', 'cal'] },
  { id: 'magnesio-formas', categoria: 'nutrientes', termino: 'Mg²⁺ y MgO', definicion: 'Mg²⁺ es el magnesio con carga, como lo reporta el laboratorio. MgO (óxido de magnesio) es como lo expresan las etiquetas.', donde: 'Análisis y productos.', alias: ['MgO'] },
  { id: 'sulfato', categoria: 'nutrientes', termino: 'SO₄²⁻ (sulfato) y S-SO₄²⁻', definicion: 'El sulfato es la forma en que la planta toma el azufre. S-SO₄²⁻ es el azufre que hay dentro del sulfato, expresado como S. Algunas etiquetas usan SO₃.', donde: 'Análisis y productos.', alias: ['SO4', 'SO3'] },
  { id: 'iones-na-al', categoria: 'nutrientes', termino: 'Na⁺ y Al³⁺', definicion: 'Sodio y aluminio con carga, como los reportan los laboratorios en cmol(+)/kg.', donde: 'Análisis.' },
  { id: 'fosfato', categoria: 'nutrientes', termino: 'H₂PO₄⁻ (fosfato)', definicion: 'Una de las formas de fósforo que puede aparecer en un informe. Si tu informe usa una forma que la lista no tiene, elige "Otro / No reconocido" y escríbela tal cual.', donde: 'Análisis.', alias: ['H2PO4'] },
  { id: 'otro-no-reconocido', categoria: 'nutrientes', termino: 'Otro / No reconocido', definicion: 'Opción para un elemento o una forma que no está en la lista. Se guarda tal como lo escribes y la app no lo convierte.', donde: 'Análisis, productos y metas.', alias: ['otra forma'] },

  // ---- Plan de fertilización ----
  { id: 'plan', categoria: 'plan', termino: 'Plan de fertilización', definicion: 'Qué nutrientes aportar al lote, con qué productos, cuánto de cada uno y cuánto cuesta.', donde: 'Ficha del lote, paso 3.' },
  { id: 'propuesta', categoria: 'plan', termino: 'Propuesta', definicion: 'Primer estado de un plan. Se puede editar y eliminar.', donde: 'Estado del plan.' },
  { id: 'revisado', categoria: 'plan', termino: 'Revisado', definicion: 'Segundo estado. Una persona, idealmente el asistente técnico, revisó metas, fuentes y productos (botón "Ya se revisó este plan"). Ya no se edita; se puede aprobar o devolver a propuesta.', donde: 'Estado del plan.', alias: ['ya se revisó este plan'] },
  { id: 'aprobado', categoria: 'plan', termino: 'Aprobado', definicion: 'El plan queda como registro de lo que se va a aplicar (botón "Aprobar: este es el plan que voy a aplicar"): no se edita ni se elimina. Solo con un plan aprobado se registran aplicaciones y el plan sale en el informe.', donde: 'Estado del plan e informe.' },
  { id: 'devolver-a-propuesta', categoria: 'plan', termino: 'Devolver a propuesta', definicion: 'Saca un plan revisado para corregirlo. Conviene escribir en la nota qué hay que cambiar.', donde: 'Estado del plan.' },
  { id: 'copiar-propuesta', categoria: 'plan', termino: 'Copiar como nueva propuesta', definicion: 'Crea un plan nuevo con las mismas metas y productos de uno aprobado, por ejemplo si cambiaron los precios. El aprobado no cambia.', donde: 'Estado de un plan aprobado.' },
  { id: 'historial-del-plan', categoria: 'plan', termino: 'Historial del plan', definicion: 'Lista de cambios de estado con fecha, nombre y nota.', donde: 'Final del detalle del plan.' },
  { id: 'meta', categoria: 'plan', termino: 'Meta', definicion: 'Cuántos kilos por hectárea de un nutriente, en una forma química, quieres aportar. Todo el cálculo del plan parte de las metas. También aparece como "meta nutricional".', ejemplo: 'P₂O₅, 275 kg/ha.', donde: 'Formulario y detalle del plan.', alias: ['meta nutricional'] },
  { id: 'metas-propuestas', categoria: 'plan', termino: 'Metas que te propone la app', definicion: 'Rangos tomados de una referencia técnica según tu análisis de suelo y la zona del lote. Son una propuesta para revisar con tu asistente técnico.', donde: 'Formulario del plan.', alias: ['sugerencias'] },
  { id: 'rango', categoria: 'plan', termino: 'Rango', definicion: 'Valores mínimo y máximo que da la referencia para una meta.', ejemplo: '250 a 300 kg/ha de P₂O₅.', donde: 'Sugerencias del plan.' },
  { id: 'punto-medio', categoria: 'plan', termino: 'Punto medio del rango', definicion: 'El valor del centro: (mínimo + máximo) ÷ 2. Es el que la app pone en la meta al usar una sugerencia; puedes cambiarlo.', ejemplo: '(250 + 300) ÷ 2 = 275 kg/ha.', donde: 'Metas sugeridas.' },
  { id: 'fuente-tecnica', categoria: 'plan', termino: 'Fuente técnica', definicion: 'Documento, profesional o laboratorio de donde sale una meta. Toda meta necesita una para que la app calcule cantidades. También aparece como "referencia técnica".', donde: 'Metas del plan.', alias: ['referencia técnica', 'cita'] },
  { id: 'castro-franco', categoria: 'plan', termino: 'Castro Franco (2005)', definicion: 'Hugo E. Castro Franco, "Balance y prospectiva de la investigación en la fertilización de papa en Colombia", en las memorias de un taller nacional sobre nutrición de la papa (CEVIPAPA y Ministerio de Agricultura, Bogotá, 2005). Su Tabla 2 da rangos de N, P₂O₅ y K₂O para papa de alto rendimiento según el análisis y la región. El autor deja la decisión final al agrónomo de la zona.', donde: 'Sugerencias y metas del plan.' },
  { id: 'fecha-fuente', categoria: 'plan', termino: 'Fecha de la fuente', definicion: 'Fecha del documento citado. Sirve para ver si la referencia es antigua.', donde: 'Metas del plan.' },
  { id: 'tipo-fuente', categoria: 'plan', termino: 'Tipo de fuente', definicion: 'De dónde viene la referencia: oficial colombiana, académica colombiana, de la región andina o internacional.', donde: 'Sugerencias del plan.' },
  { id: 'pendiente-verificar', categoria: 'plan', termino: 'Pendiente de verificar', definicion: 'Dato de una referencia o de un registro que una persona del equipo todavía no confirmó contra el documento original.', donde: 'Sugerencias del plan y catálogo de fertilizantes.', alias: ['por verificar'] },
  { id: 'zona', categoria: 'plan', termino: 'Zona del lote', definicion: 'Región de la referencia técnica. Para papa hay dos: "Subpáramos de Cundinamarca y Boyacá" y "Altiplano Cundiboyacense, Nariño y Antioquia". La zona cambia los rangos de nitrógeno, fósforo y potasio. Se guarda en el lote (en «Editar información» o desde el plan) para no elegirla en cada propuesta.', donde: 'Formulario del lote y sugerencias del plan.', alias: ['región'] },
  { id: 'subparamo', categoria: 'plan', termino: 'Subpáramo', definicion: 'Franja de alta montaña que está justo debajo del páramo.', donde: 'Zona del lote.' },
  { id: 'analisis-para-metas', categoria: 'plan', termino: 'Análisis para proponer las metas', definicion: 'El análisis de suelo que la app usa para proponer las metas. Para papa necesita fósforo en mg/kg medido con Bray II y potasio en cmol(+)/kg. En una propuesta nueva, la app elige el análisis más reciente; arriba de las sugerencias muestra qué falta, si falta algo. Las cantidades se calculan con las metas guardadas, no directamente con el análisis.', donde: 'Formulario y detalle del plan.', alias: ['análisis de referencia'] },
  { id: 'rendimiento', categoria: 'plan', termino: 'Rendimiento esperado', definicion: 'Cosecha que se espera por hectárea, por ejemplo en toneladas por hectárea. Cambia cuánto fertilizante necesita el cultivo; la referencia de papa que usa la app es para alto rendimiento.', donde: 'Advertencias del informe.' },
  { id: 'producto-meta', categoria: 'plan', termino: 'Producto para esta meta', definicion: 'El fertilizante elegido para cubrir una meta. Cada meta con su producto forma una línea del plan.', donde: 'Formulario del plan.' },
  { id: 'dosis', categoria: 'plan', termino: 'Dosis (kg/ha de producto)', definicion: 'Kilos de producto por hectárea: meta ÷ (% de la etiqueta ÷ 100).', ejemplo: '275 kg/ha de P₂O₅ con un producto de 46 % P₂O₅: 275 ÷ 0,46 ≈ 598 kg/ha de producto.', donde: 'Detalle del plan e informe.', alias: ['cantidad'] },
  { id: 'kg-en-el-lote', categoria: 'plan', termino: 'Kg en el lote', definicion: 'Kilos de producto para todo el lote: dosis × área del lote en m² ÷ 10.000.', donde: '"Qué comprar y aplicar" e informe.' },
  { id: 'costo-estimado', categoria: 'plan', termino: 'Costo estimado', definicion: 'Kilos del lote × precio por kg. El costo total estimado suma todos los productos. Depende de los precios registrados y de su fecha.', donde: 'Plan e informe.', alias: ['costo total estimado'] },
  { id: 'tambien-aporta', categoria: 'plan', termino: 'También aporta', definicion: 'Otros nutrientes que trae el producto además del de la meta.', ejemplo: 'El DAP elegido por el fósforo también aporta nitrógeno.', donde: 'Cálculo del plan.', alias: ['aporte acompañante'] },
  { id: 'diferencia-meta', categoria: 'plan', termino: 'Diferencia con la meta', definicion: 'Compara lo que aportan todos los productos del plan con cada meta. Negativa quiere decir que falta; positiva, que se pasa. La app no juzga si la diferencia es adecuada.', donde: 'Resumen por forma química del plan.', alias: ['resumen por forma química', 'aportado'] },
  { id: 'aporte-adicional', categoria: 'plan', termino: 'Aporte adicional (sin meta)', definicion: 'Nutriente que aportan los productos aunque no haya una meta para él.', donde: 'Informe.' },
  { id: 'formas-distintas', categoria: 'plan', termino: 'Formas químicas distintas', definicion: 'Aviso cuando la meta y la etiqueta usan formas diferentes, por ejemplo meta en P y etiqueta en P₂O₅. Esa línea no se calcula.', donde: 'Formulario y detalle del plan.', alias: ['esta meta no se calculará'] },
  { id: 'copia-guardada', categoria: 'plan', termino: 'Copia guardada en el plan', definicion: 'El plan guarda los datos del producto (composición y precio) del momento en que se eligió. Si después cambias el producto en Mis productos, el plan no cambia; puedes elegir "datos actuales del catálogo" para actualizarlo.', donde: 'Formulario del plan.', alias: ['datos actuales del catálogo'] },
  { id: 'prescripcion', categoria: 'plan', termino: 'Propuesta, no prescripción', definicion: 'Una prescripción es una indicación técnica de un profesional. La app solo propone; antes de aplicar, el plan se revisa con el asistente técnico.', donde: 'Ficha del lote y plan.', alias: ['prescripción'] },

  // ---- Fertilizantes y productos ----
  { id: 'fertilizante', categoria: 'productos', termino: 'Fertilizante', definicion: 'Producto que aporta nutrientes al suelo o a la planta.', donde: 'Productos.', alias: ['abono'] },
  { id: 'mis-productos', categoria: 'productos', termino: 'Mis productos', definicion: 'Tu catálogo personal de fertilizantes, con los datos de su etiqueta y su precio. Sirve para todos tus lotes.', donde: 'Productos.' },
  { id: 'buscar-fertilizantes', categoria: 'productos', termino: 'Buscar fertilizantes', definicion: 'Lista de más de 4.000 fertilizantes para aplicar al suelo con registro vigente del ICA. Se busca por nombre, empresa o grado y se agregan a Mis productos con un toque. También aparece como "catálogo de referencia".', donde: 'Productos y formulario de producto.', alias: ['catálogo de referencia'] },
  { id: 'etiqueta', categoria: 'productos', termino: 'Etiqueta', definicion: 'Lo impreso en el bulto: nombre, composición garantizada y registro ICA. Si no coincide con el catálogo, vale la etiqueta.', donde: 'Productos.' },
  { id: 'ica', categoria: 'productos', termino: 'ICA', definicion: 'Instituto Colombiano Agropecuario. Registra y controla los fertilizantes que se venden en Colombia.', donde: 'Productos y plan.' },
  { id: 'registro-ica', categoria: 'productos', termino: 'Registro ICA', definicion: 'Número con el que el ICA autoriza la venta de un fertilizante. Aparece en la etiqueta.', donde: 'Productos y catálogo.' },
  { id: 'registro-vigente', categoria: 'productos', termino: 'Registro vigente', definicion: 'Registro activo en el listado del ICA de la fecha indicada (1 de noviembre de 2026).', donde: 'Catálogo de fertilizantes.' },
  { id: 'composicion-garantizada', categoria: 'productos', termino: 'Composición garantizada', definicion: 'Porcentajes de cada nutriente que el fabricante garantiza en el registro.', donde: 'Catálogo de fertilizantes.' },
  { id: 'grado', categoria: 'productos', termino: 'Grado (N-P-K)', definicion: 'Los tres números del nombre de muchos fertilizantes: porcentaje de N, P₂O₅ y K₂O, en ese orden.', ejemplo: '10-30-10: 10 % de N, 30 % de P₂O₅ y 10 % de K₂O.', donde: 'Búsqueda de fertilizantes.', alias: ['NPK', '15-15-15', '10-30-10'] },
  { id: 'urea', categoria: 'productos', termino: 'Urea', definicion: 'Fertilizante de nitrógeno, grado 46-0-0 (46 % de N).', donde: 'Búsqueda de fertilizantes.' },
  { id: 'dap', categoria: 'productos', termino: 'DAP (fosfato diamónico)', definicion: 'Fertilizante de fósforo y nitrógeno, grado 18-46-0.', donde: 'Búsqueda de fertilizantes.', alias: ['fosfato diamónico'] },
  { id: 'sulfato-fertilizante', categoria: 'productos', termino: 'Sulfato', definicion: 'En el nombre de un fertilizante (sulfato de amonio, sulfato de potasio…), indica que además del nutriente principal aporta azufre.', donde: 'Búsqueda de fertilizantes.' },
  { id: 'empresa', categoria: 'productos', termino: 'Empresa, fabricante, importador y distribuidor', definicion: 'Quién tiene el registro, quién produce el fertilizante, quién lo trae al país y quién lo vende.', donde: 'Ficha de un fertilizante del catálogo.', alias: ['fabricante', 'importador', 'distribuidor'] },
  { id: 'tipo-producto', categoria: 'productos', termino: 'Tipo de producto', definicion: 'Clase con la que se registró el producto ante el ICA.', donde: 'Ficha de un fertilizante del catálogo.' },
  { id: 'presentacion-fisica', categoria: 'productos', termino: 'Presentación física', definicion: 'Cómo viene el producto: sólido, líquido, granulado u otra.', donde: 'Ficha de un fertilizante del catálogo.' },
  { id: 'uso-registrado', categoria: 'productos', termino: 'Uso y cultivos registrados', definicion: 'Para qué uso y en qué cultivos autoriza el registro el producto.', donde: 'Ficha de un fertilizante del catálogo.' },
  { id: 'dosis-registrada', categoria: 'productos', termino: 'Dosis registrada', definicion: 'Dosis que declara el fabricante en la etiqueta y en el registro. No la calcula la app y puede ser distinta de la del plan.', donde: 'Ficha de un fertilizante del catálogo.' },
  { id: 'epoca-aplicacion', categoria: 'productos', termino: 'Época o frecuencia de aplicación', definicion: 'Cuándo o cada cuánto aplicar el producto, según el registro.', donde: 'Ficha de un fertilizante del catálogo.' },
  { id: 'empaques', categoria: 'productos', termino: 'Empaques registrados', definicion: 'Tamaños de empaque autorizados para el producto.', donde: 'Ficha de un fertilizante del catálogo.' },
  { id: 'aplicacion-al-suelo', categoria: 'productos', termino: 'Aplicación al suelo', definicion: 'El fertilizante se pone en la tierra. Es distinto de la aplicación foliar, que se rocía sobre las hojas. El catálogo de la app solo incluye fertilizantes de aplicación al suelo.', donde: 'Catálogo de fertilizantes.', alias: ['foliar'] },
  { id: 'dane', categoria: 'productos', termino: 'DANE', definicion: 'Departamento Administrativo Nacional de Estadística. Publica precios de referencia de insumos agrícolas.', donde: 'Catálogo y sugerencias de fertilizantes.' },
  { id: 'sipsa', categoria: 'productos', termino: 'SIPSA', definicion: 'Sistema de Información de Precios y Abastecimiento del Sector Agropecuario, del DANE. De ahí salen los precios promedio de fertilizantes por departamento.', donde: 'Fuente del catálogo.' },
  { id: 'precio-departamento', categoria: 'productos', termino: 'Precio promedio por departamento', definicion: 'Precio de referencia de un mes publicado por el DANE. Puede ser distinto del de tu almacén.', donde: 'Catálogo y sugerencias de fertilizantes.', alias: ['precio DANE'] },
  { id: 'fuente-precio', categoria: 'productos', termino: 'Fecha y fuente del precio', definicion: 'Cuándo y de dónde sale el precio: factura, almacén o DANE. Se piden porque los precios cambian.', donde: 'Formulario de producto.' },
  { id: 'por-verificar-composicion', categoria: 'productos', termino: 'Por verificar (composición)', definicion: 'La composición del registro no coincide del todo con el grado del nombre, o falta un dato. Revisa la etiqueta del bulto antes de usarlo.', donde: 'Catálogo de fertilizantes.' },
  { id: 'agregar-y-usar', categoria: 'productos', termino: 'Agregar y usar', definicion: 'Agrega un fertilizante del ICA a Mis productos y lo elige para la meta, en un toque.', donde: 'Formulario del plan.' },

  // ---- Seguimiento, cosecha e informes ----
  { id: 'seguimiento', categoria: 'seguimiento', termino: 'Seguimiento', definicion: 'Registro manual de lo que pasa en el lote: aplicaciones, observaciones y tareas. No es una medición ni un sensor.', donde: 'Ficha del lote, paso 4.' },
  { id: 'aplicacion', categoria: 'seguimiento', termino: 'Aplicación', definicion: 'Registro de una vez que se aplicó un producto del plan aprobado: fecha, kilos, costo real y quién lo hizo.', donde: '"Lo aplicado frente al plan", dentro del plan aprobado.' },
  { id: 'fracciones', categoria: 'seguimiento', termino: 'Aplicación en partes (fracciones)', definicion: 'Aplicar la cantidad del plan en varias veces, por ejemplo una parte a la siembra y otra después. Cada parte se registra como una aplicación.', donde: 'Aplicaciones.', alias: ['fracción', 'fraccionar'] },
  { id: 'cantidad-aplicada', categoria: 'seguimiento', termino: 'Cantidad aplicada', definicion: 'Kilos del producto que se aplicaron, no del nutriente.', donde: 'Formulario de aplicación.' },
  { id: 'costo-real', categoria: 'seguimiento', termino: 'Costo real', definicion: 'Lo que pagaste, escrito por ti. Es distinto del costo estimado del plan.', donde: 'Aplicaciones e informe.', alias: ['costo registrado'] },
  { id: 'planeado', categoria: 'seguimiento', termino: 'Planeado en el lote', definicion: 'Kilos del producto que dice el plan aprobado para todo el lote.', donde: 'Lo aplicado frente al plan.' },
  { id: 'avance', categoria: 'seguimiento', termino: 'Avance', definicion: 'Qué parte de lo planeado ya se aplicó: aplicado ÷ planeado × 100.', ejemplo: '192 kg aplicados de 384 kg planeados: 50 %.', donde: 'Lo aplicado frente al plan e informe.' },
  { id: 'falta-por-aplicar', categoria: 'seguimiento', termino: 'Falta por aplicar · Se aplicó de más', definicion: 'Diferencia entre lo planeado y lo aplicado. La app solo hace la resta; no juzga si está bien.', donde: 'Lo aplicado frente al plan.', alias: ['se aplicó de más'] },
  { id: 'antes-aprobacion', categoria: 'seguimiento', termino: 'Antes de la aprobación', definicion: 'Etiqueta de una aplicación con fecha anterior a la aprobación del plan.', donde: 'Lista de aplicaciones.' },
  { id: 'observacion', categoria: 'seguimiento', termino: 'Observación', definicion: 'Nota sobre lo que viste en el lote: plagas, color de las hojas, clima. La app no la interpreta ni hace diagnósticos.', donde: 'Seguimiento.' },
  { id: 'tarea', categoria: 'seguimiento', termino: 'Tarea', definicion: 'Recordatorio de algo por hacer en el lote, con fecha prevista. La app no envía notificaciones.', donde: 'Seguimiento, Mis lotes e informe.', alias: ['tareas pendientes', 'recordatorio'] },
  { id: 'estado-tarea', categoria: 'seguimiento', termino: 'Pendiente · Hecha · Fecha pasada', definicion: 'Estados de una tarea. "Fecha pasada" es una tarea pendiente cuya fecha prevista ya pasó. "Marcar como hecha hoy" la cierra con la fecha de hoy.', donde: 'Seguimiento.', alias: ['pendiente', 'hecha', 'vencida'] },
  { id: 'ciclo', categoria: 'seguimiento', termino: 'Ciclo de cultivo', definicion: 'Periodo desde la siembra hasta la cosecha (o el fin) de un cultivo en el lote.', donde: 'Historial del lote.' },
  { id: 'cultivo-actual', categoria: 'seguimiento', termino: 'Cultivo actual', definicion: 'El ciclo que está abierto en el lote.', donde: 'Historial del lote e informe.' },
  { id: 'cerrar-ciclo', categoria: 'seguimiento', termino: 'Cerrar ciclo', definicion: 'Al cosechar, guarda el ciclo en el historial y el lote empieza uno nuevo. No se borra nada: el historial ubica los registros por su fecha.', donde: 'Historial del lote, paso 5.', alias: ['cosecha'] },
  { id: 'como-termino', categoria: 'seguimiento', termino: 'Cómo terminó', definicion: 'Motivo del cierre: se cosechó, se perdió el cultivo u otro motivo.', donde: 'Cierre de ciclo.' },
  { id: 'resultado-notas', categoria: 'seguimiento', termino: 'Resultado y notas', definicion: 'Lo que quieras recordar del ciclo, como los bultos cosechados o una helada. La app no calcula rendimientos.', donde: 'Cierre de ciclo.' },
  { id: 'historial-del-lote', categoria: 'seguimiento', termino: 'Historial del lote', definicion: 'Los cultivos que ha tenido el lote y lo registrado en cada uno, para comparar con ciclos anteriores.', donde: 'Ficha del lote, paso 5.' },
  { id: 'quitar-historial', categoria: 'seguimiento', termino: 'Quitar del historial', definicion: 'Elimina el cierre de un ciclo. Sus análisis, planes y registros no se borran: pasan a mostrarse en el ciclo siguiente.', donde: 'Historial del lote.' },
  { id: 'informe-productor', categoria: 'seguimiento', termino: 'Informe para el productor', definicion: 'Resumen para imprimir o guardar en PDF de un lote: datos, último análisis, plan aprobado, lo aplicado y el seguimiento del cultivo actual.', donde: 'Botón arriba en la ficha del lote.', alias: ['informe', 'PDF'] },
  { id: 'informe-todos', categoria: 'seguimiento', termino: 'Informe de todos los lotes', definicion: 'El mismo informe para todos tus lotes, con una tabla de resumen al inicio.', donde: 'Mis lotes.' },
  { id: 'imprimir-pdf', categoria: 'seguimiento', termino: 'Imprimir o guardar como PDF', definicion: 'Abre la ventana de impresión del dispositivo. Para tener el archivo, elige "Guardar como PDF" como impresora.', donde: 'Informes.' },
  { id: 'plan-aprobado-informe', categoria: 'seguimiento', termino: 'Plan aprobado: qué aplicar', definicion: 'Sección del informe con los fertilizantes del plan aprobado más reciente: dosis por hectárea, kilos para el lote, bultos y costo.', donde: 'Informe.' }
];

/** Texto sin tildes, sin mayúsculas y con subíndices como números ("P₂O₅" → "p2o5"), para buscar. */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[₀-₉]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x2080 + 48))
    .replace(/[⁰¹²³⁴-⁹]/g, c => ({ '⁰': '0', '¹': '1', '²': '2', '³': '3' } as Record<string, string>)[c] ?? String.fromCharCode(c.charCodeAt(0) - 0x2070 + 48))
    .replace(/[⁺⁻]/g, '')
    .toLowerCase()
    .trim();
}

/** Sin espacios ni signos que se escriben de muchas formas: "Ca2+", "Ca²⁺" y "Ca 2" quedan "ca2"; "meq/100g", "meq100g". */
function compactar(texto: string): string {
  return normalizarBusqueda(texto).replace(/[\s+\-/().,;:]/g, '');
}

/**
 * Términos que contienen todas las palabras buscadas (en el nombre, los alias o la definición). Van
 * primero los que se llaman así o empiezan por lo buscado (p. ej. "K+" encuentra "K, K⁺ y K₂O" antes
 * que "Nutrientes principales: N, P y K"), luego los que tienen esas palabras en el nombre o un alias,
 * luego los que las contienen en el nombre y al final los que las contienen en el texto; dentro de
 * cada grupo, en el orden del glosario. Sin texto, todos los de la categoría.
 */
export function buscarEnGlosario(texto: string, categoria?: CategoriaGlosario): TerminoGlosario[] {
  const palabras = normalizarBusqueda(texto).split(/\s+/).filter(Boolean)
    .map(p => ({ normal: p, compacta: compactar(p) })).filter(p => p.compacta);
  const lista = GLOSARIO.filter(t => !categoria || t.categoria === categoria);
  if (!palabras.length) return [...lista];
  const consulta = palabras.map(p => p.compacta).join('');
  const puntuados = lista.flatMap(t => {
    const nombres = [t.termino, ...(t.alias ?? [])];
    const piezasDe = (n: string) => normalizarBusqueda(n).split(/[\s,;:]+/).map(compactar).filter(Boolean);
    const piezas = new Set(nombres.flatMap(piezasDe));
    const exacto = nombres.some(n => compactar(n) === consulta || (palabras.length === 1 && piezasDe(n)[0] === consulta));
    const nombreCompacto = nombres.map(compactar).join('|');
    const texto = normalizarBusqueda([...nombres, t.definicion, t.ejemplo ?? '', t.donde ?? ''].join(' '));
    const enNombre = (p: typeof palabras[number]) => nombreCompacto.includes(p.compacta);
    if (!palabras.every(p => enNombre(p) || texto.includes(p.normal))) return [];
    const puntos = exacto ? 4 : palabras.every(p => piezas.has(p.compacta)) ? 3 : palabras.every(enNombre) ? 2 : 1;
    return [{ t, puntos }];
  });
  // sort es estable: a igual puntaje se conserva el orden del glosario.
  return puntuados.sort((a, b) => b.puntos - a.puntos).map(x => x.t);
}

/** Término por su id (para las ayudas "?" de la interfaz). */
export function terminoGlosario(id: string): TerminoGlosario | undefined {
  return GLOSARIO.find(t => t.id === id);
}
