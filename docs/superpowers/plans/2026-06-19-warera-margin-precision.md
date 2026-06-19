# WarEra Company Manager — Plan B: Precisión de márgenes (real medido + modelo)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el beneficio/día use la **producción real medida** (ventas reales/día de los últimos 7 días, que incluyen el aporte real de los trabajadores y su variabilidad) cuando hay token, y un **modelo** (automatización + trabajadores + bonus de producción del país) como respaldo; mostrar "real" vs "potencial".

**Architecture:** `assembleCompanyReport` calcula el **modelo** `(automatización + aporte trabajadores) × (1 + bonusPaís) × rateFactor` como `potentialRate`, y si recibe una `measuredRate` (ventas reales/día) la usa como `dailyProductionRate` (marcando `measured`). Los servicios miden el real con `realizedSalesPerDay` (ya existe; en el dashboard, en paralelo por empresa, solo con token) y traen el `productionBonus` del país. La UI muestra real vs potencial.

**Tech Stack:** Next.js 16, TypeScript, Zod, Vitest.

Spec: `docs/superpowers/specs/2026-06-19-margin-precision-design.md`.

---

## Decisiones
- Ventana real: **7 días**.
- `measuredRate` reemplaza al `sellPerDay` de `assembleCompanyReport` (mismo significado: ventas reales/día).
- Sin real → modelo; `estimated = !measured`.
- Bonus de **país** en el modelo; bonus de **depósito regional** fuera de alcance (anotado).

## Estructura de archivos
- `src/lib/warera/schemas.ts` (+test) — `productionBonus` en `countrySchema` (Task 1)
- `src/server/company-report.ts` (+test) — `productionBonus`/`measuredRate` in, `measured`/`potentialRate` out (Task 2)
- `src/server/portfolio.ts` (+test), `src/server/company-detail.ts` (+test) — medir real + bonus, paralelizar dashboard (Task 3)
- `src/components/dashboard/company-card.tsx` (+test), `src/app/company/[id]/page.tsx` — real vs potencial (Task 4)

**Entorno:** typecheck `./node_modules/.bin/tsc --noEmit`. Tests `npm test`. Build `npm run build`.

---

### Task 1: `productionBonus` del país

**Files:**
- Modify: `src/lib/warera/schemas.ts`, `src/lib/warera/schemas.test.ts`

- [ ] **Step 1: Test**

Añadir a `src/lib/warera/schemas.test.ts` (importar `countrySchema`):
```ts
import { countrySchema } from "./schemas";

describe("countrySchema productionBonus", () => {
  it("deriva productionBonus = productionPercent/100", () => {
    const c = countrySchema.parse({
      taxes: { market: 10 },
      strategicResources: { bonuses: { productionPercent: 20 } },
    });
    expect(c.taxes.market).toBe(10);
    expect(c.productionBonus).toBeCloseTo(0.2);
  });
  it("sin strategicResources → productionBonus 0", () => {
    const c = countrySchema.parse({ taxes: {} });
    expect(c.productionBonus).toBe(0);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/lib/warera/schemas.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

En `src/lib/warera/schemas.ts`, reemplazar `countrySchema` por (añade `strategicResources` y un transform que expone `taxes` + `productionBonus`):
```ts
const taxesSchema = z
  .object({
    income: z.number().default(0),
    market: z.number().default(0),
    selfWork: z.number().default(0),
  })
  .partial()
  .transform((t) => ({ income: t.income ?? 0, market: t.market ?? 0, selfWork: t.selfWork ?? 0 }))
  .default({ income: 0, market: 0, selfWork: 0 });

/** country.getCountryById -> impuestos + bonus de producción del país. */
export const countrySchema = z
  .object({
    taxes: taxesSchema,
    strategicResources: z
      .object({
        bonuses: z
          .object({ productionPercent: z.number().default(0) })
          .partial()
          .transform((b) => ({ productionPercent: b.productionPercent ?? 0 }))
          .default({ productionPercent: 0 }),
      })
      .partial()
      .transform((s) => ({ bonuses: s.bonuses ?? { productionPercent: 0 } }))
      .default({ bonuses: { productionPercent: 0 } }),
  })
  .passthrough()
  .transform((c) => ({ taxes: c.taxes, productionBonus: c.strategicResources.bonuses.productionPercent / 100 }));
