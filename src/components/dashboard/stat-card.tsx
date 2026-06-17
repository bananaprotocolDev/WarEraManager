import { Card } from "@/components/ui/card";

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="cursor-default">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="tabular mt-1 text-3xl font-bold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}
