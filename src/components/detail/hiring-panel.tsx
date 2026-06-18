import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserPlus, CheckCircle2, XCircle } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { HiringRecommendation } from "@/lib/economy";

const REASON: Record<string, string> = {
  item_unprofitable: "El producto no deja margen: no conviene producir.",
  no_slots: "No hay slots libres (subí la Sala de descanso).",
  no_demand: "Ya producís más de lo que vendés: contratar solo llenaría el almacén.",
  ok: "Conviene contratar.",
};

export function HiringPanel({ hiring }: { hiring: HiringRecommendation }) {
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

      {hiring.viable ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Salario máx /punto</dt>
          <dd className="tabular text-right">{formatMoney(hiring.maxWagePerPoint)}</dd>
          <dt className="text-muted-foreground">Salario sugerido /punto</dt>
          <dd className="tabular text-right text-accent">{formatMoney(hiring.suggestedWage)}</dd>
          <dt className="text-muted-foreground">Slots libres</dt>
          <dd className="tabular text-right">{hiring.freeSlots}</dd>
          <dt className="text-muted-foreground">Ganancia extra/día (est.)</dt>
          <dd className="tabular text-right text-success">
            {formatMoney(hiring.expectedDailyGain)}
            {!hiring.demandKnown ? (
              <span className="ml-1 text-xs font-sans text-muted-foreground">(supuesto)</span>
            ) : null}
          </dd>
        </dl>
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
    </Card>
  );
}
