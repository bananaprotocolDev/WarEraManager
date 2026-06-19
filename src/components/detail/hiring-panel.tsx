import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserPlus, CheckCircle2, XCircle, Link2 } from "lucide-react";
import { formatMoney, formatPerDay } from "@/lib/format";
import type { HiringRecommendation } from "@/lib/economy";
import type { ChainNet } from "@/lib/economy";

const REASON: Record<string, string> = {
  item_unprofitable: "El producto no deja margen: no conviene producir.",
  no_slots: "No hay cupos libres (subí los cupos de trabajadores).",
  no_demand: "Ya producís más de lo que vendés: contratar solo llenaría el almacén.",
  market_expensive: "El mercado laboral está caro: el sueldo supera lo que aporta el trabajador.",
  ok: "El margen cubre el sueldo de mercado: podés contratar rentablemente.",
};

export function HiringPanel({ hiring, chain }: { hiring: HiringRecommendation; chain: ChainNet | null }) {
  const net = hiring.netPerWorkerPerDay;
  return (
    <Card className="cursor-default">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <UserPlus className="h-4 w-4" aria-hidden="true" /> Contratación
      </h2>
      <div className="flex items-center gap-2">
        {hiring.viable ? (
          <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
        ) : (
          <XCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
        )}
        <span className={hiring.viable ? "font-medium text-success" : "font-medium text-destructive"}>
          {hiring.viable ? "Conviene contratar" : "No conviene"}
        </span>
        {!hiring.demandKnown ? <Badge tone="warning">venta supuesta</Badge> : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{REASON[hiring.reason]}</p>

      <div className={`mt-3 tabular text-2xl font-bold ${net >= 0 ? "text-success" : "text-destructive"}`}>
        {formatPerDay(net)} <span className="text-xs font-normal text-muted-foreground">/ trabajador/día</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        costo laboral: ~{formatMoney(hiring.marketWagePerDay)}/día · aporte: ~{formatMoney(hiring.addsPerDay)}/día
      </p>
      <p className="text-xs text-muted-foreground">
        salario máx pagable ~{formatMoney(hiring.maxWagePerPoint)}/punto
      </p>
      {!hiring.marketDataAvailable ? (
        <p className="mt-1 text-xs text-warning">Sin datos de mercado laboral: el neto es solo el aporte (sin sueldo descontado).</p>
      ) : null}

      {hiring.viable ? (
        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3 text-sm">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Perfil sugerido</div>
          <div className="flex flex-wrap gap-2">
            <Badge>min producción: {hiring.recommendedProfile.minProduction}</Badge>
            <Badge>min energía: {hiring.recommendedProfile.minEnergy}</Badge>
            <Badge>min nivel: {hiring.recommendedProfile.minLevel}</Badge>
          </div>
        </div>
      ) : null}

      {chain ? (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          Parte de la cadena <span className="font-mono">{chain.steps.join("→")}</span> · neto cadena{" "}
          <span className={chain.netPerDay >= 0 ? "text-success" : "text-destructive"}>{formatPerDay(chain.netPerDay)}</span>
          {" "}· mejor destino del raw: {chain.bestRawDestination === "sell" ? "vender" : "procesar"}
        </p>
      ) : null}
    </Card>
  );
}
