# AgroFerti MIC — Grupo 1 SENA

Aplicación web progresiva (PWA) **multicultivo** para preparar el cálculo, la explicación y el monitoreo de fertilización, empezando por **papa** como cultivo piloto.

## Estado actual: fases 1 a 3 completas / lotes, suelo, catálogo de productos y plan de fertilización

**Fase 1 (lotes)**
✅ Registro de lotes: crear, editar, eliminar y consultar.
✅ Cultivos: papa, lechuga, kale, arveja y otro.
✅ Registro de área (m², con coma o punto decimal y vista previa de cómo se interpretó el número), fecha de siembra y ubicación; conversión de m² a hectáreas. Escrituras ambiguas como `1.500` o `1,500` se rechazan y se pide `1500` (o `1,5` si es un decimal).
✅ Datos persistentes en el navegador (IndexedDB + Dexie), interfaz adaptable y configuración PWA.

**Fase 2 (análisis de suelo, dentro de la ficha de cada lote)**
✅ Registrar, consultar, editar y eliminar (con confirmación) análisis de suelo por lote, sin mezclar lotes.
✅ Fecha (válida y no futura), profundidad (cm), densidad aparente (g/cm³, opcional), pH (0–14, opcional), laboratorio, método y observaciones.
✅ Nutrientes con elemento, forma química, valor y unidad (`mg/kg` o `cmol(+)/kg`), guardados tal como los reporta el laboratorio.
✅ Catálogo de notación química: detecta combinaciones incoherentes (p. ej. Fósforo / K₂O). P y P₂O₅, K y K₂O son formas distintas y nunca se convierten. La opción **Otro / No reconocido** conserva el texto original.
✅ Decimales con coma o punto y notación científica estricta (`1,5e-3`, `1e-21`); rechazo de negativos, ceros donde no aplican, valores no finitos, y resultados que desbordan o se pierden como cero (subdesbordamiento).
✅ Edición sin pérdida de precisión: el texto editable de cualquier número guardado se recupera exactamente igual. Los resultados redondeados para mostrarlos llevan "≈"; los datos ingresados se muestran completos.
✅ Equivalencia dimensional de la concentración reportada, explicada paso a paso: masa de suelo (kg/ha), mg/kg → kg/ha y total del lote. Sin densidad aparente no se calcula nada que dependa de ella; `cmol(+)/kg` no se convierte.
✅ **Trazabilidad del área:** cada análisis guarda el área del lote al registrarse (`areaM2AlRegistro`). Cambiar el área del lote no altera resultados históricos; al editar solo se actualiza si el usuario lo marca. Los análisis sin esa área muestran "Área histórica no registrada".
✅ **Trazabilidad del laboratorio:** "Análisis documentado" vs. "Registro incompleto"; aviso de trazabilidad pendiente si hay nutrientes sin método. No se completa ningún dato automáticamente.
✅ Registros antiguos o dañados (null, NaN, arrays dispersos, estructuras inesperadas) se muestran con advertencia y su valor original; solo se suspenden los cálculos afectados. Consultar no modifica los registros.
✅ Editar un registro dañado no borra nada en silencio: cada dato dañado se precarga para corregirlo y exige una confirmación expresa (corregir, o descartar si se deja vacío). Sin todas las confirmaciones no se guarda; el original queda intacto hasta que el guardado validado termina. Los campos de otras versiones se conservan.
✅ Validación doble: en el formulario y otra vez antes de escribir en IndexedDB (lote existente, análisis del mismo lote, solo campos admitidos).
✅ 60 pruebas automáticas al cierre (cálculos, validación del área y del análisis, catálogo, registros dañados, arrays dispersos, precisión numérica, desbordamientos y persistencia).

