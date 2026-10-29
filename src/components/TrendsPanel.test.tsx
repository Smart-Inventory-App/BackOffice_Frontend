import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import TrendsPanel from "./TrendsPanel";
import type { MyMetrics } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

import { api } from "@/lib/api";

// Los 14 días terminan el jueves 22 de octubre de 2026; se consumió el 21 (7) y el 22 (3)
function lastDays(count: number, quantities: Record<number, number> = {}, end = new Date(2026, 9, 22)) {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(end);
    date.setDate(end.getDate() - (count - 1 - i));
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { day, quantity: quantities[i] ?? 0 };
  });
}

function metrics(overrides: Partial<MyMetrics> = {}): MyMetrics {
  return {
    period_days: 14,
    total_consumido: 10,
    total_entradas: 20,
    total_ingresos: 15,
    consumo_por_dia: lastDays(14, { 12: 7, 13: 3 }),
    ingresos_por_dia: lastDays(14, { 11: 5, 13: 10 }),
    top_productos: [
      { product_id: 1, nombre: "Leche", cantidad: 8 },
      { product_id: 2, nombre: "Pan", cantidad: 4 },
    ],
    ...overrides,
  };
}

// La pantalla pide el período elegido y, justo después, el doble: el anterior es la diferencia de los totales
let calls = 0;
function serve(options: { current?: Partial<MyMetrics>; previousTotal?: number; byPeriod?: (period: number) => Partial<MyMetrics> } = {}) {
  calls = 0;
  vi.mocked(api.get).mockImplementation(async (_url: string, config?: any) => {
    const period = config.params.period as number;
    const parity = calls++ % 2; // pares: el período; impares: el doble
    const extra = options.byPeriod?.(parity === 0 ? period : period / 2) ?? {};
    const quantities = { [period - 2]: 7, [period - 1]: 3 };
    const base = metrics({
      period_days: period,
      consumo_por_dia: lastDays(period, parity === 0 ? quantities : {}),
      ...options.current,
      ...extra,
    });
    if (parity === 1) base.total_consumido = (options.current?.total_consumido ?? 10) + (options.previousTotal ?? 10);
    return { data: base };
  });
}

async function open(endpoint?: "/me/metrics" | "/admin/metrics", audience?: "user" | "platform") {
  renderWithProviders(<TrendsPanel endpoint={endpoint} audience={audience} />);
  await screen.findByTestId("trends-panel");
}

describe("TrendsPanel · períodos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ofrece 7, 14, 30 y 90 días y arranca en 14", async () => {
    serve();
    await open();

    [7, 14, 30, 90].forEach((n) => expect(screen.getByTestId(`trends-period-${n}`)).toBeInTheDocument());
    expect(screen.getByTestId("trends-period-14")).toHaveAttribute("aria-pressed", "true");
  });

  it("con 90 días pide 90 y 180 y rotula una barra por semana", async () => {
    const user = userEvent.setup();
    serve();
    await open();

    await user.click(screen.getByTestId("trends-period-90"));

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/me/metrics", { params: { period: 90 } }));
    expect(api.get).toHaveBeenCalledWith("/me/metrics", { params: { period: 180 } });
    await screen.findByTestId("trends-bar-89");
    expect(screen.getByTestId("trends-day-label-0")).toBeInTheDocument();
    expect(screen.getByTestId("trends-day-label-7")).toBeInTheDocument();
    expect(screen.queryByTestId("trends-day-label-1")).not.toBeInTheDocument();
  });

  it("pide el período elegido y el doble, para comparar con el anterior", async () => {
    serve();
    await open("/me/metrics");

    expect(api.get).toHaveBeenCalledWith("/me/metrics", { params: { period: 14 } });
    expect(api.get).toHaveBeenCalledWith("/me/metrics", { params: { period: 28 } });
  });

  it("al cambiar de período pide los datos de ese período", async () => {
    const user = userEvent.setup();
    serve();
    await open();

    await user.click(screen.getByTestId("trends-period-30"));

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/me/metrics", { params: { period: 30 } }));
    expect(api.get).toHaveBeenCalledWith("/me/metrics", { params: { period: 60 } });
    expect(screen.getByTestId("trends-period-30")).toHaveAttribute("aria-pressed", "true");
  });

  it("para un administrador pide las tendencias de toda la plataforma", async () => {
    serve();
    await open("/admin/metrics", "platform");

    expect(api.get).toHaveBeenCalledWith("/admin/metrics", { params: { period: 14 } });
  });
});

