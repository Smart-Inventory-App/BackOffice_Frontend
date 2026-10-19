import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import StockTotalModal from "./StockTotalModal";
import type { AdminProduct, AdminProductGroupDetail } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

import { api } from "@/lib/api";

function product(overrides: Partial<AdminProduct> = {}): AdminProduct {
  return {
    id: 1,
    nombre: "Leche",
    marca: "Sancor",
    categoria: "Lácteos",
    stock: 5,
    vencimiento: "2027-03-01",
    descripcion: null,
    imagen_url: null,
    ubicacion: null,
    codigo_barras: null,
    created_at: null,
    owner: { user_id: "u1", email: "duenio@test.com" },
    ...overrides,
  };
}

const GRUPO: AdminProductGroupDetail = {
  nombre: "Leche",
  categoria: "Lácteos",
  stock_total: 12,
  lotes: 3,
  usuarios: 1,
  proximo_vencimiento: "2027-03-01",
  productos: [
    product({ id: 1, stock: 5 }),
    product({ id: 2, stock: 4, marca: "La Serenísima" }),
    product({ id: 3, stock: 3, marca: null, vencimiento: null }),
  ],
};

function mockApi(overrides: { groups?: unknown; group?: unknown } = {}) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === "/admin/products/groups") {
      if (overrides.groups instanceof Error) throw overrides.groups;
      return { data: overrides.groups ?? [{ ...GRUPO }] };
    }
    if (url === "/admin/products/group") {
      if (overrides.group instanceof Error) throw overrides.group;
      return { data: overrides.group ?? GRUPO };
    }
    throw new Error(`GET no mockeado: ${url}`);
  });
}

const INITIAL = { nombre: "Leche", categoria: "Lácteos" };

describe("StockTotalModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no muestra nada si está cerrada", () => {
    renderWithProviders(<StockTotalModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("busca por nombre, ofrece sugerencias y muestra el total del producto elegido", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithProviders(<StockTotalModal open onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Nombre del producto"), "lec");
    await user.click(await screen.findByText("Lácteos · Total: 12"));

    expect(await screen.findByTestId("stock-total-value")).toHaveTextContent("12 unidades");
    expect(screen.getByTestId("stock-total-nombre")).toHaveTextContent("Leche");
    expect(screen.getByTestId("stock-total-lots")).toHaveTextContent("3 productos");
    expect(screen.getByText("Productos encontrados")).toBeInTheDocument();
    // Solo el listado se desplaza: el resumen queda fuera de la lista con scroll
    expect(screen.getByTestId("stock-total-list")).toHaveClass("overflow-auto");
    expect(screen.getByTestId("stock-total-list")).not.toContainElement(screen.getByTestId("stock-total-summary"));
  });

  it("no busca con menos de dos letras", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithProviders(<StockTotalModal open onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Nombre del producto"), "l");
    await new Promise((r) => setTimeout(r, 400));

    expect(api.get).not.toHaveBeenCalled();
  });

  it("avisa cuando no hay productos con ese nombre", async () => {
    const user = userEvent.setup();
    mockApi({ groups: [] });
    renderWithProviders(<StockTotalModal open onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Nombre del producto"), "zzz");

    expect(await screen.findByText("No hay productos con ese nombre")).toBeInTheDocument();
  });

  it("si falla la búsqueda no muestra sugerencias ni aviso", async () => {
    const user = userEvent.setup();
    mockApi({ groups: new Error("boom") });
    renderWithProviders(<StockTotalModal open onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Nombre del producto"), "lec");
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    expect(screen.queryByTestId("stock-total-suggestions")).toBeNull();
    expect(screen.queryByText("No hay productos con ese nombre")).toBeNull();
  });

  it("se abre directamente con el producto indicado y recalcula el total al destildar productos", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithProviders(<StockTotalModal open onClose={vi.fn()} initial={INITIAL} userId="u1" />);

    expect(await screen.findByTestId("stock-total-value")).toHaveTextContent("12 unidades");
    expect(api.get).toHaveBeenCalledWith("/admin/products/group", {
      params: { nombre: "Leche", categoria: "Lácteos", user_id: "u1" },
    });

    await user.click(screen.getByLabelText("Incluir Leche (Sancor) en el total"));
    expect(screen.getByTestId("stock-total-value")).toHaveTextContent("7 unidades");
    expect(screen.getByTestId("stock-total-lots")).toHaveTextContent("2 productos");

    await user.click(screen.getByLabelText("Incluir Leche (La Serenísima) en el total"));
    await user.click(screen.getByLabelText("Incluir Leche (sin marca) en el total"));
    expect(screen.getByTestId("stock-total-value")).toHaveTextContent("0 unidades");

    await user.click(screen.getByLabelText("Incluir Leche (Sancor) en el total"));
    expect(screen.getByTestId("stock-total-value")).toHaveTextContent("5 unidades");
    expect(screen.getByTestId("stock-total-lots")).toHaveTextContent("1 producto");
  });

  it("sin usuario indicado muestra a quién pertenece cada producto y cuántos usuarios suman", async () => {
    mockApi({ group: { ...GRUPO, usuarios: 2 } });
    renderWithProviders(<StockTotalModal open onClose={vi.fn()} initial={INITIAL} />);

    expect(await screen.findByTestId("stock-total-lots")).toHaveTextContent("2 usuarios");
    expect(screen.getAllByText(/Dueño: duenio@test.com/).length).toBe(3);
  });

  it("con un usuario indicado no repite el dueño en cada producto", async () => {
    mockApi();
    renderWithProviders(<StockTotalModal open onClose={vi.fn()} initial={INITIAL} userId="u1" />);

    await screen.findByTestId("stock-total-value");
    expect(screen.queryByText(/Dueño:/)).toBeNull();
    expect(screen.getByText(/del usuario con el mismo nombre/)).toBeInTheDocument();
  });

  it("muestra el error si no se pudo cargar el producto", async () => {
    mockApi({ group: new Error("boom") });
    renderWithProviders(<StockTotalModal open onClose={vi.fn()} initial={INITIAL} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("stock-total-summary")).toBeNull();
  });

  it("al escribir otro nombre vuelve a la búsqueda", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithProviders(<StockTotalModal open onClose={vi.fn()} initial={INITIAL} />);
    await screen.findByTestId("stock-total-summary");

    await user.type(screen.getByLabelText("Nombre del producto"), "x");

    expect(screen.queryByTestId("stock-total-summary")).toBeNull();
  });

  it("se cierra con la X y al tocar afuera, pero no al tocar la ventana", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockApi();
    renderWithProviders(<StockTotalModal open onClose={onClose} />);

    await user.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
