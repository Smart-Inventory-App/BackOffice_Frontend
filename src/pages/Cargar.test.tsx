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

// Los campos del formulario manual se encuentran por su nombre; los de la carga por archivo, por el texto que tienen encima
function label(text: string): HTMLElement {
  const fields = screen.queryAllByLabelText(text, { exact: true });
  if (fields.length === 1) return fields[0];
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
    const codigoInput = screen.getByLabelText("Código de barras");
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
    const codigoInput = screen.getByLabelText("Código de barras");
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
    const categoriaSelect = screen.getByText("Categoría *").nextElementSibling as HTMLSelectElement;
    await user.selectOptions(categoriaSelect, "Almacén");
    const marcaSelect = screen.getByText("Marca").nextElementSibling as HTMLSelectElement;
    await user.selectOptions(marcaSelect, "Marca Test");
    const ubicacionSelect = screen.getByText("Ubicación de guardado").nextElementSibling as HTMLSelectElement;
    await user.selectOptions(ubicacionSelect, "Alacena");
    await user.type(label("Stock"), "2");

    await user.click(screen.getByRole("button", { name: "Guardar producto" }));
    expect(await screen.findByText("El nombre ya existe con otra categoría.")).toBeInTheDocument();

    vi.mocked(api.post).mockResolvedValueOnce({ data: { merged: false, stock: 2 } });
    await user.click(screen.getByRole("button", { name: "Guardar producto" }));
    expect(await screen.findByText('Se ha registrado la entrada de 2 unidades de "Fideos". Stock actual 2.')).toBeInTheDocument();
  });

  it("al sumar stock a un producto existente, muestra el mensaje correspondiente", async () => {
    const user = userEvent.setup();
    defaultGet();
    vi.mocked(api.post).mockResolvedValueOnce({ data: { merged: true, stock: 9 } });

    renderWithProviders(<Cargar />);
    await user.type(label("Nombre"), "Fideos");
    const categoriaSelect = screen.getByText("Categoría *").nextElementSibling as HTMLSelectElement;
    await user.selectOptions(categoriaSelect, "Almacén");
    await user.type(label("Stock"), "2");
    await user.click(screen.getByRole("button", { name: "Guardar producto" }));

    expect(
      await screen.findByText('Se ha registrado la entrada de 2 unidades de "Fideos". Stock actual 9.'),
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

    await user.type(screen.getByPlaceholderText(/Buscá un producto que ya tenés cargado/), "Algo");
    await user.type(label("Stock a sacar"), "1");

    await user.click(screen.getByRole("button", { name: "Registrar salida" }));

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

    await user.type(screen.getByPlaceholderText(/Buscá un producto que ya tenés cargado/), "Yerba");
    await user.click(await screen.findByRole("button", { name: /Yerba Mate/ }, { timeout: 2000 }));

    await user.type(label("Stock a sacar"), "1");
    await user.click(screen.getByTestId("salida-motivo-expired"));
    await user.type(screen.getByPlaceholderText(/vencido en heladera/), "se pasó de fecha");
    await user.click(screen.getByRole("button", { name: "Registrar salida" }));

    expect(await screen.findByText('Se ha registrado la salida de 1 unidad de "Yerba Mate". Stock actual 2.')).toBeInTheDocument();
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
    await user.type(screen.getByPlaceholderText(/Buscá un producto que ya tenés cargado/), "Yerba");
    await user.click(await screen.findByRole("button", { name: /Yerba Mate/ }, { timeout: 2000 }));
    await user.type(label("Stock a sacar"), "10");
    await user.click(screen.getByTestId("salida-motivo-consumed"));
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
    await user.type(screen.getByPlaceholderText(/Buscá un producto que ya tenés cargado/), "Nada");

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
    await user.type(label("Stock mínimo (días de cobertura)"), "2");
    await user.type(label("Días de anticipación (vencimiento)"), "5");

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
    expect(screen.getByPlaceholderText(/Buscá un producto que ya tenés cargado/)).toBeInTheDocument();
  });

  it("permite volver de salida a entrada con el botón correspondiente", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Cargar />);

    await user.click(screen.getByRole("button", { name: "Salida" }));
    expect(screen.getByPlaceholderText(/Buscá un producto que ya tenés cargado/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Entrada" }));
    expect(screen.getByText("Nombre *")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Buscá un producto que ya tenés cargado/)).not.toBeInTheDocument();
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
    await user.selectOptions(within(screen.getByText("Categoría *").parentElement as HTMLElement).getByRole("combobox"), "Almacén");
    await user.type(label("Stock"), "4");
    await user.upload(screen.getByTestId("image-upload-input"), new File(["x"], "yerba.png", { type: "image/png" }));
    await waitFor(() => expect(screen.getByText("yerba.png")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Cambiar imagen" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Guardar producto" }));

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
    expect(screen.queryByTestId("alerts-section")).not.toBeInTheDocument();
  });
});

