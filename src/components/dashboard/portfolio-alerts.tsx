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
