import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/test-utils";
import MyDashboard from "./MyDashboard";
import { PILL_WIDTH } from "@/components/ui";
import type { AlertOut, MyProduct, MyProfile, MyStats, StockChange } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

import { api } from "@/lib/api";

function stats(overrides: Partial<MyStats> = {}): MyStats {
  return {
    total_products: 12,
    total_units: 1234,
    products_with_image: 5,
    low_stock_products: 1,
    expiring_soon_products: 2,
    expired_products: 3,
    critical_alerts: 3,
    warning_alerts: 1,
    products_by_category: [{ label: "Almacén", count: 4 }],
    stock_by_category: [
      { label: "Almacén", count: 900 },
      { label: "Lácteos", count: 300 },
      { label: "Limpieza", count: 34 },
    ],
    products_by_location: [
      { label: "Heladera", count: 5 },
      { label: "Sin ubicación", count: 2 },
    ],
    expiry_buckets: [
      { label: "Vencidos", count: 1 },
      { label: "0 a 7 días", count: 2 },
      { label: "8 a 30 días", count: 3 },
      { label: "31 a 90 días", count: 0 },
      { label: "Más de 90 días", count: 4 },
      { label: "Sin vencimiento", count: 2 },
    ],
    ...overrides,
  };
}

function product(overrides: Partial<MyProduct> = {}): MyProduct {
  return {
    id: 1,
    nombre: "Yerba Mate",
    marca: "La Merced",
    categoria: "Almacén",
    stock: 5,
    vencimiento: "2026-12-01",
    descripcion: null,
    imagen_url: null,
    ubicacion: "Alacena",
    codigo_barras: null,
    stock_minimo: null,
    dias_alerta_vencimiento: null,
    created_at: "2026-10-27T22:30:00Z",
    ...overrides,
  };
}

function change(id: string, kind: StockChange["kind"], before: number, after: number): StockChange {
  return {
    id,
    kind,
    stock_before: before,
    stock_after: after,
    quantity: Math.abs(after - before),
    occurred_at: "2026-10-27T22:30:00Z",
    producto: product({ id: 1, nombre: `Producto ${id}` }),
  };
}

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
    product_brand: null,
    product_category: "Lácteos",
    product_location: null,
    product_stock: 3,
    product_expiry: "2026-10-30",
    image_url: null,
    user_id: "u1",
    ...overrides,
  };
}

function profile(overrides: Partial<MyProfile> = {}): MyProfile {
  return {
    email: "ana@test.com",
    first_name: "Ana",
    last_name: null,
    username: null,
    stock_minimo: 7,
    dias_alerta_vencimiento: 7,
    alert_check_hour: 5,
    user_type: "individuo",
    ...overrides,
  };
}

interface Setup {
  stats?: MyStats;
  profile?: MyProfile;
  changes?: StockChange[];
  recent?: MyProduct[];
  expiring?: AlertOut[];
  restock?: AlertOut[];
  consumption?: number[];
}

const days = (quantities: number[]) =>
  quantities.map((quantity, i) => ({ day: `2026-10-${String(10 + i).padStart(2, "0")}`, quantity }));

function mockApi(setup: Setup = {}) {
  vi.mocked(api.get).mockImplementation(async (url: string, config?: any) => {
    if (url === "/me/stats") return { data: setup.stats ?? stats() };
    if (url === "/me/profile") return { data: setup.profile ?? profile() };
    if (url === "/me/changes") {
      const all = setup.changes ?? [change("a", "entrada", 0, 5)];
      const { limit, offset = 0 } = config?.params ?? {};
      return { data: all.slice(offset, offset + limit) };
    }
    if (url === "/me/products") return { data: { items: setup.recent ?? [product()], total: 1 } };
    if (url === "/me/alerts/") {
      const items = config.params.tipo === "stock" ? (setup.restock ?? []) : (setup.expiring ?? []);
      return { data: { items, summary: {} } };
    }
    if (url === "/me/metrics") {
      const quantities = setup.consumption ?? [0, 2, 5, 0, 7, 3, 1];
      return {
        data: {
          period_days: config.params.period,
          total_consumido: quantities.reduce((a, b) => a + b, 0),
          total_entradas: 0,
          consumo_por_dia: days(quantities),
          top_productos: [],
        },
      };
    }
    throw new Error(`GET no mockeado: ${url}`);
  });
}

