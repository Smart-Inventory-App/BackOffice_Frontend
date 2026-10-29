import { describe, expect, it } from "vitest";
import { alertDescription, alertDetails, alertTitle, expiryDate, whenText } from "./alertInfo";
import type { AlertOut } from "./types";

function alert(overrides: Partial<AlertOut> = {}): AlertOut {
  return {
    key: "k",
    product_id: 1,
    type: "expiry",
    level: "critical",
    origin: "rule",
    days_to_expiry: 2,
    days_until_stockout: null,
    units_wasted: null,
    suggested_qty: null,
    limit_days: 7,
    rule_scope: "general",
    predictive: false,
    product_name: "Leche",
    product_brand: null,
    product_category: null,
    product_location: null,
    product_stock: 3,
    product_expiry: "2026-11-05",
    image_url: null,
    user_id: null,
    ...overrides,
  };
}

const stock = (overrides: Partial<AlertOut> = {}) =>
  alert({ type: "stock_low_coverage", predictive: true, days_until_stockout: 3, days_to_expiry: null, product_stock: 2, ...overrides });
const slow = (overrides: Partial<AlertOut> = {}) =>
  alert({ type: "slow_pace", origin: "system", predictive: true, units_wasted: 4, days_to_expiry: 20, ...overrides });

describe("whenText y expiryDate", () => {
  it("nunca dice «en 0 días»", () => {
    expect(whenText(0)).toBe("hoy");
    expect(whenText(-3)).toBe("hoy");
    expect(whenText(1)).toBe("mañana");
    expect(whenText(5)).toBe("en 5 días");
  });

  it("escribe el vencimiento como «5 de noviembre»", () => {
    expect(expiryDate("2026-11-05")).toBe("5 de noviembre");
  });
});

describe("alertTitle", () => {
  it("dice qué le pasa al producto", () => {
    expect(alertTitle(alert({ days_to_expiry: 5 }))).toBe("Vence en 5 días");
    expect(alertTitle(alert({ days_to_expiry: 1 }))).toBe("Vence mañana");
    expect(alertTitle(alert({ days_to_expiry: 0 }))).toBe("Vence hoy");
    expect(alertTitle(alert({ days_to_expiry: -1 }))).toBe("Venció ayer");
    expect(alertTitle(alert({ days_to_expiry: -4 }))).toBe("Venció hace 4 días");
    expect(alertTitle(stock())).toBe("Se agota en 3 días");
    expect(alertTitle(stock({ days_until_stockout: 0 }))).toBe("Se agota hoy");
    expect(alertTitle(slow())).toBe("Riesgo de vencimiento");
    expect(alertTitle(alert({ type: "x" as any }))).toBe("Información");
  });
});

describe("alertDescription", () => {
  it("vencimiento: la fecha, lo que queda y la regla del usuario", () => {
    expect(alertDescription(alert())).toBe("Vence el 5 de noviembre. Quedan 3 ud. y tu aviso es con menos de 7 días.");
    expect(alertDescription(alert({ product_stock: 1, limit_days: null }))).toBe("Vence el 5 de noviembre. Queda 1 ud. en stock.");
    expect(alertDescription(alert({ days_to_expiry: -2 }))).toBe("Venció el 5 de noviembre. Quedan 3 ud. que ya no conviene consumir.");
  });

  it("stock: «Quedan X ud. restantes que alcanzan para x días. Mínimo configurado de X días.»", () => {
    expect(alertDescription(stock())).toBe("Quedan 2 ud. restantes que alcanzan para 3 días. Mínimo configurado de 7 días.");
    expect(alertDescription(stock({ product_stock: 1, days_until_stockout: 1, limit_days: 1 }))).toBe(
      "Queda 1 ud. restante que alcanza para 1 día. Mínimo configurado de 1 día.",
    );
    expect(alertDescription(stock({ days_until_stockout: 0, limit_days: null }))).toBe(
      "Quedan 2 ud. restantes que alcanzan para menos de 1 día.",
    );
  });

  it("ritmo lento: cuántas unidades se vencerán y cuándo", () => {
    expect(alertDescription(slow())).toBe("Al ritmo actual, 4 unidades se vencerán en 20 días.");
    expect(alertDescription(slow({ units_wasted: 1, days_to_expiry: 1 }))).toBe("Al ritmo actual, 1 unidad se vencerá mañana.");
  });

  it("un tipo desconocido no tiene descripción", () => {
    expect(alertDescription(alert({ type: "x" as any }))).toBe("");
  });
});

