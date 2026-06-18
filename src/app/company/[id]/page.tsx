"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Cog } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { Breakdown } from "@/components/detail/breakdown";
import { WorkersPanel } from "@/components/detail/workers-panel";
import { HiringPanel } from "@/components/detail/hiring-panel";
import { PriceTrendBadge } from "@/components/price-trend-badge";
import { PriceTrend } from "@/components/market/price-trend";
import { useCompanyDetail } from "@/lib/client/use-company-detail";
import { getUserId, getToken } from "@/lib/client/token-store";
import { companyStatus } from "@/lib/ui/company-status";
import { formatPerDay, formatMoney } from "@/lib/format";

const LABEL = { good: "rentable", low: "margen bajo", loss: "en pérdida" } as const;

export default function CompanyDetailPage() {
  const params = useParams<{ id: string }>();
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

  const { data, isLoading, isError, error } = useCompanyDetail(params.id, userId, token);

  return (
    <AppShell hasToken={Boolean(token)}>
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver
      </Link>

      {isLoading || !userId ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Spinner /> Cargando empresa…
        </div>
      ) : isError ? (
        <Card className="cursor-default border-destructive/40">
          <p className="text-destructive">
            No se pudo cargar: {error instanceof Error ? error.message : String(error)}
          </p>
        </Card>
      ) : data ? (
        (() => {
          const status = companyStatus(data.report.profit.netProfit);
          const positive = data.report.profit.netProfit >= 0;
          return (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h1 className="flex items-center gap-2 text-2xl font-bold">
                  <StatusDot color={status.color} label={LABEL[status.level]} />
                  <span className="font-mono">{data.itemCode}</span>
                </h1>
                <Badge tone={status.color}>{LABEL[status.level]}</Badge>
              </div>
              <div className={`tabular text-3xl font-bold ${positive ? "text-success" : "text-destructive"}`}>
                {formatPerDay(data.report.profit.netProfit)}
                {data.estimated ? <span className="ml-2 text-xs text-muted-foreground">estimado</span> : null}
              </div>
              {data.report.price ? (
                <div>
                  <PriceTrendBadge price={data.report.price} />
                </div>
              ) : null}

              <Card className="cursor-default">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Almacén</span>
                  <span className="tabular">{formatMoney(data.report.stock)} / {formatMoney(data.report.storageMax)}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${data.report.storageMax > 0 ? Math.min(100, (data.report.stock / data.report.storageMax) * 100) : 0}%` }}
                  />
                </div>
              </Card>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Breakdown profit={data.report.profit} />
                <WorkersPanel
                  workers={data.workers}
                  wagesAvailable={data.wagesAvailable}
                  maxWage={data.report.maxWageToHire}
                />
              </div>

              <HiringPanel hiring={data.hiring} />

              <Card className="cursor-default">
                <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <Cog className="h-4 w-4" aria-hidden="true" /> Mejoras
                </h2>
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge>Motor automatizado: nivel {data.upgrades.automatedEngine}</Badge>
                  <Badge>Sala de descanso: nivel {data.upgrades.breakRoom}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">El ROI de mejoras llegará con la calibración.</p>
              </Card>

              <Card className="cursor-default">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Tendencia de precio · <span className="font-mono normal-case">{data.itemCode}</span>
                </h2>
                <PriceTrend item={data.itemCode} />
              </Card>

              {data.recipe.length > 0 ? (
                <Card className="cursor-default">
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Receta (por unidad)
                  </h2>
                  <ul className="flex flex-col gap-1 text-sm">
                    {data.recipe.map((r) => (
                      <li key={r.input} className="flex justify-between">
                        <span className="font-mono">{r.input}</span>
                        <span className="tabular">{r.qtyPerUnit}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </div>
          );
        })()
      ) : null}
    </AppShell>
  );
}
