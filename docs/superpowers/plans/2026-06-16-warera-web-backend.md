# WarEra Company Manager — Plan 2: Backend web (proxy, caché, auth, endpoints de cálculo)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exponer el motor económico del Plan 1 a través de un backend Next.js: un proxy read-only con allow-list (resuelve el CORS), caché compartida de datos globales, soporte de autenticación por API token (header `X-API-Key`, reenviado por-petición, nunca persistido en el servidor), y endpoints de cálculo (`/api/report`, `/api/optimizer`, `/api/prices`) listos para que los consuma la UI.

**Architecture:** Route Handlers del App Router de Next.js. Un proxy genérico `/api/warera/[...proc]` reenvía solo procedimientos tRPC permitidos a `api2.warera.io` añadiendo `Origin` y, si el cliente lo manda, `X-API-Key`. Una caché TTL en memoria cubre datos globales (precios, gameConfig). Servicios server-side (`src/server/*`) combinan el `WareraClient` (Plan 1) con el motor `src/lib/economy` (Plan 1) para devolver reportes ya calculados. Un rate-limiter de ventana fija protege nuestros endpoints.

**Tech Stack:** Next.js 16 (App Router, Route Handlers), TypeScript, Zod, Vitest. Reusa `src/lib/warera` y `src/lib/economy` del Plan 1.

Spec: `docs/superpowers/specs/2026-06-16-warera-company-manager-design.md` (§3 arquitectura, §5 caché, §6 seguridad). Decisión confirmada: token en `sessionStorage` del cliente, enviado por-petición como `X-API-Key`, nunca guardado en el servidor.

---

## Decisiones de diseño de este plan

- **Auth opcional.** Sin token: solo datos públicos; los salarios se cuentan como 0 y el reporte se marca `estimated`/`wagesAvailable:false`. Con token: el proxy reenvía `X-API-Key` y `worker.getWorkers` funciona.
- **El token NUNCA toca disco ni logs del servidor.** El proxy lo lee del header de la petición entrante y lo reenvía; no lo cachea (la caché ignora peticiones autenticadas) ni lo registra.
- **Caché solo para datos globales** (precios, gameConfig). Datos por-usuario y peticiones con token NO se cachean.
- **`WareraClient` se extiende, no se reescribe.** Se añade auth y métodos nuevos manteniendo las firmas existentes del Plan 1.

## Estructura de archivos (Plan 2)

- `src/lib/warera/schemas.ts` — MOD: añadir `gameConfigSchema`, `userLiteSchema` (Task 2, 3)
- `src/lib/warera/client.ts` — MOD: soporte `apiKey` + `getGameConfig`, `getUserLite` (Task 1, 2, 3)
- `src/lib/cache/ttl-cache.ts` — NEW: caché TTL en memoria (Task 4)
- `src/lib/warera/allowlist.ts` — NEW: allow-list de procedimientos (Task 5)
- `src/lib/server/rate-limit.ts` — NEW: rate-limiter de ventana fija (Task 6)
- `src/app/api/warera/[...proc]/route.ts` — NEW: proxy genérico (Task 7)
- `src/lib/economy/item-def.ts` — NEW: `toItemDef` (coerción gameConfig→ItemDef) (Task 8)
- `src/server/portfolio.ts` — NEW: servicio de reporte de cartera (Task 9)
- `src/app/api/report/route.ts` — NEW: endpoint de reporte (Task 10)
- `src/server/optimizer.ts` + `src/app/api/optimizer/route.ts` — NEW: optimizador (Task 11)
- `src/app/api/prices/route.ts` — NEW: precios cacheados (Task 12)
- `scripts/profit.ts` — MOD: usar `getGameConfig` tipado (Task 13, limpieza)

Tests junto a cada módulo: `*.test.ts`.

**Nota de entorno:** typecheck con `./node_modules/.bin/tsc --noEmit` (en esta máquina `npx tsc` puede traer un paquete viejo). Tests: `npm test` (suite completa) y `npx vitest run <path>` (un archivo). Cada commit usa el mensaje indicado.

---

### Task 1: `WareraClient` con soporte de API token (`X-API-Key`)

**Files:**
- Modify: `src/lib/warera/client.ts`
- Test: `src/lib/warera/client.test.ts` (añadir casos)

- [ ] **Step 1: Añadir tests del header de auth**

Añadir al final del `describe("WareraClient", ...)` en `src/lib/warera/client.test.ts`:

```ts
  it("envía X-API-Key cuando se construye con apiKey", async () => {
    const spy = mockFetchOnce({ grain: 0.1 });
    const client = new WareraClient({ apiKey: "secret-token" });
    await client.getPrices();
    const opts = spy.mock.calls[0][1] as RequestInit;
    const headers = opts.headers as Record<string, string>;
    expect(headers["X-API-Key"]).toBe("secret-token");
  });

  it("no envía X-API-Key cuando no hay apiKey", async () => {
    const spy = mockFetchOnce({ grain: 0.1 });
    const client = new WareraClient();
    await client.getPrices();
    const opts = spy.mock.calls[0][1] as RequestInit;
    const headers = opts.headers as Record<string, string>;
    expect(headers["X-API-Key"]).toBeUndefined();
  });
```

