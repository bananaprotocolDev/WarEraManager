import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { PriceTrendInfo } from "@/lib/economy";

const CFG = {
  up: { icon: TrendingUp, cls: "text-success", label: "subiendo" },
  down: { icon: TrendingDown, cls: "text-destructive", label: "bajando" },
  flat: { icon: Minus, cls: "text-muted-foreground", label: "estable" },
} as const;

/** Indicador de tendencia del precio del item (actual vs promedio reciente). */
export function PriceTrendBadge({ price }: { price: PriceTrendInfo }) {
  const cfg = CFG[price.trend];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${cfg.cls}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">Precio {cfg.label}.</span>
      <span className="tabular">{formatMoney(price.current)}</span>
      <span className="text-muted-foreground">(prom {formatMoney(price.avg)})</span>
    </span>
  );
}
