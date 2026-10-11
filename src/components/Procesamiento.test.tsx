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

describe("Procesamiento · entrada · imagen del producto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpcionesGet();
  });

  it("sube la foto, arma el borrador y confirma la carga de un producto nuevo", async () => {
    const user = userEvent.setup();
    const { irAManual, irASalidaManual } = irA();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") return { data: doneState(scanResult()) };
      if (url === "/me/products") return { data: { merged: false, nombre: "Yerba Mate" } };
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(
      <Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={irASalidaManual} />,
    );

    const [fotoProducto] = screen.getAllByLabelText("Elegí una foto");
    await user.upload(fotoProducto, png());
    await user.click(screen.getByRole("button", { name: "Procesar fotos" }));

    expect(await screen.findByDisplayValue("Yerba Mate")).toBeInTheDocument();
    expect(
      screen.getByText(/No encontramos ningún producto tuyo parecido/),
    ).toBeInTheDocument();

    const categoriaSelect = screen.getByText("Categoría").nextElementSibling as HTMLSelectElement;
    await user.selectOptions(categoriaSelect, "Almacén");

    await user.click(screen.getByRole("button", { name: "Confirmar carga" }));

    expect(await screen.findByText(/quedó cargado con 1 unidad/)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith(
      "/me/products",
      expect.objectContaining({ nombre: "Yerba Mate", categoria: "Almacén", stock: 1 }),
    );

    await user.click(screen.getByRole("button", { name: /Escanear otra foto/ }));
    expect(screen.getAllByLabelText("Elegí una foto").length).toBeGreaterThan(0);
  });

  it("al elegir una coincidencia existente, precarga sus datos y al confirmar suma stock", async () => {
    const user = userEvent.setup();
    const { irAManual, irASalidaManual } = irA();
    const unMatch = match();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return { data: doneState(scanResult({ draft: draft({ coincidencias: [unMatch] }) })) };
      }
      if (url === "/me/products") return { data: { merged: true, nombre: unMatch.nombre } };
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(
      <Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={irASalidaManual} />,
    );

    const [fotoProducto] = screen.getAllByLabelText("Elegí una foto");
    await user.upload(fotoProducto, png());
    await user.click(screen.getByRole("button", { name: "Procesar fotos" }));

    await screen.findByText("¿Es alguno de estos?");
    await user.click(screen.getByRole("button", { name: new RegExp(unMatch.nombre) }));

    expect(screen.getByDisplayValue(unMatch.nombre)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar carga" }));

    expect(await screen.findByText(/ya tenías cargado/)).toBeInTheDocument();
  });

  it("muestra un aviso cuando falla la lectura de vencimiento o código, sin bloquear el alta", async () => {
    const user = userEvent.setup();
    const { irAManual, irASalidaManual } = irA();
    vi.mocked(api.post).mockImplementation((async (url: string, form: FormData) => {
      if (url === "/me/products/ocr/scan") {
        const tipo = form.get("doc_type");
        if (tipo === "product_label") return { data: doneState(scanResult()) };
        if (tipo === "expiry_date") {
          const err: any = new Error("fallo");
          err.response = { status: 503 };
          throw err;
        }
      }
      throw new Error(`POST no mockeado: ${url}`);
    }) as never);

    renderWithProviders(
      <Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={irASalidaManual} />,
    );

    const [fotoProducto, fotoVencimiento] = screen.getAllByLabelText("Elegí una foto");
    await user.upload(fotoProducto, png());
    await user.upload(fotoVencimiento, png());
    await user.click(screen.getByRole("button", { name: "Procesar fotos" }));

    expect(await screen.findByText(/No se pudo leer la fecha de vencimiento/)).toBeInTheDocument();
  });

  it("con el módulo caído (502/503/504) muestra un único mensaje de no disponibilidad", async () => {
    const user = userEvent.setup();
    const { irAManual, irASalidaManual } = irA();
    vi.mocked(api.post).mockImplementation(async () => {
      const err: any = new Error("fallo de red");
      err.response = { status: 502 };
      throw err;
    });

    renderWithProviders(
      <Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={irASalidaManual} />,
    );

    const [fotoProducto] = screen.getAllByLabelText("Elegí una foto");
    await user.upload(fotoProducto, png());
    await user.click(screen.getByRole("button", { name: "Procesar fotos" }));

    expect(
      await screen.findByText(/El módulo de OCR no está disponible en este momento/),
    ).toBeInTheDocument();
  });

  it("con un 429 agrega cuánto falta para reintentar, según el header retry-after", async () => {
    const user = userEvent.setup();
    const { irAManual, irASalidaManual } = irA();
    vi.mocked(api.post).mockImplementation(async () => {
      const err: any = new Error("rate limit");
      err.response = {
        status: 429,
        data: { detail: "Superaste el límite de escaneos." },
        headers: { "retry-after": "90" },
      };
      throw err;
    });

    renderWithProviders(
      <Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={irASalidaManual} />,
    );

    const [fotoProducto] = screen.getAllByLabelText("Elegí una foto");
    await user.upload(fotoProducto, png());
    await user.click(screen.getByRole("button", { name: "Procesar fotos" }));

    expect(
      await screen.findByText(/Superaste el límite de escaneos\. Podés volver a intentar en 2 min\./),
    ).toBeInTheDocument();
  });

  it("hace polling del job asíncrono hasta que termina", async () => {
    const user = userEvent.setup();
    const { irAManual, irASalidaManual } = irA();
    let consultas = 0;
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return {
          data: {
            job_id: "job-1",
            status: "queued",
            doc_type: "product_label",
            result: null,
            error: null,
            queue_position: 2,
            estimated_wait_seconds: 5,
          } as ScanState,
        };
      }
      throw new Error(`POST no mockeado: ${url}`);
    });
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/me/products/filters/options") return { data: OPCIONES };
      if (url === "/me/products/ocr/scan/job-1") {
        consultas += 1;
        if (consultas < 2) {
          return {
            data: {
              job_id: "job-1",
              status: "processing",
              doc_type: "product_label",
              result: null,
              error: null,
              queue_position: 1,
              estimated_wait_seconds: 2,
            } as ScanState,
          };
        }
        return { data: doneState(scanResult()) };
      }
      throw new Error(`GET no mockeado: ${url}`);
    });

    renderWithProviders(
      <Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={irASalidaManual} />,
    );

    const [fotoProducto] = screen.getAllByLabelText("Elegí una foto");
    await user.upload(fotoProducto, png());
    await user.click(screen.getByRole("button", { name: "Procesar fotos" }));

    expect(await screen.findByText(/procesando…|en la fila/)).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Yerba Mate", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(consultas).toBeGreaterThanOrEqual(2);
  }, 10000);

  it("si se pierde el seguimiento del escaneo, informa el error", async () => {
    const user = userEvent.setup();
    const { irAManual, irASalidaManual } = irA();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return {
          data: {
            job_id: "job-x",
            status: "queued",
            doc_type: "product_label",
            result: null,
            error: null,
            queue_position: null,
            estimated_wait_seconds: null,
          } as ScanState,
        };
      }
      throw new Error(`POST no mockeado: ${url}`);
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

    renderWithProviders(
      <Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={irASalidaManual} />,
    );

    const [fotoProducto] = screen.getAllByLabelText("Elegí una foto");
    await user.upload(fotoProducto, png());
    await user.click(screen.getByRole("button", { name: "Procesar fotos" }));

    expect(
      await screen.findByText(/Se perdió el seguimiento del escaneo/, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  }, 10000);

  it("avisa cuando la lectura necesita revisión y permite editar todos los campos antes de confirmar", async () => {
    const user = userEvent.setup();
    const { irAManual, irASalidaManual } = irA();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return { data: doneState(scanResult({ needs_review: true, confianza: 0.4 })) };
      }
      if (url === "/me/products") {
        const err: any = new Error("fallo al cargar");
        err.response = { data: { detail: "No se pudo cargar el producto." } };
        throw err;
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(
      <Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={irASalidaManual} />,
    );

    await user.upload(screen.getAllByLabelText("Elegí una foto")[0], png());

    // Antes de procesar, "Quitar" descarta la foto elegida (botón de FotoInput);
    // el input vuelve a aparecer como un nodo nuevo, así que hay que reconsultarlo.
    expect(await screen.findAllByRole("button", { name: "Quitar" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Quitar" }));
    expect(screen.queryByRole("button", { name: "Quitar" })).not.toBeInTheDocument();
    await user.upload(screen.getAllByLabelText("Elegí una foto")[0], png());

    await user.click(screen.getByRole("button", { name: "Procesar fotos" }));

    await screen.findByDisplayValue("Yerba Mate");
    expect(screen.getByText(/revisá los campos antes de confirmar/)).toBeInTheDocument();

    const categoriaSelect = screen.getByText("Categoría").nextElementSibling as HTMLSelectElement;
    await user.selectOptions(categoriaSelect, "Almacén");
    const ubicacionSelect = screen.getByText("Ubicación").nextElementSibling as HTMLSelectElement;
    await user.selectOptions(ubicacionSelect, "Alacena");
    const marcaSelect = screen.getByText("Marca").nextElementSibling as HTMLSelectElement;
    await user.selectOptions(marcaSelect, "Marca Test");

    const codigoInput = screen.getByPlaceholderText("Sin código");
    await user.type(codigoInput, "abc789 123");
    expect((codigoInput as HTMLInputElement).value).toBe("789 123");

    const vencimientoLabel = screen.getByText("Vencimiento");
    const vencimientoInput = vencimientoLabel.nextElementSibling as HTMLInputElement;
    await user.type(vencimientoInput, "2026-05-01");

    const descripcionLabel = screen.getByText("Descripción");
    const descripcionInput = descripcionLabel.nextElementSibling as HTMLTextAreaElement;
    await user.type(descripcionInput, "Notas");

    await user.click(screen.getByRole("button", { name: "Confirmar carga" }));

    expect(await screen.findByText("No se pudo cargar el producto.")).toBeInTheDocument();
  });
});

describe("Procesamiento · entrada · código de barras", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpcionesGet();
  });

  async function irAModoCodigo(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /Código de barras/ }));
  }

  it("con una coincidencia, suma stock al producto encontrado", async () => {
    const user = userEvent.setup();
    const { irAManual, irASalidaManual } = irA();
    const unMatch = match();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return {
          data: doneState(
            scanResult({
              doc_type: "barcode",
              draft: draft({ codigo_barras: unMatch.codigo_barras, coincidencias: [unMatch], coincidencia_id: unMatch.id }),
            }),
            "barcode",
          ),
        };
      }
      if (url === "/me/products") return { data: { merged: true, nombre: unMatch.nombre } };
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(
      <Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={irASalidaManual} />,
    );
    await irAModoCodigo(user);

    const foto = screen.getByLabelText("Elegí una foto");
    await user.upload(foto, png());
    await user.click(screen.getByRole("button", { name: "Leer código" }));

    expect(await screen.findByText(unMatch.codigo_barras!)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar entrada" }));

    expect(await screen.findByText(/Se sumó 1 unidad/)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith(
      "/me/products",
      expect.objectContaining({ codigo_barras: unMatch.codigo_barras }),
    );
  });

  it("con varios lotes del mismo código, deja elegir de cuál se trata", async () => {
    const user = userEvent.setup();
    const { irAManual, irASalidaManual } = irA();
    const loteA = match({ id: 1, nombre: "Lote A", vencimiento: "2026-01-01" });
    const loteB = match({ id: 2, nombre: "Lote B", vencimiento: "2026-06-01" });
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return {
          data: doneState(
            scanResult({
              doc_type: "barcode",
              draft: draft({ codigo_barras: "7790000000001", coincidencias: [loteA, loteB], coincidencia_id: loteA.id }),
            }),
            "barcode",
          ),
        };
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(
      <Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={irASalidaManual} />,
    );
    await irAModoCodigo(user);
    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Leer código" }));

    expect(
      await screen.findByText(
        (_, node) => node?.tagName === "P" && /Tenés\s*2\s*lotes/.test(node.textContent ?? ""),
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Lote B/ }));
    expect(screen.getByRole("button", { name: /Lote B/ })).toHaveClass("border-primary");
  });

  it("sin coincidencias, ofrece cargarlo como producto nuevo con ese código", async () => {
    const user = userEvent.setup();
    const irAManual = vi.fn();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return {
          data: doneState(
            scanResult({
              doc_type: "barcode",
              draft: draft({ codigo_barras: "7790000000002", coincidencias: [], coincidencia_id: null }),
            }),
            "barcode",
          ),
        };
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(
      <Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={vi.fn()} />,
    );
    await irAModoCodigo(user);
    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Leer código" }));

    await user.click(await screen.findByRole("button", { name: "Cargar producto nuevo con este código" }));
    expect(irAManual).toHaveBeenCalledWith({ codigo_barras: "7790000000002" });
  });

  it("muestra el país de registro, deja ir a carga manual por otra fecha y avisa si falla el alta", async () => {
    const user = userEvent.setup();
    const irAManual = vi.fn();
    const unMatch = match();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return {
          data: doneState(
            scanResult({
              doc_type: "barcode",
              draft: draft({
                codigo_barras: unMatch.codigo_barras,
                pais_registro: "Argentina",
                coincidencias: [unMatch],
                coincidencia_id: unMatch.id,
              }),
            }),
            "barcode",
          ),
        };
      }
      if (url === "/me/products") {
        const err: any = new Error("fallo");
        throw err;
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(
      <Procesamiento direction="entrada" irAManual={irAManual} irASalidaManual={vi.fn()} />,
    );
    await irAModoCodigo(user);
    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Leer código" }));

    expect(await screen.findByText("Registrado en Argentina")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Vence en otra fecha/ }));
    expect(irAManual).toHaveBeenCalledWith(
      expect.objectContaining({ codigo_barras: unMatch.codigo_barras, nombre: unMatch.nombre }),
    );

    await user.click(screen.getByRole("button", { name: "Confirmar entrada" }));
    expect(await screen.findByText("No se pudo cargar el stock.")).toBeInTheDocument();
  });

  it("reinicia el flujo al terminar y permite leer otro código", async () => {
    const user = userEvent.setup();
    const unMatch = match();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return {
          data: doneState(
            scanResult({
              doc_type: "barcode",
              draft: draft({ codigo_barras: unMatch.codigo_barras, coincidencias: [unMatch], coincidencia_id: unMatch.id }),
            }),
            "barcode",
          ),
        };
      }
      if (url === "/me/products") return { data: { merged: true, nombre: unMatch.nombre } };
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(
      <Procesamiento direction="entrada" irAManual={vi.fn()} irASalidaManual={vi.fn()} />,
    );
    await irAModoCodigo(user);
    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Leer código" }));
    await screen.findByText("Confirmar entrada");
    await user.click(screen.getByRole("button", { name: "Confirmar entrada" }));

    await screen.findByText(/Se sumó 1 unidad/);
    await user.click(screen.getByRole("button", { name: /Escanear otra foto/ }));

    expect(screen.getByLabelText("Elegí una foto")).toBeInTheDocument();
  });

  it("si falla el envío de la foto, ErrorScan muestra el mensaje genérico", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("network down"));

    renderWithProviders(
      <Procesamiento direction="entrada" irAManual={vi.fn()} irASalidaManual={vi.fn()} />,
    );
    await irAModoCodigo(user);
    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Leer código" }));

    expect(
      await screen.findByText("No se pudo enviar la foto al módulo de OCR."),
    ).toBeInTheDocument();
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

    const codigoInput = screen.getByPlaceholderText("Sin código");
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