**Fase 3 (fertilizantes y plan) — 3a: modelo, cálculos y persistencia, todavía sin interfaz**
✅ Catálogo de productos común a todos los lotes, según la etiqueta: contenido declarado por forma química (p. ej. P₂O₅ 46 %), kg y precio del bulto con su fecha, y marca **EJEMPLO** para datos ficticios.
✅ Plan por lote con metas escritas por el usuario (nutriente, forma química, kg/ha, **fuente técnica y fecha obligatorias**) y una línea de producto por meta. La app no propone metas, productos ni dosis, y el análisis de suelo no entra en ningún cálculo.
✅ Cantidad (kg/ha y kg en el lote), precio por kg, costo, bultos exactos y aportes acompañantes (p. ej. el N del DAP). Resumen por forma química: meta frente a la suma de aportes, sin ajustar nada.
✅ **Sin conversiones químicas:** solo se calcula si la forma de la meta coincide con la de la etiqueta. Si la meta está en P y la etiqueta en P₂O₅, no se calcula y se explica por qué.
✅ Estados propuesta → revisado → aprobado, con historial (fecha, nombre escrito por el usuario y nota). Un plan aprobado es de solo lectura y no se elimina; para cambiarlo se copia como nueva propuesta. Lo aplicado se registrará en la fase 4.
✅ Trazabilidad: el plan guarda el área del lote al crearse y una copia de cada producto; editar o borrar el producto del catálogo no altera los planes.
✅ Base de datos versión 2 (`db.version(2)`): solo agrega la tabla `productos`. Verificado con Dexie real que una base de la versión 1 se abre sin cambiar lotes ni análisis.
✅ 89 pruebas automáticas al cerrar 3a.

**Fase 3 — 3b: catálogo de productos (pantalla "Productos" en la barra superior)**
✅ Crear, consultar, editar y eliminar (con confirmación) productos según su etiqueta. El catálogo es común a todos los lotes.
✅ Contenido declarado con elemento, forma química (lista del catálogo u "Otra forma" escrita tal cual) y porcentaje. Rechaza combinaciones incoherentes (Fósforo / K₂O), formas repetidas, 0 % y más de 100 %.
✅ Es obligatorio indicar si los datos vienen de una etiqueta real o son de **EJEMPLO**; los de ejemplo se marcan en la lista y en el detalle.
✅ Kg y precio del bulto rechazan escrituras ambiguas como `150.000` (en COP se leería como 150) y piden `150000`. El precio exige los kg del bulto y la fecha del precio. Vista previa: "Bulto de 50 kg a 150.000 COP: equivale a 3.000 COP por kg".
✅ Detalle con datos ingresados y el precio por kg explicado. Un producto con datos dañados se muestra con su valor original y solo se reemplaza con confirmación expresa.
✅ 93 pruebas automáticas al cerrar 3b. Una revisión de código posterior encontró 10 puntos (entre ellos, que vaciar un nutriente guardado lo borraba sin aviso); todos están corregidos.

**Fase 3 — 3c: plan de fertilización (sección "Plan de fertilización" en la ficha del lote)**
✅ Crear, consultar, editar y eliminar (con confirmación) propuestas de plan por lote.
✅ Cada meta se escribe con nutriente, forma química, kg/ha, **fuente técnica, fecha de la fuente** y origen (fuente real o EJEMPLO). La app no propone metas, no las deduce del análisis de suelo y rechaza escrituras ambiguas como `1.200`.
✅ Un producto del catálogo por meta. El formulario muestra lo que declara la etiqueta y avisa si la meta no se podrá calcular (p. ej. meta en P con etiqueta en P₂O₅). El plan guarda una copia del producto: editar o borrar el producto del catálogo no lo altera.
✅ Detalle con cada operación explicada: kg/ha de producto, kg en el lote, bultos exactos, precio por kg, costo y aportes acompañantes; resumen por forma química (meta, aportado y diferencia aritmética) y costo total solo si todos los productos tienen costo.
✅ Análisis de suelo de referencia opcional, mostrado solo como contexto.
✅ El plan guarda el área del lote al crearse; al editar solo se actualiza si el usuario lo marca.
✅ Si el producto cambia en el catálogo, el plan conserva su copia y al editar avisa del cambio; para usar los datos nuevos se elige "datos actuales del catálogo". Si se elimina el análisis de referencia, el plan se sigue editando y copiando (queda sin referencia, con aviso).
✅ 105 pruebas automáticas en total. Recorrido en Chrome: 59 comprobaciones. Una revisión de código encontró 10 puntos en 3c; todos están corregidos.

