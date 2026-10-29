import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient, renderWithProviders } from "@/test/test-utils";
import MyProducts from "./MyProducts";
import type { MyProduct, Paginated } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { api } from "@/lib/api";

const OPCIONES = { categorias: ["Almacén", "Limpieza"], ubicaciones: ["Alacena"], marcas: ["La Merced", "Otra Marca"] };
const PERFIL = { email: "ana@test.com", first_name: "Ana", last_name: null, username: null, stock_minimo: 7, dias_alerta_vencimiento: 5, alert_check_hour: 5, user_type: "individuo" };

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

function mockGets(items: MyProduct[], alerts: unknown[] = []) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === "/me/products/filters/options") return { data: OPCIONES };
    if (url === "/me/products") return { data: paginated(items) };
    if (url === "/me/products/stock-total") {
      return { data: { stock_total: items.reduce((sum, p) => sum + p.stock, 0), products: items.length } };
    }
    if (url === "/me/alerts/") return { data: { items: alerts, summary: { critical: 0, warning: 0, total: 0, expiring: 0, low_stock: 0 } } };
    if (url === "/me/profile") return { data: PERFIL };
    throw new Error(`GET no mockeado: ${url}`);
  });
}

// Los filtros son desplegables propios: se abre el botón y se elige una opción del menú
// Algunos filtros se llaman igual que una columna que se ordena: el desplegable es el que abre un menú
const filtroBtn = (name: string) => screen.getAllByRole("button", { name }).find((b) => b.hasAttribute("aria-haspopup"))!;
const ordenBtn = (name: string) => screen.getAllByRole("button", { name }).find((b) => !b.hasAttribute("aria-haspopup"))!;

