# WarEra Company Manager — Plan 3: Histórico de precios + tendencias

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir snapshots periódicos de los precios de mercado y exponer su evolución, para que la pantalla de Mercado muestre la tendencia histórica de cada item (no solo el precio actual).

**Architecture:** Un store de histórico detrás de una interfaz `PriceHistoryStore` con implementación SQLite local (better-sqlite3), para poder migrar a Postgres sin tocar el resto. Un servicio `collectPrices` toma un snapshot (precios actuales → store). Una ruta protegida `/api/cron/collect-prices` dispara el snapshot (la activa el cron del SO localmente o Vercel Cron al desplegar). `/api/prices/history` devuelve la serie temporal de un item. La pantalla `/market` agrega un gráfico de tendencia (Recharts) al seleccionar un item, con tabla/datos accesibles y respeto a `prefers-reduced-motion`. El dato es público/global, no personal.

**Tech Stack:** Next.js 16, TypeScript, better-sqlite3, Recharts, Vitest. Reusa `WareraClient` (Plan 2) y el `/market` (Plan 5).

Spec: `docs/superpowers/specs/2026-06-16-warera-company-manager-design.md` (§5 caché/histórico). Decisiones del usuario: **SQLite local** detrás de interfaz; **endpoint + cron** para la recolección.

---

## Decisiones de diseño de este plan

- **SQLite local** vía `better-sqlite3`, archivo en `data/prices.db` (gitignored). Detrás de la interfaz `PriceHistoryStore` → migrable a Postgres luego sin reescribir consumidores.
- **Recolección por endpoint + cron.** `/api/cron/collect-prices` protegido por `CRON_SECRET` (si la env está seteada se exige; en dev sin env, se permite). Mismo código local (cron del SO / `npm run collect`) y desplegado (Vercel Cron).
- **Caveat serverless documentado:** SQLite en un FS efímero (p.ej. Vercel) no persiste entre invocaciones; para producción se migra el `PriceHistoryStore` a Postgres. Aceptable para "empezar para mí" (local).
- **Tendencias accesibles:** el gráfico Recharts lleva `aria-label` con resumen; se mantiene el precio actual en la tabla; animación desactivada si `prefers-reduced-motion`.

## Estructura de archivos (Plan 3)

- `src/lib/db/price-store.ts` — interfaz + impl SQLite (Task 1)
- `src/lib/db/get-price-store.ts` — singleton por defecto (Task 1)
- `src/server/collect-prices.ts` — servicio recolector (Task 2)
- `src/app/api/cron/collect-prices/route.ts` — endpoint cron (Task 3)
- `src/app/api/prices/history/route.ts` — endpoint de serie (Task 4)
- `src/lib/client/use-price-history.ts` — hook (Task 5)
- `src/lib/ui/use-reduced-motion.ts` — hook (Task 5)
- `src/components/market/price-trend.tsx` — gráfico (Task 5)
- `src/app/market/page.tsx` — MOD: selección de item + gráfico (Task 6)
- `scripts/collect.ts` — recolector manual (Task 7)
- `.gitignore`, `package.json` — MOD

**Entorno:** typecheck `./node_modules/.bin/tsc --noEmit`. Tests `npm test`. Build `npm run build`.

---

### Task 1: Store de histórico (interfaz + SQLite)

**Files:**
- Create: `src/lib/db/price-store.ts`, `src/lib/db/price-store.test.ts`, `src/lib/db/get-price-store.ts`
- Modify: `.gitignore`, `package.json`

- [ ] **Step 1: Instalar better-sqlite3**

Run: `npm i better-sqlite3 && npm i -D @types/better-sqlite3`
Expected: se añaden a package.json. Trae binarios precompilados.

**Fallback (Node 24 es nuevo; si `better-sqlite3` no trae prebuild y la compilación nativa falla en Windows):** usar el SQLite incorporado de Node, `node:sqlite`, en su lugar — NO instalar better-sqlite3. Adaptar `SqlitePriceStore` así:
- `import { DatabaseSync } from "node:sqlite";` y `private db: DatabaseSync; ... this.db = new DatabaseSync(path);`
- `this.db.exec(...)` para el schema (igual).
- `this.db.prepare(sql)` con `.run(...)` y `.all(...)` (misma forma que better-sqlite3; los `.all()` devuelven objetos planos — castear igual).
- Omitir el `import Database from "better-sqlite3"` y el `@types`.
El SQL y la interfaz `PriceHistoryStore` son idénticos; solo cambia el constructor/import. Si se corre vía `tsx`/Node 24 puede emitir un warning experimental — es aceptable. **Reportar en el informe cuál de las dos opciones se usó.**