describe("Cargar · el formulario es el de la app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultGet();
  });

  it("el formulario ocupa todo el ancho de la página", () => {
    renderWithProviders(<Cargar />);

    const card = screen.getByLabelText("Nombre").closest("form")!.parentElement!;
    expect(card.className).toContain("w-full");
    expect(card.className).not.toContain("max-w-");
  });

  it("los campos llevan los mismos nombres y ayudas que la app", () => {
    renderWithProviders(<Cargar />);

    ["Nombre *", "Categoría *", "Stock *", "Marca", "Fecha de vencimiento", "Código de barras", "Descripción", "Ubicación de guardado"].forEach((text) =>
      expect(screen.getByText(text)).toBeInTheDocument(),
    );
    expect(screen.getByPlaceholderText("ej. Leche entera 1L")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("0")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("DD/MM/AAAA")).toBeInTheDocument();
    expect(screen.getByLabelText("Código de barras")).toHaveAttribute("placeholder", "Opcional");
    expect(screen.getByLabelText("Descripción")).toHaveAttribute("placeholder", "Opcional");
    expect(screen.getByRole("button", { name: "Guardar producto" })).toBeInTheDocument();
  });

  it("el nombre admite 20 caracteres y muestra cuántos lleva; la descripción, 400", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Cargar />);

    expect(screen.getByTestId("nombre-counter")).toHaveTextContent("0/20");
    expect(screen.getByLabelText("Nombre")).toHaveAttribute("maxlength", "20");
    await user.type(screen.getByLabelText("Nombre"), "Leche");
    expect(screen.getByTestId("nombre-counter")).toHaveTextContent("5/20");
    expect(screen.getByTestId("descripcion-counter")).toHaveTextContent("0/400");
    expect(screen.getByLabelText("Descripción")).toHaveAttribute("maxlength", "400");
    await user.type(screen.getByLabelText("Descripción"), "Entera");
    expect(screen.getByTestId("descripcion-counter")).toHaveTextContent("6/400");
  });

  it("el stock solo admite números de hasta 6 dígitos y el código de barras, hasta 14", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Cargar />);

    await user.type(screen.getByLabelText("Stock"), "12a3456789");
    expect((screen.getByLabelText("Stock") as HTMLInputElement).value).toBe("123456");
    await user.type(screen.getByLabelText("Código de barras"), "77-9000000000012345");
    expect((screen.getByLabelText("Código de barras") as HTMLInputElement).value).toBe("77900000000001");
  });

  it("la fecha se escribe con solo los números como DD/MM/AAAA", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Cargar />);

    await user.type(screen.getByLabelText("Fecha de vencimiento"), "05032027");

    expect((screen.getByLabelText("Fecha de vencimiento") as HTMLInputElement).value).toBe("05/03/2027");
  });

  it("verifica lo mismo que la app, con sus mismos mensajes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Cargar />);
    const guardar = () => user.click(screen.getByRole("button", { name: "Guardar producto" }));

    await guardar();
    expect(await screen.findByRole("alert")).toHaveTextContent("El nombre es requerido");

    await user.type(screen.getByLabelText("Nombre"), "Fideos");
    await guardar();
    expect(screen.getByRole("alert")).toHaveTextContent("La categoría es requerida");

    await user.selectOptions(screen.getByText("Categoría *").nextElementSibling as HTMLSelectElement, "Almacén");
    await guardar();
    expect(screen.getByRole("alert")).toHaveTextContent("El stock debe ser mayor a 0");

    await user.type(screen.getByLabelText("Stock"), "2");
    await user.type(screen.getByLabelText("Fecha de vencimiento"), "31022027");
    await guardar();
    expect(screen.getByRole("alert")).toHaveTextContent("Fecha de vencimiento inválida. Ingresa el día y el mes con 2 dígitos y el año con 4 dígitos. Por ejemplo: 05/03/2027");

    await user.clear(screen.getByLabelText("Fecha de vencimiento"));
    await user.type(screen.getByLabelText("Código de barras"), "12345");
    await guardar();
    expect(screen.getByRole("alert")).toHaveTextContent("El código de barras es inválido");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("guarda con la fecha en formato ISO y los días de las reglas propias", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValueOnce({ data: { merged: false } });
    renderWithProviders(<Cargar />);

    await user.type(screen.getByLabelText("Nombre"), "Fideos");
    await user.selectOptions(screen.getByText("Categoría *").nextElementSibling as HTMLSelectElement, "Almacén");
    await user.type(screen.getByLabelText("Stock"), "2");
    await user.type(screen.getByLabelText("Fecha de vencimiento"), "05032027");
    await user.click(screen.getByTestId("alerts-toggle"));
    await user.type(screen.getByLabelText("Stock mínimo (días de cobertura)"), "9");
    await user.type(screen.getByLabelText("Días de anticipación (vencimiento)"), "1234");
    await user.click(screen.getByRole("button", { name: "Guardar producto" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/me/products",
        expect.objectContaining({ nombre: "Fideos", stock: 2, vencimiento: "2027-03-05", stock_minimo: 9, dias_alerta_vencimiento: 123 }),
      ),
    );
  });

  it("las reglas de alerta están cerradas, indican cuál regla se usa y conservan lo escrito al cerrarse", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Cargar />);

    expect(screen.queryByTestId("alerts-section")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("alerts-toggle"));
    expect(screen.getAllByText("Usando tu regla general")).toHaveLength(2);
    await user.type(screen.getByLabelText("Stock mínimo (días de cobertura)"), "9");
    expect(screen.getByText("Regla propia de este producto")).toBeInTheDocument();

    await user.click(screen.getByTestId("alerts-toggle"));
    expect(screen.queryByTestId("alerts-section")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("alerts-toggle"));
    expect((screen.getByLabelText("Stock mínimo (días de cobertura)") as HTMLInputElement).value).toBe("9");
  });

  it("una opción nueva de categoría, marca o ubicación admite 20 caracteres", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Cargar />);

    await user.selectOptions(screen.getByText("Categoría *").nextElementSibling as HTMLSelectElement, "__new__");

    const nueva = screen.getByLabelText("Categoría * nueva");
    expect(nueva).toHaveAttribute("maxlength", "20");
    expect(nueva).toHaveAttribute("placeholder", "Ej. Lácteos");
  });

  it("la fecha que llega de una sugerencia se ve como DD/MM/AAAA", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/products/filters/options") return { data: OPCIONES };
      if (url === "/me/products/suggest") return { data: [suggestion({ vencimiento: "2027-03-05" })] };
      throw new Error(`GET no mockeado: ${url}`);
    });
    renderWithProviders(<Cargar />);

    await user.type(screen.getByLabelText("Nombre"), "Yerba");
    await user.click(await screen.findByRole("button", { name: /Yerba Mate/ }, { timeout: 2000 }));

    expect((screen.getByLabelText("Fecha de vencimiento") as HTMLInputElement).value).toBe("05/03/2027");
  });
});

