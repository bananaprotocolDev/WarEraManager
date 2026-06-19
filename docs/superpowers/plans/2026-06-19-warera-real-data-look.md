# WarEra Company Manager — Plan A: Datos reales + look

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar datos reales del juego —nombre de empresa, imagen del producto, rareza, almacén lleno y valor estimado— y rediseñar tarjetas y detalle para que se vea como una herramienta de verdad.

**Architecture:** Se amplían los schemas (`company.name`/`isFull`/`estimatedValue`, item `rarity`) y `assembleCompanyReport` los expone en `CompanyReport`. Dos componentes nuevos reutilizables: `ItemImage` (imagen real del producto con fallback) y `RarityBadge`. La tarjeta del dashboard y el header del detalle se rediseñan para usarlos. Imágenes vía `<img>` plano (sin config de Next ni costo de optimización).

**Tech Stack:** Next.js 16, TypeScript, Zod, Vitest, lucide-react.

Spec: `docs/superpowers/specs/2026-06-19-real-company-data-and-look-design.md`. (Precisión de márgenes = Plan B, aparte.)

---

## Decisiones

- Imágenes: `https://app.warera.io/images/items/{itemCode}.png` (público; 29/59 items, todos los raw/product). Fallback para los que falten.
- `<img>` plano (no `next/image`).
- Campos nuevos con defaults tolerantes (no rompen empresas/items sin ellos).

## Estructura de archivos

- `src/lib/warera/schemas.ts` (+test) — `name`/`isFull`/`estimatedValue` en company; `rarity` en item (Task 1)
- `src/lib/economy/types.ts`, `src/lib/economy/item-def.ts` (+test) — `rarity` en `ItemDef` (Task 1)
- `src/server/company-report.ts` (+test) — `name`/`rarity`/`isFull`/`estimatedValue` en `CompanyReport` (Task 2)
- `src/server/portfolio.ts`, `src/server/company-detail.ts` (+tests) — armar `ReportCompany` con los campos (Task 2)
- `src/components/item-image.tsx` (+test), `src/components/rarity-badge.tsx` (+test) — componentes (Task 3)
- `src/components/dashboard/company-card.tsx` (+test), `src/app/company/[id]/page.tsx` — UI (Task 4)

**Entorno:** typecheck `./node_modules/.bin/tsc --noEmit`. Tests `npm test`. Build `npm run build`.

---

### Task 1: Schemas + `rarity` en ItemDef

**Files:**
- Modify: `src/lib/warera/schemas.ts`, `src/lib/warera/schemas.test.ts`, `src/lib/economy/types.ts`, `src/lib/economy/item-def.ts`, `src/lib/economy/item-def.test.ts`

- [ ] **Step 1: Tests**

Añadir a `src/lib/warera/schemas.test.ts`:
```ts
import { companySchema as cSchema3, gameItemSchema as giSchema3 } from "./schemas";

describe("company name/isFull/estimatedValue + item rarity", () => {
  it("companySchema parsea name, isFull, estimatedValue (con defaults)", () => {
    const c = cSchema3.parse({
      _id: "c1", itemCode: "steel", production: 5, workerCount: 0,
      activeUpgradeLevels: { automatedEngine: 4, breakRoom: 1, storage: 2 },
      name: "METALES PESADOS CORP", isFull: true, estimatedValue: 555.6,
    });
    expect(c.name).toBe("METALES PESADOS CORP");
    expect(c.isFull).toBe(true);
    expect(c.estimatedValue).toBeCloseTo(555.6);
    const c2 = cSchema3.parse({ _id: "c2", itemCode: "oil", production: 1, workerCount: 0, activeUpgradeLevels: {} });
    expect(c2.name).toBe("");
    expect(c2.isFull).toBe(false);
    expect(c2.estimatedValue).toBe(0);
  });
  it("gameItemSchema parsea rarity (default common)", () => {
    expect(giSchema3.parse({ type: "product", productionPoints: 10, productionNeeds: { iron: 10 }, rarity: "uncommon" }).rarity).toBe("uncommon");
    expect(giSchema3.parse({ type: "raw", productionPoints: 1 }).rarity).toBe("common");
  });
});
```

