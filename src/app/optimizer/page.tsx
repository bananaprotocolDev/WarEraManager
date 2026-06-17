"use client";
import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useOptimizer } from "@/lib/client/use-optimizer";
import { sortBy, type SortDir } from "@/lib/ui/sort-table";
import { formatMoney } from "@/lib/format";

export default function OptimizerPage() {
  const { data, isLoading, isError, error } = useOptimizer();
  const [dir, setDir] = useState<SortDir>("desc");

  const rows = data ? sortBy(data.options, "marginPerPoint", dir) : [];

  return (
    <AppShell>
      <h1 className="mb-4 text-xl font-bold">Mejor qué producir</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Margen neto por punto de producción según los precios actuales. Mayor es mejor.
      </p>
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Spinner /> Calculando…
        </div>
      ) : isError ? (
        <Card className="cursor-default border-destructive/40">
          <p className="text-destructive">{error instanceof Error ? error.message : String(error)}</p>
        </Card>
      ) : (
        <Card className="cursor-default overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 text-right font-medium">
                  <button
                    onClick={() => setDir((d) => (d === "desc" ? "asc" : "desc"))}
                    className="inline-flex items-center gap-1 cursor-pointer transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  >
                    Margen / punto <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o, i) => (
                <tr key={o.itemCode} className="border-b border-border last:border-0">
                  <td className="tabular px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-2.5 font-mono">{o.itemCode}</td>
                  <td className="tabular px-4 py-2.5 text-right">{formatMoney(o.marginPerPoint)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
