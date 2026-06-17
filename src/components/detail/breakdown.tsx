import { Card } from "@/components/ui/card";
import { formatMoney, formatPerDay } from "@/lib/format";
import type { ProfitBreakdown } from "@/lib/economy";

/** Formatea un costo a restar: muestra "0.00" sin signo cuando es cero. */
function formatCost(n: number): string {
  return n === 0 ? formatMoney(0) : `-${formatMoney(n)}`;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className={strong ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className={`tabular ${strong ? "font-bold" : ""}`}>{value}</span>
    </div>
  );
}

export function Breakdown({ profit }: { profit: ProfitBreakdown }) {
  return (
    <Card className="cursor-default">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Desglose diario</h2>
      <Row label="Ingresos" value={formatMoney(profit.revenue)} />
      <Row label="Materiales" value={formatCost(profit.inputCost)} />
      <Row label="Salarios" value={formatCost(profit.wageCost)} />
      <Row label="Impuestos" value={formatCost(profit.tax)} />
      <div className="my-1 border-t border-border" />
      <Row label="Neto / día" value={formatPerDay(profit.netProfit)} strong />
    </Card>
  );
}