- [ ] **Step 2: Ignorar la DB local**

Añadir a `.gitignore`:
```
# local price history db
/data/
```

- [ ] **Step 3: Escribir el test (SQLite en memoria)**

`src/lib/db/price-store.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { SqlitePriceStore } from "./price-store";

function store() {
  return new SqlitePriceStore(":memory:");
}

describe("SqlitePriceStore", () => {
  it("guarda un snapshot y devuelve el histórico de un item", () => {
    const s = store();
    s.recordSnapshot({ bread: 1.5, grain: 0.1 }, 1000);
    s.recordSnapshot({ bread: 1.6, grain: 0.1 }, 2000);
    const h = s.getHistory("bread", 0);
    expect(h).toEqual([
      { ts: 1000, price: 1.5 },
      { ts: 2000, price: 1.6 },
    ]);
  });

  it("filtra por `since`", () => {
    const s = store();
    s.recordSnapshot({ bread: 1.5 }, 1000);
    s.recordSnapshot({ bread: 1.6 }, 2000);
    expect(s.getHistory("bread", 1500)).toEqual([{ ts: 2000, price: 1.6 }]);
  });

  it("devuelve [] para un item sin datos", () => {
    expect(store().getHistory("nada", 0)).toEqual([]);
  });

  it("lista los items con histórico", () => {
    const s = store();
    s.recordSnapshot({ bread: 1.5, grain: 0.1 }, 1000);
    expect(s.listItems().sort()).toEqual(["bread", "grain"]);
  });
});
```

- [ ] **Step 4: Correr (debe fallar)**

Run: `npx vitest run src/lib/db/price-store.test.ts` → FAIL.

- [ ] **Step 5: Implementar el store**

`src/lib/db/price-store.ts`:
```ts
import Database from "better-sqlite3";

export interface PricePoint {
  ts: number;
  price: number;
}

/** Almacén de histórico de precios (público/global). Implementable en SQLite o Postgres. */
export interface PriceHistoryStore {
  /** Registra un snapshot completo de precios con un timestamp (ms). */
  recordSnapshot(prices: Record<string, number>, ts?: number): void;
  /** Serie temporal de un item desde `since` (ms, inclusive), ascendente por ts. */
  getHistory(item: string, since: number): PricePoint[];
  /** Items que tienen algún dato. */
  listItems(): string[];
}

export class SqlitePriceStore implements PriceHistoryStore {
  private db: Database.Database;

  constructor(path = "data/prices.db") {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS price_snapshots (
        item TEXT NOT NULL,
        price REAL NOT NULL,
        ts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_item_ts ON price_snapshots (item, ts);`,
    );
  }

  recordSnapshot(prices: Record<string, number>, ts: number = Date.now()): void {
    const insert = this.db.prepare("INSERT INTO price_snapshots (item, price, ts) VALUES (?, ?, ?)");
    const tx = this.db.transaction((entries: [string, number][]) => {
      for (const [item, price] of entries) insert.run(item, price, ts);
    });
    tx(Object.entries(prices));
  }

  getHistory(item: string, since: number): PricePoint[] {
    return this.db
      .prepare("SELECT ts, price FROM price_snapshots WHERE item = ? AND ts >= ? ORDER BY ts ASC")
      .all(item, since) as PricePoint[];
  }

  listItems(): string[] {
    return (this.db.prepare("SELECT DISTINCT item FROM price_snapshots").all() as { item: string }[]).map(
      (r) => r.item,
    );
  }
}
```

- [ ] **Step 6: Singleton por defecto**

`src/lib/db/get-price-store.ts`:
```ts
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SqlitePriceStore } from "./price-store";
import type { PriceHistoryStore } from "./price-store";

let instance: PriceHistoryStore | null = null;

