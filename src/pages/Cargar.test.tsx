import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import Cargar from "./Cargar";
import type { ProductSuggestion } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { api } from "@/lib/api";

const OPCIONES = { categorias: ["Almacén"], ubicaciones: ["Alacena"], marcas: ["Marca Test"] };

function label(text: string): HTMLElement {
  return screen.getByText(text).nextElementSibling as HTMLElement;
}

function suggestion(overrides: Partial<ProductSuggestion> = {}): ProductSuggestion {
  return {
    id: 1,
    nombre: "Yerba Mate",
    marca: "La Merced",
    categoria: "Almacén",
    ubicacion: "Alacena",
    vencimiento: "2026-01-01",
    stock: 3,
    stock_minimo: null,
    dias_alerta_vencimiento: null,
    ...overrides,
  };
}

function defaultGet() {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === "/me/products/filters/options") return { data: OPCIONES };
    if (url === "/me/products/suggest") return { data: [] };
    if (url.startsWith("/me/products/by-barcode/")) {
      const err: any = new Error("no encontrado");
      err.response = { status: 404 };
      throw err;
    }
    throw new Error(`GET no mockeado: ${url}`);
  });
}

describe("Cargar · manual (entrada)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sugiere productos al escribir el nombre y autocompleta al elegir uno", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/products/filters/options") return { data: OPCIONES };
      if (url === "/me/products/suggest") return { data: [suggestion()] };
      if (url.startsWith("/me/products/by-barcode/")) {
        const err: any = new Error("404");
        err.response = { status: 404 };
        throw err;
      }
      throw new Error(`GET no mockeado: ${url}`);
    });

    renderWithProviders(<Cargar />);
    const nombreInput = label("Nombre");
    await user.click(nombreInput);
    await user.type(nombreInput, "Yerba");

    const opcion = await screen.findByRole("button", { name: /Yerba Mate/ }, { timeout: 2000 });
    await user.click(opcion);

    expect((nombreInput as HTMLInputElement).value).toBe("Yerba Mate");
  });

  it("al escribir un código de barras ya usado, avisa del duplicado y permite sumarle stock", async () => {
    const user = userEvent.setup();
    const dup = suggestion({ id: 5, nombre: "Fideos", codigo_barras: "7791234567890" } as any);
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/products/filters/options") return { data: OPCIONES };
      if (url === "/me/products/suggest") return { data: [] };
      if (url.startsWith("/me/products/by-barcode/")) return { data: dup };
      throw new Error(`GET no mockeado: ${url}`);
    });

    renderWithProviders(<Cargar />);
    const codigoInput = screen.getByPlaceholderText("Sin código");
    await user.type(codigoInput, "7791234567890");

    expect(await screen.findByText(/Ya tenés/, {}, { timeout: 2000 })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sumar stock a ese producto" }));

    const nombreInput = label("Nombre");
    expect((nombreInput as HTMLInputElement).value).toBe("Fideos");
  });

  it("si el código no cierra el dígito verificador, muestra el error tal como lo daría el alta", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/products/filters/options") return { data: OPCIONES };
      if (url === "/me/products/suggest") return { data: [] };
      if (url.startsWith("/me/products/by-barcode/")) {
        const err: any = new Error("400");
        err.response = { status: 400, data: { detail: "Dígito verificador inválido." } };
        throw err;
      }
      throw new Error(`GET no mockeado: ${url}`);
    });

    renderWithProviders(<Cargar />);
    const codigoInput = screen.getByPlaceholderText("Sin código");
    await user.type(codigoInput, "7791234567890");

    expect(
      await screen.findByText("Dígito verificador inválido.", {}, { timeout: 2000 }),
    ).toBeInTheDocument();
  });

  it("carga un producto y, si falla, muestra el error del backend", async () => {
    const user = userEvent.setup();
    defaultGet();
    vi.mocked(api.post).mockImplementationOnce(async () => {
      const err: any = new Error("fallo");
      err.response = { data: { detail: "El nombre ya existe con otra categoría." } };
      throw err;
    });

    renderWithProviders(<Cargar />);
    await user.type(label("Nombre"), "Fideos");
    const categoriaSelect = screen.getByText("Categoría").nextElementSibling as HTMLSelectElement;
    await user.selectOptions(categoriaSelect, "Almacén");
    const marcaSelect = screen.getByText("Marca").nextElementSibling as HTMLSelectElement;
    await user.selectOptions(marcaSelect, "Marca Test");
    const ubicacionSelect = screen.getByText("Ubicación").nextElementSibling as HTMLSelectElement;
    await user.selectOptions(ubicacionSelect, "Alacena");
    await user.type(label("Stock"), "2");

    await user.click(screen.getByRole("button", { name: "Cargar producto" }));
    expect(await screen.findByText("El nombre ya existe con otra categoría.")).toBeInTheDocument();

    vi.mocked(api.post).mockResolvedValueOnce({ data: { merged: false } });
    await user.click(screen.getByRole("button", { name: "Cargar producto" }));
    expect(await screen.findByText("Producto cargado correctamente.")).toBeInTheDocument();
  });

  it("al sumar stock a un producto existente, muestra el mensaje correspondiente", async () => {
    const user = userEvent.setup();
    defaultGet();
    vi.mocked(api.post).mockResolvedValueOnce({ data: { merged: true } });

    renderWithProviders(<Cargar />);
    await user.type(label("Nombre"), "Fideos");
    const categoriaSelect = screen.getByText("Categoría").nextElementSibling as HTMLSelectElement;
    await user.selectOptions(categoriaSelect, "Almacén");
    await user.type(label("Stock"), "2");
    await user.click(screen.getByRole("button", { name: "Cargar producto" }));

    expect(
      await screen.findByText("Se sumó el stock a un producto que ya tenías cargado."),
    ).toBeInTheDocument();
  });
});