- [ ] **Step 2: Correr los tests (deben fallar)**

Run: `npx vitest run src/lib/warera/client.test.ts`
Expected: FAIL (constructor no acepta `{ apiKey }`; header no existe).

- [ ] **Step 3: Modificar el cliente**

En `src/lib/warera/client.ts`, reemplazar el constructor y el método `call`:

```ts
export interface WareraClientOptions {
  baseUrl?: string;
  /** API token de WarEra (Settings → API Tokens). Se envía como header X-API-Key. */
  apiKey?: string;
}

export class WareraClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(opts: WareraClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE;
    this.apiKey = opts.apiKey;
  }

  /** Llama un procedimiento tRPC por GET y valida la respuesta. */
  private async call<T extends z.ZodTypeAny>(
    proc: string,
    dataSchema: T,
    input?: unknown,
  ): Promise<z.infer<T>> {
    let url = `${this.baseUrl}/${proc}`;
    if (input !== undefined) {
      url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
    }
    const headers: Record<string, string> = {
      Origin: ORIGIN,
      "User-Agent": "Mozilla/5.0",
    };
    if (this.apiKey) headers["X-API-Key"] = this.apiKey;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`WarEra API ${proc} failed: HTTP ${res.status}`);
    }
    const json = await res.json();
    return trpcEnvelope(dataSchema).parse(json);
  }
```

(El resto de los métodos `getPrices`, `getCompanyById`, etc. quedan igual.)

- [ ] **Step 4: Correr los tests (deben pasar) y la suite completa**

Run: `npx vitest run src/lib/warera/client.test.ts` → PASS
Run: `npm test` → todos verdes (los tests existentes que usan `new WareraClient()` siguen funcionando porque el arg es opcional).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/warera/client.ts src/lib/warera/client.test.ts
git commit -m "feat(warera): support API token via X-API-Key header"
```

---

### Task 2: `gameConfigSchema` + `getGameConfig()`

**Files:**
- Modify: `src/lib/warera/schemas.ts`, `src/lib/warera/client.ts`
- Test: `src/lib/warera/schemas.test.ts`, `src/lib/warera/client.test.ts`

- [ ] **Step 1: Test del schema**

Añadir a `src/lib/warera/schemas.test.ts`:

```ts
import { gameConfigSchema } from "./schemas";

describe("gameConfigSchema", () => {
  it("extrae items con defaults tolerantes", () => {
    const gc = gameConfigSchema.parse({
      items: {
        bread: { type: "product", productionPoints: 1, productionNeeds: { grain: 2 } },
        grain: { type: "raw" },
        extraTop: "ignorado",
      },
    });
    expect(gc.items.bread.productionNeeds.grain).toBe(2);
    // grain sin productionPoints/needs → defaults
    expect(gc.items.grain.productionPoints).toBe(1);
    expect(gc.items.grain.productionNeeds).toEqual({});
  });
});
```

- [ ] **Step 2: Test del método del cliente**

Añadir a `src/lib/warera/client.test.ts`:

```ts
  it("getGameConfig parsea items", async () => {
    mockFetchOnce({ items: { bread: { type: "product", productionPoints: 1, productionNeeds: {} } } });
    const client = new WareraClient();
    const gc = await client.getGameConfig();
    expect(gc.items.bread.type).toBe("product");
  });
```

- [ ] **Step 3: Correr (deben fallar)**

Run: `npx vitest run src/lib/warera/schemas.test.ts src/lib/warera/client.test.ts`
Expected: FAIL (no existen `gameConfigSchema` ni `getGameConfig`).

- [ ] **Step 4: Implementar el schema**

Añadir a `src/lib/warera/schemas.ts`:

```ts
/** Un item dentro de gameConfig.items. Tolerante; normaliza campos de producción. */
export const gameItemSchema = z
  .object({
    type: z.string().default("product"),
    productionPoints: z.number().default(1),
    productionNeeds: z.record(z.string(), z.number()).default({}),
  })
  .passthrough();

/** gameConfig.getGameConfig → { items: { code: gameItem } }. */
export const gameConfigSchema = z
  .object({
    items: z.record(z.string(), gameItemSchema).default({}),
  })
  .passthrough();
```

- [ ] **Step 5: Implementar el método**

Añadir a la clase en `src/lib/warera/client.ts` (importando `gameConfigSchema`):

```ts
  getGameConfig() {
    return this.call("gameConfig.getGameConfig", gameConfigSchema);
  }
```

Y agregar `gameConfigSchema` al import desde `./schemas`.

- [ ] **Step 6: Correr (deben pasar) + suite + tsc**

Run: `npx vitest run src/lib/warera/schemas.test.ts src/lib/warera/client.test.ts` → PASS
Run: `npm test` → verde; `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/warera/schemas.ts src/lib/warera/schemas.test.ts src/lib/warera/client.ts src/lib/warera/client.test.ts
git commit -m "feat(warera): add typed getGameConfig"
```

---

### Task 3: `userLiteSchema` + `getUserLite()` (para derivar el país)

**Files:**
- Modify: `src/lib/warera/schemas.ts`, `src/lib/warera/client.ts`
- Test: `src/lib/warera/schemas.test.ts`, `src/lib/warera/client.test.ts`

- [ ] **Step 1: Test del schema**

Añadir a `src/lib/warera/schemas.test.ts`:

```ts
import { userLiteSchema } from "./schemas";

