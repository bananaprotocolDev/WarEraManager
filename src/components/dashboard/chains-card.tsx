import { Card } from "@/components/ui/card";
import { Link2 } from "lucide-react";
import { formatPerDay } from "@/lib/format";
import type { ChainNet } from "@/lib/economy";

export function ChainsCard({ chains }: { chains: ChainNet[] }) {
  if (chains.length === 0) return null;
  return (
    <Card className="cursor-default">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Link2 className="h-4 w-4" aria-hidden="true" /> Cadenas
      </h2>
      <ul className="flex flex-col gap-2 text-sm">
        {chains.map((c) => (
          <li key={c.steps.join("-")} className="flex items-center justify-between gap-3">
            <span className="font-mono">{c.steps.join("→")}</span>
            <span className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                mejor destino: {c.bestRawDestination === "sell" ? "vender" : "procesar"}
              </span>
              <span className={`tabular font-medium ${c.netPerDay >= 0 ? "text-success" : "text-destructive"}`}>
                {formatPerDay(c.netPerDay)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
