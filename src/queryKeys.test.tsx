import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Alertas from "@/pages/Alertas";
import MyProducts from "@/pages/MyProducts";
import { INVENTORY_QUERY_KEYS, invalidateInventory } from "@/lib/queries";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

import { api } from "@/lib/api";

const ALERT = {
  key: "expiry-1", product_id: 1, type: "expiry", level: "critical", origin: "rule", days_to_expiry: 2, days_until_stockout: null,
  units_wasted: null, suggested_qty: null, limit_days: 7, rule_scope: "general", predictive: false, product_name: "Leche",
  product_brand: null, product_category: "Lácteos", product_location: null, product_stock: 3, product_expiry: "2026-11-01",
  image_url: null, user_id: "u1",
};

const PRODUCT = {
  id: 1, nombre: "Leche", marca: null, categoria: "Lácteos", stock: 3, vencimiento: null, descripcion: null, imagen_url: null,
  ubicacion: null, codigo_barras: null, stock_minimo: null, dias_alerta_vencimiento: null, created_at: null,
};

function serve() {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === "/me/alerts/") return { data: { items: [ALERT], summary: { critical: 1, warning: 0, total: 1, expiring: 1, low_stock: 0 } } };
    if (url === "/me/products") return { data: { items: [PRODUCT], total: 1 } };
    if (url === "/me/products/filters/options") return { data: { categorias: [], ubicaciones: [], marcas: [] } };
    throw new Error(`GET no mockeado: ${url}`);
  });
}

// Se mira con UN SOLO cliente de consultas, como en la app real: lo que una pantalla guarda lo encuentra la otra
function visit(client: QueryClient, page: JSX.Element) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("las pantallas no se pisan los datos entre sí", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serve();
  });

  it("pasar del Inventario al Centro de Alertas y volver no rompe ninguna de las dos (antes salía «algo salió mal»)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const inventory = visit(client, <MyProducts />);
    await waitFor(() => expect(screen.getByTestId("product-alert-1")).toHaveTextContent("Crítica"));
    inventory.unmount();

    const alerts = visit(client, <Alertas />);
    expect(await screen.findByTestId("alert-item-expiry-1")).toBeInTheDocument();
    expect(screen.getByTestId("alert-count-critical")).toHaveTextContent("1");
    alerts.unmount();

    visit(client, <MyProducts />);
    await waitFor(() => expect(screen.getByTestId("product-alert-1")).toHaveTextContent("Crítica"));
  });

  it("cada consulta tiene su clave: el Inventario y el Centro de Alertas no comparten ninguna", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const inventory = visit(client, <MyProducts />);
    await waitFor(() => expect(screen.getByTestId("product-alert-1")).toBeInTheDocument());
    inventory.unmount();
    visit(client, <Alertas />);
    await screen.findByTestId("alert-item-expiry-1");

    const keys = client.getQueryCache().getAll().map((query) => JSON.stringify(query.queryKey));

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(JSON.stringify(["my-alert-levels"]));
    expect(keys).toContain(JSON.stringify(["my-alerts", "todas", null]));
  });

  it("al cambiar el inventario se invalida todo lo que depende de él", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    invalidateInventory(client);

    expect(invalidate.mock.calls.map((call) => (call[0] as { queryKey: string[] }).queryKey[0])).toEqual([...INVENTORY_QUERY_KEYS]);
    expect(INVENTORY_QUERY_KEYS).toEqual(expect.arrayContaining(["my-stats", "my-alerts", "my-alert-levels", "trends", "my-changes"]));
  });
});
