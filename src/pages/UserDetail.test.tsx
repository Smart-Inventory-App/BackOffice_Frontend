import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/test-utils";
import UserDetail from "./UserDetail";
import type { AlertOut, AppUserDetail, MyMetrics, StockChange } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

import { api } from "@/lib/api";

function renderDetail(id = "u1") {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/usuarios/${id}`]}>
        <Routes>
          <Route path="/usuarios/:id" element={<UserDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function alerta(overrides: Partial<AlertOut> = {}): AlertOut {
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
    product_brand: null,
    product_category: "Almacén",
    product_location: null,
    product_stock: 3,
    product_expiry: "2026-05-01",
    image_url: null,
    user_id: "u1",
    ...overrides,
  };
}

function userDetail(overrides: Partial<AppUserDetail> = {}): AppUserDetail {
  return {
    id: "u1",
    email: "usuario@test.com",
    is_active: true,
    is_admin: false,
    created_at: "2026-01-15T15:00:00Z",
    username: "usuario1",
    first_name: "Ana",
    last_name: "Gómez",
    product_count: 4,
    total_units: 1234,
    critical_alerts: 1,
    warning_alerts: 2,
    consumed_last_30d: 12,
    restocked_last_30d: 20,
    alerts: [alerta()],
    products: [],
    ...overrides,
  };
}

function cambio(n: number): StockChange {
  return {
    id: `event-${n}`,
    kind: "salida",
    stock_before: 10,
    stock_after: 8,
    quantity: 2,
    occurred_at: "2026-10-27T22:30:00Z",
    producto: {
      id: n,
      nombre: `Producto ${n}`,
      marca: null,
      categoria: "Almacén",
      stock: 8,
      vencimiento: null,
      descripcion: null,
      imagen_url: null,
      ubicacion: null,
      codigo_barras: null,
      stock_minimo: null,
      dias_alerta_vencimiento: null,
      created_at: null,
    },
  };
}

function metricas(period: number): MyMetrics {
  const days = Array.from({ length: period }, (_, i) => {
    const date = new Date(2026, 9, 22 - (period - 1 - i));
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { day, quantity: i === period - 1 ? 4 : 0 };
  });
  return {
    period_days: period,
    total_consumido: 4,
    total_entradas: 4,
    total_ingresos: 4,
    consumo_por_dia: days,
    ingresos_por_dia: days,
    top_productos: [],
  };
}

function serve(detail: AppUserDetail = userDetail(), changes: StockChange[] = [cambio(1), cambio(2)]) {
  vi.mocked(api.get).mockImplementation(async (url: string, config?: any) => {
    if (url === "/admin/users/u1") return { data: detail };
    if (url === "/admin/users/u1/changes") return { data: changes.slice(config?.params?.offset ?? 0, (config?.params?.offset ?? 0) + (config?.params?.limit ?? 5)) };
    if (url === "/admin/users/u1/metrics") return { data: metricas(config.params.period) };
    throw new Error(`GET no mockeado: ${url}`);
  });
}

describe("UserDetail · encabezado y perfil", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("el botón dice solo «Volver», con el mail y la descripción a la izquierda", async () => {
    serve();
    renderDetail();

    expect(await screen.findByRole("heading", { name: "usuario@test.com" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/usuarios");
    expect(screen.queryByText("Volver a usuarios")).not.toBeInTheDocument();
    expect(screen.getByText("Detalle de la cuenta y datos cargados")).toBeInTheDocument();
  });

  it("el perfil muestra nombre y usuario y, debajo, el estado y la fecha de registro", async () => {
    serve();
    renderDetail();

    const perfil = await screen.findByTestId("user-profile");
    expect(within(perfil).getByTestId("user-profile-name")).toHaveTextContent("Ana Gómez");
    expect(within(perfil).getByTestId("user-profile-username")).toHaveTextContent("usuario1");
    expect(within(perfil).getByTestId("user-profile-status")).toHaveTextContent("Activo");
    expect(within(perfil).getByTestId("user-profile-created")).toHaveTextContent("15/01/2026");
    const orden = Array.from(perfil.querySelectorAll("[data-testid]")).map((e) => e.getAttribute("data-testid"));
    expect(orden).toEqual(["user-profile-name", "user-profile-username", "user-profile-status", "user-profile-created"]);
    // a la derecha del título, en una sola fila y centrado en el alto de «Volver», el mail y la descripción
    const encabezado = perfil.closest("div.flex")!;
    expect(encabezado.firstElementChild).toContainElement(screen.getByRole("heading", { name: "usuario@test.com" }));
    expect(encabezado.firstElementChild).toContainElement(screen.getByRole("link", { name: "Volver" }));
    expect(encabezado.className).toContain("items-center");
    expect(perfil.className).toContain("flex");
    expect(perfil.className).not.toContain("grid");
  });

  it("sin nombre, usuario ni fecha, usa los valores de reemplazo", async () => {
    serve(userDetail({ email: null, first_name: null, last_name: null, username: null, created_at: null, is_active: false }));
    renderDetail();

    expect(await screen.findByRole("heading", { name: "u1" })).toBeInTheDocument();
    expect(screen.getByTestId("user-profile-status")).toHaveTextContent("Deshabilitado");
    expect(screen.getByTestId("user-profile-name")).toHaveTextContent("—");
    expect(screen.getByTestId("user-profile-username")).toHaveTextContent("—");
  });

  it("si falla la carga, muestra el error", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("404"));
    renderDetail();
    expect(await screen.findByText("No se encontró el usuario.")).toBeInTheDocument();
  });
});

describe("UserDetail · tendencias del usuario", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tiene dos gráficos, de consumo y de ingresos por día, con el título y los botones de 7, 14, 30 y 60 días", async () => {
    serve();
    renderDetail();

    expect(await screen.findByRole("heading", { name: "Tendencias del usuario" })).toBeInTheDocument();
    expect(await screen.findByTestId("trends-panel")).toBeInTheDocument();
    expect(await screen.findByTestId("incomes-panel")).toBeInTheDocument();
    expect(screen.getByText("Consumo por día")).toBeInTheDocument();
    expect(screen.getByText("Ingresos por día")).toBeInTheDocument();
    const picker = screen.getByTestId("user-trends-period-picker");
    ["7", "14", "30", "60"].forEach((p) => expect(within(picker).getByTestId(`trends-period-${p}`)).toBeInTheDocument());
    expect(within(picker).queryByTestId("trends-period-90")).not.toBeInTheDocument();
    // los cuadros dicen «Productos consumidos» y «Productos ingresados», con letra un poco más grande
    expect(screen.getByTestId("trends-consumed").nextElementSibling).toHaveTextContent("Productos consumidos");
    expect(screen.getByTestId("incomes-total").nextElementSibling).toHaveTextContent("Productos ingresados");
    expect(screen.getByTestId("incomes-total").nextElementSibling!.className).toContain("text-sm");
    // y la sección es más baja: el gráfico se achica
    expect(screen.getByTestId("trends-chart").style.height).toBe("96px");
    expect(screen.getByTestId("incomes-chart").style.height).toBe("96px");
    // sin los rankings de productos
    expect(screen.queryByText("Productos con más salidas")).not.toBeInTheDocument();
    expect(screen.queryByTestId("incomes-top-stock")).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/admin/users/u1/metrics", { params: { period: 14 } });
  });

  it("elegir 60 días pide las tendencias de ese período para los dos gráficos", async () => {
    const user = userEvent.setup();
    serve();
    renderDetail();
    await screen.findByTestId("trends-panel");

    await user.click(screen.getByTestId("trends-period-60"));

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/admin/users/u1/metrics", { params: { period: 60 } }));
    expect(screen.getByTestId("trends-period-60")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("UserDetail · últimos cambios y alertas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("son dos secciones, separadas por una línea vertical tenue, con el título centrado", async () => {
    serve();
    renderDetail();

    const cambios = await screen.findByTestId("user-changes-section");
    const alertas = screen.getByTestId("user-alerts-section");
    expect(within(cambios).getByRole("heading", { name: "Últimos cambios del usuario" }).className).toContain("text-center");
    expect(within(alertas).getByRole("heading", { name: "Alertas del usuario" }).className).toContain("text-center");
    expect(alertas.className).toContain("lg:border-l");
    expect(alertas.className).toContain("border-line/60");
  });

  it("los cuadros de cada columna muestran los totales y no se pueden tocar", async () => {
    serve();
    renderDetail();

    await screen.findByTestId("user-changes-section");
    expect(screen.getByTestId("user-info-units")).toHaveTextContent("1.234 unidades totales");
    expect(screen.getByTestId("user-info-products")).toHaveTextContent("4 productos totales");
    expect(screen.getByTestId("user-info-critical")).toHaveTextContent("1 alerta crítica");
    expect(screen.getByTestId("user-info-warning")).toHaveTextContent("2 alertas de advertencias");
    ["user-info-units", "user-info-products", "user-info-critical", "user-info-warning"].forEach((id) => {
      const box = screen.getByTestId(id);
      expect(box.tagName).toBe("DIV");
      expect(box.closest("button")).toBeNull();
      expect(box.querySelector("button")).toBeNull();
    });
    // los cuadros van justo debajo del título de su columna
    const cambios = screen.getByTestId("user-changes-section");
    const html = cambios.innerHTML;
    expect(html.indexOf("Últimos cambios del usuario")).toBeLessThan(html.indexOf("user-info-units"));
    expect(html.indexOf("user-info-units")).toBeLessThan(html.indexOf("user-changes-list"));
  });

  it("los productos totales van a la izquierda de las unidades totales, cada cuadro con su color tenue", async () => {
    serve();
    renderDetail();

    const seccion = await screen.findByTestId("user-changes-section");
    const html = seccion.innerHTML;
    expect(html.indexOf("user-info-products")).toBeLessThan(html.indexOf("user-info-units"));
    // celeste las unidades, azul los productos, rojo las críticas y amarillo las advertencias
    expect(screen.getByTestId("user-info-units").className).toContain("#EAF6FC");
    expect(screen.getByTestId("user-info-products").className).toContain("#EDF1FC");
    expect(screen.getByTestId("user-info-critical").className).toContain("#FDEFEF");
    expect(screen.getByTestId("user-info-warning").className).toContain("#FFF8E1");
  });

  it("en singular dice «1 unidad total», «1 producto total», «1 alerta crítica» y «1 alerta de advertencia»", async () => {
    serve(userDetail({ total_units: 1, product_count: 1, critical_alerts: 1, warning_alerts: 1 }));
    renderDetail();

    await screen.findByTestId("user-changes-section");
    expect(screen.getByTestId("user-info-units")).toHaveTextContent("1 unidad total");
    expect(screen.getByTestId("user-info-products")).toHaveTextContent("1 producto total");
    expect(screen.getByTestId("user-info-critical")).toHaveTextContent("1 alerta crítica");
    expect(screen.getByTestId("user-info-warning")).toHaveTextContent("1 alerta de advertencia");
  });

  it("pide los últimos 5 cambios y los lista enteros, sin scroll", async () => {
    serve();
    renderDetail();

    const lista = await screen.findByTestId("user-changes-list");
    expect(await within(lista).findByTestId("change-event-1")).toBeInTheDocument();
    expect(within(lista).getByTestId("change-event-2")).toBeInTheDocument();
    expect(lista.className).not.toContain("overflow");
    expect(lista.className).not.toContain("max-h");
    expect(api.get).toHaveBeenCalledWith("/admin/users/u1/changes", { params: { limit: 5 } });
  });

  it("sin cambios, lo dice", async () => {
    serve(userDetail(), []);
    renderDetail();
    expect(await screen.findByText("Este usuario todavía no tiene cambios de stock.")).toBeInTheDocument();
  });

  it("«Ver más» de los cambios abre el historial del usuario", async () => {
    const user = userEvent.setup();
    serve(userDetail(), [1, 2, 3, 4, 5, 6, 7].map(cambio));
    renderDetail();
    const seccion = await screen.findByTestId("user-changes-section");
    await within(seccion).findByTestId("change-event-1");

    await user.click(within(seccion).getByRole("button", { name: "Ver más" }));

    const modal = await screen.findByTestId("changes-modal");
    expect(within(modal).getByTestId("change-event-7")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/admin/users/u1/changes", { params: { limit: 10, offset: 0 } });
  });

  it("lista solo las primeras 5 alertas, enteras y sin scroll", async () => {
    const alertas = Array.from({ length: 7 }, (_, i) => alerta({ key: `a-${i}`, product_name: `Producto ${i}` }));
    serve(userDetail({ alerts: alertas }));
    renderDetail();

    const lista = await screen.findByTestId("user-alerts-list");
    expect(lista.className).not.toContain("overflow");
    expect(lista.className).not.toContain("max-h");
    expect(within(lista).getAllByTestId(/^alert-item-/)).toHaveLength(5);
  });

  it("cada alerta mide lo mismo que cada cambio", async () => {
    serve();
    renderDetail();

    const alerta = await screen.findByTestId("alert-item-expiry-1");
    const cambioFila = await screen.findByTestId("change-event-1");
    expect(alerta.className).toContain("h-28");
    expect(cambioFila.className).toContain("h-28");
  });

  it("abre el detalle de una alerta", async () => {
    const user = userEvent.setup();
    serve();
    renderDetail();

    await user.click(await screen.findByTestId("alert-item-expiry-1"));

    expect(screen.getByRole("dialog", { name: "Detalle de Alerta" })).toBeInTheDocument();
    await user.click(screen.getByLabelText("Volver"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("«Ver más» de las alertas abre «Alertas de <mail>» con todas, y de ahí se abre el detalle de una", async () => {
    const user = userEvent.setup();
    const alertas = Array.from({ length: 7 }, (_, i) => alerta({ key: `a-${i}`, product_name: `Producto ${i}` }));
    serve(userDetail({ alerts: alertas }));
    renderDetail();
    const seccion = await screen.findByTestId("user-alerts-section");

    await user.click(within(seccion).getByRole("button", { name: "Ver más" }));

    const modal = await screen.findByRole("dialog", { name: "Alertas de usuario@test.com" });
    expect(within(modal).getAllByTestId(/^alert-item-/)).toHaveLength(7);
    await user.click(within(modal).getByTestId("alert-item-a-6"));
    expect(screen.getByRole("dialog", { name: "Detalle de Alerta" })).toBeInTheDocument();
  });

  it("sin alertas lo dice, también en la ventana de «Ver más»", async () => {
    const user = userEvent.setup();
    serve(userDetail({ alerts: [], critical_alerts: 0, warning_alerts: 0 }));
    renderDetail();
    expect(await screen.findByText("Este usuario no tiene alertas.")).toBeInTheDocument();

    await user.click(within(screen.getByTestId("user-alerts-section")).getByRole("button", { name: "Ver más" }));

    const modal = await screen.findByRole("dialog", { name: "Alertas de usuario@test.com" });
    expect(within(modal).getByText("Este usuario no tiene alertas.")).toBeInTheDocument();
  });
});