describe("userLiteSchema", () => {
  it("parsea id, username y country tolerando extras", () => {
    const u = userLiteSchema.parse({
      _id: "u1",
      username: "majima",
      country: "co1",
      skills: { production: { level: 3 } },
    });
    expect(u._id).toBe("u1");
    expect(u.country).toBe("co1");
  });

  it("acepta country ausente", () => {
    const u = userLiteSchema.parse({ _id: "u2", username: "x" });
    expect(u.country).toBeUndefined();
  });
});
```

- [ ] **Step 2: Test del cliente**

Añadir a `src/lib/warera/client.test.ts`:

```ts
  it("getUserLite envía userId y parsea", async () => {
    const spy = mockFetchOnce({ _id: "u1", username: "majima", country: "co1" });
    const client = new WareraClient();
    const u = await client.getUserLite("u1");
    expect(u.country).toBe("co1");
    const calledUrl = spy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("user.getUserLite");
    expect(calledUrl).toContain(encodeURIComponent(JSON.stringify({ userId: "u1" })));
  });
```

- [ ] **Step 3: Correr (deben fallar)**

Run: `npx vitest run src/lib/warera/schemas.test.ts src/lib/warera/client.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar schema**

Añadir a `src/lib/warera/schemas.ts`:

```ts
/** user.getUserLite → datos básicos del usuario (incluye su country id). */
export const userLiteSchema = z
  .object({
    _id: z.string(),
    username: z.string(),
    country: z.string().optional(),
  })
  .passthrough();
```

- [ ] **Step 5: Implementar método**

Añadir a la clase (e importar `userLiteSchema`):

```ts
  getUserLite(userId: string) {
    return this.call("user.getUserLite", userLiteSchema, { userId });
  }
```

- [ ] **Step 6: Correr + suite + tsc**

Run: `npx vitest run src/lib/warera/schemas.test.ts src/lib/warera/client.test.ts` → PASS
Run: `npm test` → verde; `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/warera/schemas.ts src/lib/warera/schemas.test.ts src/lib/warera/client.ts src/lib/warera/client.test.ts
git commit -m "feat(warera): add getUserLite to derive user country"
```

---

### Task 4: Caché TTL en memoria

**Files:**
- Create: `src/lib/cache/ttl-cache.ts`
- Test: `src/lib/cache/ttl-cache.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { TtlCache } from "./ttl-cache";

afterEach(() => vi.useRealTimers());

describe("TtlCache", () => {
  it("getOrLoad ejecuta el loader una vez y cachea", async () => {
    const cache = new TtlCache(1000);
    const loader = vi.fn().mockResolvedValue(42);
    expect(await cache.getOrLoad("k", loader)).toBe(42);
    expect(await cache.getOrLoad("k", loader)).toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("recarga después de expirar el TTL", async () => {
    vi.useFakeTimers();
    const cache = new TtlCache(1000);
    const loader = vi.fn().mockResolvedValueOnce("a").mockResolvedValueOnce("b");
    expect(await cache.getOrLoad("k", loader)).toBe("a");
    vi.advanceTimersByTime(1001);
    expect(await cache.getOrLoad("k", loader)).toBe("b");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("claves distintas se cachean por separado", async () => {
    const cache = new TtlCache(1000);
    expect(await cache.getOrLoad("a", async () => 1)).toBe(1);
    expect(await cache.getOrLoad("b", async () => 2)).toBe(2);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/lib/cache/ttl-cache.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

```ts
interface Entry<V> {
  value: V;
  expiresAt: number;
}

/** Caché en memoria con expiración por TTL (ms). Pensada para datos globales. */
export class TtlCache {
  private store = new Map<string, Entry<unknown>>();

  constructor(private ttlMs: number) {}

  /** Devuelve el valor cacheado vigente, o ejecuta y cachea `loader`. */
  async getOrLoad<V>(key: string, loader: () => Promise<V>): Promise<V> {
    const hit = this.store.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value as V;
    }
    const value = await loader();
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }

  clear(): void {
    this.store.clear();
  }
}
```

- [ ] **Step 4: Correr (debe pasar)**

Run: `npx vitest run src/lib/cache/ttl-cache.test.ts` → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cache/
git commit -m "feat(cache): add in-memory TTL cache"
```

---

### Task 5: Allow-list de procedimientos del proxy