function Probe({ name }: { name: string }) {
  const location = useLocation();
  return (
    <p>
      {name} {JSON.stringify(location.state)}
    </p>
  );
}

function renderDashboard() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<MyDashboard />} />
          <Route path="/productos" element={<Probe name="PRODUCTOS" />} />
          <Route path="/alertas" element={<Probe name="ALERTAS" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("MyDashboard · encabezado y tarjetas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("es un dashboard, no un inicio: título «Dashboard» y el saludo con el nombre", async () => {
    mockApi();
    renderDashboard();

    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-greeting")).toHaveTextContent("Bienvenido, Ana · Tu estado");
    expect(screen.queryByText("Inicio")).not.toBeInTheDocument();
  });

  it("sin nombre cargado, solo saluda; con un nombre largo lo corta a 20 caracteres", async () => {
    mockApi({ profile: profile({ first_name: null }) });
    const { unmount } = renderDashboard();
    await waitFor(() => expect(screen.getByTestId("dashboard-greeting")).toHaveTextContent("Bienvenido · Tu estado"));
    unmount();

    mockApi({ profile: profile({ first_name: "Maximiliano Alejandro Gonzalez" }) });
    renderDashboard();
    await waitFor(() => expect(screen.getByTestId("dashboard-greeting")).toHaveTextContent("Bienvenido, Maximiliano Alejandr..."));
  });

  it("muestra las cuatro tarjetas con sus números con puntos de miles y sus comentarios", async () => {
    mockApi();
    renderDashboard();
    await screen.findByTestId("stat-products");

    expect(screen.getByTestId("stat-products-value")).toHaveTextContent("12");
    expect(screen.getByTestId("stat-stock-value")).toHaveTextContent("1.234");
    expect(screen.getByTestId("stat-expiring-value")).toHaveTextContent("2");
    expect(screen.getByTestId("stat-low-value")).toHaveTextContent("1");
    expect(screen.getByText("Productos en stock")).toBeInTheDocument();
    expect(screen.getByTestId("stat-products-comment")).toHaveTextContent("Total inventario");
    expect(screen.getByTestId("stat-stock-comment")).toHaveTextContent("Total unidades");
    expect(screen.getByTestId("stat-expiring-comment")).toHaveTextContent("Alertas de productos");
    expect(screen.getByTestId("stat-low-comment")).toHaveTextContent("Alertas de stock");
  });

  it("los cuatro comentarios miden lo mismo y «Total inventario» es del color del ícono, con letra blanca", async () => {
    mockApi();
    renderDashboard();
    await screen.findByTestId("stat-products");

    const widths = ["stat-products", "stat-stock", "stat-expiring", "stat-low"].map(
      (id) => screen.getByTestId(`${id}-comment`).style.width,
    );
    expect(new Set(widths)).toEqual(new Set([`${PILL_WIDTH}px`]));
    const comment = screen.getByTestId("stat-products-comment");
    expect(comment.style.color).toBe("rgb(255, 255, 255)");
    expect(comment.style.backgroundColor).toBe("rgb(27, 58, 143)");
    expect(screen.getByTestId("stat-products-icon").style.color).toBe("rgb(27, 58, 143)");
  });

  it("«Productos» y «Productos en stock» llevan al inventario", async () => {
    const user = userEvent.setup();
    mockApi();
    renderDashboard();

    await user.click(await screen.findByTestId("stat-stock"));

    expect(await screen.findByText(/PRODUCTOS/)).toBeInTheDocument();
  });

  it("«Vencimientos» abre el centro de alertas con Vencimiento ya elegido y «Stock bajo» con Stock", async () => {
    const user = userEvent.setup();
    mockApi();
    const { unmount } = renderDashboard();
    await user.click(await screen.findByTestId("stat-expiring"));
    expect(await screen.findByText(/ALERTAS/)).toHaveTextContent('{"tipo":"vencimiento"}');
    unmount();

    renderDashboard();
    await user.click(await screen.findByTestId("stat-low"));
    expect(await screen.findByText(/ALERTAS/)).toHaveTextContent('{"tipo":"stock"}');
  });

  it("si falla la carga, muestra el mensaje de error", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("fallo"));
    renderDashboard();

    expect(await screen.findByText("No se pudo cargar el estado de tu inventario.")).toBeInTheDocument();
  });
});

