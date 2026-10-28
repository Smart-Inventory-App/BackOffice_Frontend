import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import Procesamiento from "./Procesamiento";
import type { ProductDraft, ProductMatch, ScanResult, ScanState } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { api } from "@/lib/api";

const OPCIONES = { categorias: ["Almacén"], ubicaciones: ["Alacena"], marcas: ["Marca Test"] };

function match(overrides: Partial<ProductMatch> = {}): ProductMatch {
  return {
    id: 1,
    nombre: "Yerba Mate 1kg",
    marca: "La Merced",
    categoria: "Almacén",
    ubicacion: "Alacena",
    vencimiento: "2026-01-01",
    stock: 3,
    codigo_barras: "7791234567890",
    score: 0.92,
    por_codigo: false,
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
    stock: 1,
    confianzas: {},
    texto_leido: "Yerba Mate 1kg La Merced",
    coincidencias: [],
    coincidencia_id: null,
    ...overrides,
  };
}

function scanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    doc_type: "product_label",
    draft: draft(),
    items: [],
    comprobante: null,
    needs_review: false,
    confianza: 0.9,
    texto_legible: "yerba mate 1kg",
    advertencias: [],
    sin_coincidencia: 0,
    ...overrides,
  };
}

function doneState(result: ScanResult, docType = result.doc_type): ScanState {
  return {
    job_id: null,
    status: "done",
    doc_type: docType,
    result,
    error: null,
    queue_position: null,
    estimated_wait_seconds: null,
  };
}

/** Mockea GET para /me/products/filters/options y deja el resto sin resolver por defecto. */
function mockOpcionesGet(overrides: Partial<typeof OPCIONES> = {}) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === "/me/products/filters/options") {
      return { data: { ...OPCIONES, ...overrides } };
    }
    throw new Error(`GET no mockeado en este test: ${url}`);
  });
}

const png = () => new File(["foto"], "foto.png", { type: "image/png" });

function irA() {
  return { irAManual: vi.fn(), irASalidaManual: vi.fn() };
}

