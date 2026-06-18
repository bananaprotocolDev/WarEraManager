# Modelo de producción corregido + Recomendador de contratación — Diseño

- **Fecha:** 2026-06-18
- **Estado:** Aprobado para planificación
- **Contexto:** WarEra Company Manager (Planes 1–6A en `master`)

## 1. Resumen

Dos cosas, relacionadas:
1. **Corregir el modelo de producción diaria.** Hoy el beneficio/día usa el campo `production` como
   si fuera la tasa diaria, pero ese campo es el **stock acumulado** (inventario), no la tasa. La
   tasa real = automatización + trabajadores, topeada por almacén y por cuánto se vende.
2. **Recomendador de contratación.** Decir, por empresa: ¿conviene contratar?, ¿cuánto pagar por
   punto de producción?, y ¿qué perfil de trabajador (minProducción / minEnergía / minNivel)?
   basándose en automatización, almacén, margen del producto, espacio de demanda (venta real) y el
   mercado laboral vigente.

## 2. Mecánicas del juego (verificadas en `gameConfig`, 2026-06-18)

- **`company.production` = STOCK acumulado** (inventario actual), NO la tasa diaria. Tope = almacén.
  Evidencia: steel stock 191 con storage L1 (tope 200); iron 189 (tope 200); oil 7.95 con storage L2
  (tope 400, recién recolectado).
- **`automatedEngine.dailyProd`** (unidades/día sin trabajadores), por nivel:
  L1=24, L2=48, L3=72, L4=96, L5=120, L6=144, L7=168.
- **`storage.maxProduction`** (tope de stock), por nivel: L1=200 … L7=1400 (≈200×nivel).
- **`breakRoom`**: `maxWorkers` (L1=2 … L5=10, =2×nivel) y `dailyHires` (contrataciones/día por nivel).
- **`worker`** config: `maxFidelity=10`, `fidelityProductionBonusPercent=1` → fidelidad da hasta +10%
  de producción (1%/nivel).
- **Energía/acciones** (`gameConfig.user`): `maxEnergy=100`, `energyCostPerAction=10`,
  `regenDividedBy=10`. Cada acción de trabajo cuesta 10 de energía.
- **Skill de producción** (`gameConfig.skills.production`): valor = 10 base, +3 por nivel
  (`{0:10,1:13,2:16,…,10:40}`). Es **unidades producidas por acción**.
- **Skill de energía**: valor = 30 base, +10 por nivel (`{0:30,…,10:130}`).
- **Ofertas laborales** (`workOffer.getWorkOffersPaginated`): cada oferta trae `company`, `region`,
  `quantity`, `wage` (por punto de producción, ej. 0.153), `wageAfterTax`, `minEnergy`, `minProduction`
  (`minLevel` puede no venir). `workOffer.getWorkOfferByCompanyId` devuelve la oferta propia (404 si no hay).

## 3. Parte A — Modelo de producción diaria corregido

### 3.1 Fórmula

```
tasaDiariaProd = automationDailyProd(automatedEngineLevel) + aporteTrabajadores
aporteTrabajadores = Σ_worker (unidadesPorDía(worker))     // ver modelo laboral §5
tasaUtil = min(tasaDiariaProd, ventaPorDía)                 // no sirve producir más de lo que vendés
ingresos = tasaUtil × precio[item]
costoInsumos = Σ_input (needs[input] × tasaUtil × precio[input])
costoSalarios = Σ_worker wage_por_punto × unidadesPorDía(worker)   // se paga por unidad producida
impuesto = ingresos × (taxes.market / 100)
beneficioDía = ingresos − costoInsumos − costoSalarios − impuesto
```

- `ventaPorDía` = unidades vendidas/día reales (de transacciones, igual que la calibración). Si no hay
  token/datos: `ventaPorDía = tasaDiariaProd` (se asume que vendés lo que producís) y la UI lo marca
  como supuesto.
