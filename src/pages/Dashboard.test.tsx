import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/test-utils";
import { platformOverview } from "@/test/fixtures";
import Dashboard from "./Dashboard";
import type { PlatformOverview } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

// Los gráficos no se dibujan en jsdom (no tienen ancho): se reemplazan por cajas que dicen de qué tipo son
vi.mock("recharts", () => {
  const caja = (testId: string) => ({ children }: { children?: unknown }) => <div data-testid={testId}>{children as never}</div>;
  const nada = () => null;
  return {
    ResponsiveContainer: ({ height, children }: { height: number; children?: unknown }) => (
      <div className="recharts-responsive-container" style={{ height }}>
        {children as never}
      </div>
    ),
    LineChart: caja("line-chart"),
    BarChart: caja("bar-chart"),
    Legend: ({ content }: { content?: () => unknown }) => <>{content ? (content() as never) : null}</>,
    Line: nada,
    Bar: nada,
    CartesianGrid: nada,
    Tooltip: nada,
    XAxis: nada,
    YAxis: nada,
  };
});

import { api } from "@/lib/api";

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderDashboard() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const MODEL = { id: "v1", model_type: "xgboost", trained_at: "2026-10-01T12:00:00Z", mae: 1.234, mape: 18, status: "active" };

interface Setup {
  overview?: PlatformOverview;
  ocr?: "ok" | "down" | "error";
  models?: unknown[] | "error";
}

function serve({ overview = platformOverview(), ocr = "ok", models = [MODEL] }: Setup = {}) {
  vi.mocked(api.get).mockImplementation(async (url: string, config?: any) => {
    if (url === "/admin/stats/overview") return { data: { ...overview, period_days: config.params.period } };
    if (url === "/admin/ocr/status") {
      if (ocr === "error") throw new Error("503");
      return {
        data: { available: ocr === "ok", checks: {}, engines: [{ name: "paddleocr", url: "", available: ocr === "ok", version: "", replicas: [] }] },
      };
    }
    if (url === "/admin/ml/models") {
      if (models === "error") throw new Error("502");
      return { data: models };
    }
    throw new Error(`GET no mockeado: ${url}`);
  });
}

describe("Dashboard del administrador · estructura", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tiene título, descripción y el selector de período, y no tiene el botón de tendencias", async () => {
    serve();
    renderDashboard();

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Estado general y rendimiento de la plataforma Smart Inventory")).toBeInTheDocument();
    const picker = screen.getByTestId("dashboard-period-picker");
    ["7", "14", "30", "90"].forEach((p) => expect(within(picker).getByTestId(`trends-period-${p}`)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /tendencias/i })).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/admin/stats/overview", { params: { period: 14 } });
  });

  it("tiene solo las secciones pedidas, en este orden", async () => {
    serve();
    renderDashboard();
    await screen.findByTestId("dashboard-tiles");

    const orden = Array.from(document.querySelectorAll("[data-testid^='section-'], [data-testid='dashboard-tiles']")).map((e) =>
      e.getAttribute("data-testid"),
    );
    expect(orden).toEqual([
      "dashboard-tiles",
      "section-registrations",
      "section-activity",
      "section-ocr",
      "section-services",
      "section-quality",
      "section-active-users",
    ]);
    expect(screen.getByText("Crecimiento de usuarios")).toBeInTheDocument();
    expect(screen.getByText("Actividad de la plataforma")).toBeInTheDocument();
    // ya no está el gráfico de entradas y salidas por día
    expect(screen.queryByText("Entradas y salidas de productos por día")).not.toBeInTheDocument();
    expect(screen.queryByTestId("section-flow")).not.toBeInTheDocument();
  });

  it("elegir otro período vuelve a pedir el resumen con esos días", async () => {
    const user = userEvent.setup();
    serve();
    renderDashboard();
    await screen.findByTestId("stat-users");

    await user.click(screen.getByTestId("trends-period-30"));

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/admin/stats/overview", { params: { period: 30 } }));
    expect(await screen.findByText("Registros por día en los últimos 30 días")).toBeInTheDocument();
  });

  it("si falla la carga, lo dice", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("500"));
    renderDashboard();
    expect(await screen.findByText("No se pudieron cargar las métricas.")).toBeInTheDocument();
  });
});

