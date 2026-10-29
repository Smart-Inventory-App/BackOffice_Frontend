import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Cuboid, UserCheck, Users } from "lucide-react";
import { api } from "@/lib/api";
import type { OCRServiceStatus, PlatformOverview } from "@/lib/types";
import { formatDateTime, formatThousands } from "@/lib/format";
import { clearWelcome } from "@/lib/welcome";
import { TREND_PERIODS, type TrendPeriod } from "@/lib/trends";
import { Badge, Button, Card, EmptyState, Spinner, StatTile } from "@/components/ui";
import { PeriodPicker } from "@/components/TrendsPanel";

const COLORS = {
  primary: "#2CC4B4",
  blue: "#1B3A8F",
  sky: "#3A86FF",
  red: "#e5484d",
  yellow: "#fbbc05",
  green: "#8AC926",
};
const CHART_HEIGHT = 300;
const ACTIVITY_SERIES = [
  { name: "Inicios de sesión", color: COLORS.blue },
  { name: "Entradas de stock", color: COLORS.primary },
  { name: "Salidas de stock", color: COLORS.yellow },
];
const DOC_TYPE_LABELS: Record<string, string> = {
  barcode: "Código de barras",
  product_label: "Etiqueta de producto",
  expiry_date: "Fechas de vencimiento",
  receipt: "Comprobante",
};

const percentOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

function Section({
  title,
  hint,
  testId,
  action,
  fill = false,
  children,
}: {
  title: string;
  hint?: string;
  testId: string;
  action?: ReactNode;
  /** El contenido se reparte a lo alto de todo el espacio de la tarjeta (que mide lo mismo que las de su fila). */
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <Card testId={testId} className={fill ? "flex flex-col" : ""}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      {fill ? <div className="flex flex-1 flex-col justify-between gap-3">{children}</div> : children}
    </Card>
  );
}

/** La leyenda de un gráfico, con los nombres bien separados entre sí. */
function SpacedLegend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <ul data-testid="activity-legend" className="mt-2 flex flex-wrap justify-center gap-x-12 gap-y-1 text-xs text-ink">
      {items.map((item) => (
        <li key={item.name} className="inline-flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
          {item.name}
        </li>
      ))}
    </ul>
  );
}