**Files:**
- Create: `src/lib/warera/allowlist.ts`
- Test: `src/lib/warera/allowlist.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect } from "vitest";
import { isAllowedProc, isCacheableProc, ALLOWED_PROCS } from "./allowlist";

describe("allowlist", () => {
  it("permite procedimientos read-only conocidos", () => {
    expect(isAllowedProc("itemTrading.getPrices")).toBe(true);
    expect(isAllowedProc("company.getById")).toBe(true);
    expect(isAllowedProc("worker.getWorkers")).toBe(true);
  });

  it("rechaza procedimientos no listados", () => {
    expect(isAllowedProc("company.delete")).toBe(false);
    expect(isAllowedProc("admin.doStuff")).toBe(false);
    expect(isAllowedProc("")).toBe(false);
  });

  it("marca como cacheables solo los datos globales", () => {
    expect(isCacheableProc("itemTrading.getPrices")).toBe(true);
    expect(isCacheableProc("gameConfig.getGameConfig")).toBe(true);
    expect(isCacheableProc("company.getById")).toBe(false);
  });

  it("ALLOWED_PROCS no está vacío", () => {
    expect(ALLOWED_PROCS.size).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/lib/warera/allowlist.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
/**
 * Allow-list de procedimientos tRPC read-only que el proxy puede reenviar.
 * Cualquier proc fuera de esta lista se rechaza (defensa en profundidad).
 */
export const ALLOWED_PROCS: ReadonlySet<string> = new Set([
  "itemTrading.getPrices",
  "gameConfig.getGameConfig",
  "company.getCompanies",
  "company.getById",
  "country.getCountryById",
  "country.getAllCountries",
  "user.getUserLite",
  "user.getUsersByCountry",
  "worker.getWorkers",
  "workOffer.getWorkOfferByCompanyId",
  "workOffer.getWorkOffersPaginated",
  "upgrade.getUpgradeByTypeAndEntity",
  "transaction.getPaginatedTransactions",
]);

/** Datos globales (no dependen del usuario) → cacheables en el servidor. */
const CACHEABLE_PROCS: ReadonlySet<string> = new Set([
  "itemTrading.getPrices",
  "gameConfig.getGameConfig",
  "country.getAllCountries",
]);

export function isAllowedProc(proc: string): boolean {
  return ALLOWED_PROCS.has(proc);
}

export function isCacheableProc(proc: string): boolean {
  return CACHEABLE_PROCS.has(proc);
}
```

- [ ] **Step 4: Correr (debe pasar)**

Run: `npx vitest run src/lib/warera/allowlist.test.ts` → PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/warera/allowlist.ts src/lib/warera/allowlist.test.ts
git commit -m "feat(warera): add proxy allow-list of read-only procedures"
```

---

### Task 6: Rate-limiter de ventana fija

**Files:**
- Create: `src/lib/server/rate-limit.ts`
- Test: `src/lib/server/rate-limit.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { RateLimiter } from "./rate-limit";

afterEach(() => vi.useRealTimers());

