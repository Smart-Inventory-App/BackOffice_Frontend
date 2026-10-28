import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import ProductoExistente from "./ExistingProduct";
import type { ProductDraft, ProductSuggestion, ScanState } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { api } from "@/lib/api";

function producto(overrides: Partial<ProductSuggestion> = {}): ProductSuggestion {
  return {
    id: 1,
    nombre: "Yerba Mate",
    marca: "La Merced",
    categoria: "Almacén",
    ubicacion: "Alacena",
    vencimiento: "2027-03-05",
    stock: 3,
    stock_minimo: null,
    dias_alerta_vencimiento: null,
    codigo_barras: "7791234567890",
    imagen_url: null,
    ...overrides,
  };
}

function draft(overrides: Partial<ProductDraft> = {}): ProductDraft {
  return {
    nombre: "Yerba Mate",
    marca: "La Merced",
    descripcion: null,
    vencimiento: null,
    codigo_barras: null,
    pais_registro: null,
    stock: null,
    confianzas: {},
    texto_leido: "Yerba Mate La Merced",
    coincidencias: [],
    coincidencia_id: null,
    ...overrides,
  };
}

function scan(docType: string, d: ProductDraft): { data: ScanState } {
  return {
    data: {
      job_id: null,
      status: "done",
      doc_type: docType,
      error: null,
      queue_position: null,
      estimated_wait_seconds: null,
      result: { doc_type: docType, draft: d, items: [], comprobante: null, needs_review: false, confianza: 0.9, texto_legible: "", advertencias: [], sin_coincidencia: 0 },
    } as unknown as ScanState,
  };
}

const foto = () => new File(["x"], "foto.png", { type: "image/png" });

function serve(routes: Record<string, unknown>) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    for (const [prefix, value] of Object.entries(routes)) {
      if (url === prefix || url.startsWith(prefix)) {
        if (value instanceof Error) throw value;
        return { data: value };
      }
    }
    throw new Error(`GET no mockeado: ${url}`);
  });
}