describe("TrendsPanel · interacción con las barras", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("al pasar el mouse sobre una barra de consumo muestra lo que pasó ese día, y al salir lo oculta", async () => {
    const user = userEvent.setup();
    serve();
    await open();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.hover(screen.getByTestId("trends-bar-12"));

    const tip = screen.getByTestId("trends-tooltip-12");
    expect(tip).toHaveAttribute("role", "tooltip");
    // únicamente el día y, debajo, la cantidad
    expect(Array.from(tip.children).map((c) => c.textContent)).toEqual(["Miércoles 21 de octubre", "7 unidades"]);
    expect(tip).not.toHaveTextContent("Se consumieron");
    // con el estilo de los gráficos del dashboard: caja blanca con borde gris
    expect(tip.className).toContain("bg-white");
    expect(tip.className).toContain("border-[#ccc]");
    // la barra de otro día no tiene el suyo
    expect(screen.queryByTestId("trends-tooltip-13")).not.toBeInTheDocument();

    await user.hover(screen.getByTestId("trends-bar-13"));
    expect(screen.queryByTestId("trends-tooltip-12")).not.toBeInTheDocument();
    expect(screen.getByTestId("trends-tooltip-units-13")).toHaveTextContent("3 unidades");

    await user.unhover(screen.getByTestId("trends-bar-13"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("un día sin consumo muestra «0 unidades» en el tooltip", async () => {
    const user = userEvent.setup();
    serve();
    await open();

    await user.hover(screen.getByTestId("trends-bar-0"));

    expect(screen.getByTestId("trends-tooltip-units-0")).toHaveTextContent("0 unidades");
  });

  it("también con el teclado: el foco en una barra muestra el tooltip y al salir se oculta", async () => {
    serve();
    await open();
    const barra = screen.getByTestId("trends-bar-12");

    act(() => barra.focus());
    expect(screen.getByTestId("trends-tooltip-12")).toBeInTheDocument();

    act(() => barra.blur());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("hacer click en una barra sigue mostrando el detalle de ese día", async () => {
    const user = userEvent.setup();
    serve();
    await open();

    await user.click(screen.getByTestId("trends-bar-12"));

    expect(screen.getByTestId("trends-day-title")).toHaveTextContent("Miércoles 21 de octubre");
    expect(screen.getByTestId("trends-day-units")).toHaveTextContent("Se consumieron 7 unidades");
    expect(screen.getByTestId("trends-bar-12")).toHaveAttribute("aria-pressed", "true");
  });

  it("con un texto de alcance, lo agrega al final del detalle del día, pero no al tooltip", async () => {
    const user = userEvent.setup();
    serve();
    renderWithProviders(<TrendsPanel scopeText="entre todos los usuarios de la plataforma" />);
    await screen.findByTestId("trends-panel");

    await user.hover(screen.getByTestId("trends-bar-12"));
    expect(screen.getByTestId("trends-tooltip-12")).not.toHaveTextContent("entre todos los usuarios");
    expect(screen.getByTestId("trends-tooltip-units-12")).toHaveTextContent("7 unidades");
    await user.click(screen.getByTestId("trends-bar-12"));
    expect(screen.getByTestId("trends-day-units")).toHaveTextContent("Se consumieron 7 unidades entre todos los usuarios de la plataforma");
    // un día sin consumo no lleva el texto de alcance
    await user.click(screen.getByTestId("trends-bar-0"));
    expect(screen.getByTestId("trends-day-units")).toHaveTextContent(/^Ese día no hubo consumo$/);
  });
});

describe("TrendsPanel · variante normal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sin la variante compacta, el gráfico mide 150 y los cuadros dicen «Consumido» e «Ingresado»", async () => {
    serve();
    await open();

    expect(screen.getByTestId("trends-chart").style.height).toBe("150px");
    expect(screen.getByTestId("trends-consumed").nextElementSibling).toHaveTextContent("Consumido");
    expect(screen.getByTestId("trends-consumed").nextElementSibling!.className).toContain("text-xs");
  });
});

describe("TrendsPanel · resumen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra lo consumido, el promedio de consumidos por día y el día de mayor consumo, sin el cuadro «Repuesto»", async () => {
    serve();
    await open();

    expect(screen.getByTestId("trends-consumed")).toHaveTextContent("10");
    expect(screen.queryByTestId("trends-restocked")).not.toBeInTheDocument();
    expect(screen.queryByText("Repuesto")).not.toBeInTheDocument();
    expect(screen.getByTestId("trends-average")).toHaveTextContent("0,7");
    expect(screen.getByTestId("trends-peak")).toHaveTextContent("7");
    expect(screen.getByText("Promedio de consumidos por día")).toBeInTheDocument();
    expect(screen.queryByText("Promedio por día")).not.toBeInTheDocument();
  });

  it("el día pico se escribe «Día de mayor consumo: 21 de octubre», con el mes completo", async () => {
    serve();
    await open();

    expect(screen.getByTestId("trends-peak-label")).toHaveTextContent("Día de mayor consumo: 21 de octubre");
  });

  it("sin consumo, el día pico es un guion y lo aclara; arranca en el último día", async () => {
    serve({ current: { total_consumido: 0, top_productos: [] }, byPeriod: () => ({ consumo_por_dia: lastDays(14) }) });
    await open();

    expect(screen.getByTestId("trends-peak")).toHaveTextContent("–");
    expect(screen.getByTestId("trends-peak-label")).toHaveTextContent("Día de mayor consumo: Sin consumo");
    expect(screen.getByTestId("trends-empty-period")).toHaveTextContent("No hubo consumo en estos 14 días.");
    expect(screen.getByTestId("trends-day-title")).toHaveTextContent("Jueves 22 de octubre");
    expect(screen.getByTestId("trends-day-units")).toHaveTextContent("Ese día no hubo consumo");
  });

  it("compara con el período anterior: más, menos, lo mismo o nada para comparar", async () => {
    serve({ previousTotal: 5 }); // antes 5, ahora 10
    await open();
    expect(screen.getByTestId("trends-change")).toHaveTextContent("Consumiste 100% más que en los 14 días anteriores.");
  });

  it("dice «menos» y «lo mismo» según el caso, y en la plataforma habla en impersonal", async () => {
    serve({ previousTotal: 20 });
    const { unmount } = renderWithProviders(<TrendsPanel audience="platform" />);
    await screen.findByTestId("trends-panel");
    expect(screen.getByTestId("trends-change")).toHaveTextContent("Se consumió 50% menos que en los 14 días anteriores.");
    unmount();

    serve({ previousTotal: 10 });
    renderWithProviders(<TrendsPanel />);
    await screen.findByTestId("trends-panel");
    expect(screen.getByTestId("trends-change")).toHaveTextContent("Consumiste lo mismo que en los 14 días anteriores.");
  });

  it("sin consumo en el período anterior avisa que no hay con qué comparar", async () => {
    serve({ previousTotal: 0 });
    await open();

    expect(screen.getByTestId("trends-change")).toHaveTextContent("Todavía no hay consumo en el período anterior para comparar.");
  });
});

describe("TrendsPanel · gráfico y detalle del día", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra todos los días del período juntos, sin desplazarse, con el número de cada día", async () => {
    const user = userEvent.setup();
    serve();
    await open();

    expect(screen.getAllByTestId(/^trends-bar-\d+$/)).toHaveLength(14);
    expect(screen.queryByTestId("trends-chart-scroll")).not.toBeInTheDocument();
    expect(screen.getByTestId("trends-chart").className).not.toMatch(/overflow-x/);
    expect(screen.getAllByTestId(/^trends-day-label-/)).toHaveLength(14);

    await user.click(screen.getByTestId("trends-period-30"));
    await waitFor(() => expect(screen.getAllByTestId(/^trends-bar-\d+$/)).toHaveLength(30));
    expect(screen.getAllByTestId(/^trends-day-label-/)).toHaveLength(15); // con 30 barras, un número por medio
  });

  it("rotula los meses con el nombre completo cuando hay lugar y abreviado cuando el tramo es corto", async () => {
    serve({ byPeriod: (period) => ({ consumo_por_dia: lastDays(period, {}, new Date(2026, 9, 3)) }) });
    await open();

    const months = screen.getAllByTestId(/^trends-month-/);
    expect(months.map((m) => m.textContent)).toEqual(["Septiembre", "Oct"]);
  });

  it("elige por defecto el día de mayor consumo y centra su detalle", async () => {
    serve();
    await open();

    expect(screen.getByTestId("trends-day-title")).toHaveTextContent("Miércoles 21 de octubre");
    expect(screen.getByTestId("trends-day-units")).toHaveTextContent("Se consumieron 7 unidades");
    expect(screen.getByTestId("trends-day-title").parentElement?.className).toContain("text-center");
    expect(screen.getByTestId("trends-bar-12")).toHaveAttribute("aria-pressed", "true");
  });

  it("tiene «<» a la izquierda y «>» a la derecha del texto del día", async () => {
    serve();
    await open();

    const prev = screen.getByTestId("trends-day-prev");
    const title = screen.getByTestId("trends-day-title");
    const next = screen.getByTestId("trends-day-next");
    expect(prev.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(title.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(prev).toHaveAccessibleName("Día anterior");
    expect(next).toHaveAccessibleName("Día siguiente");
  });

  it("«<» retrocede un día y «>» avanza uno, moviendo también la barra elegida", async () => {
    const user = userEvent.setup();
    serve();
    await open();

    await user.click(screen.getByTestId("trends-day-prev"));
    expect(screen.getByTestId("trends-day-title")).toHaveTextContent("Martes 20 de octubre");
    expect(screen.getByTestId("trends-day-units")).toHaveTextContent("Ese día no hubo consumo");
    expect(screen.getByTestId("trends-bar-11")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("trends-bar-12")).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByTestId("trends-day-next"));
    await user.click(screen.getByTestId("trends-day-next"));
    expect(screen.getByTestId("trends-day-title")).toHaveTextContent("Jueves 22 de octubre");
    expect(screen.getByTestId("trends-day-units")).toHaveTextContent("Se consumieron 3 unidades");
  });

  it("no se puede pasar del último día ni antes del primero", async () => {
    const user = userEvent.setup();
    serve();
    await open();

    await user.click(screen.getByTestId("trends-day-next"));
    expect(screen.getByTestId("trends-day-next")).toBeDisabled();
    expect(screen.getByTestId("trends-day-title")).toHaveTextContent("Jueves 22 de octubre");

    await user.click(screen.getByTestId("trends-bar-0"));
    expect(screen.getByTestId("trends-day-prev")).toBeDisabled();
    expect(screen.getByTestId("trends-day-next")).toBeEnabled();
  });

  it("tocar una barra elige ese día", async () => {
    const user = userEvent.setup();
    serve();
    await open();

    await user.click(screen.getByTestId("trends-bar-5"));

    expect(screen.getByTestId("trends-day-title")).toHaveTextContent("Miércoles 14 de octubre");
    expect(screen.queryByText(/Hacé clic en una barra/)).not.toBeInTheDocument();
  });

  it("dice «Se consumió 1 unidad» en singular", async () => {
    serve({ byPeriod: (period) => ({ consumo_por_dia: lastDays(period, { [period - 1]: 1 }) }) });
    await open();

    expect(screen.getByTestId("trends-day-units")).toHaveTextContent("Se consumió 1 unidad");
  });

  it("el alto de las barras es proporcional al día de mayor consumo", async () => {
    serve();
    await open();

    const height = (i: number) => parseInt(screen.getByTestId(`trends-bar-fill-${i}`).style.height, 10);
    expect(height(12)).toBeGreaterThan(height(13));
    expect(height(13)).toBeGreaterThan(height(0));
    expect(height(0)).toBe(3);
  });
});

