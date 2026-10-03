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

  it("filtra versiones por segmento, algoritmo y fuente de datos, y muestra el mensaje sin coincidencias", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: [version({ id: "v1" })] });
    renderWithProviders(<ML />);

    expect(await screen.findByText("v1")).toBeInTheDocument();
    expect(screen.getByText("1 de 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "XGBoost" }));
    expect(
      screen.getByText(/No hay versiones de XGBOOST entrenadas con datos reales\./),
    ).toBeInTheDocument();
    expect(screen.getByText("0 de 1")).toBeInTheDocument();
  });

  it("con segmento comercio y dataset de prueba, deshabilita entrenar para individuos", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    renderWithProviders(<ML />);
    await screen.findByText("Aún no hay modelos entrenados.");

    await user.click(screen.getByRole("button", { name: "Dataset de prueba" }));
    expect(
      screen.getByText(/El dataset de prueba es de escala comercial/),
    ).toBeInTheDocument();
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
