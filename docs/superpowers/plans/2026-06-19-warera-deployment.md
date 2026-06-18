# WarEra Company Manager — Plan: Despliegue (Postgres + Vercel)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar la persistencia de SQLite a Postgres (Neon) con interfaces asíncronas y dejar la app lista para desplegar en Vercel (cron de precios incluido), con un runbook para conectar Neon/GitHub/Vercel.

**Architecture:** Una sola implementación Postgres por store (`PostgresPriceHistoryStore`, `PostgresCalibrationStore`) detrás de las interfaces existentes, ahora **async**. El driver es `@neondatabase/serverless` (`neon(DATABASE_URL)` → ejecutor de tagged-template inyectable, lo que permite testear sin DB). Tablas creadas lazy con `CREATE TABLE IF NOT EXISTS`. Todos los consumidores pasan a `await`. `vercel.json` define el cron protegido por `CRON_SECRET` (Vercel manda el header `Authorization: Bearer`, que el endpoint ya valida). Se elimina `better-sqlite3`.

**Tech Stack:** Next.js 16, TypeScript, `@neondatabase/serverless`, Postgres (Neon), Vercel, Vitest.

Spec: `docs/superpowers/specs/2026-06-19-deployment-design.md`.

---

## Decisiones

- **Postgres-only** (sin SQLite, sin `better-sqlite3`). Mismo `DATABASE_URL` en local y prod.
- **Interfaces async**; consumidores `await`.
- **Ejecutor inyectable** (`SqlExec`) → stores testeables sin DB real.
- **Schema lazy** (idempotente). Datos guardados: solo públicos/globales.

## Estructura de archivos

- `src/lib/db/price-store.ts` (reescrito), `src/lib/db/price-store.test.ts` (reescrito) (Task 1)
- `src/lib/db/get-price-store.ts` (reescrito) (Task 1)
- `src/lib/db/calibration-store.ts` + test (reescrito), `src/lib/db/get-calibration-store.ts` (reescrito) (Task 2)
- consumidores async (Task 3): `src/server/collect-prices.ts`, `src/server/calibrate.ts`, `src/server/calibration-factor.ts`, `src/server/price-trend-for.ts`, `src/server/portfolio.ts`, `src/server/company-detail.ts`, `src/app/api/cron/collect-prices/route.ts`, `src/app/api/prices/history/route.ts`, `src/app/api/report/route.ts`, `src/app/api/company/[id]/route.ts`, `scripts/collect.ts` + sus tests
- `vercel.json`, `.env.example`, `README.md`, `.gitignore` (Task 4)

**Entorno:** typecheck `./node_modules/.bin/tsc --noEmit`. Tests `npm test`. Build `npm run build`. tsc queda en rojo entre Task 1 y Task 3 (esperado); debe cerrar verde en Task 3.

---

### Task 1: Price store en Postgres (async)

**Files:**
- Modify: `src/lib/db/price-store.ts`, `src/lib/db/price-store.test.ts`, `src/lib/db/get-price-store.ts`
- Modify: `package.json`

- [ ] **Step 1: Dependencias**

Run: `npm i @neondatabase/serverless && npm rm better-sqlite3 @types/better-sqlite3`
Expected: `@neondatabase/serverless` en dependencies; `better-sqlite3` y sus types fuera.

- [ ] **Step 2: Reescribir el test (fake `SqlExec`)**

