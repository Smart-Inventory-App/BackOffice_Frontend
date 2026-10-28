import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Boxes, Clock, Cuboid, TrendingDown, Users } from "lucide-react";
import { api } from "@/lib/api";
import type { DashboardStats } from "@/lib/types";
import { formatThousands } from "@/lib/format";
import { clearWelcome } from "@/lib/welcome";
import { Button, Card, PageHeader, Spinner, StatCard, StatTile } from "@/components/ui";

const CATEGORY_COLORS = ["#2CC4B4", "#1B3A8F", "#5BC0BE", "#3A86FF", "#8AC926", "#FFB703", "#FB5607"];

/**
 * Dashboard de la plataforma. Las cuatro tarjetas de arriba tienen el formato de las del inicio de la app; los números de
 * alertas salen de las mismas reglas que ven los usuarios (cada uno con las suyas), no de un límite fijo.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  // El aviso de «recién ingresó» es de un solo uso: ya pasó por el dashboard
  useEffect(() => {
    clearWelcome();
  }, []);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["stats"],
    queryFn: async () => (await api.get<DashboardStats>("/admin/stats/")).data,
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <p className="text-danger">No se pudieron cargar las métricas.</p>;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Estado general de la plataforma Smart Inventory"
        actions={
          <Button tone="outline" onClick={() => navigate("/metricas")}>
            Ver tendencias de consumo
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          testId="stat-users"
          icon={Users}
          tone="blue"
          title="Usuarios"
          value={formatThousands(data.total_users)}
          comment={`${data.new_users_last_7d} nuevos (7 días)`}
          solidComment
          onClick={() => navigate("/usuarios")}
        />
        <StatTile
          testId="stat-products"
          icon={Cuboid}
          tone="teal"
          title="Productos"
          value={formatThousands(data.total_products)}
          comment={`${formatThousands(data.total_units)} unidades`}
          onClick={() => navigate("/productos")}
        />
        <StatTile
          testId="stat-expiring"
          icon={Clock}
          tone="yellow"
          title="Vencimientos"
          value={formatThousands(data.expiring_soon_products)}
          comment={`${data.expired_products} ya vencidos`}
          onClick={() => navigate("/productos")}
        />
        <StatTile
          testId="stat-low"
          icon={TrendingDown}
          tone="red"
          title="Stock bajo"
          value={formatThousands(data.low_stock_products)}
          comment="Alertas de stock"
          onClick={() => navigate("/productos")}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Usuarios activos" value={data.active_users} accent="primaryDark" hint={`${data.inactive_users} deshabilitados`} />
        <StatCard label="Con imagen" value={data.products_with_image} hint={`de ${data.total_products} productos`} />
        <StatCard label="Consumido (7 días)" value={formatThousands(data.consumed_last_7d)} accent="danger" />
        <StatCard label="Repuesto (7 días)" value={formatThousands(data.restocked_last_7d)} accent="primaryDark" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-base font-semibold">Productos cargados (últimos 14 días)</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.products_per_day_last_14d}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
              <XAxis dataKey="day" tickFormatter={(d) => d.slice(5)} fontSize={11} stroke="#6E6E6E" />
              <YAxis allowDecimals={false} fontSize={11} stroke="#6E6E6E" />
              <Tooltip />
              <Line type="monotone" dataKey="count" name="Productos" stroke="#2CC4B4" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h2 className="mb-4 text-base font-semibold">Productos por categoría</h2>
          {data.products_by_category.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">Sin datos todavía</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.products_by_category}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
                <XAxis dataKey="label" fontSize={11} stroke="#6E6E6E" />
                <YAxis allowDecimals={false} fontSize={11} stroke="#6E6E6E" />
                <Tooltip />
                <Bar dataKey="count" name="Cantidad" radius={[6, 6, 0, 0]}>
                  {data.products_by_category.map((_, i) => (
                    <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-base font-semibold">Alertas de inventario</h2>
          <p className="mb-4 text-xs text-muted">Con las reglas de cada usuario: se avisa con menos de N días de vencimiento o de cobertura.</p>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-muted">
                <span className="h-3 w-3 rounded-full bg-critical" /> Críticas
              </span>
              <span data-testid="alerts-critical" className="font-semibold text-criticalInk">{data.critical_alerts}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-muted">
                <span className="h-3 w-3 rounded-full bg-warn" /> Advertencias
              </span>
              <span data-testid="alerts-warning" className="font-semibold text-warnInk">{data.warning_alerts}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-muted">
                <Boxes size={14} /> Usuarios con alertas
              </span>
              <span data-testid="alerts-users" className="font-semibold text-primaryDark">{data.users_with_alerts}</span>
            </li>
          </ul>
        </Card>

        <Card>
          <h2 className="mb-4 text-base font-semibold">Usuarios con más productos</h2>
          {data.top_users_by_products.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Sin datos todavía</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.top_users_by_products.map((u) => (
                <li key={u.user_id} className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => navigate(`/usuarios/${u.user_id}`)}
                    className="truncate text-left text-ink hover:text-primaryDark hover:underline"
                  >
                    {u.email ?? u.user_id}
                  </button>
                  <span className="font-semibold text-primaryDark">{u.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