describe("Producto existente · por nombre", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sugiere productos al escribir, muestra la información del elegido e ingresa el stock", async () => {
    const user = userEvent.setup();
    serve({ "/me/products/suggest": [producto()] });
    vi.mocked(api.post).mockResolvedValue({ data: { stock: 8 } });
    renderWithProviders(<ProductoExistente method="nombre" />);

    expect(screen.getByLabelText("Nombre del producto")).toHaveAttribute("placeholder", "Escribí el nombre del producto");
    await user.type(screen.getByLabelText("Nombre del producto"), "Yerba");
    expect(await screen.findByTestId("existing-options-title", {}, { timeout: 2000 })).toHaveTextContent("Elegí el producto");
    await user.click(screen.getByTestId("existing-option-1"));

    // Se ve la información del producto y desaparecen las demás opciones
    expect(screen.getByTestId("existing-selected-name")).toHaveTextContent("Yerba Mate");
    expect(screen.getByTestId("existing-selected")).toHaveTextContent("Stock actual: 3");
    expect(screen.getByTestId("existing-selected")).toHaveTextContent("Vence 05/03/2027");
    expect(screen.getByTestId("existing-selected")).toHaveTextContent("Código de barras: 7791234567890");
    expect(screen.queryByTestId("existing-options-title")).not.toBeInTheDocument();
    expect((screen.getByLabelText("Nombre del producto") as HTMLInputElement).value).toBe("Yerba Mate");

    await user.type(screen.getByLabelText("Stock a ingresar"), "5x");
    await user.click(screen.getByTestId("existing-confirm"));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/me/products/1/restock", { quantity: 5 }));
    expect(await screen.findByTestId("flow-success")).toHaveTextContent('Se ha registrado la entrada de 5 unidades de "Yerba Mate". Stock actual 8.');
    expect((screen.getByLabelText("Nombre del producto") as HTMLInputElement).value).toBe("");
    expect(screen.queryByTestId("existing-selected")).not.toBeInTheDocument();
  });

  it("pide un stock mayor a 0 y muestra el error del servidor si no se pudo guardar", async () => {
    const user = userEvent.setup();
    serve({ "/me/products/suggest": [producto()] });
    vi.mocked(api.post).mockImplementation(async () => {
      const err: any = new Error("fallo");
      err.response = { data: { detail: "No se pudo guardar el producto" } };
      throw err;
    });
    renderWithProviders(<ProductoExistente method="nombre" />);

    await user.type(screen.getByLabelText("Nombre del producto"), "Yerba");
    await user.click(await screen.findByTestId("existing-option-1", {}, { timeout: 2000 }));
    await user.click(screen.getByTestId("existing-confirm"));
    expect(screen.getByTestId("existing-error")).toHaveTextContent("El stock debe ser mayor a 0");
    expect(api.post).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Stock a ingresar"), "2");
    expect(screen.queryByTestId("existing-error")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("existing-confirm"));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar el producto");
  });

  it("se puede cancelar la elección y buscar otro; sin coincidencias lo dice; con menos de 2 letras no busca", async () => {
    const user = userEvent.setup();
    serve({ "/me/products/suggest": [producto()] });
    renderWithProviders(<ProductoExistente method="nombre" />);

    await user.type(screen.getByLabelText("Nombre del producto"), "Y");
    expect(api.get).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Nombre del producto"), "erba");
    await user.click(await screen.findByTestId("existing-option-1", {}, { timeout: 2000 }));
    await user.click(screen.getByTestId("existing-change"));
    expect(screen.queryByTestId("existing-selected")).not.toBeInTheDocument();

    serve({ "/me/products/suggest": [] });
    await user.clear(screen.getByLabelText("Nombre del producto"));
    await user.type(screen.getByLabelText("Nombre del producto"), "Nada");
    expect(await screen.findByText("No encontramos ningún producto tuyo con ese nombre.", {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it("si falla la búsqueda de sugerencias no muestra nada", async () => {
    const user = userEvent.setup();
    serve({ "/me/products/suggest": new Error("caído") });
    renderWithProviders(<ProductoExistente method="nombre" />);

    await user.type(screen.getByLabelText("Nombre del producto"), "Yerba");

    await waitFor(() => expect(api.get).toHaveBeenCalled(), { timeout: 2000 });
    expect(screen.queryByTestId("existing-options-title")).not.toBeInTheDocument();
  });

  it("en una salida el producto elegido vuelve al formulario sin pedir stock", async () => {
    const user = userEvent.setup();
    const onSelectProduct = vi.fn();
    serve({ "/me/products/suggest": [producto()] });
    renderWithProviders(<ProductoExistente mode="exit" method="nombre" onSelectProduct={onSelectProduct} />);

    await user.type(screen.getByLabelText("Nombre del producto"), "Yerba");
    await user.click(await screen.findByTestId("existing-option-1", {}, { timeout: 2000 }));
    expect(screen.queryByLabelText("Stock a ingresar")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("existing-confirm"));

    expect(onSelectProduct).toHaveBeenCalledWith(producto());
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe("Producto existente · por etiqueta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function leer(user: ReturnType<typeof userEvent.setup>) {
    await user.upload(screen.getByLabelText("Elegí una foto"), foto());
    await user.click(screen.getByRole("button", { name: "Leer etiqueta" }));
  }

  it("lee la etiqueta, deja corregir el nombre, busca productos parecidos y suma el stock al elegido", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation((async (url: string) => {
      if (url === "/me/products/ocr/scan") return scan("product_label", draft({ vencimiento: "2027-03-05" }));
      if (url === "/me/products/2/restock") return { data: { stock: 7 } };
      throw new Error(`POST no mockeado: ${url}`);
    }) as never);
    serve({
      "/me/products/match": [producto({ id: 2, nombre: "Yerba Mate 1kg" })],
      "/me/products/suggest": [producto({ id: 2, nombre: "Yerba Mate 1kg" }), producto({ id: 3, nombre: "Yerba Suave", marca: null, vencimiento: null })],
    });
    const onLoadAsNew = vi.fn();
    renderWithProviders(<ProductoExistente method="etiqueta" onLoadAsNew={onLoadAsNew} />);

    await leer(user);

    expect(await screen.findByText("Información leída de la etiqueta")).toBeInTheDocument();
    expect(screen.getByText("Texto leído: Yerba Mate La Merced")).toBeInTheDocument();
    expect(screen.getByText("Marca: La Merced")).toBeInTheDocument();
    expect(screen.getByText("Vencimiento: 05/03/2027")).toBeInTheDocument();
    await user.click(screen.getByTestId("existing-edit-confirm"));

    expect(await screen.findByTestId("existing-options-title")).toHaveTextContent("Productos reconocidos");
    // Los productos que dan las dos búsquedas aparecen una sola vez
    expect(screen.getAllByTestId(/^existing-option-/)).toHaveLength(2);
    await user.click(screen.getByTestId("existing-option-2"));
    await user.type(screen.getByLabelText("Stock a ingresar"), "4");
    await user.click(screen.getByTestId("existing-confirm"));

    expect(await screen.findByTestId("flow-success")).toHaveTextContent('Se ha registrado la entrada de 4 unidades de "Yerba Mate 1kg". Stock actual 7.');
  });

  it("sin nombre leído lo pide, y con el nombre vacío no busca", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue(scan("product_label", draft({ nombre: null, marca: null, texto_leido: null })));
    renderWithProviders(<ProductoExistente method="etiqueta" />);

    await leer(user);

    expect(await screen.findByTestId("existing-name-not-read")).toBeInTheDocument();
    await user.click(screen.getByTestId("existing-edit-confirm"));
    expect(screen.getByTestId("existing-error")).toHaveTextContent("Escribí el nombre del producto");
    expect(api.get).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Nombre del producto"), "Yerba");
    expect(screen.queryByTestId("existing-error")).not.toBeInTheDocument();
  });

  it("si ningún producto se parece, ofrece editar de nuevo o cargarlo como nuevo con lo leído", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue(scan("product_label", draft({ vencimiento: "2027-03-05", codigo_barras: "7791234567890", descripcion: "Suave" })));
    serve({ "/me/products/match": [], "/me/products/suggest": [] });
    const onLoadAsNew = vi.fn();
    renderWithProviders(<ProductoExistente method="etiqueta" onLoadAsNew={onLoadAsNew} />);

    await leer(user);
    await user.clear(await screen.findByLabelText("Nombre del producto"));
    await user.type(screen.getByLabelText("Nombre del producto"), "Yerba Nueva");
    await user.click(screen.getByTestId("existing-edit-confirm"));

    expect(await screen.findByTestId("existing-not-found")).toHaveTextContent("No existe un producto con la información escaneada");
    await user.click(screen.getByTestId("existing-load-new"));
    expect(onLoadAsNew).toHaveBeenCalledWith({
      nombre: "Yerba Nueva",
      marca: "La Merced",
      descripcion: "Suave",
      vencimiento: "2027-03-05",
      codigo_barras: "7791234567890",
    });

    await user.click(screen.getByTestId("existing-edit-again"));
    expect(screen.getByLabelText("Nombre del producto")).toBeInTheDocument();
  });

  it("si la búsqueda no da nada pero el escaneo ya traía coincidencias, usa esas", async () => {
    const user = userEvent.setup();
    const coincidencia = { id: 7, nombre: "Yerba Mate", marca: "La Merced", categoria: "Almacén", ubicacion: null, vencimiento: null, stock: 2, codigo_barras: null, score: 0.9, por_codigo: false };
    vi.mocked(api.post).mockResolvedValue(scan("product_label", draft({ coincidencias: [coincidencia] })));
    serve({ "/me/products/match": [], "/me/products/suggest": [] });
    renderWithProviders(<ProductoExistente method="etiqueta" />);

    await leer(user);
    await user.click(await screen.findByTestId("existing-edit-confirm"));

    expect(await screen.findByTestId("existing-option-7")).toHaveTextContent("Yerba Mate · La Merced");
    expect(screen.getByTestId("existing-option-7")).toHaveTextContent("Sin vencimiento · Stock: 2");
  });

  it("si todas las búsquedas fallan, avisa; y se puede volver a buscar con otro nombre", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue(scan("product_label", draft()));
    serve({ "/me/products/match": new Error("caído"), "/me/products/suggest": new Error("caído") });
    renderWithProviders(<ProductoExistente method="etiqueta" />);

    await leer(user);
    await user.click(await screen.findByTestId("existing-edit-confirm"));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron buscar los productos. Intentá de nuevo.");
    await user.click(screen.getByTestId("existing-edit-cancel"));
    expect(screen.getByLabelText("Elegí una foto")).toBeInTheDocument();
  });

  it("si solo falla una de las búsquedas, sigue con lo que encontró; «Editar de nuevo» vuelve a la etiqueta leída", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue(scan("product_label", draft({ marca: "Otra" })));
    serve({ "/me/products/match": new Error("caído"), "/me/products/suggest": [producto()] });
    renderWithProviders(<ProductoExistente method="etiqueta" />);

    await leer(user);
    await user.click(await screen.findByTestId("existing-edit-confirm"));
    expect(await screen.findByTestId("existing-option-1")).toBeInTheDocument();
    await user.click(screen.getByTestId("existing-edit-again"));
    expect(screen.getByText("Información leída de la etiqueta")).toBeInTheDocument();
  });

  it("en una salida, sin coincidencias solo se puede volver atrás", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue(scan("product_label", draft()));
    serve({ "/me/products/match": [], "/me/products/suggest": [] });
    renderWithProviders(<ProductoExistente mode="exit" method="etiqueta" />);

    await leer(user);
    await user.click(await screen.findByTestId("existing-edit-confirm"));

    expect(await screen.findByTestId("existing-not-found")).toBeInTheDocument();
    expect(screen.queryByTestId("existing-load-new")).not.toBeInTheDocument();
    expect(screen.getByTestId("existing-edit-again")).toHaveTextContent("Volver atrás");
  });
});

