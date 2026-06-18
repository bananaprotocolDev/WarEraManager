"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, User, HelpCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { setUserId, setToken, clearToken } from "@/lib/client/token-store";

export default function OnboardingPage() {
  const router = useRouter();
  const [userId, setUserIdInput] = useState("");
  const [token, setTokenInput] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId.trim()) return;
    setUserId(userId.trim());
    if (token.trim()) setToken(token.trim());
    else clearToken();
    router.push("/dashboard");
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <h1 className="mb-2 font-mono text-2xl font-bold">
        WarEra<span className="text-accent">Manager</span>
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Pegá tu user ID de WarEra para ver el rendimiento de tus empresas. El token es opcional
        (habilita los salarios) y se guarda solo en esta pestaña.
      </p>
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <User className="h-4 w-4" aria-hidden="true" /> User ID <span className="text-destructive">*</span>
            </span>
            <input
              value={userId}
              onChange={(e) => setUserIdInput(e.target.value)}
              placeholder="6a30f0e6a38931d3ab4ef9cc"
              autoComplete="off"
              className="tabular h-11 rounded-lg border border-border bg-surface-2 px-4 outline-none focus:ring-2 focus:ring-ring"
              required
            />
            <span className="text-xs text-muted-foreground">Lo encontrás en la URL de tu perfil en WarEra.</span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <KeyRound className="h-4 w-4" aria-hidden="true" /> API token{" "}
              <span className="text-muted-foreground">(opcional)</span>
            </span>
            <input
              value={token}
              onChange={(e) => setTokenInput(e.target.value)}
              type="password"
              placeholder="Settings → API Tokens"
              autoComplete="current-password"
              className="h-11 rounded-lg border border-border bg-surface-2 px-4 outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-xs text-muted-foreground">
              Sin token no se ven los salarios y el beneficio queda sobreestimado.
            </span>
          </label>
          <Button type="submit" disabled={!userId.trim()}>
            Ver mi cartera
          </Button>
        </form>
      </Card>
      <details className="mt-4 rounded-lg border border-border bg-surface p-4 text-sm">
        <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
          <HelpCircle className="h-4 w-4" aria-hidden="true" /> ¿Cómo consigo mi API token?
        </summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted-foreground">
          <li>Iniciá sesión en <span className="font-mono">app.warera.io</span>.</li>
          <li>Abrí <span className="text-foreground">Settings</span> (Configuración) desde tu perfil.</li>
          <li>Entrá a la sección <span className="text-foreground">API Tokens</span>.</li>
          <li>Creá un token nuevo y copialo.</li>
          <li>Pegalo en el campo <span className="text-foreground">API token</span> de arriba.</li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          El token es de solo lectura y se guarda únicamente en esta pestaña del navegador. Sin token
          igual ves tus empresas; con token se incluyen los salarios y podés calibrar.
        </p>
      </details>
    </div>
  );
}