describe("Procesamiento · salida · código de barras", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpcionesGet();
  });

  it("descuenta stock del producto encontrado", async () => {
    const user = userEvent.setup();
    const unMatch = match({ stock: 5 });
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return {
          data: doneState(
            scanResult({
              doc_type: "barcode",
              draft: draft({ codigo_barras: unMatch.codigo_barras, coincidencias: [unMatch], coincidencia_id: unMatch.id }),
            }),
            "barcode",
          ),
        };
      }
      if (url === "/me/products/salida") return { data: { nombre: unMatch.nombre, stock: 4 } };
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(
      <Procesamiento direction="salida" irAManual={vi.fn()} irASalidaManual={vi.fn()} />,
    );
    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Leer código" }));

    await screen.findByText(unMatch.codigo_barras!);
    await user.click(screen.getByRole("button", { name: "Confirmar salida" }));

    expect(await screen.findByText(/Quedan 4/)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith(
      "/me/products/salida",
      expect.objectContaining({ product_id: unMatch.id, event_type: "consumed" }),
    );
  });

  it("sin coincidencias, avisa que no hay nada para descontar", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return {
          data: doneState(
            scanResult({
              doc_type: "barcode",
              draft: draft({ codigo_barras: "7790000000009", coincidencias: [], coincidencia_id: null }),
            }),
            "barcode",
          ),
        };
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(
      <Procesamiento direction="salida" irAManual={vi.fn()} irASalidaManual={vi.fn()} />,
    );
    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Leer código" }));

    expect(
      await screen.findByText(/no hay nada que descargar/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Leer otro código" }));
    expect(screen.getByLabelText("Elegí una foto")).toBeInTheDocument();
  });

  it("avisa si falla la salida, cambia el motivo y reinicia luego de confirmar", async () => {
    const user = userEvent.setup();
    const unMatch = match({ stock: 5 });
    let intentos = 0;
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/me/products/ocr/scan") {
        return {
          data: doneState(
            scanResult({
              doc_type: "barcode",
              draft: draft({ codigo_barras: unMatch.codigo_barras, coincidencias: [unMatch], coincidencia_id: unMatch.id }),
            }),
            "barcode",
          ),
        };
      }
      if (url === "/me/products/salida") {
        intentos += 1;
        if (intentos === 1) {
          const err: any = new Error("fallo");
          err.response = { data: { detail: "No se pudo registrar la salida." } };
          throw err;
        }
        return { data: { nombre: unMatch.nombre, stock: 3 } };
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(
      <Procesamiento direction="salida" irAManual={vi.fn()} irASalidaManual={vi.fn()} />,
    );
    await user.upload(screen.getByLabelText("Elegí una foto"), png());
    await user.click(screen.getByRole("button", { name: "Leer código" }));
    await screen.findByText(unMatch.codigo_barras!);

    const motivoSelect = screen.getByText("Motivo").nextElementSibling as HTMLSelectElement;
    await user.selectOptions(motivoSelect, "expired");

    await user.click(screen.getByRole("button", { name: "Confirmar salida" }));
    expect(await screen.findByText("No se pudo registrar la salida.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar salida" }));
    await screen.findByText(/Quedan 3/);

    await user.click(screen.getByRole("button", { name: /Escanear otra foto/ }));
    expect(screen.getByLabelText("Elegí una foto")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith(
      "/me/products/salida",
      expect.objectContaining({ event_type: "expired" }),
    );
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
