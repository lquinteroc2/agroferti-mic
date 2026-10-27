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
"Implementa únicamente la fase 2 AgroFerti MIC: captura de análisis de suelo por lote (fecha, profundidad, densidad aparente, método laboratorio, pH opcional, mg/kg de nutrientes) y explicación verificable de las conversiones existentes. Mantén Dexie versión 1 si las tablas actuales bastan, no prescribas dosis, valida entradas, añade tests y preserva la UI actual. Al finalizar, resume archivos, pruebas y limitaciones."
