import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import OCR from "./OCR";
import type { OCRAuditEntry, OCRServiceStatus, OCRStats } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { api } from "@/lib/api";

function withinCard(headingText: string | RegExp) {
  const heading = screen.getByText(headingText);
  const card = heading.closest(".rounded-2xl") as HTMLElement;
  return within(card);
}

function serviceStatus(overrides: Partial<OCRServiceStatus> = {}): OCRServiceStatus {
  return {
    available: true,
    checks: {
      checks: { redis: true, engine: false, barcode: true },
      engine_name: "hybrid",
    },
    engines: [
      { name: "tesseract", url: "http://tesseract:8080", available: true, version: "5.3", replicas: [] },
      { name: "paddleocr", url: "http://paddle:8080", available: false, version: "", replicas: ["http://paddle-1:8080", "http://paddle-2:8080"] },
    ],
    ...overrides,
  };
}

function stats(overrides: Partial<OCRStats> = {}): OCRStats {
  return {
    dias: 7,
    ejecuciones: 10,
    exitosas: 8,
    fallidas: 2,
    usuarios: 3,
    ms_promedio: 1200,
    confianza_promedio: 0.82,
    por_tipo: [
      {
        doc_type: "product_label",
        ejecuciones: 6,
        exitosas: 5,
        fallidas: 1,
        ms_promedio: 900,
        ms_maximo: 4000,
        confianza_promedio: 0.79,
      },
    ],
    ...overrides,
  };
}