**Fase 3 — 3d: estados del plan (panel "Estado del plan" al final del detalle)**
✅ Propuesta → revisado → aprobado, y devolver un plan revisado a propuesta. Cada cambio pide el nombre de quien lo registra (escrito por el usuario; la app no verifica identidades ni certifica aprobaciones técnicas) y una nota opcional.
✅ Revisar o aprobar exige al menos una meta, **un producto en cada meta** y la cantidad calculada de cada producto. Antes, la app explica qué falta (p. ej. "La meta de Potasio (K₂O) no tiene producto" o una meta cuya forma no coincide con la etiqueta) y no deja continuar.
✅ Un plan revisado ya no se edita; uno aprobado es de solo lectura y no se elimina. Para cambiar un plan aprobado se crea una copia como nueva propuesta ("… (copia)"), con el área actual del lote y un enlace al plan original.
✅ Historial visible con estado, fecha y hora, nombre y nota de cada cambio. Lo aplicado en campo no es un estado del plan: se registrará en la fase 4.
✅ 107 pruebas automáticas. Recorrido en Chrome: 72 comprobaciones. Una revisión de código encontró 9 puntos en 3d (entre ellos, que "Cancelar" no detenía una aprobación en curso y que se podía aprobar con metas sin producto); todos están corregidos.

**No implementado aún:** seguimiento de aplicaciones y plan frente a lo aplicado (fase 4), reportes PDF y respaldo de información (fase 5).

## Requisitos

- Node.js **22.12 o superior** (recomendado Node 22 LTS compatible con Vite).
- npm y Git. **VS Code no es necesario:** puedes hacer todo desde Terminal / PowerShell usando Claude Code y Codex CLI.
- Internet **solo para instalar paquetes y publicar**; en producción se prevé soporte offline de recursos estáticos tras una primera visita.

## Ejecutar (computador)

1. Descomprime la carpeta `agroferti-mic` en el computador.
2. Abre **PowerShell** en Windows o **Terminal** en macOS.
3. Usa `cd` para entrar en la carpeta `agroferti-mic`.
4. Ejecuta exactamente:

```bash
npm install
npm run dev
```

5. Abre en el navegador la dirección que muestre Vite, normalmente **http://localhost:5173**.
6. Haz clic en **Crear mi primer lote** y guarda un lote de papa.
7. Recarga la página: el lote debe seguir apareciendo.

### Pruebas y compilación

```bash
npm run test
npm run build
npm run preview
```

`npm run test` ejecuta las pruebas con el ejecutor de Node (requiere Node 22.12 o superior). `npm run build` revisa TypeScript y genera `dist/` para publicar. En PowerShell de Windows puede ser necesario usar `npm.cmd run test` y `npm.cmd run build`.

Las pruebas de persistencia (`tests/persistencia.test.ts`) usan un almacén en memoria con las mismas reglas que `src/lib/repositorioAnalisis.ts`; Dexie e IndexedDB reales se verifican manualmente en el navegador.

### Pruebas manuales en navegador (fase 2)

1. Crea un lote de **500 m²** y abre su ficha. En **Análisis de suelo**, pulsa **+ Agregar análisis**.
2. Registra profundidad `20`, densidad `1,2`, laboratorio y método (datos de **EJEMPLO**) y Fósforo / P / `20` / mg/kg. Debe mostrar 2.400.000 kg de suelo/ha, 48 kg de P por ha y 2,4 kg de P en el lote, con el estado **Análisis documentado**.
3. Edita el lote y cambia el área a 1.000 m². El análisis debe seguir mostrando 500 m² y 2,4 kg. Edita el análisis, marca **Usar el área actual del lote** y guarda: ahora debe mostrar 4,8 kg.
4. Intenta guardar Fósforo con la forma "Otra forma / No reconocida" escribiendo `K2O`: debe rechazarse. Con `H₂PO₄⁻` debe guardarse con la etiqueta "No reconocida".
5. Borra el método de laboratorio: el análisis debe pasar a **Registro incompleto** con aviso de trazabilidad pendiente.
6. Deja la densidad vacía: debe aparecer "Falta un dato para calcular" y no mostrarse kg/ha.
7. Prueba pH `15`, densidad `0`, un valor negativo, una fecha futura y profundidad `1000000000000000` con densidad `1000`: deben mostrarse mensajes en rojo y no guardarse.
8. Recarga la página: los análisis siguen ahí. Crea un segundo lote y verifica que no ve los análisis del primero.
9. Elimina un análisis: debe pedir confirmación.
10. (Registros dañados) En DevTools → Application → IndexedDB → AgroFertiMIC → analisisSuelos, cambia `densidadGcm3` de un registro por un texto. Al recargar, el análisis debe mostrarse con "Hay datos guardados que deben corregirse" y el valor original, sin romper la pantalla.
11. Revisa la vista en ancho de teléfono (DevTools, 360 px).
12. Edita el registro dañado del paso 10 y pulsa **Guardar** sin marcar nada: debe pedir confirmación y no cambiar el registro. Corrige la densidad, marca las casillas y guarda: solo se descarta lo que confirmaste.
13. Escribe pH `1e-21`, guarda, vuelve a editar: debe precargarse `1e-21` (no `0`).

