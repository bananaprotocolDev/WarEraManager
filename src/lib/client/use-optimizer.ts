"use client";
import { useQuery } from "@tanstack/react-query";
import type { OptimizerResult } from "@/server/optimizer";

export async function fetchOptimizer(): Promise<OptimizerResult> {
  const res = await fetch("/api/optimizer");
  if (!res.ok) throw new Error(`Error al cargar el optimizador (HTTP ${res.status})`);
  return (await res.json()) as OptimizerResult;
}

export function useOptimizer() {
  return useQuery({ queryKey: ["optimizer"], queryFn: fetchOptimizer });
}
