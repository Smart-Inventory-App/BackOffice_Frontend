import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/test-utils";
import ReceiptReview, { blankReceiptItem, buildEntradaRows, initReceiptItems, mergeSuggestions, validateReceiptItems } from "./ReceiptReview";
import type { ProductDraft, ProductMatch, ProductSuggestion, ScanResult } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { api } from "@/lib/api";

const OPCIONES = { categorias: ["Almacén", "Lácteos"], ubicaciones: ["Alacena"], marcas: ["La Merced"] };

function match(overrides: Partial<ProductMatch> = {}): ProductMatch {
  return {
    id: 1,
    nombre: "Yerba Mate 1kg",
    marca: "La Merced",
    categoria: "Almacén",
    ubicacion: "Alacena",
    vencimiento: "2027-03-05",
    stock: 6,
    codigo_barras: "7791234567890",
    score: 0.92,
    por_codigo: false,
    ...overrides,
  };
}

function draft(overrides: Partial<ProductDraft> = {}): ProductDraft {
  return {
    nombre: "YERBA MTE",
    marca: null,
    descripcion: null,
    vencimiento: null,
    codigo_barras: null,
    pais_registro: null,
    stock: 2,
    confianzas: {},
    texto_leido: "YERBA MTE 1K",
    coincidencias: [match(), match({ id: 2, nombre: "Yerba Suave", marca: null, vencimiento: null, score: 0.5 })],
    coincidencia_id: 1,
    ...overrides,
  };
}

function resultado(items: ProductDraft[], comprobante: ScanResult["comprobante"] = null): ScanResult {
  return {
    doc_type: "receipt",
    draft: null,
    items,
    comprobante,
    needs_review: false,
    confianza: 0.9,
    texto_legible: "",
    advertencias: [],
    sin_coincidencia: 0,
  };
}

const suggestion = (overrides: Partial<ProductSuggestion> = {}): ProductSuggestion => ({
  id: 7,
  nombre: "Leche entera",
  marca: "Ser",
  categoria: "Lácteos",
  ubicacion: null,
  vencimiento: null,
  stock: 4,
  stock_minimo: null,
  dias_alerta_vencimiento: null,
  codigo_barras: null,
  ...overrides,
});

function renderReview(
  direction: "entrada" | "salida",
  items: ProductDraft[],
  comprobante: ScanResult["comprobante"] = null,
) {
  const onDone = vi.fn();
  const onScanAnother = vi.fn();
  const setOpciones = vi.fn();
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ReceiptReview
        direction={direction}
        resultado={resultado(items, comprobante)}
        opciones={OPCIONES}
        setOpciones={setOpciones}
        origen="Documento Comercial"
        onDone={onDone}
        onScanAnother={onScanAnother}
      />
    </QueryClientProvider>,
  );
  return { onDone, onScanAnother, setOpciones };
}

function serveSearch(match: ProductSuggestion[] = [], suggest: ProductSuggestion[] = []) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === "/me/products/match") return { data: match };
    if (url === "/me/products/suggest") return { data: suggest };
    throw new Error(`GET no mockeado: ${url}`);
  });
}

