import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import type { MyStats } from "@/lib/types";
import { Card, PageHeader, Spinner, StatCard } from "@/components/ui";

const CATEGORY_COLORS = ["#2CC4B4", "#1B3A8F", "#5BC0BE", "#3A86FF", "#8AC926", "#FFB703", "#FB5607"];

export default function MyDashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-stats"],
    queryFn: async () => (await api.get<MyStats>("/me/stats")).data,
  });

  if (isLoading) return <Spinner />;
  if (isError || !data)
    return <p className="text-danger">No se pudieron cargar tus métricas.</p>;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Estado de tu inventario" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Productos cargados" value={data.total_products} hint={`${data.products_with_image} con imagen`} />
        <StatCard label="Stock bajo" value={data.low_stock_products} accent="danger" />
        <StatCard label="Próximos a vencer" value={data.expiring_soon_products} accent="danger" />
        <StatCard label="Vencidos" value={data.expired_products} accent="danger" />
      </div>

      <div className="mt-4">
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
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {data.products_by_category.map((_, i) => (
                    <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}