### Pruebas manuales en navegador (fase 3b, catálogo)

1. Pulsa **Productos** en la barra superior: debe aparecer "Aún no hay productos en el catálogo".
2. Registra "DAP EJEMPLO" con Nitrógeno / N / `18` y Fósforo / P₂O₅ / `46`, bulto de `50` kg, precio `150.000` y fecha del precio. Al guardar debe rechazar el precio ("Escribe 150000") y pedir que indiques si es etiqueta real o EJEMPLO. Al corregir cada dato, su mensaje rojo desaparece.
3. Escribe `150000` y elige **Son datos de EJEMPLO**: la vista previa debe decir "equivale a 3.000 COP por kg". Guarda: el detalle muestra la marca EJEMPLO, P₂O₅ 46 % tal cual y "150.000 COP ÷ 50 kg = 3.000 COP por kg".
4. Prueba Fósforo con la forma "Otra forma" escribiendo `K2O`: debe rechazarse porque corresponde a Potasio.
5. Edita el precio a `160000`: debe mostrar 3.200 COP por kg. Recarga la página: el producto sigue en el catálogo.
6. Elimina el producto: debe pedir confirmación.

### Pruebas manuales en navegador (fase 3c, plan)

1. Registra en el catálogo "DAP EJEMPLO" (N 18 %, P₂O₅ 46 %, bulto de 50 kg a 160000 COP) y "KCl EJEMPLO" (K₂O 60 %, sin precio).
2. En un lote de **1500,5 m²**, en **Plan de fertilización**, crea una propuesta. Meta 1: Fósforo / **P** / 100 kg/ha con fuente, fecha y origen EJEMPLO, producto DAP: debe avisar "Esta meta no se calculará". Cambia la forma a P₂O₅: el aviso desaparece y se ve "declara: N 18 % · P₂O₅ 46 %".
3. Meta 2: Potasio / K₂O / `1.200` con producto KCl: al guardar debe rechazar "1.200". Escribe `90` y guarda.
4. El detalle debe mostrar ≈ 217,39 kg/ha de DAP, ≈ 32,62 kg en el lote, ≈ 0,65 bultos, 3.200 COP por kg, ≈ 104.383 COP y ≈ 39,13 kg/ha de N acompañante; KCl: 150 kg/ha y ≈ 22,51 kg en el lote, sin costo por falta de precio; y "no se muestra un total parcial".
5. Edita la propuesta: la meta 2 se precarga con `90` y el producto como "copia guardada en el plan". Cambia el precio del DAP en el catálogo a `200000`: el plan sigue mostrando ≈ 104.383 COP; al editarlo avisa del cambio y, si eliges "datos actuales del catálogo", pasa a ≈ 130.478 COP.
6. Elimina DAP del catálogo y vuelve al plan: debe seguir mostrando DAP EJEMPLO con las mismas cifras.

### Pruebas manuales en navegador (fase 3d, estados)

1. En el detalle de la propuesta, en **Estado del plan**, pulsa **Marcar como revisado** y confirma sin nombre: debe pedir el nombre. Escribe un nombre y una nota: el plan queda **Revisado** y desaparece **Editar**.
2. Pulsa **Aprobar el plan**: desaparecen **Editar** y **Eliminar**, y el aviso dice que es de solo lectura. El historial muestra propuesta, revisado y aprobado con fecha, hora, nombre y nota.
3. Pulsa **Copiar como nueva propuesta**: se abre una propuesta editable con las mismas cifras, "Copia del plan «…»" en el historial y un enlace al plan original.
4. Crea una propuesta con una meta sin producto: **Marcar como revisado** queda deshabilitado con el motivo "La meta de … no tiene producto".

## Inicio exclusivo desde terminal

Consulta [INICIO_TERMINAL.md](./INICIO_TERMINAL.md) para instalar Node.js, Git, Claude Code y Codex CLI, y para trabajar desde varias pestañas de terminal sin un editor gráfico.

Claude Code lee `CLAUDE.md`; Codex lee `AGENTS.md`. Ambos archivos contienen instrucciones compartidas del proyecto.

