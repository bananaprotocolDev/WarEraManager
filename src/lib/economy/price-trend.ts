export type Trend = "up" | "down" | "flat";

export interface PricePointLite {
  ts: number;
  price: number;
}

export interface PriceTrendInfo {
  current: number;
  avg: number;
  trend: Trend;
}

/** Promedio de precios de una serie; null si está vacía. */
export function averagePrice(points: PricePointLite[]): number | null {
  if (points.length === 0) return null;
  return points.reduce((sum, p) => sum + p.price, 0) / points.length;
}

/** Clasifica la tendencia del precio actual vs el promedio (umbral relativo, default 3%). */
export function priceTrend(current: number, avg: number, thresholdPct = 0.03): PriceTrendInfo {
  let trend: Trend = "flat";
  if (avg > 0) {
    if (current > avg * (1 + thresholdPct)) trend = "up";
    else if (current < avg * (1 - thresholdPct)) trend = "down";
  }
  return { current, avg, trend };
}
