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
