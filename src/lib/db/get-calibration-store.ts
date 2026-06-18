import { neon } from "@neondatabase/serverless";
import { PostgresCalibrationStore } from "./calibration-store";
import type { CalibrationStore } from "./calibration-store";
import type { SqlExec } from "./price-store";

let instance: CalibrationStore | null = null;

export function getCalibrationStore(): CalibrationStore {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL no está configurada");
    instance = new PostgresCalibrationStore(neon(url) as unknown as SqlExec);
  }
  return instance;
}
