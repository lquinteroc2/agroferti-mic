# Reglas para asistentes de programación (Claude Code / Codex)

Contexto: AgroFerti MIC es un prototipo académico SENA del Grupo 1 para el cultivo de **papa** (desde el 19 de noviembre de 2026; antes era multicultivo con papa como piloto). Objetivo en 15 días: registro de lotes, cálculos dimensionales auditables, planificación usando objetivos validados, monitoreo manual y reporte comprensible para el productor.

## Stack que no debes cambiar sin justificar
- React + Vite + TypeScript + CSS nativo; Dexie/IndexedDB; PWA; Cloudflare Workers con archivos estáticos (cada push a `main` se publica; no usar `public/_redirects`).
- **Decisión del 17 de noviembre de 2026 (aprobada por el equipo):** se permite guardar datos en la nube con un Worker (API) y **Cloudflare D1** en el **plan gratuito** de Cloudflare, e iniciar sesión con **Google** (solo los alcances `openid`, `email` y `profile`). Plan y pasos en `docs/NUBE_CLOUDFLARE.md`.
- **Costo cero obligatorio:** ningún servicio que pida tarjeta o método de pago, aunque sea un plan de $0 (por eso no se usa Cloudflare Zero Trust/Access). Nada de Workers Paid, Durable Objects, R2, KV, colas ni otros productos que no estén en este documento. Al superar un límite gratuito, la app debe fallar y avisar, nunca pasar a pago.
- La app sigue funcionando sin conexión: Dexie/IndexedDB es la copia local y la nube se sincroniza cuando hay internet. Sin IA API de pago ni aplicaciones nativas.
- Mantén UI en español, prioriza Android de gama media y diseño accesible. Datos personales en la nube solo con la autorización del titular (Ley 1581 de 2012).

## Seguridad agronómica
- **Decisión del 19 de noviembre de 2026 (aprobada por el dueño del proyecto):** la app puede **sugerir** metas nutricionales y fertilizantes comerciales, pero **solo** a partir de referencias guardadas en la base de datos (tabla `referencias` de D1), cada una con su fuente publicada (título, entidad, año, URL, página y tabla), y marcadas "por verificar" hasta que las revise una persona. La sugerencia se muestra como **rango con su cita y la advertencia de revisarla con un agrónomo**; el usuario decide el valor y la app nunca la aplica sola. Si para un cultivo, método de laboratorio o unidad no hay referencia, la app no sugiere nada.
- **Decisión del 19 de noviembre de 2026 (dueño del proyecto):** la app trabaja **solo con papa**, el único cultivo con referencias técnicas completas (Castro Franco, 2005). Los formularios ofrecen solo papa; los lotes y ciclos ya guardados con otros cultivos se siguen leyendo y mostrando sin cambiarlos. No agregar otro cultivo sin referencias publicadas y una decisión explícita.
- **Decisión del 19 de noviembre de 2026 (dueño del proyecto), amplía la de sugerencias:** la app **propone** metas y fertilizantes. Al usar una sugerencia, la meta se llena con el **punto medio del rango** de la referencia citada (el usuario puede cambiarlo antes de guardar) y queda con su fuente. Para cada meta, la app muestra fertilizantes del registro del ICA que aportan esa forma química (orden: con precio DANE, verificados y mayor concentración) y los agrega al catálogo del usuario con un toque. El catálogo de referencia incluye todos los fertilizantes vigentes de aplicación al suelo del registro del ICA (`scripts/catalogo-ica.ts`), sin inventar composiciones ni precios: lo que no se lee sin dudas se omite o queda "por verificar". El plan sigue necesitando revisión y aprobación de una persona.
- **Decisión del 27 de noviembre de 2026 (dueño del proyecto, por sugerencia del instructor):** la app solo ofrece fertilizantes con precio del DANE, para que cada plan tenga costo (`filasParaLaApp` en `src/lib/paqueteReferencias.ts`). El registro completo del ICA se conserva en `data/referencias/` para que la actualización mensual de precios (`scripts/precios-dane.ts`) encuentre los productos nuevos. Los productos que el productor registra a mano o con su propio precio no cambian.
- No inventes dosis, umbrales de deficiencia, intervalos de aplicación, aprobación técnica o mediciones de campo.
- No traduzcas automáticamente ppm del laboratorio en kg de fertilizante por hectárea. Ppm (mg/kg) a kg/ha es solo equivalencia dimensional condicionada por masa del suelo, no biodisponibilidad ni prescripción.
- La cantidad de un fertilizante se calcula **solo si** existe una meta nutrimental validada, con fuente, fecha y nutriente/forma química inequívocos.
- Expresar P/P₂O₅ y K/K₂O correctamente, nunca asumir que son equivalentes. **Decisión del 27 de noviembre de 2026 (dueño del proyecto, por sugerencia del instructor):** la app convierte entre la forma elemental y el óxido (P↔P₂O₅, K↔K₂O, Ca↔CaO, Mg↔MgO) solo con la relación química exacta (`src/lib/conversionFormas.ts`, pesos atómicos IUPAC) y mostrando la operación. No convierte formas iónicas del análisis (K⁺, Ca²⁺, Mg²⁺) ni unidades (cmol(+)/kg).
- Distinguir propuesta, revisado, aprobado y aplicado; el seguimiento manual no es un sensor.
- Cualquier valor ficticio debe mostrar "EJEMPLO" en la interfaz y documentación.