describe("Cargar · manual (salida)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultGet();
  });

  async function irASalida(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Salida" }));
  }

  it("exige elegir un producto de las sugerencias antes de registrar la salida", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Cargar />);
    await irASalida(user);

    await user.type(screen.getByPlaceholderText(/Escribí para buscar/), "Algo");
    await user.type(label("Cantidad a sacar"), "1");

    // El botón queda deshabilitado sin selección; el submit del form (p.ej. Enter)
    // sigue ejecutando la validación interna, que es lo que se prueba acá.
    const boton = screen.getByRole("button", { name: "Registrar salida" });
    expect(boton).toBeDisabled();
    fireEvent.submit(boton.closest("form")!);

    expect(
      await screen.findByText(/Elegí un producto de la lista de sugerencias/),
    ).toBeInTheDocument();
  });

  it("busca, elige un producto y registra la salida", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/products/filters/options") return { data: OPCIONES };
      if (url === "/me/products/suggest") return { data: [suggestion()] };
      throw new Error(`GET no mockeado: ${url}`);
    });
    vi.mocked(api.post).mockResolvedValueOnce({ data: { stock: 2 } });

    renderWithProviders(<Cargar />);
    await irASalida(user);

    await user.type(screen.getByPlaceholderText(/Escribí para buscar/), "Yerba");
    await user.click(await screen.findByRole("button", { name: /Yerba Mate/ }, { timeout: 2000 }));

    await user.type(label("Cantidad a sacar"), "1");
    const motivoSelect = screen.getByText("Motivo").nextElementSibling as HTMLSelectElement;
    await user.selectOptions(motivoSelect, "expired");
    await user.type(screen.getByPlaceholderText(/vencido en heladera/), "se pasó de fecha");
    await user.click(screen.getByRole("button", { name: "Registrar salida" }));

    expect(await screen.findByText(/Stock actual: 2/)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith(
      "/me/products/salida",
      expect.objectContaining({ event_type: "expired", note: "se pasó de fecha" }),
    );
  });

  it("si falla la salida, muestra el error del backend", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/products/filters/options") return { data: OPCIONES };
      if (url === "/me/products/suggest") return { data: [suggestion()] };
      throw new Error(`GET no mockeado: ${url}`);
    });
    vi.mocked(api.post).mockImplementationOnce(async () => {
      const err: any = new Error("fallo");
      err.response = { data: { detail: "Stock insuficiente." } };
      throw err;
    });

    renderWithProviders(<Cargar />);
    await irASalida(user);
    await user.type(screen.getByPlaceholderText(/Escribí para buscar/), "Yerba");
    await user.click(await screen.findByRole("button", { name: /Yerba Mate/ }, { timeout: 2000 }));
    await user.type(label("Cantidad a sacar"), "10");
    await user.click(screen.getByRole("button", { name: "Registrar salida" }));

    expect(await screen.findByText("Stock insuficiente.")).toBeInTheDocument();
  });

  it("sin resultados de búsqueda, avisa que no hay ningún producto con ese nombre", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/products/filters/options") return { data: OPCIONES };
      if (url === "/me/products/suggest") return { data: [] };
      throw new Error(`GET no mockeado: ${url}`);
    });

    renderWithProviders(<Cargar />);
    await irASalida(user);
    await user.type(screen.getByPlaceholderText(/Escribí para buscar/), "Nada");

    expect(
      await screen.findByText("No encontramos ningún producto tuyo con ese nombre.", {}, { timeout: 2000 }),
    ).toBeInTheDocument();
  });
});

