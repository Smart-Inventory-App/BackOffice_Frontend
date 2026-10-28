import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Equal } from "lucide-react";
import { api } from "@/lib/api";
import type { MyMetrics } from "@/lib/types";
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
const DEFAULT_PERIOD: TrendPeriod = 14;

const unitsText = (n: number) => `${formatThousands(n)} ${n === 1 ? "unidad" : "unidades"}`;

interface Props {
  /** De dónde salen los datos: el consumo del usuario o el de toda la plataforma (administrador). */
  endpoint?: "/me/metrics" | "/admin/metrics";
  /** Quién consume: cambia la frase de la comparación («Consumiste...» o «Se consumió...»). */
  audience?: "user" | "platform";
}

/**
 * Las tendencias de consumo, como en la app: períodos de 7, 14 o 30 días, un gráfico por día que se ve entero (sin
 * desplazarse), el detalle del día elegido con flechas para ir y volver, el día de mayor consumo y los 5 productos más
 * consumidos. Se usa dentro de una ventana (inicio) y como página (Tendencias).
 */
export default function TrendsPanel({ endpoint = "/me/metrics", audience = "user" }: Props) {
  const [period, setPeriod] = useState<TrendPeriod>(DEFAULT_PERIOD);
  const [selected, setSelected] = useState<number | null>(null);

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
  const days = data?.consumo_por_dia ?? [];
  const peak = peakIndex(days);

  // Al cambiar de período (o llegar los datos) arranca en el día de mayor consumo, o en el último si no hubo consumo
  useEffect(() => {
    if (data) setSelected(peakIndex(data.consumo_por_dia) ?? Math.max(0, data.consumo_por_dia.length - 1));
  }, [data]);

  if (current.isLoading) {
    return (
      <div>
        <PeriodPicker period={period} onChange={setPeriod} />
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

  const previousTotal = wide.data ? wide.data.total_consumido - data.total_consumido : null;
  const change = changeVsPrevious(data.total_consumido, previousTotal);
  const max = Math.max(0, ...days.map((d) => d.quantity));
  const chosen = selected !== null ? days[selected] : undefined;
  const segments = monthSegments(days);
  const labelEvery = period > 14 ? 2 : 1;
  const who = audience === "user" ? "Consumiste" : "Se consumió";

  const goToDay = (step: number) => setSelected((index) => (index === null ? index : Math.min(days.length - 1, Math.max(0, index + step))));

  return (
    <div className="space-y-5" data-testid="trends-panel">
      <PeriodPicker period={period} onChange={setPeriod} />

      <div className="grid grid-cols-2 gap-3">
        <SummaryCard testId="trends-consumed" value={formatThousands(data.total_consumido)} label="Consumido" tone="text-primary" />
        <SummaryCard testId="trends-restocked" value={formatThousands(data.total_entradas)} label="Repuesto" tone="text-primaryDark" />
        <SummaryCard
          testId="trends-average"
          value={formatThousands(averagePerDay(data.total_consumido, period))}
          label="Promedio de consumidos por día"
          twoLines
        />
        <SummaryCard
          testId="trends-peak"
          value={peak !== null ? formatThousands(days[peak].quantity) : "–"}
          label={`Día de mayor consumo: ${peak !== null ? formatDayMonth(days[peak].day) : "Sin consumo"}`}
          labelTestId="trends-peak-label"
          twoLines
        />
      </div>

      <ChangeBox change={change} days={period} who={who} />

      <Card className="!p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Consumo por día</h3>
        {max === 0 ? (
          <p data-testid="trends-empty-period" className="mb-3 text-center text-sm text-muted">
            No hubo consumo en estos {period} días.
          </p>
        ) : null}

        <div data-testid="trends-chart" className="flex items-end gap-[3px]" style={{ height: CHART_HEIGHT }}>
          {days.map((d, i) => (
            <button
              key={d.day}
              type="button"
              data-testid={`trends-bar-${i}`}
              aria-label={`${formatDayLong(d.day)}: ${unitsText(d.quantity)}`}
              aria-pressed={selected === i}
              onClick={() => setSelected(i)}
              className="flex h-full min-w-0 flex-1 items-end"
            >
              <span
                data-testid={`trends-bar-fill-${i}`}
                className={`block w-full rounded-t-md transition ${
                  selected === i ? "bg-primaryDark" : d.quantity > 0 ? "bg-primary hover:bg-primary/80" : "bg-line"
                }`}
                style={{ height: barHeight(d.quantity, max, CHART_HEIGHT - 10) }}
              />
            </button>
          ))}
        </div>

        <div className="mt-1.5 flex gap-[3px]">
          {days.map((d, i) => (
            <span key={d.day} className="min-w-0 flex-1 text-center text-[10px] text-muted" data-testid={i % labelEvery === 0 ? `trends-day-label-${i}` : undefined}>
              {i % labelEvery === 0 ? Number(d.day.slice(8, 10)) : ""}
            </span>
          ))}
        </div>

        <div className="mt-1 flex border-t border-line/60 pt-1">
          {segments.map((segment) => (
            <span
              key={segment.key}
              data-testid={`trends-month-${segment.key}`}
              className="truncate text-center text-[11px] font-medium text-primaryDark"
              style={{ flexGrow: segment.count, flexBasis: 0 }}
            >
              <span>{segment.count >= 5 ? segment.long : segment.short}</span>
            </span>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-line/60 pt-3">
          <button
            type="button"
            data-testid="trends-day-prev"
            aria-label="Día anterior"
            disabled={!chosen || selected === 0}
            onClick={() => goToDay(-1)}
            className="rounded-full p-2 text-primaryDark transition hover:bg-primary/10 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="min-h-[52px] flex-1 text-center">
            {chosen && (
              <>
                <p data-testid="trends-day-title" className="text-sm font-bold text-ink">
                  {formatDayLong(chosen.day)}
                </p>
                <p data-testid="trends-day-units" className="mt-0.5 text-sm text-muted">
                  {chosen.quantity > 0
                    ? `${chosen.quantity === 1 ? "Se consumió" : "Se consumieron"} ${unitsText(chosen.quantity)}`
                    : "Ese día no hubo consumo"}
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            data-testid="trends-day-next"
            aria-label="Día siguiente"
            disabled={!chosen || selected === days.length - 1}
            onClick={() => goToDay(1)}
            className="rounded-full p-2 text-primaryDark transition hover:bg-primary/10 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight size={22} />
          </button>
        </div>
        <p data-testid="trends-day-hint" className="mt-1 text-center text-xs text-muted">
          Hacé clic en una barra o usá las flechas para ver cada día.
        </p>
      </Card>

      <Card className="!p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Más consumidos</h3>
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
                  <div className="ml-7 mt-1 h-2 rounded-full bg-canvas">
                    <div
                      data-testid={`trends-top-bar-${i}`}
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${Math.round((product.cantidad / top) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}

function PeriodPicker({ period, onChange }: { period: TrendPeriod; onChange: (period: TrendPeriod) => void }) {
  return (
    <div className="mb-4">
      <Segmented
        testIdPrefix="trends-period"
        value={period}
        onChange={onChange}
        options={TREND_PERIODS.map((p) => ({ key: p, label: `${p} días` }))}
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
}: {
  testId: string;
  value: string;
  label: string;
  labelTestId?: string;
  tone?: string;
  /** Reserva dos renglones para el rótulo: los que son más largos quedan del mismo alto que los otros. */
  twoLines?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line/60 bg-white p-4 shadow-card">
      <p data-testid={testId} className={`text-2xl font-bold ${tone}`}>
        {value}
      </p>
      <p
        data-testid={labelTestId}
        className={`mt-0.5 text-xs leading-4 text-muted ${twoLines ? "min-h-[2rem]" : ""}`}
      >
        {label}
      </p>
    </div>
  );
}

function ChangeBox({ change, days, who }: { change: ReturnType<typeof changeVsPrevious>; days: number; who: string }) {
  if (!change) {
    return (
      <div data-testid="trends-change" className="flex items-center gap-2 rounded-xl bg-white p-3 text-sm text-muted shadow-card">
        <Equal size={16} /> Todavía no hay consumo en el período anterior para comparar.
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
    <div data-testid="trends-change" className={`flex items-center gap-2 rounded-xl p-3 text-sm font-medium shadow-card ${tone}`}>
      <Icon size={18} /> {text}
    </div>
  );
}
