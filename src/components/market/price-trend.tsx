"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Spinner } from "@/components/ui/spinner";
import { usePriceHistory } from "@/lib/client/use-price-history";
import { useReducedMotion } from "@/lib/ui/use-reduced-motion";
import { formatMoney } from "@/lib/format";

export function PriceTrend({ item }: { item: string }) {
  const { data, isLoading, isError } = usePriceHistory(item);
  const reduced = useReducedMotion();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
        <Spinner /> Cargando tendencia…
      </div>
    );
  }
  if (isError) return <p className="py-6 text-sm text-destructive">No se pudo cargar la tendencia.</p>;

  const points = (data?.points ?? []).map((p) => ({
    t: new Date(p.ts).toLocaleDateString("es", { day: "2-digit", month: "2-digit" }),
    price: p.price,
  }));

  if (points.length < 2) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        Aún no hay suficientes datos de <span className="font-mono">{item}</span>. El histórico se va
        llenando con cada snapshot.
      </p>
    );
  }

  const first = points[0].price;
  const last = points[points.length - 1].price;
  const summary = `Tendencia de ${item}: de ${formatMoney(first)} a ${formatMoney(last)} en ${points.length} puntos.`;

  return (
    <div role="img" aria-label={summary}>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="#232c3b" strokeDasharray="3 3" />
            <XAxis dataKey="t" stroke="#8b97a7" fontSize={12} />
            <YAxis stroke="#8b97a7" fontSize={12} />
            <Tooltip
              contentStyle={{ background: "#121822", border: "1px solid #232c3b", borderRadius: 8, color: "#e6edf3" }}
              formatter={(v) => (typeof v === "number" ? formatMoney(v) : String(v))}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              isAnimationActive={!reduced}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
