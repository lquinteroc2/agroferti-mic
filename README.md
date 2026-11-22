# AgroFerti MIC — Grupo 1 SENA

Aplicación web progresiva (PWA) para preparar el cálculo, la explicación y el monitoreo de fertilización del cultivo de **papa**.

## Estado actual: fases 1 a 5 completas (falta la validación de la fase 6)

**Fase 1 (lotes)**
✅ Registro de lotes: crear, editar, eliminar y consultar.
✅ Cultivo: papa. Desde el 19 de noviembre de 2026 la app trabaja solo con papa, el único cultivo con referencias técnicas completas; los lotes ya guardados con lechuga, kale, arveja u otro se siguen mostrando sin cambios.
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
✅ 60 pruebas automáticas al cierre (cálculos, validación del área y del análisis, catálogo, registros dañados, arrays dispersos, precisión numérica, desbordamientos y persistencia).

**Fase 3 (fertilizantes y plan) — 3a: modelo, cálculos y persistencia, todavía sin interfaz**
✅ Catálogo de productos común a todos los lotes, según la etiqueta: contenido declarado por forma química (p. ej. P₂O₅ 46 %), kg y precio del bulto con su fecha, y marca **EJEMPLO** para datos ficticios.
✅ Plan por lote con metas escritas por el usuario (nutriente, forma química, kg/ha, **fuente técnica y fecha obligatorias**) y una línea de producto por meta. La app no propone metas, productos ni dosis, y el análisis de suelo no entra en ningún cálculo.
✅ Cantidad (kg/ha y kg en el lote), precio por kg, costo, bultos exactos y aportes acompañantes (p. ej. el N del DAP). Resumen por forma química: meta frente a la suma de aportes, sin ajustar nada.
✅ **Sin conversiones químicas:** solo se calcula si la forma de la meta coincide con la de la etiqueta. Si la meta está en P y la etiqueta en P₂O₅, no se calcula y se explica por qué.
✅ Estados propuesta → revisado → aprobado, con historial (fecha, nombre escrito por el usuario y nota). Un plan aprobado es de solo lectura y no se elimina; para cambiarlo se copia como nueva propuesta. Lo aplicado se registrará en la fase 4.
✅ Trazabilidad: el plan guarda el área del lote al crearse y una copia de cada producto; editar o borrar el producto del catálogo no altera los planes.
✅ Base de datos versión 2 (`db.version(2)`): solo agrega la tabla `productos`. Verificado con Dexie real que una base de la versión 1 se abre sin cambiar lotes ni análisis.
✅ 89 pruebas automáticas al cerrar 3a.

**Fase 3 — 3b: catálogo de productos (pantalla "Productos" en la barra superior)**
✅ Crear, consultar, editar y eliminar (con confirmación) productos según su etiqueta. El catálogo es común a todos los lotes.
✅ Contenido declarado con elemento, forma química (lista del catálogo u "Otra forma" escrita tal cual) y porcentaje. Rechaza combinaciones incoherentes (Fósforo / K₂O), formas repetidas, 0 % y más de 100 %.
✅ Es obligatorio indicar si los datos vienen de una etiqueta real o son de **EJEMPLO**; los de ejemplo se marcan en la lista y en el detalle.
✅ Kg y precio del bulto rechazan escrituras ambiguas como `150.000` (en COP se leería como 150) y piden `150000`. El precio exige los kg del bulto y la fecha del precio. Vista previa: "Bulto de 50 kg a $ 150.000: equivale a $ 3.000 por kg".
✅ Detalle con datos ingresados y el precio por kg explicado. Un producto con datos dañados se muestra con su valor original y solo se reemplaza con confirmación expresa.
✅ 93 pruebas automáticas al cerrar 3b. Una revisión de código posterior encontró 10 puntos (entre ellos, que vaciar un nutriente guardado lo borraba sin aviso); todos están corregidos.

**Fase 3 — 3c: plan de fertilización (sección "Plan de fertilización" en la ficha del lote)**
✅ Crear, consultar, editar y eliminar (con confirmación) propuestas de plan por lote.
✅ Cada meta se escribe con nutriente, forma química, kg/ha, **fuente técnica, fecha de la fuente** y origen (fuente real o EJEMPLO). La app no propone metas, no las deduce del análisis de suelo y rechaza escrituras ambiguas como `1.200`.
✅ Un producto del catálogo por meta. El formulario muestra lo que declara la etiqueta y avisa si la meta no se podrá calcular (p. ej. meta en P con etiqueta en P₂O₅). El plan guarda una copia del producto: editar o borrar el producto del catálogo no lo altera.
✅ Detalle con cada operación explicada: kg/ha de producto, kg en el lote, bultos exactos, precio por kg, costo y aportes acompañantes; resumen por forma química (meta, aportado y diferencia aritmética) y costo total solo si todos los productos tienen costo.
✅ Análisis para proponer las metas (opcional): con él la app sugiere metas de referencia; las cantidades se calculan con las metas guardadas.
✅ El plan guarda el área del lote al crearse; al editar solo se actualiza si el usuario lo marca.
✅ Si el producto cambia en el catálogo, el plan conserva su copia y al editar avisa del cambio; para usar los datos nuevos se elige "datos actuales del catálogo". Si se elimina el análisis de referencia, el plan se sigue editando y copiando (queda sin referencia, con aviso).
✅ 105 pruebas automáticas en total. Recorrido en Chrome: 59 comprobaciones. Una revisión de código encontró 10 puntos en 3c; todos están corregidos.

**Fase 3 — 3d: estados del plan (panel "Estado del plan" al final del detalle)**
✅ Propuesta → revisado → aprobado, y devolver un plan revisado a propuesta. Cada cambio pide el nombre de quien lo registra (escrito por el usuario; la app no verifica identidades ni certifica aprobaciones técnicas) y una nota opcional.
✅ Revisar o aprobar exige al menos una meta, **un producto en cada meta** y la cantidad calculada de cada producto. Antes, la app explica qué falta (p. ej. "La meta de Potasio (K₂O) no tiene producto" o una meta cuya forma no coincide con la etiqueta) y no deja continuar.
✅ Un plan revisado ya no se edita; uno aprobado es de solo lectura y no se elimina. Para cambiar un plan aprobado se crea una copia como nueva propuesta ("… (copia)"), con el área actual del lote y un enlace al plan original.
✅ Historial visible con estado, fecha y hora, nombre y nota de cada cambio. Lo aplicado en campo no es un estado del plan: se registrará en la fase 4.
✅ 107 pruebas automáticas. Recorrido en Chrome: 72 comprobaciones. Una revisión de código encontró 9 puntos en 3d (entre ellos, que "Cancelar" no detenía una aprobación en curso y que se podía aprobar con metas sin producto); todos están corregidos.

