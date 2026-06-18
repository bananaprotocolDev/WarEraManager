"use client";
import type { CalibrationResult } from "@/server/calibrate";

export async function runCalibrate(userId: string, token: string, days = 7): Promise<CalibrationResult> {
  const res = await fetch(`/api/calibrate?userId=${encodeURIComponent(userId)}&days=${days}`, {
    headers: { "X-API-Key": token },
  });
  if (!res.ok) throw new Error(`Error al calibrar (HTTP ${res.status})`);
  return (await res.json()) as CalibrationResult;
}
