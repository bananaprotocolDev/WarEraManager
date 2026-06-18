// Tipos del dominio económico. Sin dependencias de I/O.

/** Definición de un item del juego (de gameConfig.getGameConfig). */
export interface ItemDef {
  code: string;
  type: "raw" | "product" | "case" | "equipment" | "weapon";
  /** Puntos de producción para fabricar una unidad. */
  productionPoints: number;
  /** Insumos por unidad producida: { itemCode: cantidad }. */
  productionNeeds: Record<string, number>;
}

/** Trabajador (de worker.getWorkers). */
export interface WorkerData {
  wage: number;
}

/** Impuestos del país (de country.getCountryById). Valores en porcentaje (ej. 1 = 1%). */
export interface Taxes {
  income: number;
  market: number;
  selfWork: number;
}

/** Mapa de precios de mercado: { itemCode: precio } (de itemTrading.getPrices). */
export type PriceMap = Record<string, number>;
