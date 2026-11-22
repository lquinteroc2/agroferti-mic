# AgroFerti MIC — instrucciones para Claude Code

Lee y cumple íntegramente [`AGENTS.md`](./AGENTS.md) antes de modificar el proyecto. Es la fuente compartida de normas de este repositorio para Claude Code y Codex CLI.

## Estado y alcance actual
- MVP de hackatón SENA para el cultivo de papa (solo papa desde el 19 de noviembre de 2026; ver `AGENTS.md`). Fases 1 (lotes), 2 (análisis de suelo), 3 (catálogo de productos, plan y estados del plan) y 4 (seguimiento: aplicaciones, observaciones y tareas) completas, más el informe para el productor en PDF (fase 5), el historial del lote (ciclos de cultivo) y la nube con ingreso obligatorio con Google (la copia JSON se retiró). Revisión de experiencia de uso aplicada en cinco tandas (22 de noviembre de 2026: textos, glosario, metas sin condiciones ocultas, camino guiado y formularios más cortos). Kit de validación en `docs/`; sigue ejecutar la fase 6 con datos reales. Estado detallado en `README.md`.
- Tecnologías: React 19, Vite 7, TypeScript, Dexie, PWA. Aprobado el 17 de noviembre de 2026: API en el mismo Worker + Cloudflare D1 + Sign in with Google, solo en planes gratuitos y sin registrar métodos de pago (`docs/NUBE_CLOUDFLARE.md`). Sin API de IA ni cuentas de pago.
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
