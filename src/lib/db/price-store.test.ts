import { describe, it, expect } from "vitest";
import { PostgresPriceHistoryStore } from "./price-store";

/** Fake del ejecutor SQL: registra cada query (template unido por '?') y devuelve filas predefinidas. */
function fakeSql(resultFor: (q: string) => Record<string, unknown>[] = () => []) {
  const queries: string[] = [];
  const sql = async (strings: TemplateStringsArray) => {
    const q = strings.join("?");
    queries.push(q);
    return resultFor(q);
  };
  return { sql: sql as never, queries };
}

describe("PostgresPriceHistoryStore", () => {
  it("getHistory mapea filas a {ts, price} numéricos", async () => {
    const { sql } = fakeSql((q) => (q.includes("SELECT ts") ? [{ ts: "1000", price: "1.5" }] : []));
    const store = new PostgresPriceHistoryStore(sql);
    const h = await store.getHistory("steel", 0);
    expect(h).toEqual([{ ts: 1000, price: 1.5 }]);
  });

  it("recordSnapshot emite un INSERT", async () => {
    const { sql, queries } = fakeSql();
    const store = new PostgresPriceHistoryStore(sql);
    await store.recordSnapshot({ steel: 1.5, iron: 0.1 }, 2000);
    expect(queries.some((q) => /INSERT INTO price_snapshots/i.test(q))).toBe(true);
  });

  it("listItems devuelve los items distintos", async () => {
    const { sql } = fakeSql((q) => (q.includes("DISTINCT") ? [{ item: "steel" }, { item: "iron" }] : []));
    const store = new PostgresPriceHistoryStore(sql);
    expect((await store.listItems()).sort()).toEqual(["iron", "steel"]);
  });
});