describe("Cargar · la salida es la de la app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function abrirSalida(user: ReturnType<typeof userEvent.setup>) {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/products/filters/options") return { data: OPCIONES };
      if (url === "/me/products/suggest") return { data: [suggestion()] };
      throw new Error(`GET no mockeado: ${url}`);
    });
    renderWithProviders(<Cargar />);
    await user.click(screen.getByRole("button", { name: "Salida" }));
  }

  it("tiene los mismos campos, textos y límites", async () => {
    const user = userEvent.setup();
    await abrirSalida(user);

    ["Producto *", "Stock a sacar *", "Motivo *", "Descripción de Motivo"].forEach((text) => expect(screen.getByText(text)).toBeInTheDocument());
    expect(screen.getByLabelText("Descripción de Motivo")).toHaveAttribute("placeholder", "Descripción de salida (ej. vencido en heladera)");
    expect(screen.getByLabelText("Descripción de Motivo")).toHaveAttribute("maxlength", "50");
    expect(screen.getByTestId("salida-nota-counter")).toHaveTextContent("0/50");
    await user.type(screen.getByLabelText("Descripción de Motivo"), "se pasó");
    expect(screen.getByTestId("salida-nota-counter")).toHaveTextContent("7/50");
    await user.type(screen.getByLabelText("Stock a sacar"), "1x2345678");
    expect((screen.getByLabelText("Stock a sacar") as HTMLInputElement).value).toBe("123456");
  });

  it("ofrece los cuatro motivos, ninguno elegido al principio, y volver a tocar uno lo deselecciona", async () => {
    const user = userEvent.setup();
    await abrirSalida(user);

    expect(screen.getAllByTestId(/^salida-motivo-/).map((b) => b.textContent)).toEqual(["Vendido", "Consumido", "Vencido", "Alquilado"]);
    screen.getAllByTestId(/^salida-motivo-/).forEach((b) => expect(b).toHaveAttribute("aria-pressed", "false"));
    await user.click(screen.getByTestId("salida-motivo-rented"));
    expect(screen.getByTestId("salida-motivo-rented")).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByTestId("salida-motivo-rented"));
    expect(screen.getByTestId("salida-motivo-rented")).toHaveAttribute("aria-pressed", "false");
  });

  it("verifica lo mismo que la app, con sus mismos mensajes", async () => {
    const user = userEvent.setup();
    await abrirSalida(user);
    const registrar = () => user.click(screen.getByRole("button", { name: "Registrar salida" }));

    await registrar();
    expect(await screen.findByRole("alert")).toHaveTextContent("Elegí un producto de la lista de sugerencias");

    await user.type(screen.getByLabelText("Producto"), "Yerba");
    await user.click(await screen.findByRole("button", { name: /Yerba Mate/ }, { timeout: 2000 }));
    expect(screen.getByTestId("salida-selected")).toHaveTextContent("Stock actual: 3");
    await registrar();
    expect(screen.getByRole("alert")).toHaveTextContent("La cantidad debe ser mayor a 0");

    await user.type(screen.getByLabelText("Stock a sacar"), "1");
    await registrar();
    expect(screen.getByRole("alert")).toHaveTextContent("Elegí el motivo de la salida");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("registra la salida con el motivo elegido, también «vendido» y «alquilado»", async () => {
    const user = userEvent.setup();
    await abrirSalida(user);
    vi.mocked(api.post).mockResolvedValue({ data: { stock: 1 } });

    await user.type(screen.getByLabelText("Producto"), "Yerba");
    await user.click(await screen.findByRole("button", { name: /Yerba Mate/ }, { timeout: 2000 }));
    await user.type(screen.getByLabelText("Stock a sacar"), "2");
    await user.click(screen.getByTestId("salida-motivo-sold"));
    await user.click(screen.getByRole("button", { name: "Registrar salida" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/me/products/salida", expect.objectContaining({ product_id: 1, quantity: 2, event_type: "sold" })),
    );
    expect(await screen.findByText('Se ha registrado la salida de 2 unidades de "Yerba Mate". Stock actual 1.')).toBeInTheDocument();
    expect(screen.getByTestId("salida-motivo-sold")).toHaveAttribute("aria-pressed", "false");
  });
});

describe("Cargar · formulario de entrada en renglones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultGet();
  });

  const rowOf = (field: HTMLElement) => field.closest("div.grid") as HTMLElement;

  it("nombre y stock, marca y categoría, y fecha de vencimiento y código de barras comparten renglón", async () => {
    renderWithProviders(<Cargar />);

    const nombre = screen.getByLabelText("Nombre");
    expect(rowOf(nombre)).toContainElement(screen.getByLabelText("Stock"));
    const marca = screen.getByText("Marca").nextElementSibling as HTMLElement;
    const categoria = screen.getByText("Categoría *").nextElementSibling as HTMLElement;
    expect(rowOf(marca)).toBe(rowOf(categoria));
    expect(marca.compareDocumentPosition(categoria) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const fecha = screen.getByLabelText("Fecha de vencimiento");
    expect(rowOf(fecha)).toContainElement(screen.getByLabelText("Código de barras"));
    expect(new Set([rowOf(nombre), rowOf(marca), rowOf(fecha)]).size).toBe(3);
    [nombre, marca, fecha].forEach((el) => expect(rowOf(el).className).toContain("md:grid-cols-2"));
  });

  it("marca y categoría arrancan en «Seleccionar…»", async () => {
    renderWithProviders(<Cargar />);

    const marca = screen.getByText("Marca").nextElementSibling as HTMLSelectElement;
    const categoria = screen.getByText("Categoría *").nextElementSibling as HTMLSelectElement;
    expect(marca.selectedOptions[0]).toHaveTextContent("Seleccionar…");
    expect(categoria.selectedOptions[0]).toHaveTextContent("Seleccionar…");
    expect(within(marca).queryByRole("option", { name: "Opcional" })).not.toBeInTheDocument();
  });

  it("el código de barras usa la misma letra que la descripción (nada de tipografía monoespaciada)", () => {
    renderWithProviders(<Cargar />);

    expect(screen.getByLabelText("Código de barras").className).not.toContain("font-mono");
    expect(screen.getByLabelText("Código de barras")).toHaveAttribute("placeholder", "Opcional");
    expect(screen.getByLabelText("Descripción")).toHaveAttribute("placeholder", "Opcional");
  });

  it("a la derecha de la fecha hay un botón de calendario que completa el campo con el día elegido", async () => {
    const user = userEvent.setup();
    const showPicker = vi.fn();
    (HTMLInputElement.prototype as any).showPicker = showPicker;
    try {
      renderWithProviders(<Cargar />);

      const fecha = screen.getByLabelText("Fecha de vencimiento");
      const button = screen.getByTestId("open-calendar");
      expect(fecha.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      await user.click(button);
      expect(showPicker).toHaveBeenCalledOnce();

      fireEvent.change(screen.getByTestId("calendar-input"), { target: { value: "2027-03-05" } });
      expect((fecha as HTMLInputElement).value).toBe("05/03/2027");
      expect((screen.getByTestId("calendar-input") as HTMLInputElement).value).toBe("2027-03-05");
    } finally {
      delete (HTMLInputElement.prototype as any).showPicker;
    }
  });

  it("si el navegador no sabe abrir el calendario solo, se hace clic en el campo de fecha", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Cargar />);
    const clicked = vi.fn();
    screen.getByTestId("calendar-input").addEventListener("click", clicked);

    await user.click(screen.getByTestId("open-calendar"));
    expect(clicked).toHaveBeenCalled();

    (HTMLInputElement.prototype as any).showPicker = () => {
      throw new Error("bloqueado");
    };
    try {
      clicked.mockClear();
      await user.click(screen.getByTestId("open-calendar"));
      expect(clicked).toHaveBeenCalled();
    } finally {
      delete (HTMLInputElement.prototype as any).showPicker;
    }
  });

  it("si en el calendario no se elige ningún día, no cambia nada", () => {
    renderWithProviders(<Cargar />);

    fireEvent.change(screen.getByTestId("calendar-input"), { target: { value: "" } });

    expect((screen.getByLabelText("Fecha de vencimiento") as HTMLInputElement).value).toBe("");
  });

  it("las reglas de alerta tienen los nombres y las descripciones de la app", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Cargar />);

    await user.click(screen.getByTestId("alerts-toggle"));

    expect(screen.getByText("Reglas de alerta de producto")).toBeInTheDocument();
    expect(screen.getByLabelText("Stock mínimo (días de cobertura)")).toHaveAttribute("placeholder", "Opcional");
    expect(screen.getByLabelText("Días de anticipación (vencimiento)")).toHaveAttribute("placeholder", "Opcional");
    expect(screen.getAllByText("Usando tu regla general")).toHaveLength(2);
    await user.type(screen.getByLabelText("Stock mínimo (días de cobertura)"), "3");
    expect(screen.getAllByText("Usando tu regla general")).toHaveLength(1);
    expect(screen.getByText("Regla propia de este producto")).toBeInTheDocument();
  });

  it("al registrar la entrada el formulario se vacía y el mensaje queda justo encima del formulario", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { merged: false, stock: 15 } });
    renderWithProviders(<Cargar />);

    await user.type(screen.getByLabelText("Nombre"), "Fideos");
    await user.selectOptions(screen.getByText("Categoría *").nextElementSibling as HTMLSelectElement, "Almacén");
    await user.selectOptions(screen.getByText("Marca").nextElementSibling as HTMLSelectElement, "Marca Test");
    await user.selectOptions(screen.getByText("Ubicación de guardado").nextElementSibling as HTMLSelectElement, "Alacena");
    await user.type(screen.getByLabelText("Stock"), "5");
    await user.type(screen.getByLabelText("Fecha de vencimiento"), "05032027");
    await user.click(screen.getByRole("button", { name: "Guardar producto" }));

    const notice = await screen.findByTestId("flow-success");
    expect(notice).toHaveTextContent('Se ha registrado la entrada de 5 unidades de "Fideos". Stock actual 15.');
    expect(notice.nextElementSibling?.tagName).toBe("FORM");
    expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Stock") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Fecha de vencimiento") as HTMLInputElement).value).toBe("");
    expect((screen.getByText("Categoría *").nextElementSibling as HTMLSelectElement).value).toBe("");
    expect((screen.getByText("Marca").nextElementSibling as HTMLSelectElement).value).toBe("");
    expect((screen.getByText("Ubicación de guardado").nextElementSibling as HTMLSelectElement).value).toBe("");
  });

  it("con una sola unidad dice «1 unidad»", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { merged: true, stock: 4 } });
    renderWithProviders(<Cargar />);

    await user.type(screen.getByLabelText("Nombre"), "Fideos");
    await user.selectOptions(screen.getByText("Categoría *").nextElementSibling as HTMLSelectElement, "Almacén");
    await user.type(screen.getByLabelText("Stock"), "1");
    await user.click(screen.getByRole("button", { name: "Guardar producto" }));

    expect(await screen.findByTestId("flow-success")).toHaveTextContent('Se ha registrado la entrada de 1 unidad de "Fideos". Stock actual 4.');
  });
});