describe("TrendsPanel · más consumidos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista los productos más consumidos, el primero al 100% y sin «Menos usados»", async () => {
    serve();
    await open();

    const first = screen.getByTestId("trends-top-0");
    expect(within(first).getByText("Leche")).toBeInTheDocument();
    expect(within(first).getByText("8 unidades")).toBeInTheDocument();
    expect(screen.getByTestId("trends-top-bar-0").style.width).toBe("100%");
    expect(screen.getByTestId("trends-top-bar-1").style.width).toBe("50%");
    expect(screen.queryByText("Menos usados")).not.toBeInTheDocument();
    expect(screen.getByText("Productos con más salidas")).toBeInTheDocument();
  });

  it("para un administrador muestra el mail del usuario debajo del nombre de cada producto más consumido", async () => {
    serve({
      current: {
        top_productos: [
          { product_id: 1, nombre: "Leche", cantidad: 8, owner_email: "ana@test.com" },
          { product_id: 2, nombre: "Pan", cantidad: 4, owner_email: null },
        ],
      },
    });
    await open("/admin/metrics", "platform");

    expect(screen.getByTestId("trends-top-owner-0")).toHaveTextContent("ana@test.com");
    expect(screen.getByTestId("trends-top-owner-1")).toHaveTextContent("Usuario sin cuenta");
  });

  it("para un usuario no muestra mails en los más consumidos", async () => {
    serve();
    await open();

    expect(screen.queryByTestId("trends-top-owner-0")).not.toBeInTheDocument();
  });

  it("muestra hasta cinco productos distintos", async () => {
    const five = ["Leche", "Pan", "Arroz", "Fideos", "Yogur"].map((nombre, i) => ({ product_id: i + 1, nombre, cantidad: 10 - i }));
    serve({ current: { top_productos: five } });
    await open();

    expect(screen.getAllByTestId(/^trends-top-\d+$/)).toHaveLength(5);
    ["Leche", "Pan", "Arroz", "Fideos", "Yogur"].forEach((name) => expect(screen.getAllByText(name)).toHaveLength(1));
  });

  it("sin consumo, lo dice", async () => {
    serve({ current: { top_productos: [] } });
    await open();

    expect(screen.getByText("Todavía no hay suficiente historial.")).toBeInTheDocument();
  });
});

