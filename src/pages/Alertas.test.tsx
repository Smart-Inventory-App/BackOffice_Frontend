import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/test-utils";
import Alertas from "./Alertas";
import type { AlertOut, AlertSummary } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

import { api } from "@/lib/api";

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
    product_name: "Yerba Mate",
    product_brand: "La Merced",
    product_category: "Almacén",
    product_location: "Alacena",
    product_stock: 3,
    product_expiry: "2026-11-01",
    image_url: null,
    user_id: "u1",
    ...overrides,
  };
}

const ALERTS: AlertOut[] = [
  alert(),
  alert({ key: "expiry-2", product_id: 2, level: "warning", product_name: "Leche", days_to_expiry: 9, product_expiry: "2026-11-08" }),
  alert({
    key: "stock_low_coverage-5", product_id: 3, type: "stock_low_coverage", level: "critical", predictive: true,
    days_until_stockout: 3, suggested_qty: 12, limit_days: 7, product_name: "Arroz", product_stock: 2,
  }),
  alert({
    key: "slow_pace-6", product_id: 4, type: "slow_pace", level: "warning", origin: "system", predictive: true,
    units_wasted: 4, days_to_expiry: 20, product_name: "Fideos",
  }),
];

function summaryOf(items: AlertOut[]): AlertSummary {
  return {
    critical: items.filter((a) => a.level === "critical").length,
    warning: items.filter((a) => a.level === "warning").length,
    total: items.length,
    expiring: items.filter((a) => a.type === "expiry" && a.level === "critical").length,
    low_stock: items.filter((a) => a.type === "stock_low_coverage" && a.level === "critical").length,
  };
}

// El servidor filtra por tipo y por nivel; el resumen cuenta lo del tipo pedido
function mockServer(all: AlertOut[] = ALERTS) {
  vi.mocked(api.get).mockImplementation(async (url: string, config?: any) => {
    if (url !== "/me/alerts/") throw new Error(`GET no mockeado: ${url}`);
    const { tipo, level } = config?.params ?? {};
    const ofType = all.filter((a) =>
      tipo === "stock" ? a.type === "stock_low_coverage" : tipo === "vencimiento" ? a.type !== "stock_low_coverage" : true,
    );
    return { data: { items: ofType.filter((a) => !level || a.level === level), summary: summaryOf(ofType) } };
  });
}

function renderCenter(state?: { tipo: string }) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[{ pathname: "/alertas", state } as any]}>
        <Alertas />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const border = (testId: string) => screen.getByTestId(testId).style.borderColor;

