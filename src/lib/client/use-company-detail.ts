"use client";
import { useQuery } from "@tanstack/react-query";
import type { CompanyDetail } from "@/server/company-detail";

export async function fetchCompanyDetail(
  companyId: string,
  userId: string,
  token: string | null,
): Promise<CompanyDetail> {
  const headers: Record<string, string> = {};
  if (token) headers["X-API-Key"] = token;
  const res = await fetch(
    `/api/company/${encodeURIComponent(companyId)}?userId=${encodeURIComponent(userId)}`,
    { headers },
  );
  if (!res.ok) throw new Error(`Error al cargar la empresa (HTTP ${res.status})`);
  return (await res.json()) as CompanyDetail;
}

export function useCompanyDetail(companyId: string | null, userId: string | null, token: string | null) {
  return useQuery({
    queryKey: ["company", companyId, userId, Boolean(token)],
    queryFn: () => fetchCompanyDetail(companyId as string, userId as string, token),
    enabled: Boolean(companyId && userId),
  });
}
