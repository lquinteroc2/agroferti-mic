# AgroFerti MIC — instalación y desarrollo SOLO con terminal

No es necesario instalar VS Code ni contratar servidores. **El MVP todavía no está terminado**: están implementadas la fase 1 (registro de lotes) y la fase 2 (análisis de suelo). El estado de cada fase está en `README.md` («Estado actual»).

Si el repositorio ya existe en GitHub y tienes acceso, no uses el ZIP: clónalo con `gh repo clone lquinteroc2/agroferti-mic`, entra en la carpeta y continúa con `npm install`. En ese caso omite también la sección D, que solo aplica a la primera vez.

## A. Si utilizas Windows 10/11: PowerShell

1. Abre **PowerShell** desde Inicio. Verifica si existe `winget` con `winget --version`.
2. Instala las herramientas base (si ya las tienes, omite la instalación):

```powershell
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Git.Git -e
winget install --id GitHub.cli -e
winget install --id Anthropic.ClaudeCode -e
```

3. Cierra PowerShell, ábrelo de nuevo y confirma que las herramientas estén disponibles:

```powershell
node --version
npm --version
git --version
claude --version
gh --version
```

Necesitas Node.js **22.12 o posterior**. Si instalaste una versión distinta, compruébala antes de instalar las dependencias del proyecto.

4. Instala Codex CLI desde npm:

```powershell
npm install -g @openai/codex
codex --version
```

Alternativa sin npm: utiliza el instalador nativo oficial de Codex para Windows, descrito en https://github.com/openai/codex.

5. Descomprime **AgroFerti_MIC_Fase_1_Terminal_Claude_Codex.zip** (por ejemplo, en Descargas) y navega a la carpeta `agroferti-mic`:

```powershell
cd "$HOME\Downloads"
Expand-Archive -Path .\AgroFerti_MIC_Fase_1_Terminal_Claude_Codex.zip -DestinationPath "$HOME\Documents\AgroFerti" -Force
cd "$HOME\Documents\AgroFerti\agroferti-mic"
```

**Si ya descomprimiste el archivo manualmente**, omite `Expand-Archive` y usa `cd` a la carpeta real. La ruta de Descargas puede variar según cómo tengas configurado Windows.

6. Instala y prueba:

```powershell
npm install
npm run test
npm run build
npm run dev
```

Abre en el navegador la dirección indicada por Vite, normalmente `http://localhost:5173`. Deja esa pestaña de PowerShell abierta.

7. En **otra** pestaña de PowerShell, entra en la misma carpeta y ejecuta `claude`. Inicia sesión con tu suscripción Claude, **no con una clave de API**. Empieza preguntando: “Lee CLAUDE.md y AGENTS.md y describe el estado actual y el alcance de la siguiente fase; no modifiques archivos todavía.”
8. En **otra** pestaña de PowerShell, entra en la misma carpeta y ejecuta `codex`. Elige **Sign in with ChatGPT** con tu cuenta personal. Primero úsalo para **revisar**, no para editar lo mismo que Claude está cambiando.

## B. Si utilizas macOS (Mac mini): Terminal

Comprueba si tienes Node.js, Git y Homebrew:

```bash
node --version
git --version
brew --version
```

Si tienes Homebrew, instala Node.js y las herramientas pendientes:

```bash
brew install node git gh
brew install --cask claude-code
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

Si no tienes Homebrew, puedes instalar Node.js desde https://nodejs.org y usar los instaladores oficiales de Claude Code y Codex CLI:

```bash
curl -fsSL https://claude.ai/install.sh | bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

Guarda el ZIP en `~/Downloads` y descomprímelo así:

```bash
mkdir -p ~/Proyectos/agroferti
unzip ~/Downloads/AgroFerti_MIC_Fase_1_Terminal_Claude_Codex.zip -d ~/Proyectos/agroferti
cd ~/Proyectos/agroferti/agroferti-mic
npm install
npm run test
npm run build
npm run dev
```

Abre otra pestaña de Terminal en esa misma carpeta para `claude`, y una tercera para `codex`.

## C. Mantener tres sesiones sin conflictos

1. **Pestaña 1:** `npm run dev` — el navegador muestra cambios automáticamente al guardar archivos.
2. **Pestaña 2:** `claude` — asignarle una funcionalidad concreta a la vez.
3. **Pestaña 3:** `codex` — revisión y pruebas cuando Claude haya terminado una tarea.

Claude y Codex leen archivos del mismo disco, **pero no comparten historiales de chat ni se sincronizan automáticamente con este ChatGPT**. No hagas que ambos modifiquen los mismos archivos simultáneamente.

## D. Guardar versiones con Git

Desde la carpeta principal del proyecto:

```bash
git init
git add .
git commit -m "chore: inicio fase 1 AgroFerti MIC"
```

Si Git solicita identidad, configura `user.name` y `user.email` con tus datos **personales**, nunca los de la empresa. Para crear el repositorio personal privado en GitHub, inicia sesión usando:

```bash
gh auth login
```

Después, desde esa misma carpeta y tras el primer commit:

```bash
gh repo create agroferti-mic --private --source=. --remote=origin --push
```

Si ya existe el repositorio, no vuelvas a crearlo; conecta el remoto existente siguiendo las instrucciones de GitHub.

## E. Primer prompt seguro para Claude Code

> Lee `CLAUDE.md` y `AGENTS.md`. Verifica la instalación, ejecuta `npm run test` y `npm run build` y corrige exclusivamente errores de compilación o compatibilidad que bloqueen ejecutar la versión actual. No agregues funciones nuevas ni introduzcas servicios externos. Resume los cambios y pide aprobación antes de empezar la siguiente fase.

## F. Primer prompt de revisión para Codex CLI

> Lee `AGENTS.md`. Revisa sin modificar los archivos la fase actual de AgroFerti MIC (ver «Estado actual» en `README.md`): React, TypeScript, Dexie, validaciones y riesgos de pérdida de datos. Ejecuta las pruebas y la compilación si es posible. Reporta fallos reproducibles y prioridades, pero no reestructures ni implementes la siguiente fase todavía.

## G. Seguridad y privacidad

- Entra con tu suscripción actual de Claude y con **Sign in with ChatGPT** en Codex para evitar elegir por error facturación por API.
- No compartas contraseñas, tokens, claves o códigos de recuperación.
- Usa un GitHub personal y, al comienzo, un repositorio **privado**.
- Mantén confirmaciones de operaciones destructivas y revisa cambios antes del commit.
- El almacenamiento IndexedDB es local y no se sincroniza aún: no uses datos reales sin un respaldo.
