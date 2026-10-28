import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Boxes, Clock, Cuboid, TrendingDown } from "lucide-react";
import { api } from "@/lib/api";
import type { AlertLevel, AlertList, AlertOut, MyMetrics, MyProduct, MyProfile, MyStats, Paginated, StockChange } from "@/lib/types";
import { formatDateTime, formatThousands } from "@/lib/format";
import { TREND_PERIODS, averagePerDay, formatDayLong, formatDayShort, peakIndex, type TrendPeriod } from "@/lib/trends";
import { Button, Card, EmptyState, Segmented, Spinner, StatTile } from "@/components/ui";
import AlertDetailModal from "@/components/AlertDetailModal";
import AlertRow from "@/components/AlertRow";
import ChangeRow from "@/components/ChangeRow";
import ChangesModal from "@/components/ChangesModal";
import ProductDetailModal from "@/components/ProductDetailModal";
import ProductRow from "@/components/ProductRow";
import TrendsModal from "@/components/TrendsModal";

const RECENT_CHANGES = 5;
const RECENT_PRODUCTS = 3;
const UPCOMING = 3;
// El nombre del saludo se corta, como en la app
const NAME_MAX = 20;

const TEAL = "#2CC4B4";
const BLUE = "#1B3A8F";
const RED = "#e5484d";
const YELLOW = "#fbbc05";
const PALETTE = [TEAL, BLUE, "#5BC0BE", "#3A86FF", "#8AC926", "#FFB703", "#FB5607"];

// Cada tramo de vencimiento con su color: de lo más urgente a lo más tranquilo
const BUCKET_COLORS: Record<string, string> = {
  Vencidos: RED,
  "0 a 7 días": "#f59e0b",
  "8 a 30 días": YELLOW,
  "31 a 90 días": TEAL,
  "Más de 90 días": BLUE,
  "Sin vencimiento": "#B8BFC9",
};