Reemplazar TODO `src/lib/db/price-store.test.ts` por:
```ts
import { describe, it, expect } from "vitest";
import { PostgresPriceHistoryStore } from "./price-store";

/** Fake del ejecutor SQL: registra cada query (template unido por '?') y devuelve filas predefinidas. */
function fakeSql(resultFor: (q: string) => Record<string, unknown>[] = () => []) {
  const queries: string[] = [];
  const sql = async (strings: TemplateStringsArray) => {
    const q = strings.join("?");
    queries.push(q);
    return resultFor(q);
  };
  return { sql: sql as never, queries };
}

describe("PostgresPriceHistoryStore", () => {
  it("getHistory mapea filas a {ts, price} numéricos", async () => {
    const { sql } = fakeSql((q) => (q.includes("SELECT ts") ? [{ ts: "1000", price: "1.5" }] : []));
    const store = new PostgresPriceHistoryStore(sql);
    const h = await store.getHistory("steel", 0);
    expect(h).toEqual([{ ts: 1000, price: 1.5 }]);
  });

  it("recordSnapshot emite un INSERT", async () => {
    const { sql, queries } = fakeSql();
    const store = new PostgresPriceHistoryStore(sql);
    await store.recordSnapshot({ steel: 1.5, iron: 0.1 }, 2000);
    expect(queries.some((q) => /INSERT INTO price_snapshots/i.test(q))).toBe(true);
  });

  it("listItems devuelve los items distintos", async () => {
    const { sql } = fakeSql((q) => (q.includes("DISTINCT") ? [{ item: "steel" }, { item: "iron" }] : []));
    const store = new PostgresPriceHistoryStore(sql);
    expect((await store.listItems()).sort()).toEqual(["iron", "steel"]);
  });
});
```

- [ ] **Step 3: Correr (debe fallar)**

Run: `npx vitest run src/lib/db/price-store.test.ts` → FAIL (no existe `PostgresPriceHistoryStore`).

- [ ] **Step 4: Reescribir `src/lib/db/price-store.ts`**

```ts
/** Ejecutor de queries estilo tagged-template (compatible con `neon()`). */
export type SqlExec = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

export interface PricePoint {
  ts: number;
  price: number;
}

/** Almacén de histórico de precios (público/global). Async. */
export interface PriceHistoryStore {
  recordSnapshot(prices: Record<string, number>, ts?: number): Promise<void>;
  getHistory(item: string, since: number): Promise<PricePoint[]>;
  listItems(): Promise<string[]>;
}

export class PostgresPriceHistoryStore implements PriceHistoryStore {
  private schemaReady?: Promise<void>;

  constructor(private sql: SqlExec) {}

  private ensureSchema(): Promise<void> {
    return (this.schemaReady ??= this.sql`
      CREATE TABLE IF NOT EXISTS price_snapshots (
        item text NOT NULL,
        price double precision NOT NULL,
        ts bigint NOT NULL
      )
    `.then(() => this.sql`CREATE INDEX IF NOT EXISTS idx_price_item_ts ON price_snapshots (item, ts)`).then(() => {}));
  }

  async recordSnapshot(prices: Record<string, number>, ts: number = Date.now()): Promise<void> {
    await this.ensureSchema();
    const items = Object.keys(prices);
    if (items.length === 0) return;
    const priceArr = items.map((i) => prices[i]);
    const tsArr = items.map(() => ts);
    await this.sql`
      INSERT INTO price_snapshots (item, price, ts)
      SELECT * FROM unnest(${items}::text[], ${priceArr}::float8[], ${tsArr}::bigint[])
    `;
  }

  async getHistory(item: string, since: number): Promise<PricePoint[]> {
    await this.ensureSchema();
    const rows = await this.sql`
      SELECT ts, price FROM price_snapshots WHERE item = ${item} AND ts >= ${since} ORDER BY ts ASC
    `;
    return rows.map((r) => ({ ts: Number(r.ts), price: Number(r.price) }));
  }

  async listItems(): Promise<string[]> {
    await this.ensureSchema();
    const rows = await this.sql`SELECT DISTINCT item FROM price_snapshots`;
    return rows.map((r) => String(r.item));
  }
}
```

- [ ] **Step 5: Reescribir `src/lib/db/get-price-store.ts`**

```ts
import { neon } from "@neondatabase/serverless";
import { PostgresPriceHistoryStore, type SqlExec } from "./price-store";
import type { PriceHistoryStore } from "./price-store";

let instance: PriceHistoryStore | null = null;

export function getPriceStore(): PriceHistoryStore {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL no está configurada");
    instance = new PostgresPriceHistoryStore(neon(url) as unknown as SqlExec);
  }
  return instance;
}
```

- [ ] **Step 6: Correr (pasan) + tsc del módulo**