describe("RateLimiter", () => {
  it("permite hasta el límite y luego bloquea", () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.allow("ip1")).toBe(true);
    expect(rl.allow("ip1")).toBe(true);
    expect(rl.allow("ip1")).toBe(false);
  });

  it("reinicia la ventana tras el periodo", () => {
    vi.useFakeTimers();
    const rl = new RateLimiter(1, 1000);
    expect(rl.allow("ip1")).toBe(true);
    expect(rl.allow("ip1")).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(rl.allow("ip1")).toBe(true);
  });

  it("cuenta por clave de forma independiente", () => {
    const rl = new RateLimiter(1, 1000);
    expect(rl.allow("a")).toBe(true);
    expect(rl.allow("b")).toBe(true);
    expect(rl.allow("a")).toBe(false);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/lib/server/rate-limit.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
interface Window {
  count: number;
  resetAt: number;
}

/** Rate-limiter de ventana fija en memoria. Clave típica: IP del cliente. */
export class RateLimiter {
  private windows = new Map<string, Window>();

  constructor(private limit: number, private windowMs: number) {}

  /** Devuelve true si la petición está permitida (y la contabiliza). */
  allow(key: string): boolean {
    const now = Date.now();
    const w = this.windows.get(key);
    if (!w || w.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (w.count >= this.limit) return false;
    w.count++;
    return true;
  }
}
```

- [ ] **Step 4: Correr (debe pasar)**

Run: `npx vitest run src/lib/server/rate-limit.test.ts` → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/rate-limit.ts src/lib/server/rate-limit.test.ts
git commit -m "feat(server): add fixed-window rate limiter"
```

---

### Task 7: Proxy genérico `/api/warera/[...proc]`

**Files:**
- Create: `src/app/api/warera/[...proc]/route.ts`
- Test: `src/app/api/warera/[...proc]/route.test.ts`

- [ ] **Step 1: Escribir el test (fetch mockeado)**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { GET } from "./route";

function ctx(proc: string[]) {
  return { params: Promise.resolve({ proc }) };
}
function mockUpstream(data: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify({ result: { data } }), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}
afterEach(() => vi.restoreAllMocks());

describe("proxy /api/warera/[...proc]", () => {
  it("reenvía un proc permitido y devuelve la data upstream", async () => {
    const spy = mockUpstream({ grain: 0.1 });
    const req = new Request("http://localhost/api/warera/itemTrading.getPrices");
    const res = await GET(req, ctx(["itemTrading.getPrices"]));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.grain).toBe(0.1);
    // upstream recibió el Origin correcto
    const opts = spy.mock.calls[0][1] as RequestInit;
    expect((opts.headers as Record<string, string>)["Origin"]).toBe("https://app.warera.io");
  });

  it("rechaza un proc no permitido con 403 sin llamar upstream", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const req = new Request("http://localhost/api/warera/admin.deleteEverything");
    const res = await GET(req, ctx(["admin.deleteEverything"]));
    expect(res.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });

  it("reenvía X-API-Key del request entrante al upstream", async () => {
    const spy = mockUpstream({ ok: true });
    const req = new Request("http://localhost/api/warera/worker.getWorkers?input=%7B%7D", {
      headers: { "X-API-Key": "tok" },
    });
    await GET(req, ctx(["worker.getWorkers"]));
    const opts = spy.mock.calls[0][1] as RequestInit;
    expect((opts.headers as Record<string, string>)["X-API-Key"]).toBe("tok");
  });

  it("propaga el input query-string al upstream", async () => {
    const spy = mockUpstream({ ok: true });
    const input = encodeURIComponent(JSON.stringify({ companyId: "c1" }));
    const req = new Request(`http://localhost/api/warera/company.getById?input=${input}`);
    await GET(req, ctx(["company.getById"]));
    const calledUrl = spy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("company.getById");
    expect(calledUrl).toContain(input);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run "src/app/api/warera/[...proc]/route.test.ts"`
Expected: FAIL (route no existe).

- [ ] **Step 3: Implementar el route handler**

```ts
import { isAllowedProc, isCacheableProc } from "@/lib/warera/allowlist";
import { TtlCache } from "@/lib/cache/ttl-cache";
import { RateLimiter } from "@/lib/server/rate-limit";

const UPSTREAM = "https://api2.warera.io/trpc";
const ORIGIN = "https://app.warera.io";

// Singletons por instancia (warm) de la función serverless.
const globalCache = new TtlCache(5 * 60 * 1000); // 5 min para datos globales
const limiter = new RateLimiter(120, 60 * 1000); // 120 req/min por IP

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ proc: string[] }> },
): Promise<Response> {
  const { proc: procParts } = await ctx.params;
  const proc = (procParts ?? []).join("/");

  if (!isAllowedProc(proc)) {
    return Response.json({ error: "Procedure not allowed" }, { status: 403 });
  }

  if (!limiter.allow(clientIp(req))) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const input = new URL(req.url).searchParams.get("input");
  let upstreamUrl = `${UPSTREAM}/${proc}`;
  if (input !== null) upstreamUrl += `?input=${encodeURIComponent(input)}`;

  const apiKey = req.headers.get("x-api-key") ?? undefined;

  const fetchUpstream = async (): Promise<{ status: number; body: string }> => {
    const headers: Record<string, string> = { Origin: ORIGIN, "User-Agent": "Mozilla/5.0" };
    if (apiKey) headers["X-API-Key"] = apiKey;
    const r = await fetch(upstreamUrl, { headers });
    return { status: r.status, body: await r.text() };
  };

  // Solo cacheamos datos globales y SOLO peticiones sin token (nunca cacheamos auth).
  let result: { status: number; body: string };
  if (isCacheableProc(proc) && !apiKey) {
    result = await globalCache.getOrLoad(upstreamUrl, fetchUpstream);
  } else {
    result = await fetchUpstream();
  }

  return new Response(result.body, {
    status: result.status,
    headers: { "content-type": "application/json" },
  });
}
```

- [ ] **Step 4: Correr (deben pasar) + suite + tsc**

Run: `npx vitest run "src/app/api/warera/[...proc]/route.test.ts"` → PASS (4 tests)
Run: `npm test` → verde; `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/warera/[...proc]/"
git commit -m "feat(api): add allow-listed read-only WarEra proxy with cache and rate limit"
```

---

### Task 8: `toItemDef` — coerción gameConfig → ItemDef

**Files:**
- Create: `src/lib/economy/item-def.ts`
- Test: `src/lib/economy/item-def.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect } from "vitest";
import { toItemDef } from "./item-def";

describe("toItemDef", () => {
  it("mapea un item de gameConfig a ItemDef con type válido", () => {
    const d = toItemDef("bread", { type: "product", productionPoints: 1, productionNeeds: { grain: 2 } });
    expect(d).toEqual({ code: "bread", type: "product", productionPoints: 1, productionNeeds: { grain: 2 } });
  });

  it("usa 'product' cuando el type es desconocido", () => {
    const d = toItemDef("weird", { type: "mystery", productionPoints: 3, productionNeeds: {} });
    expect(d.type).toBe("product");
  });

  it("aplica defaults para campos faltantes", () => {
    const d = toItemDef("x", { type: "raw", productionPoints: 1, productionNeeds: {} });
    expect(d.type).toBe("raw");
    expect(d.productionNeeds).toEqual({});
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/lib/economy/item-def.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
import type { ItemDef } from "./types";

const VALID_TYPES: ItemDef["type"][] = ["raw", "product", "case", "equipment", "weapon"];

interface RawItem {
  type: string;
  productionPoints: number;
  productionNeeds: Record<string, number>;
}

/** Convierte un item crudo de gameConfig en un ItemDef del dominio económico. */
export function toItemDef(code: string, raw: RawItem): ItemDef {
  const type = (VALID_TYPES as string[]).includes(raw.type)
    ? (raw.type as ItemDef["type"])
    : "product";
  return {
    code,
    type,
    productionPoints: raw.productionPoints,
    productionNeeds: raw.productionNeeds,
  };
}
```

- [ ] **Step 4: Correr (debe pasar)**

Run: `npx vitest run src/lib/economy/item-def.test.ts` → PASS (3 tests).

- [ ] **Step 5: Añadir al barrel y commit**

Añadir a `src/lib/economy/index.ts`:
```ts
export * from "./item-def";
```
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

```bash
git add src/lib/economy/item-def.ts src/lib/economy/item-def.test.ts src/lib/economy/index.ts
git commit -m "feat(economy): add toItemDef gameConfig coercion"
```

---

### Task 9: Servicio de reporte de cartera

**Files:**
- Create: `src/server/portfolio.ts`
- Test: `src/server/portfolio.test.ts`

- [ ] **Step 1: Escribir el test (con un cliente fake)**

```ts
import { describe, it, expect } from "vitest";
import { buildPortfolio } from "./portfolio";

// Cliente fake con la forma mínima que usa buildPortfolio.
function fakeClient(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getUserLite: async () => ({ _id: "u1", username: "me", country: "co1" }),
    getCountryById: async () => ({ taxes: { income: 0, market: 10, selfWork: 0 } }),
    getUserCompanies: async () => ({ items: ["c1"] }),
    getCompanyById: async () => ({
      _id: "c1",
      itemCode: "bread",
      production: 10,
      workerCount: 2,
      activeUpgradeLevels: { automatedEngine: 0, breakRoom: 0 },
    }),
    getWorkers: async () => [{ wage: 1 }, { wage: 2 }],
    getPrices: async () => ({ bread: 1.5, grain: 0.1 }),
    getGameConfig: async () => ({
      items: { bread: { type: "product", productionPoints: 1, productionNeeds: { grain: 2 } } },
    }),
    ...overrides,
  } as never;
}

describe("buildPortfolio", () => {
  it("arma el reporte con beneficio por empresa y total", async () => {
    const r = await buildPortfolio(fakeClient(), { userId: "u1", authenticated: true });
    expect(r.companies).toHaveLength(1);
    const c = r.companies[0];
    expect(c.itemCode).toBe("bread");
    // neto = 15 - 2 - 3 - 1.5 = 8.5
    expect(c.profit.netProfit).toBeCloseTo(8.5);
    expect(c.maxWageToHire).toBeCloseTo(c.hiring.maxWage);
    expect(r.totalNetProfit).toBeCloseTo(8.5);
    expect(r.wagesAvailable).toBe(true);
    expect(r.estimated).toBe(true); // game-constants sin calibrar
  });

  it("cuando worker.getWorkers falla (sin auth), salarios=0 y wagesAvailable=false", async () => {
    const client = fakeClient({
      getWorkers: async () => {
        throw new Error("HTTP 401");
      },
    });
    const r = await buildPortfolio(client, { userId: "u1", authenticated: false });
    expect(r.companies[0].profit.wageCost).toBe(0);
    expect(r.wagesAvailable).toBe(false);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/server/portfolio.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
import type { WareraClient } from "@/lib/warera/client";
import { companyProfit, hiringAnalysis, toItemDef } from "@/lib/economy";
import type { ProfitBreakdown } from "@/lib/economy";
import type { HiringResult } from "@/lib/economy";

export interface CompanyReport {
  id: string;
  itemCode: string;
  profit: ProfitBreakdown;
  hiring: HiringResult;
  /** Atajo: salario máximo a pagar por un trabajador extra. */
  maxWageToHire: number;
}

export interface Portfolio {
  userId: string;
  companies: CompanyReport[];
  totalNetProfit: number;
  /** true si se pudieron leer los salarios (requiere auth). */
  wagesAvailable: boolean;
  /** true si las cifras son estimadas (game-constants sin calibrar). */
  estimated: boolean;
}

export interface BuildPortfolioOptions {
  userId: string;
  /** Si el request traía API token (afecta el flag wagesAvailable por defecto). */
  authenticated: boolean;
}

/**
 * Construye el reporte de cartera de un usuario: por cada empresa calcula
 * beneficio/día y análisis de contratación, usando precios + recetas globales.
 */
export async function buildPortfolio(
  client: WareraClient,
  opts: BuildPortfolioOptions,
): Promise<Portfolio> {
  const [prices, gameConfig, user, companyList] = await Promise.all([
    client.getPrices(),
    client.getGameConfig(),
    client.getUserLite(opts.userId),
    client.getUserCompanies(opts.userId),
  ]);

  const taxes = user.country
    ? (await client.getCountryById(user.country)).taxes
    : { income: 0, market: 0, selfWork: 0 };

  let wagesAvailable = true;
  const companies: CompanyReport[] = [];

  for (const companyId of companyList.items) {
    const c = await client.getCompanyById(companyId);

    let workers: { wage: number }[] = [];
    try {
      workers = await client.getWorkers(companyId);
    } catch {
      wagesAvailable = false;
    }

    const rawItem = gameConfig.items[c.itemCode] ?? {
      type: "product",
      productionPoints: 1,
      productionNeeds: {},
    };
    const item = toItemDef(c.itemCode, rawItem);

    const company = {
      id: c._id,
      itemCode: c.itemCode,
      production: c.production,
      workerCount: c.workerCount,
      upgrades: c.activeUpgradeLevels,
    };

    const profit = companyProfit({ company, item, workers, prices, taxes });
    const hiring = hiringAnalysis({ company, item, prices, taxes, candidateWage: 0 });

    companies.push({ id: c._id, itemCode: c.itemCode, profit, hiring, maxWageToHire: hiring.maxWage });
  }

  const totalNetProfit = companies.reduce((s, c) => s + c.profit.netProfit, 0);
  const estimated = companies.some((c) => c.profit.estimated);

  return { userId: opts.userId, companies, totalNetProfit, wagesAvailable, estimated };
}
```

- [ ] **Step 4: Correr (deben pasar) + tsc**

Run: `npx vitest run src/server/portfolio.test.ts` → PASS (2 tests)
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/server/portfolio.ts src/server/portfolio.test.ts
git commit -m "feat(server): add portfolio report service"
```

---

### Task 10: Endpoint `/api/report`

**Files:**
- Create: `src/app/api/report/route.ts`
- Test: `src/app/api/report/route.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";

// Mockeamos el servicio para aislar el route handler.
vi.mock("@/server/portfolio", () => ({
  buildPortfolio: vi.fn(),
}));
import { buildPortfolio } from "@/server/portfolio";
import { GET } from "./route";

afterEach(() => vi.restoreAllMocks());

describe("GET /api/report", () => {
  it("400 si falta userId", async () => {
    const res = await GET(new Request("http://localhost/api/report"));
    expect(res.status).toBe(400);
  });

  it("devuelve el portfolio para un userId válido", async () => {
    (buildPortfolio as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      userId: "u1",
      companies: [],
      totalNetProfit: 0,
      wagesAvailable: false,
      estimated: true,
    });
    const res = await GET(new Request("http://localhost/api/report?userId=u1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe("u1");
  });

  it("pasa authenticated=true cuando hay X-API-Key", async () => {
    const mock = buildPortfolio as unknown as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce({ userId: "u1", companies: [], totalNetProfit: 0, wagesAvailable: true, estimated: true });
    await GET(new Request("http://localhost/api/report?userId=u1", { headers: { "X-API-Key": "tok" } }));
    expect(mock).toHaveBeenCalledWith(expect.anything(), { userId: "u1", authenticated: true });
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/app/api/report/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
import { WareraClient } from "@/lib/warera/client";
import { buildPortfolio } from "@/server/portfolio";

export async function GET(req: Request): Promise<Response> {
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }

  const apiKey = req.headers.get("x-api-key") ?? undefined;
  const client = new WareraClient({ apiKey });

  try {
    const portfolio = await buildPortfolio(client, { userId, authenticated: Boolean(apiKey) });
    return Response.json(portfolio);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
```

- [ ] **Step 4: Correr (deben pasar) + tsc**

Run: `npx vitest run src/app/api/report/route.test.ts` → PASS (3 tests)
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/report/
git commit -m "feat(api): add /api/report endpoint"
```

---

### Task 11: Servicio + endpoint `/api/optimizer`

**Files:**
- Create: `src/server/optimizer.ts`, `src/app/api/optimizer/route.ts`
- Test: `src/server/optimizer.test.ts`, `src/app/api/optimizer/route.test.ts`

- [ ] **Step 1: Test del servicio**

```ts
import { describe, it, expect } from "vitest";
import { buildOptimizer } from "./optimizer";

function fakeClient() {
  return {
    getPrices: async () => ({ bread: 1.5, grain: 0.1, steel: 1.6, limestone: 0.08 }),
    getGameConfig: async () => ({
      items: {
        bread: { type: "product", productionPoints: 1, productionNeeds: { grain: 2 } },
        steel: { type: "product", productionPoints: 2, productionNeeds: { limestone: 1 } },
        grain: { type: "raw", productionPoints: 1, productionNeeds: {} },
      },
    }),
  } as never;
}

describe("buildOptimizer", () => {
  it("rankea por margen por punto de producción", async () => {
    const r = await buildOptimizer(fakeClient());
    expect(r.options[0].itemCode).toBe("bread"); // 1.3 > steel 0.76 > grain 0.1
    expect(r.options[0].marginPerPoint).toBeCloseTo(1.3);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/server/optimizer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar el servicio**

```ts
import type { WareraClient } from "@/lib/warera/client";
import { productionOptimizer, toItemDef } from "@/lib/economy";
import type { ProductionOption } from "@/lib/economy";

export interface OptimizerResult {
  options: ProductionOption[];
}

/** Calcula el ranking "mejor qué producir" usando precios + recetas globales. */
export async function buildOptimizer(client: WareraClient): Promise<OptimizerResult> {
  const [prices, gameConfig] = await Promise.all([client.getPrices(), client.getGameConfig()]);
  const items = Object.entries(gameConfig.items).map(([code, raw]) => toItemDef(code, raw));
  return { options: productionOptimizer({ items, prices }) };
}
```

- [ ] **Step 4: Correr el servicio (pasa)**

Run: `npx vitest run src/server/optimizer.test.ts` → PASS.

- [ ] **Step 5: Test del route handler**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("@/server/optimizer", () => ({ buildOptimizer: vi.fn() }));
import { buildOptimizer } from "@/server/optimizer";
import { GET } from "./route";

afterEach(() => vi.restoreAllMocks());

describe("GET /api/optimizer", () => {
  it("devuelve el ranking", async () => {
    (buildOptimizer as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      options: [{ itemCode: "bread", marginPerPoint: 1.3 }],
    });
    const res = await GET(new Request("http://localhost/api/optimizer"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.options[0].itemCode).toBe("bread");
  });
});
```

- [ ] **Step 6: Implementar el route handler**

`src/app/api/optimizer/route.ts`:

```ts
import { WareraClient } from "@/lib/warera/client";
import { buildOptimizer } from "@/server/optimizer";

export async function GET(): Promise<Response> {
  const client = new WareraClient();
  try {
    return Response.json(await buildOptimizer(client));
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
```

- [ ] **Step 7: Correr (todo pasa) + tsc**

Run: `npx vitest run src/server/optimizer.test.ts src/app/api/optimizer/route.test.ts` → PASS
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/server/optimizer.ts src/server/optimizer.test.ts src/app/api/optimizer/
git commit -m "feat(api): add /api/optimizer endpoint and service"
```

---

### Task 12: Endpoint `/api/prices` (precios cacheados)

**Files:**
- Create: `src/app/api/prices/route.ts`
- Test: `src/app/api/prices/route.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";

const getPrices = vi.fn();
vi.mock("@/lib/warera/client", () => ({
  WareraClient: vi.fn().mockImplementation(() => ({ getPrices })),
}));
import { GET } from "./route";

afterEach(() => vi.restoreAllMocks());

describe("GET /api/prices", () => {
  it("devuelve el mapa de precios", async () => {
    getPrices.mockResolvedValueOnce({ grain: 0.1, bread: 1.5 });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bread).toBe(1.5);
  });

  it("502 si el upstream falla", async () => {
    getPrices.mockRejectedValueOnce(new Error("HTTP 500"));
    const res = await GET();
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/app/api/prices/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
import { WareraClient } from "@/lib/warera/client";

export async function GET(): Promise<Response> {
  const client = new WareraClient();
  try {
    return Response.json(await client.getPrices());
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
```

- [ ] **Step 4: Correr (deben pasar) + tsc**

Run: `npx vitest run src/app/api/prices/route.test.ts` → PASS (2 tests)
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/prices/
git commit -m "feat(api): add /api/prices endpoint"
```

---

### Task 13: Limpieza — `scripts/profit.ts` usa `getGameConfig` tipado

**Files:**
- Modify: `scripts/profit.ts`

- [ ] **Step 1: Reemplazar el fetch crudo de gameConfig**

En `scripts/profit.ts`, eliminar el bloque del `fetch` crudo a `gameConfig.getGameConfig` (incluido el guard de status y el `Record<string, any>`) y reemplazarlo por el método tipado. La sección de obtención de items queda:

```ts
  const gameConfig = await client.getGameConfig();
  const itemDef = (code: string): ItemDef => {
    const raw = gameConfig.items[code] ?? { type: "product", productionPoints: 1, productionNeeds: {} };
    return toItemDef(code, raw);
  };
```

Actualizar los imports al inicio del archivo:

```ts
import { companyProfit, toItemDef } from "../src/lib/economy";
import type { ItemDef } from "../src/lib/economy";
```

(El resto del script no cambia.)

- [ ] **Step 2: Typecheck y prueba en vivo**

Run: `./node_modules/.bin/tsc --noEmit` → exit 0.
Run: `npm run profit -- 6a30f0e6a38931d3ab4ef9cc 6813b6d546e731854c7ac85c`
Expected: imprime el desglose por empresa igual que antes (con el aviso de salarios=0). Confirma que el `getGameConfig` tipado produce el mismo resultado.

- [ ] **Step 3: Commit**

```bash
git add scripts/profit.ts
git commit -m "refactor(profit-script): use typed getGameConfig"
```

---

## Verificación final del Plan 2

- [ ] `npm test` → todos los tests verdes (Plan 1 + nuevos: client auth, gameConfig, userLite, ttl-cache, allowlist, rate-limit, proxy, item-def, portfolio, report, optimizer, prices).
- [ ] `./node_modules/.bin/tsc --noEmit` → exit 0.
- [ ] `npm run dev` levanta y estos endpoints responden:
  - `GET /api/prices` → mapa de precios (datos reales).
  - `GET /api/optimizer` → ranking de producción.
  - `GET /api/report?userId=6a30f0e6a38931d3ab4ef9cc` → portfolio con `wagesAvailable:false` (sin token).
  - `GET /api/warera/itemTrading.getPrices` → proxy devuelve la data; `GET /api/warera/admin.x` → 403.

## Notas para los planes siguientes

- **Plan 3:** histórico de precios. El cron llamará `client.getPrices()` y guardará snapshots en DB; el endpoint `/api/prices/history` servirá tendencias.
- **Plan 4 (UI):** la app cliente guardará el token en `sessionStorage` y lo mandará como header `X-API-Key` a `/api/report`. Onboarding: resolver username → userId (investigar endpoint de búsqueda; si no existe, pedir el userId/URL de perfil). La UI consume `/api/report`, `/api/optimizer`, `/api/prices`.
- **Calibración:** comparar el `netProfit` del reporte contra `transaction.getPaginatedTransactions` reales para fijar `productionToUnitsPerDay` y poner `calibrated: true` en game-constants.
