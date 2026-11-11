# Fase 6 — Protocolo de validación de AgroFerti MIC

**Objetivo:** comprobar con datos **reales** de papa y de un segundo cultivo que la app calcula exactamente lo mismo que un cálculo hecho a mano, y anotar cualquier diferencia. **En esta fase solo se corrigen errores encontrados; no se agregan funciones, metas ni dosis.**

App publicada: **https://agroferti-mic.senaedu.workers.dev/**

Archivos de apoyo:

- `docs/hoja-comparacion-fase6.csv` — hoja para anotar cada operación (ábrela en Excel; usa `;` como separador).
- `tests/validacionManual.test.ts` — los casos de EJEMPLO de este documento convertidos en pruebas automáticas (`npm run test`).

> **Importante.** Todos los números de los casos A y B de este documento son de **EJEMPLO**: no son análisis, etiquetas, precios ni metas reales, y **no son recomendaciones de fertilización**. Solo sirven para practicar el cálculo manual y comprobar la aritmética de la app.

---

## 1. Roles

| Rol | Persona | Qué entrega |
|---|---|---|
| Agronomía | Compañero de agronomía | Etiquetas reales de fertilizantes (foto) y la **fuente técnica** de cada meta (documento, profesional o laboratorio, con fecha). |
| Datos | Compañero de datos | Análisis de suelo reales (copia o foto del informe del laboratorio), uno de papa y uno del otro cultivo. |
| Validación | Compañero de validación | El cálculo manual de cada operación, anotado en la hoja de comparación **antes** de mirar la app. |
| Registro en la app | Programador o quien se asigne | Carga los datos en la app publicada y copia lo que muestra en la columna `valor_app`. |
| Presentación | Compañero de presentación | Capturas de pantalla reales y prueba de lectura con productores. |

Regla de oro: **quien hace el cálculo manual no mira la app hasta terminar**, y quien carga los datos no corrige nada por su cuenta.

---

## 2. Datos reales que hay que reunir

Para cada cultivo (papa y el segundo cultivo, por ejemplo arveja):

### 2.1 Lote
- Nombre, cultivo y **área en m²** (escrita sin punto de miles: `2500`, no `2.500`).
- Fecha de siembra y ubicación (opcionales).

### 2.2 Análisis de suelo (copia del informe del laboratorio)
| Dato | Obligatorio | Nota |
|---|---|---|
| Fecha del análisis | Sí | No puede ser futura. |
| Profundidad de muestreo (cm) | Sí | Ej.: 0–20 cm → escribir `20`. |
| Densidad aparente (g/cm³) | Para calcular kg/ha | Si el laboratorio no la reporta, **dejarla vacía**. No se inventa: sin densidad la app no calcula kg/ha, y eso es correcto. |
| Laboratorio y método | Sí, para trazabilidad | Sin método el análisis queda como "Registro incompleto". |
| Cada nutriente: elemento, **forma química**, valor y **unidad** | Sí | Copiar la forma tal como la escribe el informe: **P no es P₂O₅, K no es K₂O.** Unidad `mg/kg` (= ppm) o `cmol(+)/kg`. |

### 2.3 Etiqueta de cada fertilizante
- Nombre comercial.
- **% de cada forma química** tal como lo declara la etiqueta (ej.: N 18 %, P₂O₅ 46 %).
- **Kg del bulto**, **precio del bulto en COP** y **fecha del precio** (y dónde se cotizó).
- Foto de la etiqueta guardada en la carpeta del equipo.

### 2.4 Meta nutricional (por nutriente)
- Nutriente, **forma química** (la misma de la etiqueta del producto que la va a cubrir), kg/ha.
- **Fuente técnica y fecha de la fuente** (documento, profesional o laboratorio). Sin fuente real, la meta se marca **EJEMPLO**.
- La app **no propone** metas ni las saca del análisis de suelo. Si la fuente da la meta en P y la etiqueta en P₂O₅, **no se convierte**: se consulta con agronomía para obtener la meta en la forma de la etiqueta, citando la fuente.

### 2.5 Aplicaciones (si las hay)
- Fecha (no futura), kg de producto aplicados, costo real (opcional), responsable.

---

## 3. Cómo cargar los datos en la app