## Experiencia de uso
- **Decisión del 22 de noviembre de 2026 (dueño del proyecto):** se aplican en cinco tandas las mejoras de la revisión de experiencia de uso: (1) textos sin contradicciones, obligatorios marcados y pesos con "$"; (2) glosario dentro de la app; (3) propuesta de metas sin condiciones ocultas (análisis preseleccionado, zona guardada en el lote y requisitos visibles); (4) camino guiado en la ficha del lote y en Mis lotes; (5) formularios más cortos. Cada tanda se revisa a fondo y pasa `npm run test` y `npm run build` antes de subirla.
- Estas mejoras no cambian cálculos, fuentes, metas ni dosis. Se mantienen los estados propuesta, revisado y aprobado, la marca EJEMPLO y las advertencias de seguridad agronómica (pueden reubicarse o resumirse, no eliminarse).
- Escribe para el productor: palabras que reconoce, una sola advertencia por pantalla y los términos técnicos explicados en el glosario.

## Calidad de ingeniería
- Código en `src/`, funciones matemáticas puras en `src/lib/calculos.ts`, persistencia en `src/lib/db.ts`.
- Crear/actualizar tests cuando se agregan cálculos. Validar números finitos, no negativos, unidades y cero en denominador.
- Evitar modificaciones masivas ajenas a la fase actual. No eliminar datos de usuario sin confirmación.
- Cuando se modifique el esquema Dexie, añadir una versión migratoria; no romper registros previos.
- No se deben añadir contraseñas, API keys o credenciales a GitHub.

## Entrega por fase
- Explicar qué archivos se modificaron, comandos de pruebas, criterios de aceptación y limitaciones.
- Primero ejecutar `npm run test`, después `npm run build`, corregir fallos antes de hacer commit.

## Prompt de siguiente tarea
Fases 1 a 5 cerradas: lotes, análisis de suelo, productos, plan y estados, seguimiento, historial del lote, informe para el productor (PDF) y nube con ingreso obligatorio con Google (la copia JSON se retiró el 17 de noviembre de 2026). Las cinco tandas de experiencia de uso (22 de noviembre de 2026) también están aplicadas: textos, glosario, metas sin condiciones ocultas, camino guiado y formularios más cortos. Estado detallado en `README.md`.

"Apoya la fase 6 AgroFerti MIC (validación): corrige únicamente los errores que el equipo reporte al probar con datos reales y al comparar los cálculos de la app con cálculos manuales. Reproduce cada error con una prueba antes de corregirlo. No agregues funciones nuevas ni metas o dosis sin una decisión explícita y una fuente técnica citada. Al finalizar, resume archivos, pruebas y limitaciones."
