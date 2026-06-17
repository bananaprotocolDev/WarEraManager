import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Lock } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { isOverpaid } from "@/lib/ui/worker-status";

export function WorkersPanel({
  workers,
  wagesAvailable,
  maxWage,
}: {
  workers: { wage: number }[];
  wagesAvailable: boolean;
  maxWage: number;
}) {
  return (
    <Card className="cursor-default">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Trabajadores</h2>
      {!wagesAvailable ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" aria-hidden="true" /> Agregá tu API token para ver los salarios.
        </div>
      ) : workers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin trabajadores contratados.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {workers.map((w, i) => {
            const over = isOverpaid(w.wage, maxWage);
            return (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Trabajador {i + 1}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular">{formatMoney(w.wage)}</span>
                  {over ? <Badge tone="warning">sobrepagado</Badge> : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-1.5 text-xs text-accent">
        <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Salario máximo recomendado: {formatMoney(maxWage)} (estimado)
      </div>
    </Card>
  );
}