describe("Alertas (Centro de Alertas)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra los números de críticas y advertencias y arranca con todas las alertas", async () => {
    mockServer();
    renderCenter();

    expect(await screen.findByTestId("alert-item-expiry-1")).toBeInTheDocument();
    expect(screen.getByTestId("alert-count-critical")).toHaveTextContent("2");
    expect(screen.getByTestId("alert-count-warning")).toHaveTextContent("2");
    expect(screen.getAllByTestId(/^alert-item-/)).toHaveLength(4);
    expect(screen.getByTestId("alert-filter-todas")).toHaveAttribute("aria-pressed", "true");
  });

  it("separa «Según tus reglas» de «Generado por el sistema» con sus subtítulos", async () => {
    mockServer();
    renderCenter();
    await screen.findByTestId("alert-item-expiry-1");

    const rules = screen.getByTestId("alerts-rules");
    const system = screen.getByTestId("alerts-system");
    expect(within(rules).getByText("Según tus reglas")).toBeInTheDocument();
    expect(within(rules).getByText("Vencimiento y stock mínimo configurado.")).toBeInTheDocument();
    expect(within(rules).getAllByTestId(/^alert-item-/)).toHaveLength(3);
    expect(within(system).getByText("Generado por el sistema")).toBeInTheDocument();
    expect(within(system).getByText("Predicciones con tu flujo de productos.")).toBeInTheDocument();
    expect(within(system).getByTestId("alert-item-slow_pace-6")).toBeInTheDocument();
  });

  it("las alertas del modelo predictivo llevan la marca «Predicción» y las demás no", async () => {
    mockServer();
    renderCenter();
    await screen.findByTestId("alert-item-expiry-1");

    expect(screen.getByTestId("alert-prediction-stock_low_coverage-5")).toHaveTextContent("Predicción");
    expect(within(screen.getByTestId("alert-prediction-stock_low_coverage-5")).getByTestId("prediction-icon")).toBeInTheDocument();
    expect(screen.getByTestId("alert-prediction-slow_pace-6")).toBeInTheDocument();
    expect(screen.queryByTestId("alert-prediction-expiry-1")).not.toBeInTheDocument();
  });

  it("la descripción de stock dice cuántas quedan, para cuántos días alcanzan y el mínimo configurado", async () => {
    mockServer();
    renderCenter();
    await screen.findByTestId("alert-item-expiry-1");

    expect(screen.getByTestId("alert-description-stock_low_coverage-5")).toHaveTextContent(
      "Quedan 2 ud. restantes que alcanzan para 3 días. Mínimo configurado de 7 días.",
    );
    expect(screen.getByTestId("alert-description-expiry-1")).toHaveTextContent(
      "Vence el 1 de noviembre. Quedan 3 ud. y tu aviso es con menos de 7 días.",
    );
  });

  it("tocar «Críticas» las filtra, con el contorno rojo; «Advertencias», con el amarillo", async () => {
    const user = userEvent.setup();
    mockServer();
    renderCenter();
    await screen.findByTestId("alert-item-expiry-1");
    expect(border("alert-summary-critical")).toBe("transparent");

    await user.click(screen.getByTestId("alert-summary-critical"));
    await waitFor(() => expect(screen.getAllByTestId(/^alert-item-/)).toHaveLength(2));
    expect(border("alert-summary-critical")).toBe("rgb(229, 72, 77)");
    expect(border("alert-summary-warning")).toBe("transparent");
    expect(api.get).toHaveBeenLastCalledWith("/me/alerts/", { params: { level: "critical" } });

    await user.click(screen.getByTestId("alert-summary-warning"));
    await waitFor(() => expect(screen.getByTestId("alert-item-expiry-2")).toBeInTheDocument());
    expect(border("alert-summary-warning")).toBe("rgb(251, 188, 5)");
    expect(border("alert-summary-critical")).toBe("transparent");
  });

  it("volver a tocar el nivel elegido muestra todas de nuevo", async () => {
    const user = userEvent.setup();
    mockServer();
    renderCenter();
    await screen.findByTestId("alert-item-expiry-1");

    await user.click(screen.getByTestId("alert-summary-critical"));
    await waitFor(() => expect(screen.getAllByTestId(/^alert-item-/)).toHaveLength(2));
    await user.click(screen.getByTestId("alert-summary-critical"));

    await waitFor(() => expect(screen.getAllByTestId(/^alert-item-/)).toHaveLength(4));
    expect(screen.getByTestId("alert-summary-critical")).toHaveAttribute("aria-pressed", "false");
  });

  it("las opciones son Todas, Stock y Vencimiento, y los números siguen a la opción elegida", async () => {
    const user = userEvent.setup();
    mockServer();
    renderCenter();
    await screen.findByTestId("alert-item-expiry-1");

    await user.click(screen.getByTestId("alert-filter-stock"));
    await waitFor(() => expect(screen.getAllByTestId(/^alert-item-/)).toHaveLength(1));
    expect(screen.getByTestId("alert-count-critical")).toHaveTextContent("1");
    expect(screen.getByTestId("alert-count-warning")).toHaveTextContent("0");

    await user.click(screen.getByTestId("alert-filter-vencimiento"));
    await waitFor(() => expect(screen.getAllByTestId(/^alert-item-/)).toHaveLength(3));
    expect(screen.getByTestId("alert-count-warning")).toHaveTextContent("2");
    expect(screen.queryByTestId("alert-filter-criticas")).not.toBeInTheDocument();
  });

  it("al llegar desde una tarjeta del inicio, la opción ya viene elegida", async () => {
    mockServer();
    renderCenter({ tipo: "stock" });

    await waitFor(() => expect(screen.getAllByTestId(/^alert-item-/)).toHaveLength(1));
    expect(screen.getByTestId("alert-filter-stock")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("alert-filter-todas")).toHaveAttribute("aria-pressed", "false");
    expect(api.get).toHaveBeenCalledWith("/me/alerts/", { params: { tipo: "stock" } });
  });

  it("al llegar con Vencimiento elegido pide solo las de vencimiento", async () => {
    mockServer();
    renderCenter({ tipo: "vencimiento" });

    await waitFor(() => expect(screen.getByTestId("alert-filter-vencimiento")).toHaveAttribute("aria-pressed", "true"));
    expect(api.get).toHaveBeenCalledWith("/me/alerts/", { params: { tipo: "vencimiento" } });
  });

  it("al tocar una alerta se abre su detalle, con el motivo y la explicación, y se cierra con la flecha", async () => {
    const user = userEvent.setup();
    mockServer();
    renderCenter();

    await user.click(await screen.findByTestId("alert-item-stock_low_coverage-5"));

    const dialog = screen.getByRole("dialog", { name: "Detalle de Alerta" });
    expect(within(dialog).getByTestId("alert-detail-reason")).toHaveTextContent("Se agota en 3 días");
    expect(within(dialog).getByTestId("alert-detail-text")).toHaveTextContent("se sugiere reponer 12 unidades");
    expect(within(dialog).getByText("Predicción")).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText("Volver"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("el detalle se puede desplazar: el cuerpo tiene su propio scroll y el fondo es un elemento aparte", async () => {
    const user = userEvent.setup();
    mockServer();
    renderCenter();

    await user.click(await screen.findByTestId("alert-item-expiry-1"));

    const body = screen.getByTestId("alert-detail-body");
    expect(body.className).toContain("overflow-y-auto");
    const backdrop = screen.getByTestId("alert-detail-backdrop");
    expect(backdrop.contains(body)).toBe(false);
    await user.click(backdrop);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("si el producto ya venció, el detalle no dice «te avisamos cuando faltan menos de...»", async () => {
    const user = userEvent.setup();
    mockServer([alert({ days_to_expiry: -3, product_expiry: "2026-10-24" })]);
    renderCenter();

    await user.click(await screen.findByTestId("alert-item-expiry-1"));

    const text = screen.getByTestId("alert-detail-text");
    expect(text).toHaveTextContent("Venció el 24 de octubre (hace 3 días).");
    expect(text).toHaveTextContent("Ya no conviene consumirlo.");
    expect(text).not.toHaveTextContent(/te avisamos/i);
  });

  it("si no vence todavía, el detalle sí explica la regla", async () => {
    const user = userEvent.setup();
    mockServer([alert({ days_to_expiry: 2 })]);
    renderCenter();

    await user.click(await screen.findByTestId("alert-item-expiry-1"));

    expect(screen.getByTestId("alert-detail-text")).toHaveTextContent("Te avisamos cuando faltan menos de 7 días para el vencimiento (tu regla general).");
  });

  it("sin alertas, lo dice", async () => {
    mockServer([]);
    renderCenter();

    expect(await screen.findByText("No tenés alertas para mostrar.")).toBeInTheDocument();
  });

  it("si falla la carga, muestra el error", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("fallo"));
    renderCenter();

    expect(await screen.findByText("No se pudieron cargar las alertas.")).toBeInTheDocument();
  });
});

describe("Alertas · botones iguales y centrados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("los filtros miden lo mismo, están centrados y el contenido de críticas y advertencias también", async () => {
    mockServer();
    renderCenter();
    await screen.findByTestId("alert-item-expiry-1");

    ["todas", "stock", "vencimiento"].forEach((key) => {
      const button = screen.getByTestId(`alert-filter-${key}`);
      expect(button.className).toContain("w-36");
      expect(button.className).toContain("text-center");
    });
    expect(screen.getByTestId("alert-filter-todas").parentElement!.className).toContain("justify-center");
    ["critical", "warning"].forEach((key) => expect(screen.getByTestId(`alert-summary-${key}`).className).toContain("text-center"));
  });
});

