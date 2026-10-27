# AgroFerti MIC — Grupo 1 SENA

Aplicación web progresiva (PWA) **multicultivo** para preparar el cálculo, la explicación y el monitoreo de fertilización, empezando por **papa** como cultivo piloto.

## Estado actual: fase 1 / base funcional

✅ Registro de lotes: crear, editar, eliminar y consultar.
✅ Cultivos: papa, lechuga, kale, arveja y otro.
✅ Registro de área (m²), fecha de siembra y ubicación.
✅ Conversión de m² a hectáreas.
✅ Datos persistentes en el navegador (IndexedDB + Dexie).
✅ Interfaz adaptable a móvil/computador.
✅ Configuración PWA (instalable después del despliegue HTTPS).
✅ Funciones matemáticas puras con 5 pruebas automáticas.

**No implementado aún:** captura de análisis de suelo, planes fertilizantes, catálogo NPK, historial de aplicaciones, reportes PDF y respaldo de información. Se desarrollarán por fases.

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

`npm run test` verifica conversiones con el ejecutor de pruebas de Node (requiere Node 22). `npm run build` revisa TypeScript y genera `dist/` para publicar.

> En el entorno donde se preparó este código se ejecutaron y aprobaron las cinco pruebas matemáticas, pero no se pudo instalar dependencias debido a restricciones de red. Por eso el **build y la experiencia React completa deben verificarse en tu equipo** con `npm install && npm run build`.

## Inicio exclusivo desde terminal

Consulta [INICIO_TERMINAL.md](./INICIO_TERMINAL.md) para instalar Node.js, Git, Claude Code y Codex CLI, y para trabajar desde varias pestañas de terminal sin un editor gráfico.

Claude Code lee `CLAUDE.md`; Codex lee `AGENTS.md`. Ambos archivos contienen instrucciones compartidas del proyecto.

## Estructura del proyecto

```text
agroferti-mic/
├─ public/              # Iconos e instrucciones de Cloudflare Pages
├─ src/
│  ├─ components/
│  │  └─ LoteForm.tsx     # Formulario del lote
│  ├─ lib/
│  │  ├─ calculos.ts     # Matemáticas verificables, sin prescribir dosis
│  │  └─ db.ts           # IndexedDB mediante Dexie
│  ├─ types.ts           # Modelo de lotes y datos futuros
│  ├─ App.tsx            # Navegación e interfaz principal
│  ├─ main.tsx
│  └─ styles.css
├─ tests/calculos.test.ts
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

## Próximo PR: fase 2

Crear formulario `AnalisisSuelo` y pantalla por lote que permita registrar fecha del análisis, profundidad (cm), densidad aparente (g/cm³) y lecturas mg/kg **sin convertir eso en una dosis**; mostrar el cálculo dimensional como explicación opcional y registrar método de laboratorio. Probar límites y unidades.

Lee primero `AGENTS.md`. No implementar recomendaciones agronómicas universales.
