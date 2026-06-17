"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { CompanyCard } from "@/components/dashboard/company-card";
import { PortfolioAlerts } from "@/components/dashboard/portfolio-alerts";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { usePortfolio } from "@/lib/client/use-portfolio";
import { getUserId, getToken } from "@/lib/client/token-store";
import { formatPerDay } from "@/lib/format";

export default function DashboardPage() {
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

  const { data, isLoading, isError, error } = usePortfolio(userId, token);

  return (
    <AppShell hasToken={Boolean(token)}>
      {isLoading || !userId ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Spinner /> Cargando tu cartera…
        </div>
      ) : isError ? (
        <Card className="cursor-default border-destructive/40">
          <p className="text-destructive">No se pudo cargar: {(error as Error).message}</p>
        </Card>
      ) : data && data.companies.length === 0 ? (
        <Card className="cursor-default text-center text-muted-foreground">
          No encontramos empresas para este usuario.
        </Card>
      ) : data ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Total neto / día"
              value={formatPerDay(data.totalNetProfit)}
              hint={data.estimated ? "estimado (sin calibrar)" : undefined}
            />
            <StatCard label="Empresas" value={String(data.companies.length)} />
            <StatCard
              label="Salarios"
              value={data.wagesAvailable ? "incluidos" : "no disponibles"}
              hint={data.wagesAvailable ? undefined : "agregá tu token"}
            />
          </div>
          <PortfolioAlerts portfolio={data} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.companies.map((c) => (
              <CompanyCard key={c.id} company={c} />
            ))}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
