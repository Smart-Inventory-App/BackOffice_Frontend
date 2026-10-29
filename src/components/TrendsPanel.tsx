import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Equal } from "lucide-react";
import { api } from "@/lib/api";
import type { AdminProduct, MyMetrics, MyProduct, Paginated } from "@/lib/types";
import { formatThousands } from "@/lib/format";
import {
  TREND_PERIODS,
  averagePerDay,
  barHeight,
  changeVsPrevious,
  formatDayLong,
  formatDayMonth,
  monthSegments,
  peakIndex,
  type TrendPeriod,
} from "@/lib/trends";
import { Button, Card, EmptyState, Segmented, Spinner } from "@/components/ui";

const CHART_HEIGHT = 150;
const COMPACT_CHART_HEIGHT = 96;
const DEFAULT_PERIOD: TrendPeriod = 14;

const unitsText = (n: number) => `${formatThousands(n)} ${n === 1 ? "unidad" : "unidades"}`;

interface Props {
  /** De dónde salen los datos: los del usuario o los de toda la plataforma (administrador). */
  endpoint?: string;
  /** Quién consume: cambia la frase de la comparación («Consumiste...» o «Se consumió...»). */
  audience?: "user" | "platform";
  /** Qué se muestra: lo que salió del stock (consumo) o todo lo que se cargó (ingresos). */
  kind?: "consumo" | "ingresos";
  /** Si la página elige el período para varios paneles a la vez, lo pasa acá y el panel no muestra su propio selector. */
  period?: TrendPeriod;
  onPeriodChange?: (period: TrendPeriod) => void;
  /** Sin los rankings de productos (los del detalle de un usuario muestran solo los gráficos). */
  showTop?: boolean;
  /** Más baja: el gráfico y los espacios se achican (el detalle de un usuario). */
  compact?: boolean;
  /** Los cuadros de arriba dicen «Productos consumidos» / «Productos ingresados», con letra un poco más grande. */
  productLabels?: boolean;
  /** Se agrega al final de lo que pasó cada día («Se consumieron 5 unidades entre todos los usuarios de la plataforma»). */
  scopeText?: string;
}

/** Textos y datos de cada variante del panel. */
const KINDS = {
  consumo: {
    prefix: "trends",
    series: (m: MyMetrics) => m.consumo_por_dia,
    total: (m: MyMetrics) => m.total_consumido,
    tone: "text-primary",
    bar: "bg-primary hover:bg-primary/80",
    barSelected: "bg-[#237EA1]",
    fill: "bg-primary",
    chartTitle: "Consumo por día",
    average: "Promedio de consumidos por día",
    peak: "Día de mayor consumo",
    none: "Sin consumo",
    empty: (period: number) => `No hubo consumo en estos ${period} días.`,
    dayEmpty: "Ese día no hubo consumo",
    day: (n: number) => `${n === 1 ? "Se consumió" : "Se consumieron"} ${unitsText(n)}`,
    compare: "Todavía no hay consumo en el período anterior para comparar.",
  },
  ingresos: {
    prefix: "incomes",
    series: (m: MyMetrics) => m.ingresos_por_dia,
    total: (m: MyMetrics) => m.total_ingresos,
    tone: "text-[#1B3A8F]",
    bar: "bg-[#1B3A8F] hover:bg-[#1B3A8F]/80",
    barSelected: "bg-[#237EA1]",
    fill: "bg-[#1B3A8F]",
    chartTitle: "Ingresos por día",
    average: "Promedio de ingresos por día",
    peak: "Día de mayor ingreso",
    none: "Sin ingresos",
    empty: (period: number) => `No hubo ingresos de stock en estos ${period} días.`,
    dayEmpty: "Ese día no ingresó stock",
    day: (n: number) => `${n === 1 ? "Ingresó" : "Ingresaron"} ${unitsText(n)}`,
    compare: "Todavía no hubo ingresos en el período anterior para comparar.",
  },
} as const;

/**
 * Las tendencias, como en la app: períodos de 7, 14, 30 o 90 días, un gráfico por día que se ve entero (sin desplazarse),
 * el detalle del día elegido con flechas para ir y volver, el día de mayor valor y, en el consumo, los 5 productos más
 * consumidos. Hay dos variantes: de consumo (lo que salió) y de ingresos (reposiciones y productos nuevos). Se usa
 * dentro de una ventana (inicio) y como página (Tendencias).
 */