1. Abre https://agroferti-mic.senaedu.workers.dev/ (en el computador o en el teléfono).
2. **Mis lotes → + Nuevo lote**: nombre, cultivo y área en m². Revisa la vista previa de cómo se interpretó el número.
3. En la ficha del lote, **Análisis de suelo → + Agregar análisis**: fecha, profundidad, densidad, laboratorio, método y cada nutriente con **+ Agregar nutriente**.
4. **Productos** (barra superior) **→ + Agregar producto**: copia la etiqueta. Marca **"etiqueta real"** solo si es real; si no, **EJEMPLO**.
5. En la ficha del lote, **Plan de fertilización → + Nueva propuesta**: **+ Agregar meta** (nutriente, forma, kg/ha, fuente, fecha, origen real o EJEMPLO) y elige el producto de cada meta.
6. Abre el plan y copia en la hoja cada resultado del bloque **"Resultados calculados"**.
7. **Estado del plan**: Marcar como revisado → Aprobar el plan (con el nombre de quien revisa/aprueba).
8. En el plan aprobado, **+ Registrar aplicación** para cada aplicación real y copia el bloque "Lo aplicado frente al plan".
9. **Informe para el productor**: revisa que los números coincidan con los del plan.
10. Al terminar cada sesión: **Mis lotes → Copia de seguridad → Descargar copia (JSON)** y guárdala en la carpeta del equipo.

---

## 4. Fórmulas (las mismas de la app)

| # | Operación | Fórmula |
|---|---|---|
| F1 | Hectáreas | `ha = área_m² / 10.000` |
| F2 | Masa de suelo | `masa_kg/ha = 10.000 × (profundidad_cm / 100) × (densidad_g/cm³ × 1.000)` |
| F3 | mg/kg → kg/ha | `kg/ha = mg/kg × masa_kg/ha / 1.000.000` (equivalencia dimensional, **no es dosis ni disponibilidad**) |
| F4 | Total del lote (suelo) | `kg_lote = kg/ha × área_m² / 10.000` |
| F5 | Producto por hectárea | `producto_kg/ha = meta_kg/ha / (% etiqueta / 100)` — solo si la forma de la meta = forma de la etiqueta |
| F6 | Producto en el lote | `kg_lote = producto_kg/ha × área_m² / 10.000` (área guardada con el plan) |
| F7 | Bultos | `bultos = kg_lote / kg_por_bulto` (número exacto; redondear lo decide el productor) |
| F8 | Precio por kg | `COP/kg = precio_bulto / kg_por_bulto` |
| F9 | Costo | `costo = kg_lote × COP/kg` |
| F10 | Aporte acompañante | `aporte_kg/ha = producto_kg/ha × % de esa forma / 100` |
| F11 | Resumen por forma | `aportado = suma de aportes de esa forma`; `diferencia = aportado − meta` |
| F12 | Aplicado | `aplicado = suma de los kg de las aplicaciones` |
| F13 | Aplicado − planeado | `diferencia = aplicado − planeado` (negativo = falta por aplicar) |
| F14 | Avance | `% = aplicado / planeado × 100` |
| F15 | Aplicado en la forma de la meta | `kg/ha = aplicado_kg × 10.000 / área_m² × % etiqueta / 100` |

### Cómo redondea y muestra la app

- **Datos que escribiste** (área, meta, %, precio): se muestran completos, sin "≈".
- **Resultados calculados**: la app calcula con el valor completo y **solo redondea para mostrar**. Si lo mostrado está redondeado, antepone **"≈"**.
  - Suelo: hectáreas con 4 decimales, masa de suelo con 0, kg/ha y kg del lote con 3.
  - Plan y aplicaciones: kg, kg/ha y bultos con 2 decimales; COP con 0; avance (%) con 1.
- Formato colombiano: punto de miles y coma decimal (`2.200.000`, `19,25`).

**Regla para el cálculo manual:** usa todos los decimales de la calculadora en los pasos intermedios y **redondea solo al final**, con los mismos decimales que la app. Si redondeas antes, puedes obtener otra cifra (ver A12) y eso **no** es un error de la app.

**Criterio de coincidencia:** coincide si el valor manual, redondeado a los mismos decimales, es **igual** al que muestra la app (sin contar el "≈"). Cualquier otra diferencia se registra (sección 7).

---

## 5. Casos resueltos a mano (EJEMPLO)

### Caso A — Papa · **EJEMPLO**

**Datos de EJEMPLO**
- Lote "Papa EJEMPLO", **2500 m²**.
- Análisis EJEMPLO: profundidad **20 cm**, densidad **1,1 g/cm³**; Fósforo **P 35 mg/kg**; Potasio **K 180 mg/kg**; Potasio **K⁺ 0,45 cmol(+)/kg**.
- Productos EJEMPLO (bulto de 50 kg, precio del 2026-11-01):
  - DAP EJEMPLO: N 18 %, P₂O₅ 46 % — 145.000 COP.
  - KCl EJEMPLO: K₂O 60 % — 130.000 COP.
  - Urea EJEMPLO: N 46 % — 125.000 COP.