**Fase 5 (adelantada) — copia de seguridad JSON — RETIRADA el 17 de noviembre de 2026** (reemplazada por la nube con ingreso obligatorio; para tener los datos en papel o PDF se usa el informe de cada lote). Se conserva la descripción como historia del proyecto:
✅ **Descargar copia (JSON):** todos los lotes, análisis, productos y planes, tal como están guardados (incluidos los datos dañados, los campos de otras versiones y valores como `NaN`, que se guardan con una marca y se restauran igual), en `agroferti-respaldo-AAAA-MM-DD.json`.
✅ **Restaurar desde un archivo:** primero muestra qué se agregará, qué ya existe y qué se omite (con el motivo), y pide confirmación. **Solo agrega lo que no existe: nunca borra ni sobrescribe** datos del dispositivo. Todo se escribe en una sola transacción: o entra todo o no entra nada.
✅ Rechaza archivos que no son una copia de AgroFerti o de una versión de formato desconocida. Omite, explicando el motivo, lotes que romperían la lista (sin nombre, cultivo, área o fechas válidos) junto con sus registros, y registros cuyo lote no está en la copia ni en el dispositivo.
✅ Verificado con Dexie real fuera del repositorio (copia restaurada idéntica, sin duplicar, atómica) y en Chrome: descargar, borrar la base del navegador y restaurar. 117 pruebas automáticas; recorrido en Chrome: 81 comprobaciones. Una revisión de código encontró 9 puntos; todos están corregidos.

**Fase 4 — 4a: modelo del seguimiento, cálculos y persistencia, todavía sin interfaz**
✅ Tres tipos de registro por lote en la tabla `registros` (que ya existía vacía; no hubo migración): **aplicación** (contra un producto de un plan **aprobado** del mismo lote; fecha no futura, kg de producto aplicados, costo real opcional escrito por el usuario), **observación** (texto con fecha; la app no deduce mediciones) y **tarea** (fecha prevista, pendiente o hecha). Todos con responsable opcional y marca EJEMPLO obligatoria.
✅ Plan frente a lo aplicado (`avancePlan` en `calculos.ts`): kg planeados y aplicados, diferencia, porcentaje de avance y lo aplicado expresado en la forma de la meta (kg ÷ ha × % de la etiqueta). Admite aplicaciones parciales; aplicar de más se muestra como número, sin juicio. Registrar aplicaciones no cambia el plan aprobado.
✅ Registros dañados se muestran con su valor original y solo se reemplazan con confirmación; no se cambia el tipo de un registro al editarlo. La copia de seguridad ya incluye y restaura el seguimiento.
✅ 128 pruebas automáticas. Verificado con Dexie real fuera del repositorio.

**Fase 4 — 4b: aplicaciones (bloque "Lo aplicado frente al plan" en el detalle de un plan aprobado)**
✅ "+ Registrar aplicación" en cada producto del plan: fecha (no futura), kg de producto aplicados, costo real opcional, responsable, nota y origen (real o EJEMPLO). Rechaza escrituras ambiguas como `1.500`. Editar y eliminar (con confirmación).
✅ Avance de cada producto explicado paso a paso: planeado, aplicado (suma de las aplicaciones parciales), aplicado − planeado, porcentaje y lo aplicado en la forma de la meta frente a la meta. Costo registrado: suma solo de los costos escritos, indicando cuántas aplicaciones no lo tienen.
✅ Registrar, editar o eliminar aplicaciones no cambia el plan aprobado. Al editar, una aplicación no cambia de plan ni de producto. Una aplicación con fecha anterior a la aprobación del plan se acepta, pero se marca "Antes de la aprobación". Las aplicaciones con datos dañados no se suman al avance y se avisa en su plan.
✅ 136 pruebas automáticas. Recorrido en Chrome: 91 comprobaciones. Una revisión de código del 4a y el 4b encontró 10 puntos; todos están corregidos.

**Fase 4 — 4c: seguimiento del lote (sección "Seguimiento del lote" en la ficha)**
✅ Lista de todos los registros del lote, del más reciente al más antiguo, con filtro por tipo: aplicaciones (se editan en su plan), observaciones y tareas.
✅ Observaciones (fecha no futura, descripción, responsable, origen real o EJEMPLO) y tareas (descripción, fecha prevista, pendiente o hecha con su fecha). Crear, editar, eliminar con confirmación y "Marcar como hecha hoy". Una tarea pendiente con fecha prevista pasada se marca "Pendiente · fecha pasada" (hecho de calendario, sin notificaciones).
✅ Los registros con datos dañados se muestran con su valor original. Las observaciones y tareas se corrigen precargando los datos válidos y el texto original de los dañados, con confirmación expresa; una aplicación dañada se elimina y se registra de nuevo desde su plan.
✅ 142 pruebas automáticas. Recorrido en Chrome: 102 comprobaciones. Una revisión de código del 4c encontró 10 puntos; todos están corregidos.

**Fase 5 — informe para el productor (botón "Informe para el productor" en la ficha del lote)**
✅ Vista imprimible del lote; "Imprimir o guardar como PDF" usa la impresión del navegador (sin librerías ni servicios externos; funciona sin conexión). Al imprimir solo sale el informe.
✅ Contenido: el lote; el análisis de suelo más reciente con sus equivalencias (con la nota de que no son dosis); **la recomendación de fertilización del plan aprobado más reciente** (fertilizante, para qué nutriente, dosis por hectárea, cantidad para el lote, bultos y costo estimado; aportes por nutriente; de dónde salen las metas; quién aprobó y cuándo); lo aplicado frente a lo recomendado; tareas y observaciones recientes; y advertencias en lenguaje claro.
✅ La recomendación es la del plan aprobado: sus metas vienen de la fuente técnica escrita por el usuario. La app no calcula dosis por su cuenta ni a partir del análisis de suelo. Sin plan aprobado, el informe lo dice y no incluye recomendación. Avisa si hay datos de EJEMPLO, planes aprobados con datos por corregir y aplicaciones que no se suman.
✅ 149 pruebas automáticas. Recorrido en Chrome: 117 comprobaciones, incluida la impresión a PDF. Una revisión de código del informe encontró 10 puntos; todos están corregidos.