describe("Cargar · archivo (BulkUpload)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultGet();
  });

  async function irAArchivo(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Archivo" }));
  }

  it("parsea un archivo, permite editar la fila activa y confirmar la carga", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/bulk/parse") {
        return {
          data: {
            rows: [
              {
                row_number: 1,
                data: {
                  row_number: 1,
                  nombre: "Fideos",
                  marca: null,
                  categoria: "",
                  stock: 3,
                  vencimiento: null,
                  descripcion: null,
                  imagen_url: null,
                  ubicacion: null,
                  stock_minimo: null,
                  dias_alerta_vencimiento: null,
                },
                valid: true,
                errors: [],
                action: "create",
                existing_stock: null,
              },
            ],
          },
        };
      }
      if (url === "/me/products/bulk/commit") {
        return { data: { created: 1, merged: 0, failed: 0, errors: [] } };
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(<Cargar />);
    await irAArchivo(user);

    const file = new File(["nombre,stock\nFideos,3"], "productos.csv", { type: "text/csv" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(await screen.findByText(/· producto nuevo/)).toBeInTheDocument();
    // Sin categoría todavía, la fila cuenta como incluida a nivel checkbox pero
    // no pasa la validación local, así que el contador de incluidos da 0.
    expect(screen.getByText("0 de 1 productos incluidos")).toBeInTheDocument();

    const categoriaSelect = screen.getByText("Categoría").nextElementSibling as HTMLSelectElement;
    await user.selectOptions(categoriaSelect, "Almacén");
    expect(await screen.findByText("1 de 1 productos incluidos")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Confirmar carga \(1 productos\)/ }));
    expect(await screen.findByText(/Carga terminada: 1 productos nuevos/)).toBeInTheDocument();
  });

  it("si falla la lectura de un archivo, muestra el error por archivo", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/bulk/parse") {
        const err: any = new Error("fallo");
        err.response = { data: { detail: "Formato no soportado." } };
        throw err;
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(<Cargar />);
    await irAArchivo(user);
    // El input sólo acepta .csv/.xlsx: se usa una extensión válida para que
    // userEvent no descarte el archivo antes de llegar al backend mockeado.
    const file = new File(["basura"], "raro.csv", { type: "text/csv" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(await screen.findByText(/raro\.csv: Formato no soportado\./)).toBeInTheDocument();
  });

  it("permite quitar una fila y limpiar todo", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/bulk/parse") {
        return {
          data: {
            rows: [
              {
                row_number: 1,
                data: {
                  row_number: 1,
                  nombre: "Fideos",
                  marca: null,
                  categoria: "Almacén",
                  stock: 3,
                  vencimiento: null,
                  descripcion: null,
                  imagen_url: null,
                  ubicacion: null,
                  stock_minimo: null,
                  dias_alerta_vencimiento: null,
                },
                valid: true,
                errors: [],
                action: "merge",
                existing_stock: 2,
              },
            ],
          },
        };
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(<Cargar />);
    await irAArchivo(user);
    const file = new File(["contenido"], "productos.csv", { type: "text/csv" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(await screen.findByText(/va a sumar 2 \+ 3/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Quitar de la lista" }));
    expect(screen.queryByText(/va a sumar/)).not.toBeInTheDocument();
  });

  function filaBase(nombre: string, overrides: Record<string, any> = {}) {
    return {
      row_number: 1,
      data: {
        row_number: 1,
        nombre,
        marca: null,
        categoria: "Almacén",
        stock: 3,
        vencimiento: null,
        descripcion: null,
        imagen_url: null,
        ubicacion: null,
        stock_minimo: null,
        dias_alerta_vencimiento: null,
        ...overrides,
      },
      valid: true,
      errors: [],
      action: "create",
      existing_stock: null,
    };
  }

  it("con varias filas, permite navegar entre ellas, destildar una y limpiar todo", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/bulk/parse") {
        return { data: { rows: [filaBase("Fideos"), filaBase("Arroz")] } };
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(<Cargar />);
    await irAArchivo(user);
    const file = new File(["contenido"], "productos.csv", { type: "text/csv" });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);

    await screen.findByText("2 de 2 productos incluidos");
    await user.click(screen.getByText("Arroz"));
    expect(screen.getByDisplayValue("Arroz")).toBeInTheDocument();

    const sidebarCheckboxes = screen.getAllByRole("checkbox");
    await user.click(sidebarCheckboxes[0]);
    expect(await screen.findByText("1 de 2 productos incluidos")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Limpiar todo" }));
    expect(screen.queryByText(/productos incluidos/)).not.toBeInTheDocument();
  });

  it("permite editar marca, ubicación, descripción y las alertas de una fila", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/bulk/parse") {
        return { data: { rows: [filaBase("Fideos")] } };
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(<Cargar />);
    await irAArchivo(user);
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["x"], "p.csv", { type: "text/csv" }),
    );
    const nombreInput = await screen.findByDisplayValue("Fideos");
    await user.clear(nombreInput);
    await user.type(nombreInput, "Fideos Guiseros");

    await user.type(label("Marca"), "Marca Test");
    const ubicacionSelect = screen.getByText("Ubicación").nextElementSibling as HTMLSelectElement;
    await user.selectOptions(ubicacionSelect, "Alacena");
    await user.type(label("Descripción"), "Notas de la fila");
    await user.type(label("Stock mínimo (días)"), "2");
    await user.type(label("Aviso de vencimiento (días)"), "5");

    const stockInput = screen.getByDisplayValue("3");
    await user.clear(stockInput);
    await user.type(stockInput, "7");

    const vencimientoInputs = document.querySelectorAll('input[type="date"]');
    await user.type(vencimientoInputs[0] as HTMLInputElement, "2026-08-01");

    expect(screen.getByDisplayValue("Fideos Guiseros")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Marca Test")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Notas de la fila")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2")).toBeInTheDocument();
    expect(screen.getByDisplayValue("5")).toBeInTheDocument();
    expect(screen.getByDisplayValue("7")).toBeInTheDocument();
  });

  it("en modo salida, no muestra categoría/ubicación y describe la cantidad a sacar", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/bulk/parse") {
        return {
          data: {
            rows: [filaBase("Fideos", { categoria: "", stock: 2, row_number: 1 })].map((r) => ({
              ...r,
              action: "salida",
              existing_stock: 5,
            })),
          },
        };
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(<Cargar />);
    await user.click(screen.getByRole("button", { name: "Salida" }));
    await irAArchivo(user);
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["x"], "p.csv", { type: "text/csv" }),
    );

    expect(await screen.findByText(/va a sacar 2 \(quedan 3\)/)).toBeInTheDocument();
    expect(screen.queryByText("Categoría")).not.toBeInTheDocument();
  });
});

