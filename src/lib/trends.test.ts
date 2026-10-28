import { describe, expect, it } from "vitest";
import {
  TREND_PERIODS,
  averagePerDay,
  barHeight,
  changeVsPrevious,
  formatDayLong,
  formatDayMonth,
  formatDayShort,
  labelStep,
  monthSegments,
  parseDay,
  peakIndex,
} from "./trends";

const days = (quantities: number[], start = "2026-10-20") =>
  quantities.map((quantity, i) => {
    const date = parseDay(start);
    date.setDate(date.getDate() + i);
    return {
      day: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      quantity,
    };
  });

describe("trends", () => {
  it("ofrece 7, 14, 30 y 90 días (el 90 es solo del dashboard)", () => {
    expect([...TREND_PERIODS]).toEqual([7, 14, 30, 90]);
  });

  it("parseDay arma la fecha local sin correrla de día", () => {
    const date = parseDay("2026-10-22T23:59:00");
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 9, 22]);
  });

  it("escribe el día de varias formas, sin coma después del día de la semana", () => {
    expect(formatDayLong("2026-10-22")).toBe("Jueves 22 de octubre");
    expect(formatDayMonth("2026-10-22")).toBe("22 de octubre");
    expect(formatDayMonth("2026-09-03")).toBe("3 de septiembre");
    expect(formatDayShort("2026-10-22")).toMatch(/^22 oct/);
  });

  it("el día pico es el de mayor consumo (el primero si hay empate) o null si no hubo consumo", () => {
    expect(peakIndex(days([0, 3, 7, 7, 1]))).toBe(2);
    expect(peakIndex(days([0, 0, 0]))).toBeNull();
    expect(peakIndex([])).toBeNull();
  });

  it("el promedio por día lleva un decimal", () => {
    expect(averagePerDay(10, 14)).toBe(0.7);
    expect(averagePerDay(30, 30)).toBe(1);
    expect(averagePerDay(5, 0)).toBe(0);
  });

  it("compara con el período anterior: más, menos, igual o nada", () => {
    expect(changeVsPrevious(15, 10)).toEqual({ direction: "up", percent: 50 });
    expect(changeVsPrevious(5, 10)).toEqual({ direction: "down", percent: 50 });
    expect(changeVsPrevious(10, 10)).toEqual({ direction: "same", percent: 0 });
    expect(changeVsPrevious(10, 0)).toBeNull();
    expect(changeVsPrevious(10, null)).toBeNull();
  });

  it("agrupa los días seguidos por mes", () => {
    const segments = monthSegments(days([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], "2026-10-28"));

    expect(segments.map((s) => [s.long, s.count])).toEqual([
      ["Octubre", 4],
      ["Noviembre", 8],
    ]);
    expect(segments[1].short).toMatch(/^Nov/);
    expect(monthSegments([])).toEqual([]);
  });

  it("cada cuántos días se escribe el número según lo ancha que queda la barra", () => {
    expect([24, 16, 15, 10, 9, 1].map(labelStep)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it("el alto de una barra es proporcional, con un mínimo para que un día sin consumo se vea", () => {
    expect(barHeight(10, 10, 100)).toBe(100);
    expect(barHeight(5, 10, 100)).toBe(50);
    expect(barHeight(0, 10, 100)).toBe(3);
    expect(barHeight(1, 1000, 100)).toBe(3);
    expect(barHeight(5, 0, 100)).toBe(3);
  });
});