export default function TrendsPanel({
  endpoint = "/me/metrics",
  audience = "user",
  kind = "consumo",
  period: controlled,
  onPeriodChange,
  showTop = true,
  compact = false,
  productLabels = false,
  scopeText,
}: Props) {
  const chartHeight = compact ? COMPACT_CHART_HEIGHT : CHART_HEIGHT;
  const [ownPeriod, setOwnPeriod] = useState<TrendPeriod>(DEFAULT_PERIOD);
  const [selected, setSelected] = useState<number | null>(null);
  // La barra sobre la que está el mouse (o que tiene el foco): muestra lo que pasó ese día
  const [hovered, setHovered] = useState<number | null>(null);
  const k = KINDS[kind];
  const t = (name: string) => `${k.prefix}-${name}`;
  const period = controlled ?? ownPeriod;
  const setPeriod = onPeriodChange ?? setOwnPeriod;
  const picker = controlled === undefined ? <PeriodPicker period={period} onChange={setPeriod} /> : null;

  // El período anterior es lo que se consumió en el doble de días menos lo de este período
  const current = useQuery({
    queryKey: ["trends", endpoint, period],
    queryFn: async () => (await api.get<MyMetrics>(endpoint, { params: { period } })).data,
  });
  const wide = useQuery({
    queryKey: ["trends", endpoint, period * 2],
    queryFn: async () => (await api.get<MyMetrics>(endpoint, { params: { period: period * 2 } })).data,
  });

  const data = current.data;
  const days = data ? k.series(data) : [];
  const peak = peakIndex(days);

  // Al cambiar de período (o llegar los datos) arranca en el día de mayor valor, o en el último si no hubo ninguno
  useEffect(() => {
    if (data) {
      const series = k.series(data);
      setSelected(peakIndex(series) ?? Math.max(0, series.length - 1));
    }
  }, [data, k]);

  if (current.isLoading) {
    return (
      <div>
        {picker}
        <Spinner />
      </div>
    );
  }

  if (current.isError || !data) {
    return (
      <div className="space-y-4 py-8 text-center">
        <p className="text-sm text-danger">No se pudieron cargar las tendencias.</p>
        <Button tone="outline" onClick={() => current.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const total = k.total(data);
  const previousTotal = wide.data ? k.total(wide.data) - total : null;
  const change = changeVsPrevious(total, previousTotal);
  const max = Math.max(0, ...days.map((d) => d.quantity));
  const chosen = selected !== null ? days[selected] : undefined;
  const segments = monthSegments(days);
  // Con 90 barras se rotula una por semana
  const labelEvery = period >= 60 ? 7 : period > 14 ? 2 : 1;
  const who =
    kind === "consumo"
      ? audience === "user" ? "Consumiste" : "Se consumió"
      : audience === "user" ? "Ingresaste" : "Ingresó";

  const dayText = (quantity: number) => `${k.day(quantity)}${scopeText ? ` ${scopeText}` : ""}`;

  const goToDay = (step: number) => setSelected((index) => (index === null ? index : Math.min(days.length - 1, Math.max(0, index + step))));

  return (
    <div className={compact ? "space-y-3" : "space-y-5"} data-testid={t("panel")}>
      {picker}

      <div className="grid grid-cols-2 gap-3">
        {kind === "consumo" ? (
          <SummaryCard testId="trends-consumed" value={formatThousands(data.total_consumido)} label={productLabels ? "Productos consumidos" : "Consumido"} tone={k.tone} wide large={productLabels} dense={compact} />
        ) : (
          <SummaryCard testId="incomes-total" value={formatThousands(total)} label={productLabels ? "Productos ingresados" : "Ingresado"} tone={k.tone} wide large={productLabels} dense={compact} />
        )}
        <SummaryCard testId={t("average")} value={formatThousands(averagePerDay(total, period))} label={k.average} tone={k.tone} twoLines dense={compact} />
        <SummaryCard
          testId={t("peak")}
          value={peak !== null ? formatThousands(days[peak].quantity) : "–"}
          label={`${k.peak}: ${peak !== null ? formatDayMonth(days[peak].day) : k.none}`}
          labelTestId={t("peak-label")}
          tone={k.tone}
          twoLines
          dense={compact}
        />
      </div>

      <ChangeBox change={change} days={period} who={who} testId={t("change")} emptyText={k.compare} />

      <Card className={compact ? "!p-3" : "!p-4"}>
        <h3 className={`${compact ? "mb-2" : "mb-3"} text-center text-sm font-semibold text-ink`}>{k.chartTitle}</h3>
        {max === 0 ? (
          <p data-testid={t("empty-period")} className="mb-3 text-center text-sm text-muted">
            {k.empty(period)}
          </p>
        ) : null}

        <div data-testid={t("chart")} className="flex items-end gap-[3px]" style={{ height: chartHeight }}>
          {days.map((d, i) => (
            <button
              key={d.day}
              type="button"
              data-testid={t(`bar-${i}`)}
              aria-label={`${formatDayLong(d.day)}: ${unitsText(d.quantity)}`}
              aria-pressed={selected === i}
              onClick={() => setSelected(i)}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((current) => (current === i ? null : current))}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered((current) => (current === i ? null : current))}
              className="relative flex h-full min-w-0 flex-1 items-end"
            >
              {hovered === i && (
                <span
                  role="tooltip"
                  data-testid={t(`tooltip-${i}`)}
                  className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 w-max -translate-x-1/2 whitespace-nowrap border border-[#ccc] bg-white p-2.5 text-left text-sm leading-snug text-black"
                >
                  {/* Como en los gráficos del dashboard: el día y, debajo, la cantidad */}
                  <span data-testid={t(`tooltip-day-${i}`)} className="block">
                    {formatDayLong(d.day)}
                  </span>
                  <span data-testid={t(`tooltip-units-${i}`)} className={`block ${k.tone}`}>
                    {unitsText(d.quantity)}
                  </span>
                </span>
              )}
              <span
                data-testid={t(`bar-fill-${i}`)}
                className={`block w-full rounded-t-md transition ${
                  selected === i ? k.barSelected : d.quantity > 0 ? k.bar : "bg-line"
                }`}
                style={{ height: barHeight(d.quantity, max, chartHeight - 10) }}
              />
            </button>
          ))}
        </div>

        <div className="mt-1.5 flex gap-[3px]">
          {days.map((d, i) => (
            <span key={d.day} className="min-w-0 flex-1 text-center text-[10px] text-muted" data-testid={i % labelEvery === 0 ? t(`day-label-${i}`) : undefined}>
              {i % labelEvery === 0 ? Number(d.day.slice(8, 10)) : ""}
            </span>
          ))}
        </div>

        <div className="mt-1 flex border-t border-line/60 pt-1">
          {segments.map((segment) => (
            <span
              key={segment.key}
              data-testid={t(`month-${segment.key}`)}
              className="truncate text-center text-[11px] font-medium text-primaryDark"
              style={{ flexGrow: segment.count, flexBasis: 0 }}
            >
              <span>{segment.count >= 5 ? segment.long : segment.short}</span>
            </span>
          ))}
        </div>

        <div className={`${compact ? "mt-2 pt-2" : "mt-4 pt-3"} flex items-center gap-2 border-t border-line/60`}>
          <button
            type="button"
            data-testid={t("day-prev")}
            aria-label="Día anterior"
            disabled={!chosen || selected === 0}
            onClick={() => goToDay(-1)}
            className="rounded-full p-2 text-primaryDark transition hover:bg-primary/10 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={22} />
          </button>
          <div className={`${compact ? "min-h-[40px]" : "min-h-[52px]"} flex-1 text-center`}>
            {chosen && (
              <>
                <p data-testid={t("day-title")} className="text-sm font-bold text-ink">
                  {formatDayLong(chosen.day)}
                </p>
                <p data-testid={t("day-units")} className="mt-0.5 text-sm text-muted">
                  {chosen.quantity > 0 ? dayText(chosen.quantity) : k.dayEmpty}
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            data-testid={t("day-next")}
            aria-label="Día siguiente"
            disabled={!chosen || selected === days.length - 1}
            onClick={() => goToDay(1)}
            className="rounded-full p-2 text-primaryDark transition hover:bg-primary/10 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight size={22} />
          </button>
        </div>
      </Card>

      {kind === "ingresos" && showTop && <TopStock endpoint={endpoint} />}

      {kind === "consumo" && showTop && (
      <Card className="!p-4">
        <h3 className="mb-3 text-center text-sm font-semibold text-ink">Productos con más salidas</h3>
        {data.top_productos.length === 0 ? (
          <EmptyState>Todavía no hay suficiente historial.</EmptyState>
        ) : (
          <ol className="space-y-3">
            {data.top_productos.map((product, i) => {
              const top = data.top_productos[0].cantidad;
              return (
                <li key={product.product_id} data-testid={`trends-top-${i}`}>
                  <div className="flex items-baseline gap-2 text-sm">
                    <span className="w-5 font-bold text-primaryDark">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-ink" title={product.nombre}>
                      {product.nombre}
                    </span>
                    <span className="shrink-0 text-muted">{unitsText(product.cantidad)}</span>
                  </div>
                  {audience === "platform" && <OwnerEmail email={product.owner_email} testId={`trends-top-owner-${i}`} />}
                  <div className="ml-7 mt-1 h-2 rounded-full bg-canvas">
                    <div
                      data-testid={`trends-top-bar-${i}`}
                      className={`h-2 rounded-full ${k.fill}`}
                      style={{ width: `${Math.round((product.cantidad / top) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
      )}
    </div>
  );
}

/** El mail del usuario al que pertenece el producto, debajo de su nombre (solo en los rankings de toda la plataforma). */
function OwnerEmail({ email, testId }: { email?: string | null; testId: string }) {
  return (
    <p data-testid={testId} className="ml-7 truncate text-xs text-muted" title={email ?? undefined}>
      {email ?? "Usuario sin cuenta"}
    </p>
  );
}

/** Los productos con más unidades en stock hoy: 5 los del usuario y 10 los de toda la plataforma (administrador). */
function TopStock({ endpoint }: { endpoint: string }) {
  const platform = endpoint === "/admin/metrics";
  const url = platform ? "/admin/products/" : "/me/products";
  const limit = platform ? 10 : 5;
  const top = useQuery({
    queryKey: ["top-stock", url],
    queryFn: async () =>
      (await api.get<Paginated<MyProduct | AdminProduct>>(url, { params: { sort_by: "stock", sort_dir: "desc", limit } })).data.items,
  });
  const items = (top.data ?? []).filter((product) => product.stock > 0).sort((a, b) => b.stock - a.stock);
  const highest = items[0]?.stock ?? 1;
  return (
    <Card className="!p-4" testId="incomes-top-stock">
      <h3 className="mb-3 text-center text-sm font-semibold text-ink">Productos con más stock</h3>
      {top.isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState>Todavía no hay productos con stock.</EmptyState>
      ) : (
        <ol className="space-y-3">
          {items.map((product, i) => (
            <li key={product.id} data-testid={`incomes-top-stock-${i}`}>
              <div className="flex items-baseline gap-2 text-sm">
                <span className="w-5 font-bold text-primaryDark">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-ink" title={product.nombre}>
                  {product.nombre}
                </span>
                <span className="shrink-0 text-muted">{unitsText(product.stock)}</span>
              </div>
              {platform && <OwnerEmail email={"owner" in product ? product.owner.email : null} testId={`incomes-top-stock-owner-${i}`} />}
              <div className="ml-7 mt-1 h-2 rounded-full bg-canvas">
                <div className="h-2 rounded-full bg-[#1B3A8F]" style={{ width: `${Math.round((product.stock / highest) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function PeriodPicker({
  period,
  onChange,
  periods = TREND_PERIODS,
}: {
  period: TrendPeriod;
  onChange: (period: TrendPeriod) => void;
  /** Los períodos que se ofrecen (por defecto, 7, 14, 30 y 90 días). */
  periods?: readonly TrendPeriod[];
}) {
  return (
    <div className="mb-4">
      <Segmented
        testIdPrefix="trends-period"
        value={period}
        onChange={onChange}
        options={periods.map((p) => ({ key: p, label: `${p} días` }))}
      />
    </div>
  );
}

function SummaryCard({
  testId,
  value,
  label,
  labelTestId,
  tone = "text-primary",
  twoLines = false,
  wide = false,
  large = false,
  dense = false,
}: {
  testId: string;
  value: string;
  label: string;
  labelTestId?: string;
  tone?: string;
  /** Reserva dos renglones para el rótulo: los que son más largos quedan del mismo alto que los otros. */
  twoLines?: boolean;
  /** Ocupa los dos lugares de la fila (cuando es la única tarjeta de su fila). */
  wide?: boolean;
  /** El rótulo con letra un poco más grande. */
  large?: boolean;
  /** Menos alto. */
  dense?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-line/60 bg-white px-3 text-center shadow-card ${dense ? "py-1" : "py-2"} ${wide ? "col-span-2" : ""}`}>
      <p data-testid={testId} className={`text-xl font-bold leading-7 ${tone}`}>
        {value}
      </p>
      <p
        data-testid={labelTestId}
        className={`${large ? "text-sm leading-5" : "text-xs leading-4"} text-muted ${twoLines ? "min-h-[2rem]" : ""}`}
      >
        {label}
      </p>
    </div>
  );
}

function ChangeBox({
  change,
  days,
  who,
  testId,
  emptyText,
}: {
  change: ReturnType<typeof changeVsPrevious>;
  days: number;
  who: string;
  testId: string;
  emptyText: string;
}) {
  if (!change) {
    return (
      <div data-testid={testId} className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-center text-sm text-muted shadow-card">
        <Equal size={16} /> {emptyText}
      </div>
    );
  }
  const text =
    change.direction === "same"
      ? `${who} lo mismo que en los ${days} días anteriores.`
      : `${who} ${change.percent}% ${change.direction === "up" ? "más" : "menos"} que en los ${days} días anteriores.`;
  const tone =
    change.direction === "up" ? "bg-warn/20 text-warnInk" : change.direction === "down" ? "bg-primary/15 text-tealInk" : "bg-white text-muted";
  const Icon = change.direction === "up" ? ArrowUpRight : change.direction === "down" ? ArrowDownRight : Equal;
  return (
    <div data-testid={testId} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-center text-sm font-medium shadow-card ${tone}`}>
      <Icon size={18} /> {text}
    </div>
  );
}