describe("Cargar · salida: nombre de hasta 20 y aviso arriba", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/products/filters/options") return { data: OPCIONES };
      if (url === "/me/products/suggest") return { data: [suggestion()] };
      throw new Error(`GET no mockeado: ${url}`);
    });
  });

  it("el nombre del producto admite hasta 20 caracteres y lo muestra con su contador", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Cargar />);
    await user.click(screen.getByRole("button", { name: "Salida" }));

    const input = screen.getByLabelText("Producto");
    expect(input).toHaveAttribute("maxLength", "20");
    await user.type(input, "x".repeat(30));
    expect((input as HTMLInputElement).value).toHaveLength(20);
    expect(screen.getByTestId("producto-counter")).toHaveTextContent("20/20");
  });

  it("al registrar la salida el formulario se vacía y el mensaje queda justo encima del formulario", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { stock: 15 } });
    renderWithProviders(<Cargar />);
    await user.click(screen.getByRole("button", { name: "Salida" }));

    await user.type(screen.getByLabelText("Producto"), "Yerba");
    await user.click(await screen.findByRole("button", { name: /Yerba Mate/ }, { timeout: 2000 }));
    await user.type(screen.getByLabelText("Stock a sacar"), "3");
    await user.click(screen.getByTestId("salida-motivo-sold"));
    await user.type(screen.getByLabelText("Descripción de Motivo"), "se vendió");
    await user.click(screen.getByRole("button", { name: "Registrar salida" }));

    const notice = await screen.findByTestId("flow-success");
    expect(notice).toHaveTextContent('Se ha registrado la salida de 3 unidades de "Yerba Mate". Stock actual 15.');
    expect(notice.nextElementSibling?.tagName).toBe("FORM");
    expect((screen.getByLabelText("Producto") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Stock a sacar") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Descripción de Motivo") as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByTestId("salida-motivo-sold")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("salida-selected")).not.toBeInTheDocument();
  });
});