describe("Cargar · navegación de pestañas y flujo de procesamiento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultGet();
  });

  it("cambia entre pestañas manteniendo la dirección elegida", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Cargar />);

    await user.click(screen.getByRole("button", { name: "Salida" }));
    await user.click(screen.getByRole("button", { name: "Archivo" }));
    expect(screen.getByText(/Cada fila tiene que coincidir con un producto/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Manual" }));
    expect(screen.getByPlaceholderText(/Escribí para buscar/)).toBeInTheDocument();
  });

  it("desde Procesamiento, ir a carga manual precarga el código de barras leído", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return {
          data: {
            job_id: null,
            status: "done",
            doc_type: "barcode",
            error: null,
            queue_position: null,
            estimated_wait_seconds: null,
            result: {
              doc_type: "barcode",
              draft: {
                nombre: null,
                marca: null,
                descripcion: null,
                vencimiento: null,
                codigo_barras: "7790000000005",
                pais_registro: null,
                stock: null,
                confianzas: {},
                texto_leido: null,
                coincidencias: [],
                coincidencia_id: null,
              },
              items: [],
              comprobante: null,
              needs_review: false,
              confianza: 0.9,
              texto_legible: "",
              advertencias: [],
              sin_coincidencia: 0,
            },
          },
        };
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(<Cargar />);
    await user.click(screen.getByRole("button", { name: "Procesamiento" }));
    await user.click(screen.getByRole("button", { name: /Código de barras/ }));

    await user.upload(screen.getByLabelText("Elegí una foto"), new File(["x"], "c.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "Leer código" }));

    await user.click(await screen.findByRole("button", { name: "Cargar producto nuevo con este código" }));

    expect(await screen.findByText("Nombre")).toBeInTheDocument();
    expect((screen.getByPlaceholderText("Sin código") as HTMLInputElement).value).toBe(
      "7790000000005",
    );
  });

  it("permite volver de salida a entrada con el botón correspondiente", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Cargar />);

    await user.click(screen.getByRole("button", { name: "Salida" }));
    expect(screen.getByPlaceholderText(/Escribí para buscar/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Entrada" }));
    expect(screen.getByText("Nombre")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Escribí para buscar/)).not.toBeInTheDocument();
  });

  it("desde Procesamiento (salida), un renglón de comprobante sin identificar deriva a la salida manual", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return {
          data: {
            job_id: null,
            status: "done",
            doc_type: "receipt",
            error: null,
            queue_position: null,
            estimated_wait_seconds: null,
            result: {
              doc_type: "receipt",
              draft: null,
              items: [
                {
                  nombre: "Producto raro",
                  marca: null,
                  descripcion: null,
                  vencimiento: null,
                  codigo_barras: null,
                  pais_registro: null,
                  stock: 1,
                  confianzas: {},
                  texto_leido: "Producto raro",
                  coincidencias: [],
                  coincidencia_id: null,
                },
              ],
              comprobante: { comercio: "Kiosco", fecha_compra: null, total: null },
              needs_review: false,
              confianza: 0.8,
              texto_legible: "",
              advertencias: [],
              sin_coincidencia: 1,
            },
          },
        };
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(<Cargar />);
    await user.click(screen.getByRole("button", { name: "Salida" }));
    await user.click(screen.getByRole("button", { name: "Procesamiento" }));
    await user.click(screen.getByRole("button", { name: /Ticket, remito o factura/ }));

    await user.upload(screen.getByLabelText("Elegí una foto"), new File(["x"], "t.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "Leer comprobante" }));

    await user.click(await screen.findByRole("button", { name: "Cargar esta salida a mano" }));

    expect(await screen.findByDisplayValue("Producto raro")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Documento Comercial - Kiosco/)).toBeInTheDocument();
  });
});