## Estructura del proyecto

```text
agroferti-mic/
├─ public/              # Iconos de la PWA
├─ src/
│  ├─ components/
│  │  ├─ LoteForm.tsx              # Formulario del lote
│  │  ├─ AnalisisSueloSeccion.tsx  # Historial y flujo de análisis dentro del lote
│  │  ├─ AnalisisSueloForm.tsx     # Formulario de análisis de suelo
│  │  ├─ AnalisisSueloDetalle.tsx  # Datos ingresados, cálculos explicados y advertencias
│  │  ├─ ProductosSeccion.tsx      # Fase 3b: catálogo de productos (lista y flujo)
│  │  ├─ ProductoForm.tsx          # Fase 3b: formulario según la etiqueta
│  │  ├─ ProductoDetalle.tsx       # Fase 3b: datos de la etiqueta y precio por kg
│  │  ├─ PlanesSeccion.tsx         # Fase 3c: planes dentro de la ficha del lote
│  │  ├─ PlanForm.tsx              # Fase 3c: metas con su fuente y producto por meta
│  │  └─ PlanDetalle.tsx           # Fase 3c: cálculo del plan explicado paso a paso
│  ├─ lib/
│  │  ├─ calculos.ts            # Matemáticas verificables, sin prescribir dosis
│  │  ├─ validacion.ts          # Validaciones puras y verificación de registros guardados
│  │  ├─ catalogoNutrientes.ts  # Notación química elemento/forma (sin conversiones)
│  │  ├─ repositorioAnalisis.ts # Reglas de persistencia, comprobables sin IndexedDB
│  │  ├─ validacionPlan.ts      # Fase 3: validación de productos, planes y cambios de estado
│  │  ├─ repositorioPlanes.ts   # Fase 3: persistencia del catálogo y de los planes
│  │  ├─ formato.ts             # Números y fechas en es-CO
│  │  └─ db.ts                  # IndexedDB mediante Dexie (esquema v2)
│  ├─ types.ts           # Modelo de lotes, análisis, productos y planes
│  ├─ App.tsx            # Navegación e interfaz principal
│  ├─ main.tsx
│  └─ styles.css
├─ tests/
│  ├─ calculos.test.ts     # Fórmulas de base
│  ├─ lote.test.ts         # Área del lote: decimales y escrituras ambiguas
│  ├─ suelo.test.ts        # Validación, catálogo, registros dañados, desbordamientos
│  ├─ robustez.test.ts     # Precisión al editar, arrays dispersos, estructuras inesperadas
│  ├─ persistencia.test.ts # Crear, leer, editar, eliminar y aislamiento entre lotes
│  ├─ plan.test.ts         # Fase 3: cálculos del plan, formas químicas, validación y estados
│  └─ persistenciaPlan.test.ts # Fase 3: catálogo, planes, estados, copias y trazabilidad
├─ vite.config.ts        # Configuración de PWA
├─ tsconfig.json
└─ package.json
```

## Fases y criterios de aceptación — 15 días

| Fase | Días | Entrega verificable |
|---|---:|---|
| 0. Datos y alcance | 1 | Datos de ejemplo diferenciados de datos reales; caso papa elegido |
| 1. Base y lotes | 1–3 | Crear, modificar, eliminar lotes y conservarlos tras recargar |
| 2. Suelo y conversiones | 4–6 | Registrar fecha, unidades y método de análisis; pruebas de ppm, profundidad y densidad |
| 3. Fertilizantes y plan | 7–8 | N-P₂O₅-K₂O, meta técnicamente validada, cantidad y costo con trazabilidad |
| 4. Monitoreo | 9–11 | Registrar aplicación/observación/tarea, responsable, fecha y plan vs. aplicado |
| 5. Entrega y despliegue | 12–13 | Informe productor, copia/restauración JSON, instalación PWA, Cloudflare Workers |
| 6. Validación | 14–15 | Prueba con papa, otro cultivo, comparación manual, correcciones y presentación |

**No incluir en los primeros 15 días:** backend NestJS, autenticación, IA por API, OCR de análisis, sensores, diagnósticos foliares por foto, notificaciones push, publicación en tiendas móviles.

## Fórmulas de base