describe("TrendsPanel · errores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("si falla la carga, ofrece reintentar", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockRejectedValueOnce(new Error("fallo")).mockRejectedValueOnce(new Error("fallo"));
    renderWithProviders(<TrendsPanel />);

    expect(await screen.findByText("No se pudieron cargar las tendencias.")).toBeInTheDocument();
    serve();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByTestId("trends-panel")).toBeInTheDocument();
  });

  it("mientras carga muestra el selector de período y un indicador", async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}) as any);
    renderWithProviders(<TrendsPanel />);

    expect(screen.getByTestId("trends-period-7")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();
  });
});

describe("TrendsPanel · ingresos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // El período pedido trae 15 ingresados; el doble, 15 + los del período anterior
  function serveIncomes(previous = 5, current = 15) {
    vi.mocked(api.get).mockImplementation(async (_url: string, config?: any) => {
      const period = config.params.period as number;
      const wide = period === 28;
      return { data: metrics({ period_days: period, total_ingresos: wide ? current + previous : current }) };
    });
  }

  async function openIncomes(props: Partial<React.ComponentProps<typeof TrendsPanel>> = {}) {
    renderWithProviders(<TrendsPanel kind="ingresos" {...props} />);
    await screen.findByTestId("incomes-panel");
  }

  it("resume lo ingresado, el promedio por día y el día de mayor ingreso", async () => {
    serveIncomes();
    await openIncomes();

    expect(screen.getByTestId("incomes-total")).toHaveTextContent("15");
    expect(screen.getByTestId("incomes-average")).toHaveTextContent("1,1");
    expect(screen.getByTestId("incomes-peak")).toHaveTextContent("10");
    expect(screen.getByTestId("incomes-peak-label")).toHaveTextContent("Día de mayor ingreso: 22 de octubre");
    expect(screen.queryByTestId("trends-consumed")).not.toBeInTheDocument();
    expect(screen.queryByText("Productos con más salidas")).not.toBeInTheDocument();
    expect(screen.getByText("Ingresos por día")).toBeInTheDocument();
  });

  it("compara con el período anterior", async () => {
    serveIncomes(5, 15);
    await openIncomes();

    await waitFor(() => expect(screen.getByTestId("incomes-change")).toHaveTextContent("Ingresaste 200% más que en los 14 días anteriores."));
  });

  it("de toda la plataforma habla en tercera persona", async () => {
    serveIncomes(30, 15);
    await openIncomes({ audience: "platform" });

    await waitFor(() => expect(screen.getByTestId("incomes-change")).toHaveTextContent("Ingresó 50% menos que en los 14 días anteriores."));
  });

  it("sin ingresos en el período anterior no hay con qué comparar", async () => {
    serveIncomes(0, 15);
    await openIncomes();

    await waitFor(() => expect(screen.getByTestId("incomes-change")).toHaveTextContent("Todavía no hubo ingresos en el período anterior para comparar."));
  });

  it("el gráfico arranca en el día de mayor ingreso y las flechas recorren los días", async () => {
    const user = userEvent.setup();
    serveIncomes();
    await openIncomes();

    await waitFor(() => expect(screen.getByTestId("incomes-day-title")).toHaveTextContent("Jueves 22 de octubre"));
    expect(screen.getByTestId("incomes-day-units")).toHaveTextContent("Ingresaron 10 unidades");
    await user.click(screen.getByTestId("incomes-day-prev"));
    expect(screen.getByTestId("incomes-day-units")).toHaveTextContent("Ese día no ingresó stock");
    await user.click(screen.getByTestId("incomes-bar-11"));
    expect(screen.getByTestId("incomes-day-units")).toHaveTextContent("Ingresaron 5 unidades");
  });

  it("un solo ingreso se dice en singular", async () => {
    vi.mocked(api.get).mockImplementation(async (_url: string, config?: any) => ({
      data: metrics({ period_days: config.params.period, total_ingresos: 1, ingresos_por_dia: lastDays(14, { 13: 1 }) }),
    }));
    await openIncomes();

    await waitFor(() => expect(screen.getByTestId("incomes-day-units")).toHaveTextContent("Ingresó 1 unidad"));
  });

  it("sin ingresos en el período lo avisa", async () => {
    vi.mocked(api.get).mockImplementation(async (_url: string, config?: any) => ({
      data: metrics({ period_days: config.params.period, total_ingresos: 0, ingresos_por_dia: lastDays(14) }),
    }));
    await openIncomes();

    expect(screen.getByTestId("incomes-empty-period")).toHaveTextContent("No hubo ingresos de stock en estos 14 días.");
    expect(screen.getByTestId("incomes-peak")).toHaveTextContent("–");
    expect(screen.getByTestId("incomes-peak-label")).toHaveTextContent("Sin ingresos");
  });

  it("si el período lo elige la página, el panel no muestra su propio selector", async () => {
    serveIncomes();
    await openIncomes({ period: 14, onPeriodChange: vi.fn() });

    expect(screen.queryByTestId("trends-period-14")).not.toBeInTheDocument();
  });

  it("los ingresos también muestran el tooltip al pasar el mouse", async () => {
    const user = userEvent.setup();
    serveIncomes();
    renderWithProviders(<TrendsPanel kind="ingresos" />);
    await screen.findByTestId("incomes-panel");

    await user.hover(screen.getByTestId("incomes-bar-13"));

    expect(Array.from(screen.getByTestId("incomes-tooltip-13").children).map((c) => c.textContent)).toEqual([
      "Jueves 22 de octubre",
      "10 unidades",
    ]);
  });

  it("los ingresos de toda la plataforma dicen «Ingresaron … entre todos los usuarios de la plataforma»", async () => {
    serveIncomes();
    renderWithProviders(<TrendsPanel kind="ingresos" scopeText="entre todos los usuarios de la plataforma" />);
    await screen.findByTestId("incomes-panel");

    expect(screen.getByTestId("incomes-day-units")).toHaveTextContent("Ingresaron 10 unidades entre todos los usuarios de la plataforma");
  });
});

