# WarEra Company Manager — Plan 4: Fundaciones de UI + Onboarding + Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la cara visible de la app sobre el backend del Plan 2: sistema de diseño (modo oscuro "command center"), capa de datos cliente (React Query + token en sessionStorage), pantalla de onboarding, y el Dashboard de cartera con las tarjetas de empresas, totales y alertas — usable de punta a punta contra datos reales.

**Architecture:** Next.js App Router. Componentes cliente para interactividad; React Query para datos desde `/api/report`. El API token vive en `sessionStorage` (decisión del usuario) y se envía como header `X-API-Key`. Diseño guiado por `design-system/warera-company-manager/MASTER.md`: modo oscuro OLED, azul + ámbar, estados verde/ámbar/rojo, tipografía Fira Sans (texto) + Fira Code (números tabulares). Lógica pura (formato, estado de empresa) aislada y testeada; primitivos de UI consistentes (Button, Card, Badge, StatusDot).

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS v4, @tanstack/react-query, lucide-react (íconos SVG), class-variance-authority + clsx + tailwind-merge, Vitest + @testing-library/react + jsdom.

Spec: `docs/superpowers/specs/2026-06-16-warera-company-manager-design.md` (§8 pantallas). Diseño: `design-system/warera-company-manager/MASTER.md`. Decisión: token en sessionStorage, header `X-API-Key`. Estilo elegido por el usuario: **Command Center oscuro**.

---

## Reglas de diseño no negociables (del sistema de diseño)

- **Modo oscuro por defecto.** Paleta oscura definida en Task 2 (NO usar la paleta clara del MASTER; el generador la devolvió por error — acá se adapta a oscuro real).
- **Sin emojis como íconos.** Usar `lucide-react`. Los estados se muestran con un componente `StatusDot` (círculo de color) + texto/ícono, nunca color solo.
- **Números tabulares en Fira Code** (precios, beneficios, %), texto en Fira Sans.
- **Transiciones 150–300ms**, `cursor-pointer` en clickables, focus visible, sin hovers que muevan el layout (usar sombra/opacidad, no scale que desplace).
- **Responsive**: 375 / 768 / 1024 / 1440. Mobile-first. Contraste texto ≥ 4.5:1.

## Estructura de archivos (Plan 4)

- `vitest.setup.ts` — setup de testing-library (Task 1)
- `src/lib/ui/cn.ts` — helper `cn` (Task 1)
- `src/app/globals.css` — MOD: tokens oscuros + Tailwind theme (Task 2)
- `src/app/layout.tsx` — MOD: fuentes Fira + clase dark + providers (Task 2, 6)
- `src/lib/format.ts` — formato de dinero/porcentaje/por-día (Task 3)
- `src/lib/ui/company-status.ts` — estado de empresa (Task 4)
- `src/components/ui/button.tsx`, `card.tsx`, `badge.tsx`, `status-dot.tsx`, `spinner.tsx` — primitivos (Task 5)
- `src/lib/client/token-store.ts` — token en sessionStorage + hook (Task 6)
- `src/components/providers.tsx` — React Query provider (Task 6)
- `src/lib/client/use-portfolio.ts` — hook de datos (Task 7)
- `src/components/app-shell.tsx` — nav superior (Task 8)
- `src/app/onboarding/page.tsx` — onboarding (Task 9)
- `src/components/dashboard/company-card.tsx`, `stat-card.tsx`, `portfolio-alerts.tsx` — (Task 10)
- `src/app/dashboard/page.tsx` — Dashboard (Task 10)
- `src/app/page.tsx` — MOD: redirige según userId guardado (Task 11)

Tests: lógica pura `*.test.ts`; componentes `*.test.tsx` con docblock `// @vitest-environment jsdom`.

**Entorno:** typecheck `./node_modules/.bin/tsc --noEmit`. Tests `npm test` / `npx vitest run <path>`.

---

### Task 1: Dependencias de UI/test + `cn` + setup de Vitest

**Files:**
- Create: `vitest.setup.ts`, `src/lib/ui/cn.ts`, `src/lib/ui/cn.test.ts`
- Modify: `vitest.config.ts`, `package.json`

- [ ] **Step 1: Instalar dependencias**

