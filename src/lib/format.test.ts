import { describe, expect, it } from "vitest";
import { truncate } from "./format";

describe("truncate", () => {
  it("devuelve un guion largo para null", () => {
    expect(truncate(null)).toBe("—");
  });

  it("devuelve un guion largo para undefined", () => {
    expect(truncate(undefined)).toBe("—");
  });

  it("devuelve un guion largo para string vacío", () => {
    expect(truncate("")).toBe("—");
  });

  it("no toca un texto más corto que el máximo", () => {
    expect(truncate("hola", 10)).toBe("hola");
  });

  it("trunca y agrega puntos suspensivos cuando excede el máximo", () => {
    expect(truncate("0123456789", 5)).toBe("01234...");
  });

  it("usa 50 como máximo por defecto", () => {
    const largo = "a".repeat(60);
    expect(truncate(largo)).toBe(`${"a".repeat(50)}...`);
  });

  it("un texto exactamente del largo máximo no se trunca", () => {
    expect(truncate("12345", 5)).toBe("12345");
  });
});
