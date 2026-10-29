# AgroFerti MIC — instrucciones para Claude Code

Lee y cumple íntegramente [`AGENTS.md`](./AGENTS.md) antes de modificar el proyecto. Es la fuente compartida de normas de este repositorio para Claude Code y Codex CLI.

## Estado y alcance actual
- MVP de hackatón SENA, multicultivo con papa como piloto. Fases 1 (lotes) y 2 (análisis de suelo) completas; fase 3 (fertilizantes y plan) en curso: modelo (3a) y catálogo de productos (3b) listos; falta la interfaz del plan (3c) y de sus estados (3d). Estado detallado en `README.md`.
- Tecnologías: React 19, Vite 7, TypeScript, Dexie, PWA. Sin backend, API de IA ni cuentas de pago.
- Priorizar interfaz comprensible para productores y pruebas matemáticas verificables.
- No inventar resultados de campo, valores de análisis de suelo, fórmulas agronómicas de fertilización ni dosis aplicables.
- Trabajar por tareas pequeñas, describir archivos cambiados y ejecutar `npm run test` y `npm run build` cuando las dependencias estén disponibles.
- No reestructurar ni agregar servicios externos sin una decisión explícita.

## Comandos rápidos
- `npm install` — instalar dependencias
- `npm run dev` — iniciar app local
- `npm run test` — ejecutar pruebas
- `npm run build` — compilar aplicación

## Coordinación entre agentes
- Claude Code implementa cambios delimitados; Codex CLI revisa preferiblemente con el árbol de trabajo estable.
- No permitir que ambos editen simultáneamente los mismos archivos.
- Realizar un commit de Git por funcionalidad verificada.
