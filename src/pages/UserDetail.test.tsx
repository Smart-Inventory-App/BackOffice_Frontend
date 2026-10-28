import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/test-utils";
import UserDetail from "./UserDetail";
import type { AlertOut, AppUserDetail } from "@/lib/types";

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

const ALERT: AlertOut = {
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
};

function userDetail(overrides: Partial<AppUserDetail> = {}): AppUserDetail {
  return {
    id: "u1",
    email: "usuario@test.com",
    is_active: true,
    is_admin: false,
    created_at: "2026-01-15T00:00:00Z",
    username: "usuario1",
    first_name: "Ana",
    last_name: "Gómez",
    product_count: 1,
    total_units: 3,
    critical_alerts: 1,
    warning_alerts: 0,
    consumed_last_30d: 12,
    restocked_last_30d: 20,
    alerts: [ALERT],
    products: [
      {
        id: 1,
        nombre: "Yerba Mate",
        marca: null,
        categoria: "Almacén",
        stock: 3,
        vencimiento: "2026-05-01",
        descripcion: null,
        imagen_url: null,
        ubicacion: null,
        codigo_barras: null,
        created_at: null,
        alert_level: "critical",
        alert_types: ["expiry"],
        owner: { user_id: "u1", email: "usuario@test.com" },
      },
    ],
    ...overrides,
  };
}

describe("UserDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra los datos del usuario y sus productos", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: userDetail() });
    renderDetail();

    expect(await screen.findByRole("heading", { name: "usuario@test.com" })).toBeInTheDocument();
    expect(screen.getByText("Ana Gómez")).toBeInTheDocument();
    const product = screen.getByTestId("user-product-1");
    expect(within(product).getByText("Yerba Mate")).toBeInTheDocument();
    expect(product).toHaveTextContent("Almacén · vence 01/05/2026");
    expect(within(product).getByText("Crítica")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/admin/users/u1");
  });

  it("resume las unidades, las alertas y el consumo de los últimos 30 días", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: userDetail() });
    renderDetail();

    await screen.findByRole("heading", { name: "usuario@test.com" });
    expect(screen.getByText("Unidades en stock").nextElementSibling).toHaveTextContent("3");
    expect(screen.getByText("Alertas críticas").nextElementSibling).toHaveTextContent("1");
    expect(screen.getByText("Advertencias").nextElementSibling).toHaveTextContent("0");
    expect(screen.getByText("Consumido (30 días)").nextElementSibling).toHaveTextContent("12");
    expect(screen.getByText("20 repuestas")).toBeInTheDocument();
  });

  it("lista sus alertas y abre el detalle de una", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: userDetail() });
    renderDetail();

    await user.click(await screen.findByTestId("alert-item-expiry-1"));

    expect(screen.getByRole("dialog", { name: "Detalle de Alerta" })).toBeInTheDocument();
    await user.click(screen.getByLabelText("Volver"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sin alertas lo dice", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: userDetail({ alerts: [], critical_alerts: 0 }) });
    renderDetail();
    expect(await screen.findByText("Este usuario no tiene alertas.")).toBeInTheDocument();
  });

  it("sin productos, muestra el estado vacío", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: userDetail({ products: [] }) });
    renderDetail();
    expect(await screen.findByText("Este usuario no cargó productos.")).toBeInTheDocument();
  });

  it("si falla la carga, muestra el error", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("404"));
    renderDetail();
    expect(await screen.findByText("No se encontró el usuario.")).toBeInTheDocument();
  });

  it("sin nombre, usuario ni fecha, usa los valores de reemplazo", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: userDetail({
        email: null,
        first_name: null,
        last_name: null,
        username: null,
        created_at: null,
        is_active: false,
      }),
    });
    renderDetail();
    expect(await screen.findByRole("heading", { name: "u1" })).toBeInTheDocument();
    expect(screen.getByText("Deshabilitado")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
