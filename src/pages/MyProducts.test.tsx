import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import MyProducts from "./MyProducts";
import type { MyProduct, Paginated } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { api } from "@/lib/api";

const OPCIONES = { categorias: ["Almacén", "Limpieza"], ubicaciones: ["Alacena"] };

function product(overrides: Partial<MyProduct> = {}): MyProduct {
  return {
    id: 1,
    nombre: "Yerba Mate",
    marca: "La Merced",
    categoria: "Almacén",
    stock: 5,
    vencimiento: null,
    descripcion: null,
    imagen_url: null,
    ubicacion: "Alacena",
    codigo_barras: "7791234567890",
    stock_minimo: null,
    dias_alerta_vencimiento: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function paginated(items: MyProduct[], total = items.length): Paginated<MyProduct> {
  return { items, total };
}

function mockGets(items: MyProduct[]) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === "/me/products/filters/options") return { data: OPCIONES };
    if (url === "/me/products") return { data: paginated(items) };
    throw new Error(`GET no mockeado: ${url}`);
  });
}

describe("MyProducts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista los productos con su stock y vencimiento", async () => {
    mockGets([
      product({ id: 1, nombre: "Yerba Mate", stock: 1 }),
      product({
        id: 2,
        nombre: "Leche",
        marca: null,
        codigo_barras: null,
        vencimiento: "2020-01-01",
        stock: 10,
      }),
      product({ id: 3, nombre: "Fideos", marca: null, codigo_barras: null, vencimiento: "2999-01-01", stock: 10 }),
    ]);

    renderWithProviders(<MyProducts />);

    expect(await screen.findByText("Yerba Mate")).toBeInTheDocument();
    expect(screen.getByText("La Merced")).toBeInTheDocument();
    expect(screen.getByText("7791234567890")).toBeInTheDocument();
    expect(screen.getByText("Leche")).toBeInTheDocument();
    expect(screen.getByText("2020-01-01")).toBeInTheDocument();
  });

  it("sin resultados, muestra el estado vacío", async () => {
    mockGets([]);
    renderWithProviders(<MyProducts />);
    expect(await screen.findByText("No se encontraron productos.")).toBeInTheDocument();
  });

  it("filtra por búsqueda, categoría, vencidos y bajo stock", async () => {
    const user = userEvent.setup();
    mockGets([product()]);

    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    await user.type(screen.getByPlaceholderText("Buscar por nombre o marca…"), "Yerba");
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/me/products",
        expect.objectContaining({ params: expect.objectContaining({ search: "Yerba" }) }),
      ),
    );

    const categoriaSelect = screen.getByDisplayValue("Todas las categorías");
    await user.selectOptions(categoriaSelect, "Almacén");
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/me/products",
        expect.objectContaining({ params: expect.objectContaining({ categoria: "Almacén" }) }),
      ),
    );

    const vencidoSelect = screen.getByDisplayValue("Vencimiento: todos");
    await user.selectOptions(vencidoSelect, "si");
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/me/products",
        expect.objectContaining({ params: expect.objectContaining({ vencido: true }) }),
      ),
    );

    await user.click(screen.getByLabelText("Bajo stock"));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/me/products",
        expect.objectContaining({ params: expect.objectContaining({ bajo_stock: true }) }),
      ),
    );
  });

  it("ordena por columna alternando asc/desc y luego lo saca", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    await user.click(screen.getByRole("button", { name: /Producto/ }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/me/products",
        expect.objectContaining({ params: expect.objectContaining({ sort_by: "nombre", sort_dir: "asc" }) }),
      ),
    );

    await user.click(screen.getByRole("button", { name: /Producto/ }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/me/products",
        expect.objectContaining({ params: expect.objectContaining({ sort_by: "nombre", sort_dir: "desc" }) }),
      ),
    );

    await user.click(screen.getByRole("button", { name: /Producto/ }));
    await waitFor(() => {
      const productCalls = vi.mocked(api.get).mock.calls.filter((c) => c[0] === "/me/products");
      const lastCall = productCalls[productCalls.length - 1]!;
      expect((lastCall[1] as any).params.sort_by).toBeUndefined();
    });
  });

  it("selecciona productos, edita en lote y confirma", async () => {
    const user = userEvent.setup();
    mockGets([product({ id: 1 }), product({ id: 2, nombre: "Fideos" })]);
    vi.mocked(api.patch).mockResolvedValue({ data: { updated: 2 } });

    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    // checkboxes[0] es el filtro "Bajo stock", [1] es "seleccionar todos" de
    // la tabla y el resto son las filas.
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[2]);
    expect(screen.getByText("1 producto seleccionado")).toBeInTheDocument();

    await user.click(checkboxes[1]);
    expect(screen.getByText("2 productos seleccionados")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Editar en lote" }));
    const modal = screen.getByText("Editar 2 productos").closest(".rounded-2xl") as HTMLElement;
    const categoriaSelect = within(modal).getByText("Categoría").nextElementSibling as HTMLSelectElement;
    await user.selectOptions(categoriaSelect, "Limpieza");
    await user.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/me/products/bulk-edit", {
        product_ids: [1, 2],
        categoria: "Limpieza",
      }),
    );
    expect(screen.queryByText("Editar 2 productos")).not.toBeInTheDocument();
  });

  it("si falla la edición en lote, muestra el error y permite cancelar", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    vi.mocked(api.patch).mockImplementation(async () => {
      const err: any = new Error("fallo");
      err.response = { data: { detail: "No se pudo aplicar." } };
      throw err;
    });

    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");
    await user.click(screen.getAllByRole("checkbox")[1]);
    await user.click(screen.getByRole("button", { name: "Editar en lote" }));

    expect(screen.getByRole("button", { name: "Aplicar" })).toBeDisabled();
    const marcaInput = screen.getByPlaceholderText("Dejar vacío para no cambiar");
    await user.type(marcaInput, "Nueva Marca");
    await user.click(screen.getByRole("button", { name: "Aplicar" }));

    expect(await screen.findByText("No se pudo aplicar.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText("Editar 1 productos")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Deseleccionar" }));
    expect(screen.queryByText(/producto seleccionado/)).not.toBeInTheDocument();
  });

  it("abre edición individual, guarda cambios y maneja errores", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    vi.mocked(api.patch).mockImplementationOnce(async () => {
      const err: any = new Error("fallo");
      err.response = { data: { detail: "El código de barras ya está en uso." } };
      throw err;
    });

    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");
    await user.click(screen.getByRole("button", { name: /Editar/ }));

    const modal = screen.getByText("Editar producto").closest(".rounded-2xl") as HTMLElement;
    const modalScope = within(modal);

    const nombreInput = modalScope.getByText("Nombre").nextElementSibling as HTMLInputElement;
    expect(nombreInput.value).toBe("Yerba Mate");

    await user.clear(nombreInput);
    await user.type(nombreInput, "Yerba Mate 500g");
    await user.clear(modalScope.getByText("Marca").nextElementSibling as HTMLInputElement);
    await user.type(modalScope.getByText("Marca").nextElementSibling as HTMLInputElement, "Otra Marca");
    await user.selectOptions(modalScope.getByText("Categoría").nextElementSibling as HTMLSelectElement, "Almacén");
    const stockInput = modalScope.getByText("Stock").nextElementSibling as HTMLInputElement;
    await user.clear(stockInput);
    await user.type(stockInput, "9");
    const vencimientoInput = modalScope.getByText("Vencimiento").nextElementSibling as HTMLInputElement;
    await user.type(vencimientoInput, "2026-09-01");
    await user.selectOptions(modalScope.getByText("Ubicación").nextElementSibling as HTMLSelectElement, "Alacena");
    await user.type(modalScope.getByPlaceholderText("Sin código"), "1");
    await user.type(modalScope.getByText("URL de imagen").nextElementSibling as HTMLInputElement, "https://img");
    await user.type(modalScope.getByText("Descripción").nextElementSibling as HTMLTextAreaElement, "Notas");
    await user.type(modalScope.getByText("Stock mínimo").nextElementSibling as HTMLInputElement, "2");
    await user.type(modalScope.getByText("Días de anticipación").nextElementSibling as HTMLInputElement, "3");

    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("El código de barras ya está en uso.")).toBeInTheDocument();

    vi.mocked(api.patch).mockResolvedValueOnce({ data: {} });
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByText("Editar producto")).not.toBeInTheDocument());
  });

  it("al editar un producto completo conserva todos sus datos y los envía tal cual", async () => {
    const user = userEvent.setup();
    mockGets([
      product({
        vencimiento: "2030-01-01",
        descripcion: "Notas",
        imagen_url: "https://img/y.png",
        stock_minimo: 2,
        dias_alerta_vencimiento: 4,
      }),
    ]);
    vi.mocked(api.patch).mockResolvedValue({ data: {} });

    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");
    await user.click(screen.getByRole("button", { name: /Editar/ }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/me/products/1", {
        nombre: "Yerba Mate",
        marca: "La Merced",
        categoria: "Almacén",
        stock: 5,
        vencimiento: "2030-01-01",
        descripcion: "Notas",
        imagen_url: "https://img/y.png",
        ubicacion: "Alacena",
        codigo_barras: "7791234567890",
        stock_minimo: 2,
        dias_alerta_vencimiento: 4,
      }),
    );
  });

  it("al editar un producto sin datos opcionales los envía como null", async () => {
    const user = userEvent.setup();
    mockGets([product({ marca: null, ubicacion: null, codigo_barras: null })]);
    vi.mocked(api.patch).mockResolvedValue({ data: {} });

    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");
    await user.click(screen.getByRole("button", { name: /Editar/ }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/me/products/1",
        expect.objectContaining({
          marca: null,
          ubicacion: null,
          codigo_barras: null,
          vencimiento: null,
          descripcion: null,
          imagen_url: null,
          stock_minimo: null,
          dias_alerta_vencimiento: null,
        }),
      ),
    );
  });

  it("distingue los vencimientos próximos, lejanos y vencidos", async () => {
    const dias = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    mockGets([
      product({ id: 1, nombre: "Proximo", vencimiento: dias(3) }),
      product({ id: 2, nombre: "Lejano", vencimiento: dias(60) }),
      product({ id: 3, nombre: "Vencido", vencimiento: dias(-10) }),
    ]);

    renderWithProviders(<MyProducts />);

    expect(await screen.findByText("Proximo")).toBeInTheDocument();
    expect(screen.getByText("Lejano")).toBeInTheDocument();
    expect(screen.getByText("Vencido")).toBeInTheDocument();
  });

  it("cierra el modal de edición con Cancelar", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");
    await user.click(screen.getByRole("button", { name: /Editar/ }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText("Editar producto")).not.toBeInTheDocument();
  });

  it("abre el historial de un producto", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/products/filters/options") return { data: OPCIONES };
      if (url === "/me/products") return { data: paginated([product()]) };
      if (url === "/me/products/1/consumption") return { data: [] };
      throw new Error(`GET no mockeado: ${url}`);
    });

    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");
    await user.click(screen.getByRole("button", { name: /Historial/ }));

    expect(await screen.findByText("Historial de consumo")).toBeInTheDocument();
  });

  it("exporta a CSV y a Excel", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    vi.mocked(api.get).mockImplementation(async (url: string, config?: any) => {
      if (url === "/me/products/filters/options") return { data: OPCIONES };
      if (url === "/me/products") return { data: paginated([product()]) };
      if (url === "/me/products/export") return { data: new Blob(["csv"]) };
      throw new Error(`GET no mockeado: ${url} ${JSON.stringify(config)}`);
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    await user.click(screen.getByRole("button", { name: /CSV/ }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/me/products/export",
        expect.objectContaining({ params: expect.objectContaining({ format: "csv" }), responseType: "blob" }),
      ),
    );

    await user.click(screen.getByRole("button", { name: /Excel/ }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/me/products/export",
        expect.objectContaining({ params: expect.objectContaining({ format: "xlsx" }) }),
      ),
    );
  });
});