```

- [ ] **Step 4: Correr (pasan) + suite + tsc**

Run: `npx vitest run src/lib/warera/schemas.test.ts` → PASS.
Run: `npm test` → verde (los consumidores usan `.taxes`, que sigue presente; `.productionBonus` es nuevo).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/warera/schemas.ts src/lib/warera/schemas.test.ts
git commit -m "feat(warera): derive country productionBonus"
```

---

### Task 2: `assembleCompanyReport` — modelo con bonus + tasa medida

**Files:**
- Modify: `src/server/company-report.ts`, `src/server/company-report.test.ts`

- [ ] **Step 1: Tests**

En `src/server/company-report.test.ts`, añadir (reusan el `company`/`bread`/`upgradesConfig` del archivo, con automatedEngine que dé 72):
```ts
  it("modelo aplica bonus de país (potentialRate) y marca estimated", () => {
    const r = assembleCompanyReport({
      company, item: bread, workers: [], prices, taxes, upgradesConfig,
      workerDailyOutput: 0, productionBonus: 0.25,
    });
    // modelo = (72 + 0) × 1.25 = 90
    expect(r.dailyProductionRate).toBeCloseTo(90);
    expect(r.potentialRate).toBeCloseTo(90);
    expect(r.measured).toBe(false);
    expect(r.profit.estimated).toBe(true);
  });

  it("con measuredRate usa el real y marca measured (no estimado)", () => {
    const r = assembleCompanyReport({
      company, item: bread, workers: [], prices, taxes, upgradesConfig,
      workerDailyOutput: 0, productionBonus: 0.25, measuredRate: 40,
    });
    expect(r.dailyProductionRate).toBe(40); // real
    expect(r.potentialRate).toBeCloseTo(90); // modelo, para comparar
    expect(r.measured).toBe(true);
    expect(r.profit.estimated).toBe(false);
  });
```
(Si en el archivo había un test que pasaba `sellPerDay` a `assembleCompanyReport`, renombrar ese arg a `measuredRate`. Los tests que NO pasan measuredRate/productionBonus siguen válidos: modelo = (auto+worker)×1×rateFactor como antes.)

- [ ] **Step 2: Correr (deben fallar)**

Run: `npx vitest run src/server/company-report.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

En `src/server/company-report.ts`:
1. En los args de `assembleCompanyReport`: quitar `sellPerDay?` (si existe) y añadir `productionBonus?: number;` y `measuredRate?: number;`.
2. Añadir a `CompanyReport`: `measured: boolean;` y `potentialRate: number;`.
3. Reemplazar el cálculo de la tasa y el profit:
```ts
  const automation = automationDailyProd(args.upgradesConfig, args.company.upgrades.automatedEngine);
  const potentialRate =
    (automation + (args.workerDailyOutput ?? 0)) * (1 + (args.productionBonus ?? 0)) * (args.rateFactor ?? 1);
  const dailyProductionRate = args.measuredRate ?? potentialRate;
  const measured = args.measuredRate != null;

  const profit = companyProfit({
    dailyProductionRate,
    sellPerDay: args.measuredRate, // si hay real, fija usefulRate y estimated=false
    item: args.item,
    prices: args.prices,
    taxes: args.taxes,
    wageCostPerDay,
  });
```
4. En el `return`, añadir `measured` y `potentialRate` (además de lo existente). `dailyProductionRate` ya está en el reporte.

- [ ] **Step 4: Mantener tsc verde — actualizar literales `CompanyReport`**

`measured`/`potentialRate` son requeridos nuevos en `CompanyReport`, así que cualquier literal `CompanyReport` en tests los necesita. Hay uno en `src/components/dashboard/company-card.test.tsx` (el fake `report()`): añadirle `measured: false,` y `potentialRate: 72,` (coherente con su `dailyProductionRate: 72`). (Los servicios que pasaban `sellPerDay` a `assembleCompanyReport` se ajustan en Task 3 — entre Task 2 y Task 3 puede quedar tsc rojo SOLO por esos servicios; el módulo `company-report` y `company-card.test` deben quedar bien acá.)

Run: `npx vitest run src/server/company-report.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/company-report.ts src/server/company-report.test.ts src/components/dashboard/company-card.test.tsx
git commit -m "feat(server): model production bonus + measured rate in report"
```

---

### Task 3: Servicios — medir real + bonus país (dashboard en paralelo)

**Files:**
- Modify: `src/server/company-detail.ts`, `src/server/company-detail.test.ts`, `src/server/portfolio.ts`, `src/server/portfolio.test.ts`

- [ ] **Step 1: `company-detail.ts` — real + bonus**

En `src/server/company-detail.ts`:
1. Importar `realizedSalesPerDay` de `./sell-rate` (ya se usa para `sellPerDay`).
2. Reemplazar el cómputo de `taxes` por capturar también el bonus:
```ts
  const country = user.country
    ? await client.getCountryById(user.country)
    : { taxes: { income: 0, market: 0, selfWork: 0 }, productionBonus: 0 };
  const taxes = country.taxes;
  const productionBonus = country.productionBonus;
