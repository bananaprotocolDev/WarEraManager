import type { ItemDef } from "./types";

const VALID_TYPES: ItemDef["type"][] = ["raw", "product", "case", "equipment", "weapon"];

interface RawItem {
  type: string;
  productionPoints: number;
  productionNeeds: Record<string, number>;
  rarity?: string;
}

/** Convierte un item crudo de gameConfig en un ItemDef del dominio económico. */
export function toItemDef(code: string, raw: RawItem): ItemDef {
  const type = (VALID_TYPES as string[]).includes(raw.type)
    ? (raw.type as ItemDef["type"])
    : "product";
  return {
    code,
    type,
    productionPoints: raw.productionPoints,
    productionNeeds: raw.productionNeeds,
    rarity: raw.rarity ?? "common",
  };
}
