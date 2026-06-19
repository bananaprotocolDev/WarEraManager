# Precisión de márgenes (real + modelo) — Diseño (Plan B)

- **Fecha:** 2026-06-19
- **Estado:** Aprobado para planificación
- **Contexto:** WarEra Company Manager (desplegado; Plan A ya en prod)

## 1. Resumen

Hacer que el beneficio/día por empresa sea **fiel**: usar la **producción real medida** (lo que el
usuario realmente vendió en los últimos días, de sus transacciones) como número principal —porque
**incluye automáticamente el aporte real de los trabajadores y su variabilidad diaria**— y un
**modelo** (automatización + trabajadores estimados + bonus de producción del país) como **respaldo**
cuando no hay token o datos. Se muestra "real" vs "potencial".

## 2. Motivación

- El output de los trabajadores **varía día a día**; un modelo teórico nunca es exacto.
- No existe endpoint de "producción"; la única fuente real es `transaction.getPaginatedTransactions`
  (ventas del usuario = `sellerId == userId`). Las ventas/día reflejan el throughput real (incluye
  trabajadores + bonus + variabilidad) — es lo que mueve los márgenes.

## 3. Enfoque: híbrido (real medido, modelo de respaldo)

### 3.1 Tasa diaria
- **Real (con token + ≥1 venta en la ventana):** `dailyProductionRate = realizedSalesPerDay(userId, itemCode, 7)`
  (promedio de unidades vendidas/día en **7 días**, ya implementado en Plan 7B). Captura trabajadores
  reales + bonus + variabilidad.
- **Modelo (sin token / sin ventas):** `modeledRate = (automationDailyProd + workerOutputModelado) ×
  (1 + countryProductionBonus)`.
  - `workerOutputModelado` = `companyWorkerOutput` (Plan 7C; requiere token para leer trabajadores —
    si no hay, 0).
  - `countryProductionBonus` = `country.strategicResources.bonuses.productionPercent / 100`.
- `companyProfit` no cambia: usa `dailyProductionRate` (real o modelo) como hoy.
- Flag: `estimated = true` cuando se usó el modelo (no hubo real).

### 3.2 Bonus de producción
- **País:** `productionPercent` del país (ya se trae el país para impuestos) → multiplicador del modelo.
- **Depósito regional** (bonus para raws según región): por-empresa/región (llamada extra). **Fuera de
  alcance** en este plan (el real medido ya lo refleja). Anotado como mejora futura.

### 3.3 Comparación real vs potencial
- Cuando hay real: exponer también el **potencial** (modelo) para comparar
  (`% de aprovechamiento = real / potencial`). La UI muestra ambos.
- Sin real: solo potencial/estimado (como hoy).

## 4. Datos / endpoints

- `transaction.getPaginatedTransactions` (token) → ventas reales/día por item (`realizedSalesPerDay`, ya existe).
- `country.getCountryById` → `strategicResources.bonuses.productionPercent` (extender `countrySchema`).
- `gameConfig.upgradesConfig` (automatización), `worker.getWorkers` + `getUserLite` (aporte de
  trabajadores, ya en 7C).

## 5. Cambios técnicos

### 5.1 Schemas
- `countrySchema`: añadir `productionBonus` derivado de `strategicResources.bonuses.productionPercent`
  (default 0). (Hoy solo parsea `taxes`.)

### 5.2 Lógica pura
- `modeledDailyRate({ automationDailyProd, workerDailyOutput, productionBonus })` =
  `(automationDailyProd + workerDailyOutput) * (1 + productionBonus)` — pura, testeable.

### 5.3 Reportes
- `assembleCompanyReport` recibe la **tasa ya resuelta** (`dailyProductionRate`) — los servicios
  deciden real vs modelo. Añadir a `CompanyReport`: `measured: boolean` (si la tasa es real) y
  `potentialRate` (la tasa del modelo, para comparar) — opcionales.
- `buildCompanyDetail` (token): calcula `realRate = realizedSalesPerDay(...)`; `modeled =
  modeledDailyRate(...)`; usa `realRate ?? modeled` como `dailyProductionRate`, `measured = realRate != null`,
  `potentialRate = modeled`.
- `buildPortfolio`: igual, midiendo el real **en paralelo** por empresa cuando hay token (Promise.all),
  con modelo de respaldo. Sin token: solo modelo.

### 5.4 UI
- Tarjeta y detalle: si `measured`, número principal = real con etiqueta "real (7d)" y una línea
  "potencial: X (Y% aprovechado)". Si no, "estimado" (como hoy).

## 6. Criterios de éxito

- Con token y ventas recientes, el beneficio/día se basa en **producción real** (refleja trabajadores
  y su variabilidad); sin token, en el **modelo** (automatización + trabajadores + bonus país).
- La UI distingue claramente **real** vs **potencial/estimado**.
- El bonus de producción del país se aplica al modelo.
- Lógica pura testeada (`modeledDailyRate`, schema del bonus); servicios con clientes fake; UI con
  tests. `npm test`/tsc/build verdes.
- Degrada con gracia (sin token/datos → modelo; sin país → bonus 0).

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Medir real por empresa en el dashboard es lento | `Promise.all` (paralelo) + `realizedSalesPerDay` ya capea páginas; solo con token. |
| Ventana 7d con poca actividad → real ruidoso | Si no hay ventas en la ventana → cae al modelo (no fuerza un real malo). |
| Bonus regional de depósito no modelado | El real medido lo refleja; el modelo lo omite (anotado como futuro). |
| Timeout serverless con muchas empresas | Paralelo; si crece, cachear el real (futuro). |

## 8. Fuera de alcance

- Bonus de depósito regional en el modelo (futuro).
- Medir producción vía snapshots de stock por empresa (el real por ventas alcanza).