describe("Cargar · botones de tipo de flujo y método arriba", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultGet();
  });

  it("los botones están arriba, a la derecha del título y su descripción, sin títulos ni textos adicionales", () => {
    renderWithProviders(<Cargar />);

    const direction = screen.getByTestId("flow-direction");
    const method = screen.getByTestId("flow-method");
    const header = screen.getByRole("heading", { name: "Flujo de producto" }).parentElement!.parentElement!;
    expect(header.className).toContain("items-center");
    expect(header).toContainElement(direction);
    expect(header).toContainElement(method);
    expect(direction.textContent).toBe("Producto existenteEntradaSalida");
    expect(method.textContent).toBe("ManualArchivoProcesamiento");
    expect(direction.compareDocumentPosition(method) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    [...within(direction).getAllByRole("button"), ...within(method).getAllByRole("button")].forEach((button) =>
      expect(button.querySelector("svg")).not.toBeNull(),
    );
  });

  it("el botón elegido de cada grupo queda relleno: la entrada en verde azulado y la salida en rojo", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Cargar />);

    expect(screen.getByTestId("flow-direction-entrada")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("flow-direction-entrada").className).toContain("bg-primary");
    expect(screen.getByTestId("flow-method-manual")).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByTestId("flow-direction-salida"));
    expect(screen.getByTestId("flow-direction-salida")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("flow-direction-salida").className).toContain("bg-critical");
    expect(screen.getByTestId("flow-direction-entrada")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Registrar salida" })).toBeInTheDocument();
  });

  it("cambia el método de carga sin perder el tipo de flujo", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Cargar />);

    await user.click(screen.getByTestId("flow-direction-salida"));
    await user.click(screen.getByTestId("flow-method-archivo"));

    expect(screen.getByTestId("flow-method-archivo")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("flow-direction-salida")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/cantidad a sacar/)).toBeInTheDocument();
    await user.click(screen.getByTestId("flow-method-procesamiento"));
    expect(screen.getByTestId("flow-method-procesamiento")).toHaveAttribute("aria-pressed", "true");
  });

  it("debajo del código de barras ya no hay texto descriptivo", () => {
    renderWithProviders(<Cargar />);

    expect(screen.queryByText(/8, 12, 13 o 14 dígitos/)).not.toBeInTheDocument();
    expect(screen.queryByText(/escanearlo desde Procesamiento/)).not.toBeInTheDocument();
  });

  it("los inputs llevan los mismos textos que el flujo de la app", () => {
    renderWithProviders(<Cargar />);

    expect(screen.getByLabelText("Nombre")).toHaveAttribute("placeholder", "ej. Leche entera 1L");
    expect(screen.getByLabelText("Stock")).toHaveAttribute("placeholder", "0");
    expect(screen.getByLabelText("Fecha de vencimiento")).toHaveAttribute("placeholder", "DD/MM/AAAA");
    expect(screen.getByLabelText("Código de barras")).toHaveAttribute("placeholder", "Opcional");
    expect(screen.getByLabelText("Descripción")).toHaveAttribute("placeholder", "Opcional");
    expect((screen.getByText("Ubicación de guardado").nextElementSibling as HTMLSelectElement).selectedOptions[0]).toHaveTextContent("Seleccionar…");
  });
});