Añadir a `src/lib/economy/item-def.test.ts`:
```ts
  it("propaga rarity (default common)", () => {
    expect(toItemDef("steel", { type: "product", productionPoints: 10, productionNeeds: {}, rarity: "uncommon" }).rarity).toBe("uncommon");
    expect(toItemDef("x", { type: "raw", productionPoints: 1, productionNeeds: {} }).rarity).toBe("common");
  });
```

- [ ] **Step 2: Correr (deben fallar)**

Run: `npx vitest run src/lib/warera/schemas.test.ts src/lib/economy/item-def.test.ts` → FAIL.

- [ ] **Step 3: `companySchema` — campos nuevos**

En `src/lib/warera/schemas.ts`, dentro de `companySchema` (junto a `_id`, `itemCode`, etc., antes del `.passthrough()`), añadir:
```ts
    name: z.string().default(""),
    isFull: z.boolean().default(false),
    estimatedValue: z.number().default(0),
```

- [ ] **Step 4: `gameItemSchema` — rarity**

En `gameItemSchema`, añadir el campo:
```ts
    rarity: z.string().default("common"),
```

- [ ] **Step 5: `ItemDef` + `toItemDef` — rarity (OPCIONAL)**

En `src/lib/economy/types.ts`, añadir a `ItemDef` un campo **opcional** (así los literales `ItemDef` existentes en tests no se rompen):
```ts
  /** Rareza del item (común/uncommon/...). Opcional; default "common" al consumir. */
  rarity?: string;
```
En `src/lib/economy/item-def.ts`, la firma `RawItem` añade `rarity?: string;` y `toItemDef` devuelve `rarity: raw.rarity ?? "common"`:
```ts
interface RawItem {
  type: string;
  productionPoints: number;
  productionNeeds: Record<string, number>;
  rarity?: string;
}
// en el return de toItemDef:
  return { code, type, productionPoints: raw.productionPoints, productionNeeds: raw.productionNeeds, rarity: raw.rarity ?? "common" };
```
Como `rarity` es opcional, NO hace falta tocar los literales `ItemDef` existentes (profit.test, hiring.test, optimizer.test, etc. siguen tipando).

- [ ] **Step 6: Correr (pasan) + suite + tsc**