describe("Producto existente · por código de barras", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("busca con el código escrito a mano y muestra los lotes de ese código", async () => {
    const user = userEvent.setup();
    serve({ "/me/products/by-barcode/7791234567890/all": [producto({ id: 1 }), producto({ id: 2, vencimiento: null })] });
    renderWithProviders(<ProductoExistente method="codigo" />);

    expect(screen.getByLabelText("Código de barras")).toHaveAttribute("placeholder", "Código de barras");
    await user.type(screen.getByLabelText("Código de barras"), "7791 234-567890abc");
    expect((screen.getByLabelText("Código de barras") as HTMLInputElement).value).toBe("7791 234-567890");
    await user.click(screen.getByTestId("existing-search-barcode"));

    expect(await screen.findByTestId("existing-options-title")).toHaveTextContent("Productos reconocidos");
    expect(screen.getByTestId("existing-option-2")).toHaveTextContent("Sin vencimiento");
    await user.click(screen.getByTestId("existing-option-1"));
    expect(screen.getByTestId("existing-selected-name")).toHaveTextContent("Yerba Mate");
    await user.click(screen.getByTestId("existing-change"));
    expect(screen.getByTestId("existing-option-2")).toBeInTheDocument();
  });

  it("un código con un largo imposible se rechaza antes de buscar", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProductoExistente method="codigo" />);

    await user.type(screen.getByLabelText("Código de barras"), "12345");
    await user.click(screen.getByTestId("existing-search-barcode"));

    expect(screen.getByTestId("existing-error")).toHaveTextContent("El código de barras es inválido");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("lee el código de una foto, lo deja corregir y busca", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue(scan("barcode", draft({ codigo_barras: "7791234567890" })));
    serve({ "/me/products/by-barcode/7791234567890/all": [producto()] });
    renderWithProviders(<ProductoExistente method="codigo" />);

    await user.upload(screen.getByLabelText("Elegí una foto"), foto());
    await user.click(screen.getByRole("button", { name: "Leer código" }));

    await waitFor(() => expect((screen.getByLabelText("Código de barras") as HTMLInputElement).value).toBe("7791234567890"));
    await user.click(screen.getByTestId("existing-search-barcode"));
    expect(await screen.findByTestId("existing-option-1")).toBeInTheDocument();
  });

  it("si la foto no trae un código, lo avisa para escribirlo a mano", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue(scan("barcode", draft({ codigo_barras: null })));
    renderWithProviders(<ProductoExistente method="codigo" />);

    await user.upload(screen.getByLabelText("Elegí una foto"), foto());
    await user.click(screen.getByRole("button", { name: "Leer código" }));

    expect(await screen.findByTestId("existing-error")).toHaveTextContent("No se pudo leer un código de barras en la foto");
  });

  it("sin productos con ese código ofrece cargarlo como nuevo con el código; si falla la búsqueda, avisa", async () => {
    const user = userEvent.setup();
    const onLoadAsNew = vi.fn();
    serve({ "/me/products/by-barcode/": [] });
    renderWithProviders(<ProductoExistente method="codigo" onLoadAsNew={onLoadAsNew} />);

    await user.type(screen.getByLabelText("Código de barras"), "7791234567890");
    await user.click(screen.getByTestId("existing-search-barcode"));
    await user.click(await screen.findByTestId("existing-load-new"));
    expect(onLoadAsNew).toHaveBeenCalledWith({ codigo_barras: "7791234567890" });

    await user.click(screen.getByTestId("existing-edit-again"));
    serve({ "/me/products/by-barcode/": new Error("caído") });
    await user.click(screen.getByTestId("existing-search-barcode"));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron buscar los productos");
  });
});