1. `hectáreas = área_m² / 10.000`.
2. `masa_kg/ha = 10.000 × profundidad_m × densidad_kg/m³`.
3. `equivalencia_kg/ha = concentración_mg/kg × masa_kg/ha / 1.000.000`.
4. `producto_kg/ha = meta_validada_kg/ha / (contenido_porcentual / 100)`, solo si la forma química de la meta y la de la etiqueta coinciden.
5. `producto_kg_lote = producto_kg/ha × área_m² / 10.000` (área guardada con el plan).
6. `COP_por_kg = precio_bulto_COP / kg_por_bulto`.
7. `costo_COP = kg_de_producto × COP_por_kg`.
8. `bultos = kg_de_producto / kg_por_bulto` (exacto; redondear lo decide el productor).
9. `aporte_kg/ha = producto_kg/ha × contenido_porcentual / 100`, para cada forma declarada en la etiqueta.

**Advertencia esencial:** la equivalencia calculada a partir de un resultado de laboratorio expresado en mg/kg **NO determina la disponibilidad para la planta ni la dosis de fertilización**. El plan exige que el usuario suministre una meta nutricional justificada y respaldada por una fuente técnica. No deben copiarse dosis entre cultivos.

## Datos del productor y privacidad

En esta fase todo queda en **IndexedDB del dispositivo**. No existe sincronización entre navegadores o teléfonos. Limpiar el almacenamiento del sitio puede borrar la información. **No uses este prototipo como registro único de un cultivo real** hasta implementar copia/restauración de seguridad en fase 5.

## Publicación en Cloudflare Workers

**App publicada:** https://agroferti-mic.leonardoquintero222.workers.dev/

Está conectada al repositorio de GitHub: **cada push a `main` se compila y se publica sola** (Workers Builds, plan gratuito). El resultado aparece como check "Workers Builds: agroferti-mic" en el commit de GitHub. La configuración del Worker la genera Cloudflare en su entorno de compilación; no hay `wrangler.jsonc` en el repositorio.

- **No agregues `public/_redirects`.** Workers rechaza la regla `/* /index.html 200` por bucle infinito y el deploy falla. La app no tiene rutas propias y el service worker ya usa `index.html` sin conexión.
- Tras un push, recarga la app una o dos veces para que el navegador tome la versión nueva (actualización automática de la PWA).
- Para revisar versiones desde la terminal: `npx wrangler versions list --name agroferti-mic` (requiere `npx wrangler login`).

### Cómo se creó (por si hay que repetirlo en otra cuenta)

Solo cuando `npm run build` funcione:

1. Crea un repositorio GitHub **personal** (no en las cuentas de la empresa).
2. Desde la carpeta del proyecto:

```bash
git init
git add .
git commit -m "feat: fase 1 AgroFerti MIC"
git branch -M main
```

3. Después de `npm install`, incluye también el archivo `package-lock.json` generado en el primer commit (si hiciste el commit anterior, usa un segundo commit). Crea un repositorio vacío `agroferti-mic` en GitHub y conecta el `remote` usando la dirección HTTPS que **GitHub te muestre**. No copies direcciones de otros proyectos.
4. Sube la rama `main`.
5. En Cloudflare > Workers & Pages > Create > Import a repository y da acceso al repositorio (puede ser privado).
6. Selecciona el repositorio; Cloudflare detecta Vite y usa `npm run build` con la carpeta `dist`. La versión de Node la toma de `.node-version`.
7. Publica. Verifica el enlace `workers.dev`, crea un lote y recarga.
8. En Android: abre Chrome > menú > Instalar aplicación cuando esté disponible. En iPhone: Safari > Compartir > Añadir a pantalla de inicio.

**No se necesita servidor** para esta fase, ni pagar una cuenta de Google Play / Apple Developer.

## Organización del equipo

- Programador (tú): repositorio, arquitectura, cálculos, PWA, despliegue.
- Compañero agronomía: recopilar etiquetas reales de productos y fuentes técnicas por cultivo.
- Compañero datos: sistematizar análisis de suelo con unidad, fecha y método de laboratorio.
- Compañero validación: realizar el mismo cálculo manualmente y contrastarlo con la web.
- Compañero presentación: tomar capturas reales, probar legibilidad con productores y preparar la sustentación.

No inventar resultados de campo. Etiquetar todos los datos simulados como **EJEMPLO**.

## Limitaciones conocidas de la fase 2

