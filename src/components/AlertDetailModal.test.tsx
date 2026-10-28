import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AlertDetailModal from "./AlertDetailModal";
import { FIELD_MAX } from "@/lib/format";
import type { AlertOut } from "@/lib/types";

function alert(overrides: Partial<AlertOut> = {}): AlertOut {
  return {
    key: "expiry-1",
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
    product_brand: "La Serenísima",
    product_category: "Lácteos",
    product_location: "Heladera",
    product_stock: 3,
    product_expiry: "2026-10-30",
    image_url: null,
    user_id: "u1",
    ...overrides,
  };
}

describe("AlertDetailModal", () => {
  it("destaca la alerta con el color de su nivel antes que los datos del producto", () => {
    render(<AlertDetailModal alert={alert()} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Detalle de Alerta" });

    const reason = within(dialog).getByTestId("alert-detail-reason");
    expect(reason).toHaveTextContent("Alerta crítica");
    expect(reason.className).toContain("border-2");
    expect(within(dialog).getByTestId("alert-detail-text").className).toContain("border-l-4");
    const order = reason.compareDocumentPosition(within(dialog).getByTestId("alert-detail-name"));
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("una advertencia predictiva lo dice", () => {
    render(<AlertDetailModal alert={alert({ level: "warning", predictive: true, type: "stock_low_coverage", days_until_stockout: 5 })} onClose={vi.fn()} />);

    expect(screen.getByTestId("alert-detail-reason")).toHaveTextContent("Advertencia · Predicción");
  });

  it("los datos cortos se muestran enteros", () => {
    render(<AlertDetailModal alert={alert()} onClose={vi.fn()} />);

    expect(screen.getByTestId("alert-detail-name")).toHaveTextContent(/^Leche$/);
    expect(screen.getByTestId("alert-detail-brand")).toHaveTextContent("La Serenísima · Lácteos");
    expect(screen.getByTestId("alert-detail-location")).toHaveTextContent("Heladera");
  });

  it("los datos muy largos se cortan a los mismos caracteres que en el resto del dashboard y terminan en «...»", () => {
    const long = "A".repeat(FIELD_MAX + 30);
    render(
      <AlertDetailModal
        alert={alert({ product_name: long, product_brand: long, product_category: long, product_location: long })}
        onClose={vi.fn()}
      />,
    );

    expect(FIELD_MAX).toBe(50);
    const name = screen.getByTestId("alert-detail-name");
    expect(name).toHaveTextContent(`${"A".repeat(FIELD_MAX)}...`);
    expect(name.textContent).toHaveLength(FIELD_MAX + 3);
    expect(name).toHaveAttribute("title", long);
    expect(screen.getByTestId("alert-detail-brand").textContent).toHaveLength(FIELD_MAX + 3);
    expect(screen.getByTestId("alert-detail-brand").textContent!.endsWith("...")).toBe(true);
    expect(screen.getByTestId("alert-detail-location").textContent).toBe(`${"A".repeat(FIELD_MAX)}...`);
  });

  it("sin marca, categoría ni ubicación no muestra esos renglones", () => {
    render(<AlertDetailModal alert={alert({ product_brand: null, product_category: null, product_location: null })} onClose={vi.fn()} />);

    expect(screen.queryByTestId("alert-detail-brand")).not.toBeInTheDocument();
    expect(screen.queryByTestId("alert-detail-location")).not.toBeInTheDocument();
  });
});

describe("AlertDetailModal · tipografía", () => {
  it("el texto de la alerta no va en negrita fuerte", () => {
    render(<AlertDetailModal alert={alert()} onClose={vi.fn()} />);

    const title = within(screen.getByTestId("alert-detail-reason")).getByText("Vence en 2 días");
    expect(title.className).toContain("font-medium");
    expect(title.className).not.toMatch(/font-(bold|extrabold)/);
    expect(screen.getByTestId("alert-detail-text").querySelector("p")!.className).not.toMatch(/font-(bold|extrabold)/);
  });
});

describe("AlertDetailModal · marca «Predicción»", () => {
  it("la marca lleva delante el mismo símbolo que en la app", () => {
    render(<AlertDetailModal alert={alert({ predictive: true })} onClose={vi.fn()} />);

    const badge = screen.getByTestId("alert-detail-prediction");
    expect(badge).toHaveTextContent("Predicción");
    expect(badge.firstElementChild).toBe(within(badge).getByTestId("prediction-icon"));
  });
});
