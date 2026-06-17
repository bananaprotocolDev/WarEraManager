import { describe, it, expect } from "vitest";
import { sortBy } from "./sort-table";

const rows = [
  { name: "b", v: 2 },
  { name: "a", v: 3 },
  { name: "c", v: 1 },
];

describe("sortBy", () => {
  it("ordena numérico descendente", () => {
    expect(sortBy(rows, "v", "desc").map((r) => r.v)).toEqual([3, 2, 1]);
  });
  it("ordena numérico ascendente", () => {
    expect(sortBy(rows, "v", "asc").map((r) => r.v)).toEqual([1, 2, 3]);
  });
  it("ordena texto ascendente", () => {
    expect(sortBy(rows, "name", "asc").map((r) => r.name)).toEqual(["a", "b", "c"]);
  });
  it("no muta el array original", () => {
    const copy = [...rows];
    sortBy(rows, "v", "asc");
    expect(rows).toEqual(copy);
  });
});