describe("Procesamiento · entrada · etiqueta del producto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpcionesGet();
  });

  const subir = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Leer etiqueta" }));
  };

  it("en una entrada solo se puede escanear la etiqueta de un producto nuevo o un comprobante, y no hay texto arriba de los botones", () => {
    const { irAManual, irASalidaManual } = irA();
    renderWithProviders(<Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={irASalidaManual} />);

    expect(screen.getByRole("button", { name: /Etiqueta de producto/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ticket, remito o factura/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Código de barras/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Imagen del producto/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Sacale una foto a lo que quieras/)).not.toBeInTheDocument();
    expect(screen.queryByText(/no se almacenan/)).not.toBeInTheDocument();
  });

  it("la foto elegida se puede ampliar como las demás imágenes", async () => {
    const user = userEvent.setup();
    const { irAManual, irASalidaManual } = irA();
    renderWithProviders(<Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={irASalidaManual} />);

    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByTestId("product-image-zoom"));

    expect(screen.getByTestId("image-viewer-frame")).toBeInTheDocument();
    await user.click(screen.getByTestId("image-viewer-close"));
    expect(screen.queryByTestId("image-viewer-frame")).not.toBeInTheDocument();
  });

  it("lee la etiqueta, deja corregir lo leído y, al validarlo, lo pasa todo al formulario de entrada", async () => {
    const user = userEvent.setup();
    const { irAManual, irASalidaManual } = irA();
    vi.mocked(api.post).mockResolvedValue({
      data: doneState(scanResult({ draft: draft({ vencimiento: "2027-03-05", codigo_barras: "7791234567890", descripcion: "Yerba suave" }) })),
    });
    renderWithProviders(<Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={irASalidaManual} />);

    await subir(user);

    expect(await screen.findByDisplayValue("Yerba Mate")).toBeInTheDocument();
    expect(screen.getByDisplayValue("La Merced")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2027-03-05")).toBeInTheDocument();
    expect(screen.getByDisplayValue("7791234567890")).toBeInTheDocument();
    expect(screen.getByText(/Texto leído: Yerba Mate 1kg La Merced/)).toBeInTheDocument();
    // Nada se guarda acá: no hay coincidencias con productos existentes ni un botón de carga directa
    expect(screen.queryByText("¿Es alguno de estos?")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar carga" })).not.toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);

    await user.clear(screen.getByDisplayValue("Yerba Mate"));
    await user.type(screen.getByPlaceholderText("ej. Leche entera 1L"), "Yerba Mate 500g");
    await user.click(screen.getByTestId("etiqueta-confirmar"));

    expect(irAManual).toHaveBeenCalledWith({
      nombre: "Yerba Mate 500g",
      marca: "La Merced",
      vencimiento: "2027-03-05",
      codigo_barras: "7791234567890",
      descripcion: "Yerba suave",
    });
  });

  it("sin nombre no se puede confirmar, el código admite solo dígitos y se puede descartar para escanear otra", async () => {
    const user = userEvent.setup();
    const { irAManual, irASalidaManual } = irA();
    vi.mocked(api.post).mockResolvedValue({ data: doneState(scanResult({ draft: draft({ nombre: null, marca: null, texto_leido: null }) })) });
    renderWithProviders(<Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={irASalidaManual} />);

    await subir(user);

    const confirmar = await screen.findByTestId("etiqueta-confirmar");
    expect(confirmar).toBeDisabled();
    await user.type(screen.getAllByPlaceholderText("Opcional").find((el) => el.getAttribute("inputmode") === "numeric")!, "ab12-3");
    expect(screen.getByDisplayValue("123")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Descartar y escanear otra" }));
    expect(screen.getByLabelText("Elegí una foto")).toBeInTheDocument();
  });

  it("avisa cuando la lectura necesita revisión", async () => {
    const user = userEvent.setup();
    const { irAManual, irASalidaManual } = irA();
    vi.mocked(api.post).mockResolvedValue({ data: doneState(scanResult({ needs_review: true, confianza: 0.4 })) });
    renderWithProviders(<Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={irASalidaManual} />);

    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Quitar" }));
    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Leer etiqueta" }));

    await screen.findByDisplayValue("Yerba Mate");
    expect(screen.getByText(/revisá los campos antes de confirmar/)).toBeInTheDocument();
  });

  it("con el módulo caído (502/503/504) muestra un único mensaje de no disponibilidad", async () => {
    const user = userEvent.setup();
    const { irAManual, irASalidaManual } = irA();
    vi.mocked(api.post).mockImplementation(async () => {
      const err: any = new Error("fallo de red");
      err.response = { status: 502 };
      throw err;
    });
    renderWithProviders(<Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={irASalidaManual} />);

    await subir(user);

    expect(await screen.findByText(/El módulo de OCR no está disponible en este momento/)).toBeInTheDocument();
  });

  it("con un 429 agrega cuánto falta para reintentar, según el header retry-after", async () => {
    const user = userEvent.setup();
    const { irAManual, irASalidaManual } = irA();
    vi.mocked(api.post).mockImplementation(async () => {
      const err: any = new Error("rate limit");
      err.response = { status: 429, data: { detail: "Superaste el límite de escaneos." }, headers: { "retry-after": "90" } };
      throw err;
    });
    renderWithProviders(<Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={irASalidaManual} />);

    await subir(user);

    expect(await screen.findByText(/Superaste el límite de escaneos\. Podés volver a intentar en 2 min\./)).toBeInTheDocument();
  });

  it("hace polling del job asíncrono hasta que termina", async () => {
    const user = userEvent.setup();
    const { irAManual, irASalidaManual } = irA();
    let consultas = 0;
    vi.mocked(api.post).mockResolvedValue({
      data: { job_id: "job-1", status: "queued", doc_type: "product_label", result: null, error: null, queue_position: 2, estimated_wait_seconds: 5 } as ScanState,
    });
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/products/filters/options") return { data: OPCIONES };
      if (url === "/me/products/ocr/scan/job-1") {
        consultas += 1;
        if (consultas < 2) {
          return { data: { job_id: "job-1", status: "processing", doc_type: "product_label", result: null, error: null, queue_position: 1, estimated_wait_seconds: 2 } as ScanState };
        }
        return { data: doneState(scanResult()) };
      }
      throw new Error(`GET no mockeado: ${url}`);
    });
    renderWithProviders(<Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={irASalidaManual} />);

    await subir(user);

    expect(await screen.findByText(/procesando…|en la fila/)).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Yerba Mate", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(consultas).toBeGreaterThanOrEqual(2);
  }, 10000);

  it("si se pierde el seguimiento del escaneo, informa el error", async () => {
    const user = userEvent.setup();
    const { irAManual, irASalidaManual } = irA();
    vi.mocked(api.post).mockResolvedValue({
      data: { job_id: "job-x", status: "queued", doc_type: "product_label", result: null, error: null, queue_position: null, estimated_wait_seconds: null } as ScanState,
    });
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/products/filters/options") return { data: OPCIONES };
      if (url === "/me/products/ocr/scan/job-x") {
        const err: any = new Error("expirado");
        err.response = { status: 404 };
        throw err;
      }
      throw new Error(`GET no mockeado: ${url}`);
    });
    renderWithProviders(<Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={irASalidaManual} />);

    await subir(user);

    expect(await screen.findByText(/Se perdió el seguimiento del escaneo/, {}, { timeout: 5000 })).toBeInTheDocument();
  }, 10000);
});

