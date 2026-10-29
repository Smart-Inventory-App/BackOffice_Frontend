import { describe, expect, it } from "vitest";
import { capitalize, formatDate, formatDateTime, formatThousands, truncate } from "./format";

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

describe("formatThousands", () => {
  it("separa los miles con puntos", () => {
    expect(formatThousands(1234567)).toBe("1.234.567");
    expect(formatThousands(12)).toBe("12");
    expect(formatThousands(0)).toBe("0");
  });
});

describe("formatDateTime (hora argentina)", () => {
  it("pasa un instante en UTC a la hora de Argentina (UTC-3)", () => {
    expect(formatDateTime("2026-10-27T22:30:00Z")).toBe("27/10/2026 19:30");
  });

  it("corre también el día cuando en UTC ya es el siguiente", () => {
    expect(formatDateTime("2026-10-28T01:15:00+00:00")).toBe("27/10/2026 22:15");
  });

  it("un instante sin zona se toma como UTC, que es como lo devuelve la base", () => {
    expect(formatDateTime("2026-10-27T22:30:00")).toBe("27/10/2026 19:30");
  });

  it("sin fecha o con una fecha inválida devuelve un guion", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime("")).toBe("—");
    expect(formatDateTime("no es una fecha")).toBe("—");
  });
});

describe("formatDate", () => {
  it("muestra un vencimiento como día/mes/año sin correrlo por la zona horaria", () => {
    expect(formatDate("2026-10-27")).toBe("27/10/2026");
    expect(formatDate("2026-01-01T00:00:00")).toBe("01/01/2026");
  });

  it("sin fecha o mal formada devuelve un guion", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate("hoy")).toBe("—");
  });
});

describe("capitalize", () => {
  it("pone la inicial en mayúscula", () => {
    expect(capitalize("octubre")).toBe("Octubre");
    expect(capitalize("")).toBe("");
  });
});