**Historial del lote (sección "Historial del lote" en la ficha; pedido del instructor)**
✅ Ciclos de cultivo: al cosechar (o perder el cultivo), **"Cerrar ciclo y empezar otro cultivo"** guarda en el historial el cultivo actual con su siembra, la fecha de cierre, el área del lote, cómo terminó (se cosechó, se perdió, otro motivo), resultado y notas escritos por el productor (p. ej. lo cosechado) y la marca real/EJEMPLO. El lote sigue con el nuevo cultivo y, si se indica, su fecha de siembra.
✅ El historial muestra el cultivo actual y cada cultivo anterior con su duración en días y lo registrado en su periodo: análisis de suelo, planes, aplicaciones, observaciones y tareas. Cada registro se ubica por su fecha (análisis: fecha del análisis; plan: día de creación; seguimiento: fecha; tarea hecha: día en que se hizo; tarea pendiente: fecha prevista) entre el día siguiente al cierre anterior y su cierre, inclusive. Un análisis tomado antes de sembrar queda con el cultivo siguiente.
✅ **No se mueve, borra ni modifica ningún registro:** los análisis, planes y registros siguen en sus secciones; el historial solo los agrupa al leerlos. La app no calcula rendimientos ni interpreta las notas.
✅ Fechas validadas: el cierre no es futuro, no es anterior a la siembra del cultivo que se cierra y es **posterior** al cierre anterior (dos cierres el mismo día no se aceptan); la siembra del lote debe ser posterior al último cierre y la nueva siembra no es anterior al cierre. El cierre se guarda en una sola transacción (ciclo y lote juntos).
✅ **El informe para el productor muestra solo el cultivo actual** (lo posterior al último cierre) y lo avisa; los cultivos anteriores se consultan en el historial.
✅ **Editar información** no pisa cambios hechos en otra pestaña (por ejemplo, un cierre de ciclo): si el lote cambió mientras el formulario estaba abierto, no guarda y lo avisa. También conserva los campos de otras versiones del lote.
✅ Al restaurar una copia, los ciclos de un lote que ya está en el dispositivo se omiten con su motivo (el lote no se modifica y su historial quedaría incoherente).
✅ En un ciclo cerrado se corrigen cómo terminó, las notas y el origen; el cultivo y las fechas no se editan (ordenan el historial): si están mal, se quita el ciclo y se cierra de nuevo. Quitar un ciclo no cambia el lote ni borra registros. Los ciclos con datos dañados se muestran con su valor original y solo se pueden quitar.
✅ Base de datos versión 3 (`db.version(3)`): solo agrega la tabla `ciclos`. La copia de seguridad incluye los ciclos (dependen de su lote) y las copias anteriores, sin ciclos, se siguen restaurando. Eliminar un lote elimina sus ciclos.
✅ 174 pruebas automáticas al cerrar el historial (10 del historial, más 15 de la validación manual de la fase 6). Recorrido en Edge headless: 23 comprobaciones, incluida la migración de una base v2 con datos previos, el cierre, la edición de notas, la recarga, el ancho de teléfono (390 px) y la eliminación del lote.
✅ Una revisión de código del historial (17 de noviembre de 2026) encontró 10 puntos; todos están corregidos. 181 pruebas automáticas; recorrido en Edge headless de las correcciones: 10 comprobaciones.

**Guardar en la nube (pantalla "Mi cuenta", desde la foto o el nombre del encabezado) — sin costo**
✅ **Iniciar sesión con Google** después de aceptar la autorización de tratamiento de datos (Ley 1581 de 2012). Sin sesión, la app funciona exactamente como antes, solo en el teléfono.
✅ **Funciona sin internet:** todo se guarda primero en el teléfono. Con sesión, la app sincroniza al abrirse, al recuperar internet, 15 segundos después de cada cambio y cada 5 minutos, o con **Sincronizar ahora**. Muestra cuántos cambios faltan por subir.
✅ Varios dispositivos con la misma cuenta ven los mismos lotes, análisis, productos, planes, seguimiento e historial. Ediciones y eliminaciones también se propagan. En un conflicto gana la versión más reciente; un cambio sin subir nunca se pisa con lo que llega de la nube.
✅ Los datos viajan tal como están guardados (incluidos los dañados, NaN y campos de otras versiones), con la misma codificación de la copia de seguridad. Un lote que rompería la lista no se aplica.
✅ **Cerrar sesión** conserva los datos. **Borrar mis datos de la nube** los elimina del servidor (derecho de supresión). Un teléfono con datos de una cuenta no se mezcla con otra: hay que entrar con esa cuenta o borrar los datos del teléfono.
✅ Backend: API en el mismo Worker (`worker/`), base **Cloudflare D1** (`migrations/`), token de Google verificado en el servidor (firma, `aud`, `iss`, `exp`, correo verificado) y sesión propia de 30 días firmada con `SESION_SECRETO`. Todo en planes gratuitos: al superar un límite diario, la nube deja de responder hasta el día siguiente y la app sigue con los datos del teléfono. Detalles y costos en [`docs/NUBE_CLOUDFLARE.md`](./docs/NUBE_CLOUDFLARE.md).
✅ 190 pruebas automáticas (9 de la nube: token de Google, sesión, protocolo y sincronización entre dos teléfonos simulados). Prueba de la API con `wrangler dev` y D1 local: 15 comprobaciones. Recorrido con dos navegadores contra la API local: 10 comprobaciones (crear en uno, ver en otro, eliminar, cerrar sesión).
✅ **Revisión independiente del backend y de la sincronización (17 de noviembre de 2026):** 29 hallazgos en total (2 críticos de pérdida de datos). Todos corregidos, cada uno con una prueba que reproduce el escenario:
   - **La nube valida el contenido** con las mismas reglas de la app (`src/lib/validacionNube.ts`): un registro dañado no se sube, se queda en el teléfono y se informa. Un plan revisado o aprobado debe cumplir lo que la app exige para ese paso, y **un plan aprobado no se puede modificar en la nube** (solo eliminar).
   - **Nada se pierde en silencio:** una edición hecha mientras se sincroniza se conserva; en un conflicto, la versión que pierde se **aparta** y se puede descargar; los datos de la nube que no se pueden aplicar también se apartan; los registros cuyo lote se eliminó en otro teléfono se muestran para descargarlos o eliminarlos.
   - Las eliminaciones usan la **hora real** en que se hicieron; restaurar una copia de algo eliminado lo vuelve a subir.
   - **Época de la cuenta:** si la cuenta se borra y se vuelve a crear, los teléfonos lo detectan y suben todo de nuevo, y las sesiones anteriores dejan de servir.
   - Límites del plan gratuito: páginas de bajada de máximo 1 MB, cuerpos de máximo 1,4 MB (se cortan sin leerlos completos), registros de máximo 50 KB, **cuota de 20 MB y 50.000 registros por cuenta** (disparadores de D1), fechas futuras recortadas a la hora del servidor, sin bucles de solicitudes y pendientes calculados una sola vez por sincronización.
   - Una sola sincronización a la vez entre pestañas (Web Locks); el avance se guarda en la misma transacción que los datos.
   - Inicio de sesión: errores del token siempre como "no válido", descarga de claves de Google limitada, no se crea nada en la nube si el teléfono es de otra cuenta, y se registra la versión de la autorización aceptada.
✅ 202 pruebas automáticas al cerrar esta revisión (21 de la nube); hoy son 190 porque al retirar la copia JSON se eliminaron sus 12 pruebas. API con el SQL real (`wrangler dev` + D1 local, migración 0002): 20 comprobaciones. Dos navegadores contra la API local: 12 comprobaciones.

**Fase 6 (validación) — kit preparado, falta ejecutarlo con datos reales**
✅ Protocolo en [`docs/VALIDACION_FASE6.md`](./docs/VALIDACION_FASE6.md): roles, datos reales que reunir, carga en la app publicada, fórmulas, dos casos completos de EJEMPLO calculados a mano (dos lotes de papa), casos límite, registro de discrepancias y pruebas en un Android real.
✅ Hoja para el equipo: [`docs/hoja-comparacion-fase6.csv`](./docs/hoja-comparacion-fase6.csv) (separador `;`, abre en Excel). Pruebas automáticas de los casos manuales en `tests/validacionManual.test.ts`.

**No implementado aún:** la ejecución de la fase 6 con datos reales de papa y de otro cultivo.

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

### Pruebas manuales en navegador (fase 3b, catálogo)