function auditEntry(overrides: Partial<OCRAuditEntry> = {}): OCRAuditEntry {
  return {
    id: 1,
    job_id: "job-1",
    user_email: "user@test.com",
    user_id: "u1",
    origen: "app",
    doc_type: "product_label",
    engine: "tesseract",
    status: "done",
    confianza: 0.9,
    processing_ms: 850,
    campos: 4,
    resumen: "Yerba Mate 1kg",
    created_at: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

function mockDefaultGets() {
  vi.mocked(api.get).mockImplementation(async (url: string, config?: any) => {
    if (url === "/admin/ocr/status") return { data: serviceStatus() };
    if (url === "/admin/ocr/stats") return { data: stats({ dias: config?.params?.dias ?? 7 }) };
    if (url === "/admin/ocr/audit") return { data: { items: [auditEntry()], total: 1 } };
    throw new Error(`GET no mockeado: ${url}`);
  });
}

describe("OCR · panel de administración", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra el estado del módulo, sus motores y permite refrescar y purgar temporales", async () => {
    const user = userEvent.setup();
    mockDefaultGets();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/admin/ocr/temp/purge") return { data: { purged: 3 } };
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(<OCR />);

    expect(await screen.findByText("Operativo")).toBeInTheDocument();
    expect(screen.getByText("motor por defecto: híbrido")).toBeInTheDocument();
    expect(screen.queryByText(/hybrid/)).not.toBeInTheDocument();
    const estadoCard = withinCard("Estado del módulo");
    expect(estadoCard.getByText("tesseract")).toBeInTheDocument();
    expect(estadoCard.getByText("Disponible")).toBeInTheDocument();
    expect(estadoCard.getByText("Caído")).toBeInTheDocument();
    expect(estadoCard.getByText("2 instancias (se reparten por turno)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Actualizar/ }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/admin/ocr/status"));

    await user.click(screen.getByRole("button", { name: /Limpiar temporales/ }));
    expect(await screen.findByText(/Se borraron 3 imágenes/)).toBeInTheDocument();
  });

  it("cuando el módulo no está disponible, muestra el aviso y no hay motores para listar", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/ocr/status") {
        return { data: serviceStatus({ available: false, engines: [] }) };
      }
      if (url === "/admin/ocr/stats") return { data: stats() };
      if (url === "/admin/ocr/audit") return { data: { items: [], total: 0 } };
      throw new Error(`GET no mockeado: ${url}`);
    });

    renderWithProviders(<OCR />);

    expect(await screen.findByText("No disponible")).toBeInTheDocument();
    expect(
      screen.getByText(/El coordinador no responde o alguno de sus chequeos está en rojo/),
    ).toBeInTheDocument();
    expect(screen.getByText("No se pudo consultar a los motores.")).toBeInTheDocument();
  });

  it("tolera un estado sin detalle de chequeos ni métricas, y muestra los chequeos desconocidos por su nombre", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/ocr/status") {
        return {
          data: serviceStatus({
            checks: { checks: { chequeo_nuevo: true }, engine_name: undefined } as any,
          }),
        };
      }
      if (url === "/admin/ocr/stats") {
        return {
          data: stats({
            ejecuciones: 0,
            exitosas: 0,
            fallidas: 0,
            ms_promedio: null as any,
            confianza_promedio: null as any,
          }),
        };
      }
      if (url === "/admin/ocr/audit") return { data: { items: [], total: 0 } };
      throw new Error(`GET no mockeado: ${url}`);
    });

    renderWithProviders(<OCR />);

    expect(await screen.findByText("chequeo_nuevo")).toBeInTheDocument();
    expect(screen.getByText("motor por defecto: —")).toBeInTheDocument();
    expect(screen.getByText("sin datos")).toBeInTheDocument();
  });

  it("la auditoría formatea tiempos y confianzas de distinta magnitud", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/ocr/status") return { data: serviceStatus() };
      if (url === "/admin/ocr/stats") return { data: stats() };
      if (url === "/admin/ocr/audit") {
        return {
          data: {
            items: [
              auditEntry({ id: 1, resumen: "Lectura rápida", processing_ms: 400, confianza: 0.7 }),
              auditEntry({ id: 2, resumen: "Lectura media", processing_ms: 5000, confianza: 0.3 }),
              auditEntry({ id: 3, resumen: "Lectura lenta", processing_ms: 125000, confianza: null as any, created_at: null as any }),
              auditEntry({ id: 4, resumen: "Sin tiempo", processing_ms: null as any }),
            ],
            total: 4,
          },
        };
      }
      throw new Error(`GET no mockeado: ${url}`);
    });

    renderWithProviders(<OCR />);

    expect(await screen.findByText("Lectura rápida")).toBeInTheDocument();
    expect(screen.getByText("400 ms")).toBeInTheDocument();
    expect(screen.getByText("5.0 s")).toBeInTheDocument();
    expect(screen.getByText("2 min 5 s")).toBeInTheDocument();
  });

  it("cuando limpiar temporales no encuentra nada, lo dice explícitamente", async () => {
    const user = userEvent.setup();
    mockDefaultGets();
    vi.mocked(api.post).mockImplementation(async () => ({ data: { purged: 0 } }));

    renderWithProviders(<OCR />);
    await screen.findByText("Operativo");
    await user.click(screen.getByRole("button", { name: /Limpiar temporales/ }));

    expect(
      await screen.findByText("No había imágenes temporales sin descartar."),
    ).toBeInTheDocument();
  });

  it("muestra las estadísticas por período y permite cambiar el rango de días", async () => {
    const user = userEvent.setup();
    mockDefaultGets();

    renderWithProviders(<OCR />);

    expect(await screen.findAllByText("Ejecuciones")).not.toHaveLength(0);
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("de 3 usuarios")).toBeInTheDocument();
    expect(screen.getByText("80 % terminó bien")).toBeInTheDocument();
    const statsTable = screen.getAllByRole("table")[0];
    expect(within(statsTable).getByText("Etiqueta")).toBeInTheDocument();

    // las mismas opciones que en tendencias y en el dashboard
    const picker = screen.getByTestId("ocr-period-picker");
    [7, 14, 30, 90].forEach((n) => expect(within(picker).getByTestId(`trends-period-${n}`)).toBeInTheDocument());
    expect(within(picker).queryByText("Último día")).not.toBeInTheDocument();
    expect(within(picker).getByTestId("trends-period-7")).toHaveAttribute("aria-pressed", "true");

    await user.click(within(picker).getByTestId("trends-period-90"));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/admin/ocr/stats", { params: { dias: 90 } }),
    );
  });

  it("la tabla de «Cómo viene funcionando» centra todo menos el tipo de documento, y la confianza va a la derecha", async () => {
    mockDefaultGets();
    renderWithProviders(<OCR />);
    await screen.findAllByText("Ejecuciones");

    const tabla = screen.getAllByRole("table")[0];
    const titulos = within(tabla).getAllByRole("columnheader");
    expect(titulos.map((h) => h.textContent)).toEqual([
      "Tipo de documento",
      "Ejecuciones",
      "Fallidas",
      "Tiempo promedio",
      "Peor tiempo",
      "Confianza",
    ]);
    expect(titulos[0].closest("tr")!.className).toContain("text-center");
    expect(titulos[0].className).toContain("text-left");
    titulos.slice(1, 5).forEach((h) => expect(h.className).not.toContain("text-right"));
    expect(titulos[5].className).toContain("text-right");

    const celdas = within(within(tabla).getAllByRole("row")[1]).getAllByRole("cell");
    expect(celdas[0].className).not.toContain("text-center");
    celdas.slice(1, 5).forEach((c) => expect(c.className).toContain("text-center"));
    expect(celdas[5].className).toContain("text-right");
    expect(celdas[5].firstElementChild!.className).toContain("justify-end");
  });

  it("ya no aparece la nota sobre los tiempos y la confianza de las ejecuciones reales", async () => {
    mockDefaultGets();
    renderWithProviders(<OCR />);
    await screen.findAllByText("Ejecuciones");

    expect(screen.queryByText(/Los tiempos y la confianza salen de las ejecuciones reales/)).not.toBeInTheDocument();
    expect(screen.queryByText(/por eso se los mira separados/)).not.toBeInTheDocument();
  });

  it("«Probar el módulo» termina en «La foto no se guarda en ningún lado.», en negrita, y no tiene el renglón de abajo", async () => {
    mockDefaultGets();
    renderWithProviders(<OCR />);
    await screen.findByText("Probar el módulo");

    const tarjeta = withinCard("Probar el módulo");
    const negrita = tarjeta.getByText("La foto no se guarda en ningún lado.");
    expect(negrita.tagName).toBe("STRONG");
    expect(negrita.className).toContain("font-bold");
    expect(negrita.parentElement).toHaveTextContent(
      "Subí una foto y mirá exactamente qué leyó: campo por campo, con su confianza, qué motor ganó y cuánto tardó. La foto no se guarda en ningún lado.",
    );
    expect(screen.queryByText(/Es la forma de averiguar por qué una foto sale mal/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Va directo al/)).not.toBeInTheDocument();
    expect(screen.queryByText(/renglón de auditoría/)).not.toBeInTheDocument();
  });

  it("sin ejecuciones en el período, muestra el estado vacío de la tabla", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/ocr/status") return { data: serviceStatus() };
      if (url === "/admin/ocr/stats") {
        return { data: stats({ ejecuciones: 0, fallidas: 0, por_tipo: [] }) };
      }
      if (url === "/admin/ocr/audit") return { data: { items: [], total: 0 } };
      throw new Error(`GET no mockeado: ${url}`);
    });

    renderWithProviders(<OCR />);
    expect(
      await screen.findByText("Todavía no se ejecutó ningún escaneo en este período."),
    ).toBeInTheDocument();
    expect(screen.getByText("sin datos")).toBeInTheDocument();
  });

  it("el playground escanea una foto, muestra el detalle leído y avisa si falla", async () => {
    const user = userEvent.setup();
    mockDefaultGets();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/admin/ocr/scan") {
        return {
          data: {
            doc_type: "product_label",
            result: {
              fields: { nombre: { value: "Yerba Mate", confidence: 0.95 }, marca: { value: null, confidence: 0 } },
              items: [],
              document_confidence: 0.9,
              needs_review: false,
              engine: "tesseract",
              raw_text: "yerba mate",
              processing_ms: 430,
              rotation: 0,
              attempts: 1,
              warnings: [],
              texto_legible: "yerba mate",
            },
          },
        };
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(<OCR />);
    await screen.findByText("Probar el módulo");

    const file = new File(["foto"], "etiqueta.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/Elegí una foto/), file);
    await user.click(screen.getByRole("button", { name: "Escanear" }));

    expect(await screen.findByText("Lectura confiable")).toBeInTheDocument();
    const playground = withinCard("Probar el módulo");
    expect(playground.getByText("tesseract")).toBeInTheDocument();
    expect(playground.getByText("Yerba Mate")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(screen.getByText(/Elegí una foto/)).toBeInTheDocument();
  });

  it("el playground deshabilita el motor para código de barras y avisa si el escaneo falla", async () => {
    const user = userEvent.setup();
    mockDefaultGets();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/admin/ocr/scan") {
        const err: any = new Error("fallo");
        err.response = { data: { detail: "No se pudo leer el código." } };
        throw err;
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(<OCR />);
    await screen.findByText("Probar el módulo");

    await user.click(screen.getByRole("button", { name: /Código de barras/ }));
    expect(screen.getByText(/no pasa por ningún motor OCR/)).toBeInTheDocument();

    const file = new File(["foto"], "codigo.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/Elegí una foto/), file);
    await user.click(screen.getByRole("button", { name: "Escanear" }));

    expect(await screen.findByText("No se pudo leer el código.")).toBeInTheDocument();
  });

  it("muestra el detalle de un comprobante con sus renglones leídos", async () => {
    const user = userEvent.setup();
    mockDefaultGets();
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === "/admin/ocr/scan") {
        return {
          data: {
            doc_type: "receipt",
            result: {
              fields: {},
              items: [
                {
                  nombre_producto: { value: "Fideos", confidence: 0.8 },
                  cantidad: { value: 2, confidence: 0.7 },
                },
              ],
              document_confidence: 0.75,
              needs_review: true,
              engine: "paddleocr",
              raw_text: "",
              processing_ms: 61234,
              rotation: 90,
              attempts: 3,
              warnings: ["baja iluminación"],
              texto_legible: "",
            },
          },
        };
      }
      throw new Error(`POST no mockeado: ${url}`);
    });

    renderWithProviders(<OCR />);
    await screen.findByText("Probar el módulo");
    await user.click(screen.getByRole("button", { name: /Comprobante/ }));

    const file = new File(["foto"], "ticket.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/Elegí una foto/), file);
    await user.click(screen.getByRole("button", { name: "Escanear" }));

    expect(await screen.findByText("Necesita revisión")).toBeInTheDocument();
    expect(screen.getByText("Fideos")).toBeInTheDocument();
    expect(screen.getByText("Advertencias del procesamiento")).toBeInTheDocument();
    expect(screen.getByText("baja iluminación")).toBeInTheDocument();
    expect(screen.getByText(/giro 90°/)).toBeInTheDocument();
    expect(screen.getByText("(vacío)")).toBeInTheDocument();
  });

  it("la auditoría lista, filtra y pagina los escaneos", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation(async (url: string, config?: any) => {
      if (url === "/admin/ocr/status") return { data: serviceStatus() };
      if (url === "/admin/ocr/stats") return { data: stats() };
      if (url === "/admin/ocr/audit") {
        if (config?.params?.user === "nadie") return { data: { items: [], total: 0 } };
        return {
          data: {
            items: [
              auditEntry(),
              auditEntry({ id: 2, status: "failed", doc_type: "receipt", engine: null, confianza: null, resumen: null }),
            ],
            total: 2,
          },
        };
      }
      throw new Error(`GET no mockeado: ${url}`);
    });

    renderWithProviders(<OCR />);
    expect(await screen.findAllByText("user@test.com")).toHaveLength(2);
    expect(screen.getByText("Comprobante · falló")).toBeInTheDocument();

    const userInput = screen.getByPlaceholderText("Filtrar por usuario");
    await user.type(userInput, "nadie");

    expect(
      await screen.findByText("No hay escaneos registrados con estos filtros."),
    ).toBeInTheDocument();

    await user.clear(userInput);
    await screen.findAllByText("user@test.com");

    const auditCard = within(
      screen.getByText("Auditoría de escaneos").closest("section") as HTMLElement,
    );
    await user.click(auditCard.getByRole("button", { name: "Tipo de escaneo" }));
    await user.click(screen.getByRole("option", { name: "Comprobante" }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/admin/ocr/audit",
        expect.objectContaining({ params: expect.objectContaining({ doc_type: "receipt" }) }),
      ),
    );

    await user.click(auditCard.getByRole("button", { name: "Origen" }));
    await user.click(screen.getByRole("option", { name: "Panel" }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/admin/ocr/audit",
        expect.objectContaining({ params: expect.objectContaining({ origen: "panel" }) }),
      ),
    );
  });

  it("la auditoría tiene las columnas FECHA, USUARIO, ORIGEN y TIPO DE ESCANEO, todas centradas", async () => {
    mockDefaultGets();
    renderWithProviders(<OCR />);
    await screen.findByText("Yerba Mate 1kg");

    const tabla = screen.getAllByRole("table")[1];
    const titulos = within(tabla).getAllByRole("columnheader");
    expect(titulos.map((h) => h.textContent)).toEqual([
      "Fecha",
      "Usuario",
      "Origen",
      "Tipo de escaneo",
      "Motor",
      "Tiempo",
      "Confianza",
      "Lectura del escaneo",
    ]);
    expect(titulos[0].closest("tr")!.className).toContain("text-center");
    expect(titulos[0].closest("tr")!.className).toContain("uppercase");
    // todo centrado, salvo «Lectura del escaneo», que va a la izquierda
    titulos.slice(0, 7).forEach((h) => expect(h.className).not.toMatch(/text-(left|right)/));
    expect(titulos[7].className).toContain("text-left");
    const celdas = within(within(tabla).getAllByRole("row")[1]).getAllByRole("cell");
    expect(celdas[0].closest("tr")!.className).toContain("text-center");
    celdas.slice(0, 7).forEach((c) => expect(c.className).not.toMatch(/text-(left|right)/));
    expect(celdas[7].className).toContain("text-left");
    expect(celdas[7]).toHaveTextContent("Yerba Mate 1kg");
    expect(celdas[1]).toHaveTextContent("user@test.com");
    expect(celdas[1]).not.toHaveTextContent("App");
    expect(celdas[2]).toHaveTextContent("App");
    expect(within(celdas[6]).getByText("90 %").parentElement!.className).toContain("justify-center");
  });

  it("el origen se muestra con la primera letra en mayúscula, y «App» en celeste verdoso", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/ocr/status") return { data: serviceStatus() };
      if (url === "/admin/ocr/stats") return { data: stats() };
      if (url === "/admin/ocr/audit") {
        return { data: { items: [auditEntry({ id: 1, origen: "app" }), auditEntry({ id: 2, origen: "panel" })], total: 2 } };
      }
      throw new Error(`GET no mockeado: ${url}`);
    });
    renderWithProviders(<OCR />);
    const app = await screen.findByTestId("origen-app");

    expect(app).toHaveTextContent("App");
    expect(app.className).toContain("bg-[#CDEFF0]");
    const panel = screen.getByText("Panel");
    expect(panel).toBeInTheDocument();
    expect(panel.className).not.toContain("bg-[#CDEFF0]");
    expect(screen.queryByText("panel")).not.toBeInTheDocument();
    expect(screen.queryByText("app")).not.toBeInTheDocument();
  });

  it("la descripción de la auditoría termina en «el resumen viene recortado.»", async () => {
    mockDefaultGets();
    renderWithProviders(<OCR />);
    await screen.findByText("Auditoría de escaneos");

    expect(
      screen.getByText(
        "Un renglón por ejecución, con quién la pidió y qué salió. Es lo único que queda de cada escaneo: las fotos se descartan apenas termina el procesamiento, así que el resumen viene recortado.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/alcanza para reconocer de qué lectura se trata/)).not.toBeInTheDocument();
  });

  it("el buscador y los dos filtros de la auditoría ocupan todo el ancho de la lista", async () => {
    mockDefaultGets();
    renderWithProviders(<OCR />);
    await screen.findByText("Yerba Mate 1kg");

    const filtros = screen.getByTestId("ocr-audit-filters");
    const buscador = within(filtros).getByPlaceholderText("Filtrar por usuario");
    expect(buscador.className).toContain("flex-1");
    // el buscador se estira y los desplegables son anchos (w-64), sin dejar espacio vacío a la derecha
    expect(buscador.className).toContain("basis-64");
    const [tipo, origen] = within(filtros).getAllByRole("button");
    expect(tipo.parentElement!.parentElement!.className).toContain("sm:w-64");
    expect(origen.parentElement!.parentElement!.className).toContain("sm:w-64");
    expect(filtros.lastElementChild).toBe(origen.parentElement!.parentElement);
  });

  it("la auditoría pide 10 por página y los muestra todos juntos, sin desplazarse", async () => {
    const entradas = Array.from({ length: 10 }, (_, i) => auditEntry({ id: i + 1, resumen: `Lectura ${i + 1}` }));
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/ocr/status") return { data: serviceStatus() };
      if (url === "/admin/ocr/stats") return { data: stats() };
      if (url === "/admin/ocr/audit") return { data: { items: entradas, total: 25 } };
      throw new Error(`GET no mockeado: ${url}`);
    });
    renderWithProviders(<OCR />);
    await screen.findByText("Lectura 1");

    expect(api.get).toHaveBeenCalledWith("/admin/ocr/audit", { params: { limit: 10, offset: 0 } });
    const lista = screen.getByTestId("ocr-audit-list");
    expect(within(lista).getAllByRole("row")).toHaveLength(11); // los títulos y los 10 escaneos
    expect(lista.className).not.toContain("max-h");
    expect(lista.className).not.toContain("overflow-y");
    expect(lista.className).not.toContain("overflow-auto");
    // con la paginación de siempre, como las demás listas
    expect(screen.getByText(/1–10 de 25|1-10 de 25|de 25/)).toBeInTheDocument();
  });

  it("la foto que se adjunta para escanear se puede ampliar con un clic, y se cierra", async () => {
    const user = userEvent.setup();
    mockDefaultGets();
    const crear = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:foto");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    renderWithProviders(<OCR />);
    await screen.findByText("Probar el módulo");
    expect(screen.queryByRole("button", { name: "Ampliar la foto a escanear" })).not.toBeInTheDocument();

    await user.upload(screen.getByLabelText(/Elegí una foto/), new File(["foto"], "etiqueta.png", { type: "image/png" }));
    const ampliar = await screen.findByRole("button", { name: "Ampliar la foto a escanear" });
    expect(ampliar.className).toContain("cursor-zoom-in");
    expect(crear).toHaveBeenCalled();

    await user.click(ampliar);

    const visor = screen.getAllByAltText("Foto a escanear");
    expect(visor.length).toBe(2); // la miniatura y la imagen grande
    expect(visor.some((img) => img.getAttribute("src") === "blob:foto")).toBe(true);
    await user.keyboard("{Escape}");
    expect(screen.getAllByAltText("Foto a escanear")).toHaveLength(1);
  });

  it("permite elegir un motor específico en el playground", async () => {
    const user = userEvent.setup();
    mockDefaultGets();
    vi.mocked(api.post).mockResolvedValue({
      data: {
        doc_type: "product_label",
        result: {
          fields: {},
          items: [],
          document_confidence: 0.9,
          needs_review: false,
          engine: "paddleocr",
          raw_text: "",
          processing_ms: 100,
          rotation: 0,
          attempts: 1,
          warnings: [],
          texto_legible: "",
        },
      },
    });

    renderWithProviders(<OCR />);
    await screen.findByText("Probar el módulo");

    const motorSelect = screen.getByDisplayValue("El configurado (híbrido)");
    await user.selectOptions(motorSelect, "paddleocr");

    await user.upload(screen.getByLabelText(/Elegí una foto/), new File(["x"], "e.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "Escanear" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/admin/ocr/scan",
        expect.any(FormData),
        expect.anything(),
      ),
    );
  });
});
