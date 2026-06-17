import { describe, it, expect } from "vitest";
import { SqlitePriceStore } from "./price-store";

function store() {
  return new SqlitePriceStore(":memory:");
}

describe("SqlitePriceStore", () => {
  it("guarda un snapshot y devuelve el histórico de un item", () => {
    const s = store();
    s.recordSnapshot({ bread: 1.5, grain: 0.1 }, 1000);
    s.recordSnapshot({ bread: 1.6, grain: 0.1 }, 2000);
    const h = s.getHistory("bread", 0);
    expect(h).toEqual([
      { ts: 1000, price: 1.5 },
      { ts: 2000, price: 1.6 },
    ]);
  });

  it("filtra por `since`", () => {
    const s = store();
    s.recordSnapshot({ bread: 1.5 }, 1000);
    s.recordSnapshot({ bread: 1.6 }, 2000);
    expect(s.getHistory("bread", 1500)).toEqual([{ ts: 2000, price: 1.6 }]);
  });

  it("devuelve [] para un item sin datos", () => {
    expect(store().getHistory("nada", 0)).toEqual([]);
  });

  it("lista los items con histórico", () => {
    const s = store();
    s.recordSnapshot({ bread: 1.5, grain: 0.1 }, 1000);
    expect(s.listItems().sort()).toEqual(["bread", "grain"]);
  });
});
