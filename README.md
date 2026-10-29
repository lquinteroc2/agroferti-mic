# AgroFerti MIC — Grupo 1 SENA

Aplicación web progresiva (PWA) **multicultivo** para preparar el cálculo, la explicación y el monitoreo de fertilización, empezando por **papa** como cultivo piloto.

## Estado actual: fase 2 / suelo y conversiones

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
✅ 60 pruebas automáticas (cálculos, validación del área y del análisis, catálogo, registros dañados, arrays dispersos, precisión numérica, desbordamientos y persistencia).

**No implementado aún:** planes de fertilización, catálogo de productos NPK, historial de aplicaciones, reportes PDF y respaldo de información. Se desarrollarán por fases.

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

## Inicio exclusivo desde terminal

Consulta [INICIO_TERMINAL.md](./INICIO_TERMINAL.md) para instalar Node.js, Git, Claude Code y Codex CLI, y para trabajar desde varias pestañas de terminal sin un editor gráfico.

Claude Code lee `CLAUDE.md`; Codex lee `AGENTS.md`. Ambos archivos contienen instrucciones compartidas del proyecto.

## Estructura del proyecto

```text
agroferti-mic/
├─ public/              # Iconos e instrucciones de Cloudflare Pages
├─ src/
│  ├─ components/
│  │  ├─ LoteForm.tsx              # Formulario del lote
│  │  ├─ AnalisisSueloSeccion.tsx  # Historial y flujo de análisis dentro del lote
│  │  ├─ AnalisisSueloForm.tsx     # Formulario de análisis de suelo
│  │  └─ AnalisisSueloDetalle.tsx  # Datos ingresados, cálculos explicados y advertencias
│  ├─ lib/
│  │  ├─ calculos.ts            # Matemáticas verificables, sin prescribir dosis
│  │  ├─ validacion.ts          # Validaciones puras y verificación de registros guardados
│  │  ├─ catalogoNutrientes.ts  # Notación química elemento/forma (sin conversiones)
│  │  ├─ repositorioAnalisis.ts # Reglas de persistencia, comprobables sin IndexedDB
│  │  ├─ formato.ts             # Números y fechas en es-CO
│  │  └─ db.ts                  # IndexedDB mediante Dexie (esquema v1)
│  ├─ types.ts           # Modelo de lotes, análisis y datos futuros
│  ├─ App.tsx            # Navegación e interfaz principal
│  ├─ main.tsx
│  └─ styles.css
├─ tests/
│  ├─ calculos.test.ts     # Fórmulas de base
│  ├─ lote.test.ts         # Área del lote: decimales y escrituras ambiguas
│  ├─ suelo.test.ts        # Validación, catálogo, registros dañados, desbordamientos
│  ├─ robustez.test.ts     # Precisión al editar, arrays dispersos, estructuras inesperadas
│  └─ persistencia.test.ts # Crear, leer, editar, eliminar y aislamiento entre lotes
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
| 5. Entrega y despliegue | 12–13 | Informe productor, copia/restauración JSON, instalación PWA, Cloudflare Pages |
| 6. Validación | 14–15 | Prueba con papa, otro cultivo, comparación manual, correcciones y presentación |

**No incluir en los primeros 15 días:** backend NestJS, autenticación, IA por API, OCR de análisis, sensores, diagnósticos foliares por foto, notificaciones push, publicación en tiendas móviles.

## Fórmulas de base

1. `hectáreas = área_m² / 10.000`.
2. `masa_kg/ha = 10.000 × profundidad_m × densidad_kg/m³`.
3. `equivalencia_kg/ha = concentración_mg/kg × masa_kg/ha / 1.000.000`.
4. `producto_kg/ha = meta_validada_kg/ha / (contenido_porcentual / 100)`.
5. `costo_COP = kg_de_producto × COP_por_kg`.

**Advertencia esencial:** la equivalencia calculada a partir de un resultado de laboratorio expresado en mg/kg **NO determina la disponibilidad para la planta ni la dosis de fertilización**. El plan exige que el usuario suministre una meta nutricional justificada y respaldada por una fuente técnica. No deben copiarse dosis entre cultivos.

## Datos del productor y privacidad

En esta fase todo queda en **IndexedDB del dispositivo**. No existe sincronización entre navegadores o teléfonos. Limpiar el almacenamiento del sitio puede borrar la información. **No uses este prototipo como registro único de un cultivo real** hasta implementar copia/restauración de seguridad en fase 5.

## Publicar gratis en Cloudflare Pages

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
5. En Cloudflare > Workers & Pages > Create > Pages > Import a repository.
6. Selecciona el repositorio y configura:
   - Framework: **React (Vite)**.
   - Build command: **`npm run build`**.
   - Output directory: **`dist`**.
7. Publica. Verifica el enlace `pages.dev`, crea un lote y recarga.
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

## Para retomar (estado al 27 de octubre de 2026)

- Fase 2 cerrada tras dos auditorías de Codex: 54 pruebas, build correcto y recorrido en navegador (Edge headless, 58 comprobaciones) aprobado.
- El recorrido en navegador se ejecutó con un script temporal fuera del repositorio; las pruebas manuales equivalentes están en "Pruebas manuales en navegador (fase 2)".
- Pendiente opcional: probar en un teléfono Android real (teclado y selectores nativos).

## Próximo PR: fase 3

Fertilizantes y plan: N-P₂O₅-K₂O, meta técnicamente validada (con fuente y fecha), cantidad y costo con trazabilidad. Lee primero `AGENTS.md`. No implementar recomendaciones agronómicas universales.