```
3. La medición real (reusar lo de `sellPerDay` de 7B, renombrar a measuredRate):
```ts
  const measuredRate = opts.authenticated
    ? (await realizedSalesPerDay(client, opts.userId, c.itemCode, 7)) ?? undefined
    : undefined;
```
4. En la llamada a `assembleCompanyReport`, pasar `productionBonus` y `measuredRate` (en vez del viejo `sellPerDay`). Mantener `workerDailyOutput` y `rateFactor`.
5. `CompanyDetail.sellPerDay` (campo existente): setearlo a `measuredRate ?? null` (mantiene compatibilidad / lo usa la UI si hace falta).

- [ ] **Step 2: `company-detail.test.ts`**

El fake `getCountryById` debe devolver `{ taxes, productionBonus }`:
```ts
    getCountryById: async () => ({ taxes: { income: 0, market: 10, selfWork: 0 }, productionBonus: 0 }),
```
Y `getUserItemTransactions` (para `realizedSalesPerDay`) ya está en el fake. Añadir aserción:
```ts
    expect(typeof d.report.measured).toBe("boolean");
    expect(typeof d.report.potentialRate).toBe("number");
```

- [ ] **Step 3: `portfolio.ts` — real en paralelo + bonus**

Reescribir el bucle de empresas de `buildPortfolio` para (a) traer el bonus del país una vez y (b) procesar las empresas en **paralelo** midiendo el real con token:
```ts
  const country = user.country
    ? await client.getCountryById(user.country)
    : { taxes: { income: 0, market: 0, selfWork: 0 }, productionBonus: 0 };
  const taxes = country.taxes;
  const productionBonus = country.productionBonus;

  const results = await Promise.all(
    companyList.items.map(async (companyId) => {
      const c = await client.getCompanyById(companyId);
      let workers: { wage: number }[] = [];
      let workersOk = opts.authenticated;
      if (opts.authenticated) {
        try {
          workers = await client.getWorkers(companyId);
        } catch {
          workersOk = false;
        }
      }
      const rawItem = gameConfig.items[c.itemCode] ?? { type: "product", productionPoints: 1, productionNeeds: {} };
      const item = toItemDef(c.itemCode, rawItem);
      const company = {
        id: c._id, itemCode: c.itemCode, production: c.production, workerCount: c.workerCount,
        upgrades: c.activeUpgradeLevels, name: c.name ?? "", isFull: c.isFull ?? false, estimatedValue: c.estimatedValue ?? 0,
      };
      const measuredRate = opts.authenticated
        ? (await realizedSalesPerDay(client, opts.userId, c.itemCode, 7)) ?? undefined
        : undefined;
      const priceInfo = await priceTrendFor(opts.priceStore, c.itemCode, prices);
      const report = assembleCompanyReport({
        company, item, workers, prices, taxes,
        upgradesConfig: gameConfig.upgradesConfig,
        rateFactor: opts.rateFactor, productionBonus, measuredRate, priceInfo,
      });
      return { report, workersOk };
    }),
  );

  const companies = results.map((r) => r.report);
  const wagesAvailable = opts.authenticated && results.every((r) => r.workersOk);
  const totalNetProfit = companies.reduce((s, c) => s + c.profit.netProfit, 0);
  const estimated = companies.some((c) => c.profit.estimated);
```
(Importar `realizedSalesPerDay` de `./sell-rate`. Quitar el bucle `for` viejo y las variables mutables que reemplaza. `priceTrendFor` y `assembleCompanyReport` ya están importados.)

- [ ] **Step 4: `portfolio.test.ts`**

`getCountryById` fake → `{ taxes, productionBonus }`; `getUserItemTransactions` fake (si no estaba) → `async () => ({ items: [], nextCursor: null })` (sin ventas → measuredRate undefined → modelo). Las aserciones existentes (sin ventas, con bonus 0) siguen: `dailyProductionRate` = (automation+worker)×1×1. Añadir:
```ts
  it("usa la venta real como tasa cuando hay token y ventas", async () => {
    const client = fakeClient({
      getUserItemTransactions: async () => ({ items: [{ sellerId: "u1", quantity: 700, createdAt: new Date().toISOString() }], nextCursor: null }),
    });
    const r = await buildPortfolio(client, { userId: "u1", authenticated: true });
    // 700/7 = 100/día real
    expect(r.companies[0].dailyProductionRate).toBe(100);
    expect(r.companies[0].measured).toBe(true);
  });
