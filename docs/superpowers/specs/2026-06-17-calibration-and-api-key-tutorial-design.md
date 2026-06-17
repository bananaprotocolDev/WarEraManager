# API key tutorial + Calibración — Documento de diseño

- **Fecha:** 2026-06-17
- **Estado:** Aprobado para planificación
- **Contexto:** WarEra Company Manager (Planes 1–5 + 3 ya en `master`)

## 1. Resumen

Dos mejoras:
1. **Tutorial de API key** en el onboarding: explicar al usuario cómo obtener su API token de WarEra.
2. **Calibración**: derivar empíricamente un factor de corrección de la conversión "stat de
   producción → output real" a partir de las **ventas reales** del usuario (transacciones),
   persistirlo, y aplicarlo para que las cifras dejen de ser "estimadas".

## 2. Hallazgos previos

- El campo `production` de una empresa ya está, aparentemente, **en unidades/día**: para
  steel de BebetoSan, `production 191 × precio 1.59 ≈ 303.7` = los ingresos mostrados; los
  materiales (`10 iron/unidad × 191 × precio iron`) ≈ 152, también coincide. El factor actual
  `productionToUnitsPerDay = 1` parece correcto — la calibración lo **valida** y corrige si hay desvío.
- Lo calculado es **beneficio potencial al precio de mercado actual**; lo realizado depende de a
  qué precio y cantidad se vendió. La calibración mide el output real (cantidad), no el precio.
- `transaction.getPaginatedTransactions` (auth-gated, header `X-API-Key`) acepta filtros
  `userId`, `itemCode`, `transactionType`, `countryId`, `limit`, `cursor`. Cada transacción trae
  `sellerId`, `money`, `quantity` (entre otros). Las **ventas** del usuario son las transacciones
  donde `sellerId == userId`. Se filtra por `itemCode` y se identifican las ventas por `sellerId`
  (no se depende del string exacto de `transactionType`, que no está documentado salvo "wage").

## 3. Parte A — Tutorial de API key

- Sección desplegable en `/onboarding`: **"¿Cómo consigo mi API token?"** (cerrada por defecto).
- Pasos numerados: 1) Iniciá sesión en app.warera.io. 2) Abrí **Settings** (Configuración).
  3) Entrá a **API Tokens**. 4) Creá un token y copialo. 5) Pegalo en el campo "API token" de acá.
- Notas: el token es **read-only**; se guarda **solo en esta pestaña** (`sessionStorage`); sin token
  no se ven salarios ni se puede calibrar.
- Estilo del design system (oscuro, lucide icons, focus visible). Los textos exactos de los menús
  de Warera se afinan al implementar (verificar nomenclatura real).

## 4. Parte B — Calibración

### 4.1 Flujo de datos

1. Página `/calibrate` (client). Lee `userId` y `token` de `sessionStorage`. Si falta token,
   muestra aviso + link al tutorial.
2. Al accionar "Calibrar", llama `GET /api/calibrate?userId=<id>&days=<n>` con header `X-API-Key`.
3. El endpoint (server), con `WareraClient` autenticado:
   - Obtiene las empresas del usuario y su `production` (y `itemCode`) — reusa `getUserCompanies` + `getCompanyById`.
   - Por cada `itemCode`, trae transacciones paginadas filtradas por `userId` + `itemCode` sobre la
     ventana (`days`, default 7), y suma `quantity` de las que tienen `sellerId == userId` (ventas).
   - `realizedUnitsPerDay(item) = Σ quantity_ventas / días`.
   - Agrega por empresa: compara `production` (teórico/día) vs `realizedUnitsPerDay`.
4. **Factor global** = `Σ realizedUnitsPerDay / Σ production` sobre las empresas con `production > 0`
   y con al menos una venta en la ventana. (Promedio ponderado por producción.)
