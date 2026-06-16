# WarEra Company Manager — Documento de diseño

- **Fecha:** 2026-06-16
- **Estado:** Aprobado para planificación
- **Autor:** brainstorming con el usuario

## 1. Resumen

Web app para gestionar y optimizar las **empresas** de un jugador en [WarEra.io](https://warera.io).
Desglosa el rendimiento económico de cada empresa (beneficio neto por día), recomienda si
conviene **contratar/despedir trabajadores**, sugiere **qué conviene producir** según los precios
de mercado actuales, y muestra **precios + tendencias** del mercado.

Objetivos de calidad declarados por el usuario: **Útil, Segura y Escalable.**

Estrategia de despliegue: **empezar como herramienta personal, diseñada desde el día 1 para
escalar a producto público multiusuario** sin rediseño.

## 2. Hallazgos de investigación (API de WarEra)

> Validado en vivo el 2026-06-16 contra `api2.warera.io`.

- **Base URL:** `https://api2.warera.io/trpc/`
- **Protocolo:** tRPC, todas las llamadas por **GET**. Forma: `/<proc>?input=<json-url-encoded>`.
  Respuesta: `{ "result": { "data": ... } }`.
- **Rate limit:** ~200 req/min.
- **CORS (decisivo):** la API responde con `Access-Control-Allow-Origin: https://app.warera.io`.
  Una web en otro dominio **no puede** llamar la API directamente desde el navegador →
  se requiere un **proxy** del lado del servidor. (El preflight OPTIONS devuelve `*`, pero la
  respuesta GET fija el ACAO a `app.warera.io`, así que el navegador bloquea la lectura.)
- **Autenticación:** la mayoría de los endpoints son **públicos read-only y no requieren auth**.
  Solo unos pocos (rankings, referrals) requieren API key (se obtiene en *Warera → Settings →
  API Tokens*; es read-only, no la contraseña). **El MVP NO necesita ninguna credencial.**
- Header `Origin: https://app.warera.io` es requerido por algunos endpoints; el proxy lo añade.

### Endpoints usados (todos públicos, GET)

| Necesidad | Endpoint | Input |
|---|---|---|
| Resolver/leer usuario | `user.getUserLite` | `{ userId }` |
| Listar empresas de un usuario | `company.getCompanies` | `{ userId, perPage }` → `{ items, nextCursor }` |
| Detalle de empresa | `company.getById` | `{ companyId }` |
| Trabajadores + salarios | `worker.getWorkers` | `{ companyId }` o `{ userId }` |
| Oferta laboral de la empresa | `workOffer.getWorkOfferByCompanyId` | `{ companyId }` |
| Mercado laboral (candidatos) | `workOffer.getWorkOffersPaginated` | `{ regionId?, energy?, production?, limit }` |
| Recetas de producción | `gameConfig.getGameConfig` | — (items: `productionPoints`, `productionNeeds`, `type`) |
| Precios de mercado | `itemTrading.getPrices` | — (mapa `itemCode → precio`) |
| Órdenes de mercado | `order.getTopOrders` / equivalente | `{ item }` |
| País: impuestos + bonus | `country.getCountryById` | `{ countryId }` |
| ROI de mejoras | `upgrade.getUpgradeByTypeAndEntity` | `{ upgradeType, companyId }` |
| Ingresos reales (salarios) | `transaction.getPaginatedTransactions` | `{ userId, transactionType:"wage", limit }` |

### Modelo de datos relevante (confirmado en `pywarera`)

- **Company:** `production` (float), `workerCount` (int), `itemCode`,
  `activeUpgradeLevels` = `{ automatedEngine, breakRoom }`.
- **Item:** `type` ∈ `raw|product|case|equipment|weapon`, `productionPoints` (int),
  `productionNeeds` = `{ inputItemCode: qty }`.
- **Worker:** `wage`, `company`.
- **Country:** `taxes` = `{ income, market, selfWork }`, `strategicResources.bonuses.productionPercent`.
- **User:** `skills` (incluye `production`, `companies`, `entrepreneurship`), `leveling.level`.

### Referencias de la comunidad

- `pywarera` (Python wrapper): https://github.com/Marerjh/pywarera — fuente de nombres de endpoints y modelos.
- `warera-fetch` (CLI): https://github.com/majimawrks/warera-fetch
- `warera-explorer`: https://github.com/CrommVardek/warera-explorer
- Doc comunitaria de la API: https://warera.io/en/articles/i-got-tired-of-guessing-so-i-documented-warera-s-api-myself-1bbd17
- Gateway tipado: gateway.warerastats.io

## 3. Arquitectura

```
Navegador (React SPA)
  - Pantallas: Dashboard, Empresa, Optimizador, Mercado
  - Estado: user_id en localStorage (NO secretos)
  - React Query: caché + refetch
        │ fetch a /api/*  (mismo origen, sin CORS)
        ▼
Backend Next.js (serverless)
  A) Proxy read-only → reenvía a api2.warera.io con Origin correcto. Sin estado, sin secretos.
  B) Capa de cálculo económico (profit, hiring, optimizer)
  C) Caché compartida (precios, gameConfig) → ahorra rate-limit
  D) Recolector de precios (cron) → DB para tendencias
        │
   api2.warera.io (tRPC)        DB (histórico de precios)
```

**Principio:** el backend es un *dumb pipe* + calculadora. No persiste datos personales.
El único dato persistido es el **histórico de precios**, que es público y global.

### Módulos (límites claros)

- `lib/warera-client` — cliente tipado de la API (un método por endpoint, valida la respuesta con Zod).
- `lib/economy` — **motor económico puro** (funciones sin I/O): `companyProfit`, `hiringAnalysis`,
  `productionOptimizer`, `upgradeRoi`. Entrada: datos + constantes. Salida: números. 100% testeable.
- `lib/game-constants` — constantes del juego aisladas y versionadas (factores de conversión de
  `production`→unidades/día, efecto de skills/bonos). Calibrables y verificables.
- `lib/cache` — caché compartida (global ~5 min, por-usuario ~60 s).
- `app/api/*` — proxy con allow-list + endpoints de cálculo.
- `app/(ui)/*` — pantallas React.
- `jobs/price-collector` — cron de snapshots de precios.

## 4. Modelo económico

Beneficio neto por día de una empresa:

```
beneficio_día = ingresos − costo_inputs − costo_salarios − impuestos

ingresos       = producción_día × precio_mercado[itemCode]
costo_inputs   = Σ (productionNeeds[input] × producción_día × precio_mercado[input])
costo_salarios = Σ wage de cada worker (worker.getWorkers)
impuestos      = ingresos × country.taxes (market/income)
```

Análisis derivados:

- **¿Conviene contratar?** Análisis marginal con `workOffer.getWorkOffersPaginated`:
  `valor_marginal = producción_extra × precio − inputs_extra`. Si `valor_marginal > salario_pedido`,
  conviene. Salida: ranking de candidatos por ROI + "salario máximo a pagar".
- **Mejor qué producir.** Con recetas (`gameConfig`) + precios: **margen por punto de producción**
  de cada item factible. Ranking de oportunidades.
- **ROI de mejoras.** Con `upgrade.getUpgradeByTypeAndEntity`: días de repago de cada upgrade
  (automatedEngine, breakRoom) dada la producción actual.

**Calibración (riesgo conocido):** la conversión exacta de `production`→unidades/día y el efecto
de skills/bonos no están documentados oficialmente. Se aíslan en `lib/game-constants` y se
**calibran contra datos reales** del usuario (`transaction` de wages/ventas) antes de mostrar
cifras como definitivas. La UI marca valores no calibrados como "estimados".

## 5. Capa de datos y caché

- **Globales** (precios, `gameConfig`): caché compartida en backend, refresco ~5 min.
- **Por usuario** (empresas/trabajadores): caché corta por user_id (~60 s) + React Query en cliente.
- **Histórico de precios**: cron cada 15–30 min → snapshot en DB. SQLite local → Postgres
  serverless (Supabase/Neon) al escalar, sin tocar el código de cálculo.

## 6. Seguridad

- **Sin credenciales en el MVP**: solo user_id público. Nada personal que filtrar.
- Proxy con **allow-list de endpoints** (solo los read-only usados) + **rate-limit propio**.
- **Validación con Zod** en cada API route; sin `eval`, sin reenviar params crudos sin validar.
- Cabeceras de seguridad (CSP, etc.). Secrets (si luego se usan rankings) solo en env del server.
- **Futuro (fuera del MVP):** si un usuario quiere datos privados con su API token, se guarda
  **cifrado del lado del cliente** o se usa por-petición sin persistir en el servidor. Decisión
  documentada, no implementada en el MVP.

## 7. Stack

- **Next.js (App Router) + TypeScript** — SPA + backend en un repo.
- **React Query** (datos cliente), **Tailwind + shadcn/ui** (UI), **Recharts** (gráficos).
- **Zod** (validación), **Vitest** (tests del motor económico — crítico).
- **Deploy:** local (`npm run dev`) → Vercel free. DB: SQLite → Postgres serverless.

## 8. Pantallas (MVP)

1. **Onboarding:** pegar username o user_id (se resuelve el id). Guardado en localStorage.
2. **Dashboard:** tarjetas por empresa con beneficio/día, total agregado, alertas
   ("esta empresa da pérdida", "slot de trabajador vacío rentable").
3. **Detalle de empresa:** desglose ingresos/costos, trabajadores y su rentabilidad individual,
   recomendación contratar/despedir, ROI de upgrades.
4. **Optimizador:** ranking "mejor qué producir" según precios actuales.
5. **Mercado:** precios + gráfico de tendencia por item.

## 9. Alcance

**MVP:** pantallas 1–5, los 4 cálculos, caché global+usuario, recolector de precios,
calibración básica de constantes, tests del motor económico.

**Después:** API token para datos privados, alertas push, comparativa con otros jugadores,
multi-cuenta, PWA.

## 10. Criterios de éxito

- Dado un username, la app lista todas las empresas del usuario y muestra beneficio/día por empresa
  y total, con desglose ingresos/inputs/salarios/impuestos.
- Recomienda por empresa si conviene contratar, con "salario máximo a pagar".
- Muestra el ranking "mejor qué producir" según precios actuales.
- Muestra precios actuales y tendencia histórica por item.
- El motor económico (`lib/economy`) tiene tests unitarios que pasan.
- Ningún dato personal/credencial se persiste en el servidor en el MVP.

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Constantes del juego no documentadas | Aislar en `lib/game-constants`; calibrar con datos reales; marcar "estimado". |
| Rate limit (200/min) | Caché compartida global; batching; refresco espaciado. |
| Cambios en la API no oficial | Cliente tipado con Zod que falla ruidosamente; capa `warera-client` aislada. |
| CORS bloquea llamadas directas | Proxy server-side (decisión central de arquitectura). |
| Escalar a multiusuario | user_id como única clave; caché global ya compartida; DB migrable. |