1. Pulsa **Productos** en la barra superior: debe aparecer "Aún no hay productos en el catálogo".
2. Registra "DAP EJEMPLO" con Nitrógeno / N / `18` y Fósforo / P₂O₅ / `46`, bulto de `50` kg, precio `150.000` y fecha del precio. Al guardar debe rechazar el precio ("Escribe 150000"). La casilla **Son datos de práctica (EJEMPLO)** empieza sin marcar (marcada si el modo práctica está activo). Al corregir cada dato, su mensaje rojo desaparece.
3. Escribe `150000` y marca la casilla **Son datos de práctica (EJEMPLO)**: la vista previa debe decir "equivale a $ 3.000 por kg". Guarda: el detalle muestra la marca EJEMPLO, P₂O₅ 46 % tal cual y "$ 150.000 ÷ 50 kg = $ 3.000 por kg".
4. Prueba Fósforo con la forma "Otra forma" escribiendo `K2O`: debe rechazarse porque corresponde a Potasio.
5. Edita el precio a `160000`: debe mostrar $ 3.200 por kg. Recarga la página: el producto sigue en el catálogo.
6. Elimina el producto: debe pedir confirmación.

### Pruebas manuales en navegador (fase 3c, plan)

1. Registra en el catálogo "DAP EJEMPLO" (N 18 %, P₂O₅ 46 %, bulto de 50 kg a 160000 COP) y "KCl EJEMPLO" (K₂O 60 %, sin precio).
2. En un lote de **1500,5 m²**, en **Plan de fertilización**, crea una propuesta. Meta 1: Fósforo / **P** / 100 kg/ha con fuente, fecha y la casilla EJEMPLO marcada, producto DAP: debe avisar "Esta meta no se calculará". Cambia la forma a P₂O₅: el aviso desaparece y se ve "declara: N 18 % · P₂O₅ 46 %".
3. Meta 2: Potasio / K₂O / `1.200` con producto KCl: al guardar debe rechazar "1.200". Escribe `90` y guarda.
4. El detalle debe mostrar ≈ 217,39 kg/ha de DAP, ≈ 32,62 kg en el lote, ≈ 0,65 bultos, $ 3.200 por kg, ≈ $ 104.383 y ≈ 39,13 kg/ha de N (también aporta); KCl: 150 kg/ha y ≈ 22,51 kg en el lote, sin costo por falta de precio; y "no se muestra un total parcial".
5. Edita la propuesta: la meta 2 se precarga con `90` y el producto como "copia guardada en el plan". Cambia el precio del DAP en el catálogo a `200000`: el plan sigue mostrando ≈ $ 104.383; al editarlo avisa del cambio y, si eliges "datos actuales del catálogo", pasa a ≈ $ 130.478.
6. Elimina DAP del catálogo y vuelve al plan: debe seguir mostrando DAP EJEMPLO con las mismas cifras.

### Pruebas manuales en navegador (fase 3d, estados)

1. En el detalle de la propuesta, en **Estado del plan**, pulsa **Ya se revisó este plan** y confirma sin nombre: debe pedir el nombre. Escribe un nombre y una nota: el plan queda **Revisado** y desaparece **Editar**.
2. Pulsa **Aprobar: este es el plan que voy a aplicar**: desaparecen **Editar** y **Eliminar**, y el aviso dice que es de solo lectura. El historial muestra propuesta, revisado y aprobado con fecha, hora, nombre y nota.
3. Pulsa **Copiar como nueva propuesta**: se abre una propuesta editable con las mismas cifras, "Copia del plan «…»" en el historial y un enlace al plan original.
4. Crea una propuesta con una meta sin producto: **Ya se revisó este plan** queda deshabilitado con el motivo "La meta de … no tiene producto".

### Pruebas manuales en navegador (fase 4, seguimiento)

1. En un plan **aprobado**, en **Lo aplicado frente al plan**, registra 5 kg de un producto (casilla EJEMPLO marcada) y luego 3,5 kg con costo `15000`: el avance suma 8,5 kg y explica el porcentaje y lo aplicado en la forma de la meta. `1.500` kg debe rechazarse. Edita y elimina una aplicación: el plan sigue aprobado y sin cambios.
2. En **Seguimiento del lote**, guarda una observación vacía: debe pedir la descripción (el origen empieza como dato real, o EJEMPLO en modo práctica). Guárdala completa, edítala y elimínala (pide confirmación).
3. Crea una tarea con fecha prevista pasada: debe decir "Pendiente · fecha pasada". Pulsa **Marcar como hecha hoy**: queda "Hecha el …".
4. Usa **Mostrar** para ver solo un tipo de registro.

### Pruebas manuales en navegador (fase 5, informe)

1. En la ficha de un lote con un plan **aprobado**, pulsa **Informe para el productor**: debe mostrar el lote, el análisis más reciente, la recomendación (fertilizante, dosis por hectárea, cantidad para el lote, bultos y costo), lo aplicado, el seguimiento y las advertencias. Si hay datos de EJEMPLO, el aviso aparece arriba.
2. Pulsa **Imprimir o guardar como PDF** y elige "Guardar como PDF": solo debe salir el informe, sin la barra superior ni los botones.
3. En un lote sin plan aprobado, el informe debe decir que no incluye recomendación.

### Pruebas manuales en navegador (ingreso y nube)

1. Abre la app en una ventana privada: solo debe verse **Ingresa para usar AgroFerti MIC**, sin menú ni lotes.
2. La página de ingreso muestra qué hace la app y el botón **Iniciar sesión con Google** siempre visible, con el aviso de la autorización de datos junto a él. Ingresa con una cuenta de prueba.
2b. Arriba debe verse la foto de perfil (o un círculo con la inicial), **Hola, nombre** (o el correo si la cuenta no tiene nombre) y **Cerrar sesión**.
3. Crea un lote de EJEMPLO: en **Mi cuenta** (foto o nombre, arriba) debe decir que hay cambios por subir y, a los pocos segundos, **Todo sincronizado**.
4. En otro dispositivo, ingresa con la misma cuenta: el lote debe aparecer. Elimínalo allí y sincroniza en el primero: debe desaparecer.
5. **Cerrar sesión** vuelve a la pantalla de ingreso; al volver a entrar con la misma cuenta, los datos siguen ahí.
6. Sin internet (modo avión), con la sesión iniciada, la app sigue funcionando; al volver la conexión se sincroniza sola.
7. Para tener los datos en papel o PDF: ficha del lote → **Informe para el productor**, o en Mis lotes → **Informe de todos los lotes (PDF)** (un resumen y cada lote en su propia página) → **Imprimir o guardar como PDF**.

### Pruebas manuales en navegador (historial del lote)

1. Abre un lote de papa con siembra registrada y algún análisis u observación. En **Historial del lote** debe verse solo "Cultivo actual", con esos registros.
2. Pulsa **Cerrar ciclo y empezar otro cultivo** y guarda sin elegir nada: debe pedir cómo terminó y el origen del dato. Pon una fecha de cierre anterior a la siembra: debe rechazarla.
3. Cierra con una fecha válida, "Se cosechó", notas de EJEMPLO, cultivo del nuevo ciclo Papa y su siembra. La ficha debe mostrar la nueva siembra; el historial, el ciclo de papa con su duración, la marca EJEMPLO y, al abrirlo, sus análisis y observaciones. Esos registros siguen en sus secciones.
4. Pulsa **Editar notas**, cambia el texto y recarga la página: el cambio debe seguir ahí.
5. Intenta cerrar otro ciclo con una fecha anterior al cierre anterior: debe rechazarla.
6. **Quitar del historial** pide confirmación y no cambia el cultivo actual ni borra registros.