function Section({ title, hint, children, action, testId }: { title: string; hint?: string; children: React.ReactNode; action?: React.ReactNode; testId?: string }) {
  return (
    <Card testId={testId}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

/**
 * Dashboard del usuario: el estado de su inventario de un vistazo. Arriba, las cuatro tarjetas de la app (cada una lleva a
 * su pantalla); debajo, gráficos que se pueden recorrer y tocar (consumo por día, vencimientos, alertas, stock por
 * categoría y ubicación), lo próximo a vencer y a reponerse, y los últimos cambios y productos cargados.
 */
export default function MyDashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<TrendPeriod>(14);
  const [showTrends, setShowTrends] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [detail, setDetail] = useState<MyProduct | null>(null);
  const [alert, setAlert] = useState<AlertOut | null>(null);

  const stats = useQuery({
    queryKey: ["my-stats"],
    queryFn: async () => (await api.get<MyStats>("/me/stats")).data,
  });
  const profile = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => (await api.get<MyProfile>("/me/profile")).data,
  });
  const metrics = useQuery({
    queryKey: ["trends", "/me/metrics", period],
    queryFn: async () => (await api.get<MyMetrics>("/me/metrics", { params: { period } })).data,
  });
  const expiring = useQuery({
    queryKey: ["my-expiring", "vencimiento"],
    queryFn: async () => (await api.get<AlertList>("/me/alerts/", { params: { tipo: "vencimiento" } })).data.items,
  });
  const restock = useQuery({
    queryKey: ["my-expiring", "stock"],
    queryFn: async () => (await api.get<AlertList>("/me/alerts/", { params: { tipo: "stock" } })).data.items,
  });
  const changes = useQuery({
    queryKey: ["my-changes", RECENT_CHANGES],
    queryFn: async () => (await api.get<StockChange[]>("/me/changes", { params: { limit: RECENT_CHANGES } })).data,
  });
  const recent = useQuery({
    queryKey: ["my-recent-products", RECENT_PRODUCTS],
    queryFn: async () => (await api.get<Paginated<MyProduct>>("/me/products", { params: { limit: RECENT_PRODUCTS } })).data.items,
  });

  if (stats.isLoading) return <Spinner />;
  if (stats.isError || !stats.data) {
    return <p className="text-danger">No se pudo cargar el estado de tu inventario.</p>;
  }

  const data = stats.data;
  const name = profile.data?.first_name?.trim();
  const greeting = name ? `Bienvenido, ${name.length > NAME_MAX ? `${name.slice(0, NAME_MAX)}...` : name}` : "Bienvenido";
  // Las tarjetas y los gráficos de alertas abren el Centro de Alertas con esa opción ya elegida
  const goToAlerts = (state: { tipo?: "stock" | "vencimiento"; level?: AlertLevel }) => navigate("/alertas", { state });
  const goToInventory = (state?: { categoria?: string; vencido?: "si"; porVencer?: boolean }) => navigate("/productos", { state });

  const days = metrics.data?.consumo_por_dia ?? [];
  const peak = peakIndex(days);
  const consumed = metrics.data?.total_consumido ?? 0;
  const alertSlices = [
    { key: "critical" as const, label: "Críticas", value: data.critical_alerts, color: RED },
    { key: "warning" as const, label: "Advertencias", value: data.warning_alerts, color: YELLOW },
  ];
  const withAlerts = alertSlices.some((slice) => slice.value > 0);
  const categories = data.stock_by_category.slice(0, 6);
  const maxStock = Math.max(1, ...categories.map((c) => c.count));
  const noExpiry = data.expiry_buckets.every((bucket) => bucket.count === 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
        <p data-testid="dashboard-greeting" className="mt-1 text-sm text-muted">
          {greeting} · Tu estado
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          testId="stat-products"
          icon={Cuboid}
          tone="blue"
          title="Productos"
          value={formatThousands(data.total_products)}
          comment="Total inventario"
          solidComment
          onClick={() => goToInventory()}
        />
        <StatTile
          testId="stat-stock"
          icon={Boxes}
          tone="teal"
          accent="#2CC4B4"
          title="Productos en stock"
          value={formatThousands(data.total_units)}
          comment="Total unidades"
          onClick={() => goToInventory()}
        />
        <StatTile
          testId="stat-expiring"
          icon={Clock}
          tone="yellow"
          title="Vencimientos"
          value={formatThousands(data.expiring_soon_products)}
          comment="Alertas de productos"
          onClick={() => goToAlerts({ tipo: "vencimiento" })}
        />
        <StatTile
          testId="stat-low"
          icon={TrendingDown}
          tone="red"
          title="Stock bajo"
          value={formatThousands(data.low_stock_products)}
          comment="Alertas de stock"
          onClick={() => goToAlerts({ tipo: "stock" })}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section
            testId="dashboard-consumption"
            title="Consumo por día"
            hint="Pasá el mouse por el gráfico para ver cada día"
            action={
              <Button tone="ghost" className="!px-3 !py-1.5" data-testid="home-trends" onClick={() => setShowTrends(true)}>
                <BarChart3 size={16} /> Tendencias
              </Button>
            }
          >
            <div className="mb-3">
              <Segmented
                testIdPrefix="dashboard-period"
                value={period}
                onChange={setPeriod}
                options={TREND_PERIODS.map((p) => ({ key: p, label: `${p} días` }))}
              />
            </div>
            {metrics.isLoading ? (
              <Spinner />
            ) : (
              <>
                <div data-testid="dashboard-consumption-chart" className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={days} margin={{ left: -20, right: 8, top: 8 }}>
                      <defs>
                        <linearGradient id="consumo" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={TEAL} stopOpacity={0.45} />
                          <stop offset="95%" stopColor={TEAL} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" vertical={false} />
                      <XAxis dataKey="day" tickFormatter={formatDayShort} fontSize={11} stroke="#6E6E6E" minTickGap={18} />
                      <YAxis allowDecimals={false} fontSize={11} stroke="#6E6E6E" />
                      <Tooltip labelFormatter={(day) => formatDayLong(String(day))} formatter={(value) => [`${value} unidades`, "Consumo"]} />
                      <Area type="monotone" dataKey="quantity" stroke={TEAL} strokeWidth={2.5} fill="url(#consumo)" activeDot={{ r: 5, fill: BLUE }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-3 text-center text-sm">
                  <div className="rounded-xl bg-canvas px-2 py-2">
                    <dt className="text-[11px] text-muted">Consumido</dt>
                    <dd data-testid="dashboard-consumed" className="font-bold text-primary">{formatThousands(consumed)}</dd>
                  </div>
                  <div className="rounded-xl bg-canvas px-2 py-2">
                    <dt className="text-[11px] text-muted">Promedio por día</dt>
                    <dd data-testid="dashboard-average" className="font-bold text-primaryDark">{formatThousands(averagePerDay(consumed, period))}</dd>
                  </div>
                  <div className="rounded-xl bg-canvas px-2 py-2">
                    <dt className="text-[11px] text-muted">Día de mayor consumo</dt>
                    <dd data-testid="dashboard-peak" className="font-bold text-ink">
                      {peak !== null ? `${formatDayShort(days[peak].day)} (${days[peak].quantity})` : "Sin consumo"}
                    </dd>
                  </div>
                </dl>
              </>
            )}
          </Section>
        </div>

        <Section testId="dashboard-alerts" title="Alertas" hint="Tocá un nivel para verlas">
          {withAlerts ? (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={alertSlices.filter((slice) => slice.value > 0)}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={42}
                    outerRadius={66}
                    paddingAngle={3}
                    onClick={(slice) => goToAlerts({ level: (slice as unknown as { key: AlertLevel }).key })}
                  >
                    {alertSlices.filter((slice) => slice.value > 0).map((slice) => (
                      <Cell key={slice.key} fill={slice.color} className="cursor-pointer" />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState>No tenés alertas: todo en orden.</EmptyState>
          )}
          <ul className="mt-2 space-y-2">
            {alertSlices.map((slice) => (
              <li key={slice.key}>
                <button
                  type="button"
                  data-testid={`dashboard-alerts-${slice.key}`}
                  onClick={() => goToAlerts({ level: slice.key })}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition hover:bg-canvas"
                >
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: slice.color }} />
                  <span className="flex-1 text-left text-muted">{slice.label}</span>
                  <span className="font-bold text-ink">{slice.value}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section testId="dashboard-expiry" title="Vencimientos" hint="Productos con stock, según cuándo vencen">
          {noExpiry ? (
            <EmptyState>Todavía no hay productos con stock.</EmptyState>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.expiry_buckets} margin={{ left: -20, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" vertical={false} />
                  <XAxis dataKey="label" fontSize={10} stroke="#6E6E6E" interval={0} />
                  <YAxis allowDecimals={false} fontSize={11} stroke="#6E6E6E" />
                  <Tooltip formatter={(value) => [`${value} productos`, "Cantidad"]} />
                  <Bar
                    dataKey="count"
                    radius={[6, 6, 0, 0]}
                    className="cursor-pointer"
                    onClick={(bucket) => {
                      const label = (bucket as unknown as { label: string }).label;
                      goToInventory(label === "Vencidos" ? { vencido: "si" } : label === "0 a 7 días" ? { porVencer: true } : undefined);
                    }}
                  >
                    {data.expiry_buckets.map((bucket) => (
                      <Cell key={bucket.label} fill={BUCKET_COLORS[bucket.label] ?? TEAL} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>

        <Section testId="dashboard-categories" title="Stock por categoría" hint="Unidades en stock; tocá una para ver sus productos">
          {categories.length === 0 ? (
            <EmptyState>Todavía no hay productos cargados.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {categories.map((category, i) => (
                <li key={category.label}>
                  <button
                    type="button"
                    data-testid={`dashboard-category-${i}`}
                    onClick={() => goToInventory({ categoria: category.label })}
                    className="block w-full text-left"
                  >
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium text-ink">{category.label}</span>
                      <span className="shrink-0 text-muted">{formatThousands(category.count)} u.</span>
                    </div>
                    <div className="mt-1 h-2.5 rounded-full bg-canvas">
                      <div
                        data-testid={`dashboard-category-bar-${i}`}
                        className="h-2.5 rounded-full transition-all"
                        style={{ width: `${Math.max(4, Math.round((category.count / maxStock) * 100))}%`, backgroundColor: PALETTE[i % PALETTE.length] }}
                      />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section testId="dashboard-locations" title="Dónde tenés tus productos" hint="Productos por ubicación">
          {data.products_by_location.length === 0 ? (
            <EmptyState>Todavía no hay productos cargados.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {data.products_by_location.slice(0, 6).map((place, i) => (
                <li key={place.label} className="flex items-center gap-2 text-sm" data-testid={`dashboard-location-${i}`}>
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                  <span className="flex-1 truncate text-muted">{place.label}</span>
                  <span className="font-bold text-ink">{place.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section testId="dashboard-extra" title="Un vistazo más" hint="Datos que no ves en la app del celular">
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Productos vencidos con stock</dt><dd data-testid="dashboard-expired" className="font-bold text-criticalInk">{data.expired_products}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Productos con imagen</dt><dd data-testid="dashboard-images" className="font-bold text-ink">{data.products_with_image} de {data.total_products}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Alertas críticas</dt><dd className="font-bold text-criticalInk">{data.critical_alerts}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Advertencias</dt><dd className="font-bold text-warnInk">{data.warning_alerts}</dd></div>
          </dl>
        </Section>

        <Section testId="dashboard-upcoming" title="Para atender primero" hint="Lo que vence y lo que se acaba">
          {(expiring.data ?? []).length + (restock.data ?? []).length === 0 ? (
            <EmptyState>Nada urgente por ahora.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {[...(expiring.data ?? []).slice(0, UPCOMING), ...(restock.data ?? []).slice(0, UPCOMING)].map((item) => (
                <AlertRow key={item.key} alert={item} onClick={() => setAlert(item)} compact />
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-label="Últimos Cambios">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">Últimos Cambios</h2>
            <Button tone="ghost" className="!px-3 !py-1.5" onClick={() => setShowChanges(true)}>
              Ver más
            </Button>
          </div>
          {changes.isLoading ? (
            <Spinner />
          ) : (changes.data ?? []).length === 0 ? (
            <Card>
              <EmptyState>Todavía no hay cambios de stock.</EmptyState>
            </Card>
          ) : (
            <ul className="space-y-3" data-testid="home-changes">
              {(changes.data ?? []).map((change) => (
                <ChangeRow key={change.id} change={change} />
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Productos Recientes">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">Productos Recientes</h2>
            <Button tone="ghost" className="!px-3 !py-1.5" onClick={() => goToInventory()}>
              Ver inventario
            </Button>
          </div>
          {recent.isLoading ? (
            <Spinner />
          ) : (recent.data ?? []).length === 0 ? (
            <Card>
              <EmptyState>No tenés productos cargados</EmptyState>
            </Card>
          ) : (
            <ul className="space-y-3" data-testid="home-recent">
              {(recent.data ?? []).map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  testId={`recent-${product.id}`}
                  caption={`Cargado el ${formatDateTime(product.created_at)}`}
                  onClick={() => setDetail(product)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {showTrends && <TrendsModal onClose={() => setShowTrends(false)} />}
      {showChanges && <ChangesModal onClose={() => setShowChanges(false)} />}
      {detail && <ProductDetailModal product={detail} onClose={() => setDetail(null)} />}
      {alert && <AlertDetailModal alert={alert} onClose={() => setAlert(null)} />}
    </div>
  );
}
