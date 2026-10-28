import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/test-utils";
import MyDashboard from "./MyDashboard";
import { PILL_WIDTH } from "@/components/ui";
import type { MyProduct, MyProfile, MyStats, StockChange } from "@/lib/types";

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
    expired_products: 0,
    critical_alerts: 3,
    warning_alerts: 1,
    products_by_category: [{ label: "Almacén", count: 4 }],
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
}

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
    if (url === "/me/metrics") {
      return { data: { period_days: config.params.period, total_consumido: 0, total_entradas: 0, consumo_por_dia: [], top_productos: [] } };
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

function renderHome() {
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

describe("MyDashboard (inicio)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saluda con el nombre de la persona y dice «Tu estado»", async () => {
    mockApi();
    renderHome();

    expect(await screen.findByText("Bienvenido, Ana")).toBeInTheDocument();
    expect(screen.getByText("Tu estado")).toBeInTheDocument();
  });

  it("sin nombre cargado, solo saluda; con un nombre largo lo corta a 20 caracteres", async () => {
    mockApi({ profile: profile({ first_name: null }) });
    const { unmount } = renderHome();
    expect(await screen.findByText("Bienvenido")).toBeInTheDocument();
    unmount();

    mockApi({ profile: profile({ first_name: "Maximiliano Alejandro Gonzalez" }) });
    renderHome();
    expect(await screen.findByText("Bienvenido, Maximiliano Alejandr...")).toBeInTheDocument();
  });

  it("muestra las cuatro tarjetas con sus números con puntos de miles y sus comentarios", async () => {
    mockApi();
    renderHome();
    await screen.findByText("Bienvenido, Ana");

    expect(screen.getByTestId("stat-products-value")).toHaveTextContent("12");
    expect(screen.getByTestId("stat-stock-value")).toHaveTextContent("1.234");
    expect(screen.getByTestId("stat-expiring-value")).toHaveTextContent("2");
    expect(screen.getByTestId("stat-low-value")).toHaveTextContent("1");
    expect(screen.getByText("Productos")).toBeInTheDocument();
    expect(screen.getByText("Productos en stock")).toBeInTheDocument();
    expect(screen.getByText("Vencimientos")).toBeInTheDocument();
    expect(screen.getByText("Stock bajo")).toBeInTheDocument();
    expect(screen.getByTestId("stat-products-comment")).toHaveTextContent("Total inventario");
    expect(screen.getByTestId("stat-stock-comment")).toHaveTextContent("Total unidades");
    expect(screen.getByTestId("stat-expiring-comment")).toHaveTextContent("Alertas de productos");
    expect(screen.getByTestId("stat-low-comment")).toHaveTextContent("Alertas de stock");
  });

  it("los cuatro comentarios miden lo mismo y «Total inventario» es del color del ícono, con letra blanca", async () => {
    mockApi();
    renderHome();
    await screen.findByText("Bienvenido, Ana");

    const widths = ["stat-products", "stat-stock", "stat-expiring", "stat-low"].map(
      (id) => screen.getByTestId(`${id}-comment`).style.width,
    );
    expect(new Set(widths)).toEqual(new Set([`${PILL_WIDTH}px`]));
    const comment = screen.getByTestId("stat-products-comment");
    const icon = screen.getByTestId("stat-products-icon");
    expect(comment.style.color).toBe("rgb(255, 255, 255)");
    expect(comment.style.backgroundColor).toBe("rgb(27, 58, 143)"); // #1B3A8F, el mismo del ícono
    expect(icon.style.color).toBe("rgb(27, 58, 143)");
  });

  it("«Productos» y «Productos en stock» llevan al inventario", async () => {
    const user = userEvent.setup();
    mockApi();
    renderHome();

    await user.click(await screen.findByTestId("stat-stock"));

    expect(await screen.findByText(/PRODUCTOS/)).toBeInTheDocument();
  });

  it("«Vencimientos» abre el centro de alertas con Vencimiento ya elegido", async () => {
    const user = userEvent.setup();
    mockApi();
    renderHome();

    await user.click(await screen.findByTestId("stat-expiring"));

    expect(await screen.findByText(/ALERTAS/)).toHaveTextContent('{"tipo":"vencimiento"}');
  });

  it("«Stock bajo» abre el centro de alertas con Stock ya elegido", async () => {
    const user = userEvent.setup();
    mockApi();
    renderHome();

    await user.click(await screen.findByTestId("stat-low"));

    expect(await screen.findByText(/ALERTAS/)).toHaveTextContent('{"tipo":"stock"}');
  });

  it("muestra los últimos cambios con el motivo, el stock antes y después y la hora argentina", async () => {
    mockApi({ changes: [change("a", "entrada", 0, 5), change("b", "salida", 5, 3), change("c", "modificacion", 3, 8)] });
    renderHome();

    const row = await screen.findByTestId("change-a");
    expect(row).toHaveTextContent("Entrada de producto");
    expect(row).toHaveTextContent("27/10/2026 19:30"); // 22:30 UTC son las 19:30 argentinas
    expect(screen.getByTestId("change-a-stock")).toHaveTextContent("0");
    expect(screen.getByTestId("change-b")).toHaveTextContent("Salida de producto");
    expect(screen.getByTestId("change-c")).toHaveTextContent("Modificación del producto");
    expect(api.get).toHaveBeenCalledWith("/me/changes", { params: { limit: 5 } });
  });

  it("«Ver más» abre el historial y «Cargar más» pide la página siguiente", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 12 }, (_, i) => change(`c${i}`, "salida", 10, 9));
    mockApi({ changes: many });
    renderHome();
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
    renderHome();

    expect(await screen.findByText("Todavía no hay cambios de stock.")).toBeInTheDocument();
    expect(screen.getByText("No tenés productos cargados")).toBeInTheDocument();
  });

  it("muestra los productos recientes con su fecha de carga y abre la información de uno", async () => {
    const user = userEvent.setup();
    mockApi();
    renderHome();

    const recent = await screen.findByTestId("recent-1");
    expect(recent).toHaveTextContent("Cargado el 27/10/2026 19:30");
    expect(recent).toHaveTextContent("Vence: 01/12/2026");
    expect(api.get).toHaveBeenCalledWith("/me/products", { params: { limit: 3 } });

    await user.click(recent);
    expect(screen.getByRole("dialog", { name: "Información del Producto" })).toBeInTheDocument();
    await user.click(screen.getByLabelText("Volver"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("el botón «Tendencias» abre la ventana de tendencias de consumo", async () => {
    const user = userEvent.setup();
    mockApi();
    renderHome();

    await user.click(await screen.findByTestId("home-trends"));

    const dialog = await screen.findByRole("dialog", { name: "Tendencias de Consumo" });
    expect(within(dialog).getByTestId("trends-period-14")).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText("Volver"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("«Ver inventario» lleva al inventario", async () => {
    const user = userEvent.setup();
    mockApi();
    renderHome();

    await user.click(await screen.findByRole("button", { name: "Ver inventario" }));

    expect(await screen.findByText(/PRODUCTOS/)).toBeInTheDocument();
  });

  it("si falla la carga, muestra el mensaje de error", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("fallo"));
    renderHome();

    expect(await screen.findByText("No se pudo cargar el estado de tu inventario.")).toBeInTheDocument();
  });
});