Run: `npx vitest run src/lib/warera/schemas.test.ts src/lib/economy/item-def.test.ts` → PASS.
Run: `npm test` → verde; `./node_modules/.bin/tsc --noEmit` → exit 0 (arreglar los `ItemDef` a mano que falten `rarity`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/warera/schemas.ts src/lib/warera/schemas.test.ts src/lib/economy/types.ts src/lib/economy/item-def.ts src/lib/economy/item-def.test.ts
git commit -m "feat: parse company name/isFull/estimatedValue and item rarity"
```

---

### Task 2: Exponer los campos en los reportes

**Files:**
- Modify: `src/server/company-report.ts`, `src/server/company-report.test.ts`, `src/server/portfolio.ts`, `src/server/company-detail.ts`, `src/server/company-detail.test.ts`

- [ ] **Step 1: `ReportCompany` + `CompanyReport` + assembleCompanyReport**

En `src/server/company-report.ts`:
- `ReportCompany` añade: `name: string; isFull: boolean; estimatedValue: number;`
- `CompanyReport` añade: `name: string; rarity: string; isFull: boolean; estimatedValue: number;`
- En el return de `assembleCompanyReport`, añadir (rarity con default porque `item.rarity` es opcional):
```ts
    name: args.company.name,
    rarity: args.item.rarity ?? "common",
    isFull: args.company.isFull,
    estimatedValue: args.company.estimatedValue,
```

Añadir test en `company-report.test.ts` (el `company` fake del test suma name/isFull/estimatedValue; el `bread` item suma `rarity`):
```ts
  it("expone name, rarity, isFull y estimatedValue", () => {
    const r = assembleCompanyReport({
      company: { ...company, name: "MI CORP", isFull: true, estimatedValue: 500 },
      item: { ...bread, rarity: "uncommon" }, workers: [], prices, taxes, upgradesConfig,
    });
    expect(r.name).toBe("MI CORP");
    expect(r.rarity).toBe("uncommon");
    expect(r.isFull).toBe(true);
    expect(r.estimatedValue).toBe(500);
  });
```
(El `company` de los tests de `company-report` debe incluir `name/isFull/estimatedValue` —son requeridos en `ReportCompany`—; usar spreads o agregarlos al objeto base. `rarity` es opcional en `ItemDef`, así que el `bread` base no necesita cambios.)

- [ ] **Step 2: `portfolio.ts` / `company-detail.ts` — armar `ReportCompany`**

En ambos, al construir el objeto `company` para `assembleCompanyReport`, añadir los campos desde `c`:
```ts
    const company = {
      id: c._id, itemCode: c.itemCode, production: c.production, workerCount: c.workerCount,
      upgrades: c.activeUpgradeLevels,
      name: c.name, isFull: c.isFull, estimatedValue: c.estimatedValue,
    };
```
(El `item` ya viene de `toItemDef(...)` que ahora incluye `rarity`.) El fallback `toItemDef(code, { type:"product", productionPoints:1, productionNeeds:{} })` sigue válido (rarity default common).

- [ ] **Step 3: Tests de servicio**

En `portfolio.test.ts` y `company-detail.test.ts`, el `getCompanyById` fake puede sumar `name/isFull/estimatedValue` (o dejarlos ausentes → defaults "", false, 0). Añadir una aserción simple:
```ts
    expect(typeof r.companies[0].name).toBe("string");
    expect(typeof r.companies[0].rarity).toBe("string");
```
(En company-detail, `d.report.name`/`d.report.rarity`.)

- [ ] **Step 4: Correr suite + tsc**

Run: `npm test` → verde; `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/server/company-report.ts src/server/company-report.test.ts src/server/portfolio.ts src/server/company-detail.ts src/server/company-detail.test.ts
git commit -m "feat(server): expose company name/rarity/isFull/estimatedValue in reports"
```

---

### Task 3: Componentes `ItemImage` y `RarityBadge`

**Files:**
- Create: `src/components/item-image.tsx`, `src/components/item-image.test.tsx`, `src/components/rarity-badge.tsx`, `src/components/rarity-badge.test.tsx`

- [ ] **Step 1: `item-image.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/ui/cn";

/** URL pública de la imagen de un item del juego. */
export function itemImageUrl(code: string): string {
  return `https://app.warera.io/images/items/${code}.png`;
}

/** Imagen real del producto, con fallback a un ícono si no existe. */
export function ItemImage({ code, size = 40, className }: { code: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={cn("inline-flex items-center justify-center rounded-md bg-surface-2 text-muted-foreground", className)}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <Package style={{ width: size * 0.55, height: size * 0.55 }} />
      </span>
    );
  }
  return (
    <img
      src={itemImageUrl(code)}
      alt={code}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("rounded-md object-contain", className)}
    />
  );
}
```

- [ ] **Step 2: Test de `ItemImage`**

`src/components/item-image.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ItemImage, itemImageUrl } from "./item-image";

describe("ItemImage", () => {
  it("itemImageUrl arma la URL del item", () => {
    expect(itemImageUrl("steel")).toBe("https://app.warera.io/images/items/steel.png");
  });
  it("renderiza la imagen con alt = code", () => {
    render(<ItemImage code="steel" />);
    const img = screen.getByAltText("steel") as HTMLImageElement;
    expect(img.src).toContain("/images/items/steel.png");
  });
  it("cae al fallback cuando la imagen falla", () => {
    render(<ItemImage code="nope" />);
    const img = screen.getByAltText("nope");
    fireEvent.error(img);
    expect(screen.queryByAltText("nope")).toBeNull(); // ya no hay img; muestra el fallback
  });
});
```

- [ ] **Step 3: `rarity-badge.tsx`**

```tsx
import { cn } from "@/lib/ui/cn";