5. **Confianza**: cantidad de empresas con ventas y total de transacciones de venta consideradas.
   Si no hay ventas suficientes (p.ej. 0 empresas con ventas), NO se persiste factor → respuesta
   "datos insuficientes".

### 4.2 Persistencia

- Tabla `calibration` en SQLite (misma DB del histórico). Fila única (id fijo) con:
  `factor REAL, samples INTEGER, updatedAt INTEGER`.
- Interfaz `CalibrationStore` con `get(): Calibration | null` y `set(c: Calibration)`. Implementación
  SQLite junto al `PriceHistoryStore` (mismo archivo `data/`).

### 4.3 Aplicación en el motor

- Nuevo loader `getGameConstants()` (server): si hay calibración persistida, devuelve
  `{ productionToUnitsPerDay: factor, calibrated: true }`; si no, `GAME_CONSTANTS` por defecto
  (`{ 1, calibrated:false }`).
- `buildPortfolio` y `buildCompanyDetail` pasan esas constantes a `companyProfit`/`hiringAnalysis`
  (ya aceptan `constants`). Cuando `calibrated:true`, los `ProfitBreakdown.estimated`/
  `HiringResult.estimated` pasan a `false` → la UI deja de mostrar "estimado".

### 4.4 UI de `/calibrate`

- Botón "Calibrar con mis ventas" (deshabilitado sin token).
- Tras correr: tabla **teórico vs realizado** por empresa (producción/día vs vendido/día), el
  **factor** derivado, la **confianza**, y estado "Aplicado ✓" o "Datos insuficientes".
- Estado de la calibración vigente (factor + fecha) si ya existe.
- Link "Calibrar" en la nav (`app-shell`).

## 5. Componentes / archivos (orientativo)

- `src/lib/db/calibration-store.ts` — interfaz + impl SQLite.
- `src/server/calibrate.ts` — servicio `runCalibration(client, store, {userId, days})`.
- `src/lib/economy/get-constants.ts` — `getGameConstants(store)` loader.
- `src/app/api/calibrate/route.ts` — endpoint (POST/GET con `X-API-Key`).
- `src/server/portfolio.ts`, `src/server/company-detail.ts` — usar `getGameConstants`.
- `src/lib/client/use-calibrate.ts` — hook/acción cliente.
- `src/app/calibrate/page.tsx` + componentes — UI.
- `src/app/onboarding/page.tsx` — sección tutorial.
- `src/components/app-shell.tsx` — link "Calibrar".

## 6. Criterios de éxito

- Onboarding muestra un tutorial claro de cómo obtener la API key.
- Con token, `/calibrate` trae las ventas reales, calcula el factor, lo guarda y muestra
  teórico vs realizado + confianza.
- Tras calibrar, el dashboard y el detalle dejan de marcar "estimado" y usan el factor.
- Sin ventas suficientes, no se fuerza un factor y se informa con claridad.
- El token nunca se persiste en el servidor (solo se usa por-petición); la calibración guardada es
  un número global (factor), no datos personales.
- Tests del store, del servicio (con cliente fake) y de los endpoints; lógica pura testeada.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| String exacto de `transactionType` de venta desconocido | Filtrar por `itemCode` y reconocer ventas por `sellerId == userId`; no depender del tipo. |
| Pocas ventas → factor ruidoso | Umbral mínimo de muestra; si no se cumple, no persistir y avisar. |
| Ventas en lote / almacenamiento sesga unidades/día | Ventana de varios días; promedio ponderado; mostrar confianza para que el usuario juzgue. |
| El token podría filtrarse | Se envía por-petición como `X-API-Key`, nunca se loguea ni persiste (mismo patrón que el resto). |
| Paginación de transacciones | Recorrer cursores hasta cubrir la ventana o un máximo de páginas. |

## 8. Fuera de alcance

- Calibración por-item o por-skill (se usa un factor global; per-item puede venir luego).
- Deploy / cron de recalibración automática (la calibración es on-demand).