```
(El `fakeClient` debe tener `getUserItemTransactions` por defecto devolviendo `{items:[],nextCursor:null}` para los demás tests.)

- [ ] **Step 5: Correr suite + tsc**

Run: `npm test` → verde.
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/company-detail.ts src/server/company-detail.test.ts src/server/portfolio.ts src/server/portfolio.test.ts
git commit -m "feat(server): measure real daily rate + country bonus (parallel in portfolio)"
```

---

### Task 4: UI — real vs potencial

**Files:**
- Modify: `src/components/dashboard/company-card.tsx`, `src/components/dashboard/company-card.test.tsx`, `src/app/company/[id]/page.tsx`

- [ ] **Step 1: `company-card.tsx` — etiqueta real/estimado + potencial**

En la línea de "Producción/día" del `<dl>`, reflejar si es real o estimado y mostrar el potencial cuando difiere. Reemplazar la fila de Producción/día por:
```tsx
          <dt>Producción/día {company.measured ? <span className="text-success">· real</span> : <span className="text-muted-foreground">· est.</span>}</dt>
          <dd className="tabular text-right text-foreground">{formatMoney(company.dailyProductionRate)}</dd>
          {company.measured && company.potentialRate > company.dailyProductionRate ? (
            <>
              <dt className="text-muted-foreground">Potencial/día</dt>
              <dd className="tabular text-right text-muted-foreground">{formatMoney(company.potentialRate)}</dd>
            </>
          ) : null}
```

- [ ] **Step 2: `company-card.test.tsx`**

El `report()` fake ya tiene `measured`/`potentialRate` (agregados en Task 2 para tsc). Añadir solo la aserción de la nueva fila:
```tsx
    expect(screen.getByText(/Producción\/día/)).toBeInTheDocument();
```

- [ ] **Step 3: `company/[id]/page.tsx` — desglose real/potencial**

En el `Breakdown`/header del detalle, junto al beneficio, mostrar la etiqueta. Donde hoy se muestra `{data.report.profit.estimated ? "estimado" : null}`, reemplazar por:
```tsx
                {data.report.measured ? (
                  <span className="ml-2 text-xs text-success">real · últimos 7d</span>
                ) : (
                  <span className="ml-2 text-xs text-muted-foreground">estimado (potencial)</span>
                )}
```
Y debajo del bloque de beneficio, si `measured` y `potentialRate > dailyProductionRate`, una línea:
```tsx
              {data.report.measured && data.report.potentialRate > data.report.dailyProductionRate ? (
                <p className="text-xs text-muted-foreground">
                  Potencial: {formatMoney(data.report.potentialRate)}/día ·
                  aprovechás {Math.round((data.report.dailyProductionRate / data.report.potentialRate) * 100)}%
                </p>
              ) : null}
```

- [ ] **Step 4: Correr tests + tsc + build**

Run: `npx vitest run src/components/dashboard/company-card.test.tsx` → PASS.
Run: `npm test` → verde; `./node_modules/.bin/tsc --noEmit` → exit 0; `npm run build` → compila.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/company-card.tsx src/components/dashboard/company-card.test.tsx "src/app/company/[id]/page.tsx"
git commit -m "feat(ui): show real vs potential daily rate"
```

---

## Verificación final del Plan B

- [ ] `npm test` → todos verdes (countrySchema, company-report measured/potential, servicios, UI).
- [ ] `./node_modules/.bin/tsc --noEmit` → exit 0; `npm run build` → compila.
- [ ] Flujo en vivo (BebetoSan, con token): el beneficio/día usa la **venta real** (etiqueta "real · 7d") y muestra el **potencial** + % de aprovechamiento; sin token, el **modelo** con bonus de país ("estimado").
- [ ] Verificación visual con Playwright (tarjeta + detalle: real vs potencial).

## Notas
- Bonus de **depósito regional** (raws) en el modelo: futuro (el real medido ya lo refleja).
- Si el dashboard se vuelve lento con muchas empresas, cachear `realizedSalesPerDay` (futuro).