describe("TrendsPanel · productos con más stock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const top = [
    { id: 1, nombre: "Arroz", stock: 40 },
    { id: 2, nombre: "Fideos", stock: 10 },
    { id: 3, nombre: "Agotado", stock: 0 },
  ];

  function serveWithTop(items = top) {
    vi.mocked(api.get).mockImplementation(async (url: string, config?: any) => {
      if (url === "/me/products" || url === "/admin/products/") return { data: { items, total: items.length } };
      return { data: metrics({ period_days: config.params.period }) };
    });
  }

  it("debajo de los ingresos lista los productos con más stock, de más a menos, sin los que no tienen", async () => {
    serveWithTop();
    renderWithProviders(<TrendsPanel kind="ingresos" />);

    const card = await screen.findByTestId("incomes-top-stock");
    await waitFor(() => expect(within(card).getByTestId("incomes-top-stock-0")).toHaveTextContent("Arroz"));
    expect(within(card).getByTestId("incomes-top-stock-0")).toHaveTextContent("40 unidades");
    expect(within(card).getByTestId("incomes-top-stock-1")).toHaveTextContent("Fideos");
    expect(within(card).queryByText("Agotado")).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/me/products", { params: { sort_by: "stock", sort_dir: "desc", limit: 5 } });
  });

  it("para un administrador son los de toda la plataforma", async () => {
    serveWithTop();
    renderWithProviders(<TrendsPanel kind="ingresos" endpoint="/admin/metrics" audience="platform" />);

    await screen.findByTestId("incomes-top-stock");
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/admin/products/", { params: { sort_by: "stock", sort_dir: "desc", limit: 10 } }),
    );
  });

  it("para un administrador muestra, debajo del nombre, el mail del usuario de cada producto", async () => {
    serveWithTop([
      { id: 1, nombre: "Arroz", stock: 40, owner: { user_id: "u1", email: "ana@test.com" } },
      { id: 2, nombre: "Fideos", stock: 10, owner: { user_id: "u2", email: null } },
    ] as any);
    renderWithProviders(<TrendsPanel kind="ingresos" endpoint="/admin/metrics" audience="platform" />);

    expect(await screen.findByTestId("incomes-top-stock-owner-0")).toHaveTextContent("ana@test.com");
    expect(screen.getByTestId("incomes-top-stock-owner-1")).toHaveTextContent("Usuario sin cuenta");
  });

  it("para un usuario no muestra mails", async () => {
    serveWithTop();
    renderWithProviders(<TrendsPanel kind="ingresos" />);

    await screen.findByTestId("incomes-top-stock-0");
    expect(screen.queryByTestId("incomes-top-stock-owner-0")).not.toBeInTheDocument();
  });

  it("sin productos con stock lo dice, y el consumo no muestra esta tarjeta", async () => {
    serveWithTop([]);
    const { unmount } = renderWithProviders(<TrendsPanel kind="ingresos" />);
    expect(await screen.findByText("Todavía no hay productos con stock.")).toBeInTheDocument();
    unmount();

    serveWithTop();
    renderWithProviders(<TrendsPanel kind="consumo" />);
    await screen.findByTestId("trends-panel");
    expect(screen.queryByTestId("incomes-top-stock")).not.toBeInTheDocument();
  });
});