- Metas EJEMPLO (fuente "Fuente técnica EJEMPLO", **no reales**): P₂O₅ 120 kg/ha (DAP), K₂O 150 kg/ha (KCl), N 100 kg/ha (Urea).

**Suelo**

| # | Operación desarrollada | Resultado exacto | La app muestra |
|---|---|---|---|
| A1 | 2.500 ÷ 10.000 | 0,25 ha | `2.500 m² ÷ 10.000 = 0,25 ha` |
| A2 | 10.000 × (20 ÷ 100) × (1,1 × 1.000) = 10.000 × 0,2 × 1.100 | 2.200.000 | `… = 2.200.000 kg de suelo/ha` |
| A3 | 35 × 2.200.000 ÷ 1.000.000 | 77 | `35 mg/kg × 2.200.000 kg/ha ÷ 1.000.000 = 77 kg de P por ha` |
| A4 | 77 × 0,25 (= 77 × 2.500 ÷ 10.000) | 19,25 | `77 kg/ha × 0,25 ha = 19,25 kg de P en el lote` |
| A5 | 180 × 2.200.000 ÷ 1.000.000 | 396 | `396 kg de K por ha` |
| A6 | 396 × 0,25 | 99 | `99 kg de K en el lote` |
| A7 | K⁺ en cmol(+)/kg | no se convierte | Aparece en "Valores en cmol(+)/kg", sin kg/ha |

Ojo: 77 kg/ha es de **P**, no de P₂O₅, y **no es una dosis**.

**Plan** (área del plan 2.500 m²)

| # | Operación desarrollada | Resultado exacto | La app muestra |
|---|---|---|---|
| A8 | DAP: 120 ÷ (46 ÷ 100) = 120 ÷ 0,46 | 260,869565… | `120 kg/ha de P₂O₅ ÷ (46 % ÷ 100) = ≈ 260,87 kg/ha de DAP EJEMPLO` |
| A9 | 260,869565… × 2.500 ÷ 10.000 | 65,2173913… | `≈ 65,22 kg de DAP EJEMPLO en el lote` |
| A10 | 65,2173913… ÷ 50 | 1,304347… | `≈ 1,3 bultos` |
| A11 | 145.000 ÷ 50 | 2.900 | `145.000 COP ÷ 50 kg = 2.900 COP por kg` |
| A12 | 65,2173913… × 2.900 | 189.130,43… | `≈ 65,22 kg × 2.900 COP/kg = ≈ 189.130 COP` |
| A13 | N acompañante: 260,869565… × 18 ÷ 100 | 46,956521… | `≈ 46,96 kg/ha de N (aporte acompañante)` |
| A14 | KCl: 150 ÷ 0,60 | 250 | `250 kg/ha de KCl EJEMPLO` |
| A15 | 250 × 2.500 ÷ 10.000 | 62,5 | `62,5 kg … en el lote` |
| A16 | 62,5 ÷ 50 | 1,25 | `1,25 bultos` |
| A17 | 130.000 ÷ 50 = 2.600; 62,5 × 2.600 | 162.500 | `2.600 COP por kg` · `162.500 COP` |
| A18 | Urea: 100 ÷ 0,46 | 217,391304… | `≈ 217,39 kg/ha` |
| A19 | 217,391304… × 0,25 = 54,347826…; ÷ 50 | 54,347826… · 1,086956… | `≈ 54,35 kg` · `≈ 1,09 bultos` |
| A20 | 54,347826… × 2.500 | 135.869,56… | `≈ 135.870 COP` |

> **A12, trampa del redondeo:** si se usa 65,22 (ya redondeado) × 2.900 = **189.138**. La app da **189.130** porque usa 65,2173913…. La app está bien; el cálculo manual debe usar todos los decimales.

**Resumen por forma química y costo total**

| # | Operación | Resultado exacto | La app muestra |
|---|---|---|---|
| A21 | P₂O₅: aportado 120 − meta 120; K₂O: 150 − 150 | 0 y 0 | `0` |
| A22 | N: 46,956521… (DAP) + 100 (Urea) = 146,956521…; − 100 | 146,956… · +46,956… | Aportado `≈ 146,96`; diferencia con signo + y `46,96` (hoy se ve `+≈ 46,96`) |
| A23 | 189.130,43… + 162.500 + 135.869,56… | 487.500 | `Suma del costo de cada producto = 487.500 COP` |

