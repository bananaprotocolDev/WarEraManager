import { GAME_CONSTANTS, type GameConstants } from "@/lib/game-constants";
import type { Calibration } from "@/lib/db/calibration-store";
import { getCalibrationStore } from "@/lib/db/get-calibration-store";

/** Constantes del juego a partir de una calibración (pura, testeable). */
export function gameConstantsFrom(c: Calibration | null): GameConstants {
  if (c && c.factor > 0) {
    return { productionToUnitsPerDay: c.factor, calibrated: true };
  }
  return GAME_CONSTANTS;
}

/** Carga las constantes vigentes desde el store de calibración (server). */
export function getGameConstants(): GameConstants {
  return gameConstantsFrom(getCalibrationStore().get());
}