describe("TrendsPanel · títulos y tarjetas centrados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation(async (url: string, config?: any) => {
      if (url === "/me/products") return { data: { items: [{ id: 1, nombre: "Arroz", stock: 4 }], total: 1 } };
      return { data: metrics({ period_days: config.params.period }) };
    });
  });

  it("el título de cada gráfico y las tarjetas de datos están centrados y son bajas", async () => {
    renderWithProviders(<TrendsPanel kind="consumo" />);

    const total = await screen.findByTestId("trends-consumed");
    const card = total.parentElement!;
    expect(card.className).toContain("text-center");
    expect(card.className).toContain("py-2");
    expect(card.className).not.toContain("p-4");
    expect(screen.getByTestId("trends-average").parentElement!.className).toContain("text-center");
    expect(screen.getByTestId("trends-peak").parentElement!.className).toContain("text-center");
    expect(screen.getByTestId("trends-change").className).toContain("justify-center");
    expect(screen.getByText("Consumo por día").className).toContain("text-center");
    expect(screen.getByText("Productos con más salidas").className).toContain("text-center");
  });

  it("en los ingresos también: el título, las tarjetas y «Productos con más stock»", async () => {
    renderWithProviders(<TrendsPanel kind="ingresos" />);

    const total = await screen.findByTestId("incomes-total");
    expect(total.parentElement!.className).toContain("text-center");
    expect(screen.getByTestId("incomes-change").className).toContain("justify-center");
    expect(screen.getByText("Ingresos por día").className).toContain("text-center");
    expect((await screen.findByText("Productos con más stock")).className).toContain("text-center");
  });
});