describe("Procesamiento · salida · código de barras y etiqueta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpcionesGet();
  });

  it("ofrece el código de barras, la etiqueta y el comprobante, como la app", () => {
    const { irAManual, irASalidaManual } = irA();
    renderWithProviders(<Procesamiento direction="salida" irAManual={irAManual} irASalidaManual={irASalidaManual} />);

    ["Código de barras", "Etiqueta de producto", "Ticket, remito o factura"].forEach((name) =>
      expect(screen.getByRole("button", { name: new RegExp(name) })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Sacale una foto a lo que quieras/)).not.toBeInTheDocument();
  });

  it("el producto reconocido por su código de barras vuelve al formulario de salida, ya elegido", async () => {
    const user = userEvent.setup();
    const { irAManual, irASalidaManual } = irA();
    const producto = { id: 4, nombre: "Yerba Mate", marca: "La Merced", categoria: "Almacén", ubicacion: null, vencimiento: null, stock: 3, stock_minimo: null, dias_alerta_vencimiento: null };
    vi.mocked(api.post).mockResolvedValue({ data: doneState(scanResult({ doc_type: "barcode", draft: draft({ codigo_barras: "7791234567890" }) })) });
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/products/filters/options") return { data: OPCIONES };
      if (url === "/me/products/by-barcode/7791234567890/all") return { data: [producto] };
      throw new Error(`GET no mockeado: ${url}`);
    });
    renderWithProviders(<Procesamiento direction="salida" irAManual={irAManual} irASalidaManual={irASalidaManual} />);

    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Leer código" }));
    expect(await screen.findByDisplayValue("7791234567890")).toBeInTheDocument();
    await user.click(screen.getByTestId("existing-search-barcode"));
    await user.click(await screen.findByTestId("existing-option-4"));
    await user.click(screen.getByTestId("existing-confirm"));

    expect(irASalidaManual).toHaveBeenCalledWith({ producto });
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("con la etiqueta se busca el producto y se vuelve al formulario de salida con él elegido", async () => {
    const user = userEvent.setup();
    const { irAManual, irASalidaManual } = irA();
    const producto = { id: 9, nombre: "Yerba Mate 1kg", marca: "La Merced", categoria: "Almacén", ubicacion: null, vencimiento: null, stock: 3, stock_minimo: null, dias_alerta_vencimiento: null };
    vi.mocked(api.post).mockResolvedValue({ data: doneState(scanResult()) });
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/products/filters/options") return { data: OPCIONES };
      if (url === "/me/products/match") return { data: [producto] };
      if (url === "/me/products/suggest") return { data: [] };
      throw new Error(`GET no mockeado: ${url}`);
    });
    renderWithProviders(<Procesamiento direction="salida" irAManual={irAManual} irASalidaManual={irASalidaManual} />);

    await user.click(screen.getByRole("button", { name: /Etiqueta de producto/ }));
    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Leer etiqueta" }));
    await user.click(await screen.findByTestId("existing-edit-confirm"));
    await user.click(await screen.findByTestId("existing-option-9"));
    await user.click(screen.getByTestId("existing-confirm"));

    expect(irASalidaManual).toHaveBeenCalledWith({ producto });
  });
});

