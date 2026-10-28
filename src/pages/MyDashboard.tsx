import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, BarChart3, Boxes, CalendarX2, Clock, Cuboid, Image as ImageIcon, Layers, ShieldAlert, Tag, TrendingDown, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { AlertList, AlertOut, MyMetrics, MyProduct, MyProfile, MyStats, Paginated, StockChange } from "@/lib/types";
import { formatDateTime, formatThousands } from "@/lib/format";
import { clearWelcome, justLoggedIn } from "@/lib/welcome";
import { TREND_PERIODS, averagePerDay, formatDayLong, formatDayShort, peakIndex, type TrendPeriod } from "@/lib/trends";
import { Button, Card, EmptyState, Segmented, Spinner, StatTile } from "@/components/ui";
import AlertDetailModal from "@/components/AlertDetailModal";
import AlertRow from "@/components/AlertRow";
import ChangeRow from "@/components/ChangeRow";
import ChangesModal from "@/components/ChangesModal";
import ProductDetailModal from "@/components/ProductDetailModal";
import ProductRow from "@/components/ProductRow";
import RankingModal from "@/components/RankingModal";

const RECENT_CHANGES = 5;
const RECENT_PRODUCTS = 5;
// Las categorías con más stock que se ven de entrada; el resto, en «Ver más»
const TOP_CATEGORIES = 5;
// Las alertas más pertinentes que se ven en «Para atender primero»; el resto, en el Centro de Alertas
const UPCOMING = 3;
// Las ubicaciones con más productos que se ven de entrada; el resto, en «Ver más»
const TOP_LOCATIONS = 5;
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

/** Las más urgentes primero: críticas antes que advertencias y, dentro de cada nivel, las que vencen o se agotan antes. */
function mostPertinent(items: AlertOut[]): AlertOut[] {
  const urgency = (a: AlertOut) => a.days_to_expiry ?? a.days_until_stockout ?? Number.MAX_SAFE_INTEGER;
  return [...items].sort((a, b) => Number(b.level === "critical") - Number(a.level === "critical") || urgency(a) - urgency(b));
}