La diferencia del N es solo aritmética: la app no dice si sobra o falta agronómicamente.

**Aplicaciones EJEMPLO** (plan aprobado): DAP 30 kg (costo 87.000 COP) y DAP 20 kg (sin costo); KCl 62,5 kg; Urea sin aplicaciones.

| # | Operación desarrollada | Resultado exacto | La app muestra |
|---|---|---|---|
| A24 | DAP aplicado: 30 + 20 | 50 | `Aplicado: 30 + 20 = 50 kg (2 aplicaciones)` |
| A24b | 50 − 65,2173913… | −15,2173… | `≈ -15,22 kg (falta por aplicar)` |
| A24c | 50 ÷ 65,2173913… × 100 | 76,666… | `≈ 76,7 %` |
| A25 | 50 × 10.000 ÷ 2.500 × 46 ÷ 100 = 200 × 0,46 | 92 | `= 92 kg/ha de P₂O₅ (meta: 120 kg/ha)` |
| A26 | KCl: 62,5 − 62,5; 62,5 ÷ 62,5 × 100; 62,5 × 10.000 ÷ 2.500 × 0,60 | 0 · 100 · 150 | `0 kg (igual a lo planeado)` · `100 %` · `150 kg/ha de K₂O` |
| A27 | Costo registrado del DAP: solo se suman los costos escritos | 87.000 | `87.000 COP (1 aplicación sin costo registrado)` |

### Caso B — Arveja · **EJEMPLO**

**Datos de EJEMPLO**
- Lote "Arveja EJEMPLO", **800 m²**.
- Análisis EJEMPLO: profundidad **15 cm**, densidad **1,3 g/cm³**; Fósforo **P 12,5 mg/kg**; Calcio **Ca²⁺ 2,1 cmol(+)/kg**.
- Producto EJEMPLO: "Compuesto 10-30-10 EJEMPLO": N 10 %, P₂O₅ 30 %, K₂O 10 %; bulto de 50 kg a 152.000 COP.
- Meta EJEMPLO (no real): P₂O₅ 60 kg/ha. No hay metas de N ni de K₂O.
- Aplicación EJEMPLO: 16 kg.

| # | Operación desarrollada | Resultado exacto | La app muestra |
|---|---|---|---|
| B1 | 800 ÷ 10.000 | 0,08 | `0,08 ha` |
| B2 | 10.000 × 0,15 × 1.300 | 1.950.000 | `1.950.000 kg de suelo/ha` |
| B3 | 12,5 × 1.950.000 ÷ 1.000.000 | 24,375 | `24,375 kg de P por ha` |
| B4 | 24,375 × 0,08 | 1,95 | `1,95 kg de P en el lote` |
| B4b | Ca²⁺ en cmol(+)/kg | no se convierte | En "Valores en cmol(+)/kg" |
| B5 | 60 ÷ (30 ÷ 100) | 200 | `200 kg/ha` |
| B6 | 200 × 800 ÷ 10.000 | 16 | `16 kg … en el lote` |
| B7 | 16 ÷ 50 | 0,32 | `0,32 bultos` |
| B8 | 152.000 ÷ 50 | 3.040 | `3.040 COP por kg` |
| B9 | 16 × 3.040 | 48.640 | `48.640 COP` (también es el costo total) |
| B10 | N y K₂O acompañantes: 200 × 10 ÷ 100 | 20 y 20 | `20 kg/ha de N` · `20 kg/ha de K₂O`; en el resumen, meta `—` y diferencia `—` |
| B12 | 16 − 16; 16 ÷ 16 × 100 | 0 · 100 | `0 kg (igual a lo planeado)` · `100 %` |
| B13 | 16 × 10.000 ÷ 800 × 30 ÷ 100 | 60 | `60 kg/ha de P₂O₅ (meta: 60 kg/ha)` |

---

## 6. Casos límite: la app debe rechazar o no calcular