/** Store de histórico por defecto (SQLite en disco). Crea el directorio si falta. */
export function getPriceStore(): PriceHistoryStore {
  if (!instance) {
    const path = process.env.PRICE_DB_PATH ?? "data/prices.db";
    mkdirSync(dirname(path), { recursive: true });
    instance = new SqlitePriceStore(path);
  }
  return instance;
}
```

- [ ] **Step 7: Correr (pasan) + tsc**

Run: `npx vitest run src/lib/db/price-store.test.ts` → PASS (4 tests).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/ .gitignore package.json package-lock.json
git commit -m "feat(db): add SQLite price history store behind interface"
```

---

### Task 2: Servicio recolector `collectPrices`

**Files:**
- Create: `src/server/collect-prices.ts`, `src/server/collect-prices.test.ts`

- [ ] **Step 1: Escribir el test (cliente + store fake)**

`src/server/collect-prices.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { collectPrices } from "./collect-prices";
import type { PriceHistoryStore, PricePoint } from "@/lib/db/price-store";

function fakeStore() {
  const snaps: { prices: Record<string, number>; ts?: number }[] = [];
  const store: PriceHistoryStore = {
    recordSnapshot: (prices, ts) => snaps.push({ prices, ts }),
    getHistory: (): PricePoint[] => [],
    listItems: () => [],
  };
  return { store, snaps };
}

describe("collectPrices", () => {
  it("lee precios del cliente y los guarda como snapshot", async () => {
    const { store, snaps } = fakeStore();
    const client = { getPrices: async () => ({ bread: 1.5, grain: 0.1 }) } as never;
    const n = await collectPrices(client, store);
    expect(n).toBe(2);
    expect(snaps).toHaveLength(1);
    expect(snaps[0].prices).toEqual({ bread: 1.5, grain: 0.1 });
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/server/collect-prices.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

`src/server/collect-prices.ts`:
```ts
import type { WareraClient } from "@/lib/warera/client";
import type { PriceHistoryStore } from "@/lib/db/price-store";

/** Toma un snapshot de los precios actuales y lo persiste. Devuelve cuántos items guardó. */
export async function collectPrices(client: WareraClient, store: PriceHistoryStore): Promise<number> {
  const prices = await client.getPrices();
  store.recordSnapshot(prices);
  return Object.keys(prices).length;
}
```

- [ ] **Step 4: Correr (pasa) + tsc**

Run: `npx vitest run src/server/collect-prices.test.ts` → PASS.
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/server/collect-prices.ts src/server/collect-prices.test.ts
git commit -m "feat(server): add collectPrices snapshot service"
```

---

### Task 3: Endpoint cron `/api/cron/collect-prices`

**Files:**
- Create: `src/app/api/cron/collect-prices/route.ts`, `src/app/api/cron/collect-prices/route.test.ts`

- [ ] **Step 1: Escribir el test**

`src/app/api/cron/collect-prices/route.test.ts`:
```ts
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
vi.mock("@/server/collect-prices", () => ({ collectPrices: vi.fn() }));
vi.mock("@/lib/db/get-price-store", () => ({ getPriceStore: vi.fn(() => ({})) }));
import { collectPrices } from "@/server/collect-prices";
import { GET } from "./route";

beforeEach(() => {
  delete process.env.CRON_SECRET;
});
afterEach(() => vi.restoreAllMocks());

describe("GET /api/cron/collect-prices", () => {
  it("sin CRON_SECRET seteado, permite y recolecta", async () => {
    (collectPrices as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(5);
    const res = await GET(new Request("http://localhost/api/cron/collect-prices"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.collected).toBe(5);
  });

  it("con CRON_SECRET, rechaza sin Authorization correcto (401)", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    const res = await GET(new Request("http://localhost/api/cron/collect-prices"));
    expect(res.status).toBe(401);
    expect(collectPrices).not.toHaveBeenCalled();
  });

  it("con CRON_SECRET y Authorization correcto, recolecta", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    (collectPrices as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(3);
    const res = await GET(
      new Request("http://localhost/api/cron/collect-prices", {
        headers: { authorization: "Bearer s3cr3t" },
      }),
    );
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run "src/app/api/cron/collect-prices/route.test.ts"` → FAIL.