describe("alertDetails", () => {
  it("vencimiento próximo: explica la regla y que conviene usarlo primero", () => {
    const text = alertDetails(alert()).join(" ");

    expect(text).toContain("Vence el 5 de noviembre, en 2 días.");
    expect(text).toContain("Te avisamos cuando faltan menos de 7 días para el vencimiento (tu regla general).");
    expect(text).toContain("Ya está dentro de ese período: conviene usarlo primero.");
  });

  it("vence hoy y mañana", () => {
    expect(alertDetails(alert({ days_to_expiry: 0 }))[0]).toBe("Vence hoy, 5 de noviembre.");
    expect(alertDetails(alert({ days_to_expiry: 1 }))[0]).toBe("Vence mañana, 5 de noviembre.");
  });

  it("producto ya vencido: no dice «te avisamos cuando faltan menos de...»", () => {
    const text = alertDetails(alert({ days_to_expiry: -2 })).join(" ");

    expect(text).toContain("Venció el 5 de noviembre (hace 2 días).");
    expect(text).toContain("Ya no conviene consumirlo.");
    expect(text).not.toMatch(/te avisamos/i);
    expect(alertDetails(alert({ days_to_expiry: -1 }))[0]).toBe("Venció el 5 de noviembre (ayer).");
  });

  it("advertencia de vencimiento y regla propia del producto", () => {
    const text = alertDetails(alert({ level: "warning", rule_scope: "product", days_to_expiry: 9, limit_days: 5, product_stock: 1 })).join(" ");

    expect(text).toContain("Queda 1 unidad en stock.");
    expect(text).toContain("(la regla de este producto)");
    expect(text).toContain("Todavía no llegó a ese período, pero se acerca.");
  });

  it("stock: cuánto alcanza, el mínimo, la reposición sugerida y que es una predicción", () => {
    const text = alertDetails(stock({ suggested_qty: 12 })).join(" ");

    expect(text).toContain("Con el consumo, las 2 unidades que quedan alcanzan para 3 días.");
    expect(text).toContain("El mínimo es de 7 días (tu regla general): está por debajo de él.");
    expect(text).toContain("se sugiere reponer 12 unidades");
    expect(text).toContain("Calculado por el modelo predictivo");
  });

  it("stock en advertencia, con una sola unidad, sin mínimo ni reposición", () => {
    const text = alertDetails(stock({ level: "warning", product_stock: 1, limit_days: null, days_until_stockout: 0 })).join(" ");

    expect(text).toContain("la unidad que queda alcanza para menos de 1 día");
    expect(text).not.toContain("mínimo");
    expect(text).not.toContain("se sugiere");
    expect(alertDetails(stock({ level: "warning" })).join(" ")).toContain("se está acercando.");
  });

  it("ritmo lento: explica por qué y, si es crítica, que ya está dentro del período de aviso", () => {
    const critical = alertDetails(slow()).join(" ");
    const single = alertDetails(slow({ level: "warning", units_wasted: 1, days_to_expiry: 1 })).join(" ");

    expect(critical).toContain("más lento de lo que tarda en vencer, y esas unidades quedarían sin usar.");
    expect(critical).toContain("Su vencimiento ya está dentro del período de aviso.");
    expect(single).toContain("esa unidad quedaría sin usar");
    expect(single).not.toContain("período de aviso");
  });

  it("un tipo desconocido no tiene detalle", () => {
    expect(alertDetails(alert({ type: "x" as any }))).toEqual([]);
  });
});