/** Un renglón de «Un vistazo más»: un ícono de color, lo que se mide y su valor. */
function Fact({ icon: Icon, color, label, value, testId }: { icon: LucideIcon; color: string; label: string; value: React.ReactNode; testId: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-canvas px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${color}22`, color }}>
        <Icon size={18} />
      </span>
      <span className="flex-1 text-sm text-muted">{label}</span>
      <span data-testid={testId} className="text-base font-bold text-ink">
        {value}
      </span>
    </li>
  );
}

function Section({ title, hint, children, action, testId, fill = false }: { title: string; hint?: string; children: React.ReactNode; action?: React.ReactNode; testId?: string; fill?: boolean }) {
  return (
    <Card testId={testId} className={fill ? "flex h-full flex-col" : ""}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={fill ? "flex flex-1 flex-col" : ""}>{children}</div>
    </Card>
  );
}

/**
 * Dashboard del usuario: el estado de su inventario de un vistazo. Arriba, las cuatro tarjetas de la app (cada una lleva a
 * su pantalla); debajo, gráficos que se pueden recorrer y tocar (consumo e ingresos por día, vencimientos, stock por
 * categoría y ubicación), lo próximo a vencer y a reponerse, y los últimos cambios y productos cargados (hasta 5 cada uno).
 * El encabezado dice «Bienvenido» si la persona acaba de iniciar sesión y «Tu estado» si cambió de página y volvió.
 */
export default function MyDashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<TrendPeriod>(14);
  const [showChanges, setShowChanges] = useState(false);
  const [detail, setDetail] = useState<MyProduct | null>(null);
  const [alert, setAlert] = useState<AlertOut | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [showLocations, setShowLocations] = useState(false);
  // Se mira una sola vez al entrar y se borra: al volver a esta página ya no es «recién ingresó»
  const [justArrived] = useState(() => justLoggedIn());
  useEffect(() => {
    clearWelcome();
  }, []);

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
  const lead = justArrived ? "Bienvenido" : "Tu estado";
  const greeting = name ? `${lead}, ${name.length > NAME_MAX ? `${name.slice(0, NAME_MAX)}...` : name}` : lead;
  // Las tarjetas abren el Centro de Alertas con ese tipo ya elegido
  const goToAlerts = (state: { tipo?: "stock" | "vencimiento" }) => navigate("/alertas", { state });
  const goToInventory = (state?: { categoria?: string; ubicacion?: string; vencido?: "si"; porVencer?: boolean }) => navigate("/productos", { state });

  const days = metrics.data?.consumo_por_dia ?? [];
  const peak = peakIndex(days);
  const consumed = metrics.data?.total_consumido ?? 0;
  const incomeDays = metrics.data?.ingresos_por_dia ?? [];
  const incomePeak = peakIndex(incomeDays);
  const incomes = metrics.data?.total_ingresos ?? 0;
  const sortedCategories = [...data.stock_by_category].sort((a, b) => b.count - a.count);
  const categories = sortedCategories.slice(0, TOP_CATEGORIES);
  const sortedLocations = [...data.products_by_location].sort((a, b) => b.count - a.count);
  const locations = sortedLocations.slice(0, TOP_LOCATIONS);
  const upcoming = mostPertinent([...(expiring.data ?? []), ...(restock.data ?? [])]);
  const withoutExpiry = data.expiry_buckets.find((bucket) => bucket.label === "Sin vencimiento")?.count ?? 0;
  const unitsPerProduct = data.total_products > 0 ? Math.round((data.total_units / data.total_products) * 10) / 10 : 0;
  const maxStock = Math.max(1, ...categories.map((c) => c.count));
  const noExpiry = data.expiry_buckets.every((bucket) => bucket.count === 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
        <p data-testid="dashboard-greeting" className="mt-1 text-sm text-muted">
          {greeting}
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          testIdPrefix="dashboard-period"
          value={period}
          onChange={setPeriod}
          options={TREND_PERIODS.map((p) => ({ key: p, label: `${p} días` }))}
        />
        <Button tone="ghost" className="!px-3 !py-1.5" data-testid="home-trends" onClick={() => navigate("/metricas")}>
          <BarChart3 size={16} /> Tendencias
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section testId="dashboard-consumption" title="Consumo por día">
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

        <Section testId="dashboard-incomes" title="Ingresos por día">
          {metrics.isLoading ? (
            <Spinner />
          ) : (
            <>
              <div data-testid="dashboard-incomes-chart" className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={incomeDays} margin={{ left: -20, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="ingresos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={BLUE} stopOpacity={0.45} />
                        <stop offset="95%" stopColor={BLUE} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" vertical={false} />
                    <XAxis dataKey="day" tickFormatter={formatDayShort} fontSize={11} stroke="#6E6E6E" minTickGap={18} />
                    <YAxis allowDecimals={false} fontSize={11} stroke="#6E6E6E" />
                    <Tooltip labelFormatter={(day) => formatDayLong(String(day))} formatter={(value) => [`${value} unidades`, "Ingresos"]} />
                    <Area type="monotone" dataKey="quantity" stroke={BLUE} strokeWidth={2.5} fill="url(#ingresos)" activeDot={{ r: 5, fill: TEAL }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-center text-sm">
                <div className="rounded-xl bg-canvas px-2 py-2">
                  <dt className="text-[11px] text-muted">Ingresado</dt>
                  <dd data-testid="dashboard-incomes-total" className="font-bold text-primary">{formatThousands(incomes)}</dd>
                </div>
                <div className="rounded-xl bg-canvas px-2 py-2">
                  <dt className="text-[11px] text-muted">Promedio por día</dt>
                  <dd data-testid="dashboard-incomes-average" className="font-bold text-primaryDark">{formatThousands(averagePerDay(incomes, period))}</dd>
                </div>
                <div className="rounded-xl bg-canvas px-2 py-2">
                  <dt className="text-[11px] text-muted">Día de mayor ingreso</dt>
                  <dd data-testid="dashboard-incomes-peak" className="font-bold text-ink">
                    {incomePeak !== null ? `${formatDayShort(incomeDays[incomePeak].day)} (${incomeDays[incomePeak].quantity})` : "Sin ingresos"}
                  </dd>
                </div>
              </dl>
            </>
          )}
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

        <Section
          testId="dashboard-categories"
          title="Stock por categoría"
          hint="Las 5 con más unidades en stock; tocá una para ver sus productos"
          action={
            sortedCategories.length > TOP_CATEGORIES ? (
              <Button tone="ghost" className="!px-3 !py-1.5" data-testid="dashboard-categories-more" onClick={() => setShowCategories(true)}>
                Ver más
              </Button>
            ) : undefined
          }
        >
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

      <div className="mt-4 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <Section
          fill
          testId="dashboard-locations"
          title="Dónde tenés tus productos"
          hint="Las 5 ubicaciones con más productos"
          action={
            sortedLocations.length > TOP_LOCATIONS ? (
              <Button tone="ghost" className="!px-3 !py-1.5" data-testid="dashboard-locations-more" onClick={() => setShowLocations(true)}>
                Ver más
              </Button>
            ) : undefined
          }
        >
          {locations.length === 0 ? (
            <EmptyState>Todavía no hay productos cargados.</EmptyState>
          ) : (
            <ul className="flex flex-1 flex-col justify-between gap-2">
              {locations.map((place, i) => (
                <li key={place.label}>
                  <button
                    type="button"
                    data-testid={`dashboard-location-${i}`}
                    onClick={() => goToInventory({ ubicacion: place.label })}
                    className="flex w-full items-center gap-3 rounded-xl bg-canvas px-3 py-2.5 text-left transition hover:bg-primary/10"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: PALETTE[i % PALETTE.length] }}>
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate text-sm font-medium text-ink" title={place.label}>
                      {place.label}
                    </span>
                    <span className="shrink-0 text-sm font-bold text-ink">
                      {place.count} <span className="font-normal text-muted">{place.count === 1 ? "producto" : "productos"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section fill testId="dashboard-extra" title="Un vistazo más" hint="Datos adicionales del sistema">
          <ul className="flex flex-1 flex-col justify-between gap-2">
            <Fact icon={CalendarX2} color="#e5484d" label="Vencidos con stock" value={data.expired_products} testId="dashboard-expired" />
            <Fact icon={ShieldAlert} color="#e5484d" label="Alertas críticas" value={data.critical_alerts} testId="dashboard-critical" />
            <Fact icon={AlertTriangle} color="#f59e0b" label="Advertencias" value={data.warning_alerts} testId="dashboard-warnings" />
            <Fact icon={ImageIcon} color="#3A86FF" label="Productos con imagen" value={`${data.products_with_image} de ${data.total_products}`} testId="dashboard-images" />
            <Fact icon={Tag} color="#8AC926" label="Productos sin vencimiento" value={withoutExpiry} testId="dashboard-no-expiry" />
            <Fact icon={Layers} color="#2CC4B4" label="Unidades por producto" value={formatThousands(unitsPerProduct)} testId="dashboard-units-per-product" />
          </ul>
        </Section>

        <Section
          fill
          testId="dashboard-upcoming"
          title="Para atender primero"
          hint="Lo más urgente: lo que vence y lo que se acaba"
          action={
            upcoming.length > UPCOMING ? (
              <Button tone="ghost" className="!px-3 !py-1.5" data-testid="dashboard-upcoming-more" onClick={() => navigate("/alertas")}>
                Ver más
              </Button>
            ) : undefined
          }
        >
          {upcoming.length === 0 ? (
            <EmptyState>Nada urgente por ahora.</EmptyState>
          ) : (
            <ul className="flex flex-1 flex-col justify-between gap-2">
              {upcoming.slice(0, UPCOMING).map((item) => (
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

      {showCategories && (
        <RankingModal
          title="Stock por categoría"
          testId="categories-modal"
          items={sortedCategories}
          unit="u."
          empty="Todavía no hay productos cargados."
          colors={PALETTE}
          onSelect={(label) => goToInventory({ categoria: label })}
          onClose={() => setShowCategories(false)}
        />
      )}
      {showLocations && (
        <RankingModal
          title="Dónde tenés tus productos"
          testId="locations-modal"
          items={sortedLocations}
          unit="productos"
          empty="Todavía no hay productos cargados."
          colors={PALETTE}
          onSelect={(label) => goToInventory({ ubicacion: label })}
          onClose={() => setShowLocations(false)}
        />
      )}
      {showChanges && <ChangesModal onClose={() => setShowChanges(false)} />}
      {detail && <ProductDetailModal product={detail} onClose={() => setDetail(null)} />}
      {alert && <AlertDetailModal alert={alert} onClose={() => setAlert(null)} />}
    </div>
  );
}
