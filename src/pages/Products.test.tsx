import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import Products from "./Products";
import type { AdminProduct, AlertOut, Paginated } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), delete: vi.fn() },
}));

import { api } from "@/lib/api";

const OPCIONES = {
  categorias: ["Almacén"],
  marcas: ["La Merced"],
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
    if (url === "/admin/products/stock-total") {
      return { data: { stock_total: items.reduce((n, p) => n + p.stock, 0), products: items.length } };
    }
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

function alerta(overrides: Partial<AlertOut> = {}): AlertOut {
  return {
    key: "expiry-1",
    product_id: 1,
    type: "expiry",
    level: "critical",
    origin: "rule",
    days_to_expiry: 1,
    days_until_stockout: null,
    units_wasted: null,
    suggested_qty: null,
    limit_days: 7,
    rule_scope: "general",
    predictive: false,
    product_name: "Yerba Mate",
    product_brand: "La Merced",
    product_category: "Almacén",
    product_location: null,
    product_stock: 5,
    product_expiry: "2026-11-05",
    image_url: null,
    user_id: "u1",
    ...overrides,
  };
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
    // en el listado solo van el nombre y la marca, sin el código de barras
    expect(screen.getByText("La Merced")).toBeInTheDocument();
    expect(screen.queryByText("7791234567890")).not.toBeInTheDocument();
  });

  it("sin productos, muestra el estado vacío", async () => {
    mockGets([]);
    renderWithProviders(<Products />);
    expect(await screen.findByText("No se encontraron productos.")).toBeInTheDocument();
  });

  it("filtra por búsqueda, categoría, marca, usuario y alertas", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    renderWithProviders(<Products />);
    await screen.findByText("Yerba Mate");

    await user.type(screen.getByPlaceholderText("Buscar por nombre, marca o mail de usuario…"), "Yerba");
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/admin/products/",
        expect.objectContaining({ params: expect.objectContaining({ search: "Yerba" }) }),
      ),
    );

    await elegir(user, "Usuario", "duenio@test.com");
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/admin/products/",
        expect.objectContaining({ params: expect.objectContaining({ user_id: "u1" }) }),
      ),
    );

    await elegir(user, "Categoría", "Almacén");
    await elegir(user, "Marca", "La Merced");
    await elegir(user, "Nivel de alerta", "Críticas");

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/admin/products/",
        expect.objectContaining({
          params: expect.objectContaining({ categoria: "Almacén", marca: "La Merced", alert_level: "critical" }),
        }),
      ),
    );
    // Ya no están los filtros de vencimiento, stock bajo ni imagen
    expect(screen.queryByLabelText("Stock bajo")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Solo con imagen")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Vencimiento: todos")).not.toBeInTheDocument();
  });

  it("ordena por columnas ciclando asc/desc/sin orden", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    renderWithProviders(<Products />);
    await screen.findByText("Yerba Mate");

    await user.click(screen.getByRole("button", { name: "Stock" }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/admin/products/",
        expect.objectContaining({ params: expect.objectContaining({ sort_by: "stock", sort_dir: "asc" }) }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "Stock" }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/admin/products/",
        expect.objectContaining({ params: expect.objectContaining({ sort_dir: "desc" }) }),
      ),
    );
  });

  it("muestra el vencimiento en formato argentino y el nivel de alerta que calcula el servidor", async () => {
    mockGets([
      product({ id: 1, nombre: "Vencido", vencimiento: "2000-01-01", alert_level: "critical", alert_types: ["expiry"] }),
      product({ id: 2, nombre: "PorVencer", vencimiento: "2026-11-02", alert_level: "warning", alert_types: ["expiry"] }),
      product({ id: 3, nombre: "Ok", vencimiento: "2999-01-01" }),
    ]);
    renderWithProviders(<Products />);
    await screen.findByText("Vencido");

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("01/01/2000");
    expect(rows[2]).toHaveTextContent("01/01/2999");
    expect(screen.getByTestId("product-alert-1")).toHaveTextContent("Crítica");
    expect(screen.getByTestId("product-alert-2")).toHaveTextContent("Advertencia");
    expect(screen.getByTestId("product-alert-3")).toHaveTextContent("—");
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
    const modal = screen.getByText("Eliminar producto").closest(".rounded-3xl") as HTMLElement;
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
    const modal = screen.getByText("Eliminar producto").closest(".rounded-3xl") as HTMLElement;
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

describe("Products (admin) - formato del inventario", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tiene el título y la descripción de la plataforma, y no tiene el botón «Stock total»", async () => {
    mockGets([product()]);
    renderWithProviders(<Products />);
    await screen.findByText("Yerba Mate");

    expect(screen.getByRole("heading", { name: "Productos de la Plataforma" })).toBeInTheDocument();
    expect(screen.getByText("Datos de cada producto cargado por los usuarios de la aplicación")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Stock total/ })).not.toBeInTheDocument();
    expect(screen.queryByTitle("Ver el stock total de este producto")).not.toBeInTheDocument();
  });

  it("arriba muestra las unidades y los productos totales, con la búsqueda y los filtros", async () => {
    const user = userEvent.setup();
    mockGets([product({ stock: 5 }), product({ id: 2, nombre: "Fideos", stock: 7 })]);
    renderWithProviders(<Products />);

    expect(await screen.findByTestId("products-total-value")).toHaveTextContent("12 Unidades");
    expect(screen.getByTestId("products-total-products")).toHaveTextContent("2 Productos");
    await elegir(user, "Marca", "La Merced");
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/admin/products/stock-total", { params: { marca: "La Merced" } }),
    );
  });

  it("en singular dice «1 Unidad» y «1 Producto»", async () => {
    mockGets([product({ stock: 1 })]);
    renderWithProviders(<Products />);

    expect(await screen.findByTestId("products-total-value")).toHaveTextContent("1 Unidad");
    expect(screen.getByTestId("products-total-products")).toHaveTextContent("1 Producto");
  });

  it("los títulos de todas las columnas están en mayúscula, también los de las que se ordenan", async () => {
    mockGets([product()]);
    renderWithProviders(<Products />);
    await screen.findByText("Yerba Mate");

    const titulos = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(titulos).toEqual(["Imagen", "Producto", "Usuario", "Categoría", "Stock", "Vencimiento", "Alerta", "Acciones"]);
    // Los de texto simple la heredan de la fila; los botones de orden la piden ellos mismos
    expect(screen.getAllByRole("columnheader")[0].closest("tr")!.className).toContain("uppercase");
    ["Producto", "Categoría", "Stock", "Vencimiento"].forEach((name) =>
      expect(ordenBtn(name).className).toContain("uppercase"),
    );
  });

  it("al tocar un producto abre su información con el mail del usuario arriba de todo y su alerta", async () => {
    const user = userEvent.setup();
    mockGets([product({ alert_level: "critical", alert_types: ["expiry"], alerts: [alerta()] })]);
    renderWithProviders(<Products />);

    await user.click(await screen.findByTestId("product-row-1"));

    const modal = await screen.findByTestId("product-detail");
    expect(within(modal).getByTestId("product-detail-owner")).toHaveTextContent("duenio@test.com");
    expect(within(modal).getByTestId("product-detail-name")).toHaveTextContent("Yerba Mate");
    // el mail es lo primero que se ve
    expect(modal.innerHTML.indexOf("product-detail-owner")).toBeLessThan(modal.innerHTML.indexOf("product-detail-name"));
    // un usuario habilitado no lleva insignia ni va en rojo
    expect(within(modal).queryByText("Usuario deshabilitado")).not.toBeInTheDocument();
    expect(within(modal).getByText("duenio@test.com").className).not.toContain("text-danger");
  });

  it("la alerta del producto se ve con su color y su información, debajo del stock", async () => {
    const user = userEvent.setup();
    mockGets([product({ alert_level: "critical", alerts: [alerta()] })]);
    renderWithProviders(<Products />);

    await user.click(await screen.findByTestId("product-row-1"));

    const modal = await screen.findByTestId("product-detail");
    const caja = within(modal).getByTestId("product-detail-alert-0");
    expect(within(modal).getByTestId("product-detail-alert-title-0")).toHaveTextContent("Vence mañana");
    expect(caja).toHaveTextContent("Alerta crítica");
    expect(caja.style.borderColor).not.toBe("");
    expect(caja.style.background).not.toBe("");
    const html = modal.innerHTML;
    expect(html.indexOf("product-detail-stock")).toBeLessThan(html.indexOf("product-detail-alert-0"));
    expect(html.indexOf("product-detail-alert-0")).toBeLessThan(html.indexOf("product-detail-ubicacion"));
  });

  it("la alerta trae la explicación completa y, si es una predicción, la medalla «Predicción»", async () => {
    const user = userEvent.setup();
    mockGets([
      product({
        alerts: [
          alerta(),
          alerta({ key: "stock-1", type: "stock_low_coverage", level: "warning", predictive: true, days_until_stockout: 3, days_to_expiry: null, limit_days: 7, suggested_qty: 4 }),
        ],
      }),
    ]);
    renderWithProviders(<Products />);

    await user.click(await screen.findByTestId("product-row-1"));

    const modal = await screen.findByTestId("product-detail");
    const vencimiento = within(modal).getByTestId("product-detail-alert-0");
    expect(vencimiento).toHaveTextContent("Queda");
    expect(vencimiento).toHaveTextContent("Te avisamos cuando faltan menos de 7 días");
    expect(within(vencimiento).queryByText("Predicción")).not.toBeInTheDocument();
    const stock = within(modal).getByTestId("product-detail-alert-1");
    expect(within(stock).getByTestId("product-detail-alert-prediction-1")).toHaveTextContent("Predicción");
    expect(stock).toHaveTextContent("Se sugiere reponer".replace("Se sugiere", "se sugiere"));
  });

  it("los filtros ocupan todo el ancho: el último termina donde termina el botón «Excel»", async () => {
    mockGets([product()]);
    renderWithProviders(<Products />);
    await screen.findByText("Yerba Mate");

    const filtros = screen.getByTestId("products-filters");
    expect(filtros.className).toContain("md:grid-cols-4");
    expect(within(filtros).getAllByRole("button")).toHaveLength(4);
    // la fila de arriba (buscador y exportación) y la de los filtros comparten el mismo contenedor, sin columnas extra
    expect(filtros.parentElement!.contains(screen.getByRole("button", { name: /Excel/ }))).toBe(true);
    expect(filtros.className).not.toContain("auto");
  });

  it("una advertencia dice «Advertencia» y la ventana del administrador es más ancha", async () => {
    const user = userEvent.setup();
    mockGets([product({ alert_level: "warning", alerts: [alerta({ level: "warning", days_to_expiry: 5 })] })]);
    renderWithProviders(<Products />);

    await user.click(await screen.findByTestId("product-row-1"));

    const modal = await screen.findByTestId("product-detail");
    expect(within(modal).getByTestId("product-detail-alert-0")).toHaveTextContent("Advertencia");
    expect(within(modal).getByTestId("product-detail-alert-title-0")).toHaveTextContent("Vence en 5 días");
    expect(modal.parentElement!.outerHTML).toContain("max-w-xl");
  });

  it("un producto sin alerta no muestra la fila de alerta, y sin mail se ve el id del usuario", async () => {
    const user = userEvent.setup();
    mockGets([product({ owner: { user_id: "u-sin-email", email: null } })]);
    renderWithProviders(<Products />);

    await user.click(await screen.findByTestId("product-open-1"));

    const modal = await screen.findByTestId("product-detail");
    expect(within(modal).queryByTestId("product-detail-alert")).not.toBeInTheDocument();
    expect(within(modal).getByTestId("product-detail-owner")).toHaveTextContent("u-sin-email");
    expect(within(modal).getAllByText("Usando la regla general del usuario").length).toBeGreaterThan(0);
    await user.click(within(modal).getByRole("button", { name: "Volver" }));
    expect(screen.queryByTestId("product-detail")).not.toBeInTheDocument();
  });

  it("eliminar desde la fila no abre la información del producto", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    renderWithProviders(<Products />);
    await screen.findByText("Yerba Mate");

    await user.click(screen.getByRole("button", { name: /Eliminar/ }));

    expect(screen.queryByTestId("product-detail")).not.toBeInTheDocument();
    expect(screen.getByText("Eliminar producto")).toBeInTheDocument();
  });

  it("si el usuario está deshabilitado, su mail va en rojo en el listado", async () => {
    mockGets([
      product({ id: 1, owner: { user_id: "u1", email: "duenio@test.com", is_active: false } }),
      product({ id: 2, nombre: "Fideos", owner: { user_id: "u2", email: "otro@test.com", is_active: true } }),
    ]);
    renderWithProviders(<Products />);

    expect(await screen.findByTestId("product-owner-1")).toHaveClass("text-danger");
    expect(screen.getByTestId("product-owner-2")).not.toHaveClass("text-danger");
  });

  it("en la información del producto, el mail de un usuario deshabilitado va en rojo con la insignia «Usuario deshabilitado» a la derecha", async () => {
    const user = userEvent.setup();
    mockGets([product({ owner: { user_id: "u1", email: "duenio@test.com", is_active: false } })]);
    renderWithProviders(<Products />);

    await user.click(await screen.findByTestId("product-row-1"));

    const modal = await screen.findByTestId("product-detail");
    const owner = within(modal).getByTestId("product-detail-owner");
    expect(within(owner).getByText("duenio@test.com").className).toContain("text-danger");
    const insignia = within(owner).getByText("Usuario deshabilitado");
    expect(insignia).toBeInTheDocument();
    expect(owner.innerHTML.indexOf("duenio@test.com")).toBeLessThan(owner.innerHTML.indexOf("Usuario deshabilitado"));
  });

  it("los desplegables muestran las primeras 10 opciones y se desplazan para llegar al resto", async () => {
    const user = userEvent.setup();
    const owners = Array.from({ length: 25 }, (_, i) => ({ user_id: `u${i}`, email: `usuario${i}@test.com` }));
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/products/filters/options") return { data: { ...OPCIONES, owners } };
      if (url === "/admin/products/") return { data: paginated([product()]) };
      if (url === "/admin/products/stock-total") return { data: { stock_total: 5, products: 1 } };
      throw new Error(`GET no mockeado: ${url}`);
    });
    renderWithProviders(<Products />);
    await screen.findByText("Yerba Mate");

    await user.click(screen.getByRole("button", { name: "Usuario" }));

    const menu = screen.getByRole("listbox", { name: "Usuario" });
    // 10 filas de 2,5 rem a la vista; el resto, con scroll
    expect(menu.style.maxHeight).toBe("25rem");
    expect(menu.className).toContain("overflow-y-auto");
    expect(within(menu).getAllByRole("option")).toHaveLength(26);
    await user.click(within(menu).getByRole("option", { name: "usuario24@test.com" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usuario" })).toHaveTextContent("usuario24@test.com");
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/admin/products/", expect.objectContaining({ params: expect.objectContaining({ user_id: "u24" }) })),
    );
  });

  it("el desplegable se cierra con Escape o al tocar afuera, y volver a elegir «Todos» quita el filtro", async () => {
    const user = userEvent.setup();
    mockGets([product()]);
    renderWithProviders(<Products />);
    await screen.findByText("Yerba Mate");

    await elegir(user, "Marca", "La Merced");
    expect(screen.getByRole("button", { name: "Marca" })).toHaveAttribute("title", "La Merced");
    await user.click(screen.getByRole("button", { name: "Marca" }));
    expect(screen.getByRole("option", { name: "La Merced" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(filtroBtn("Categoría"));
    expect(screen.getByRole("listbox", { name: "Categoría" })).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await elegir(user, "Marca", "Todas las marcas");
    expect(screen.getByRole("button", { name: "Marca" })).toHaveTextContent("Todas las marcas");
  });
});
