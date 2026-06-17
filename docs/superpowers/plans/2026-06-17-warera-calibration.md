# WarEra Company Manager — Plan 6A: Tutorial de API key + Calibración

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el usuario sepa cómo obtener su API token (tutorial en el onboarding) y que la app **calibre** empíricamente la conversión "stat de producción → output real" a partir de sus ventas reales (transacciones), persista el factor y deje de marcar las cifras como "estimadas".

**Architecture:** La calibración compara, sobre una ventana de N días, las **unidades realmente vendidas/día** (de `transaction.getPaginatedTransactions`, auth-gated, ventas = `sellerId == userId`) contra la `production` de las empresas, y deriva un **factor global** (independiente del precio). El factor se persiste en SQLite (`CalibrationStore`, misma DB del histórico). Un loader server `getGameConstants` inyecta `{ productionToUnitsPerDay: factor, calibrated: true }` al motor económico (que ya acepta `constants`), por lo que `buildPortfolio`/`buildCompanyDetail` dejan de reportar `estimated`. Una página `/calibrate` dispara la calibración con el token (per-petición, nunca persistido en el server). El token nunca toca disco ni logs.

**Tech Stack:** Next.js 16, TypeScript, better-sqlite3, @tanstack/react-query, lucide-react, Vitest.

Spec: `docs/superpowers/specs/2026-06-17-calibration-and-api-key-tutorial-design.md`. (Parte C — beneficio con tendencia — es el Plan 6B, separado.)

---

## Decisiones de diseño

- **Factor por unidades, no por plata** → independiente del precio.
- **Token requerido** para calibrar (transacciones auth-gated). Sin token: la página guía al tutorial.
- **No se depende del string de `transactionType`**: se filtra por `itemCode` y se cuentan ventas por `sellerId == userId`.
- **Umbral mínimo:** si no hay empresas con ventas en la ventana, NO se persiste factor y se informa "datos insuficientes".
- **Inyección de constantes:** los servicios reciben `constants` (default `GAME_CONSTANTS`); las rutas pasan `getGameConstants()`. Así los tests existentes (sin pasar constants) siguen verdes y no tocan disco.

## Estructura de archivos

- `src/lib/db/calibration-store.ts` (+test), `src/lib/db/get-calibration-store.ts` — store (Task 1)
- `src/server/get-constants.ts` (+test) — loader de constantes calibradas (Task 2)
- `src/lib/warera/schemas.ts`, `src/lib/warera/client.ts` (+tests) — transacciones (Task 3)
- `src/server/calibrate.ts` (+test) — `runCalibration` (Task 4)
- `src/server/company-report.ts`, `src/server/portfolio.ts`, `src/server/company-detail.ts` — threading de `constants` (Task 5)
- `src/app/api/report/route.ts`, `src/app/api/company/[id]/route.ts` (+tests) — pasar `getGameConstants()` (Task 5)
- `src/app/api/calibrate/route.ts` (+test) — endpoint (Task 6)
- `src/lib/client/use-calibrate.ts` (+test) — acción cliente (Task 7)
- `src/app/calibrate/page.tsx`, `src/components/app-shell.tsx` (+test) — UI + nav (Task 8)
- `src/app/onboarding/page.tsx` — tutorial (Task 9)

**Entorno:** typecheck `./node_modules/.bin/tsc --noEmit`. Tests `npm test`. Build `npm run build`.

---

### Task 1: `CalibrationStore` (interfaz + SQLite)

**Files:**
- Create: `src/lib/db/calibration-store.ts`, `src/lib/db/calibration-store.test.ts`, `src/lib/db/get-calibration-store.ts`

- [ ] **Step 1: Test (SQLite en memoria)**

`src/lib/db/calibration-store.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { SqliteCalibrationStore } from "./calibration-store";

function store() {
  return new SqliteCalibrationStore(":memory:");
}

describe("SqliteCalibrationStore", () => {
  it("devuelve null cuando no hay calibración", () => {
    expect(store().get()).toBeNull();
  });

  it("guarda y devuelve la última calibración", () => {
    const s = store();
    s.set({ factor: 0.95, samples: 12, updatedAt: 1000 });
    expect(s.get()).toEqual({ factor: 0.95, samples: 12, updatedAt: 1000 });
  });

  it("set reemplaza la calibración previa (fila única)", () => {
    const s = store();
    s.set({ factor: 1, samples: 1, updatedAt: 1 });
    s.set({ factor: 1.1, samples: 5, updatedAt: 2 });
    expect(s.get()).toEqual({ factor: 1.1, samples: 5, updatedAt: 2 });
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/lib/db/calibration-store.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

`src/lib/db/calibration-store.ts`:
```ts
import Database from "better-sqlite3";