describe("Procesamiento · entrada · comprobante", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpcionesGet();
  });

  it("lee un ticket, permite corregir los renglones y confirma el alta", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return {
          data: doneState(
            scanResult({
              doc_type: "receipt",
              draft: null,
              comprobante: { comercio: "Almacén Don Pedro", fecha_compra: "2026-01-01", total: 1500 },
              items: [draft({ nombre: "Fideos", coincidencias: [] })],
            }),
            "receipt",
          ),
        };
      }
      if (url === "/me/products/bulk/commit") {
        return { data: { created: 1, merged: 0, failed: 0, errors: [] } };
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(
      <Procesamiento direction="entrada" irAManual={vi.fn()} irASalidaManual={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /Ticket, remito o factura/ }));
    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Leer comprobante" }));

    expect(await screen.findByText("Almacén Don Pedro")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Fideos")).toBeInTheDocument();

    const categoriaSelect = screen.getByText("Categoría").nextElementSibling as HTMLSelectElement;
    await user.selectOptions(categoriaSelect, "Almacén");

    await user.click(screen.getByRole("button", { name: /Confirmar carga \(1 producto\)/ }));
    expect(await screen.findByText(/1 producto nuevo y 0 actualizados/)).toBeInTheDocument();
  });

  it("si no hay categoría en un renglón incluido, avisa que falta completarla", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return {
          data: doneState(
            scanResult({
              doc_type: "receipt",
              draft: null,
              items: [draft({ nombre: "Fideos", coincidencias: [] })],
            }),
            "receipt",
          ),
        };
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(
      <Procesamiento direction="entrada" irAManual={vi.fn()} irASalidaManual={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /Ticket, remito o factura/ }));
    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Leer comprobante" }));

    expect(
      await screen.findByText("Falta elegir la categoría de un renglón para poder cargarlo."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirmar carga/ })).toBeDisabled();
  });

  it("permite editar cada renglón, desmarcarlo, y avisa si falla la carga masiva", async () => {
    const user = userEvent.setup();
    const unMatch = match();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return {
          data: doneState(
            scanResult({
              doc_type: "receipt",
              draft: null,
              items: [draft({ nombre: "Fideos", marca: "Marca Test", coincidencias: [unMatch], coincidencia_id: null })],
            }),
            "receipt",
          ),
        };
      }
      if (url === "/me/products/bulk/commit") {
        const err: any = new Error("fallo bulk");
        err.response = { data: { detail: "No se pudo cargar el comprobante." } };
        throw err;
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(
      <Procesamiento direction="entrada" irAManual={vi.fn()} irASalidaManual={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /Ticket, remito o factura/ }));
    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Leer comprobante" }));

    await screen.findByDisplayValue("Fideos");

    const categoriaSelect = screen.getByText("Categoría").nextElementSibling as HTMLSelectElement;
    await user.selectOptions(categoriaSelect, "Almacén");

    const codigoInput = screen.getAllByPlaceholderText("Opcional").find((el) => el.getAttribute("inputmode") === "numeric")!;
    await user.type(codigoInput, "789");

    const vencimientoInputs = document.querySelectorAll('input[type="date"]');
    await user.type(vencimientoInputs[0] as HTMLInputElement, "2026-04-01");

    const cantidadInput = screen.getByDisplayValue("1");
    await user.clear(cantidadInput);
    await user.type(cantidadInput, "3");

    await user.click(screen.getByRole("button", { name: /Confirmar carga/ }));
    expect(await screen.findByText("No se pudo cargar el comprobante.")).toBeInTheDocument();

    const checkbox = screen.getByRole("checkbox");
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(screen.getByRole("button", { name: /Confirmar carga \(0 productos\)/ })).toBeDisabled();
  });

  it("sin renglones reconocidos, lo avisa; y se puede descartar y volver a empezar", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return { data: doneState(scanResult({ doc_type: "receipt", draft: null, items: [] }), "receipt") };
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(
      <Procesamiento direction="entrada" irAManual={vi.fn()} irASalidaManual={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /Ticket, remito o factura/ }));
    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Leer comprobante" }));

    expect(
      await screen.findByText(/No se reconoció ningún renglón en esta foto/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Descartar y escanear otro/ }));
    expect(screen.getByRole("button", { name: "Leer comprobante" })).toBeInTheDocument();
  });

  it("al elegir una coincidencia en un renglón, precarga sus datos; y avisa renglones fallidos", async () => {
    const user = userEvent.setup();
    const unMatch = match();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return {
          data: doneState(
            scanResult({
              doc_type: "receipt",
              draft: null,
              items: [draft({ nombre: "Fideos", coincidencias: [unMatch], coincidencia_id: null })],
            }),
            "receipt",
          ),
        };
      }
      if (url === "/me/products/bulk/commit") {
        return { data: { created: 0, merged: 1, failed: 1, errors: ["Fila 2: sin categoría"] } };
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(
      <Procesamiento direction="entrada" irAManual={vi.fn()} irASalidaManual={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /Ticket, remito o factura/ }));
    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Leer comprobante" }));

    await screen.findByText("¿Es alguno de estos?");
    await user.click(screen.getByRole("button", { name: new RegExp(unMatch.nombre) }));
    expect(screen.getByDisplayValue(unMatch.nombre)).toBeInTheDocument();

    const marcaSelect = screen.getByText("Marca").nextElementSibling as HTMLSelectElement;
    await user.selectOptions(marcaSelect, "Marca Test");

    await user.click(screen.getByRole("button", { name: /Confirmar carga/ }));

    expect(await screen.findByText(/0 productos nuevos y 1 actualizado/)).toBeInTheDocument();
    expect(screen.getByText(/1 renglón no se pudo cargar/)).toBeInTheDocument();
    expect(screen.getByText("Fila 2: sin categoría")).toBeInTheDocument();
  });
});

