"use client";
import { useQuery } from "@tanstack/react-query";
import type { Portfolio } from "@/server/portfolio";

export async function fetchPortfolio(userId: string, token: string | null): Promise<Portfolio> {
  const headers: Record<string, string> = {};
  if (token) headers["X-API-Key"] = token;
  const res = await fetch(`/api/report?userId=${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) throw new Error(`Error al cargar la cartera (HTTP ${res.status})`);
  return (await res.json()) as Portfolio;
}

export function usePortfolio(userId: string | null, token: string | null) {
  return useQuery({
    queryKey: ["portfolio", userId, Boolean(token)],
    queryFn: () => fetchPortfolio(userId as string, token),
    enabled: Boolean(userId),
  });
}