describe("Cargar · imagen como archivo adjunto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultGet();
  });

  it("no pide la URL de la imagen: ofrece adjuntar un archivo", () => {
    renderWithProviders(<Cargar />);

    expect(screen.queryByText("URL de imagen")).not.toBeInTheDocument();
    expect(screen.getByTestId("image-upload")).toBeInTheDocument();
    expect(screen.getByTestId("image-upload-input")).toHaveAttribute("type", "file");
  });

  it("sube la foto elegida y carga el producto con la dirección que devuelve el servicio", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/image") return { data: { url: "https://img.example/yerba.png" } };
      if (url === "/me/products") return { data: { merged: false } };
      throw new Error(`POST no mockeado: ${url}`);
    });
    renderWithProviders(<Cargar />);

    await user.type(label("Nombre"), "Yerba");
    await user.selectOptions(within(screen.getByText("Categoría").parentElement as HTMLElement).getByRole("combobox"), "Almacén");
    await user.type(label("Stock"), "4");
    await user.upload(screen.getByTestId("image-upload-input"), new File(["x"], "yerba.png", { type: "image/png" }));
    await waitFor(() => expect(screen.getByText("yerba.png")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Cambiar imagen" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Cargar producto" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/me/products",
        expect.objectContaining({ nombre: "Yerba", imagen_url: "https://img.example/yerba.png" }),
      ),
    );
  });

  it("pide las reglas de alerta del producto con los textos de la app", () => {
    renderWithProviders(<Cargar />);

    expect(screen.getByText("Reglas de alerta de producto")).toBeInTheDocument();
    expect(screen.getByText("Stock mínimo (días)")).toBeInTheDocument();
    expect(screen.getByText("Aviso de vencimiento (días)")).toBeInTheDocument();
    expect(screen.getByText("Se avisa si el stock alcanza para menos días.")).toBeInTheDocument();
    expect(screen.getByText("Se avisa si faltan menos días para que venza.")).toBeInTheDocument();
  });

  it("el texto del código de barras dice que alcanzan 8, 12, 13 o 14 dígitos", () => {
    renderWithProviders(<Cargar />);

    expect(screen.getByText(/8, 12, 13 o 14 dígitos/)).toBeInTheDocument();
  });
});