- [ ] **Step 3: Implementar**

`src/app/api/cron/collect-prices/route.ts`:
```ts
import { WareraClient } from "@/lib/warera/client";
import { collectPrices } from "@/server/collect-prices";
import { getPriceStore } from "@/lib/db/get-price-store";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev: sin secret configurado, se permite
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const collected = await collectPrices(new WareraClient(), getPriceStore());
    return Response.json({ ok: true, collected });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
```

- [ ] **Step 4: Correr (pasan) + tsc**

Run: `npx vitest run "src/app/api/cron/collect-prices/route.test.ts"` → PASS (3 tests).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/cron/"
git commit -m "feat(api): add protected price-collection cron endpoint"
```

---

### Task 4: Endpoint `/api/prices/history`

**Files:**
- Create: `src/app/api/prices/history/route.ts`, `src/app/api/prices/history/route.test.ts`

- [ ] **Step 1: Escribir el test**

`src/app/api/prices/history/route.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
const getHistory = vi.fn();
vi.mock("@/lib/db/get-price-store", () => ({ getPriceStore: () => ({ getHistory }) }));
import { GET } from "./route";

afterEach(() => vi.restoreAllMocks());

describe("GET /api/prices/history", () => {
  it("400 si falta item", async () => {
    const res = await GET(new Request("http://localhost/api/prices/history"));
    expect(res.status).toBe(400);
  });

  it("devuelve los puntos del item", async () => {
    getHistory.mockReturnValueOnce([{ ts: 1000, price: 1.5 }]);
    const res = await GET(new Request("http://localhost/api/prices/history?item=bread"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item).toBe("bread");
    expect(body.points).toEqual([{ ts: 1000, price: 1.5 }]);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run "src/app/api/prices/history/route.test.ts"` → FAIL.

- [ ] **Step 3: Implementar**

`src/app/api/prices/history/route.ts`:
```ts
import { getPriceStore } from "@/lib/db/get-price-store";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const item = url.searchParams.get("item");
  if (!item) {
    return Response.json({ error: "item is required" }, { status: 400 });
  }
  const hours = Number(url.searchParams.get("hours") ?? "168"); // 7 días por defecto
  const since = Date.now() - hours * 60 * 60 * 1000;
  const points = getPriceStore().getHistory(item, since);
  return Response.json({ item, points });
}
```

- [ ] **Step 4: Correr (pasan) + tsc**

Run: `npx vitest run "src/app/api/prices/history/route.test.ts"` → PASS (2 tests).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/prices/history/"
git commit -m "feat(api): add /api/prices/history endpoint"
```

---

### Task 5: Hook + gráfico de tendencia

**Files:**
- Create: `src/lib/client/use-price-history.ts` (+ test), `src/lib/ui/use-reduced-motion.ts`, `src/components/market/price-trend.tsx` (+ test)
- Modify: `package.json` (recharts)

- [ ] **Step 1: Instalar Recharts**

Run: `npm i recharts`
Expected: añadido a dependencies.

- [ ] **Step 2: Test de `fetchPriceHistory`**

`src/lib/client/use-price-history.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchPriceHistory } from "./use-price-history";

afterEach(() => vi.restoreAllMocks());

describe("fetchPriceHistory", () => {
  it("llama a /api/prices/history?item= y devuelve points", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ item: "bread", points: [{ ts: 1000, price: 1.5 }] })),
    );
    const r = await fetchPriceHistory("bread");
    expect(r.points).toEqual([{ ts: 1000, price: 1.5 }]);
    expect(spy.mock.calls[0][0]).toBe("/api/prices/history?item=bread");
  });

  it("lanza si no es ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("e", { status: 500 }));
    await expect(fetchPriceHistory("x")).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Implementar el hook**

`src/lib/client/use-price-history.ts`:
```ts
"use client";
import { useQuery } from "@tanstack/react-query";
import type { PricePoint } from "@/lib/db/price-store";

export interface PriceHistory {
  item: string;
  points: PricePoint[];
}

export async function fetchPriceHistory(item: string): Promise<PriceHistory> {
  const res = await fetch(`/api/prices/history?item=${encodeURIComponent(item)}`);
  if (!res.ok) throw new Error(`Error al cargar el histórico (HTTP ${res.status})`);
  return (await res.json()) as PriceHistory;
}

export function usePriceHistory(item: string | null) {
  return useQuery({
    queryKey: ["price-history", item],
    queryFn: () => fetchPriceHistory(item as string),
    enabled: Boolean(item),
  });
}
```

- [ ] **Step 4: Hook de reduced-motion**

`src/lib/ui/use-reduced-motion.ts`:
```ts
"use client";
import { useEffect, useState } from "react";

/** true si el usuario prefiere movimiento reducido. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}
```

- [ ] **Step 5: Componente `price-trend.tsx`**

`src/components/market/price-trend.tsx`:
```tsx
"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Spinner } from "@/components/ui/spinner";
import { usePriceHistory } from "@/lib/client/use-price-history";
import { useReducedMotion } from "@/lib/ui/use-reduced-motion";
import { formatMoney } from "@/lib/format";

export function PriceTrend({ item }: { item: string }) {
  const { data, isLoading, isError } = usePriceHistory(item);
  const reduced = useReducedMotion();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
        <Spinner /> Cargando tendencia…
      </div>
    );
  }
  if (isError) return <p className="py-6 text-sm text-destructive">No se pudo cargar la tendencia.</p>;

  const points = (data?.points ?? []).map((p) => ({
    t: new Date(p.ts).toLocaleDateString("es", { day: "2-digit", month: "2-digit" }),
    price: p.price,
  }));

  if (points.length < 2) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        Aún no hay suficientes datos de <span className="font-mono">{item}</span>. El histórico se va
        llenando con cada snapshot.
      </p>
    );
  }

  const first = points[0].price;
  const last = points[points.length - 1].price;
  const summary = `Tendencia de ${item}: de ${formatMoney(first)} a ${formatMoney(last)} en ${points.length} puntos.`;

  return (
    <div role="img" aria-label={summary}>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="#232c3b" strokeDasharray="3 3" />
            <XAxis dataKey="t" stroke="#8b97a7" fontSize={12} />
            <YAxis stroke="#8b97a7" fontSize={12} />
            <Tooltip
              contentStyle={{ background: "#121822", border: "1px solid #232c3b", borderRadius: 8, color: "#e6edf3" }}
              formatter={(v: number) => formatMoney(v)}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              isAnimationActive={!reduced}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Test de `PriceTrend` (estado "sin datos")**

`src/components/market/price-trend.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PriceTrend } from "./price-trend";

afterEach(() => vi.restoreAllMocks());

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("PriceTrend", () => {
  it("muestra mensaje cuando hay menos de 2 puntos", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ item: "bread", points: [{ ts: 1000, price: 1.5 }] })),
    );
    render(wrap(<PriceTrend item="bread" />));
    expect(await screen.findByText(/Aún no hay suficientes datos/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Correr (pasan) + tsc**

Run: `npx vitest run src/lib/client/use-price-history.test.ts src/components/market/price-trend.test.tsx` → PASS.
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/lib/client/use-price-history.ts src/lib/client/use-price-history.test.ts src/lib/ui/use-reduced-motion.ts src/components/market/ package.json package-lock.json
git commit -m "feat(ui): add price history hook and trend chart"
```

---

### Task 6: Integrar la tendencia en `/market`

**Files:**
- Modify: `src/app/market/page.tsx`

- [ ] **Step 1: Hacer las filas seleccionables y mostrar el gráfico**

En `src/app/market/page.tsx`:
1. Importar el gráfico y `useState` ya está: `import { PriceTrend } from "@/components/market/price-trend";`
2. Agregar estado de selección: `const [selected, setSelected] = useState<string | null>(null);`
3. Hacer cada `<tr>` de item clickeable (seleccceiona el item). Reemplazar la fila del `tbody` por:
```tsx
                <tr
                  key={r.item}
                  onClick={() => setSelected((s) => (s === r.item ? null : r.item))}
                  className={`cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-surface-2 ${
                    selected === r.item ? "bg-surface-2" : ""
                  }`}
                >
                  <td className="px-4 py-2.5 font-mono">{r.item}</td>
                  <td className="tabular px-4 py-2.5 text-right">{formatMoney(r.price)}</td>
                </tr>
```
4. Encima de la `<Card>` de la tabla (o debajo del buscador), cuando hay selección, mostrar el gráfico:
```tsx
      {selected ? (
        <Card className="mb-4 cursor-default">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Tendencia · <span className="font-mono normal-case">{selected}</span>
          </h2>
          <PriceTrend item={selected} />
        </Card>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">Tocá un item para ver su tendencia.</p>
      )}
```
(Insertar ese bloque entre el buscador y la tabla. Mantener el resto igual. Quitar el texto "Las tendencias históricas llegan en el Plan 3." del pie de la tabla.)

- [ ] **Step 2: tsc + build**

Run: `./node_modules/.bin/tsc --noEmit` → exit 0.
Run: `npm run build` → compila.

- [ ] **Step 3: Commit**

```bash
git add src/app/market/page.tsx
git commit -m "feat(ui): show price trend chart on item selection in market"
```

---

### Task 7: Script recolector manual + cron

**Files:**
- Create: `scripts/collect.ts`
- Modify: `package.json`

- [ ] **Step 1: Implementar el script**

`scripts/collect.ts`:
```ts
/**
 * Toma un snapshot de precios y lo guarda en el histórico (SQLite).
 * Uso local: `npm run collect`. Programalo con el cron de tu SO cada 15–30 min,
 * o al desplegar usá Vercel Cron apuntando a /api/cron/collect-prices.
 */
import { WareraClient } from "../src/lib/warera/client";
import { collectPrices } from "../src/server/collect-prices";
import { getPriceStore } from "../src/lib/db/get-price-store";

async function main() {
  const n = await collectPrices(new WareraClient(), getPriceStore());
  console.log(`Snapshot guardado: ${n} items @ ${new Date().toISOString()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Añadir el script a package.json**

En `"scripts"` agregar:
```json
"collect": "tsx scripts/collect.ts"
```

- [ ] **Step 3: Probar en vivo**

Run: `npm run collect`
Expected: imprime "Snapshot guardado: N items @ ...". Correr dos veces (con unos segundos de diferencia) para tener ≥2 puntos.
Run (verificación): `npm run collect` otra vez.
Expected: crea `data/prices.db` (ignorado por git).

- [ ] **Step 4: tsc**

Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/collect.ts package.json
git commit -m "feat: add manual price collection script"
```

---

## Verificación final del Plan 3

- [ ] `npm test` → todos verdes (Plan 1–5 + nuevos: price-store, collect-prices, cron route, history route, use-price-history, price-trend).
- [ ] `./node_modules/.bin/tsc --noEmit` → exit 0.
- [ ] `npm run build` → compila; rutas nuevas `/api/cron/collect-prices`, `/api/prices/history`.
- [ ] Flujo en vivo:
  - `npm run collect` dos veces (separadas) → `data/prices.db` con ≥2 snapshots.
  - `npm run dev` → `/market` → tocar un item (p.ej. `steel`) → aparece el gráfico de tendencia con los puntos recolectados.
  - `GET /api/prices/history?item=steel` → devuelve los puntos.
  - `GET /api/cron/collect-prices` (sin CRON_SECRET en dev) → `{ ok:true, collected:N }`.
- [ ] Verificación visual con Playwright del gráfico en `/market` (desktop + mobile), con `prefers-reduced-motion` respetado.

## Notas / despliegue

- **Cron en producción:** al desplegar en Vercel, configurar Vercel Cron (`vercel.json`) apuntando a `/api/cron/collect-prices` cada 15–30 min y setear `CRON_SECRET` (Vercel manda el header automáticamente). Localmente, programar `npm run collect` con el Programador de tareas de Windows / cron.
- **Escala a Postgres:** implementar `PriceHistoryStore` con Postgres y cambiar solo `get-price-store.ts`. El resto (servicio, endpoints, UI) no cambia.
- **Calibración (pendiente, transversal):** comparar `netProfit` estimado vs `transaction.getPaginatedTransactions` reales; fijar `productionToUnitsPerDay` y `calibrated:true`. Modelar el efecto de automatización (empresas con 0 trabajadores y alta producción, p.ej. steel/iron de BebetoSan).
```
