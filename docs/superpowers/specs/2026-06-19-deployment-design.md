# Despliegue (Postgres + Vercel) — Documento de diseño

- **Fecha:** 2026-06-19
- **Estado:** Aprobado para planificación
- **Contexto:** WarEra Company Manager (toda la hoja de ruta 1–7C en `master`)

## 1. Resumen

Publicar la app en **Vercel**, migrando la persistencia de **SQLite a Postgres** (Neon) para que el
histórico de precios y la calibración funcionen en serverless. Incluye refactor de los stores a
interfaces **asíncronas**, configuración de **Vercel Cron** para los snapshots de precios, conexión
a **GitHub**, y un runbook de pasos manuales (cuentas/secretos).

## 2. Motivación / problema

- `better-sqlite3` es un módulo **nativo** y escribe a disco; el filesystem de Vercel es efímero y
  read-only en runtime → SQLite no sirve en producción.
- El histórico de precios (cron que escribe) y la calibración (factor persistido) requieren una base
  durable y compartida entre invocaciones serverless → **Postgres**.

## 3. Decisiones

- **Postgres-only** (se elimina SQLite y `better-sqlite3`). Una sola implementación por store; mismo
  `DATABASE_URL` en local y en producción (Neon, o Postgres local).
- **Driver:** `@neondatabase/serverless` (HTTP, apto serverless, sin agotar conexiones).
- **Interfaces async:** `PriceHistoryStore` y `CalibrationStore` pasan a devolver `Promise`.
- **Plataforma:** Vercel (nativo Next.js) + GitHub (deploy on push).
- **Proveedor DB:** Neon (free tier). Supabase/Vercel-Postgres son equivalentes (mismo `DATABASE_URL`).

## 4. Migración de stores a Postgres (async)

### 4.1 Interfaces (async)

```ts
interface PriceHistoryStore {
  recordSnapshot(prices: Record<string, number>, ts?: number): Promise<void>;
  getHistory(item: string, since: number): Promise<PricePoint[]>;
  listItems(): Promise<string[]>;
}
interface CalibrationStore {
  get(): Promise<Calibration | null>;
  set(c: Calibration): Promise<void>;
}
```

### 4.2 Implementación Postgres

- `PostgresPriceHistoryStore` / `PostgresCalibrationStore` reciben un **ejecutor de queries
  inyectable** (`type Sql = <T>(strings, ...params) => Promise<T[]>`, compatible con el tagged-template
  de `neon()`), para poder testear sin DB real (los tests pasan un fake).
- Tablas creadas con `CREATE TABLE IF NOT EXISTS` de forma idempotente (lazy, una vez por instancia):
  - `price_snapshots(item text, price double precision, ts bigint)` + índice `(item, ts)`.
  - `calibration(id int primary key default 1, factor double precision, samples int, updated_at bigint)`
    con upsert (`ON CONFLICT (id) DO UPDATE`).
- Consultas parametrizadas (sin interpolación de strings).
- Factories `getPriceStore()` / `getCalibrationStore()`: crean el store con `neon(process.env.DATABASE_URL)`.
  Como las interfaces son async, las factories pueden devolver el store directamente (sync) y los
  métodos son async; o devolver `Promise<Store>` si hace falta init async (preferir métodos async,
  factory sync que lazy-inicializa el schema en el primer método).

### 4.3 Consumidores a actualizar (await)

`collectPrices`, `/api/cron/collect-prices`, `/api/prices/history`, `calibrate.ts`,
`calibration-factor.ts` (`getRateFactor` → async), `price-trend-for.ts` (`priceTrendFor` → async),
`buildPortfolio`/`buildCompanyDetail` (await `priceTrendFor` y el factor que llega por opción desde la
ruta — las rutas hacen `await getRateFactor()`), `scripts/collect.ts`. Tests de stores/servicios pasan
a `async` y `await`.

### 4.4 Limpieza