- El **stock** (`production`) se muestra aparte como inventario actual vs `storage.maxProduction`
  (cuán lleno está el almacén), pero NO se usa como tasa.
- Si el almacén está lleno y `tasaDiariaProd > ventaPorDía`, hay **producción desperdiciada** → señal
  para el recomendador.

### 3.2 Cambios en el motor

- `companyProfit` deja de calcular `unitsPerDay = production × factor`. Recibe `automationLevel`,
  `storageLevel`, `workers` (con su aporte), y `ventaPorDía`, y aplica la fórmula de §3.1.
- La **calibración** (Plan 6A) deja de calibrar `production→unidades` (ya no aplica) y pasa a validar,
  si hace falta, el modelo laboral (§5) — o se simplifica. Ver §7 (impacto en lo existente).
- Se exponen helpers puros: `automationDailyProd(level)`, `storageMax(level)`, `maxWorkers(level)`
  leídos de `gameConfig.upgradesConfig`.

## 4. Parte B — Recomendador de contratación

Por empresa, calcula:

- **Espacio de demanda** = `min(ventaPorDía, storageThroughput) − automationDailyProd`.
  Si ≤ 0 → **no conviene contratar** (la automatización ya cubre lo que vendés / el almacén; contratar
  solo llenaría el almacén). Motivo explícito en la salida.
- **Salario máximo por punto** = `margenPorUnidad = (precio[item] − costoInsumosPorUnidad) × (1 − taxes.market/100)`.
  Pagar por debajo. Si el margen ≤ 0 → no conviene producir el item (ni con trabajadores).
- **Slots libres** = `maxWorkers(breakRoomLevel) − workerCountActual`.
- **Perfil recomendado** (`minProducción`, `minEnergía`, `minNivel`):
  - `minProducción`: lo suficientemente alto para llenar el espacio de demanda con los slots libres,
    sin pasarse (más producción = más unidades por trabajador). Se contrasta con el **mercado laboral
    vigente** (`workOffer.getWorkOffersPaginated` del item/región) para sugerir un valor con candidatos
    reales y a qué salario suelen pedir.
  - `minEnergía`: define cuántas acciones/día (throughput) — se sugiere según el espacio de demanda.
  - `minNivel`: nivel mínimo coherente con la producción pedida (el skill de producción requiere nivel).
- **Salario sugerido a ofrecer**: por debajo del margen y alineado al mercado (mediana de ofertas
  comparables), para conseguir candidatos sin regalar margen.
- **Ganancia esperada/día** por trabajador = `unidadesAportadas × (margenPorUnidad − salarioOfrecido)`,
  limitada por el espacio de demanda y los slots.

Salida: `{ viable, motivo, maxWagePerPoint, freeSlots, recommendedProfile, suggestedWage, expectedDailyGain, marketReference }`.

## 5. Parte C — Modelo laboral (aislado y calibrable)

- `workerUnitsPerDay(productionValue, energyValue, fidelity)` ≈
  `accionesPorDía(energyValue) × productionValue × (1 + fidelity/100)`.
- `accionesPorDía` se deriva de la regeneración de energía (`regenDividedBy`, `energyCostPerAction`).
  **Hay incertidumbre** en la interpretación exacta de la regen → se aísla en `LABOR_CONSTANTS`
  (calibrable, como `game-constants`) y se marca el dimensionamiento como estimado.
- **Importante:** `maxWagePerPoint` y el veredicto **¿conviene sí/no?** NO dependen de este throughput
  (se razonan por punto de producción / por unidad). El throughput solo escala "cuántos trabajadores"
  y "ganancia esperada en magnitud".

## 6. Datos / endpoints

- `gameConfig.getGameConfig` → `upgradesConfig` (automatedEngine/storage/breakRoom), `worker`,
  `skills.production`, `user` (energía). Ya es público.
