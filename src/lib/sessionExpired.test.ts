import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSessionExpired, markSessionExpired, sessionExpired } from "./sessionExpired";

describe("sessionExpired", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("empieza sin aviso", () => {
    expect(sessionExpired()).toBe(false);
  });

  it("se anota, se lee y se borra", () => {
    markSessionExpired();
    expect(sessionExpired()).toBe(true);

    clearSessionExpired();
    expect(sessionExpired()).toBe(false);
  });

  it("sin almacenamiento disponible no rompe nada: simplemente no hay aviso", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });

    expect(() => markSessionExpired()).not.toThrow();
    expect(sessionExpired()).toBe(false);
    expect(() => clearSessionExpired()).not.toThrow();
  });
});