Quitar `better-sqlite3` + `@types/better-sqlite3` de dependencias y los archivos SQLite
(`*-store.ts` SQLite). Quitar `/data/` del `.gitignore` (ya no se usa) o dejarlo inofensivo.

## 5. Vercel

- `vercel.json`:
  ```json
  { "crons": [{ "path": "/api/cron/collect-prices", "schedule": "*/30 * * * *" }] }
  ```
- Vercel Cron agrega `Authorization: Bearer <CRON_SECRET>` automáticamente cuando la env
  `CRON_SECRET` está definida; el endpoint ya valida ese header (timing-safe). Sin cambios de código.
- **Env vars (Vercel):** `DATABASE_URL` (Neon), `CRON_SECRET` (secreto generado).
- `.env.example` documentando ambas; `.env*` ya está en `.gitignore`.

## 6. GitHub

- Crear repo (privado o público) y pushear `master`. Vercel se conecta a ese repo; push a `master` →
  deploy. (Hoy no hay remoto.)
- README con: stack, cómo correr local (`.env.local` con `DATABASE_URL`, `npm run dev`), cómo deployar.

## 7. Runbook (pasos manuales del usuario)

1. **Neon:** crear proyecto/DB → copiar el `DATABASE_URL` (connection string pooled).
2. **GitHub:** crear repo vacío (o vía `gh` si está autenticado) → conectar el remoto y `git push -u origin master`.
3. **Vercel:** New Project → importar el repo de GitHub → setear env `DATABASE_URL` y `CRON_SECRET` →
   Deploy.
4. Verificar: la URL pública carga; `/onboarding` funciona; el cron aparece en Vercel; tras la primera
   corrida del cron, `/market` muestra tendencias.

(No hay paso manual de schema: las tablas se crean solas al primer uso.)

## 8. Seguridad

- El **API token del usuario nunca se persiste** en el server (va por-petición como `X-API-Key`).
- App pública: cualquiera ve datos públicos con un user_id; salarios/calibración requieren que cada
  usuario ponga su propio token. El proxy es read-only con allow-list + rate-limit.
- `CRON_SECRET` protege el endpoint de recolección. `DATABASE_URL` solo en env del server.
- Postgres: queries parametrizadas (sin inyección). La DB guarda solo datos públicos/globales
  (precios, factor de calibración), no datos personales.

## 9. Testing

- Tests de stores: inyectar un `Sql` fake (registra queries / devuelve filas simuladas) — sin DB real.
- Tests de servicios/rutas: como hoy, con clientes/servicios fake; los que tocan stores pasan a async.
- `npm test`, `./node_modules/.bin/tsc --noEmit`, `npm run build` verdes antes de deployar.
- Verificación post-deploy: manual en la URL de Vercel + (opcional) Playwright.

## 10. Criterios de éxito

- La app corre en Vercel desde un push a GitHub.
- Histórico de precios y calibración persisten en Postgres (Neon) y funcionan en producción.
- El cron de Vercel toma snapshots cada 30 min (protegido por `CRON_SECRET`).
- `better-sqlite3` eliminado; un solo store por dominio (Postgres), interfaces async.
- Tests + tsc + build verdes; sin secretos en el repo.

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Bundling de módulo nativo en Vercel | Se elimina `better-sqlite3`; Postgres-only sin binarios nativos. |
| Agotar conexiones en serverless | `@neondatabase/serverless` (HTTP) en vez de pool TCP. |
| Refactor async rompe consumidores | TDD; actualizar callers y tests junto al cambio; tsc como red. |
| Cron sin proteger | `CRON_SECRET` exigido (Vercel lo manda); endpoint timing-safe. |
| `DATABASE_URL` requerido en local | `.env.example` + README; se puede usar el mismo Neon o Postgres local. |
| Pasos manuales (cuentas) | Runbook detallado; ofrecer `gh` para el repo si está autenticado. |

## 12. Fuera de alcance

- Multi-tenant / cuentas de usuario propias (la app sigue siendo por user_id + token por-petición).
- Dominio propio / analytics / CI más allá del deploy de Vercel.