| # | Qué probar | Resultado esperado |
|---|---|---|
| L1 | Meta en **P** (p. ej. 52 kg/ha) con DAP, cuya etiqueta declara **P₂O₅**. Igual con meta en **K** y etiqueta en **K₂O**. | El formulario avisa "Esta meta no se calculará"; el detalle dice **"Formas químicas distintas"** y no muestra cantidad, bultos ni costo. **Nunca convierte.** |
| L2 | Análisis **sin densidad aparente**. | Se guarda; muestra **"Falta un dato para calcular"** y no muestra kg/ha. |
| L3 | Nutriente en **cmol(+)/kg**. | Se guarda tal cual y **no** se convierte a kg/ha. |
| L4 | Área `1.500`, meta `1.200`, kg aplicados `1.500`, precio `150.000`. | Rechazo: "se puede leer de dos formas. Escribe 1500…". |
| L5 | **Fecha futura** en el análisis, la fuente de la meta, el precio o una aplicación. | Rechazo: "no puede ser una fecha futura". |
| L6 | Meta **sin fuente** o **sin fecha** de la fuente. | Rechazo en el formulario; sin fuente no se calcula nada. |
| L7 | Valor de laboratorio escrito `1.500` mg/kg (p. ej. Hierro). | **Observar y anotar.** Hoy el formulario del análisis lo acepta y lo guarda como **1,5** (lee el punto como decimal), a diferencia de los otros campos, que rechazan `1.500`. Verificar en el detalle del análisis qué valor quedó y anotar el resultado en el registro de discrepancias para que el equipo decida. Mientras tanto: **escribe los valores del laboratorio sin punto de miles** (`1500`). |

---

## 7. Registro de discrepancias

Si el valor manual y el de la app **no coinciden**:

1. **Anota** en la hoja: caso, operación, valor manual, valor de la app, diferencia, responsable, fecha y una captura de pantalla.
2. **Revisa el cálculo manual** primero: ¿se redondeó antes de tiempo? ¿se usó la misma forma química (P vs P₂O₅)? ¿el área es la **guardada con el plan o con el análisis** (no la actual del lote)? ¿se escribió `1.500` en vez de `1500`?
3. **Reproduce**: otra persona repite el cálculo manual y vuelve a cargar el dato en la app (en otro navegador o tras recargar).
4. Si persiste, el programador **escribe una prueba automática que reproduzca el error** (en `tests/`) antes de tocar el código.
5. **No se corrige nada sin confirmar** con el equipo que es un error de la app (y no del dato o del cálculo manual). Se corrige solo ese error, se ejecutan `npm run test` y `npm run build`, y se hace un commit por corrección.
6. Se vuelve a comparar y se marca la fila como resuelta en la columna `observacion`.

Diferencias que **no** son error de la app: el "≈" (solo indica redondeo al mostrar), el redondeo de pasos intermedios en el cálculo manual, y que la app no convierta P↔P₂O₅ o K↔K₂O.

---

## 8. Pruebas en un teléfono Android real

Usar Chrome en un Android de gama media:

- [ ] Abrir la app publicada y **Instalar aplicación** (menú de Chrome). Se abre desde el ícono.
- [ ] Teclado numérico: escribir decimales con **coma** (`1,1`) y con punto (`1.1`); comprobar la vista previa del área.
- [ ] Escribir `1.500` en el área: debe rechazarse.
- [ ] Selectores nativos: fecha (calendario), elemento, forma química y unidad.
- [ ] Una fecha futura en el calendario: debe rechazarse.
- [ ] Legibilidad a 360 px: tablas del plan y del resumen se desplazan sin cortar texto; botones fáciles de tocar.
- [ ] Girar la pantalla (vertical/horizontal) sin perder lo escrito.
- [ ] Cerrar y volver a abrir la app: los datos siguen ahí.
- [ ] **Modo avión:** la app abre y muestra los lotes (después de una primera visita con conexión).
- [ ] **Copia de seguridad:** descargar el JSON y restaurarlo (aparece "No hay nada nuevo que agregar").
- [ ] **Informe para el productor → Imprimir o guardar como PDF**: el PDF solo contiene el informe.
- [ ] Repetir en el teléfono al menos los casos A8–A12 y comparar con lo que muestra el computador.

Anotar modelo de teléfono, versión de Android y de Chrome en la hoja.

---

## 9. Cierre de la fase

- [ ] Casos A y B (EJEMPLO) comparados en la app: todas las filas coinciden.
- [ ] Caso real de papa y caso real del segundo cultivo comparados.
- [ ] Casos límite L1–L7 probados.
- [ ] Pruebas en Android hechas.
- [ ] Discrepancias registradas, confirmadas y corregidas (o explicadas).
- [ ] `npm run test` y `npm run build` sin errores.
- [ ] Copia de seguridad final descargada; capturas para la presentación (los datos de EJEMPLO deben verse marcados como EJEMPLO).
