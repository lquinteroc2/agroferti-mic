# Guardar los datos en la nube sin costo — AgroFerti MIC

Decisión aprobada por el equipo el 17 de noviembre de 2026. Este documento explica **qué se va a construir**, **por qué no cuesta dinero** y **los pasos que hace una persona en los paneles de Cloudflare y Google**. El código lo implementa el asistente después de estos pasos.

## 1. Qué se construye

| Pieza | Dónde vive | Para qué |
|---|---|---|
| App (lo que ya existe) | Cloudflare Workers, `agroferti-mic.senaedu.workers.dev` | Pantallas. Sigue guardando todo en el teléfono (IndexedDB) y funciona **sin conexión**. |
| API (nueva) | El **mismo Worker**, rutas `/api/...` | Recibe y entrega los datos del usuario que inició sesión. |
| Base de datos (nueva) | **Cloudflare D1** (SQL) | Guarda en la nube los lotes, análisis, productos, planes, seguimiento y ciclos de cada usuario. |
| Inicio de sesión (nuevo) | **Sign in with Google** | El usuario entra con su cuenta de Google. La API comprueba el token de Google y solo le muestra **sus** datos. |

**Sincronización:** lo que se registra se guarda primero en el teléfono. Cuando hay internet, la app envía a la nube lo que cambió y trae lo que cambió en otros dispositivos del mismo usuario. Si nunca inicia sesión, la app funciona como hoy, solo en ese teléfono.

## 2. Por qué no genera costos (verificado en la documentación oficial el 17 de noviembre de 2026)

| Servicio | Límite gratuito | Qué pasa al superarlo |
|---|---|---|
| Workers Free (app + API) | 100.000 solicitudes por día; 10 ms de CPU por solicitud | Responde con **error 1027** hasta el día siguiente (00:00 UTC). **No cobra.** |
| D1 Free (base de datos) | 5 millones de filas leídas/día, 100.000 escritas/día, 500 MB por base, 5 GB en total | Las consultas fallan hasta el día siguiente. **No cobra.** |
| Workers Builds Free (publicar al hacer push) | 3.000 minutos de compilación al mes, 1 a la vez | Cada compilación tarda alrededor de 1 minuto. |
| Sign in with Google | Con solo `openid`, `email` y `profile` la app no necesita verificación de Google, los usuarios no tienen que estar en una lista y su autorización no vence a los 7 días | La documentación no menciona facturación ni costo para crear el ID de cliente. |

Un lote con todos sus registros ocupa pocos KB: 500 MB alcanzan para miles de productores. La sincronización solo envía y trae lo que cambió, para no gastar lecturas.

**Descartado por costo:** Cloudflare Zero Trust/Access (su plan gratuito **exige registrar un método de pago** aunque no cobre), Workers Paid, Durable Objects, R2, KV, colas, Supabase y Firebase.

### Reglas para que nunca haya un cobro

1. **Si alguna pantalla pide tarjeta, PayPal, "método de pago", "Upgrade", "Purchase" o "Add billing": detente.** No hace falta para nada de esto.
2. En Cloudflare **nunca** pulses "Upgrade to Workers Paid" ni actives productos que no estén en esta guía.
3. En Google Cloud **nunca** vincules una cuenta de facturación (Billing) al proyecto. El inicio de sesión no la necesita.
4. Sin tarjeta registrada, ninguno de los dos servicios tiene cómo cobrar.

## 3. Pasos en Cloudflare

### 3.1 Encontrar la cuenta (con qué correo se creó)

La app ya está publicada, así que la cuenta existe. Para encontrar el correo:

1. Busca en tu correo (en todas tus cuentas, incluida la del SENA) mensajes de **Cloudflare** (por ejemplo, de `noreply@notify.cloudflare.com`), con asuntos como "Verify your email" o "Welcome to Cloudflare". El subdominio de la app es `senaedu`, así que revisa también tu correo institucional.
2. Entra a https://dash.cloudflare.com/login con ese correo. Si creaste la cuenta con **"Sign in with Google"** o **"Sign in with GitHub"**, usa ese mismo botón.
3. Si no la encuentras: en GitHub, abre el repositorio `agroferti-mic`, pulsa la marca ✓ verde de un commit reciente, busca el check **"Workers Builds: agroferti-mic"** y pulsa **Details**. Te lleva al panel de Cloudflare y te pide iniciar sesión: el correo que funcione es el de la cuenta.
4. Ya dentro, el correo aparece arriba a la derecha (icono de persona) → **My Profile**.

