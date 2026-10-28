import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/test-utils";
import MyDashboard from "./MyDashboard";
import { PILL_WIDTH } from "@/components/ui";
import { clearWelcome, markJustLoggedIn } from "@/lib/welcome";
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
  incomes?: number[];
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
      const incomes = setup.incomes ?? [4, 0, 10, 0, 0, 6, 0];
      return {
        data: {
          period_days: config.params.period,
          total_consumido: quantities.reduce((a, b) => a + b, 0),
          total_entradas: 0,
          total_ingresos: incomes.reduce((a, b) => a + b, 0),
          consumo_por_dia: days(quantities),
          ingresos_por_dia: days(incomes),
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
          <Route path="/metricas" element={<Probe name="METRICAS" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("MyDashboard · encabezado y tarjetas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearWelcome();
  });

  it("es un dashboard, no un inicio: título «Dashboard» y «Tu estado» con el nombre al volver a la página", async () => {
    mockApi();
    renderDashboard();

    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-greeting")).toHaveTextContent("Tu estado, Ana");
    expect(screen.queryByText("Inicio")).not.toBeInTheDocument();
  });

  it("recién iniciada la sesión dice «Bienvenido», y al cambiar de página y volver, «Tu estado»", async () => {
    markJustLoggedIn();
    mockApi();
    const { unmount } = renderDashboard();
    await waitFor(() => expect(screen.getByTestId("dashboard-greeting")).toHaveTextContent("Bienvenido, Ana"));
    unmount();

    renderDashboard();
    await waitFor(() => expect(screen.getByTestId("dashboard-greeting")).toHaveTextContent("Tu estado, Ana"));
  });

  it("sin nombre cargado, solo saluda; con un nombre largo lo corta a 20 caracteres", async () => {
    mockApi({ profile: profile({ first_name: null }) });
    const { unmount } = renderDashboard();
    await waitFor(() => expect(screen.getByTestId("dashboard-greeting")).toHaveTextContent(/^Tu estado$/));
    unmount();

    markJustLoggedIn();
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
  });

  it("los gráficos también se pueden ver con 90 días", async () => {
    const user = userEvent.setup();
    mockApi();
    renderDashboard();

    await user.click(await screen.findByTestId("dashboard-period-90"));

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/me/metrics", { params: { period: 90 } }));
    expect(screen.getByTestId("dashboard-period-90")).toHaveAttribute("aria-pressed", "true");
  });

  it("el gráfico de consumo no trae el aviso de pasar el mouse por el gráfico", async () => {
    mockApi();
    renderDashboard();

    await screen.findByTestId("dashboard-consumption-chart");
    expect(screen.queryByText(/Pasá el mouse/)).not.toBeInTheDocument();
  });

  it("junto al consumo hay un gráfico de ingresos por día que suma toda la carga de stock", async () => {
    mockApi();
    renderDashboard();

    const section = await screen.findByTestId("dashboard-incomes");
    expect(within(section).getByRole("heading", { name: "Ingresos por día" })).toBeInTheDocument();
    expect(await screen.findByTestId("dashboard-incomes-chart")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("dashboard-incomes-total")).toHaveTextContent("20"));
    expect(screen.getByTestId("dashboard-incomes-average")).toHaveTextContent("1,4");
    expect(screen.getByTestId("dashboard-incomes-peak")).toHaveTextContent("12 oct (10)");
  });

  it("sin ingresos, el día de mayor ingreso dice «Sin ingresos»", async () => {
    mockApi({ incomes: [0, 0, 0] });
    renderDashboard();

    await waitFor(() => expect(screen.getByTestId("dashboard-incomes-peak")).toHaveTextContent("Sin ingresos"));
  });

  it("sin consumo, el día pico dice «Sin consumo»", async () => {
    mockApi({ consumption: [0, 0, 0] });
    renderDashboard();

    await waitFor(() => expect(screen.getByTestId("dashboard-peak")).toHaveTextContent("Sin consumo"));
  });

  it("el botón «Tendencias» lleva a la página de tendencias", async () => {
    const user = userEvent.setup();
    mockApi();
    renderDashboard();

    await user.click(await screen.findByTestId("home-trends"));

    expect(await screen.findByText(/METRICAS/)).toBeInTheDocument();
  });

  it("ya no hay gráfico de alertas: las alertas se ven desde las tarjetas", async () => {
    mockApi();
    renderDashboard();

    await screen.findByTestId("dashboard-consumption-chart");
    expect(screen.queryByTestId("dashboard-alerts")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-alerts-critical")).not.toBeInTheDocument();
    expect(screen.queryByText("No tenés alertas: todo en orden.")).not.toBeInTheDocument();
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

  it("muestra las 5 categorías con más stock y «Ver más» lista todas, de mayor a menor", async () => {
    const user = userEvent.setup();
    const categories = [
      { label: "Bebidas", count: 50 },
      { label: "Almacén", count: 900 },
      { label: "Limpieza", count: 34 },
      { label: "Lácteos", count: 300 },
      { label: "Frutas", count: 120 },
      { label: "Verduras", count: 80 },
      { label: "Panadería", count: 10 },
    ];
    mockApi({ stats: stats({ stock_by_category: categories }) });
    renderDashboard();

    await screen.findByTestId("dashboard-category-4");
    expect(screen.queryByTestId("dashboard-category-5")).not.toBeInTheDocument();
    expect(screen.getByTestId("dashboard-category-0")).toHaveTextContent("Almacén");
    expect(screen.getByTestId("dashboard-category-4")).toHaveTextContent("Bebidas");
    expect(screen.queryByText("Panadería")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("dashboard-categories-more"));

    const dialog = await screen.findByRole("dialog", { name: "Stock por categoría" });
    const items = within(dialog).getAllByTestId(/^categories-modal-item-/);
    expect(items.map((item) => item.textContent)).toEqual([
      "Almacén900 u.",
      "Lácteos300 u.",
      "Frutas120 u.",
      "Verduras80 u.",
      "Bebidas50 u.",
      "Limpieza34 u.",
      "Panadería10 u.",
    ]);

    await user.click(within(dialog).getByTestId("categories-modal-item-6"));
    expect(await screen.findByText(/PRODUCTOS/)).toHaveTextContent('{"categoria":"Panadería"}');
  });

  it("con 5 categorías o menos no hay «Ver más»", async () => {
    mockApi();
    renderDashboard();

    await screen.findByTestId("dashboard-category-0");
    expect(screen.queryByTestId("dashboard-categories-more")).not.toBeInTheDocument();
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
    expect(api.get).toHaveBeenCalledWith("/me/products", { params: { limit: 5 } });

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

describe("MyDashboard · ubicaciones, urgencias y datos adicionales", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const places = [
    { label: "Heladera", count: 9 },
    { label: "Alacena", count: 7 },
    { label: "Freezer", count: 6 },
    { label: "Estante", count: 5 },
    { label: "Garage", count: 4 },
    { label: "Balcón", count: 3 },
    { label: "Sótano", count: 1 },
  ];

  it("«Dónde tenés tus productos» muestra las 5 ubicaciones con más productos, sin gráfico", async () => {
    mockApi({ stats: stats({ products_by_location: [...places].reverse() }) });
    renderDashboard();

    const section = await screen.findByTestId("dashboard-locations");
    expect(within(section).getAllByTestId(/^dashboard-location-\d$/)).toHaveLength(5);
    expect(screen.getByTestId("dashboard-location-0")).toHaveTextContent("Heladera");
    expect(screen.getByTestId("dashboard-location-0")).toHaveTextContent("9 productos");
    expect(screen.getByTestId("dashboard-location-4")).toHaveTextContent("Garage");
    expect(screen.queryByText("Sótano")).not.toBeInTheDocument();
    expect(section.querySelector(".recharts-responsive-container")).toBeNull();
  });

  it("«Ver más» de ubicaciones abre el listado completo de mayor a menor y tocar una abre su inventario", async () => {
    const user = userEvent.setup();
    mockApi({ stats: stats({ products_by_location: places }) });
    renderDashboard();

    await user.click(await screen.findByTestId("dashboard-locations-more"));

    const dialog = await screen.findByRole("dialog", { name: "Dónde tenés tus productos" });
    const items = within(dialog).getAllByTestId(/^locations-modal-item-/);
    expect(items.map((item) => item.textContent)).toEqual(places.map((p) => `${p.label}${p.count} productos`));
    await user.click(within(dialog).getByTestId("locations-modal-item-6"));
    expect(await screen.findByText(/PRODUCTOS/)).toHaveTextContent('{"ubicacion":"Sótano"}');
  });

  it("una ubicación del top abre el inventario filtrado, y con 5 o menos no hay «Ver más»", async () => {
    const user = userEvent.setup();
    mockApi();
    renderDashboard();

    expect(await screen.findByTestId("dashboard-location-0")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-locations-more")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("dashboard-location-1"));
    expect(await screen.findByText(/PRODUCTOS/)).toHaveTextContent('{"ubicacion":"Sin ubicación"}');
  });

  it("«Para atender primero» muestra solo las 3 alertas más pertinentes: primero las críticas y las más próximas", async () => {
    mockApi({
      expiring: [
        alert({ key: "expiry-a", product_name: "Pan", level: "warning", days_to_expiry: 1 }),
        alert({ key: "expiry-b", product_name: "Leche", level: "critical", days_to_expiry: 4 }),
        alert({ key: "expiry-c", product_name: "Queso", level: "critical", days_to_expiry: 2 }),
      ],
      restock: [alert({ key: "stock_low_coverage-d", type: "stock_low_coverage", product_name: "Arroz", level: "critical", days_until_stockout: 3, days_to_expiry: null })],
    });
    renderDashboard();

    const upcoming = await screen.findByTestId("dashboard-upcoming");
    await waitFor(() => expect(within(upcoming).getAllByTestId(/^alert-item-/)).toHaveLength(3));
    expect(within(upcoming).getAllByTestId(/^alert-item-/).map((item) => item.getAttribute("data-testid"))).toEqual([
      "alert-item-expiry-c",
      "alert-item-stock_low_coverage-d",
      "alert-item-expiry-b",
    ]);
    expect(within(upcoming).queryByText("Pan")).not.toBeInTheDocument();
  });

  it("«Ver más» de las alertas lleva a la página de alertas; con 3 o menos no aparece", async () => {
    const user = userEvent.setup();
    mockApi({ expiring: [alert({ key: "e1" }), alert({ key: "e2" }), alert({ key: "e3" }), alert({ key: "e4" })] });
    const { unmount } = renderDashboard();

    await user.click(await screen.findByTestId("dashboard-upcoming-more"));
    expect(await screen.findByText(/ALERTAS/)).toBeInTheDocument();
    unmount();

    mockApi({ expiring: [alert({ key: "e1" })] });
    renderDashboard();
    await screen.findByTestId("alert-item-e1");
    expect(screen.queryByTestId("dashboard-upcoming-more")).not.toBeInTheDocument();
  });

  it("«Un vistazo más» dice «Datos adicionales del sistema» y suma entradas útiles con su ícono", async () => {
    mockApi();
    renderDashboard();

    const section = await screen.findByTestId("dashboard-extra");
    expect(section).toHaveTextContent("Datos adicionales del sistema");
    expect(section).not.toHaveTextContent("Datos que no ves en la app del celular");
    expect(screen.getByTestId("dashboard-expired")).toHaveTextContent("3");
    expect(screen.getByTestId("dashboard-critical")).toHaveTextContent("3");
    expect(screen.getByTestId("dashboard-warnings")).toHaveTextContent("1");
    expect(screen.getByTestId("dashboard-images")).toHaveTextContent("5 de 12");
    expect(screen.getByTestId("dashboard-no-expiry")).toHaveTextContent("2");
    expect(screen.getByTestId("dashboard-units-per-product")).toHaveTextContent("102,8");
    expect(section.querySelectorAll("svg").length).toBeGreaterThanOrEqual(6);
  });

  it("sin productos, las unidades por producto son 0", async () => {
    mockApi({ stats: stats({ total_products: 0, total_units: 0 }) });
    renderDashboard();

    await waitFor(() => expect(screen.getByTestId("dashboard-units-per-product")).toHaveTextContent("0"));
  });

  it("las tres columnas ocupan siempre el mismo alto de fila", async () => {
    mockApi();
    renderDashboard();

    for (const id of ["dashboard-locations", "dashboard-extra", "dashboard-upcoming"]) {
      const card = await screen.findByTestId(id);
      expect(card.className).toContain("h-full");
      expect(card.className).toContain("flex-col");
    }
    expect(screen.getByTestId("dashboard-locations").parentElement!.className).toContain("items-stretch");
  });

  it("el gráfico de ingresos es de área y azul, como el de consumo, y sin texto explicativo", async () => {
    mockApi();
    renderDashboard();

    const section = await screen.findByTestId("dashboard-incomes");
    expect(section).not.toHaveTextContent("Todo el stock que se cargó");
    expect(await screen.findByTestId("dashboard-incomes-chart")).toBeInTheDocument();
  });
});