describe("MyDashboard · gráficos e información adicional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("el gráfico de consumo trae el período elegido y resume lo consumido, el promedio y el día pico", async () => {
    const user = userEvent.setup();
    mockApi();
    renderDashboard();

    expect(await screen.findByTestId("dashboard-consumption-chart")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/me/metrics", { params: { period: 14 } });
    await waitFor(() => expect(screen.getByTestId("dashboard-consumed")).toHaveTextContent("18"));
    expect(screen.getByTestId("dashboard-average")).toHaveTextContent("1,3");
    expect(screen.getByTestId("dashboard-peak")).toHaveTextContent("14 oct (7)");

    await user.click(screen.getByTestId("dashboard-period-30"));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/me/metrics", { params: { period: 30 } }));
    expect(screen.getByTestId("dashboard-period-30")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("dashboard-period-90")).not.toBeInTheDocument();
  });

  it("sin consumo, el día pico dice «Sin consumo»", async () => {
    mockApi({ consumption: [0, 0, 0] });
    renderDashboard();

    await waitFor(() => expect(screen.getByTestId("dashboard-peak")).toHaveTextContent("Sin consumo"));
  });

  it("la ventana de tendencias se abre desde el gráfico de consumo", async () => {
    const user = userEvent.setup();
    mockApi();
    renderDashboard();

    await user.click(await screen.findByTestId("home-trends"));

    const dialog = await screen.findByRole("dialog", { name: "Tendencias de Consumo" });
    expect(within(dialog).getByTestId("trends-period-14")).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText("Volver"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("las alertas se muestran por nivel y tocar una lleva al centro de alertas con ese nivel", async () => {
    const user = userEvent.setup();
    mockApi();
    const { unmount } = renderDashboard();
    await screen.findByTestId("dashboard-alerts");

    expect(screen.getByTestId("dashboard-alerts-critical")).toHaveTextContent("3");
    expect(screen.getByTestId("dashboard-alerts-warning")).toHaveTextContent("1");
    await user.click(screen.getByTestId("dashboard-alerts-warning"));
    expect(await screen.findByText(/ALERTAS/)).toHaveTextContent('{"level":"warning"}');
    unmount();

    renderDashboard();
    await user.click(await screen.findByTestId("dashboard-alerts-critical"));
    expect(await screen.findByText(/ALERTAS/)).toHaveTextContent('{"level":"critical"}');
  });

  it("sin alertas lo dice", async () => {
    mockApi({ stats: stats({ critical_alerts: 0, warning_alerts: 0 }) });
    renderDashboard();

    expect(await screen.findByText("No tenés alertas: todo en orden.")).toBeInTheDocument();
  });

  it("el gráfico de vencimientos aparece cuando hay productos con stock, y si no, un aviso", async () => {
    mockApi();
    const { unmount } = renderDashboard();
    expect(await screen.findByTestId("dashboard-expiry")).toHaveTextContent("Vencimientos");
    expect(screen.queryByText("Todavía no hay productos con stock.")).not.toBeInTheDocument();
    unmount();

    mockApi({ stats: stats({ expiry_buckets: stats().expiry_buckets.map((b) => ({ ...b, count: 0 })) }) });
    renderDashboard();
    expect(await screen.findByText("Todavía no hay productos con stock.")).toBeInTheDocument();
  });

  it("el stock por categoría se dibuja en barras proporcionales y tocar una abre el inventario de esa categoría", async () => {
    const user = userEvent.setup();
    mockApi();
    renderDashboard();

    expect(await screen.findByTestId("dashboard-category-0")).toHaveTextContent("Almacén");
    expect(screen.getByTestId("dashboard-category-0")).toHaveTextContent("900 u.");
    expect(screen.getByTestId("dashboard-category-bar-0").style.width).toBe("100%");
    expect(screen.getByTestId("dashboard-category-bar-1").style.width).toBe("33%");

    await user.click(screen.getByTestId("dashboard-category-1"));

    expect(await screen.findByText(/PRODUCTOS/)).toHaveTextContent('{"categoria":"Lácteos"}');
  });

  it("sin productos, los gráficos de categoría y de ubicación lo dicen", async () => {
    mockApi({ stats: stats({ stock_by_category: [], products_by_location: [] }) });
    renderDashboard();

    expect(await screen.findAllByText("Todavía no hay productos cargados.")).toHaveLength(2);
  });

  it("muestra dónde están los productos y datos que la app del celular no muestra", async () => {
    mockApi();
    renderDashboard();

    expect(await screen.findByTestId("dashboard-location-0")).toHaveTextContent("Heladera");
    expect(screen.getByTestId("dashboard-location-1")).toHaveTextContent("Sin ubicación");
    expect(screen.getByTestId("dashboard-expired")).toHaveTextContent("3");
    expect(screen.getByTestId("dashboard-images")).toHaveTextContent("5 de 12");
  });

  it("lista lo que vence y lo que se acaba, y abre el detalle de una alerta", async () => {
    const user = userEvent.setup();
    mockApi({
      expiring: [alert()],
      restock: [alert({ key: "stock_low_coverage-2", type: "stock_low_coverage", product_name: "Arroz", days_until_stockout: 3, suggested_qty: 12, predictive: true })],
    });
    renderDashboard();

    const upcoming = await screen.findByTestId("dashboard-upcoming");
    await waitFor(() => expect(within(upcoming).getAllByTestId(/^alert-item-/)).toHaveLength(2));
    await user.click(within(upcoming).getByTestId("alert-item-stock_low_coverage-2"));

    const dialog = screen.getByRole("dialog", { name: "Detalle de Alerta" });
    expect(within(dialog).getByTestId("alert-detail-reason")).toHaveTextContent("Se agota en 3 días");
    await user.click(within(dialog).getByLabelText("Volver"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sin nada urgente lo dice", async () => {
    mockApi();
    renderDashboard();

    expect(await screen.findByText("Nada urgente por ahora.")).toBeInTheDocument();
  });
});

describe("MyDashboard · últimos cambios y productos recientes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra los últimos cambios con el motivo, el stock antes y después y la hora argentina", async () => {
    mockApi({ changes: [change("a", "entrada", 0, 5), change("b", "salida", 5, 3), change("c", "modificacion", 3, 8)] });
    renderDashboard();

    const row = await screen.findByTestId("change-a");
    expect(row).toHaveTextContent("Entrada de producto");
    expect(row).toHaveTextContent("27/10/2026 19:30"); // 22:30 UTC son las 19:30 argentinas
    expect(screen.getByTestId("change-b")).toHaveTextContent("Salida de producto");
    expect(screen.getByTestId("change-c")).toHaveTextContent("Modificación del producto");
    expect(api.get).toHaveBeenCalledWith("/me/changes", { params: { limit: 5 } });
  });

  it("«Ver más» abre el historial y «Cargar más» pide la página siguiente", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 12 }, (_, i) => change(`c${i}`, "salida", 10, 9));
    mockApi({ changes: many });
    renderDashboard();
    await screen.findByTestId("change-c0");

    await user.click(screen.getByRole("button", { name: "Ver más" }));
    const dialog = await screen.findByRole("dialog", { name: "Historial de Cambios" });
    await waitFor(() => expect(within(dialog).getAllByTestId(/^change-c\d+$/)).toHaveLength(10));

    await user.click(within(dialog).getByRole("button", { name: "Cargar más" }));
    await waitFor(() => expect(within(dialog).getAllByTestId(/^change-c\d+$/)).toHaveLength(12));
    expect(within(dialog).queryByRole("button", { name: "Cargar más" })).not.toBeInTheDocument();

    await user.click(within(dialog).getByLabelText("Volver"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sin cambios ni productos, lo dice", async () => {
    mockApi({ changes: [], recent: [] });
    renderDashboard();

    expect(await screen.findByText("Todavía no hay cambios de stock.")).toBeInTheDocument();
    expect(screen.getByText("No tenés productos cargados")).toBeInTheDocument();
  });

  it("muestra los productos recientes con su fecha de carga y abre la información de uno", async () => {
    const user = userEvent.setup();
    mockApi();
    renderDashboard();

    const recent = await screen.findByTestId("recent-1");
    expect(recent).toHaveTextContent("Cargado el 27/10/2026 19:30");
    expect(recent).toHaveTextContent("Vence: 01/12/2026");
    expect(api.get).toHaveBeenCalledWith("/me/products", { params: { limit: 3 } });

    await user.click(recent);
    expect(screen.getByRole("dialog", { name: "Información del Producto" })).toBeInTheDocument();
    await user.click(screen.getByLabelText("Volver"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("«Ver inventario» lleva al inventario", async () => {
    const user = userEvent.setup();
    mockApi();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Ver inventario" }));

    expect(await screen.findByText(/PRODUCTOS/)).toBeInTheDocument();
  });
});