function scanDone(docType: string, draftOverrides: Record<string, unknown> = {}) {
  return {
    data: {
      job_id: null,
      status: "done",
      doc_type: docType,
      error: null,
      queue_position: null,
      estimated_wait_seconds: null,
      result: {
        doc_type: docType,
        draft: {
          nombre: null,
          marca: null,
          descripcion: null,
          vencimiento: null,
          codigo_barras: null,
          pais_registro: null,
          stock: null,
          confianzas: {},
          texto_leido: null,
          coincidencias: [],
          coincidencia_id: null,
          ...draftOverrides,
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

const foto = () => new File(["x"], "foto.png", { type: "image/png" });

describe("Cargar · producto existente y escaneo hacia el formulario", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultGet();
  });

  it("la descripción es «Alta y baja de productos a tu inventario» sea cual sea el tipo de flujo", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Cargar />);

    expect(screen.getByText("Alta y baja de productos a tu inventario")).toBeInTheDocument();
    await user.click(screen.getByTestId("flow-direction-salida"));
    expect(screen.getByText("Alta y baja de productos a tu inventario")).toBeInTheDocument();
    await user.click(screen.getByTestId("flow-direction-existente"));
    expect(screen.getByText("Alta y baja de productos a tu inventario")).toBeInTheDocument();
  });

  it("«Producto existente» está a la izquierda de «Entrada» y cambia el método por las formas de buscarlo", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Cargar />);

    const direction = screen.getByTestId("flow-direction");
    expect(direction.textContent).toBe("Producto existenteEntradaSalida");
    expect(within(direction).getAllByRole("button")[0]).toHaveTextContent("Producto existente");
    await user.click(screen.getByTestId("flow-direction-existente"));

    expect(screen.getByTestId("flow-direction-existente")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("flow-method")).not.toBeInTheDocument();
    expect(screen.getByTestId("flow-existing").textContent).toBe("NombreEtiquetaCódigo de barras");
    expect(screen.getByLabelText("Nombre del producto")).toBeInTheDocument();
    await user.click(screen.getByTestId("flow-existing-codigo"));
    expect(screen.getByLabelText("Código de barras")).toBeInTheDocument();
    await user.click(screen.getByTestId("flow-existing-etiqueta"));
    expect(screen.getByLabelText("Elegí una foto")).toBeInTheDocument();
  });

  it("un producto existente que no se encuentra se puede cargar como nuevo: el formulario de entrada recibe lo escaneado", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/products/filters/options") return { data: OPCIONES };
      if (url.startsWith("/me/products/by-barcode/")) return { data: [] };
      throw new Error(`GET no mockeado: ${url}`);
    });
    renderWithProviders(<Cargar />);

    await user.click(screen.getByTestId("flow-direction-existente"));
    await user.click(screen.getByTestId("flow-existing-codigo"));
    await user.type(screen.getByLabelText("Código de barras"), "7791234567890");
    await user.click(screen.getByTestId("existing-search-barcode"));
    await user.click(await screen.findByTestId("existing-load-new"));

    expect(await screen.findByText("Nombre *")).toBeInTheDocument();
    expect(screen.getByTestId("flow-direction-entrada")).toHaveAttribute("aria-pressed", "true");
    expect((screen.getByLabelText("Código de barras") as HTMLInputElement).value).toBe("7791234567890");
  });

  it("desde Procesamiento, la etiqueta leída pasa con todos sus campos al formulario de entrada", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue(
      scanDone("product_label", { nombre: "Yerba Mate", marca: "La Merced", vencimiento: "2027-03-05", codigo_barras: "7791234567890", descripcion: "Yerba suave" }),
    );
    renderWithProviders(<Cargar />);

    await user.click(screen.getByTestId("flow-method-procesamiento"));
    await user.upload(screen.getByLabelText("Elegí una foto"), foto());
    await user.click(screen.getByRole("button", { name: "Leer etiqueta" }));
    await user.click(await screen.findByTestId("etiqueta-confirmar"));

    expect(await screen.findByText("Nombre *")).toBeInTheDocument();
    expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe("Yerba Mate");
    expect((screen.getByText("Marca").nextElementSibling as HTMLSelectElement).value).toBe("La Merced");
    expect((screen.getByLabelText("Fecha de vencimiento") as HTMLInputElement).value).toBe("05/03/2027");
    expect((screen.getByLabelText("Código de barras") as HTMLInputElement).value).toBe("7791234567890");
    expect((screen.getByLabelText("Descripción") as HTMLTextAreaElement).value).toBe("Yerba suave");
    expect(screen.getByTestId("flow-method-manual")).toHaveAttribute("aria-pressed", "true");
  });

  it("junto al vencimiento y al código de barras hay un botón con una cámara para escanearlos", async () => {
    renderWithProviders(<Cargar />);

    const fecha = screen.getByLabelText("Fecha de vencimiento");
    const camaraFecha = screen.getByTestId("scan-expiry_date");
    expect(camaraFecha).toHaveAccessibleName("Escanear fecha de vencimiento");
    expect(fecha.compareDocumentPosition(camaraFecha) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(camaraFecha.compareDocumentPosition(screen.getByTestId("open-calendar")) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    const codigo = screen.getByLabelText("Código de barras");
    const camaraCodigo = screen.getByTestId("scan-barcode");
    expect(camaraCodigo).toHaveAccessibleName("Escanear código de barras");
    expect(codigo.compareDocumentPosition(camaraCodigo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("escanear una fecha de vencimiento completa el campo", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue(scanDone("expiry_date", { vencimiento: "2027-03-05" }));
    renderWithProviders(<Cargar />);

    await user.upload(screen.getByTestId("scan-expiry_date-input"), foto());

    await waitFor(() => expect((screen.getByLabelText("Fecha de vencimiento") as HTMLInputElement).value).toBe("05/03/2027"));
    expect(api.post).toHaveBeenCalledWith("/me/products/ocr/scan", expect.any(FormData), expect.anything());
    expect(((vi.mocked(api.post).mock.calls[0][1]) as FormData).get("doc_type")).toBe("expiry_date");
  });

  it("si en la foto no hay una fecha, lo avisa debajo del campo", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue(scanDone("expiry_date"));
    renderWithProviders(<Cargar />);

    await user.upload(screen.getByTestId("scan-expiry_date-input"), foto());

    expect(await screen.findByTestId("scan-note")).toHaveTextContent("No se pudo leer una fecha en la foto");
  });

  it("escanear un código de barras completa el campo y, si no se lee, lo avisa", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValueOnce(scanDone("barcode", { codigo_barras: "7791234567890" }));
    renderWithProviders(<Cargar />);

    await user.upload(screen.getByTestId("scan-barcode-input"), foto());
    await waitFor(() => expect((screen.getByLabelText("Código de barras") as HTMLInputElement).value).toBe("7791234567890"));
    expect(((vi.mocked(api.post).mock.calls[0][1]) as FormData).get("doc_type")).toBe("barcode");

    vi.mocked(api.post).mockResolvedValueOnce(scanDone("barcode"));
    await user.upload(screen.getByTestId("scan-barcode-input"), foto());
    expect(await screen.findByTestId("scan-note")).toHaveTextContent("No se pudo leer un código de barras: podés escribirlo");
  });

  it("si falla el escaneo de un campo, muestra el error debajo de ese campo", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async () => {
      const err: any = new Error("fallo");
      err.response = { status: 503 };
      throw err;
    });
    renderWithProviders(<Cargar />);

    await user.upload(screen.getByTestId("scan-barcode-input"), foto());

    expect(await screen.findByTestId("scan-note")).toHaveTextContent(/El módulo de OCR no está disponible/);
  });

  it("la salida recibe el producto ya elegido desde el escaneo", async () => {
    const user = userEvent.setup();
    const producto = { id: 4, nombre: "Yerba Mate", marca: "La Merced", categoria: "Almacén", ubicacion: null, vencimiento: null, stock: 3, stock_minimo: null, dias_alerta_vencimiento: null };
    vi.mocked(api.post).mockResolvedValue(scanDone("barcode", { codigo_barras: "7791234567890" }));
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/products/filters/options") return { data: OPCIONES };
      if (url === "/me/products/by-barcode/7791234567890/all") return { data: [producto] };
      throw new Error(`GET no mockeado: ${url}`);
    });
    renderWithProviders(<Cargar />);

    await user.click(screen.getByTestId("flow-direction-salida"));
    await user.click(screen.getByTestId("flow-method-procesamiento"));
    await user.upload(screen.getByLabelText("Elegí una foto"), foto());
    await user.click(screen.getByRole("button", { name: "Leer código" }));
    await user.click(await screen.findByTestId("existing-search-barcode"));
    await user.click(await screen.findByTestId("existing-option-4"));
    await user.click(screen.getByTestId("existing-confirm"));

    expect(await screen.findByTestId("salida-selected")).toHaveTextContent("Yerba Mate");
    expect((screen.getByLabelText("Producto") as HTMLInputElement).value).toBe("Yerba Mate");
    expect(screen.getByTestId("flow-direction-salida")).toHaveAttribute("aria-pressed", "true");
  });
});
