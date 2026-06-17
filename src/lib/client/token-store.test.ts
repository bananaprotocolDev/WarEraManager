// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { getToken, setToken, clearToken, getUserId, setUserId } from "./token-store";

beforeEach(() => sessionStorage.clear());

describe("token-store", () => {
  it("guarda y lee el token", () => {
    expect(getToken()).toBeNull();
    setToken("abc");
    expect(getToken()).toBe("abc");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("guarda y lee el userId", () => {
    expect(getUserId()).toBeNull();
    setUserId("u1");
    expect(getUserId()).toBe("u1");
  });
});
