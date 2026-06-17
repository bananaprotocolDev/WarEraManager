"use client";
import { useQuery } from "@tanstack/react-query";
import type { PricePoint } from "@/lib/db/price-store";

export interface PriceHistory {
  item: string;
  points: PricePoint[];
}

export async function fetchPriceHistory(item: string): Promise<PriceHistory> {
  const res = await fetch(`/api/prices/history?item=${encodeURIComponent(item)}`);
  if (!res.ok) throw new Error(`Error al cargar el histórico (HTTP ${res.status})`);
  return (await res.json()) as PriceHistory;
}

export function usePriceHistory(item: string | null) {
  return useQuery({
    queryKey: ["price-history", item],
    queryFn: () => fetchPriceHistory(item as string),
    enabled: Boolean(item),
  });
}
