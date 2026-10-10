import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import Products from "./Products";
import type { AdminProduct, Paginated } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), delete: vi.fn() },
}));

import { api } from "@/lib/api";

const OPCIONES = {
  categorias: ["Almacén"],
  owners: [{ user_id: "u1", email: "duenio@test.com" }],
};

function product(overrides: Partial<AdminProduct> = {}): AdminProduct {
  return {
    id: 1,
    nombre: "Yerba Mate",
    marca: "La Merced",
    categoria: "Almacén",
    stock: 5,
    vencimiento: null,
    descripcion: null,
    imagen_url: null,
    ubicacion: null,
    codigo_barras: "7791234567890",
    created_at: "2026-01-01T00:00:00Z",
    owner: { user_id: "u1", email: "duenio@test.com" },
    ...overrides,
  };
}

function paginated(items: AdminProduct[], total = items.length): Paginated<AdminProduct> {
  return { items, total };
}

function mockGets(items: AdminProduct[]) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === "/admin/products/filters/options") return { data: OPCIONES };
    if (url === "/admin/products/") return { data: paginated(items) };
    throw new Error(`GET no mockeado: ${url}`);
  });
}

describe("Products (admin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista productos con su dueño, y sin resultados muestra el estado vacío", async () => {
    mockGets([product()]);
    renderWithProviders(<Products />);
    expect(await screen.findByText("Yerba Mate")).toBeInTheDocument();
    expect(screen.getAllByText("duenio@test.com").length).toBeGreaterThan(0);
    expect(screen.getByText("7791234567890")).toBeInTheDocument();
  });

  it("sin productos, muestra el estado vacío", async () => {
    mockGets([]);
    renderWithProviders(<Products />);
    expect(await screen.findByText("No se encontraron productos.")).toBeInTheDocument();
  });

  it("filtra por búsqueda, categoría, dueño, vencidos, bajo stock y con imagen", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    renderWithProviders(<Products />);
    await screen.findByText("Yerba Mate");

    await user.type(screen.getByPlaceholderText("Buscar por nombre o marca…"), "Yerba");
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/admin/products/",
        expect.objectContaining({ params: expect.objectContaining({ search: "Yerba" }) }),
      ),
    );

    await user.selectOptions(screen.getByDisplayValue("Todos los usuarios"), "u1");
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/admin/products/",
        expect.objectContaining({ params: expect.objectContaining({ user_id: "u1" }) }),
      ),
    );

    await user.selectOptions(screen.getByDisplayValue("Todas las categorías"), "Almacén");
    await user.selectOptions(screen.getByDisplayValue("Vencimiento: todos"), "no");
    await user.click(screen.getByLabelText("Bajo stock"));
    await user.click(screen.getByLabelText("Solo con imagen"));

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/admin/products/",
        expect.objectContaining({
          params: expect.objectContaining({
            categoria: "Almacén",
            vencido: false,
            bajo_stock: true,
            only_with_image: true,
          }),
        }),
      ),
    );
  });

  it("ordena por columnas ciclando asc/desc/sin orden", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    renderWithProviders(<Products />);
    await screen.findByText("Yerba Mate");

    await user.click(screen.getByRole("button", { name: /Stock/ }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/admin/products/",
        expect.objectContaining({ params: expect.objectContaining({ sort_by: "stock", sort_dir: "asc" }) }),
      ),
    );
    await user.click(screen.getByRole("button", { name: /Stock/ }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/admin/products/",
        expect.objectContaining({ params: expect.objectContaining({ sort_dir: "desc" }) }),
      ),
    );
  });

  it("marca vencidos y por vencer con el badge correspondiente", async () => {
    mockGets([
      product({ id: 1, nombre: "Vencido", vencimiento: "2000-01-01" }),
      product({ id: 2, nombre: "PorVencer", vencimiento: new Date(Date.now() + 86400000).toISOString().slice(0, 10) }),
      product({ id: 3, nombre: "Ok", vencimiento: "2999-01-01" }),
    ]);
    renderWithProviders(<Products />);
    await screen.findByText("Vencido");

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("2000-01-01");
    expect(rows[2]).toHaveTextContent("2999-01-01");
  });

  it("muestra el id del dueño cuando no tiene email", async () => {
    mockGets([product({ owner: { user_id: "u-sin-email", email: null } })]);
    renderWithProviders(<Products />);

    expect(await screen.findByText("Yerba Mate")).toBeInTheDocument();
    expect(screen.getAllByText("u-sin-email").length).toBeGreaterThan(0);
  });

  it("resalta el stock agotado o al límite y no el normal", async () => {
    mockGets([
      product({ id: 1, nombre: "Casi agotado", stock: 1 }),
      product({ id: 2, nombre: "Con stock", stock: 50 }),
    ]);
    renderWithProviders(<Products />);

    const fila = (await screen.findByText("Casi agotado")).closest("tr") as HTMLElement;
    expect(within(fila).getByText("1")).toBeInTheDocument();
    const otra = screen.getByText("Con stock").closest("tr") as HTMLElement;
    expect(within(otra).getByText("50")).toBeInTheDocument();
  });

  it("elimina un producto tras confirmar, y cancelar no llama al backend", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    vi.mocked(api.delete).mockResolvedValue({ data: {} });

    renderWithProviders(<Products />);
    await screen.findByText("Yerba Mate");

    await user.click(screen.getByRole("button", { name: /Eliminar/ }));
    expect(screen.getByText(/Seguro que querés eliminar/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.queryByText("Eliminar producto")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Eliminar/ }));
    const modal = screen.getByText("Eliminar producto").closest(".rounded-2xl") as HTMLElement;
    await user.click(within(modal).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/admin/products/1"));
  });

  it("si el backend rechaza el borrado, muestra el error en el diálogo y no lo cierra", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    vi.mocked(api.delete).mockImplementation(async () => {
      const err: any = new Error("fallo");
      err.response = { data: { detail: "No se pudo borrar por una restricción." } };
      throw err;
    });

    renderWithProviders(<Products />);
    await screen.findByText("Yerba Mate");
    await user.click(screen.getByRole("button", { name: /Eliminar/ }));
    const modal = screen.getByText("Eliminar producto").closest(".rounded-2xl") as HTMLElement;
    await user.click(within(modal).getByRole("button", { name: "Eliminar" }));

    expect(await within(modal).findByRole("alert")).toHaveTextContent("No se pudo borrar por una restricción.");
    expect(screen.getByText("Eliminar producto")).toBeInTheDocument();

    await user.click(within(modal).getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: /Eliminar/ }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("exporta a csv y a xlsx aplicando los filtros vigentes", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/products/filters/options") return { data: OPCIONES };
      if (url === "/admin/products/") return { data: paginated([product()]) };
      if (url === "/admin/products/export") return { data: new Blob(["x"]) };
      throw new Error(`GET no mockeado: ${url}`);
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    renderWithProviders(<Products />);
    await screen.findByText("Yerba Mate");

    await user.click(screen.getByRole("button", { name: /CSV/ }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/admin/products/export",
        expect.objectContaining({ params: expect.objectContaining({ format: "csv" }) }),
      ),
    );
  });
});
