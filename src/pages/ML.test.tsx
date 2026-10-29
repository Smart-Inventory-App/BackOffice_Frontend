import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import ML from "./ML";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { api } from "@/lib/api";

function version(overrides: Record<string, any> = {}) {
  return {
    id: "v1",
    model_type: "gbm",
    data_source: "real",
    segment: "individuo",
    trained_at: "2026-01-01T00:00:00Z",
    mae: 1.234,
    mape: 12.5,
    n_samples: 100,
    n_products: 20,
    status: "active",
    model_file: "v1.pkl",
    ...overrides,
  };
}

describe("ML", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra el estado vacío cuando no hay modelos entrenados", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    renderWithProviders(<ML />);
    expect(await screen.findByText("Aún no hay modelos entrenados.")).toBeInTheDocument();
  });

  it("la tabla muestra absolutamente todas las versiones, sin importar lo que se elige para entrenar", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({
      data: [
        version({ id: "v1" }),
        version({ id: "v2", model_type: "xgboost", status: "inactive" }),
        version({ id: "v3", model_type: "svr", segment: "comercio", data_source: "test", status: "rejected" }),
      ],
    });
    renderWithProviders(<ML />);

    for (const id of ["v1", "v2", "v3"]) expect(await screen.findByText(id)).toBeInTheDocument();
    expect(screen.getByTestId("versions-count")).toHaveTextContent("3 versiones");

    // cambiar el algoritmo, el segmento o la fuente de datos de «Entrenar» no oculta ninguna
    await user.click(screen.getByRole("button", { name: "LightGBM" }));
    await user.click(screen.getByRole("button", { name: "Comercios" }));
    await user.click(screen.getByRole("button", { name: "Dataset de prueba" }));
    for (const id of ["v1", "v2", "v3"]) expect(screen.getByText(id)).toBeInTheDocument();
    expect(screen.queryByText(/No hay versiones de/)).not.toBeInTheDocument();
  });

  it("las columnas van en mayúscula y centradas: FECHA a la derecha de VERSIÓN, SEGMENTO y FUENTE DE DATOS a la derecha de MODELO, y MUESTRAS y PRODUCTOS después", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [version({ id: "v1" })] });
    renderWithProviders(<ML />);
    await screen.findByText("v1");

    const titulos = screen.getAllByRole("columnheader");
    expect(titulos.map((h) => h.textContent)).toEqual([
      "Versión",
      "Fecha",
      "Modelo",
      "Segmento",
      "Fuente de datos",
      "Muestras",
      "Productos",
      "MAE (u/sem)",
      "MAE rel.",
      "MAPE",
      "Estado",
      "Acción",
    ]);
    expect(titulos[0].closest("tr")!.className).toContain("uppercase");
    expect(titulos[0].closest("table")!.className).toContain("text-center");
    titulos.forEach((h) => expect(h.className).not.toContain("text-left"));
  });

  it("cada versión muestra su segmento y su fuente de datos, y los que faltan se toman como individuos y datos reales", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        version({ id: "v1", segment: undefined, data_source: undefined }),
        version({ id: "v2", segment: "comercio", data_source: "test" }),
      ],
    });
    renderWithProviders(<ML />);
    await screen.findByText("v1");

    const filas = screen.getAllByRole("row");
    const v1 = within(filas.find((r) => within(r).queryByText("v1"))!).getAllByRole("cell").map((c) => c.textContent);
    expect(v1[0]).toBe("v1");
    expect(v1.slice(2, 7)).toEqual(["GBM", "Individuos", "Datos reales", "100", "20"]);
    const v2 = within(filas.find((r) => within(r).queryByText("v2"))!).getAllByRole("cell").map((c) => c.textContent);
    expect(v2.slice(2, 7)).toEqual(["GBM", "Comercios", "Dataset de prueba", "100", "20"]);
  });

  it("las versiones salen de la más nueva a la más vieja y el contenido de las celdas está centrado", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [version({ id: "v1" }), version({ id: "v2" })] });
    renderWithProviders(<ML />);
    await screen.findByText("v1");

    const ids = screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent);
    expect(ids).toEqual(["v2", "v1"]);
    // las barras de porcentaje y los botones de acción también van centrados
    expect(screen.getAllByText("12.5%")[0].parentElement!.className).toContain("justify-center");
    expect(screen.getAllByRole("button", { name: /Features/ })[0].parentElement!.className).toContain("justify-center");
  });

  it("los botones miden lo mismo dentro de su grupo: los de segmento, más ajustados; los de algoritmo, todavía más", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    renderWithProviders(<ML />);
    await screen.findByText("Aún no hay modelos entrenados.");

    const botones = within(screen.getByTestId("train-options")).getAllByRole("button");
    expect(botones.map((b) => b.textContent)).toEqual([
      "Individuos",
      "Comercios",
      "GBM",
      "XGBoost",
      "LightGBM",
      "SVR",
      "Datos reales",
      "Dataset de prueba",
    ]);
    const ancho = (nombre: string) => screen.getByRole("button", { name: nombre }).className;
    ["Individuos", "Comercios"].forEach((n) => expect(ancho(n)).toContain("w-28"));
    ["GBM", "XGBoost", "LightGBM", "SVR"].forEach((n) => expect(ancho(n)).toContain("w-24"));
    ["Datos reales", "Dataset de prueba"].forEach((n) => expect(ancho(n)).toContain("w-40"));
  });

  it("el segmento elegido se ve en azul y los otros selectores, en el color de siempre", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    renderWithProviders(<ML />);
    await screen.findByText("Aún no hay modelos entrenados.");

    const individuos = screen.getByRole("button", { name: "Individuos" });
    expect(individuos.className).toContain("bg-[#1B3A8F]");
    expect(screen.getByRole("button", { name: "Comercios" }).className).not.toContain("bg-[#1B3A8F]");
    await user.click(screen.getByRole("button", { name: "Comercios" }));
    expect(screen.getByRole("button", { name: "Comercios" }).className).toContain("bg-[#1B3A8F]");
    expect(screen.getByRole("button", { name: "Individuos" }).className).not.toContain("bg-[#1B3A8F]");
    // el algoritmo y la fuente de datos siguen con el color principal
    expect(screen.getByRole("button", { name: "GBM" }).className).toContain("bg-primary");
    expect(screen.getByRole("button", { name: "Datos reales" }).className).toContain("bg-primary");
  });

  it("el botón «Activar» mide lo mismo que el botón «Features»", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [version({ id: "v-inactive", status: "inactive" })] });
    renderWithProviders(<ML />);
    await screen.findByText("v-inactive");

    const activar = screen.getByRole("button", { name: /Activar/ });
    const features = screen.getByRole("button", { name: /Features/ });
    for (const boton of [activar, features]) {
      expect(boton.className).toContain("w-24");
      expect(boton.className).toContain("px-2");
      expect(boton.className).toContain("py-1.5");
    }
  });

  it("un modelo activo no tiene botón de activar ni de desactivar", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [version({ id: "v-active", status: "active" })] });
    renderWithProviders(<ML />);
    await screen.findByText("v-active");

    expect(screen.queryByRole("button", { name: /Activar|Desactivar/ })).not.toBeInTheDocument();
  });

  it("los selectores de «Entrenar nuevo modelo» van en una fila, separados por líneas grises tenues", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    renderWithProviders(<ML />);
    await screen.findByText("Aún no hay modelos entrenados.");

    const opciones = screen.getByTestId("train-options");
    // las tres secciones (segmento, algoritmo y fuente de datos) ocupan exactamente el mismo ancho...
    expect(opciones.className).toContain("lg:grid-cols-3");
    expect(opciones.className).not.toContain("fr_");
    // ...y «Fuente de datos» tiene el mismo margen izquierdo que «Algoritmo»
    expect(opciones.lastElementChild!.className).toContain("lg:pl-5");
    expect(opciones.children[1].className).toContain("lg:px-5");
    expect(opciones.className).toContain("lg:divide-x");
    expect(opciones.className).toContain("divide-line/60");
    expect(Array.from(opciones.children)).toHaveLength(3);
    expect(opciones.textContent).toMatch(/Segmento.*Algoritmo.*Fuente de datos/);
  });

  it("«Iniciar entrenamiento» está a la derecha del título y la descripción, y no ocupa una columna de las opciones", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    renderWithProviders(<ML />);
    await screen.findByText("Aún no hay modelos entrenados.");

    const encabezado = screen.getByTestId("train-header");
    const boton = screen.getByRole("button", { name: /Iniciar entrenamiento/ });
    expect(encabezado).toContainElement(boton);
    expect(encabezado.firstElementChild).toContainElement(screen.getByText("Entrenar nuevo modelo"));
    expect(encabezado.firstElementChild).toHaveTextContent("Toma todos los eventos de consumo");
    expect(encabezado.lastElementChild).toBe(boton);
    expect(encabezado.className).toContain("sm:justify-between");
    // las opciones van aparte, a todo el ancho de la tarjeta
    const opciones = screen.getByTestId("train-options");
    expect(opciones).not.toContainElement(boton);
    expect(encabezado.parentElement).toBe(opciones.parentElement);
    expect(encabezado.compareDocumentPosition(opciones) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("la descripción del dataset de prueba dice «Dataset simulado de escala comercial reproducible»", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    renderWithProviders(<ML />);
    await screen.findByText("Aún no hay modelos entrenados.");

    await user.click(screen.getByRole("button", { name: "Comercios" }));
    await user.click(screen.getByRole("button", { name: "Dataset de prueba" }));

    expect(screen.getByText("Dataset simulado de escala comercial reproducible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dataset de prueba" })).toHaveAttribute(
      "title",
      "Dataset simulado de escala comercial reproducible",
    );
  });

  it("«Lanzar predicciones a usuarios» está encima de «Entrenar nuevo modelo»", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    renderWithProviders(<ML />);
    await screen.findByText("Aún no hay modelos entrenados.");

    const lanzar = screen.getByText("Lanzar predicciones a usuarios");
    const entrenar = screen.getByText("Entrenar nuevo modelo");
    expect(lanzar.compareDocumentPosition(entrenar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("con segmento comercio y dataset de prueba, deshabilita entrenar para individuos", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    renderWithProviders(<ML />);
    await screen.findByText("Aún no hay modelos entrenados.");

    await user.click(screen.getByRole("button", { name: "Dataset de prueba" }));
    expect(screen.getByText("El dataset de prueba es de escala comercial reproducible SOLO PARA COMERCIOS")).toBeInTheDocument();
    expect(screen.queryByText(/no hay equivalente para individuos/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Iniciar entrenamiento/ })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Comercios" }));
    expect(screen.getByRole("button", { name: /Iniciar entrenamiento/ })).not.toBeDisabled();
    expect(screen.getByText("MAE relativo máx")).toBeInTheDocument();
  });

  it("entrena un modelo y muestra el resultado guardado, o el rechazo", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { status: "saved", version: { id: "v2", mae: 1.1, mape: 10 }, model_type: "gbm" },
    });

    renderWithProviders(<ML />);
    await screen.findByText("Aún no hay modelos entrenados.");
    await user.click(screen.getByRole("button", { name: /Iniciar entrenamiento/ }));

    expect(await screen.findByText(/guardado — MAE:/)).toBeInTheDocument();

    vi.mocked(api.post).mockResolvedValueOnce({
      data: { status: "rejected", reason: "MAPE por encima del umbral." },
    });
    await user.click(screen.getByRole("button", { name: /Iniciar entrenamiento/ }));
    expect(await screen.findByText("MAPE por encima del umbral.")).toBeInTheDocument();
  });

  it("si falla el entrenamiento, muestra el error del backend", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    vi.mocked(api.post).mockImplementationOnce(async () => {
      const err: any = new Error("fallo");
      err.response = { data: { detail: "No hay suficientes muestras." } };
      throw err;
    });

    renderWithProviders(<ML />);
    await screen.findByText("Aún no hay modelos entrenados.");
    await user.click(screen.getByRole("button", { name: /Iniciar entrenamiento/ }));

    expect(await screen.findByText("No hay suficientes muestras.")).toBeInTheDocument();
  });

  it("lanza alertas a todos y muestra éxito o error", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    vi.mocked(api.post).mockResolvedValueOnce({ data: { alerts_sent: 5, users_processed: 3 } });

    renderWithProviders(<ML />);
    await screen.findByText("Aún no hay modelos entrenados.");
    await user.click(screen.getByRole("button", { name: /Lanzar a todos/ }));

    expect(await screen.findByText(/5 alertas enviadas/)).toBeInTheDocument();
    expect(screen.getByText(/a 3 usuarios/)).toBeInTheDocument();

    vi.mocked(api.post).mockImplementationOnce(async () => {
      const err: any = new Error("fallo");
      err.response = { data: { detail: "El scheduler está corriendo." } };
      throw err;
    });
    await user.click(screen.getByRole("button", { name: /Lanzar a todos/ }));
    expect(await screen.findByText("El scheduler está corriendo.")).toBeInTheDocument();
  });

  it("activa un modelo inactivo y no ofrece activar uno ya activo o rechazado", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({
      data: [
        version({ id: "v-active", status: "active" }),
        version({ id: "v-inactive", status: "inactive" }),
        version({ id: "v-rejected", status: "rejected" }),
      ],
    });
    vi.mocked(api.post).mockResolvedValue({ data: {} });

    renderWithProviders(<ML />);
    await screen.findByText("v-active");

    const rows = screen.getAllByRole("row");
    const inactiveRow = rows.find((r) => within(r).queryByText("v-inactive"));
    expect(within(inactiveRow!).getByRole("button", { name: /Activar/ })).toBeInTheDocument();

    const activeRow = rows.find((r) => within(r).queryByText("v-active"));
    expect(within(activeRow!).queryByRole("button", { name: /Activar/ })).not.toBeInTheDocument();

    await user.click(within(inactiveRow!).getByRole("button", { name: /Activar/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/admin/ml/models/v-inactive/activate"));
  });

  it("expande la fila para ver las importancias de features y las oculta de nuevo", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/ml/models") return { data: [version({ id: "v1" })] };
      if (url === "/admin/ml/models/v1/feature-importances") {
        return { data: { version_id: "v1", model_type: "gbm", feature_importances: { stock: 0.6, dias: 0.4 } } };
      }
      throw new Error(`GET no mockeado: ${url}`);
    });

    renderWithProviders(<ML />);
    await screen.findByText("v1");
    await user.click(screen.getByRole("button", { name: /Features/ }));

    expect(await screen.findByText(/Importancia de features — v1/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Features/ }));
    expect(screen.queryByText(/Importancia de features/)).not.toBeInTheDocument();
  });

  it("un modelo SVR sin importancias muestra el mensaje correspondiente, y un error de red también se maneja", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/ml/models") return { data: [version({ id: "v-svr", model_type: "svr" })] };
      if (url === "/admin/ml/models/v-svr/feature-importances") {
        return { data: { version_id: "v-svr", model_type: "svr", feature_importances: {} } };
      }
      throw new Error(`GET no mockeado: ${url}`);
    });

    renderWithProviders(<ML />);
    await user.click(screen.getByRole("button", { name: "XGBoost" }));
    await user.click(screen.getByRole("button", { name: "SVR" }));
    await screen.findByText("v-svr");
    await user.click(screen.getByRole("button", { name: /Features/ }));

    expect(
      await screen.findByText("Este modelo no soporta importancia de features (SVR)."),
    ).toBeInTheDocument();
  });

  it("si falla la carga de importancias, muestra el error", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/ml/models") return { data: [version({ id: "v1" })] };
      if (url === "/admin/ml/models/v1/feature-importances") throw new Error("fallo");
      throw new Error(`GET no mockeado: ${url}`);
    });

    renderWithProviders(<ML />);
    await screen.findByText("v1");
    await user.click(screen.getByRole("button", { name: /Features/ }));

    expect(await screen.findByText("Error al cargar importancias.")).toBeInTheDocument();
  });

  it("muestra el MAE relativo cuando está presente", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [version({ id: "v1", mae_relative: 30 })],
    });
    renderWithProviders(<ML />);
    await screen.findByText("v1");
    expect(screen.getByText("30.0%")).toBeInTheDocument();
  });
});