describe("Dashboard del administrador · tarjetas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("son tres, en una sola fila, con su detalle", async () => {
    serve();
    renderDashboard();

    const tarjetas = await screen.findByTestId("dashboard-tiles");
    expect(tarjetas.className).toContain("sm:grid-cols-3");
    expect(within(tarjetas).getAllByTestId(/^stat-[a-z]+$/)).toHaveLength(3);
    expect(screen.getByText("Usuarios totales")).toBeInTheDocument();
    expect(screen.getByTestId("stat-users-value")).toHaveTextContent("50");
    expect(screen.getByTestId("stat-users-comment")).toHaveTextContent("6 usuarios nuevos");
    expect(screen.getByText("Usuarios activos")).toBeInTheDocument();
    expect(screen.getByTestId("stat-active-value")).toHaveTextContent("30");
    expect(screen.getByTestId("stat-active-comment")).toHaveTextContent("75% de los habilitados");
    expect(screen.getByText("Productos totales")).toBeInTheDocument();
    expect(screen.getByTestId("stat-products-value")).toHaveTextContent("300");
    expect(screen.getByTestId("stat-products-comment")).toHaveTextContent("1.234 unidades en stock");
  });

  it("en singular dicen «1 usuario nuevo» y «1 unidad en stock»", async () => {
    serve({
      overview: platformOverview({
        users: { ...platformOverview().users, new_in_period: 1 },
        inventory: { ...platformOverview().inventory, units: 1 },
      }),
    });
    renderDashboard();

    expect(await screen.findByTestId("stat-users-comment")).toHaveTextContent("1 usuario nuevo");
    expect(screen.getByTestId("stat-products-comment")).toHaveTextContent("1 unidad en stock");
  });

  it.each([
    ["stat-users", "/usuarios"],
    ["stat-active", "/usuarios"],
    ["stat-products", "/productos"],
  ])("la tarjeta %s lleva a %s", async (tarjeta, destino) => {
    const user = userEvent.setup();
    serve();
    renderDashboard();

    await user.click(await screen.findByTestId(tarjeta));

    expect(await screen.findByTestId("where")).toHaveTextContent(destino);
  });
});

describe("Dashboard del administrador · gráficos y usuarios más activos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("los gráficos de crecimiento y de actividad son altos (300 px)", async () => {
    serve();
    renderDashboard();
    await screen.findByTestId("section-registrations");

    for (const id of ["section-registrations", "section-activity"]) {
      const grafico = screen.getByTestId(id).querySelector(".recharts-responsive-container") as HTMLElement;
      expect(grafico.style.height).toBe("300px");
    }
  });

  it("el crecimiento de usuarios es un gráfico de línea, no de barras", async () => {
    serve();
    renderDashboard();
    const seccion = await screen.findByTestId("section-registrations");

    expect(within(seccion).getByTestId("line-chart")).toBeInTheDocument();
    expect(within(seccion).queryByTestId("bar-chart")).not.toBeInTheDocument();
    // la actividad sí sigue siendo de barras apiladas
    expect(within(screen.getByTestId("section-activity")).getByTestId("bar-chart")).toBeInTheDocument();
  });

  it("la leyenda de la actividad tiene sus tres nombres bien separados entre sí", async () => {
    serve();
    renderDashboard();
    await screen.findByTestId("section-activity");

    const leyenda = await screen.findByTestId("activity-legend");
    expect(within(leyenda).getAllByRole("listitem").map((i) => i.textContent)).toEqual([
      "Inicios de sesión",
      "Entradas de stock",
      "Salidas de stock",
    ]);
    expect(leyenda.className).toContain("gap-x-12");
  });

  it("la tabla de usuarios más activos ocupa el ancho y tiene las columnas pedidas, en mayúscula", async () => {
    serve();
    renderDashboard();
    const seccion = await screen.findByTestId("section-active-users");

    const titulos = within(seccion).getAllByRole("columnheader").map((h) => h.textContent);
    expect(titulos).toEqual(["Mail", "Nombre", "Usuario", "Movimientos", "Entradas", "Salidas", "Productos", "Stock"]);
    expect(within(seccion).getAllByRole("columnheader")[0].closest("tr")!.className).toContain("uppercase");
    expect(seccion.querySelector("table")!.className).toContain("w-full");
    const fila = screen.getByTestId("active-user-u1");
    const celdas = within(fila).getAllByRole("cell").map((c) => c.textContent);
    expect(celdas).toEqual(["top@test.com", "Ana Gómez", "ana", "25", "10", "15", "20", "1.500"]);
    // sin nombre ni usuario, un guion
    const sinPerfil = within(screen.getByTestId("active-user-u3")).getAllByRole("cell").map((c) => c.textContent);
    expect(sinPerfil.slice(0, 3)).toEqual(["baja@test.com", "—", "—"]);
    expect(seccion).toHaveTextContent("Los usuarios con más movimientos de stock en el período: 14 días");
  });

  it("«Ver más» está a la derecha del título y lleva a Usuarios de la Plataforma", async () => {
    const user = userEvent.setup();
    serve();
    renderDashboard();
    const seccion = await screen.findByTestId("section-active-users");

    const titulo = within(seccion).getByRole("heading", { name: "Usuarios más activos" });
    const fila = titulo.parentElement!.parentElement!;
    expect(fila.className).toContain("justify-between");
    const boton = within(fila).getByRole("button", { name: "Ver más" });
    expect(fila.lastElementChild).toBe(boton);
    expect(boton.className).toContain("!px-3");

    await user.click(boton);

    expect(await screen.findByTestId("where")).toHaveTextContent("/usuarios");
  });

  it("los tres paneles de rendimiento comparten fila, y los campos de calidad se reparten a lo alto del suyo", async () => {
    serve();
    renderDashboard();
    const calidad = await screen.findByTestId("section-quality");

    // la misma fila (y por lo tanto la misma altura) que el OCR y el estado de los servicios
    const fila = calidad.parentElement!;
    expect(fila.className).toContain("lg:grid-cols-3");
    expect(Array.from(fila.children).map((c) => c.getAttribute("data-testid"))).toEqual(["section-ocr", "section-services", "section-quality"]);
    // los cinco campos, uno debajo del otro, repartidos en todo el alto de la tarjeta
    const campos = calidad.querySelector("div.flex-1")!;
    expect(calidad.className).toContain("flex-col");
    expect(campos.className).toContain("flex-col");
    expect(campos.className).toContain("justify-between");
    expect(within(calidad).getAllByTestId(/^quality-/)).toHaveLength(5);
  });

  it("la tabla está debajo de los tres paneles de rendimiento", async () => {
    serve();
    renderDashboard();
    await screen.findByTestId("section-active-users");

    const html = document.body.innerHTML;
    for (const panel of ["section-ocr", "section-services", "section-quality"]) {
      expect(html.indexOf(panel)).toBeLessThan(html.indexOf("section-active-users"));
    }
  });

  it("el mail lleva al detalle del usuario, y uno deshabilitado va en rojo", async () => {
    const user = userEvent.setup();
    serve();
    renderDashboard();
    const fila = await screen.findByTestId("active-user-u1");
    expect(within(screen.getByTestId("active-user-u3")).getByRole("button")).toHaveClass("text-danger");
    expect(within(fila).getByRole("button")).not.toHaveClass("text-danger");

    await user.click(within(fila).getByRole("button", { name: "top@test.com" }));

    expect(await screen.findByTestId("where")).toHaveTextContent("/usuarios/u1");
  });

  it("sin movimientos, lo dice", async () => {
    serve({ overview: platformOverview({ most_active_users: [] }) });
    renderDashboard();
    expect(await screen.findByText("Nadie movió stock en este período.")).toBeInTheDocument();
  });
});