describe("TrendsPanel · colores por tipo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation(async (url: string, config?: any) => {
      if (url === "/me/products") return { data: { items: [{ id: 1, nombre: "Arroz", stock: 4 }], total: 1 } };
      return { data: metrics({ period_days: config.params.period }) };
    });
  });

  it("el consumo va en celeste verdoso: los números destacados y las barras", async () => {
    renderWithProviders(<TrendsPanel kind="consumo" />);

    await screen.findByTestId("trends-consumed");
    ["trends-consumed", "trends-average", "trends-peak"].forEach((id) => {
      expect(screen.getByTestId(id).className).toContain("text-primary");
    });
    const filled = screen.getAllByTestId(/^trends-bar-fill-/).filter((bar) => bar.className.includes("bg-primary"));
    expect(filled.length).toBeGreaterThan(0);
    expect(screen.getAllByTestId(/^trends-bar-fill-/).some((bar) => bar.className.includes("1B3A8F"))).toBe(false);
  });

  it("los ingresos van en azul: los números destacados y las barras", async () => {
    renderWithProviders(<TrendsPanel kind="ingresos" />);

    await screen.findByTestId("incomes-total");
    ["incomes-total", "incomes-average", "incomes-peak"].forEach((id) => {
      expect(screen.getByTestId(id).className).toContain("text-[#1B3A8F]");
    });
    const bars = screen.getAllByTestId(/^incomes-bar-fill-/);
    expect(bars.some((bar) => bar.className.includes("1B3A8F") || bar.className.includes("0F2461"))).toBe(true);
    expect(bars.some((bar) => bar.className.includes("bg-primary"))).toBe(false);
  });
});

describe("TrendsPanel · barra seleccionada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation(async (url: string, config?: any) => {
      if (url === "/me/products") return { data: { items: [], total: 0 } };
      return { data: metrics({ period_days: config.params.period }) };
    });
  });

  it("la barra elegida es del mismo azul del logo en consumo y en ingresos", async () => {
    const { unmount } = renderWithProviders(<TrendsPanel kind="consumo" />);
    await screen.findByTestId("trends-consumed");
    const consumo = screen.getAllByTestId(/^trends-bar-fill-/).find((bar) => bar.getAttribute("aria-hidden") !== "x" && bar.className.includes("237EA1"));
    unmount();
    renderWithProviders(<TrendsPanel kind="ingresos" />);
    await screen.findByTestId("incomes-total");
    const ingresos = screen.getAllByTestId(/^incomes-bar-fill-/).find((bar) => bar.className.includes("237EA1"));

    expect(consumo).toBeTruthy();
    expect(ingresos).toBeTruthy();
  });
});