function Mini({ testId, label, value, tone = "text-ink" }: { testId: string; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-canvas px-3 py-2 text-center">
      <p data-testid={testId} className={`text-lg font-bold ${tone}`}>
        {value}
      </p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}

function Bar100({ testId, label, percent, detail, color }: { testId: string; label: string; percent: number; detail: string; color: string }) {
  return (
    <div data-testid={testId}>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink">{label}</span>
        <span className="text-xs text-muted">{detail}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-canvas">
        <div className="h-2 rounded-full" style={{ width: `${Math.min(100, percent)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

/**
 * Dashboard del administrador: tres tarjetas (usuarios totales, usuarios activos y productos totales), el crecimiento de
 * usuarios y la actividad de la plataforma, las entradas y salidas de productos por día junto a los usuarios más activos,
 * y el rendimiento del OCR, el estado de los servicios y la calidad de los datos. Todo sobre el período que se elija
 * (7, 14, 30 o 90 días).
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<TrendPeriod>(14);
  // El aviso de «recién ingresó» es de un solo uso: ya pasó por el dashboard
  useEffect(() => {
    clearWelcome();
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["platform-overview", period],
    queryFn: async () => (await api.get<PlatformOverview>("/admin/stats/overview", { params: { period } })).data,
  });
  // Los servicios pueden estar caídos: eso es justamente lo que se quiere ver, así que no reintenta ni rompe la pantalla
  const ocrStatus = useQuery({
    queryKey: ["dashboard-ocr-status"],
    queryFn: async () => (await api.get<OCRServiceStatus>("/admin/ocr/status")).data,
    retry: false,
  });
  const models = useQuery({
    queryKey: ["dashboard-ml-models"],
    queryFn: async () =>
      (await api.get<{ id: string; model_type?: string; trained_at: string; mae: number; mape: number; status: string }[]>("/admin/ml/models")).data,
    retry: false,
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <p className="text-danger">No se pudieron cargar las métricas.</p>;

  const { users, inventory, ocr } = data;
  const activeModel = (Array.isArray(models.data) ? models.data : []).find((m) => m.status === "active");

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Estado general y rendimiento de la plataforma Smart Inventory</p>
        </div>
        <div data-testid="dashboard-period-picker" className="[&>div]:mb-0">
          <PeriodPicker period={period} onChange={setPeriod} periods={TREND_PERIODS} />
        </div>
      </div>

      {/* ── Tres tarjetas, en una sola fila */}
      <div data-testid="dashboard-tiles" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          testId="stat-users"
          icon={Users}
          tone="blue"
          title="Usuarios totales"
          value={formatThousands(users.total)}
          comment={`${users.new_in_period} ${users.new_in_period === 1 ? "usuario nuevo" : "usuarios nuevos"}`}
          solidComment
          onClick={() => navigate("/usuarios")}
        />
        <StatTile
          testId="stat-active"
          icon={UserCheck}
          tone="teal"
          title="Usuarios activos"
          value={formatThousands(users.active_in_period)}
          comment={`${percentOf(users.active_in_period, users.active)}% de los habilitados`}
          onClick={() => navigate("/usuarios")}
        />
        <StatTile
          testId="stat-products"
          icon={Cuboid}
          tone="teal"
          title="Productos totales"
          value={formatThousands(inventory.products)}
          comment={`${formatThousands(inventory.units)} ${inventory.units === 1 ? "unidad" : "unidades"} en stock`}
          onClick={() => navigate("/productos")}
        />
      </div>

      {/* ── Usuarios y actividad */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section testId="section-registrations" title="Crecimiento de usuarios" hint={`Registros por día en los últimos ${period} días`}>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={users.registrations_per_day}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
              <XAxis dataKey="day" tickFormatter={shortDay} fontSize={11} stroke="#6E6E6E" interval="preserveStartEnd" />
              <YAxis allowDecimals={false} fontSize={11} stroke="#6E6E6E" />
              <Tooltip labelFormatter={(d) => shortDay(String(d))} />
              <Line type="monotone" dataKey="count" name="Usuarios nuevos" stroke={COLORS.blue} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Section>

        <Section testId="section-activity" title="Actividad de la plataforma" hint="Inicios de sesión y movimientos de stock por día">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={data.activity_per_day}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
              <XAxis dataKey="day" tickFormatter={shortDay} fontSize={11} stroke="#6E6E6E" interval="preserveStartEnd" />
              <YAxis allowDecimals={false} fontSize={11} stroke="#6E6E6E" />
              <Tooltip labelFormatter={(d) => shortDay(String(d))} />
              <Legend content={() => <SpacedLegend items={ACTIVITY_SERIES} />} />
              <Bar dataKey="logins" name="Inicios de sesión" stackId="a" fill={COLORS.blue} />
              <Bar dataKey="entradas" name="Entradas de stock" stackId="a" fill={COLORS.primary} />
              <Bar dataKey="salidas" name="Salidas de stock" stackId="a" fill={COLORS.yellow} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      </div>

      {/* ── Rendimiento del sistema */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section testId="section-ocr" title="Rendimiento del OCR" hint={`Escaneos de los últimos ${period} días`}>
          <div className="grid grid-cols-2 gap-2">
            <Mini testId="ocr-runs" label="Escaneos" value={formatThousands(ocr.runs)} />
            <Mini testId="ocr-success" label="Exitosos" value={`${percentOf(ocr.succeeded, ocr.runs)}%`} tone="text-primaryDark" />
            <Mini testId="ocr-ms" label="Tiempo promedio" value={ocr.avg_ms == null ? "—" : ocr.avg_ms >= 1000 ? `${(ocr.avg_ms / 1000).toFixed(1)} s` : `${ocr.avg_ms} ms`} />
            <Mini testId="ocr-confidence" label="Confianza promedio" value={ocr.avg_confidence == null ? "—" : `${Math.round(ocr.avg_confidence * 100)}%`} />
          </div>
          {ocr.by_type.length > 0 && (
            <ul className="mt-3 space-y-2 text-sm">
              {ocr.by_type.map((t) => (
                <li key={t.doc_type} data-testid={`ocr-type-${t.doc_type}`} className="flex items-center justify-between">
                  <span className="text-muted">{DOC_TYPE_LABELS[t.doc_type] ?? t.doc_type}</span>
                  <span className="text-xs text-ink">
                    {t.ejecuciones} · {percentOf(t.exitosas, t.ejecuciones)}% ok
                  </span>
                </li>
              ))}
            </ul>
          )}
          {ocr.runs === 0 && <p className="mt-3 text-center text-xs text-muted">Nadie escaneó nada en este período.</p>}
        </Section>

        <Section testId="section-services" title="Estado de los servicios" hint="Disponibilidad del OCR y del modelo de predicción">
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-ink">
                <Activity size={14} className="text-muted" /> OCR
              </span>
              <span data-testid="service-ocr">
                {ocrStatus.isLoading ? (
                  <span className="text-xs text-muted">Consultando…</span>
                ) : ocrStatus.isError ? (
                  <Badge tone="off">No disponible</Badge>
                ) : ocrStatus.data?.available ? (
                  <Badge tone="ok">Disponible</Badge>
                ) : (
                  <Badge tone="off">Caído</Badge>
                )}
              </span>
            </li>
            {(ocrStatus.data?.engines ?? []).map((engine) => (
              <li key={engine.name} data-testid={`service-engine-${engine.name}`} className="flex items-center justify-between gap-2 pl-6">
                <span className="text-xs text-muted">{engine.name}</span>
                <Badge tone={engine.available ? "ok" : "off"}>{engine.available ? "Activo" : "Inactivo"}</Badge>
              </li>
            ))}
            <li className="flex items-center justify-between gap-2 border-t border-line/60 pt-3">
              <span className="inline-flex items-center gap-2 text-ink">
                <Activity size={14} className="text-muted" /> Modelo de predicción
              </span>
              <span data-testid="service-ml">
                {models.isLoading ? (
                  <span className="text-xs text-muted">Consultando…</span>
                ) : models.isError ? (
                  <Badge tone="off">No disponible</Badge>
                ) : activeModel ? (
                  <Badge tone="ok">{(activeModel.model_type ?? "gbm").toUpperCase()} activo</Badge>
                ) : (
                  <Badge tone="warn">Sin modelo activo</Badge>
                )}
              </span>
            </li>
            {activeModel && (
              <li data-testid="service-ml-detail" className="space-y-1 pl-6 text-xs text-muted">
                <p data-testid="service-ml-trained">Entrenado el {formatDateTime(activeModel.trained_at)}</p>
                <p data-testid="service-ml-mae">Error medio {activeModel.mae.toFixed(2)} u/sem</p>
                <p data-testid="service-ml-mape">MAPE {activeModel.mape}%</p>
              </li>
            )}
          </ul>
        </Section>

        <Section fill testId="section-quality" title="Adopción y calidad de datos" hint="Qué tan completo y usado está el sistema">
          {/* Los cinco campos, uno debajo del otro, repartidos a lo alto del espacio de la tarjeta */}
          <>
            <Bar100
              testId="quality-enabled"
              label="Usuarios habilitados"
              percent={percentOf(users.active, users.total)}
              detail={`${users.active} de ${users.total}`}
              color={COLORS.sky}
            />
            <Bar100
              testId="quality-with-products"
              label="Usuarios con productos"
              percent={percentOf(users.with_products, users.active)}
              detail={`${users.with_products} de ${users.active}`}
              color={COLORS.blue}
            />
            <Bar100
              testId="quality-active"
              label="Usuarios activos en el período"
              percent={percentOf(users.active_in_period, users.active)}
              detail={`${users.active_in_period} de ${users.active}`}
              color={COLORS.primary}
            />
            <Bar100
              testId="quality-image"
              label="Productos con imagen"
              percent={percentOf(inventory.with_image, inventory.products)}
              detail={`${inventory.with_image} de ${inventory.products}`}
              color={COLORS.green}
            />
            <Bar100
              testId="quality-expiry"
              label="Productos con vencimiento"
              percent={percentOf(inventory.products - inventory.without_expiry, inventory.products)}
              detail={`${inventory.products - inventory.without_expiry} de ${inventory.products}`}
              color={COLORS.yellow}
            />
          </>
        </Section>
      </div>

      {/* ── Los usuarios que más usan la plataforma, a todo el ancho */}
      <div className="mt-4">
        <Section
          testId="section-active-users"
          title="Usuarios más activos"
          hint={`Los usuarios con más movimientos de stock en el período: ${period} días`}
          action={
            <Button tone="ghost" className="!px-3 !py-1.5" onClick={() => navigate("/usuarios")}>
              Ver más
            </Button>
          }
        >
          {data.most_active_users.length === 0 ? (
            <EmptyState>Nadie movió stock en este período.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-center text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 text-left">Mail</th>
                    <th className="py-2">Nombre</th>
                    <th className="py-2">Usuario</th>
                    <th className="py-2">Movimientos</th>
                    <th className="py-2">Entradas</th>
                    <th className="py-2">Salidas</th>
                    <th className="py-2">Productos</th>
                    <th className="py-2">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {data.most_active_users.map((u) => (
                    <tr key={u.user_id} data-testid={`active-user-${u.user_id}`} className="border-b border-line/60 text-center last:border-0">
                      <td className="py-3 text-left">
                        <button
                          type="button"
                          onClick={() => navigate(`/usuarios/${u.user_id}`)}
                          className={`max-w-[260px] truncate text-left hover:underline ${u.is_active ? "text-primaryDark" : "text-danger"}`}
                          title={u.email ?? u.user_id}
                        >
                          {u.email ?? u.user_id}
                        </button>
                      </td>
                      <td className="max-w-[160px] truncate py-3 text-ink" title={u.name ?? ""}>{u.name || "—"}</td>
                      <td className="max-w-[140px] truncate py-3 text-ink" title={u.username ?? ""}>{u.username || "—"}</td>
                      <td className="py-3 font-semibold">{formatThousands(u.movements)}</td>
                      <td className="py-3 text-muted">{formatThousands(u.entries)}</td>
                      <td className="py-3 text-muted">{formatThousands(u.exits)}</td>
                      <td className="py-3 text-muted">{formatThousands(u.products)}</td>
                      <td className="py-3 text-muted">{formatThousands(u.units)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