describe("ReceiptReview · lógica", () => {
  it("cada producto arranca con el texto leído como nombre y sus parecidos, sin elegir ninguno ni completar otros datos", () => {
    const items = initReceiptItems([draft()]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ textoLeido: "YERBA MTE 1K", name: "YERBA MTE 1K", selected: null, searched: true, creating: false, categoria: "", marca: "", vencimiento: "", codigo: "", quantity: "2" });
    expect(items[0].options.map((o) => o.id)).toEqual([1, 2]);
    expect(items[0].similarity).toEqual({ 1: 92, 2: 50 });
  });

  it("sin texto leído usa el nombre, y sin stock leído arranca en 1", () => {
    const [item] = initReceiptItems([draft({ texto_leido: null, nombre: "Yerba", stock: null, coincidencias: [] })]);

    expect(item.name).toBe("Yerba");
    expect(item.quantity).toBe("1");
    const [vacio] = initReceiptItems([draft({ texto_leido: null, nombre: null, stock: 0, coincidencias: [] })]);
    expect(vacio.name).toBe("");
    expect(vacio.textoLeido).toBeNull();
  });

  it("un producto agregado a mano arranca en blanco", () => {
    expect(blankReceiptItem(5)).toMatchObject({ id: 5, manual: true, textoLeido: null, name: "", quantity: "", selected: null, searched: false });
  });

  it("une listas de productos sin repetir ninguno", () => {
    expect(mergeSuggestions([suggestion({ id: 1 }), suggestion({ id: 2 })], [suggestion({ id: 2 }), suggestion({ id: 3 })]).map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it("valida el nombre, la categoría y el código de un producto nuevo y el stock de todos", () => {
    const base = blankReceiptItem(1);
    const errors = validateReceiptItems(
      [
        { ...base, id: 1 },
        { ...base, id: 2, name: "x".repeat(21), creating: true, categoria: "", codigo: "123", quantity: "0" },
        { ...base, id: 3, name: "Leche", creating: true, categoria: "Lácteos", quantity: "4" },
        { ...base, id: 4, name: "Algo", quantity: "1" },
      ],
      "entrada",
    );

    expect(errors[1]).toEqual([{ field: "name", kind: "noName" }, { field: "quantity", kind: "required" }]);
    expect(errors[2]).toEqual([
      { field: "name", kind: "tooLong" },
      { field: "categoria", kind: "required" },
      { field: "codigo", kind: "invalid" },
      { field: "quantity", kind: "required" },
    ]);
    expect(errors[3]).toEqual([]);
    expect(errors[4]).toEqual([{ field: "name", kind: "noProduct" }]);
    expect(validateReceiptItems([{ ...base, id: 9, creating: true, name: "" }], "entrada")[9][0]).toEqual({ field: "name", kind: "noName" });
  });

  it("en una salida el stock no puede superar el disponible, y dos renglones del mismo producto suman", () => {
    const p = suggestion({ id: 7, stock: 5 });
    const base = { ...blankReceiptItem(1), selected: p, name: p.nombre };
    const errors = validateReceiptItems([{ ...base, id: 1, quantity: "3" }, { ...base, id: 2, quantity: "3" }, { ...base, id: 3, quantity: "" }], "salida");

    expect(errors[1]).toEqual([]);
    expect(errors[2]).toEqual([{ field: "quantity", kind: "exceeds", available: 5 }]);
    expect(errors[3]).toEqual([{ field: "quantity", kind: "required" }]);
  });

  it("arma las filas de una entrada: el producto elegido suma stock y el nuevo lleva sus datos", () => {
    const elegido = { ...blankReceiptItem(1), selected: suggestion({ id: 7, nombre: "Leche entera", marca: "Ser", categoria: "Lácteos", ubicacion: "Heladera", vencimiento: "2027-01-01", codigo_barras: "7791234567890" }), name: "Leche entera", quantity: "3" };
    const nuevo = { ...blankReceiptItem(2), name: " Sal ", creating: true, categoria: "Almacén", marca: "Celusal", vencimiento: "2028-02-02", codigo: "7791 234-567890", descripcion: "Fina", ubicacion: "Alacena", quantity: "2" };

    const rows = buildEntradaRows([elegido, nuevo]);

    expect(rows[0]).toMatchObject({ row_number: 1, nombre: "Leche entera", marca: "Ser", categoria: "Lácteos", stock: 3, vencimiento: "2027-01-01", codigo_barras: "7791234567890", ubicacion: "Heladera" });
    expect(rows[1]).toMatchObject({ row_number: 2, nombre: "Sal", marca: "Celusal", categoria: "Almacén", stock: 2, vencimiento: "2028-02-02", codigo_barras: "7791234567890", descripcion: "Fina", ubicacion: "Alacena" });
    const vacio = buildEntradaRows([{ ...blankReceiptItem(3), name: "Pan", creating: true, categoria: "Panadería", quantity: "1" }])[0];
    expect(vacio).toMatchObject({ marca: null, vencimiento: null, codigo_barras: null, descripcion: null, ubicacion: null });
  });
});

describe("ReceiptReview · entrada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serveSearch();
  });

  it("tiene el formato de la carga por archivo: la lista a la izquierda con casilla y punto, y el producto a revisar a la derecha", () => {
    renderReview("entrada", [draft(), draft({ texto_leido: "LECHE 1L", nombre: "LECHE", coincidencias: [], coincidencia_id: null })], { comercio: "Súper Don Pepe", fecha_compra: "2026-10-28", total: 1500 });

    expect(screen.getByText("Súper Don Pepe")).toBeInTheDocument();
    expect(screen.getByTestId("receipt-items-title")).toHaveTextContent("Productos a ingresar");
    expect(screen.getByTestId("receipt-line-0")).toHaveTextContent("YERBA MTE 1K");
    expect(screen.getByTestId("receipt-line-1")).toHaveTextContent("LECHE 1L");
    expect(within(screen.getByTestId("receipt-line-0")).getByRole("checkbox")).toBeDisabled();
    expect(screen.getByText("0 de 2 productos incluidos")).toBeInTheDocument();
    expect(screen.getByTestId("receipt-detail-0")).toBeInTheDocument();
  });

  it("al principio se ve el texto leído en el nombre y debajo los productos parecidos, sin completar los demás datos", () => {
    renderReview("entrada", [draft()]);

    expect(screen.getByTestId("receipt-read-0")).toHaveTextContent("YERBA MTE 1K");
    expect((screen.getByTestId("receipt-name-0") as HTMLInputElement).value).toBe("YERBA MTE 1K");
    expect(screen.getByTestId("receipt-options-0")).toHaveTextContent("¿Es alguno de estos?");
    expect(screen.getByTestId("receipt-option-0-1")).toHaveTextContent("Yerba Mate 1kg · La Merced");
    expect(screen.getByTestId("receipt-option-0-1")).toHaveTextContent("Vence 05/03/2027 · Stock: 6");
    expect(screen.getByTestId("receipt-option-0-2")).toHaveTextContent("Sin vencimiento");
    expect(screen.getByTestId("receipt-similarity-0-1")).toHaveTextContent("92% de similitud");
    expect(screen.queryByTestId("receipt-selected-0")).not.toBeInTheDocument();
    expect(screen.queryByTestId("receipt-new-0")).not.toBeInTheDocument();
    expect((screen.getByTestId("receipt-quantity-0") as HTMLInputElement).value).toBe("2");
  });

  it("al elegir una recomendación se ve la información del producto, sin poder editarla, y se puede elegir otro", async () => {
    const user = userEvent.setup();
    renderReview("entrada", [draft()]);

    await user.click(screen.getByTestId("receipt-option-0-1"));

    const card = screen.getByTestId("receipt-selected-0");
    expect(card).toHaveTextContent("Yerba Mate 1kg");
    expect(card).toHaveTextContent("Stock actual: 6");
    expect(card).toHaveTextContent("Código de barras: 7791234567890");
    expect((screen.getByTestId("receipt-name-0") as HTMLInputElement).value).toBe("Yerba Mate 1kg");
    expect(screen.queryByTestId("receipt-options-0")).not.toBeInTheDocument();
    expect(within(card).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("receipt-line-0")).getByRole("checkbox")).toBeEnabled();

    await user.click(screen.getByTestId("receipt-change-0"));
    expect(screen.queryByTestId("receipt-selected-0")).not.toBeInTheDocument();
    expect(screen.getByTestId("receipt-name-0")).toBeInTheDocument();
  });

  it("al cambiar el nombre se pierde el producto elegido y se buscan los parecidos al nuevo nombre", async () => {
    const user = userEvent.setup();
    serveSearch([suggestion({ id: 7 })], [suggestion({ id: 7 }), suggestion({ id: 8, nombre: "Leche descremada" })]);
    renderReview("entrada", [draft()]);
    await user.click(screen.getByTestId("receipt-option-0-1"));

    await user.clear(screen.getByTestId("receipt-name-0"));
    await user.type(screen.getByTestId("receipt-name-0"), "Leche");

    expect(screen.queryByTestId("receipt-selected-0")).not.toBeInTheDocument();
    expect(await screen.findByTestId("receipt-option-0-8", {}, { timeout: 2000 })).toHaveTextContent("Leche descremada");
    expect(screen.getAllByTestId(/^receipt-option-0-/)).toHaveLength(2);
    expect(api.get).toHaveBeenCalledWith("/me/products/match", { params: { q: "Leche" } });
    expect(api.get).toHaveBeenCalledWith("/me/products/suggest", { params: { q: "Leche" } });
  });

  it("sin productos parecidos lo dice y se puede crear un producto nuevo, con su formulario", async () => {
    const user = userEvent.setup();
    renderReview("entrada", [draft({ coincidencias: [], coincidencia_id: null })]);

    expect(screen.getByTestId("receipt-no-match-0")).toHaveTextContent("No hay productos en tu inventario que coincidan con este nombre");
    await user.click(screen.getByTestId("receipt-create-0"));

    const form = screen.getByTestId("receipt-new-0");
    expect(within(form).getByText("Categoría *")).toBeInTheDocument();
    expect(within(form).getByText("Marca")).toBeInTheDocument();
    expect(within(form).getByLabelText("Código de barras")).toBeInTheDocument();
    expect(within(form).getByText("Ubicación de guardado")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre del producto nuevo")).toBeInTheDocument();
    await user.click(screen.getByTestId("receipt-back-0"));
    expect(screen.queryByTestId("receipt-new-0")).not.toBeInTheDocument();
    expect(screen.getByTestId("receipt-create-0")).toBeInTheDocument();
  });

  it("confirma la carga de un producto nuevo con sus datos y uno existente al que se le suma stock", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { created: 1, merged: 1, failed: 0, errors: [] } });
    const { onDone } = renderReview("entrada", [draft(), draft({ texto_leido: "SAL FINA", nombre: "SAL", coincidencias: [], coincidencia_id: null, stock: 3 })]);
    await user.click(screen.getByTestId("receipt-option-0-1"));
    await user.click(screen.getByTestId("receipt-line-1"));
    await user.click(screen.getByTestId("receipt-create-1"));
    await user.clear(screen.getByTestId("receipt-name-1"));
    await user.type(screen.getByTestId("receipt-name-1"), "Sal fina");
    await user.selectOptions(within(screen.getByTestId("receipt-new-1")).getByText("Categoría *").nextElementSibling as HTMLSelectElement, "Almacén");

    expect(screen.getByText("2 de 2 productos incluidos")).toBeInTheDocument();
    await user.click(screen.getByTestId("receipt-confirm"));

    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ created: 1, merged: 1, failed: 0, errors: [] }));
    const [url, body] = vi.mocked(api.post).mock.calls[0] as [string, any];
    expect(url).toBe("/me/products/bulk/commit");
    expect(body.mode).toBe("entrada");
    expect(body.origen).toBe("Documento Comercial");
    expect(body.rows[0]).toMatchObject({ nombre: "Yerba Mate 1kg", marca: "La Merced", categoria: "Almacén", stock: 2, vencimiento: "2027-03-05" });
    expect(body.rows[1]).toMatchObject({ nombre: "Sal fina", categoria: "Almacén", stock: 3, marca: null });
  });

  it("los errores se ven enseguida debajo de su campo y, con productos incompletos, no se confirma: hay que corregirlos o quitarlos", async () => {
    const user = userEvent.setup();
    renderReview("entrada", [draft(), draft({ texto_leido: "SAL", nombre: "SAL", coincidencias: [], coincidencia_id: null })]);
    await user.click(screen.getByTestId("receipt-option-0-1"));
    // El segundo no tiene producto elegido: el error aparece solo, sin intentar confirmar
    await user.click(screen.getByTestId("receipt-line-1"));
    expect(screen.getByTestId("receipt-name-error-1")).toHaveTextContent("Elegí un producto de tu inventario o creá uno nuevo");
    expect(screen.queryByTestId("receipt-invalid")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("receipt-line-0"));
    await user.clear(screen.getByTestId("receipt-quantity-0"));
    expect(screen.getByTestId("receipt-quantity-error-0")).toHaveTextContent("El stock debe ser mayor a 0");
    await user.type(screen.getByTestId("receipt-quantity-0"), "4");
    expect(screen.queryByTestId("receipt-quantity-error-0")).not.toBeInTheDocument();

    // Con uno listo el botón se puede tocar, pero el incompleto lo frena
    expect(screen.getByTestId("receipt-confirm")).toHaveTextContent("Confirmar carga (1 producto)");
    await user.click(screen.getByTestId("receipt-confirm"));
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByTestId("receipt-invalid")).toHaveTextContent("Corregí o eliminá el producto con datos incompletos o inválidos antes de confirmar: «SAL».");
    expect(screen.getByTestId("receipt-dot-1").className).toContain("bg-danger");

    // Quitar el que no sirve destraba la confirmación
    await user.click(screen.getByTestId("receipt-remove-1"));
    expect(screen.queryByTestId("receipt-invalid")).not.toBeInTheDocument();
  });

  it("con 0 productos para cargar el botón no se puede tocar", async () => {
    const user = userEvent.setup();
    renderReview("entrada", [draft()]);

    const confirmar = screen.getByTestId("receipt-confirm");
    expect(confirmar).toHaveTextContent("Confirmar carga (0 productos)");
    expect(confirmar).toBeDisabled();
    await user.click(confirmar);
    expect(api.post).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("receipt-option-0-1"));
    expect(screen.getByTestId("receipt-confirm")).toBeEnabled();
    await user.click(within(screen.getByTestId("receipt-line-0")).getByRole("checkbox"));
    expect(screen.getByTestId("receipt-confirm")).toHaveTextContent("Confirmar carga (0 productos)");
    expect(screen.getByTestId("receipt-confirm")).toBeDisabled();
  });

  it("un producto nuevo sin categoría o con el nombre muy largo no se puede cargar", async () => {
    const user = userEvent.setup();
    renderReview("entrada", [draft({ coincidencias: [], coincidencia_id: null, texto_leido: "x".repeat(25) })]);
    await user.click(screen.getByTestId("receipt-create-0"));

    await user.click(screen.getByTestId("receipt-confirm"));

    expect(screen.getByTestId("receipt-name-error-0")).toHaveTextContent("El nombre no puede superar los 20 caracteres");
    expect(screen.getByText("La categoría es requerida")).toBeInTheDocument();
    await user.type(within(screen.getByTestId("receipt-new-0")).getByLabelText("Código de barras"), "12345");
    expect(screen.getByText("El código de barras es inválido")).toBeInTheDocument();
  });

  it("se pueden quitar productos y agregar uno a mano, que queda arriba y se busca por su nombre", async () => {
    const user = userEvent.setup();
    serveSearch([suggestion({ id: 7 })], []);
    renderReview("entrada", [draft(), draft({ texto_leido: "SAL", coincidencias: [], coincidencia_id: null })]);

    await user.click(screen.getByTestId("receipt-add"));

    expect(screen.getByTestId("receipt-manual-2")).toHaveTextContent("Entrada manual");
    expect((screen.getByTestId("receipt-name-2") as HTMLInputElement).value).toBe("");
    expect(screen.getByTestId("receipt-line-2")).toHaveTextContent("Producto nuevo");
    expect(screen.getAllByTestId(/^receipt-line-/)[0]).toBe(screen.getByTestId("receipt-line-2"));
    await user.type(screen.getByTestId("receipt-name-2"), "Leche");
    await user.click(await screen.findByTestId("receipt-option-2-7", {}, { timeout: 2000 }));
    expect(screen.getByTestId("receipt-selected-2")).toHaveTextContent("Leche entera");

    await user.click(screen.getByTestId("receipt-remove-2"));
    expect(screen.queryByTestId("receipt-line-2")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("receipt-remove-0"));
    await user.click(screen.getByTestId("receipt-remove-1"));
    expect(screen.getByTestId("receipt-empty")).toHaveTextContent("No se reconoció ningún producto en esta foto");
    expect(screen.getByTestId("receipt-confirm")).toBeDisabled();
    await user.click(screen.getByTestId("receipt-add"));
    expect(screen.getByTestId("receipt-manual-3")).toBeInTheDocument();
  });

  it("un producto se puede dejar afuera de la carga con su casilla", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { created: 0, merged: 1, failed: 0, errors: [] } });
    renderReview("entrada", [draft(), draft({ texto_leido: "OTRA", coincidencias: [match({ id: 3, nombre: "Otra cosa" })], coincidencia_id: null })]);
    await user.click(screen.getByTestId("receipt-option-0-1"));
    await user.click(screen.getByTestId("receipt-line-1"));
    await user.click(screen.getByTestId("receipt-option-1-3"));
    await user.click(within(screen.getByTestId("receipt-line-1")).getByRole("checkbox"));

    expect(screen.getByText("1 de 2 productos incluidos")).toBeInTheDocument();
    await user.click(screen.getByTestId("receipt-confirm"));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(((vi.mocked(api.post).mock.calls[0][1]) as any).rows).toHaveLength(1);
  });

  it("si el servidor falla, lo avisa; y con «Descartar» se vuelve a escanear", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async () => {
      const err: any = new Error("fallo");
      err.response = { data: { detail: "No se pudo cargar el comprobante." } };
      throw err;
    });
    const { onScanAnother } = renderReview("entrada", [draft()]);
    await user.click(screen.getByTestId("receipt-option-0-1"));

    await user.click(screen.getByTestId("receipt-confirm"));
    expect(await screen.findByText("No se pudo cargar el comprobante.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Descartar y escanear otro" }));
    expect(onScanAnother).toHaveBeenCalled();
  });

  it("si fallan las dos búsquedas por nombre no cambia nada, y un nombre de menos de 2 letras no busca", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockRejectedValue(new Error("caído"));
    renderReview("entrada", [draft({ coincidencias: [], coincidencia_id: null })]);

    await user.clear(screen.getByTestId("receipt-name-0"));
    await user.type(screen.getByTestId("receipt-name-0"), "A");
    await user.type(screen.getByTestId("receipt-name-0"), "bc");

    await waitFor(() => expect(api.get).toHaveBeenCalled(), { timeout: 2000 });
    expect(screen.queryByTestId("receipt-no-match-0")).not.toBeInTheDocument();
    expect(vi.mocked(api.get).mock.calls.every(([, config]) => (config as any).params.q === "Abc")).toBe(true);
  });
});

