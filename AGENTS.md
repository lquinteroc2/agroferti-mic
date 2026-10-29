# Reglas para asistentes de programación (Claude Code / Codex)

Contexto: AgroFerti MIC es un prototipo académico SENA del Grupo 1, multicultivo, con papa como piloto. Objetivo en 15 días: registro de lotes, cálculos dimensionales auditables, planificación usando objetivos validados, monitoreo manual y reporte comprensible para el productor.

## Stack que no debes cambiar sin justificar
- React + Vite + TypeScript + CSS nativo; Dexie/IndexedDB; PWA; Cloudflare Workers con archivos estáticos (cada push a `main` se publica; no usar `public/_redirects`).
- Sin servidor propio, autenticación, servicios cloud con tarjeta, IA API de pago ni aplicaciones nativas durante la hackatón.
- Mantén UI en español, prioriza Android de gama media, diseño accesible y sin registro de usuario.

## Seguridad agronómica
- No inventes dosis, umbrales de deficiencia, intervalos de aplicación, aprobación técnica o mediciones de campo.
- No traduzcas automáticamente ppm del laboratorio en kg de fertilizante por hectárea. Ppm (mg/kg) a kg/ha es solo equivalencia dimensional condicionada por masa del suelo, no biodisponibilidad ni prescripción.
- La cantidad de un fertilizante se calcula **solo si** existe una meta nutrimental validada, con fuente, fecha y nutriente/forma química inequívocos.
- Expresar P/P₂O₅ y K/K₂O correctamente, nunca asumir que son equivalentes.
- Distinguir propuesta, revisado, aprobado y aplicado; el seguimiento manual no es un sensor.
- Cualquier valor ficticio debe mostrar "EJEMPLO" en la interfaz y documentación.

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
Fases 1 (lotes), 2 (análisis de suelo) y 3 (catálogo de productos, plan y estados del plan) cerradas. Estado detallado en `README.md`.

"Implementa únicamente la fase 4 AgroFerti MIC: seguimiento manual por lote. Primero propone el modelo y espera aprobación. Registra aplicaciones vinculadas a una línea de un plan aprobado (fecha, cantidad aplicada en kg, responsable escrito por el usuario, costo opcional), observaciones y tareas, y muestra plan frente a lo aplicado como aritmética explicada, incluidas aplicaciones parciales. Lo aplicado no cambia el plan aprobado. El seguimiento manual no es un sensor y no se infieren mediciones de campo. Valores ficticios con la marca «EJEMPLO». Si el esquema cambia, añade `db.version(3)` sin romper registros anteriores. Valida entradas en el formulario y antes de persistir, añade tests y preserva la UI actual. Al finalizar, resume archivos, pruebas y limitaciones."
