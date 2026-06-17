"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { usePrices } from "@/lib/client/use-prices";
import { sortBy, type SortDir } from "@/lib/ui/sort-table";
import { formatMoney } from "@/lib/format";
import { PriceTrend } from "@/components/market/price-trend";

export default function MarketPage() {
  const { data, isLoading, isError, error } = usePrices();
  const [query, setQuery] = useState("");
  const [dir, setDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<string | null>(null);

  const rows = useMemo(() => {
    const entries = Object.entries(data ?? {}).map(([item, price]) => ({ item, price }));
    const filtered = entries.filter((r) => r.item.toLowerCase().includes(query.toLowerCase()));
    return sortBy(filtered, "price", dir);
  }, [data, query, dir]);

  return (
    <AppShell>
      <h1 className="mb-4 text-xl font-bold">Mercado</h1>
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar item…"
          aria-label="Buscar item"
          className="h-10 flex-1 bg-transparent outline-none"
        />
      </div>
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
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Spinner /> Cargando precios…
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
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 text-right font-medium">
                  <button
                    onClick={() => setDir((d) => (d === "desc" ? "asc" : "desc"))}
                    className="cursor-pointer transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  >
                    Precio
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
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
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