- Los componentes React no tienen pruebas automáticas; la interfaz y Dexie/IndexedDB reales se verifican con las pruebas manuales de arriba.
- El catálogo de formas químicas es una lista corta de notación. Las formas fuera de la lista se guardan como "No reconocida", sin validación química adicional.
- Los valores en `cmol(+)/kg` no se convierten a mg/kg ni a kg/ha.
- Las equivalencias son dimensionales: no indican disponibilidad para la planta ni dosis, y dependen de la profundidad, la densidad aparente y la representatividad del muestreo.
- No hay límites agronómicos de profundidad o densidad; solo límites numéricos (mayor que cero, finito y dentro de la precisión de JavaScript).
- Los campos adicionales dentro de un resultado (p. ej. `{..., metodo: 'x'}`) no se pueden editar: se avisa y solo se descartan si el usuario confirma ese resultado.
- Las listas de resultados con más de 500 posiciones no se revisan una por una: se informan como dañadas y solo pueden descartarse con confirmación.
- Todo se guarda solo en este navegador; no hay respaldo hasta la fase 5.

## Para retomar (estado al 29 de octubre de 2026)

- Fase 3 completa (3a modelo, 3b catálogo, 3c plan, 3d estados). 3b, 3c y 3d pasaron una revisión de código cada una, con todos los puntos corregidos, y están publicadas.
- Fase 3a (modelo, cálculos y persistencia) terminada y publicada; la app publicada muestra las fases 1 y 2. Recorrido en Chrome sobre la URL publicada: 16 comprobaciones correctas, incluido el uso sin conexión.
- Fase 2 cerrada tras dos auditorías de Codex: 54 pruebas, build correcto y recorrido en navegador (Edge headless, 58 comprobaciones) aprobado.
- El recorrido en navegador se ejecutó con un script temporal fuera del repositorio; las pruebas manuales equivalentes están en "Pruebas manuales en navegador (fase 2)".
- Pendiente opcional: probar en un teléfono Android real (teclado y selectores nativos).

## Limitaciones conocidas de la fase 3a

- Todavía no hay interfaz: el modelo se prueba con 29 pruebas automáticas y con una verificación de la migración en Dexie real hecha fuera del repositorio.
- Cada meta se cubre con un solo producto. Repartir una meta entre varios productos (p. ej. parte del N con DAP y el resto con urea) queda para después; se puede agregar como campo opcional sin migrar datos.
- Los aportes acompañantes se suman en el resumen, pero no reducen la cantidad de otros productos.
- El nombre de quien revisa o aprueba lo escribe el usuario: la app no verifica identidades ni certifica aprobaciones técnicas.
- Un plan guardado con datos dañados solo se consulta o se elimina (si no está aprobado); no se edita, no cambia de estado ni se copia.
- Los campos de otras versiones se conservan en el primer nivel del plan y del producto; dentro de metas, líneas y contenido se descartan al editar.

## Limitaciones conocidas de la fase 3b

- Al editar un producto con datos dañados, solo se precarga el nombre: el resto se vuelve a escribir desde la etiqueta y se reemplaza con confirmación expresa.
- El catálogo de formas químicas es el mismo de la fase 2; las formas fuera de la lista (p. ej. SO₃) se guardan como texto, sin validación química adicional.
- Los componentes React no tienen pruebas automáticas; la interfaz se verificó con un recorrido en Chrome (29 comprobaciones) hecho con un script fuera del repositorio. Las pruebas manuales equivalentes están arriba.

## Limitaciones conocidas de la fase 3c

- Cada meta se cubre con un solo producto y los aportes acompañantes no reducen otras cantidades (ver limitaciones de 3a).
- El nombre de quien elabora la propuesta es opcional y lo escribe el usuario; la app no verifica identidades.

## Limitaciones conocidas de la fase 3d

- El nombre de quien revisa o aprueba lo escribe el usuario; puede ser el mismo para todos los cambios. La app no verifica identidades ni que la revisión la haga otra persona.
- Un plan aprobado solo se elimina junto con su lote (al eliminar el lote se borran todos sus datos, con confirmación).
- Revisar o aprobar exige un producto con cantidad calculada en cada meta, pero no exige precio: un plan aprobado puede no tener costo total.

## Próximo PR: fase 4

Seguimiento manual por lote: registrar aplicaciones (vinculadas a una línea de un plan aprobado), observaciones y tareas, con fecha y responsable, y mostrar plan frente a lo aplicado. Lee primero `AGENTS.md` y propone el modelo antes de implementarlo.
