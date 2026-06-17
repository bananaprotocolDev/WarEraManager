"use client";
import Link from "next/link";
import { LineChart, KeyRound, Boxes } from "lucide-react";

export function AppShell({ children, hasToken }: { children: React.ReactNode; hasToken?: boolean }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link
            href="/dashboard"
            className="rounded-sm font-mono text-lg font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            WarEra<span className="text-accent">Manager</span>
          </Link>
          <div className="flex items-center gap-2 text-sm sm:gap-4">
            <Link
              href="/optimizer"
              aria-label="Optimizador"
              className="flex items-center gap-1.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Boxes className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Optimizador</span>
            </Link>
            <Link
              href="/market"
              aria-label="Mercado"
              className="flex items-center gap-1.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LineChart className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Mercado</span>
            </Link>
            <Link
              href="/onboarding"
              aria-label={hasToken ? "Token activo" : "Sin token"}
              className="flex items-center gap-1.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <span className={`hidden sm:inline ${hasToken ? "text-success" : ""}`}>
                {hasToken ? "Token activo" : "Sin token"}
              </span>
            </Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