export interface Calibration {
  factor: number;
  samples: number;
  updatedAt: number;
}

export interface CalibrationStore {
  get(): Calibration | null;
  set(c: Calibration): void;
}

export class SqliteCalibrationStore implements CalibrationStore {
  private db: Database.Database;

  constructor(path = "data/prices.db") {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS calibration (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        factor REAL NOT NULL,
        samples INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );`,
    );
  }

  get(): Calibration | null {
    const row = this.db
      .prepare("SELECT factor, samples, updatedAt FROM calibration WHERE id = 1")
      .get() as Calibration | undefined;
    return row ?? null;
  }

  set(c: Calibration): void {
    this.db
      .prepare(
        `INSERT INTO calibration (id, factor, samples, updatedAt) VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET factor = excluded.factor, samples = excluded.samples, updatedAt = excluded.updatedAt`,
      )
      .run(c.factor, c.samples, c.updatedAt);
  }
}
```

`src/lib/db/get-calibration-store.ts`:
```ts
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SqliteCalibrationStore } from "./calibration-store";
import type { CalibrationStore } from "./calibration-store";

let instance: CalibrationStore | null = null;

export function getCalibrationStore(): CalibrationStore {
  if (!instance) {
    const path = process.env.PRICE_DB_PATH ?? "data/prices.db";
    mkdirSync(dirname(path), { recursive: true });
    instance = new SqliteCalibrationStore(path);
  }
  return instance;
}
```

- [ ] **Step 4: Correr (pasan) + tsc**

Run: `npx vitest run src/lib/db/calibration-store.test.ts` → PASS (3).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/calibration-store.ts src/lib/db/calibration-store.test.ts src/lib/db/get-calibration-store.ts
git commit -m "feat(db): add calibration store"
```

---

### Task 2: Loader `getGameConstants`

**Files:**
- Create: `src/server/get-constants.ts`, `src/server/get-constants.test.ts`

- [ ] **Step 1: Test**

`src/server/get-constants.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { gameConstantsFrom } from "./get-constants";

describe("gameConstantsFrom", () => {
  it("sin calibración → constantes por defecto (no calibrado)", () => {
    const c = gameConstantsFrom(null);
    expect(c.productionToUnitsPerDay).toBe(1);
    expect(c.calibrated).toBe(false);
  });

  it("con calibración válida → factor + calibrado", () => {
    const c = gameConstantsFrom({ factor: 0.9, samples: 10, updatedAt: 1 });
    expect(c.productionToUnitsPerDay).toBeCloseTo(0.9);
    expect(c.calibrated).toBe(true);
  });

  it("factor inválido (<=0) → por defecto", () => {
    const c = gameConstantsFrom({ factor: 0, samples: 10, updatedAt: 1 });
    expect(c.calibrated).toBe(false);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/server/get-constants.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

`src/server/get-constants.ts`:
```ts
import { GAME_CONSTANTS, type GameConstants } from "@/lib/game-constants";
import type { Calibration } from "@/lib/db/calibration-store";
import { getCalibrationStore } from "@/lib/db/get-calibration-store";

/** Constantes del juego a partir de una calibración (pura, testeable). */
export function gameConstantsFrom(c: Calibration | null): GameConstants {
  if (c && c.factor > 0) {
    return { productionToUnitsPerDay: c.factor, calibrated: true };
  }
  return GAME_CONSTANTS;
}

/** Carga las constantes vigentes desde el store de calibración (server). */
export function getGameConstants(): GameConstants {
  return gameConstantsFrom(getCalibrationStore().get());
}
```

- [ ] **Step 4: Correr (pasan) + tsc**

Run: `npx vitest run src/server/get-constants.test.ts` → PASS (3).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/server/get-constants.ts src/server/get-constants.test.ts
git commit -m "feat(server): add calibrated game-constants loader"
```

---

### Task 3: Transacciones en el cliente

**Files:**
- Modify: `src/lib/warera/schemas.ts`, `src/lib/warera/client.ts`
- Test: `src/lib/warera/schemas.test.ts`, `src/lib/warera/client.test.ts`

- [ ] **Step 1: Test del schema**

Añadir a `src/lib/warera/schemas.test.ts`:
```ts
import { transactionsPageSchema } from "./schemas";

describe("transactionsPageSchema", () => {
  it("parsea items con campos de venta y nextCursor", () => {
    const p = transactionsPageSchema.parse({
      items: [{ sellerId: "u1", money: 10, quantity: 5, createdAt: "2026-06-17T00:00:00.000Z", extra: 1 }],
      nextCursor: "abc",
    });
    expect(p.items[0].sellerId).toBe("u1");
    expect(p.items[0].quantity).toBe(5);
    expect(p.nextCursor).toBe("abc");
  });

  it("tolera items vacíos y sin cursor", () => {
    const p = transactionsPageSchema.parse({ items: [] });
    expect(p.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Test del cliente**

Añadir a `src/lib/warera/client.test.ts`:
```ts
  it("getUserItemTransactions envía userId+itemCode y parsea", async () => {
    const spy = mockFetchOnce({ items: [{ sellerId: "u1", money: 10, quantity: 5, createdAt: "2026-06-17T00:00:00.000Z" }], nextCursor: null });
    const client = new WareraClient({ apiKey: "tok" });
    const r = await client.getUserItemTransactions("u1", "steel");
    expect(r.items[0].quantity).toBe(5);
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain("transaction.getPaginatedTransactions");
    expect(url).toContain(encodeURIComponent(JSON.stringify({ userId: "u1", itemCode: "steel", limit: 100 })));
    const opts = spy.mock.calls[0][1] as RequestInit;
    expect((opts.headers as Record<string, string>)["X-API-Key"]).toBe("tok");
  });
```

- [ ] **Step 3: Correr (deben fallar)**

Run: `npx vitest run src/lib/warera/schemas.test.ts src/lib/warera/client.test.ts` → FAIL.

- [ ] **Step 4: Implementar el schema**

Añadir a `src/lib/warera/schemas.ts`:
```ts
/** Una transacción (de transaction.getPaginatedTransactions). Tolerante a campos extra. */
export const transactionSchema = z
  .object({
    sellerId: z.string().optional(),
    money: z.number().optional(),
    quantity: z.number().optional(),
    createdAt: z.string().optional(),
  })
  .passthrough();

/** Página de transacciones. */
export const transactionsPageSchema = z.object({
  items: z.array(transactionSchema),
  nextCursor: z.string().nullable().optional(),
});
```

- [ ] **Step 5: Implementar el método del cliente**

En `src/lib/warera/client.ts`, importar `transactionsPageSchema` y añadir:
```ts
  getUserItemTransactions(userId: string, itemCode: string, cursor?: string) {
    return this.call("transaction.getPaginatedTransactions", transactionsPageSchema, {
      userId,
      itemCode,
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
  }
```

- [ ] **Step 6: Correr (pasan) + suite + tsc**

Run: `npx vitest run src/lib/warera/schemas.test.ts src/lib/warera/client.test.ts` → PASS.
Run: `npm test` → verde; `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/warera/schemas.ts src/lib/warera/schemas.test.ts src/lib/warera/client.ts src/lib/warera/client.test.ts
git commit -m "feat(warera): add getUserItemTransactions"
```

---

### Task 4: Servicio `runCalibration`

**Files:**
- Create: `src/server/calibrate.ts`, `src/server/calibrate.test.ts`

- [ ] **Step 1: Test (cliente + store fake)**

`src/server/calibrate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { runCalibration } from "./calibrate";
import type { CalibrationStore, Calibration } from "@/lib/db/calibration-store";

function fakeStore() {
  let saved: Calibration | null = null;
  const store: CalibrationStore = { get: () => saved, set: (c) => (saved = c) };
  return { store, get: () => saved };
}

const NOW = Date.parse("2026-06-10T00:00:00.000Z");
const recent = "2026-06-09T00:00:00.000Z"; // dentro de 7 días

function fakeClient(over: Partial<Record<string, unknown>> = {}) {
  return {
    getUserCompanies: async () => ({ items: ["c1"] }),
    getCompanyById: async () => ({ _id: "c1", itemCode: "steel", production: 100, workerCount: 0, activeUpgradeLevels: { automatedEngine: 0, breakRoom: 0 } }),
    getUserItemTransactions: async () => ({
      items: [
        { sellerId: "u1", quantity: 350, createdAt: recent },
        { sellerId: "OTHER", quantity: 999, createdAt: recent }, // compra de otro: se ignora
      ],
      nextCursor: null,
    }),
    ...over,
  } as never;
}

describe("runCalibration", () => {
  it("deriva factor = unidades vendidas/día ÷ producción y lo persiste", async () => {
    const { store, get } = fakeStore();
    const r = await runCalibration(fakeClient(), store, { userId: "u1", days: 7, now: NOW });
    // vendidas = 350 en 7 días = 50/día ; producción = 100 ; factor = 0.5
    expect(r.ok).toBe(true);
    expect(r.factor).toBeCloseTo(0.5);
    expect(r.rows[0]).toMatchObject({ itemCode: "steel", productionPerDay: 100, realizedPerDay: 50 });
    expect(get()?.factor).toBeCloseTo(0.5);
  });

  it("sin ventas en la ventana → no persiste y reporta insuficiente", async () => {
    const { store, get } = fakeStore();
    const client = fakeClient({ getUserItemTransactions: async () => ({ items: [], nextCursor: null }) });
    const r = await runCalibration(client, store, { userId: "u1", days: 7, now: NOW });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("insufficient");
    expect(get()).toBeNull();
  });

  it("ignora transacciones fuera de la ventana", async () => {
    const { store } = fakeStore();
    const old = "2026-01-01T00:00:00.000Z";
    const client = fakeClient({
      getUserItemTransactions: async () => ({ items: [{ sellerId: "u1", quantity: 350, createdAt: old }], nextCursor: null }),
    });
    const r = await runCalibration(client, store, { userId: "u1", days: 7, now: NOW });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/server/calibrate.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

`src/server/calibrate.ts`:
```ts
import type { WareraClient } from "@/lib/warera/client";
import type { CalibrationStore } from "@/lib/db/calibration-store";

export interface CalibrationRow {
  itemCode: string;
  productionPerDay: number;
  realizedPerDay: number;
}

export type CalibrationResult =
  | { ok: true; factor: number; samples: number; rows: CalibrationRow[] }
  | { ok: false; reason: "insufficient"; rows: CalibrationRow[] };

export interface RunCalibrationOptions {
  userId: string;
  days: number;
  /** Para tests; default Date.now(). */
  now?: number;
}

const MAX_PAGES = 10;

/** Calibra el factor producción→unidades comparando ventas reales vs producción. */
export async function runCalibration(
  client: WareraClient,
  store: CalibrationStore,
  opts: RunCalibrationOptions,
): Promise<CalibrationResult> {
  const now = opts.now ?? Date.now();
  const since = now - opts.days * 24 * 60 * 60 * 1000;

  const list = await client.getUserCompanies(opts.userId);
  const rows: CalibrationRow[] = [];
  let totalProduction = 0;
  let totalRealized = 0;
  let samples = 0;

  for (const companyId of list.items) {
    const c = await client.getCompanyById(companyId);
    if (c.production <= 0) continue;

    // Sumar unidades vendidas por el usuario dentro de la ventana (paginando).
    let soldQty = 0;
    let hadSale = false;
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await client.getUserItemTransactions(opts.userId, c.itemCode, cursor);
      let reachedOld = false;
      for (const tx of res.items) {
        const ts = tx.createdAt ? Date.parse(tx.createdAt) : NaN;
        if (!Number.isNaN(ts) && ts < since) {
          reachedOld = true;
          continue;
        }
        if (tx.sellerId === opts.userId && typeof tx.quantity === "number") {
          soldQty += tx.quantity;
          hadSale = true;
        }
      }
      cursor = res.nextCursor ?? undefined;
      if (!cursor || reachedOld) break;
    }

    const realizedPerDay = soldQty / opts.days;
    rows.push({ itemCode: c.itemCode, productionPerDay: c.production, realizedPerDay });
    if (hadSale) {
      totalProduction += c.production;
      totalRealized += realizedPerDay;
      samples++;
    }
  }

  if (samples === 0 || totalProduction <= 0 || totalRealized <= 0) {
    return { ok: false, reason: "insufficient", rows };
  }

  const factor = totalRealized / totalProduction;
  store.set({ factor, samples, updatedAt: now });
  return { ok: true, factor, samples, rows };
}
```

- [ ] **Step 4: Correr (pasan) + tsc**

Run: `npx vitest run src/server/calibrate.test.ts` → PASS (3).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/server/calibrate.ts src/server/calibrate.test.ts
git commit -m "feat(server): add runCalibration service"
```

---

### Task 5: Inyectar constantes calibradas en los reportes

**Files:**
- Modify: `src/server/company-report.ts`, `src/server/portfolio.ts`, `src/server/company-detail.ts`, `src/app/api/report/route.ts`, `src/app/api/company/[id]/route.ts`
- Modify (tests): `src/app/api/report/route.test.ts`, `src/app/api/company/[id]/route.test.ts`

- [ ] **Step 1: `assembleCompanyReport` acepta `constants`**

En `src/server/company-report.ts`:
1. Importar: `import { GAME_CONSTANTS, type GameConstants } from "@/lib/game-constants";`
2. Añadir `constants?: GameConstants` al objeto de args.
3. Pasar `const constants = args.constants ?? GAME_CONSTANTS;` a `companyProfit` (`constants`) y `hiringAnalysis` (`constants`).

```ts
export function assembleCompanyReport(args: {
  company: CompanyData;
  item: ItemDef;
  workers: WorkerData[];
  prices: PriceMap;
  taxes: Taxes;
  constants?: GameConstants;
}): CompanyReport {
  const constants = args.constants ?? GAME_CONSTANTS;
  const profit = companyProfit({ company: args.company, item: args.item, workers: args.workers, prices: args.prices, taxes: args.taxes, constants });
  const hiring = hiringAnalysis({ company: args.company, item: args.item, prices: args.prices, taxes: args.taxes, candidateWage: 0, constants });
  return { id: args.company.id, itemCode: args.company.itemCode, profit, hiring, maxWageToHire: hiring.maxWage };
}
```

- [ ] **Step 2: `buildPortfolio` y `buildCompanyDetail` aceptan y propagan `constants`**

En `src/server/portfolio.ts`:
1. `import { GAME_CONSTANTS, type GameConstants } from "@/lib/game-constants";`
2. Añadir a `BuildPortfolioOptions`: `constants?: GameConstants;`
3. En el bucle, al llamar `assembleCompanyReport`, pasar `constants: opts.constants ?? GAME_CONSTANTS`.

En `src/server/company-detail.ts`:
1. `import { GAME_CONSTANTS, type GameConstants } from "@/lib/game-constants";`
2. Añadir a `BuildCompanyDetailOptions`: `constants?: GameConstants;`
3. Al llamar `assembleCompanyReport`, pasar `constants: opts.constants ?? GAME_CONSTANTS`.

(Los tests existentes de portfolio/company-detail no pasan `constants` → usan el default → `estimated:true` como antes → siguen verdes.)

- [ ] **Step 3: Las rutas pasan `getGameConstants()`**

En `src/app/api/report/route.ts`: importar `getGameConstants` y pasar en las opciones:
```ts
import { getGameConstants } from "@/server/get-constants";
// ...
    const portfolio = await buildPortfolio(client, { userId, authenticated: Boolean(apiKey), constants: getGameConstants() });
```

En `src/app/api/company/[id]/route.ts`: igual:
```ts
import { getGameConstants } from "@/server/get-constants";
// ...
    const detail = await buildCompanyDetail(client, { companyId: id, userId, authenticated: Boolean(apiKey), constants: getGameConstants() });
```

- [ ] **Step 4: Ajustar las aserciones de los tests de ruta**

En `src/app/api/report/route.test.ts`, cambiar la aserción exacta por `objectContaining`:
```ts
    expect(mock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: "u1", authenticated: true }));
```

En `src/app/api/company/[id]/route.test.ts`, la aserción del segundo test:
```ts
    expect(mock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ companyId: "c1", userId: "u1", authenticated: true }));
```

- [ ] **Step 5: Correr suite + tsc**

Run: `npm test` → todo verde (portfolio, company-detail, ambas rutas).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/company-report.ts src/server/portfolio.ts src/server/company-detail.ts src/app/api/report/route.ts "src/app/api/company/[id]/route.ts" src/app/api/report/route.test.ts "src/app/api/company/[id]/route.test.ts"
git commit -m "feat(server): inject calibrated constants into reports"
```

---

### Task 6: Endpoint `/api/calibrate`

**Files:**
- Create: `src/app/api/calibrate/route.ts`, `src/app/api/calibrate/route.test.ts`

- [ ] **Step 1: Test**

`src/app/api/calibrate/route.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("@/server/calibrate", () => ({ runCalibration: vi.fn() }));
vi.mock("@/lib/db/get-calibration-store", () => ({ getCalibrationStore: vi.fn(() => ({})) }));
import { runCalibration } from "@/server/calibrate";
import { GET } from "./route";

afterEach(() => vi.clearAllMocks());

describe("GET /api/calibrate", () => {
  it("400 si falta userId", async () => {
    const res = await GET(new Request("http://localhost/api/calibrate", { headers: { "X-API-Key": "tok" } }));
    expect(res.status).toBe(400);
  });

  it("401 si falta token", async () => {
    const res = await GET(new Request("http://localhost/api/calibrate?userId=u1"));
    expect(res.status).toBe(401);
    expect(runCalibration).not.toHaveBeenCalled();
  });

  it("con token y userId, corre la calibración", async () => {
    (runCalibration as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, factor: 0.9, samples: 4, rows: [] });
    const res = await GET(new Request("http://localhost/api/calibrate?userId=u1&days=7", { headers: { "X-API-Key": "tok" } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.factor).toBeCloseTo(0.9);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/app/api/calibrate/route.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

`src/app/api/calibrate/route.ts`:
```ts
import { WareraClient } from "@/lib/warera/client";
import { runCalibration } from "@/server/calibrate";
import { getCalibrationStore } from "@/lib/db/get-calibration-store";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const apiKey = req.headers.get("x-api-key") ?? undefined;

  if (!apiKey) {
    return Response.json({ error: "API token required" }, { status: 401 });
  }
  if (!userId) {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }

  const daysRaw = Number(url.searchParams.get("days"));
  const days = daysRaw > 0 ? daysRaw : 7;

  try {
    const result = await runCalibration(new WareraClient({ apiKey }), getCalibrationStore(), { userId, days });
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
```

- [ ] **Step 4: Correr (pasan) + tsc**

Run: `npx vitest run src/app/api/calibrate/route.test.ts` → PASS (3).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/calibrate/
git commit -m "feat(api): add /api/calibrate endpoint"
```

---

### Task 7: Acción cliente `use-calibrate`

**Files:**
- Create: `src/lib/client/use-calibrate.ts`, `src/lib/client/use-calibrate.test.ts`

- [ ] **Step 1: Test (jsdom, fetch mock)**

`src/lib/client/use-calibrate.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { runCalibrate } from "./use-calibrate";

afterEach(() => vi.restoreAllMocks());

describe("runCalibrate", () => {
  it("llama /api/calibrate con userId, days y X-API-Key", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, factor: 0.9, samples: 3, rows: [] })),
    );
    const r = await runCalibrate("u1", "tok", 7);
    expect(r.ok).toBe(true);
    const [url, opts] = spy.mock.calls[0];
    expect(url).toBe("/api/calibrate?userId=u1&days=7");
    expect((opts?.headers as Record<string, string>)["X-API-Key"]).toBe("tok");
  });

  it("lanza si no es ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("e", { status: 502 }));
    await expect(runCalibrate("u1", "tok", 7)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/lib/client/use-calibrate.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

`src/lib/client/use-calibrate.ts`:
```ts
"use client";
import type { CalibrationResult } from "@/server/calibrate";

export async function runCalibrate(userId: string, token: string, days = 7): Promise<CalibrationResult> {
  const res = await fetch(`/api/calibrate?userId=${encodeURIComponent(userId)}&days=${days}`, {
    headers: { "X-API-Key": token },
  });
  if (!res.ok) throw new Error(`Error al calibrar (HTTP ${res.status})`);
  return (await res.json()) as CalibrationResult;
}
```

- [ ] **Step 4: Correr (pasan) + tsc**

Run: `npx vitest run src/lib/client/use-calibrate.test.ts` → PASS.
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/client/use-calibrate.ts src/lib/client/use-calibrate.test.ts
git commit -m "feat(ui): add runCalibrate client action"
```

---

### Task 8: Página `/calibrate` + link en la nav

**Files:**
- Create: `src/app/calibrate/page.tsx`
- Modify: `src/components/app-shell.tsx`, `src/components/app-shell.test.tsx`

- [ ] **Step 1: Implementar la página**

`src/app/calibrate/page.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SlidersHorizontal, KeyRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getUserId, getToken } from "@/lib/client/token-store";
import { runCalibrate } from "@/lib/client/use-calibrate";
import type { CalibrationResult } from "@/server/calibrate";
import { formatMoney } from "@/lib/format";

export default function CalibratePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CalibrationResult | null>(null);

  useEffect(() => {
    const id = getUserId();
    if (!id) {
      router.replace("/onboarding");
      return;
    }
    setUserId(id);
    setToken(getToken());
  }, [router]);

  async function calibrate() {
    if (!userId || !token) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await runCalibrate(userId, token, 7));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell hasToken={Boolean(token)}>
      <h1 className="mb-2 flex items-center gap-2 text-xl font-bold">
        <SlidersHorizontal className="h-5 w-5" aria-hidden="true" /> Calibración
      </h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Compara lo que tus empresas producen contra lo que realmente vendiste (últimos 7 días) para
        ajustar las cifras. Los precios no afectan este cálculo (se mide por unidades).
      </p>

      {!token ? (
        <Card className="cursor-default">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Necesitás tu API token para calibrar.{" "}
            <Link href="/onboarding" className="rounded-sm text-accent underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Agregarlo
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <Button onClick={calibrate} disabled={loading}>
            {loading ? "Calibrando…" : "Calibrar con mis ventas"}
          </Button>

          {loading ? (
            <div className="mt-6 flex items-center gap-2 text-muted-foreground">
              <Spinner /> Analizando tus transacciones…
            </div>
          ) : error ? (
            <Card className="mt-6 cursor-default border-destructive/40">
              <p className="text-destructive">{error}</p>
            </Card>
          ) : result ? (
            <div className="mt-6 flex flex-col gap-4">
              {result.ok ? (
                <Card className="cursor-default border-success/40">
                  <p className="font-medium text-success">Calibrado ✓</p>
                  <p className="tabular mt-1 text-2xl font-bold">factor {result.factor.toFixed(3)}</p>
                  <p className="text-xs text-muted-foreground">
                    Basado en {result.samples} empresa(s) con ventas. Las cifras ya no son estimadas.
                  </p>
                </Card>
              ) : (
                <Card className="cursor-default border-warning/40">
                  <p className="text-warning">Datos insuficientes para calibrar.</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    No encontramos ventas tuyas en los últimos 7 días. Vendé algo y volvé a intentar.
                  </p>
                </Card>
              )}

              {result.rows.length > 0 ? (
                <Card className="cursor-default overflow-x-auto p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Item</th>
                        <th className="px-4 py-3 text-right font-medium">Producción/día</th>
                        <th className="px-4 py-3 text-right font-medium">Vendido/día</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((r) => (
                        <tr key={r.itemCode} className="border-b border-border last:border-0">
                          <td className="px-4 py-2.5 font-mono">{r.itemCode}</td>
                          <td className="tabular px-4 py-2.5 text-right">{formatMoney(r.productionPerDay)}</td>
                          <td className="tabular px-4 py-2.5 text-right">{formatMoney(r.realizedPerDay)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
```

- [ ] **Step 2: Link "Calibrar" en la nav**

En `src/components/app-shell.tsx`, importar `SlidersHorizontal` y agregar, DESPUÉS del link de Mercado y antes del de token, dentro del `<div>` de nav:
```tsx
            <Link
              href="/calibrate"
              aria-label="Calibrar"
              className="flex items-center gap-1.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Calibrar</span>
            </Link>
```
Actualizar el import: `import { LineChart, KeyRound, Boxes, SlidersHorizontal } from "lucide-react";`

- [ ] **Step 3: Aserción en el test de la nav**

En `src/components/app-shell.test.tsx`, en el primer test (`hasToken`), añadir:
```tsx
    expect(screen.getByText("Calibrar")).toBeInTheDocument();
```

- [ ] **Step 4: Correr + tsc + build**

Run: `npx vitest run src/components/app-shell.test.tsx` → PASS.
Run: `npm test` → verde; `./node_modules/.bin/tsc --noEmit` → exit 0; `npm run build` → compila (ruta `/calibrate`).

- [ ] **Step 5: Commit**

```bash
git add src/app/calibrate/page.tsx src/components/app-shell.tsx src/components/app-shell.test.tsx
git commit -m "feat(ui): add calibration page and nav link"
```

---

### Task 9: Tutorial de API key en el onboarding

**Files:**
- Modify: `src/app/onboarding/page.tsx`

- [ ] **Step 1: Agregar la sección desplegable**

En `src/app/onboarding/page.tsx`:
1. Importar `HelpCircle` de lucide-react (junto a los íconos ya importados).
2. Insertar, DESPUÉS del `<Card>` del formulario (antes de cerrar el `<div>` contenedor), un `<details>` con los pasos:
```tsx
      <details className="mt-4 rounded-lg border border-border bg-surface p-4 text-sm">
        <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
          <HelpCircle className="h-4 w-4" aria-hidden="true" /> ¿Cómo consigo mi API token?
        </summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted-foreground">
          <li>Iniciá sesión en <span className="font-mono">app.warera.io</span>.</li>
          <li>Abrí <span className="text-foreground">Settings</span> (Configuración) desde tu perfil.</li>
          <li>Entrá a la sección <span className="text-foreground">API Tokens</span>.</li>
          <li>Creá un token nuevo y copialo.</li>
          <li>Pegalo en el campo <span className="text-foreground">API token</span> de arriba.</li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          El token es de solo lectura y se guarda únicamente en esta pestaña del navegador. Sin token
          igual ves tus empresas; con token se incluyen los salarios y podés calibrar.
        </p>
      </details>
```
(Mantener el resto del formulario igual. El `<details>` nativo es accesible por teclado y no necesita JS.)

- [ ] **Step 2: tsc + build**

Run: `./node_modules/.bin/tsc --noEmit` → exit 0.
Run: `npm run build` → compila.

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/page.tsx
git commit -m "feat(ui): add API token tutorial to onboarding"
```

---

## Verificación final del Plan 6A

- [ ] `npm test` → todos verdes (Plan 1–5,3 + nuevos: calibration-store, get-constants, transactions schema/client, runCalibration, calibrate route, use-calibrate, app-shell actualizado).
- [ ] `./node_modules/.bin/tsc --noEmit` → exit 0.
- [ ] `npm run build` → compila; ruta nueva `/api/calibrate`, `/calibrate`.
- [ ] Flujo en vivo (con el usuario real, BebetoSan `6a141b049be11c48c9d30c50`, y SU API token pegado en onboarding):
  - `/onboarding` muestra el tutorial desplegable de API key.
  - `/calibrate` → "Calibrar con mis ventas" → muestra la tabla producción/día vs vendido/día, el factor y "Calibrado ✓" (o "datos insuficientes" si no hubo ventas recientes).
  - Tras calibrar, el dashboard/detalle dejan de mostrar "estimado".
- [ ] Verificación visual con Playwright de `/calibrate` y del tutorial en `/onboarding`.

## Notas

- **Plan 6B (siguiente):** beneficio al precio actual + tendencia (Parte C del spec): enriquecer los
  reportes con `currentPrice`/`avgPrice7d`/`trend` desde el `PriceHistoryStore` y mostrar el indicador
  en tarjeta de empresa y detalle (+ mini-gráfico en el detalle).
- **Token para probar:** la calibración necesita el API token real del usuario (transacciones
  auth-gated). Sin token, `/api/calibrate` responde 401 y la página guía al tutorial.