describe("Dashboard del administrador · rendimiento del sistema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("el rendimiento del OCR muestra escaneos, éxito, tiempo y confianza, y el detalle por tipo", async () => {
    serve();
    renderDashboard();
    await screen.findByTestId("section-ocr");

    expect(screen.getByTestId("ocr-runs")).toHaveTextContent("10");
    expect(screen.getByTestId("ocr-success")).toHaveTextContent("80%");
    expect(screen.getByTestId("ocr-ms")).toHaveTextContent("1.5 s");
    expect(screen.getByTestId("ocr-confidence")).toHaveTextContent("87%");
    expect(screen.getByTestId("ocr-type-barcode")).toHaveTextContent("Código de barras");
    expect(screen.getByTestId("ocr-type-barcode")).toHaveTextContent("6 · 100% ok");
    // el tipo de documento se llama como en el OCR, no por su nombre interno
    expect(screen.queryByText(/expiry_date/)).not.toBeInTheDocument();
    expect(screen.getByTestId("ocr-type-receipt")).toHaveTextContent("4 · 50% ok");
  });

  it("las fechas de vencimiento escaneadas se llaman «Fechas de vencimiento»", async () => {
    serve({
      overview: platformOverview({
        ocr: { ...platformOverview().ocr, by_type: [{ doc_type: "expiry_date", ejecuciones: 3, exitosas: 3, fallidas: 0 }] },
      }),
    });
    renderDashboard();

    expect(await screen.findByTestId("ocr-type-expiry_date")).toHaveTextContent("Fechas de vencimiento");
    expect(screen.getByTestId("ocr-type-expiry_date")).toHaveTextContent("3 · 100% ok");
  });

  it("sin escaneos, el OCR lo dice y no inventa tiempos", async () => {
    serve({ overview: platformOverview({ ocr: { runs: 0, succeeded: 0, avg_ms: null, avg_confidence: null, by_type: [] } }) });
    renderDashboard();
    await screen.findByTestId("section-ocr");
    expect(screen.getByText("Nadie escaneó nada en este período.")).toBeInTheDocument();
    expect(screen.getByTestId("ocr-ms")).toHaveTextContent("—");
    expect(screen.getByTestId("ocr-confidence")).toHaveTextContent("—");
  });

  it("los tiempos de menos de un segundo van en milisegundos", async () => {
    serve({ overview: platformOverview({ ocr: { ...platformOverview().ocr, avg_ms: 420 } }) });
    renderDashboard();
    await screen.findByTestId("section-ocr");
    expect(screen.getByTestId("ocr-ms")).toHaveTextContent("420 ms");
  });

  it("con el OCR y el modelo funcionando, los muestra disponibles con el detalle del modelo", async () => {
    serve();
    renderDashboard();

    await waitFor(() => expect(screen.getByTestId("service-ocr")).toHaveTextContent("Disponible"));
    expect(screen.getByTestId("service-engine-paddleocr")).toHaveTextContent("Activo");
    await waitFor(() => expect(screen.getByTestId("service-ml")).toHaveTextContent("XGBOOST activo"));
    // los datos del modelo, uno debajo del otro: primero la fecha de entrenamiento
    const detalle = screen.getByTestId("service-ml-detail");
    expect(Array.from(detalle.children).map((c) => c.getAttribute("data-testid"))).toEqual([
      "service-ml-trained",
      "service-ml-mae",
      "service-ml-mape",
    ]);
    expect(screen.getByTestId("service-ml-trained")).toHaveTextContent(/^Entrenado el \d{2}\/\d{2}\/\d{4}/);
    expect(screen.getByTestId("service-ml-mae")).toHaveTextContent("Error medio 1.23 u/sem");
    expect(screen.getByTestId("service-ml-mape")).toHaveTextContent("MAPE 18%");
  });

  it("con el OCR caído lo marca, y sin modelo activo lo avisa", async () => {
    serve({ ocr: "down", models: [{ ...MODEL, status: "inactive" }] });
    renderDashboard();

    await waitFor(() => expect(screen.getByTestId("service-ocr")).toHaveTextContent("Caído"));
    expect(screen.getByTestId("service-engine-paddleocr")).toHaveTextContent("Inactivo");
    await waitFor(() => expect(screen.getByTestId("service-ml")).toHaveTextContent("Sin modelo activo"));
    expect(screen.queryByTestId("service-ml-detail")).not.toBeInTheDocument();
  });

  it("si los servicios no responden, el dashboard sigue funcionando y los marca como no disponibles", async () => {
    serve({ ocr: "error", models: "error" });
    renderDashboard();

    expect(await screen.findByTestId("stat-users")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("service-ocr")).toHaveTextContent("No disponible"));
    await waitFor(() => expect(screen.getByTestId("service-ml")).toHaveTextContent("No disponible"));
  });

  it("la calidad de datos empieza con «Usuarios habilitados» y sigue con la adopción y los datos completos", async () => {
    serve();
    renderDashboard();
    const seccion = await screen.findByTestId("section-quality");

    const filas = Array.from(seccion.querySelectorAll("[data-testid^='quality-']")).map((e) => e.getAttribute("data-testid"));
    expect(filas).toEqual(["quality-enabled", "quality-with-products", "quality-active", "quality-image", "quality-expiry"]);
    expect(screen.getByTestId("quality-enabled")).toHaveTextContent("Usuarios habilitados");
    expect(screen.getByTestId("quality-enabled")).toHaveTextContent("40 de 50");
    expect(screen.getByTestId("quality-with-products")).toHaveTextContent("20 de 40");
    expect(screen.getByTestId("quality-active")).toHaveTextContent("30 de 40");
    expect(screen.getByTestId("quality-image")).toHaveTextContent("100 de 300");
    expect(screen.getByTestId("quality-expiry")).toHaveTextContent("240 de 300");
  });

  it("sin usuarios ni productos, los porcentajes quedan en cero", async () => {
    serve({
      overview: platformOverview({
        users: { total: 0, active: 0, new_in_period: 0, active_in_period: 0, with_products: 0, registrations_per_day: [] },
        inventory: { products: 0, units: 0, with_image: 0, without_expiry: 0 },
      }),
    });
    renderDashboard();

    const seccion = await screen.findByTestId("section-quality");
    expect(seccion).toHaveTextContent("0 de 0");
    expect(screen.getByTestId("stat-active-comment")).toHaveTextContent("0% de los habilitados");
  });
});