describe("Alertas · productos afectados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("a la derecha del título y su descripción dice «N alertas para M productos», como la app", async () => {
    mockServer();
    renderCenter();

    const affected = await screen.findByTestId("alerts-affected");
    expect(affected).toHaveTextContent("4 alertas para 4 productos");
    const header = screen.getByRole("heading", { name: "Centro de Alertas" }).parentElement!.parentElement!;
    expect(header.className).toContain("justify-between");
    expect(header.className).toContain("items-center");
    expect(header).toContainElement(affected);
    expect(screen.getByText("Lo que necesita tu atención en tu inventario").parentElement!.compareDocumentPosition(affected) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("un producto con dos alertas cuenta una vez entre los productos y dos entre las alertas", async () => {
    mockServer([
      alert({ key: "expiry-1", product_id: 1 }),
      alert({ key: "slow_pace-9", product_id: 1, type: "slow_pace", origin: "system", predictive: true, units_wasted: 3 }),
      alert({ key: "expiry-2", product_id: 2, level: "warning" }),
    ]);
    renderCenter({ tipo: "vencimiento" });

    expect(await screen.findByTestId("alerts-affected-count")).toHaveTextContent("2");
    expect(screen.getByTestId("alerts-count")).toHaveTextContent("3");
    expect(screen.getByTestId("alerts-affected")).toHaveTextContent("3 alertas para 2 productos");
    expect(screen.getAllByTestId(/^alert-item-/)).toHaveLength(3);
  });

  it("sigue a la opción elegida y usa el singular: «1 alerta para 1 producto»", async () => {
    const user = userEvent.setup();
    mockServer();
    renderCenter();
    await screen.findByTestId("alerts-affected");

    await user.click(screen.getByTestId("alert-filter-stock"));
    await waitFor(() => expect(screen.getByTestId("alerts-affected")).toHaveTextContent("1 alerta para 1 producto"));
    expect(screen.getByTestId("alerts-affected")).not.toHaveTextContent("alertas");
  });

  it("sin alertas no muestra el contador", async () => {
    mockServer([]);
    renderCenter();

    await screen.findByText("No tenés alertas para mostrar.");
    expect(screen.queryByTestId("alerts-affected")).not.toBeInTheDocument();
  });
});

describe("Alertas · alineación del texto de alertas y productos", () => {
  it("los números grandes y las palabras chicas comparten la línea de base", async () => {
    mockServer();
    renderCenter();

    const text = await screen.findByTestId("alerts-affected");
    expect(text.className).toContain("items-baseline");
    expect(screen.getByTestId("alerts-count").className).toContain("text-2xl");
    expect(screen.getByTestId("alerts-affected-count").className).toContain("text-2xl");
  });
});