- `company.getById` → upgrade levels (`activeUpgradeLevels`: automatedEngine, breakRoom, storage),
  `production` (stock), `workerCount`, `itemCode`.
- `workOffer.getWorkOffersPaginated` → mercado laboral (salarios y requisitos vigentes). Público.
- `transaction.getPaginatedTransactions` (token) → venta real/día por item (reusa lo de calibración).
- `itemTrading.getPrices` + recetas (`productionNeeds`) → margen por unidad.

## 7. Impacto en lo existente

- `companyProfit` / `hiringAnalysis` se reescriben (el `hiringAnalysis` actual —marginal por
  `production/workerCount`— queda obsoleto). Tests asociados se actualizan.
- `buildPortfolio` / `buildCompanyDetail` pasan a leer `gameConfig` (ya lo hacen para recetas) y los
  niveles de upgrades, y la venta/día (cuando hay token).
- **Calibración (Plan 6A):** el factor `production→unidades` deja de tener sentido (production = stock).
  Se ajusta: la calibración se reorienta a validar el modelo laboral, o se marca como deprecada y la
  UI deja de ofrecerla hasta el Plan 7. Decisión a tomar en el plan: lo más limpio es **reemplazar** el
  uso del factor por el modelo determinístico (automatización desde gameConfig) y dejar la página de
  calibración para validar el throughput laboral. (Se documenta en el plan; no se rompe nada existente
  sin reemplazo.)
- El flag `estimated` pasa a reflejar: automatización (determinística, exacta) vs throughput laboral y
  venta/día (estimados si no hay token).

## 8. UI

- **Detalle de empresa:**
  - Reemplazar/actualizar el desglose para usar la tasa diaria correcta y mostrar **stock vs tope de
    almacén** (barra de llenado).
  - Panel **"Contratación"**: veredicto (conviene/no + motivo), salario máx por punto, slots libres,
    perfil sugerido (minProd/minEnergía/minNivel), salario sugerido, ganancia esperada/día, y
    referencia del mercado laboral.
- (Opcional, Plan 7B) vista de las ofertas laborales vigentes del item.

## 9. Criterios de éxito

- El beneficio/día usa la **tasa diaria correcta** (automatización + trabajadores, topeada por
  almacén y venta), no el stock.
- El detalle muestra stock vs tope de almacén.
- El recomendador dice por empresa: conviene/no (con motivo), salario máx por punto, slots libres,
  perfil sugerido y salario sugerido, contrastado con el mercado laboral real.
- Helpers de gameConfig (automationDailyProd/storageMax/maxWorkers) y el modelo laboral son puros y
  testeados; el recomendador tiene tests con datos representativos.
- Sin token, todo degrada con avisos claros (venta/día y throughput como supuestos).

## 10. Decomposición en planes

- **Plan 7A — Modelo de producción corregido:** helpers de gameConfig, reescritura de `companyProfit`
  con tasa diaria + almacén + venta/día, wiring en reportes, ajuste de calibración, UI de stock/almacén
  y beneficio corregido. Entregable: beneficio/día correcto.
- **Plan 7B — Recomendador de contratación:** modelo laboral, `hiringRecommendation`, lectura del
  mercado laboral, endpoint/datos y panel "Contratación" en el detalle. Entregable: recomendación
  completa de a quién contratar y cuánto pagar.

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Interpretación exacta de la regen de energía (throughput) | Aislar en `LABOR_CONSTANTS` calibrable; veredicto y maxWage no dependen de ello. |
| `production` = stock no confirmado al 100% | Evidencia fuerte (valores ≈ topes de almacén) + confirmado por el usuario; validar con venta real. |
| `minLevel` no siempre presente en ofertas | Tratar como opcional; derivar nivel sugerido del skill de producción pedido. |
| Venta/día requiere token | Degradar con supuesto (vendés lo que producís) y avisar. |
| Reescritura del motor rompe tests | TDD; actualizar tests junto al cambio; mantener funciones puras. |