Run:
```bash
npm i @tanstack/react-query lucide-react class-variance-authority clsx tailwind-merge
npm i -D @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```
Expected: se añaden a package.json.

- [ ] **Step 2: Crear el setup de testing-library**

`vitest.setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Configurar vitest (setup + jsdom para .tsx)**

Reemplazar `vitest.config.ts` por:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```
(Los tests de componentes declaran su entorno con `// @vitest-environment jsdom` en la primera línea.)

- [ ] **Step 4: Test del helper `cn`**

`src/lib/ui/cn.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("une clases y resuelve conflictos de tailwind-merge", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm", false && "hidden", "font-bold")).toBe("text-sm font-bold");
  });
});
```

- [ ] **Step 5: Implementar `cn`**

`src/lib/ui/cn.ts`:
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Une clases condicionalmente y resuelve conflictos de Tailwind. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 6: Correr tests + tsc**

Run: `npx vitest run src/lib/ui/cn.test.ts` → PASS
Run: `npm test` → todo verde (58 previos + 1).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vitest.setup.ts src/lib/ui/cn.ts src/lib/ui/cn.test.ts
git commit -m "chore(ui): add UI/test deps, cn helper, vitest setup"
```

---

### Task 2: Tokens de diseño (modo oscuro) + fuentes

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`

- [ ] **Step 1: Reemplazar `src/app/globals.css`**

```css
@import "tailwindcss";

/* Paleta oscura "command center" (adaptada a dark real; ver Plan 4 §reglas). */
:root {
  --background: #0a0e14;
  --surface: #121822;
  --surface-2: #1a2230;
  --border: #232c3b;
  --foreground: #e6edf3;
  --muted-foreground: #8b97a7;
  --primary: #3b82f6;
  --primary-foreground: #ffffff;
  --accent: #f59e0b;
  --success: #22c55e;
  --warning: #f59e0b;
  --destructive: #ef4444;
  --ring: #3b82f6;
}

@theme inline {
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-border: var(--border);
  --color-foreground: var(--foreground);
  --color-muted-foreground: var(--muted-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-accent: var(--accent);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-destructive: var(--destructive);
  --color-ring: var(--ring);
  --font-sans: var(--font-fira-sans);
  --font-mono: var(--font-fira-code);
}

* {
  border-color: var(--color-border);
}

body {
  background: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-sans), system-ui, sans-serif;
}

/* Números tabulares para datos */
.tabular {
  font-family: var(--font-mono), monospace;
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: Reemplazar `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Fira_Code, Fira_Sans } from "next/font/google";
import "./globals.css";

const firaSans = Fira_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-fira-sans",
});
const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fira-code",
});

