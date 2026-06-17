"use client";
import { useQuery } from "@tanstack/react-query";
import type { PriceMap } from "@/lib/economy";

export async function fetchPrices(): Promise<PriceMap> {
  const res = await fetch("/api/prices");
  if (!res.ok) throw new Error(`Error al cargar los precios (HTTP ${res.status})`);
  return (await res.json()) as PriceMap;
}

export function usePrices() {
  return useQuery({ queryKey: ["prices"], queryFn: fetchPrices });
}