const RARITY: Record<string, { cls: string; label: string }> = {
  common: { cls: "bg-surface-2 text-muted-foreground", label: "común" },
  uncommon: { cls: "bg-success/15 text-success", label: "poco común" },
  rare: { cls: "bg-primary/15 text-primary", label: "raro" },
  epic: { cls: "bg-accent/15 text-accent", label: "épico" },
  legendary: { cls: "bg-accent/15 text-accent", label: "legendario" },
};

/** Badge de rareza del item (color + texto). */
export function RarityBadge({ rarity }: { rarity: string }) {
  const cfg = RARITY[rarity] ?? RARITY.common;
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize", cfg.cls)}>
      {cfg.label}
    </span>
  );
}
```

- [ ] **Step 4: Test de `RarityBadge`**

`src/components/rarity-badge.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RarityBadge } from "./rarity-badge";

describe("RarityBadge", () => {
  it("muestra la etiqueta de la rareza conocida", () => {
    render(<RarityBadge rarity="uncommon" />);
    expect(screen.getByText("poco común")).toBeInTheDocument();
  });
  it("rareza desconocida → común", () => {
    render(<RarityBadge rarity="mistery" />);
    expect(screen.getByText("común")).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Correr + tsc**

Run: `npx vitest run src/components/item-image.test.tsx src/components/rarity-badge.test.tsx` → PASS.
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/item-image.tsx src/components/item-image.test.tsx src/components/rarity-badge.tsx src/components/rarity-badge.test.tsx
git commit -m "feat(ui): add ItemImage and RarityBadge components"
```

---

### Task 4: Rediseño de tarjeta + detalle

**Files:**
- Modify: `src/components/dashboard/company-card.tsx`, `src/components/dashboard/company-card.test.tsx`, `src/app/company/[id]/page.tsx`

- [ ] **Step 1: `company-card.tsx` — imagen + nombre + rareza + isFull**

Reemplazar el encabezado de la `<Card>` (el bloque con `StatusDot`/itemCode/Badge) por una fila con la imagen, el nombre y la rareza, y mantener el resto. Importar `ItemImage`, `RarityBadge`, `AlertTriangle` (lucide). Nueva estructura interna del `<Card>`:
```tsx
        <div className="flex items-start gap-3">
          <ItemImage code={company.itemCode} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <StatusDot color={status.color} label={LABEL[status.level]} />
              <span className="truncate font-semibold">{company.name || company.itemCode}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{company.itemCode}</span>
              <RarityBadge rarity={company.rarity} />
            </div>
          </div>
          <Badge tone={status.color}>{LABEL[status.level]}</Badge>
        </div>
        <div className={`tabular mt-3 flex items-center gap-2 text-2xl font-bold ${positive ? "text-success" : "text-destructive"}`}>
          <Trend className="h-5 w-5" aria-hidden="true" />
          {formatPerDay(company.profit.netProfit)}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <dt>Producción/día</dt>
          <dd className="tabular text-right text-foreground">{formatMoney(company.dailyProductionRate)}</dd>
          <dt>Stock</dt>
          <dd className="tabular text-right text-foreground">
            {formatMoney(company.stock)} / {formatMoney(company.storageMax)}
            {company.isFull ? <AlertTriangle className="ml-1 inline h-3 w-3 text-warning" aria-label="almacén lleno" /> : null}
          </dd>
        </dl>
        {company.price ? (
          <div className="mt-2">
            <PriceTrendBadge price={company.price} />
          </div>
        ) : null}
        {company.maxWageToHire > 0 ? (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-accent">
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Pagar hasta {formatMoney(company.maxWageToHire)} /punto
          </div>
        ) : null}
```
(Mantener los imports existentes —`TrendingUp/Down`, `UserPlus`, `PriceTrendBadge`, etc.— y agregar `ItemImage`, `RarityBadge`, `AlertTriangle`.)

- [ ] **Step 2: `company-card.test.tsx` — fake con campos nuevos**

En el `report()` fake, añadir `name`, `rarity`, `isFull`, `estimatedValue`:
```tsx
    name: "MI CORP",
    rarity: "uncommon",
    isFull: false,
    estimatedValue: 500,
```
Y una aserción:
```tsx
    expect(screen.getByText("MI CORP")).toBeInTheDocument();
    expect(screen.getByText("poco común")).toBeInTheDocument();
```
(El test mockea `next/link`; `ItemImage` usa `<img>` —jsdom lo renderiza sin problema—.)

- [ ] **Step 3: `company/[id]/page.tsx` — header con imagen + nombre + rareza + valor**

En el bloque `data ?` del detalle, reemplazar el header (hoy `<h1>● steel [rentable]</h1>` + profit) por uno con imagen, nombre, itemCode, rareza y valor estimado. Importar `ItemImage`, `RarityBadge`. Estructura:
```tsx
              <div className="flex items-center gap-3">
                <ItemImage code={data.itemCode} size={56} />
                <div className="min-w-0 flex-1">
                  <h1 className="flex items-center gap-2 text-2xl font-bold">
                    <StatusDot color={status.color} label={LABEL[status.level]} />
                    <span className="truncate">{data.report.name || data.itemCode}</span>
                  </h1>
                  <div className="mt-1 flex items-center gap-2 text-sm">
                    <span className="font-mono text-muted-foreground">{data.itemCode}</span>
                    <RarityBadge rarity={data.report.rarity} />
                    <span className="tabular text-muted-foreground">· valor ≈ {formatMoney(data.report.estimatedValue)}</span>
                  </div>
                </div>
                <Badge tone={status.color}>{LABEL[status.level]}</Badge>
              </div>
              <div className={`tabular text-3xl font-bold ${positive ? "text-success" : "text-destructive"}`}>
                {formatPerDay(data.report.profit.netProfit)}
                {data.report.profit.estimated ? <span className="ml-2 text-xs text-muted-foreground">estimado</span> : null}
              </div>
```
Y en la card de Almacén, añadir el aviso de lleno: si `data.report.isFull`, mostrar junto al título "Almacén" un `<span className="text-warning">lleno</span>`. (Mantener `formatMoney` importado.)

- [ ] **Step 4: Correr tests + tsc + build**

Run: `npx vitest run src/components/dashboard/company-card.test.tsx` → PASS.
Run: `npm test` → verde; `./node_modules/.bin/tsc --noEmit` → exit 0; `npm run build` → compila.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/company-card.tsx src/components/dashboard/company-card.test.tsx "src/app/company/[id]/page.tsx"
git commit -m "feat(ui): redesign company card and detail header with image, name and rarity"
```

---

## Verificación final del Plan A

- [ ] `npm test` → todos verdes (schemas, item-def, company-report, ItemImage, RarityBadge, company-card).
- [ ] `./node_modules/.bin/tsc --noEmit` → exit 0; `npm run build` → compila.
- [ ] Flujo en vivo (BebetoSan): el dashboard muestra **nombre de empresa** ("METALES PESADOS CORP"), **imagen real del producto**, **rareza**, y el aviso de almacén lleno cuando corresponde; el detalle, el header con imagen grande + nombre + rareza + valor estimado.
- [ ] Verificación visual con Playwright (tarjeta + detalle); items sin imagen muestran el fallback prolijo.

## Nota
La precisión de la tasa/márgenes (bonus de producción de país/región) es el **Plan B**, separado.