export const metadata: Metadata = {
  title: "WarEra Company Manager",
  description: "Optimiza la economía de tus empresas en WarEra.io",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${firaSans.variable} ${firaCode.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Verificar build de estilos**

Run: `./node_modules/.bin/tsc --noEmit` → exit 0.
Run: `npm run build` → compila sin errores (valida Tailwind v4 + next/font).
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat(ui): add dark command-center design tokens and Fira fonts"
```

---

### Task 3: Utilidades de formato

**Files:**
- Create: `src/lib/format.ts`, `src/lib/format.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect } from "vitest";
import { formatMoney, formatPerDay, formatPercent } from "./format";

describe("format", () => {
  it("formatMoney usa 2 decimales", () => {
    expect(formatMoney(1234.5)).toBe("1,234.50");
    expect(formatMoney(0)).toBe("0.00");
  });

  it("formatPerDay antepone signo y sufijo /día", () => {
    expect(formatPerDay(28.4)).toBe("+28.40 /día");
    expect(formatPerDay(-3.1)).toBe("-3.10 /día");
    expect(formatPerDay(0)).toBe("0.00 /día");
  });

  it("formatPercent redondea a entero con %", () => {
    expect(formatPercent(0.78)).toBe("78%");
    expect(formatPercent(0.224)).toBe("22%");
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/lib/format.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
/** Formatea un número con separador de miles y 2 decimales. */
export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Beneficio por día con signo explícito. */
export function formatPerDay(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)} /día`;
}

/** Fracción 0..1 a porcentaje entero. */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
```

- [ ] **Step 4: Correr (pasa) + tsc**

Run: `npx vitest run src/lib/format.test.ts` → PASS.
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "feat(ui): add number formatting utilities"
```

---

### Task 4: Lógica de estado de empresa

**Files:**
- Create: `src/lib/ui/company-status.ts`, `src/lib/ui/company-status.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect } from "vitest";
import { companyStatus } from "./company-status";

describe("companyStatus", () => {
  it("rojo si pierde dinero", () => {
    expect(companyStatus(-3.1).level).toBe("loss");
  });
  it("ámbar si gana poco (<= 5/día)", () => {
    expect(companyStatus(4).level).toBe("low");
  });
  it("verde si gana bien (> 5/día)", () => {
    expect(companyStatus(28.4).level).toBe("good");
  });
  it("expone un token de color por nivel", () => {
    expect(companyStatus(28).color).toBe("success");
    expect(companyStatus(4).color).toBe("warning");
    expect(companyStatus(-1).color).toBe("destructive");
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/lib/ui/company-status.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
export type StatusLevel = "good" | "low" | "loss";
export type StatusColor = "success" | "warning" | "destructive";

export interface CompanyStatus {
  level: StatusLevel;
  color: StatusColor;
}

/** Clasifica una empresa por su beneficio neto/día. */
export function companyStatus(netPerDay: number): CompanyStatus {
  if (netPerDay < 0) return { level: "loss", color: "destructive" };
  if (netPerDay <= 5) return { level: "low", color: "warning" };
  return { level: "good", color: "success" };
}
```

- [ ] **Step 4: Correr (pasa) + tsc**

Run: `npx vitest run src/lib/ui/company-status.test.ts` → PASS.
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/company-status.ts src/lib/ui/company-status.test.ts
git commit -m "feat(ui): add company status classification"
```

---

### Task 5: Primitivos de UI

**Files:**
- Create: `src/components/ui/button.tsx`, `card.tsx`, `badge.tsx`, `status-dot.tsx`, `spinner.tsx`
- Test: `src/components/ui/button.test.tsx`, `src/components/ui/status-dot.test.tsx`

- [ ] **Step 1: `button.tsx`**

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/ui/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary: "bg-accent text-black hover:opacity-90",
        secondary: "border border-primary text-primary hover:bg-primary/10",
        ghost: "text-foreground hover:bg-surface-2",
      },
      size: { sm: "h-9 px-3 text-sm", md: "h-11 px-6 text-base" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
```

- [ ] **Step 2: `card.tsx`**

```tsx
import * as React from "react";
import { cn } from "@/lib/ui/cn";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface p-6 shadow-md transition-all duration-200",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 3: `badge.tsx`**

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/ui/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-surface-2 text-muted-foreground",
        success: "bg-success/15 text-success",
        warning: "bg-warning/15 text-warning",
        destructive: "bg-destructive/15 text-destructive",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
```

- [ ] **Step 4: `status-dot.tsx`**

```tsx
import { cn } from "@/lib/ui/cn";
import type { StatusColor } from "@/lib/ui/company-status";

const COLOR: Record<StatusColor, string> = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

/** Punto de estado de color. Acompañar siempre con texto (no color solo). */
export function StatusDot({ color, label }: { color: StatusColor; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("h-2.5 w-2.5 rounded-full", COLOR[color])} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
```

- [ ] **Step 5: `spinner.tsx`**

```tsx
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/ui/cn";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-muted-foreground", className)} aria-label="Cargando" />;
}
```

- [ ] **Step 6: Tests de render**

`src/components/ui/button.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button";

describe("Button", () => {
  it("renderiza el contenido y dispara onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Guardar</Button>);
    const btn = screen.getByRole("button", { name: "Guardar" });
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("no dispara onClick si está deshabilitado", async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>X</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
```

`src/components/ui/status-dot.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusDot } from "./status-dot";

describe("StatusDot", () => {
  it("expone una etiqueta accesible (no solo color)", () => {
    render(<StatusDot color="success" label="rentable" />);
    expect(screen.getByText("rentable")).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Correr + tsc**

Run: `npx vitest run src/components/ui/button.test.tsx src/components/ui/status-dot.test.tsx` → PASS.
Run: `npm test` → verde; `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/
git commit -m "feat(ui): add Button, Card, Badge, StatusDot, Spinner primitives"
```

---

### Task 6: Token store (sessionStorage) + React Query provider

**Files:**
- Create: `src/lib/client/token-store.ts`, `src/lib/client/token-store.test.ts`, `src/components/providers.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Test del token store (jsdom)**

`src/lib/client/token-store.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { getToken, setToken, clearToken, getUserId, setUserId } from "./token-store";

beforeEach(() => sessionStorage.clear());

describe("token-store", () => {
  it("guarda y lee el token", () => {
    expect(getToken()).toBeNull();
    setToken("abc");
    expect(getToken()).toBe("abc");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("guarda y lee el userId", () => {
    expect(getUserId()).toBeNull();
    setUserId("u1");
    expect(getUserId()).toBe("u1");
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/lib/client/token-store.test.ts` → FAIL.

- [ ] **Step 3: Implementar el store**

`src/lib/client/token-store.ts`:
```ts
const TOKEN_KEY = "warera.apiToken";
const USER_KEY = "warera.userId";

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(key);
}
function write(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  if (value === null) window.sessionStorage.removeItem(key);
  else window.sessionStorage.setItem(key, value);
}

export const getToken = (): string | null => read(TOKEN_KEY);
export const setToken = (t: string): void => write(TOKEN_KEY, t);
export const clearToken = (): void => write(TOKEN_KEY, null);

export const getUserId = (): string | null => read(USER_KEY);
export const setUserId = (id: string): void => write(USER_KEY, id);
export const clearUserId = (): void => write(USER_KEY, null);
```

- [ ] **Step 4: Provider de React Query**

`src/components/providers.tsx`:
```tsx
"use client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 5: Envolver el layout con Providers**

En `src/app/layout.tsx`, importar `Providers` y envolver children:
```tsx
import { Providers } from "@/components/providers";
// ...
      <body>
        <Providers>{children}</Providers>
      </body>
```

- [ ] **Step 6: Correr + tsc**

Run: `npx vitest run src/lib/client/token-store.test.ts` → PASS.
Run: `npm test` → verde; `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/client/token-store.ts src/lib/client/token-store.test.ts src/components/providers.tsx src/app/layout.tsx
git commit -m "feat(ui): add sessionStorage token store and React Query provider"
```

---

### Task 7: Hook de datos `usePortfolio`

**Files:**
- Create: `src/lib/client/use-portfolio.ts`, `src/lib/client/use-portfolio.test.ts`

- [ ] **Step 1: Test (jsdom, fetch mockeado)**

`src/lib/client/use-portfolio.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchPortfolio } from "./use-portfolio";

afterEach(() => vi.restoreAllMocks());

describe("fetchPortfolio", () => {
  it("llama a /api/report con userId y sin header si no hay token", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ userId: "u1", companies: [], totalNetProfit: 0, wagesAvailable: false, estimated: true })),
    );
    const r = await fetchPortfolio("u1", null);
    expect(r.userId).toBe("u1");
    const [url, opts] = spy.mock.calls[0];
    expect(url).toBe("/api/report?userId=u1");
    expect((opts?.headers as Record<string, string>) ?? {}).not.toHaveProperty("X-API-Key");
  });

  it("incluye X-API-Key cuando hay token", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ userId: "u1", companies: [], totalNetProfit: 0, wagesAvailable: true, estimated: true })),
    );
    await fetchPortfolio("u1", "tok");
    const opts = spy.mock.calls[0][1];
    expect((opts?.headers as Record<string, string>)["X-API-Key"]).toBe("tok");
  });

  it("lanza si la respuesta no es ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("err", { status: 502 }));
    await expect(fetchPortfolio("u1", null)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/lib/client/use-portfolio.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

`src/lib/client/use-portfolio.ts`:
```ts
"use client";
import { useQuery } from "@tanstack/react-query";
import type { Portfolio } from "@/server/portfolio";

export async function fetchPortfolio(userId: string, token: string | null): Promise<Portfolio> {
  const headers: Record<string, string> = {};
  if (token) headers["X-API-Key"] = token;
  const res = await fetch(`/api/report?userId=${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) throw new Error(`Error al cargar la cartera (HTTP ${res.status})`);
  return (await res.json()) as Portfolio;
}

export function usePortfolio(userId: string | null, token: string | null) {
  return useQuery({
    queryKey: ["portfolio", userId, Boolean(token)],
    queryFn: () => fetchPortfolio(userId as string, token),
    enabled: Boolean(userId),
  });
}
```

- [ ] **Step 4: Correr (pasa) + tsc**

Run: `npx vitest run src/lib/client/use-portfolio.test.ts` → PASS.
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/client/use-portfolio.ts src/lib/client/use-portfolio.test.ts
git commit -m "feat(ui): add usePortfolio data hook"
```

---

### Task 8: App shell (nav superior)

**Files:**
- Create: `src/components/app-shell.tsx`, `src/components/app-shell.test.tsx`

- [ ] **Step 1: Implementar el shell**

`src/components/app-shell.tsx`:
```tsx
"use client";
import Link from "next/link";
import { LineChart, KeyRound } from "lucide-react";

export function AppShell({ children, hasToken }: { children: React.ReactNode; hasToken?: boolean }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/dashboard" className="font-mono text-lg font-bold text-foreground">
            WarEra<span className="text-accent">Manager</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/market"
              className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <LineChart className="h-4 w-4" /> Mercado
            </Link>
            <Link
              href="/onboarding"
              className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <KeyRound className="h-4 w-4" />
              <span className={hasToken ? "text-success" : ""}>{hasToken ? "Token activo" : "Sin token"}</span>
            </Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Test de render**

`src/components/app-shell.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "./app-shell";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

describe("AppShell", () => {
  it("muestra 'Token activo' cuando hasToken", () => {
    render(<AppShell hasToken>contenido</AppShell>);
    expect(screen.getByText("Token activo")).toBeInTheDocument();
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  it("muestra 'Sin token' por defecto", () => {
    render(<AppShell>x</AppShell>);
    expect(screen.getByText("Sin token")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Correr + tsc**

Run: `npx vitest run src/components/app-shell.test.tsx` → PASS.
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/app-shell.tsx src/components/app-shell.test.tsx
git commit -m "feat(ui): add app shell with top navigation"
```

---

### Task 9: Pantalla de onboarding

**Files:**
- Create: `src/app/onboarding/page.tsx`

- [ ] **Step 1: Implementar la página**

`src/app/onboarding/page.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { setUserId, setToken, clearToken } from "@/lib/client/token-store";

export default function OnboardingPage() {
  const router = useRouter();
  const [userId, setUserIdInput] = useState("");
  const [token, setTokenInput] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId.trim()) return;
    setUserId(userId.trim());
    if (token.trim()) setToken(token.trim());
    else clearToken();
    router.push("/dashboard");
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <h1 className="mb-2 font-mono text-2xl font-bold">
        WarEra<span className="text-accent">Manager</span>
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Pegá tu user ID de WarEra para ver el rendimiento de tus empresas. El token es opcional
        (habilita los salarios) y se guarda solo en esta pestaña.
      </p>
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <User className="h-4 w-4" /> User ID <span className="text-destructive">*</span>
            </span>
            <input
              value={userId}
              onChange={(e) => setUserIdInput(e.target.value)}
              placeholder="6a30f0e6a38931d3ab4ef9cc"
              className="tabular h-11 rounded-lg border border-border bg-surface-2 px-4 outline-none focus:ring-2 focus:ring-ring"
              required
            />
            <span className="text-xs text-muted-foreground">Lo encontrás en la URL de tu perfil en WarEra.</span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <KeyRound className="h-4 w-4" /> API token <span className="text-muted-foreground">(opcional)</span>
            </span>
            <input
              value={token}
              onChange={(e) => setTokenInput(e.target.value)}
              type="password"
              placeholder="Settings → API Tokens"
              className="h-11 rounded-lg border border-border bg-surface-2 px-4 outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-xs text-muted-foreground">
              Sin token no se ven los salarios y el beneficio queda sobreestimado.
            </span>
          </label>
          <Button type="submit" disabled={!userId.trim()}>
            Ver mi cartera
          </Button>
        </form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verificar build**

Run: `./node_modules/.bin/tsc --noEmit` → exit 0.
Run: `npm run build` → compila.

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/page.tsx
git commit -m "feat(ui): add onboarding screen"
```

---

### Task 10: Dashboard (tarjetas, totales, alertas)

**Files:**
- Create: `src/components/dashboard/stat-card.tsx`, `src/components/dashboard/company-card.tsx`, `src/components/dashboard/portfolio-alerts.tsx`, `src/app/dashboard/page.tsx`
- Test: `src/components/dashboard/company-card.test.tsx`

- [ ] **Step 1: `stat-card.tsx`**

```tsx
import { Card } from "@/components/ui/card";

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="cursor-default">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="tabular mt-1 text-3xl font-bold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}
```

- [ ] **Step 2: `company-card.tsx`**

```tsx
import Link from "next/link";
import { TrendingUp, TrendingDown, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { companyStatus } from "@/lib/ui/company-status";
import { formatPerDay, formatMoney } from "@/lib/format";
import type { CompanyReport } from "@/server/portfolio";

const LABEL = { good: "rentable", low: "margen bajo", loss: "en pérdida" } as const;

export function CompanyCard({ company }: { company: CompanyReport }) {
  const status = companyStatus(company.profit.netProfit);
  const positive = company.profit.netProfit >= 0;
  const Trend = positive ? TrendingUp : TrendingDown;
  return (
    <Link href={`/company/${company.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
      <Card className="hover:shadow-lg hover:border-primary/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusDot color={status.color} label={LABEL[status.level]} />
            <span className="font-mono font-semibold">{company.itemCode}</span>
          </div>
          <Badge tone={status.color}>{LABEL[status.level]}</Badge>
        </div>
        <div className={`tabular mt-3 flex items-center gap-2 text-2xl font-bold ${positive ? "text-success" : "text-destructive"}`}>
          <Trend className="h-5 w-5" aria-hidden="true" />
          {formatPerDay(company.profit.netProfit)}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <dt>Ingresos</dt>
          <dd className="tabular text-right text-foreground">{formatMoney(company.profit.revenue)}</dd>
          <dt>Salarios</dt>
          <dd className="tabular text-right text-foreground">{formatMoney(company.profit.wageCost)}</dd>
        </dl>
        {company.maxWageToHire > 0 ? (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-accent">
            <UserPlus className="h-3.5 w-3.5" /> Pagar hasta {formatMoney(company.maxWageToHire)} por trabajador
          </div>
        ) : null}
      </Card>
    </Link>
  );
}
```

- [ ] **Step 3: `portfolio-alerts.tsx`**

```tsx
import { AlertTriangle } from "lucide-react";
import type { Portfolio } from "@/server/portfolio";

export function PortfolioAlerts({ portfolio }: { portfolio: Portfolio }) {
  const losing = portfolio.companies.filter((c) => c.profit.netProfit < 0);
  if (losing.length === 0) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
      <AlertTriangle className="h-4 w-4" />
      {losing.length} empresa{losing.length > 1 ? "s" : ""} en pérdida: {losing.map((c) => c.itemCode).join(", ")}
    </div>
  );
}
```

- [ ] **Step 4: Test de `CompanyCard`**

`src/components/dashboard/company-card.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompanyCard } from "./company-card";
import type { CompanyReport } from "@/server/portfolio";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

function report(net: number): CompanyReport {
  return {
    id: "c1",
    itemCode: "bread",
    profit: { unitsPerDay: 10, revenue: 15, inputCost: 2, wageCost: 3, tax: 1.5, netProfit: net, estimated: true },
    hiring: { marginalUnitsPerDay: 4, marginalValue: 5, maxWage: 5, worthIt: true, estimated: true },
    maxWageToHire: 5,
  };
}

describe("CompanyCard", () => {
  it("muestra beneficio positivo y estado rentable", () => {
    render(<CompanyCard company={report(28.4)} />);
    expect(screen.getByText("bread")).toBeInTheDocument();
    expect(screen.getByText("+28.40 /día")).toBeInTheDocument();
    expect(screen.getAllByText("rentable").length).toBeGreaterThan(0);
  });

  it("muestra pérdida con signo negativo", () => {
    render(<CompanyCard company={report(-3.1)} />);
    expect(screen.getByText("-3.10 /día")).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: `dashboard/page.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { CompanyCard } from "@/components/dashboard/company-card";
import { PortfolioAlerts } from "@/components/dashboard/portfolio-alerts";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { usePortfolio } from "@/lib/client/use-portfolio";
import { getUserId, getToken } from "@/lib/client/token-store";
import { formatPerDay } from "@/lib/format";

export default function DashboardPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const id = getUserId();
    if (!id) {
      router.replace("/onboarding");
      return;
    }
    setUserId(id);
    setToken(getToken());
  }, [router]);

  const { data, isLoading, isError, error } = usePortfolio(userId, token);

  return (
    <AppShell hasToken={Boolean(token)}>
      {isLoading || !userId ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Spinner /> Cargando tu cartera…
        </div>
      ) : isError ? (
        <Card className="cursor-default border-destructive/40">
          <p className="text-destructive">No se pudo cargar: {(error as Error).message}</p>
        </Card>
      ) : data && data.companies.length === 0 ? (
        <Card className="cursor-default text-center text-muted-foreground">
          No encontramos empresas para este usuario.
        </Card>
      ) : data ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Total neto / día"
              value={formatPerDay(data.totalNetProfit)}
              hint={data.estimated ? "estimado (sin calibrar)" : undefined}
            />
            <StatCard label="Empresas" value={String(data.companies.length)} />
            <StatCard
              label="Salarios"
              value={data.wagesAvailable ? "incluidos" : "no disponibles"}
              hint={data.wagesAvailable ? undefined : "agregá tu token"}
            />
          </div>
          <PortfolioAlerts portfolio={data} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.companies.map((c) => (
              <CompanyCard key={c.id} company={c} />
            ))}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
```

- [ ] **Step 6: Correr tests + tsc + build**

Run: `npx vitest run src/components/dashboard/company-card.test.tsx` → PASS.
Run: `npm test` → todo verde.
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.
Run: `npm run build` → compila.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/ src/app/dashboard/page.tsx
git commit -m "feat(ui): add dashboard with portfolio cards, totals and alerts"
```

---

### Task 11: Ruta raíz → redirige según userId

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Reemplazar `src/app/page.tsx`**

```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUserId } from "@/lib/client/token-store";
import { Spinner } from "@/components/ui/spinner";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getUserId() ? "/dashboard" : "/onboarding");
  }, [router]);
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner />
    </div>
  );
}
```

- [ ] **Step 2: tsc + build**

Run: `./node_modules/.bin/tsc --noEmit` → exit 0.
Run: `npm run build` → compila.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(ui): redirect root to dashboard or onboarding"
```

---

## Verificación final del Plan 4

- [ ] `npm test` → todos los tests verdes (Plan 1–2 + nuevos: cn, format, company-status, button, status-dot, token-store, use-portfolio, app-shell, company-card).
- [ ] `./node_modules/.bin/tsc --noEmit` → exit 0.
- [ ] `npm run build` → compila sin errores.
- [ ] `npm run dev` y verificación manual:
  - `/` redirige a `/onboarding` (sin userId) o `/dashboard` (con userId guardado).
  - En onboarding, pegar `6a30f0e6a38931d3ab4ef9cc` → "Ver mi cartera" → Dashboard muestra la(s) empresa(s) reales con beneficio/día, totales y, si corresponde, la alerta de pérdida.
  - Nav superior muestra "Sin token" / "Token activo" según corresponda.
  - Probar a 375px y 1440px: sin scroll horizontal, grilla responsiva.
- [ ] Revisión visual contra `design-system/warera-company-manager/MASTER.md`: sin emojis como íconos, focus visible, transiciones suaves, contraste correcto en oscuro.

## Notas para el Plan 5 (resto de la UI)

- **Detalle de empresa** (`/company/[id]`): desglose ingresos/inputs/salarios/impuestos, lista de trabajadores y su rentabilidad, recomendación de contratar/despedir, ROI de upgrades. Endpoint: ampliar `/api/report` o un `/api/company/[id]`.
- **Optimizador** (`/optimizer`): tabla rankeada desde `/api/optimizer` (sortable, número tabular).
- **Mercado** (`/market`): precios desde `/api/prices` + gráfico de tendencias (requiere Plan 3, histórico). Usar Recharts; respetar `prefers-reduced-motion` y dar tabla alternativa accesible.
- **Resolución username → userId** en onboarding (investigar endpoint de búsqueda de WarEra; si no existe, mantener user ID manual con ayuda visual de dónde encontrarlo).