## Inicio exclusivo desde terminal

Consulta [INICIO_TERMINAL.md](./INICIO_TERMINAL.md) para instalar Node.js, Git, Claude Code y Codex CLI, y para trabajar desde varias pestañas de terminal sin un editor gráfico.

Claude Code lee `CLAUDE.md`; Codex lee `AGENTS.md`. Ambos archivos contienen instrucciones compartidas del proyecto.

## Estructura del proyecto

```text
agroferti-mic/
├─ public/              # Iconos de la PWA
├─ src/
│  ├─ components/
│  │  ├─ LoteForm.tsx              # Formulario del lote
│  │  ├─ AnalisisSueloSeccion.tsx  # Historial y flujo de análisis dentro del lote
│  │  ├─ AnalisisSueloForm.tsx     # Formulario de análisis de suelo
│  │  ├─ AnalisisSueloDetalle.tsx  # Datos ingresados, cálculos explicados y advertencias
│  │  ├─ ProductosSeccion.tsx      # Fase 3b: catálogo de productos (lista y flujo)
│  │  ├─ ProductoForm.tsx          # Fase 3b: formulario según la etiqueta
│  │  ├─ ProductoDetalle.tsx       # Fase 3b: datos de la etiqueta y precio por kg
│  │  ├─ PlanesSeccion.tsx         # Fase 3c: planes dentro de la ficha del lote
│  │  ├─ PlanForm.tsx              # Fase 3c: metas con su fuente y producto por meta
│  │  ├─ PlanDetalle.tsx           # Fase 3c: cálculo del plan explicado paso a paso
│  │  ├─ PlanEstado.tsx            # Fase 3d: estados del plan e historial
│  │  ├─ PantallaIngreso.tsx       # Ingreso obligatorio con Google y autorización de datos (Ley 1581)
│  │  ├─ Encabezado.tsx            # Secciones, foto o inicial, "Hola, nombre", correo y cerrar sesión; menú hamburguesa en celular
│  │  ├─ InformeGeneral.tsx        # Informe de todos los lotes para imprimir o guardar en PDF
│  │  ├─ NubeSeccion.tsx           # Pantalla Mi cuenta: estado de la sincronización, cerrar sesión, borrar datos de la nube
│  │  ├─ AplicacionesPlan.tsx      # Fase 4b: lo aplicado frente a un plan aprobado
│  │  ├─ SeguimientoSeccion.tsx    # Fase 4c: observaciones, tareas y lista del seguimiento
│  │  ├─ InformeLote.tsx           # Fase 5: informe imprimible para el productor
│  │  ├─ HistorialLoteSeccion.tsx  # Historial: cierre de ciclos y cultivos anteriores del lote
│  │  └─ useSeleccionViva.ts       # Registro abierto en una sección sobre una consulta en vivo
│  ├─ lib/
│  │  ├─ calculos.ts            # Matemáticas verificables, sin prescribir dosis
│  │  ├─ validacion.ts          # Validaciones puras y verificación de registros guardados
│  │  ├─ catalogoNutrientes.ts  # Notación química elemento/forma (sin conversiones)
│  │  ├─ repositorioAnalisis.ts # Reglas de persistencia, comprobables sin IndexedDB
│  │  ├─ validacionPlan.ts      # Fase 3: validación de productos, planes y cambios de estado
│  │  ├─ repositorioPlanes.ts   # Fase 3: persistencia del catálogo y de los planes
│  │  ├─ codificacion.ts        # Registro como texto para la nube (conserva NaN y fechas)
│  │  ├─ informe.ts             # Fase 5: datos del informe (plan aprobado más reciente, análisis, seguimiento)
│  │  ├─ validacionSeguimiento.ts # Fase 4: validación y verificación de aplicaciones, observaciones y tareas
│  │  ├─ repositorioSeguimiento.ts # Fase 4: persistencia del seguimiento (solo planes aprobados)
│  │  ├─ historial.ts           # Historial: verificación de ciclos, validación del cierre y agrupación por fechas
│  │  ├─ repositorioCiclos.ts   # Historial: cerrar ciclo (ciclo y lote en una transacción), notas y quitar
│  │  ├─ protocoloNube.ts       # Nube: formato y validación de las solicitudes (lo usan la app y el Worker)
│  │  ├─ validacionNube.ts      # Nube: reglas de contenido para subir (las mismas de la app; las aplica también el Worker)
│  │  ├─ sincronizacion.ts      # Nube: qué subir, qué aplicar al bajar y conflictos (reglas puras)
│  │  ├─ nube.ts                # Nube: cliente de la API y Client ID de Google
│  │  ├─ cuentaNube.ts          # Nube: sesión y sincronización automática
│  │  ├─ formato.ts             # Números y fechas en es-CO
│  │  └─ db.ts                  # IndexedDB mediante Dexie (esquema v4)
│  ├─ types.ts           # Modelo de lotes, análisis, productos y planes
│  ├─ App.tsx            # Navegación e interfaz principal
│  ├─ main.tsx
│  └─ styles.css
├─ tests/
│  ├─ calculos.test.ts     # Fórmulas de base
│  ├─ lote.test.ts         # Área del lote: decimales y escrituras ambiguas
│  ├─ suelo.test.ts        # Validación, catálogo, registros dañados, desbordamientos
│  ├─ robustez.test.ts     # Precisión al editar, arrays dispersos, estructuras inesperadas
│  ├─ persistencia.test.ts # Crear, leer, editar, eliminar y aislamiento entre lotes
│  ├─ plan.test.ts         # Fase 3: cálculos del plan, formas químicas, validación y estados
│  ├─ persistenciaPlan.test.ts # Fase 3: catálogo, planes, estados, copias y trazabilidad
│  ├─ seguimiento.test.ts   # Fase 4: registros, avance del plan y persistencia
│  ├─ historial.test.ts     # Historial: ciclos, agrupación por fechas, cierre atómico y copia
│  ├─ validacionManual.test.ts # Fase 6: casos de EJEMPLO calculados a mano frente a la app
│  ├─ nube.test.ts          # Nube: token de Google, sesión, protocolo y sincronización
│  └─ informe.test.ts       # Fase 5: qué plan, análisis y seguimiento muestra el informe
├─ worker/               # API de la nube: index.ts (rutas y SQL), google.ts (token), sesion.ts
├─ migrations/           # Tablas de D1 (cada cambio, una migración nueva)
├─ wrangler.jsonc        # Worker publicado: archivos estáticos, API y conexión a D1
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
| 5. Entrega y despliegue | 12–13 | Informe productor (PDF), nube con ingreso obligatorio, instalación PWA, Cloudflare Workers |
| 6. Validación | 14–15 | Prueba con papa, otro cultivo, comparación manual, correcciones y presentación |

**No incluir en los primeros 15 días:** backend NestJS, autenticación, IA por API, OCR de análisis, sensores, diagnósticos foliares por foto, notificaciones push, publicación en tiendas móviles.

## Fórmulas de base

1. `hectáreas = área_m² / 10.000`.
2. `masa_kg/ha = 10.000 × profundidad_m × densidad_kg/m³`.
3. `equivalencia_kg/ha = concentración_mg/kg × masa_kg/ha / 1.000.000`.
4. `producto_kg/ha = meta_validada_kg/ha / (contenido_porcentual / 100)`, solo si la forma química de la meta y la de la etiqueta coinciden.
5. `producto_kg_lote = producto_kg/ha × área_m² / 10.000` (área guardada con el plan).
6. `COP_por_kg = precio_bulto_COP / kg_por_bulto`.
7. `costo_COP = kg_de_producto × COP_por_kg`.
8. `bultos = kg_de_producto / kg_por_bulto` (exacto; redondear lo decide el productor).
9. `aporte_kg/ha = producto_kg/ha × contenido_porcentual / 100`, para cada forma declarada en la etiqueta.

**Advertencia esencial:** la equivalencia calculada a partir de un resultado de laboratorio expresado en mg/kg **NO determina la disponibilidad para la planta ni la dosis de fertilización**. El plan exige que el usuario suministre una meta nutricional justificada y respaldada por una fuente técnica. No deben copiarse dosis entre cultivos.

## Datos del productor y privacidad

Para usar la app hay que **ingresar con Google** y aceptar la autorización de tratamiento de datos (Ley 1581 de 2012). Los datos se guardan en el teléfono (IndexedDB) y en la cuenta del usuario en la nube (Cloudflare D1), así no se pierden si se borra el navegador o se cambia de teléfono. El usuario puede borrar sus datos de la nube en **Mi cuenta** (foto o nombre, arriba). Para tenerlos en papel o PDF se usa el **Informe para el productor** de cada lote. Es un prototipo académico: no lo uses como registro único de un cultivo real.

## Publicación en Cloudflare Workers

**App publicada:** https://agroferti-mic.senaedu.workers.dev/

La dirección es `<nombre del Worker>.<subdominio de la cuenta>.workers.dev`. El subdominio de la cuenta (`senaedu`) se cambia en el panel de Cloudflare (Workers & Pages); al cambiarlo, la dirección anterior deja de funcionar y los datos guardados en el navegador no pasan a la nueva, porque dependen de la dirección.

Está conectada al repositorio de GitHub: **cada push a `main` se compila y se publica sola** (Workers Builds, plan gratuito). El resultado aparece como check "Workers Builds: agroferti-mic" en el commit de GitHub. Desde el 17 de noviembre de 2026 la configuración del Worker está en `wrangler.jsonc` (archivos estáticos, API y conexión a D1); la compilación usa `npm run build` y la publicación `npx wrangler deploy`.

- **No agregues `public/_redirects`.** Workers rechaza la regla `/* /index.html 200` por bucle infinito y el deploy falla. La app no tiene rutas propias y el service worker ya usa `index.html` sin conexión.
- Tras un push, recarga la app una o dos veces para que el navegador tome la versión nueva (actualización automática de la PWA).
- Para revisar versiones desde la terminal: `npx wrangler versions list --name agroferti-mic` (requiere `npx wrangler login`).

### Cómo se creó (por si hay que repetirlo en otra cuenta)

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
5. En Cloudflare > Workers & Pages > Create > Import a repository y da acceso al repositorio (puede ser privado).
6. Selecciona el repositorio; Cloudflare detecta Vite y usa `npm run build` con la carpeta `dist`. La versión de Node la toma de `.node-version`.
7. Publica. Verifica el enlace `workers.dev`, crea un lote y recarga.
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

## Para retomar (estado al 17 de noviembre de 2026)

- **Revisión de experiencia de uso (22 de noviembre de 2026):** cinco tandas aprobadas (ver `AGENTS.md`, "Experiencia de uso").
  - **Tanda 1, textos y marcas:** precios y costos en pesos con "$" (`$ 150.000`); asterisco en todos los campos obligatorios; unidades "mg/kg (ppm)" y "cmol(+)/kg (meq/100 g)"; los cálculos en kg/ha del análisis quedan plegados con su advertencia; se corrigieron textos que se contradecían (solo papa, para qué sirve el análisis del plan); los botones de estado dicen «Ya se revisó este plan» y «Aprobar: este es el plan que voy a aplicar»; "También aporta" y "Diferencia con la meta" en el plan; "Cambios que chocaron entre dispositivos" en Mi cuenta; la tarjeta "Cultivos distintos" de Mis lotes pasó a "Tareas pendientes".
  - **Tanda 2, glosario:** pantalla **Glosario** (161 términos en 7 temas, con buscador que ignora tildes y entiende lo que se escribe en el celular: P2O5, K+, Ca2+, meq/100g), a la que se entra desde **Cómo funciona**. Cada sección tiene una fila "¿Qué significa?" con sus términos clave, y algunos términos dentro de los textos se pueden tocar para ver su definición. La fórmula de la capa arable pasó de "Cómo funciona" al glosario. Menos advertencias repetidas: la de "propuesta, no prescripción" quedó al inicio de la sección del plan (antes estaba al final de la ficha y repetida en el formulario). Los mensajes de la nube dicen qué hacer. Los datos del glosario están en `src/lib/glosario.ts`; una prueba verifica que cada ayuda de la interfaz apunte a un término que existe.
  - **Tanda 3, metas sin condiciones ocultas:** el lote guarda su **zona** (campo opcional `zona`, validado también en la nube) y el plan la usa sin volver a elegirla; desde las sugerencias se puede "Guardar como zona del lote". Una propuesta nueva elige el análisis más reciente. Arriba de las sugerencias, "Para proponerte metas necesito" muestra qué falta (análisis, fósforo en mg/kg con Bray II, potasio en cmol(+)/kg, zona) y cómo corregirlo. El formulario del análisis avisa si un nutriente está en otra unidad o con otro método y no servirá para proponer metas. La zona aparece en la ficha y en el informe.
  - **Tanda 4, camino guiado:** la ficha del lote empieza con una **barra de pasos** (lote, análisis, plan, aplicar, cosechar) y un recuadro **Siguiente paso** con un botón que lleva a la sección; cada tarjeta de Mis lotes dice lo que le falta y sus tareas pendientes (lógica pura en `src/lib/avance.ts`, con pruebas). El plan muestra en qué va (propuesta → revisado → aprobado), quién hace cada paso y qué sigue; al aprobar, devolver o copiar se propone el nombre de la cuenta (al marcar como revisado no, porque va el de quien revisó). Seguimiento tiene **+ Aplicación** (elige el producto del plan aprobado). **Mi cuenta** es una pantalla propia, desde la foto o el nombre del encabezado, con un punto de color que muestra el estado de la nube. La presentación de Mis lotes solo aparece cuando no hay lotes.
  - **Tanda 5, formularios más cortos:** el origen del dato es una casilla "Es un dato de práctica (EJEMPLO)" que empieza sin marcar (un registro guardado con el origen dañado sigue pidiendo elegirlo); **modo práctica** en Mi cuenta (solo en ese dispositivo) para que lo nuevo empiece como EJEMPLO, con un aviso arriba mientras está activo. Las metas que vienen de una sugerencia se muestran como tarjeta (nutriente, fuente, meta en kg/ha y producto) con "Ver o cambiar el nutriente y la fuente". La lista de productos de cada meta separa los que declaran esa forma química de los que no. El análisis ofrece "Usar la lista típica de un análisis" (12 filas con elemento y forma, sin valores ni unidades: la unidad se elige al copiar cada valor; las filas vacías no se guardan). El lote tiene **departamento** (campo `departamento`, validado en la nube) para el precio DANE, que se toma exacto; en la ubicación escrita se reconoce primero el departamento con palabras completas, así "Norte de Santander" ya no se confunde con "Santander" ni "Metálica" con Meta.
- Historial del lote (ciclos de cultivo) publicado y revisado: los 10 puntos de la revisión de código están corregidos (181 pruebas, build correcto).
- **Referencias técnicas en la nube (19 de noviembre de 2026):** tabla `referencias` de D1 (migración 0003), API `GET /api/referencias` y copia en el teléfono para usarlas sin internet. Se cargan desde `data/referencias/` con `npm run referencias:nube`, que valida cada referencia antes de cargarla. **Catálogo de 26 fertilizantes comerciales**: composición garantizada del registro del ICA (actualizado el 1 de noviembre de 2026) y precio promedio DANE-SIPSA por departamento (octubre de 2026). En **Productos → Agregar producto → Llenar desde el catálogo de referencia** se llena el formulario (nombre, nutrientes, bulto, registro ICA, precio y su fuente) y el productor lo revisa antes de guardar. 11 productos no tienen estado en el listado del ICA y se muestran "pendiente de verificación"; 2 se omitieron porque el ICA no publica sus porcentajes. **Términos de uso:** los del ICA permiten el uso no comercial citando la fuente; antes de un uso comercial hay que pedir autorización al ICA. El DANE exige citar "Fuente: DANE".
- **Plan propuesto y catálogo completo del ICA (19 de noviembre de 2026):** el plan **propone las metas** (punto medio del rango de Castro, 2005, según el análisis y la zona; "Usar las N metas propuestas") y, en cada meta, **sugiere fertilizantes** que aportan esa forma química, con "Agregar y usar". El catálogo de referencia pasó de 26 a **4.078 fertilizantes**: los 26 con precio DANE y 4.052 vigentes de aplicación al suelo del registro del ICA (1 nov. 2026), leídos con `scripts/catalogo-ica.ts`; la composición se compara con el grado del nombre (si falta un nutriente del grado, el producto no entra; si difiere, queda "por verificar": 333). En Productos, el catálogo se busca por nombre, empresa o grado. Además: el método del laboratorio se elige por nutriente (fósforo; potasio, calcio y magnesio) y todas las confirmaciones usan una ventana propia en lugar del aviso del navegador.
- **Leer el análisis desde un PDF o una foto (19 de noviembre de 2026):** en el formulario de un análisis nuevo, "Elegir PDF o foto". Los PDF con texto se leen con PDF.js y las fotos o PDF escaneados con Tesseract.js (español), todo en el navegador y sin servicios de pago (la primera lectura de una foto descarga el idioma español, unos MB). La app muestra cada dato leído con la línea del informe de donde salió; el productor confirma y corrige uno por uno, y **solo lo confirmado pasa al formulario**. Unidades: ppm se lee como mg/kg y meq/100 g como cmol(+)/kg; otras no se leen. Con un PDF de EJEMPLO se leyeron los 10 datos; con una foto, 4 de 8 (sin ningún valor equivocado: las líneas dudosas se descartan). Las librerías se descargan solo al usarlas.
- **Sugerencia de metas (19 de noviembre de 2026):** 14 reglas de dosis y 11 tablas de niveles para papa en D1, cada una con fuente, página y transcripción: Castro Franco (2005), Tabla 2 (P₂O₅ según P Bray II, K₂O según K intercambiable y N por región: Subpáramos de Cundinamarca y Boyacá; Altiplano Cundiboyacense, Nariño y Antioquia) y Tabla 3 (niveles críticos). Para lechuga, kale y arveja no se encontró una tabla colombiana o andina completa por análisis; por eso la app quedó solo con papa. Se dejaron fuera ensayos, requerimientos por rendimiento y dosis generales. Las fuentes se contradicen en algunos puntos (p. ej. P₂O₅ para papa a 20 t/ha): la app muestra un rango con su cita y el productor y su agrónomo deciden.
- **Revisión de interfaz (19 de noviembre de 2026):** 18 hallazgos corregidos. El botón "atrás" del celular cierra el formulario abierto o vuelve a la pantalla anterior (sin salir de la app); las tablas del informe y del plan se desplazan de lado en celular en vez de partir palabras; "Cómo funciona" en 5 pasos actualizados; sin el bloque "Tres pasos"; botones de sección a lo ancho en celular; acciones de al menos 44 px y "Eliminar" separado de "Editar"; el plan muestra arriba "Qué comprar y aplicar" y las fórmulas plegadas; "Falta por aplicar" en vez de diferencias negativas; informe con "Plan aprobado: qué aplicar" y trato de tú; textos sin jerga del proyecto; más contraste; "Volver" en el formulario de producto.
- **Área en m², hectáreas o fanegadas** (1 fanegada = 6.400 m², la usual en Cundinamarca y Boyacá); siempre se guarda en m². El método del laboratorio tiene explicación y una lista de métodos comunes.
- **Ingreso obligatorio (17 de noviembre de 2026):** sin iniciar sesión con Google solo se ve la página de ingreso (presentación de la app y botón de Google siempre visible; ingresar después del aviso es la autorización de datos, Ley 1581). Con sesión, el encabezado muestra las secciones, la foto de perfil o la inicial, "Hola, nombre", el correo y Cerrar sesión; en celular, el avatar y un menú hamburguesa con las secciones y Cerrar sesión. **Informe de todos los lotes (PDF)** en Mis lotes. Con la sesión vencida y sin internet se puede seguir trabajando; al volver la conexión hay que ingresar de nuevo. La copia de seguridad JSON se retiró: la nube la reemplaza y el informe de cada lote se imprime o se guarda en PDF.
- **Nube publicada y revisada (17 de noviembre de 2026):** Worker + D1 (`agroferti-db`, migraciones 0001 y 0002 aplicadas) + Sign in with Google, en planes gratuitos y sin métodos de pago. La cuenta de Cloudflare es la de `leonardoquintero222@gmail.com`; el secreto `SESION_SECRETO` está guardado en Cloudflare (no en el repositorio). Falta la prueba con un inicio de sesión real de Google en la app publicada y en un teléfono.
- Para trabajar con la API en local: `npm run db:migrar:local` (una vez), crear `.dev.vars` con `SESION_SECRETO=<texto de 32+ caracteres>` y luego `npm run dev:api` (app + API en http://localhost:8787). En Windows PowerShell usa `npm.cmd` y `npx.cmd`.
- Si cambia el esquema de D1: nueva migración en `migrations/` y `npm run db:migrar:nube` antes de publicar el código que la usa.
- Kit de la fase 6 listo en `docs/`. Falta que el equipo consiga datos reales y llene la hoja de comparación.
- Corregido al preparar la fase 6: en el análisis de suelo, el valor de un nutriente o la profundidad escritos `1.500` se guardaban como 1,5. Ahora se rechazan como en el área, las metas y los kg, y se pide `1500` (caso L7 del protocolo).
- Los formularios ya no dicen "opcional" junto a los campos que se pueden dejar vacíos (pedido del equipo).
- Si trabajas en otro equipo, haz `git pull` antes de empezar: el 11 de noviembre la copia local estaba 23 commits atrás.

## Estado al 29 de octubre de 2026

- Fase 3 completa (3a modelo, 3b catálogo, 3c plan, 3d estados). 3b, 3c y 3d pasaron una revisión de código cada una, con todos los puntos corregidos, y están publicadas.
- Fase 3a (modelo, cálculos y persistencia) terminada y publicada; la app publicada muestra las fases 1 y 2. Recorrido en Chrome sobre la URL publicada: 16 comprobaciones correctas, incluido el uso sin conexión.
- Fase 2 cerrada tras dos auditorías de Codex: 54 pruebas, build correcto y recorrido en navegador (Edge headless, 58 comprobaciones) aprobado.
- El recorrido en navegador se ejecutó con un script temporal fuera del repositorio; las pruebas manuales equivalentes están en "Pruebas manuales en navegador (fase 2)".
- Pendiente opcional: probar en un teléfono Android real (teclado y selectores nativos).

## Limitaciones conocidas de la fase 3a

- Todavía no hay interfaz: el modelo se prueba con 29 pruebas automáticas y con una verificación de la migración en Dexie real hecha fuera del repositorio.
- Cada meta se cubre con un solo producto. Repartir una meta entre varios productos (p. ej. parte del N con DAP y el resto con urea) queda para después; se puede agregar como campo opcional sin migrar datos.
- Los aportes acompañantes se suman en el resumen, pero no reducen la cantidad de otros productos.
- El nombre de quien revisa o aprueba lo escribe el usuario: la app no verifica identidades ni certifica aprobaciones técnicas.
- Un plan guardado con datos dañados solo se consulta o se elimina (si no está aprobado); no se edita, no cambia de estado ni se copia.
- Los campos de otras versiones se conservan en el primer nivel del plan y del producto; dentro de metas, líneas y contenido se descartan al editar.

## Limitaciones conocidas de la fase 3b

- Al editar un producto con datos dañados, solo se precarga el nombre: el resto se vuelve a escribir desde la etiqueta y se reemplaza con confirmación expresa.
- El catálogo de formas químicas es el mismo de la fase 2; las formas fuera de la lista (p. ej. SO₃) se guardan como texto, sin validación química adicional.
- Los componentes React no tienen pruebas automáticas; la interfaz se verificó con un recorrido en Chrome (29 comprobaciones) hecho con un script fuera del repositorio. Las pruebas manuales equivalentes están arriba.

## Limitaciones conocidas de la fase 3c

- Cada meta se cubre con un solo producto y los aportes acompañantes no reducen otras cantidades (ver limitaciones de 3a).
- El nombre de quien elabora la propuesta es opcional y lo escribe el usuario; la app no verifica identidades.

## Limitaciones conocidas de la fase 3d

- El nombre de quien revisa o aprueba lo escribe el usuario; puede ser el mismo para todos los cambios. La app no verifica identidades ni que la revisión la haga otra persona.
- Un plan aprobado solo se elimina junto con su lote (al eliminar el lote se borran todos sus datos, con confirmación).
- Revisar o aprobar exige un producto con cantidad calculada en cada meta, pero no exige precio: un plan aprobado puede no tener costo total.

## Limitaciones conocidas del informe

- Muestra solo el análisis de suelo más reciente y el plan aprobado más recientemente (si hay varios, lo indica).
- El PDF lo genera el navegador: el aspecto puede variar un poco entre navegadores; se probó con Chrome.
- La recomendación es la del plan aprobado; para que la app propusiera metas a partir del análisis harían falta tablas agronómicas validadas con su fuente (decisión pendiente, fuera del alcance actual).

## Limitaciones conocidas de la nube

- En un conflicto gana la versión con la fecha de actualización más reciente; depende del reloj de cada teléfono (la nube recorta las fechas que estén más de 5 minutos adelante de su hora). La versión que pierde se aparta y se puede descargar.
- La hora real de cada eliminación se guarda en el almacenamiento local del navegador; si se pierde, se usa la hora de la sincronización.
- La nube valida estructura, datos y reglas de los planes (las mismas de la app), pero no relaciones entre registros: por ejemplo, no comprueba que una aplicación sea de un plan aprobado del mismo lote. Esas reglas las aplica la app.
- Cerrar sesión solo cierra la sesión en ese teléfono; la sesión de otro dispositivo sigue válida hasta que vence (30 días) o hasta borrar los datos de la nube.
- Las marcas de eliminación se guardan para siempre en la nube (ocupan poco); un dispositivo nuevo las descarga.
- Cuota por cuenta: 20 MB y 50.000 registros. Al llegar, los cambios nuevos se quedan en el teléfono y la app lo avisa; eliminar sí se permite. Cualquier persona con una cuenta de Google puede crear una cuenta: si se abusa, habría que agregar una lista de correos permitidos.
- Cada migración nueva de D1 se aplica a mano con `npm run db:migrar:nube` antes de subir el código que la usa (Workers Builds no la aplica).
- La autorización de datos indica como contacto del responsable leonardoquintero222@gmail.com.
- El inicio de sesión necesita internet la primera vez en cada dispositivo. La sesión dura 30 días; después hay que volver a entrar (los datos del teléfono no se pierden).
- Un teléfono queda vinculado a una cuenta. Para usar otra, hay que borrar los datos del teléfono.
- En plan gratuito: 100.000 solicitudes y 100.000 escrituras por día. Al superarlo, la nube no responde hasta las 00:00 UTC (19:00 en Colombia); no se cobra.
- Google borra el ID de cliente si pasa seis meses sin usarse (se puede restaurar durante 30 días).

## Limitaciones conocidas del historial del lote

- Los registros se ubican en un ciclo por su fecha, no por un vínculo guardado: si se corrige la fecha de un análisis o un registro, puede pasar a otro ciclo. Un plan se ubica por el día en que se creó, no por el de su aprobación.
- Cambiar el cultivo con **Editar información** no guarda el cultivo anterior en el historial; el formulario lo advierte.
- El historial no compara rendimientos ni costos entre ciclos: las notas son texto libre y la app no las interpreta.
- El informe para el productor muestra solo el cultivo actual; no incluye un resumen de los cultivos anteriores.
- Las secciones de planes y seguimiento muestran todos los registros del lote, también los de cultivos cerrados: por ejemplo, se pueden seguir registrando aplicaciones de un plan aprobado de un cultivo anterior.

## Próximo trabajo: fase 6 (validación)

Seguir [`docs/VALIDACION_FASE6.md`](./docs/VALIDACION_FASE6.md): probar con datos reales de papa y de otro cultivo, comparar los cálculos de la app con cálculos manuales en la hoja `docs/hoja-comparacion-fase6.csv` y corregir solo los errores encontrados. Lee primero `AGENTS.md`.
