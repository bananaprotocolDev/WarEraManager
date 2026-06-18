import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SqliteCalibrationStore } from "./calibration-store";
import type { CalibrationStore } from "./calibration-store";

let instance: CalibrationStore | null = null;

export function getCalibrationStore(): CalibrationStore {
  if (!instance) {
    const path = process.env.PRICE_DB_PATH ?? "data/prices.db";
    mkdirSync(dirname(path), { recursive: true });
    instance = new SqliteCalibrationStore(path);
  }
  return instance;
}