describe("ReceiptReview · salida", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serveSearch();
  });

  it("recomienda productos, no ofrece crear uno nuevo y dice con qué motivo queda la salida", () => {
    renderReview("salida", [draft({ coincidencias: [], coincidencia_id: null })]);

    expect(screen.getByTestId("receipt-items-title")).toHaveTextContent("Productos a salir");
    expect(screen.getByText("Documento Comercial")).toBeInTheDocument();
    expect(screen.getByTestId("receipt-no-match-0")).toBeInTheDocument();
    expect(screen.queryByTestId("receipt-create-0")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Stock a sacar")).toBeInTheDocument();
    expect(screen.queryByTestId("receipt-options-0")).not.toBeInTheDocument();
  });

  it("al elegir un producto muestra su información y el stock a sacar no puede superar el disponible, enseguida", async () => {
    const user = userEvent.setup();
    renderReview("salida", [draft({ stock: 2 })]);
    expect(screen.getByTestId("receipt-options-0")).toHaveTextContent("¿De cuál se descarga?");

    await user.click(screen.getByTestId("receipt-option-0-1"));
    expect(screen.getByTestId("receipt-selected-0")).toHaveTextContent("Stock actual: 6");
    await user.clear(screen.getByTestId("receipt-quantity-0"));
    await user.type(screen.getByTestId("receipt-quantity-0"), "9");

    expect(screen.getByTestId("receipt-quantity-error-0")).toHaveTextContent("El stock no puede superar el disponible (6)");
    expect(screen.getByTestId("receipt-confirm")).toHaveTextContent("Confirmar salida (0 productos)");
    expect(screen.getByTestId("receipt-confirm")).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("la información del producto elegido tiene la imagen alineada verticalmente con sus datos", async () => {
    const user = userEvent.setup();
    renderReview("entrada", [draft()]);

    await user.click(screen.getByTestId("receipt-option-0-1"));

    expect(screen.getByTestId("receipt-selected-0").className).toContain("items-center");
  });

  it("registra la salida de los productos elegidos con su comercio", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { procesados: 1, errores: [] } });
    const { onDone } = renderReview("salida", [draft({ stock: 2 })], { comercio: "Súper Don Pepe", fecha_compra: null, total: null });
    await user.click(screen.getByTestId("receipt-option-0-1"));

    await user.click(screen.getByTestId("receipt-confirm"));

    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ procesados: 1, errores: [] }));
    expect(api.post).toHaveBeenCalledWith("/me/products/ocr/salida", { items: [{ product_id: 1, quantity: 2 }], comercio: "Súper Don Pepe" });
  });

  it("un renglón sin comercio manda null, y se puede agregar una salida a mano", async () => {
    const user = userEvent.setup();
    serveSearch([suggestion({ id: 7, stock: 4 })], []);
    vi.mocked(api.post).mockResolvedValue({ data: { procesados: 1, errores: [] } });
    renderReview("salida", []);

    await user.click(screen.getByTestId("receipt-add"));
    expect(screen.getByTestId("receipt-manual-0")).toHaveTextContent("Salida manual");
    await user.type(screen.getByTestId("receipt-name-0"), "Leche");
    await user.click(await screen.findByTestId("receipt-option-0-7", {}, { timeout: 2000 }));
    await user.type(screen.getByTestId("receipt-quantity-0"), "1");
    await user.click(screen.getByTestId("receipt-confirm"));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/me/products/ocr/salida", { items: [{ product_id: 7, quantity: 1 }], comercio: null }));
  });

  it("dos renglones del mismo producto suman contra el stock disponible", async () => {
    const user = userEvent.setup();
    renderReview("salida", [draft({ stock: 4 }), draft({ texto_leido: "OTRA VEZ", stock: 4 })]);
    await user.click(screen.getByTestId("receipt-option-0-1"));
    await user.click(screen.getByTestId("receipt-line-1"));
    await user.click(screen.getByTestId("receipt-option-1-1"));

    expect(screen.getByTestId("receipt-quantity-error-1")).toHaveTextContent("El stock no puede superar el disponible (6)");
  });

  it("si falla el servidor lo avisa con el mensaje de las salidas", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("caído"));
    renderReview("salida", [draft({ stock: 1 })]);
    await user.click(screen.getByTestId("receipt-option-0-1"));

    await user.click(screen.getByTestId("receipt-confirm"));

    expect(await screen.findByText(/No se pudieron registrar las salidas|caído/)).toBeInTheDocument();
  });
});
