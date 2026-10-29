# Reglas para asistentes de programación (Claude Code / Codex)

Contexto: AgroFerti MIC es un prototipo académico SENA del Grupo 1, multicultivo, con papa como piloto. Objetivo en 15 días: registro de lotes, cálculos dimensionales auditables, planificación usando objetivos validados, monitoreo manual y reporte comprensible para el productor.

## Stack que no debes cambiar sin justificar
- React + Vite + TypeScript + CSS nativo; Dexie/IndexedDB; PWA; Cloudflare Pages estático.
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
Fases 1 (lotes) y 2 (análisis de suelo) cerradas; estado detallado en `README.md`.

"Implementa únicamente la fase 3 AgroFerti MIC: fertilizantes y plan por lote. Registra productos según su etiqueta (contenido declarado N-P₂O₅-K₂O u otros nutrientes con forma química explícita y precio COP/kg opcional) y un plan con meta nutrimental escrita por el usuario (nutriente, forma química, kg/ha, fuente técnica y fecha obligatorias). Calcula la cantidad de producto con `productoKgHa` y el costo solo cuando la forma química de la meta coincide con la de la etiqueta; si no coinciden, no calcules ni conviertas P/P₂O₅ o K/K₂O. Explica cada operación paso a paso. Distingue propuesta, revisado y aprobado (lo aplicado se registra en la fase 4). No derives la meta del análisis de suelo ni precargues dosis o productos sin la marca «EJEMPLO». Si el esquema cambia, añade `db.version(2)` sin romper registros de las fases 1–2. Valida entradas en el formulario y antes de persistir, añade tests y preserva la UI actual. Al finalizar, resume archivos, pruebas y limitaciones."