Run: `npx vitest run src/lib/db/price-store.test.ts` → PASS (3).
(tsc global quedará en rojo por consumidores async hasta Task 3.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/price-store.ts src/lib/db/price-store.test.ts src/lib/db/get-price-store.ts package.json package-lock.json
git commit -m "feat(db): Postgres price history store (async)"
```

---

### Task 2: Calibration store en Postgres (async)

**Files:**
- Modify: `src/lib/db/calibration-store.ts`, `src/lib/db/calibration-store.test.ts`, `src/lib/db/get-calibration-store.ts`

- [ ] **Step 1: Reescribir el test**

Reemplazar TODO `src/lib/db/calibration-store.test.ts` por:
```ts
import { describe, it, expect } from "vitest";
import { PostgresCalibrationStore } from "./calibration-store";

function fakeSql(resultFor: (q: string) => Record<string, unknown>[] = () => []) {
  const queries: string[] = [];
  const sql = async (strings: TemplateStringsArray) => {
    queries.push(strings.join("?"));
    return resultFor(strings.join("?"));
  };
  return { sql: sql as never, queries };
}

describe("PostgresCalibrationStore", () => {
  it("get devuelve null cuando no hay fila", async () => {
    const { sql } = fakeSql(() => []);
    expect(await new PostgresCalibrationStore(sql).get()).toBeNull();
  });

  it("get mapea la fila a Calibration", async () => {
    const { sql } = fakeSql((q) => (q.includes("SELECT") ? [{ factor: "0.5", samples: "3", updated_at: "1000" }] : []));
    const c = await new PostgresCalibrationStore(sql).get();
    expect(c).toEqual({ factor: 0.5, samples: 3, updatedAt: 1000 });
  });

  it("set emite un upsert", async () => {
    const { sql, queries } = fakeSql();
    await new PostgresCalibrationStore(sql).set({ factor: 0.9, samples: 5, updatedAt: 2000 });
    expect(queries.some((q) => /INSERT INTO calibration/i.test(q) && /ON CONFLICT/i.test(q))).toBe(true);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/lib/db/calibration-store.test.ts` → FAIL.

- [ ] **Step 3: Reescribir `src/lib/db/calibration-store.ts`**

```ts
import type { SqlExec } from "./price-store";

export interface Calibration {
  factor: number;
  samples: number;
  updatedAt: number;
}

export interface CalibrationStore {
  get(): Promise<Calibration | null>;
  set(c: Calibration): Promise<void>;
}

export class PostgresCalibrationStore implements CalibrationStore {
  private schemaReady?: Promise<void>;

  constructor(private sql: SqlExec) {}

  private ensureSchema(): Promise<void> {
    return (this.schemaReady ??= this.sql`
      CREATE TABLE IF NOT EXISTS calibration (
        id int PRIMARY KEY,
        factor double precision NOT NULL,
        samples int NOT NULL,
        updated_at bigint NOT NULL
      )
    `.then(() => {}));
  }

  async get(): Promise<Calibration | null> {
    await this.ensureSchema();
    const rows = await this.sql`SELECT factor, samples, updated_at FROM calibration WHERE id = 1`;
    if (rows.length === 0) return null;
    const r = rows[0];
    return { factor: Number(r.factor), samples: Number(r.samples), updatedAt: Number(r.updated_at) };
  }

  async set(c: Calibration): Promise<void> {
    await this.ensureSchema();
    await this.sql`
      INSERT INTO calibration (id, factor, samples, updated_at)
      VALUES (1, ${c.factor}, ${c.samples}, ${c.updatedAt})
      ON CONFLICT (id) DO UPDATE SET factor = excluded.factor, samples = excluded.samples, updated_at = excluded.updated_at
    `;
  }
}
```

- [ ] **Step 4: Reescribir `src/lib/db/get-calibration-store.ts`**

```ts
import { neon } from "@neondatabase/serverless";
import { PostgresCalibrationStore } from "./calibration-store";
import type { CalibrationStore } from "./calibration-store";
import type { SqlExec } from "./price-store";

let instance: CalibrationStore | null = null;

export function getCalibrationStore(): CalibrationStore {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL no está configurada");
    instance = new PostgresCalibrationStore(neon(url) as unknown as SqlExec);
  }
  return instance;
}
```

- [ ] **Step 5: Correr (pasan)**

Run: `npx vitest run src/lib/db/calibration-store.test.ts` → PASS (3).

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/calibration-store.ts src/lib/db/calibration-store.test.ts src/lib/db/get-calibration-store.ts
git commit -m "feat(db): Postgres calibration store (async)"
```

---

### Task 3: Consumidores → async (await)

**Files (modify):** `src/server/collect-prices.ts`(+test), `src/server/calibrate.ts`(+test), `src/server/calibration-factor.ts`(+test), `src/server/price-trend-for.ts`(+test), `src/server/portfolio.ts`(+test), `src/server/company-detail.ts`(+test), `src/app/api/prices/history/route.ts`, `src/app/api/report/route.ts`, `src/app/api/company/[id]/route.ts`

Cada cambio es agregar `await` donde se usa un método de store ahora async. Detalle:

- [ ] **Step 1: `collect-prices.ts`** — `await store.recordSnapshot(prices);` (el resto igual). En su test, el fake store: `recordSnapshot: async () => {}`.

- [ ] **Step 2: `calibrate.ts`** — `await store.set({ factor, samples, updatedAt: now });`. En su test, el fake store `set` ya es async (devuelve void); ajustar a `set: async (c) => { saved = c; }` y `get: async () => saved`.

- [ ] **Step 3: `calibration-factor.ts`** — `getRateFactor` pasa a async:
```ts
export async function getRateFactor(): Promise<number> {
  return rateFactorFrom(await getCalibrationStore().get());
}
```
(`rateFactorFrom` queda igual, puro y sync.) Su test: `rateFactorFrom` sin cambios; no testea `getRateFactor` (lee store real).

- [ ] **Step 4: `price-trend-for.ts`** — `priceTrendFor` pasa a async:
```ts
export async function priceTrendFor(store, itemCode, prices, days = 7): Promise<PriceTrendInfo | undefined> {
  if (!store) return undefined;
  const current = prices[itemCode];
  if (current === undefined) return undefined;
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const avg = averagePrice(await store.getHistory(itemCode, since));
  if (avg === null) return undefined;
  return priceTrend(current, avg);
}
```
Su test: el fake store `getHistory: async () => points`; los `expect` usan `await priceTrendFor(...)`.

- [ ] **Step 5: `portfolio.ts`** — al armar cada empresa, `const priceInfo = await priceTrendFor(opts.priceStore, c.itemCode, prices);` antes de `assembleCompanyReport`. (`opts.rateFactor` sigue llegando por opción.) Su test: el fake `priceStore.getHistory` pasa a `async () => [...]`.

- [ ] **Step 6: `company-detail.ts`** — igual: `const priceInfo = await priceTrendFor(opts.priceStore, c.itemCode, prices);` y pasarlo a `assembleCompanyReport`. Su test: fake `priceStore.getHistory` async si lo usa.

- [ ] **Step 7: Rutas** — `await` el factor y mantener el store:
  - `src/app/api/prices/history/route.ts`: `const points = await getPriceStore().getHistory(item, since);`
  - `src/app/api/report/route.ts`: `rateFactor: await getRateFactor(), priceStore: getPriceStore()`.
  - `src/app/api/company/[id]/route.ts`: `rateFactor: await getRateFactor(), priceStore: getPriceStore()`.
  (Los handlers ya son async.)

- [ ] **Step 7b: Mockear stores en los tests de ruta report/company**

`getRateFactor()` y `getPriceStore()` ahora LANZAN si falta `DATABASE_URL` (antes SQLite creaba el archivo). Los tests de `src/app/api/report/route.test.ts` y `src/app/api/company/[id]/route.test.ts` los invocan al ejecutar el handler → hay que mockearlos. Añadir al inicio de cada uno de esos test files:
```ts
vi.mock("@/server/calibration-factor", () => ({ getRateFactor: vi.fn(async () => 1) }));
vi.mock("@/lib/db/get-price-store", () => ({ getPriceStore: vi.fn(() => ({ getHistory: async () => [], recordSnapshot: async () => {}, listItems: async () => [] })) }));
```
(Verificar que no haya otro `vi.mock` duplicado de esos módulos; combinar si hace falta.) El resto de los tests de ruta —`prices/history`, `cron/collect-prices`, `calibrate`— ya mockean sus stores (Planes 3/6A) y siguen válidos con `await` (un valor sync devuelto por el mock se resuelve igual).

- [ ] **Step 8: Correr suite + tsc + build**

Run: `npm test` → todo verde (consumidores y stores).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.
Run: `npm run build` → compila (sin `better-sqlite3`).

- [ ] **Step 9: Commit**

```bash
git add src/server/ "src/app/api/"
git commit -m "refactor: await async stores across consumers"
```
(Incluye los `.test.ts` modificados de servicios y rutas.)

---

### Task 4: Config de Vercel + docs

**Files:**
- Create: `vercel.json`, `.env.example`
- Modify: `README.md`, `.gitignore`

- [ ] **Step 1: `vercel.json`**

```json
{
  "crons": [{ "path": "/api/cron/collect-prices", "schedule": "*/30 * * * *" }]
}
```

- [ ] **Step 2: `.env.example`**

```bash
# Conexión a Postgres (Neon). Pooled connection string.
DATABASE_URL=postgresql://user:password@host/db?sslmode=require

# Secreto para proteger el endpoint del cron de recolección de precios.
# Vercel Cron envía Authorization: Bearer <CRON_SECRET> automáticamente.
CRON_SECRET=cambiar-por-un-secreto-largo
```

- [ ] **Step 3: `.gitignore`**

Quitar la línea `/data/` (ya no se usa SQLite) — o dejarla; en cualquier caso, confirmar que `.env*` sigue ignorado (ya lo está).

- [ ] **Step 4: `README.md`**

Reemplazar el contenido por un README del proyecto:
```markdown
# WarEra Company Manager

Herramienta para optimizar la economía de tus empresas en WarEra.io: beneficio/día por empresa,
recomendador de contratación, optimizador de producción, precios y tendencias.

## Correr en local

1. Copiá `.env.example` a `.env.local` y completá `DATABASE_URL` (Neon o Postgres local) y `CRON_SECRET`.
2. `npm install`
3. `npm run dev` → http://localhost:3000
4. (Opcional) `npm run collect` toma un snapshot de precios al histórico.

## Tests

`npm test` · type-check `npx tsc --noEmit` · build `npm run build`

## Despliegue (Vercel)

1. Creá una base en [Neon](https://neon.tech) y copiá el `DATABASE_URL`.
2. Subí el repo a GitHub.
3. En Vercel: New Project → importá el repo → env vars `DATABASE_URL` y `CRON_SECRET` → Deploy.
4. El cron (`vercel.json`) toma snapshots de precios cada 30 min; las tablas se crean solas.

## Seguridad

Tu API token de WarEra (opcional, para salarios/calibración) se guarda solo en tu navegador
(`sessionStorage`) y se envía por-petición; nunca se persiste en el servidor.
```

- [ ] **Step 5: tsc + build**

Run: `./node_modules/.bin/tsc --noEmit` → exit 0; `npm run build` → compila.

- [ ] **Step 6: Commit**

```bash
git add vercel.json .env.example README.md .gitignore
git commit -m "chore: add Vercel cron config, env example and README"
```

---

## Verificación final del plan

- [ ] `npm test` → todos verdes (stores Postgres con fake SqlExec + consumidores async).
- [ ] `./node_modules/.bin/tsc --noEmit` → exit 0; `npm run build` → compila sin `better-sqlite3`.
- [ ] No quedan imports de `better-sqlite3` ni archivos SQLite store viejos.
- [ ] `vercel.json`, `.env.example`, `README.md` presentes; `.env*` ignorado.

## Runbook post-implementación (guiado, pasos del usuario)

Tras mergear, se ejecuta con el usuario:
1. **Neon:** crear proyecto → `DATABASE_URL`. Setear en `.env.local` y probar local (`npm run dev`, `npm run collect`).
2. **GitHub:** crear repo; `git remote add origin <url>`; `git push -u origin master`. (Se puede usar `gh repo create` si está autenticado.)
3. **Vercel:** importar el repo; env `DATABASE_URL` + `CRON_SECRET`; Deploy.
4. **Verificar:** URL pública carga; onboarding + dashboard andan; el cron figura en Vercel; tras la primera corrida, `/market` muestra tendencias.