describe("Procesamiento · salida · comprobante", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpcionesGet();
  });

  it("descarga lo identificado y deja ir a carga manual lo que no matchea", async () => {
    const user = userEvent.setup();
    const irASalidaManual = vi.fn();
    const unMatch = match();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return {
          data: doneState(
            scanResult({
              doc_type: "receipt",
              draft: null,
              comprobante: { comercio: "Kiosco", fecha_compra: null, total: null },
              items: [
                draft({ nombre: "Yerba", coincidencias: [unMatch], coincidencia_id: unMatch.id }),
                draft({ nombre: "Producto raro", texto_leido: "Producto raro", coincidencias: [], coincidencia_id: null }),
              ],
            }),
            "receipt",
          ),
        };
      }
      if (url === "/me/products/ocr/salida") {
        return { data: { procesados: 1, fallidos: 0, errores: [] } };
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(
      <Procesamiento direction="salida" irAManual={vi.fn()} irASalidaManual={irASalidaManual} />,
    );
    await user.click(screen.getByRole("button", { name: /Ticket, remito o factura/ }));
    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Leer comprobante" }));

    expect(await screen.findByText(/No se pudo cargar 1 producto/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cargar esta salida a mano" }));
    expect(irASalidaManual).toHaveBeenCalledWith(
      expect.objectContaining({ busqueda: "Producto raro" }),
    );

    await user.click(screen.getByRole("button", { name: /Confirmar salida \(1 producto\)/ }));
    expect(await screen.findByText(/Salió 1 producto por Documento Comercial/)).toBeInTheDocument();
  });

  it("permite destildar un renglón identificado y avisa si falla la confirmación", async () => {
    const user = userEvent.setup();
    const unMatch = match();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return {
          data: doneState(
            scanResult({
              doc_type: "receipt",
              draft: null,
              items: [draft({ nombre: "Yerba", coincidencias: [unMatch], coincidencia_id: unMatch.id })],
            }),
            "receipt",
          ),
        };
      }
      if (url === "/me/products/ocr/salida") {
        const err: any = new Error("fallo");
        err.response = { data: { detail: "No se pudieron registrar las salidas." } };
        throw err;
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(
      <Procesamiento direction="salida" irAManual={vi.fn()} irASalidaManual={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /Ticket, remito o factura/ }));
    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Leer comprobante" }));

    await screen.findByText("Descargar");
    const cantidadInput = screen.getByDisplayValue("1");
    await user.clear(cantidadInput);
    await user.type(cantidadInput, "2");

    await user.click(screen.getByRole("button", { name: /Confirmar salida/ }));
    expect(await screen.findByText("No se pudieron registrar las salidas.")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: /Confirmar salida \(0 productos\)/ })).toBeDisabled();
  });

  it("con varios renglones sin identificar, usa el texto en plural", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return {
          data: doneState(
            scanResult({
              doc_type: "receipt",
              draft: null,
              items: [
                draft({ nombre: "A", texto_leido: "A", coincidencias: [], coincidencia_id: null }),
                draft({ nombre: "B", texto_leido: "B", coincidencias: [], coincidencia_id: null }),
              ],
            }),
            "receipt",
          ),
        };
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(
      <Procesamiento direction="salida" irAManual={vi.fn()} irASalidaManual={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /Ticket, remito o factura/ }));
    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Leer comprobante" }));

    expect(await screen.findByText(/No se pudo cargar 2 productos/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirmar salida/ })).toBeDisabled();
  });
});
