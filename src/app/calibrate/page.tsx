"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SlidersHorizontal, KeyRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getUserId, getToken } from "@/lib/client/token-store";
import { runCalibrate } from "@/lib/client/use-calibrate";
import type { CalibrationResult } from "@/server/calibrate";
import { formatMoney } from "@/lib/format";

export default function CalibratePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CalibrationResult | null>(null);

  useEffect(() => {
    const id = getUserId();
    if (!id) {
      router.replace("/onboarding");
      return;
    }
    setUserId(id);
    setToken(getToken());
  }, [router]);

  async function calibrate() {
    if (!userId || !token) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await runCalibrate(userId, token, 7));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell hasToken={Boolean(token)}>
      <h1 className="mb-2 flex items-center gap-2 text-xl font-bold">
        <SlidersHorizontal className="h-5 w-5" aria-hidden="true" /> Calibración
      </h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Compara lo que tus empresas producen contra lo que realmente vendiste (últimos 7 días) para
        ajustar las cifras. Los precios no afectan este cálculo (se mide por unidades).
      </p>

      {!token ? (
        <Card className="cursor-default">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Necesitás tu API token para calibrar.{" "}
            <Link href="/onboarding" className="rounded-sm text-accent underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Agregarlo
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <Button onClick={calibrate} disabled={loading}>
            {loading ? "Calibrando…" : "Calibrar con mis ventas"}
          </Button>

          {loading ? (
            <div className="mt-6 flex items-center gap-2 text-muted-foreground">
              <Spinner /> Analizando tus transacciones…
            </div>
          ) : error ? (
            <Card className="mt-6 cursor-default border-destructive/40">
              <p className="text-destructive">{error}</p>
            </Card>
          ) : result ? (
            <div className="mt-6 flex flex-col gap-4">
              {result.ok ? (
                <Card className="cursor-default border-success/40">
                  <p className="font-medium text-success">Calibrado ✓</p>
                  <p className="tabular mt-1 text-2xl font-bold">factor {result.factor.toFixed(3)}</p>
                  <p className="text-xs text-muted-foreground">
                    Basado en {result.samples} empresa(s) con ventas. Las cifras ya no son estimadas.
                  </p>
                </Card>
              ) : (
                <Card className="cursor-default border-warning/40">
                  <p className="text-warning">Datos insuficientes para calibrar.</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    No encontramos ventas tuyas en los últimos 7 días. Vendé algo y volvé a intentar.
                  </p>
                </Card>
              )}

              {result.rows.length > 0 ? (
                <Card className="cursor-default overflow-x-auto p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Item</th>
                        <th className="px-4 py-3 text-right font-medium">Producción/día</th>
                        <th className="px-4 py-3 text-right font-medium">Vendido/día</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((r) => (
                        <tr key={r.itemCode} className="border-b border-border last:border-0">
                          <td className="px-4 py-2.5 font-mono">{r.itemCode}</td>
                          <td className="tabular px-4 py-2.5 text-right">{formatMoney(r.modeledPerDay)}</td>
                          <td className="tabular px-4 py-2.5 text-right">{formatMoney(r.realizedPerDay)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
