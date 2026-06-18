import Link from "next/link";
import { TrendingUp, TrendingDown, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { PriceTrendBadge } from "@/components/price-trend-badge";
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
          <dt>Producción/día</dt>
          <dd className="tabular text-right text-foreground">{formatMoney(company.dailyProductionRate)}</dd>
          <dt>Stock</dt>
          <dd className="tabular text-right text-foreground">{formatMoney(company.stock)} / {formatMoney(company.storageMax)}</dd>
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
      </Card>
    </Link>
  );
}
