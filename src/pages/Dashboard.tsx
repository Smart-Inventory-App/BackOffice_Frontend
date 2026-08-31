import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import type { DashboardStats } from "@/lib/types";
import { Card, PageHeader, Spinner, StatCard } from "@/components/ui";

const CATEGORY_COLORS = ["#2CC4B4", "#1B3A8F", "#5BC0BE", "#3A86FF", "#8AC926", "#FFB703", "#FB5607"];

export default function Dashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["stats"],
    queryFn: async () => (await api.get<DashboardStats>("/admin/stats/")).data,
  });

  if (isLoading) return <Spinner />;
  if (isError || !data)
    return <p className="text-danger">No se pudieron cargar las métricas.</p>;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Estado general de la plataforma Smart Inventory"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Usuarios totales" value={data.total_users} hint={`${data.new_users_last_7d} nuevos (7 días)`} />
        <StatCard label="Usuarios activos" value={data.active_users} accent="primaryDark" hint={`${data.inactive_users} deshabilitados`} />
        <StatCard label="Productos cargados" value={data.total_products} hint={`${data.products_with_image} con imagen`} />
        <StatCard label="Próximos a vencer" value={data.expiring_soon_products} accent="danger" hint={`${data.expired_products} ya vencidos`} />
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
          <h2 className="mb-4 text-base font-semibold">Alertas de inventario</h2>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-muted">Stock bajo (≤ 1 unidad)</span>
              <span className="font-semibold text-danger">{data.low_stock_products}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-muted">Próximos a vencer (7 días)</span>
              <span className="font-semibold text-amber-600">{data.expiring_soon_products}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-muted">Vencidos</span>
              <span className="font-semibold text-danger">{data.expired_products}</span>
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
                  <span className="truncate text-ink">{u.email ?? u.user_id}</span>
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