async function elegir(user: ReturnType<typeof userEvent.setup>, filtro: string, opcion: string) {
  await user.click(filtroBtn(filtro));
  await user.click(within(screen.getByRole("listbox", { name: filtro })).getByRole("option", { name: opcion }));
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
    expect(within(screen.getByRole("table")).getByText("La Merced")).toBeInTheDocument();
    expect(screen.queryByText("7791234567890")).not.toBeInTheDocument();
    expect(screen.getByText("Leche")).toBeInTheDocument();
    expect(screen.getByText("01/01/2020")).toBeInTheDocument();
  });

  it("la lista no tiene la columna ALERTA y todos los títulos van en mayúsculas", async () => {
    mockGets([product()]);
    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    const headers = within(screen.getByRole("table")).getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent?.toUpperCase())).toEqual(["", "IMAGEN", "PRODUCTO", "CATEGORÍA", "STOCK", "VENCIMIENTO", "ACCIONES"]);
    expect(screen.queryByTestId("product-alert-1")).not.toBeInTheDocument();
    // Los títulos que se ordenan son botones: no heredan la mayúscula si no se la piden
    headers.filter((h) => h.querySelector("button")).forEach((h) => expect(h.querySelector("button")!.className).toContain("uppercase"));
    expect(screen.getByRole("table").querySelector("thead tr")!.className).toContain("uppercase");
  });

  it("al tocar el nombre abre la información del producto, con sus accesos", async () => {
    const user = userEvent.setup();
    mockGets([product({ descripcion: "Yerba suave", stock_minimo: 3 })]);
    renderWithProviders(<MyProducts />);

    await user.click(await screen.findByTestId("product-open-1"));

    const dialog = screen.getByRole("dialog", { name: "Información del Producto" });
    expect(within(dialog).getByTestId("product-detail-name")).toHaveTextContent("Yerba Mate");
    expect(within(dialog).getByText("Yerba suave")).toBeInTheDocument();
    expect(within(dialog).getByTestId("product-detail-stock-minimo")).toHaveTextContent("3 días");
    await waitFor(() => expect(within(dialog).getByTestId("product-detail-dias-alerta")).toHaveTextContent("5 días"));
    expect(within(dialog).getByText("Usando tu regla general")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /Editar/ }));
    expect(screen.getByText("Editar producto")).toBeInTheDocument();
  });

  it("no hay botón «Stock total»: arriba a la derecha se ve el stock total y la cantidad de productos", async () => {
    mockGets([product({ id: 1, stock: 5 }), product({ id: 2, nombre: "Leche", stock: 1200 })]);
    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    expect(screen.queryByTestId("open-stock-total")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Stock total/ })).not.toBeInTheDocument();
    expect(await screen.findByTestId("inventory-total-value")).toHaveTextContent("1.205 Unidades");
    expect(screen.getByTestId("inventory-total-products")).toHaveTextContent("2 Productos");
  });

  it("el stock total se pide con la búsqueda y los filtros elegidos, y dice «unidad» y «producto» en singular", async () => {
    const user = userEvent.setup();
    mockGets([product({ id: 1, stock: 1 })]);
    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    await elegir(user, "Ubicación", "Alacena");

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/me/products/stock-total", { params: expect.objectContaining({ ubicacion: "Alacena" }) }),
    );
    expect(api.get).toHaveBeenCalledWith("/me/products", { params: expect.objectContaining({ ubicacion: "Alacena" }) });
    expect(await screen.findByTestId("inventory-total-value")).toHaveTextContent("1 Unidad");
    expect(screen.getByTestId("inventory-total-products")).toHaveTextContent("1 Producto");
  });

  it("el historial se abre desde la información del producto", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    renderWithProviders(<MyProducts />);

    await user.click(await screen.findByTestId("product-open-1"));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Historial/ }));

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/me/products/1/consumption"));
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

    await elegir(user, "Categoría", "Almacén");
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/me/products",
        expect.objectContaining({ params: expect.objectContaining({ categoria: "Almacén" }) }),
      ),
    );

    await elegir(user, "Vencimiento", "Vencidos");
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/me/products",
        expect.objectContaining({ params: expect.objectContaining({ vencido: true }) }),
      ),
    );

    await user.click(screen.getByLabelText("Stock bajo"));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/me/products",
        expect.objectContaining({ params: expect.objectContaining({ bajo_stock: true }) }),
      ),
    );

    await user.click(screen.getByLabelText("Por vencer"));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/me/products",
        expect.objectContaining({ params: expect.objectContaining({ por_vencer: true }) }),
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

    // checkboxes[0] y [1] son los filtros "Stock bajo" y "Por vencer", [2] es "seleccionar todos" de
    // la tabla y el resto son las filas.
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[3]);
    expect(screen.getByText("1 producto seleccionado")).toBeInTheDocument();

    await user.click(checkboxes[2]);
    expect(screen.getByText("2 productos seleccionados")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Editar todo" }));
    const modal = screen.getByText("Editar 2 productos").closest(".rounded-3xl") as HTMLElement;
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
    await user.click(screen.getAllByRole("checkbox")[3]);
    await user.click(screen.getByRole("button", { name: "Editar todo" }));

    expect(screen.getByRole("button", { name: "Aplicar" })).toBeDisabled();
    const modalScope = within(screen.getByText("Editar 1 productos").closest(".rounded-3xl") as HTMLElement);
    await user.selectOptions(modalScope.getByText("Marca").nextElementSibling as HTMLSelectElement, "Otra Marca");
    await user.click(screen.getByRole("button", { name: "Aplicar" }));

    expect(await screen.findByText("No se pudo aplicar.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText("Editar 1 productos")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Deseleccionar todo" }));
    expect(screen.queryByText(/^\d+ productos? seleccionados?$/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("selection-count")).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Editar" }));

    const modal = screen.getByText("Editar producto").closest(".rounded-3xl") as HTMLElement;
    const modalScope = within(modal);

    const nombreInput = modalScope.getByText("Nombre").nextElementSibling as HTMLInputElement;
    expect(nombreInput.value).toBe("Yerba Mate");

    await user.clear(nombreInput);
    await user.type(nombreInput, "Yerba Mate 500g");
    await user.selectOptions(modalScope.getByText("Marca").nextElementSibling as HTMLSelectElement, "Otra Marca");
    await user.selectOptions(modalScope.getByText("Categoría").nextElementSibling as HTMLSelectElement, "Almacén");
    const stockInput = modalScope.getByText("Stock").nextElementSibling as HTMLInputElement;
    await user.clear(stockInput);
    await user.type(stockInput, "9");
    const vencimientoInput = modalScope.getByText("Vencimiento").nextElementSibling as HTMLInputElement;
    await user.type(vencimientoInput, "2026-09-01");
    await user.selectOptions(modalScope.getByText("Ubicación").nextElementSibling as HTMLSelectElement, "Alacena");
    await user.type(modalScope.getAllByPlaceholderText("Opcional").find((el) => el.getAttribute("inputmode") === "numeric")!, "1");
    expect(modalScope.queryByText("URL de imagen")).not.toBeInTheDocument();
    expect(modalScope.getByTestId("image-upload")).toBeInTheDocument();
    await user.type(modalScope.getByText("Descripción").nextElementSibling as HTMLTextAreaElement, "Notas");
    await user.type(modalScope.getByText("Stock mínimo (días de cobertura)").nextElementSibling as HTMLInputElement, "2");
    await user.type(modalScope.getByText("Días de anticipación (vencimiento)").nextElementSibling as HTMLInputElement, "3");

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
    await user.click(screen.getByRole("button", { name: "Editar" }));
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
    await user.click(screen.getByRole("button", { name: "Editar" }));
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
    await user.click(screen.getByRole("button", { name: "Editar" }));
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

    expect(await screen.findByText("Historial del Producto")).toBeInTheDocument();
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

describe("MyProducts · filtros, selección y eliminación", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("los filtros miden siempre lo mismo y los textos largos se cortan con «...»", async () => {
    const largo = "Z".repeat(60);
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/products/filters/options") return { data: { categorias: [largo], ubicaciones: ["Alacena"], marcas: [] } };
      if (url === "/me/products") return { data: paginated([product()]) };
      if (url === "/me/products/stock-total") return { data: { stock_total: 5, products: 1 } };
      if (url === "/me/alerts/") return { data: { items: [], summary: {} } };
      if (url === "/me/profile") return { data: PERFIL };
      throw new Error(`GET no mockeado: ${url}`);
    });
    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    const filtros = ["Categoría", "Marca", "Ubicación", "Vencimiento"].map((name) => filtroBtn(name));
    filtros.forEach((filtro) => {
      expect(filtro.className).toContain("w-full");
      expect(filtro.className).toContain("h-10");
      expect(filtro.querySelector("span")!.className).toContain("truncate");
    });
    expect(screen.getByPlaceholderText("Buscar por nombre o marca…").className).toContain("md:col-span-4");
    await userEvent.setup().click(filtroBtn("Categoría"));
    const option = await screen.findByRole("option", { name: `${"Z".repeat(50)}...` });
    expect(option).toHaveAttribute("title", largo);
  });

  it("el filtro de marca llega con el filtro del dashboard y se manda al servidor", async () => {
    mockGets([product()]);
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter initialEntries={[{ pathname: "/productos", state: { marca: "La Merced" } }]}>
          <MyProducts />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Marca" })).toHaveTextContent("La Merced"));
    expect(api.get).toHaveBeenCalledWith("/me/products", { params: expect.objectContaining({ marca: "La Merced" }) });
    expect(api.get).toHaveBeenCalledWith("/me/products/stock-total", { params: expect.objectContaining({ marca: "La Merced" }) });
  });

  it("la barra de selección solo aparece con productos elegidos, con la «X» a la izquierda del texto", async () => {
    const user = userEvent.setup();
    mockGets([product({ id: 1 }), product({ id: 2, nombre: "Fideos" })]);
    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    expect(screen.queryByTestId("selection-bar")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Seleccionar Yerba Mate"));
    expect(screen.getByTestId("selection-edit")).toHaveTextContent("Editar todo");
    expect(screen.getByTestId("selection-delete")).toBeEnabled();
    const clear = screen.getByTestId("selection-clear");
    expect(clear.compareDocumentPosition(screen.getByTestId("selection-count")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(clear);
    expect(screen.queryByTestId("selection-bar")).not.toBeInTheDocument();
    expect((screen.getByLabelText("Seleccionar Yerba Mate") as HTMLInputElement).checked).toBe(false);
  });

  it("cada producto de la lista muestra su nombre y, debajo, la marca, sin código de barras", async () => {
    mockGets([product(), product({ id: 2, nombre: "Fideos", marca: null })]);
    renderWithProviders(<MyProducts />);

    const open = await screen.findByTestId("product-open-1");
    expect(open.className).toContain("text-base");
    expect(open.nextElementSibling).toHaveTextContent("La Merced");
    expect(screen.queryByTitle("Código de barras")).not.toBeInTheDocument();
    expect(screen.getByTestId("product-open-2").nextElementSibling).toBeNull();
  });

  it("la casilla de la fila selecciona sin abrir la información del producto", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    await user.click(screen.getByLabelText("Seleccionar Yerba Mate"));

    expect(screen.queryByRole("dialog", { name: "Información del Producto" })).not.toBeInTheDocument();
    expect(screen.getByTestId("selection-count")).toHaveTextContent("1 producto seleccionado");
  });

  it("tocar cualquier parte de la fila abre «Información del Producto»", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    renderWithProviders(<MyProducts />);

    await screen.findByText("Yerba Mate");
    await user.click(within(screen.getByRole("table")).getByText("Almacén"));

    expect(screen.getByRole("dialog", { name: "Información del Producto" })).toBeInTheDocument();
    expect(screen.getByTestId("product-detail-categoria")).toHaveTextContent("Almacén");
  });

  it("la marca de la edición se elige entre las existentes o se crea una nueva, como la categoría", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    await user.click(screen.getByRole("button", { name: "Editar" }));
    const modal = within(screen.getByText("Editar producto").closest(".rounded-3xl") as HTMLElement);
    const marca = modal.getByText("Marca").nextElementSibling as HTMLSelectElement;
    expect(marca.tagName).toBe("SELECT");
    expect(within(marca).getAllByRole("option").map((o) => o.textContent)).toEqual(["Sin marca", "La Merced", "Otra Marca", "+ Nueva…"]);
    // La marca va antes que la categoría
    expect(modal.getByText("Marca").compareDocumentPosition(modal.getByText("Categoría")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.selectOptions(marca, "__new__");
    await user.type(modal.getByLabelText("Marca nueva"), "Marca Nueva{Enter}");
    expect((modal.getByText("Marca").nextElementSibling as HTMLSelectElement).value).toBe("Marca Nueva");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/me/products/1", expect.objectContaining({ marca: "Marca Nueva" })));
  });

  it("«Editar todo» tiene la marca arriba de la categoría, con las existentes y «+ Nueva…»", async () => {
    const user = userEvent.setup();
    mockGets([product({ id: 1 }), product({ id: 2, nombre: "Fideos" })]);
    vi.mocked(api.patch).mockResolvedValue({ data: { updated: 2 } });
    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    await user.click(screen.getByRole("columnheader", { name: "" }).querySelector("input")!);
    await user.click(screen.getByRole("button", { name: "Editar todo" }));
    const modal = within(screen.getByText("Editar 2 productos").closest(".rounded-3xl") as HTMLElement);
    const marca = modal.getByText("Marca").nextElementSibling as HTMLSelectElement;
    expect(within(marca).getAllByRole("option").map((o) => o.textContent)).toEqual(["No cambiar", "La Merced", "Otra Marca", "+ Nueva…"]);
    expect(modal.getByText("Marca").compareDocumentPosition(modal.getByText("Categoría")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.selectOptions(marca, "La Merced");
    await user.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/me/products/bulk-edit", { product_ids: [1, 2], marca: "La Merced" }));
  });

  it("el botón «Eliminar» está a la derecha de «Historial» y, al confirmar, elimina el producto", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    vi.mocked(api.delete).mockResolvedValue({ data: null });
    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    const historial = screen.getByRole("button", { name: "Historial" });
    const eliminar = screen.getByTestId("product-delete-1");
    expect(historial.compareDocumentPosition(eliminar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(eliminar);
    expect(api.delete).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: "Eliminar producto" });
    expect(dialog).toHaveTextContent('¿Eliminar "Yerba Mate" del inventario?');
    await user.click(within(dialog).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/me/products/1"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("se puede cancelar la eliminación y, si falla, se avisa", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    vi.mocked(api.delete).mockImplementation(async () => {
      const err: any = new Error("fallo");
      err.response = { data: { detail: "No se pudo eliminar." } };
      throw err;
    });
    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    await user.click(screen.getByTestId("product-delete-1"));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("product-delete-1"));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Eliminar" }));
    expect(await screen.findByText("No se pudo eliminar.")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("«Borrar todo» elimina los productos seleccionados después de confirmar", async () => {
    const user = userEvent.setup();
    mockGets([product({ id: 1 }), product({ id: 2, nombre: "Fideos" })]);
    vi.mocked(api.post).mockResolvedValue({ data: { deleted: 2 } });
    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    await user.click(screen.getByLabelText("Seleccionar Yerba Mate"));
    await user.click(screen.getByLabelText("Seleccionar Fideos"));
    await user.click(screen.getByRole("button", { name: /Borrar todo/ }));
    const dialog = screen.getByRole("alertdialog", { name: "Borrar productos" });
    expect(dialog).toHaveTextContent("¿Borrar los 2 productos seleccionados del inventario?");
    await user.click(within(dialog).getByRole("button", { name: "Borrar todo" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/me/products/bulk-delete", { product_ids: [1, 2] }));
    await waitFor(() => expect(screen.queryByTestId("selection-count")).not.toBeInTheDocument());
  });

  it("si falla el borrado en lote, lo avisa y no pierde la selección", async () => {
    const user = userEvent.setup();
    mockGets([product({ id: 1 })]);
    vi.mocked(api.post).mockRejectedValue(new Error("fallo"));
    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    await user.click(screen.getByLabelText("Seleccionar Yerba Mate"));
    await user.click(screen.getByRole("button", { name: /Borrar todo/ }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Borrar todo" }));

    expect(await screen.findByText("No se pudieron eliminar los productos.")).toBeInTheDocument();
    expect(screen.getByTestId("selection-count")).toHaveTextContent("1 producto seleccionado");
  });

  it("un producto eliminado también deja de estar seleccionado", async () => {
    const user = userEvent.setup();
    mockGets([product({ id: 1 }), product({ id: 2, nombre: "Fideos" })]);
    vi.mocked(api.delete).mockResolvedValue({ data: null });
    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    await user.click(screen.getByLabelText("Seleccionar Yerba Mate"));
    await user.click(screen.getByLabelText("Seleccionar Fideos"));
    await user.click(screen.getByTestId("product-delete-1"));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(screen.getByTestId("selection-count")).toHaveTextContent("1 producto seleccionado"));
  });
});

describe("MyProducts · encabezado, filtros y eliminar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("el stock total es un texto «STOCK XX Unidades | YY Productos», en la misma fila que el título", async () => {
    mockGets([product({ id: 1, stock: 5 }), product({ id: 2, nombre: "Leche", stock: 7 })]);
    renderWithProviders(<MyProducts />);

    const summary = await screen.findByTestId("inventory-total-summary");
    expect(summary).toHaveTextContent("Stock");
    expect(screen.getByTestId("inventory-total-value")).toHaveTextContent("12 Unidades");
    expect(screen.getByTestId("inventory-total-products")).toHaveTextContent("2 Productos");
    expect(summary).toHaveTextContent("|");
    expect(summary.className).not.toContain("shadow");
    const header = screen.getByRole("heading", { name: "Inventario" }).parentElement!.parentElement!;
    expect(header.className).toContain("items-center");
    expect(header).toContainElement(summary);
  });

  it("sin productos seleccionados no hay barra, y la ventana de información nunca ofrece «Stock total»", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    expect(screen.queryByTestId("selection-bar")).not.toBeInTheDocument();
    await user.click(await screen.findByTestId("product-open-1"));
    const dialog = screen.getByRole("dialog", { name: "Información del Producto" });
    expect(within(dialog).queryByRole("button", { name: /Stock total/ })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Historial/ })).toBeInTheDocument();
  });

  it("los desplegables del inventario muestran 10 opciones y se desplazan para llegar al resto", async () => {
    const user = userEvent.setup();
    const marcas = Array.from({ length: 30 }, (_, i) => `Marca ${i}`);
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/products/filters/options") return { data: { categorias: [], ubicaciones: [], marcas } };
      if (url === "/me/products") return { data: paginated([product()]) };
      if (url === "/me/products/stock-total") return { data: { stock_total: 5, products: 1 } };
      if (url === "/me/alerts/") return { data: { items: [], summary: {} } };
      if (url === "/me/profile") return { data: PERFIL };
      throw new Error(`GET no mockeado: ${url}`);
    });
    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    await user.click(filtroBtn("Marca"));

    const menu = screen.getByRole("listbox", { name: "Marca" });
    expect(menu.style.maxHeight).toBe("25rem");
    expect(menu.className).toContain("overflow-y-auto");
    expect(within(menu).getAllByRole("option")).toHaveLength(31);
  });

  it("el filtro de vencimiento dice «Todos los vencimientos»", async () => {
    mockGets([product()]);
    renderWithProviders(<MyProducts />);

    await screen.findByText("Yerba Mate");
    expect(filtroBtn("Vencimiento")).toHaveTextContent("Todos los vencimientos");
    expect(screen.queryByText("Vencimiento: todos")).not.toBeInTheDocument();
  });

  it("la exportación va a la derecha del buscador y las casillas, abajo, junto a los demás filtros", async () => {
    mockGets([product()]);
    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    const search = screen.getByPlaceholderText("Buscar por nombre o marca…");
    const grid = search.parentElement!;
    expect(grid.className).toContain("md:grid-cols-[repeat(4,minmax(0,1fr))_auto]");
    expect(search.className).toContain("md:col-span-4");
    const csv = screen.getByRole("button", { name: /CSV/ });
    const checks = screen.getByLabelText("Stock bajo").closest("div")!;
    const vencimiento = screen.getByLabelText("Vencimiento");
    expect(grid).toContainElement(checks);
    expect(search.compareDocumentPosition(csv) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(csv.compareDocumentPosition(vencimiento) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(vencimiento.compareDocumentPosition(checks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(csv.className).toContain("w-20");
    expect(screen.getByRole("button", { name: /Excel/ }).parentElement).toBe(csv.parentElement);
  });

  it("el botón «Eliminar» tiene contorno y letras rojizas", async () => {
    mockGets([product()]);
    renderWithProviders(<MyProducts />);

    const button = await screen.findByTestId("product-delete-1");
    expect(button.className).toContain("border-danger");
    expect(button.className).toContain("text-danger");
  });

  it("en pantallas anchas la página entra entera y solo se desplaza la lista", async () => {
    mockGets([product()]);
    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    const root = screen.getByRole("heading", { name: "Inventario" }).parentElement!.parentElement!.parentElement!;
    expect(root.className).toContain("md:h-[calc(100vh-4.5rem)]");
    expect(screen.getByRole("table").parentElement!.className).toContain("md:flex-1");
  });
});

it("el texto del stock total es un poco más grande", async () => {
  mockGets([product()]);
  renderWithProviders(<MyProducts />);

  const summary = await screen.findByTestId("inventory-total-summary");
  expect(summary.className).toContain("text-base");
  expect(screen.getByTestId("inventory-total-value").className).toContain("text-2xl");
});

describe("MyProducts · nombre de los archivos exportados", () => {
  it("se descargan como «productos.csv» y «productos.xlsx»", async () => {
    vi.clearAllMocks();
    const user = userEvent.setup();
    mockGets([product()]);
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/products/filters/options") return { data: OPCIONES };
      if (url === "/me/products") return { data: paginated([product()]) };
      if (url === "/me/products/stock-total") return { data: { stock_total: 5, products: 1 } };
      if (url === "/me/profile") return { data: PERFIL };
      if (url === "/me/products/export") return { data: new Blob(["x"]) };
      throw new Error(`GET no mockeado: ${url}`);
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const nombres: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      nombres.push(this.download);
    });
    renderWithProviders(<MyProducts />);
    await screen.findByText("Yerba Mate");

    await user.click(screen.getByRole("button", { name: /CSV/ }));
    await waitFor(() => expect(nombres).toContain("productos.csv"));
    await user.click(screen.getByRole("button", { name: /Excel/ }));
    await waitFor(() => expect(nombres).toContain("productos.xlsx"));
    expect(nombres.some((n) => n.startsWith("mis_"))).toBe(false);
  });
});