### 3.2 Comprobar que todo está en el plan gratuito

1. Menú izquierdo → **Workers & Pages** → debe verse el Worker **agroferti-mic**.
2. En **Workers & Pages → Plans** (o "Overview" → panel derecho "Plan") debe decir **Free**. Si dice "Paid", avisa antes de continuar.
3. Menú → **Manage Account → Billing**: no hace falta registrar ningún método de pago. No agregues ninguno.

### 3.3 Crear la base de datos D1

1. Menú izquierdo → **Storage & databases → D1 SQL database** → **Create database** (o "Create").
2. Nombre: **`agroferti-db`**.
3. Ubicación (location / jurisdiction): déjala en automático. No elijas opciones de pago.
4. Pulsa **Create**.
5. En la página de la base, copia el **Database ID** (algo como `a1b2c3d4-...`). **Envíaselo al asistente.** No es una contraseña: es el identificador que va en la configuración del proyecto.
6. **No** conectes la base al Worker desde el panel ("Bindings"): esa conexión va en el archivo de configuración del repositorio (`wrangler.jsonc`) para que no se pierda en la siguiente publicación.

## 4. Pasos en Google Cloud (inicio de sesión con Google)

Usa la cuenta de Google del equipo que vaya a administrar la app (de preferencia una personal que no se pierda al terminar el curso).

1. Entra a https://console.cloud.google.com/ y acepta los términos si es la primera vez. Si aparece una oferta de "prueba gratuita" con tarjeta, **ciérrala**: no hace falta.
2. Arriba, en el selector de proyectos → **New project** → nombre **`AgroFerti MIC`** → organización: "No organization" → **Create**.
3. Menú → **APIs & Services → OAuth consent screen** (también aparece como **Google Auth Platform**) → **Get started**:
   - App name: **AgroFerti MIC**.
   - User support email: tu correo.
   - Audience: **External**.
   - Contact information: tu correo.
   - Acepta la política de datos de usuario de Google → **Create**.
4. En **Audience**, deja el estado de publicación en **Testing**. Con solo nombre, correo y perfil, los usuarios no tienen que agregarse a la lista y su sesión no vence a los 7 días.
5. En **Data access** no agregues alcances (scopes). Los básicos (`openid`, `email`, `profile`) bastan.
6. En **Clients → Create client**:
   - Application type: **Web application**.
   - Name: `AgroFerti web`.
   - **Authorized JavaScript origins** (agrega las tres):
     - `https://agroferti-mic.senaedu.workers.dev`
     - `http://localhost:5173`
     - `http://localhost`
   - Authorized redirect URIs: **déjalo vacío**.
   - **Create**.
7. Copia el **Client ID** (termina en `.apps.googleusercontent.com`) y **envíaselo al asistente**. El Client ID no es secreto. **No** copies ni compartas el "Client secret": esta app no lo usa.

Nota: si un cliente OAuth pasa seis meses sin usarse, Google lo borra (se puede restaurar dentro de 30 días).

## 5. Datos personales (Ley 1581 de 2012)

Antes de subir datos a la nube, la app pedirá la autorización del productor con un texto claro: qué datos se guardan (correo de Google, nombre y los datos de sus lotes), para qué (respaldo y uso en varios dispositivos), quién es el responsable (Grupo 1 SENA, prototipo académico) y cómo pedir que se borren. Sin esa autorización, los datos se quedan solo en el teléfono.

## 6. Lo que hará el asistente después de recibir el Database ID y el Client ID

1. `wrangler.jsonc` en el repositorio: el Worker sirve la app y la API, y se conecta a D1.
2. Tablas en D1 con migraciones versionadas y pruebas.
3. API que comprueba el token de Google (firma, `aud`, `iss`, `exp`) y separa los datos por usuario (`sub` de Google, no el correo).
4. Sincronización en la app: botón "Iniciar sesión con Google", estado "Sincronizado / pendiente / sin conexión" y autorización de datos personales.
5. Pruebas, recorrido en el navegador y publicación.
