import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import type { MyMetrics } from "@/lib/types";
import { Card, PageHeader, Spinner, StatCard } from "@/components/ui";

const PERIODS = [
  { value: 7, label: "7 días" },
  { value: 30, label: "30 días" },
  { value: 90, label: "90 días" },
];

export default function Metricas() {
  const [period, setPeriod] = useState(30);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-metrics", period],
    queryFn: async () => (await api.get<MyMetrics>("/me/metrics", { params: { period } })).data,
  });

  return (
    <div>
      <PageHeader title="Métricas" subtitle="Consumo de tu inventario a lo largo del tiempo" />

      <div className="mb-4 flex gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              period === p.value ? "bg-primary text-white" : "bg-canvas text-muted hover:text-primaryDark"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError || !data ? (
        <p className="text-danger">No se pudieron cargar las métricas.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard label="Consumido en el período" value={data.total_consumido} accent="danger" />
            <StatCard label="Entradas en el período" value={data.total_entradas} accent="primaryDark" />
          </div>

          <div className="mt-4">
            <Card>
              <h2 className="mb-4 text-base font-semibold">Consumo por día</h2>
              {data.total_consumido === 0 ? (
                <p className="py-12 text-center text-sm text-muted">Sin consumo registrado todavía</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.consumo_por_dia}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
                    <XAxis
                      dataKey="day"
                      tickFormatter={(d) => d.slice(5)}
                      fontSize={11}
                      stroke="#6E6E6E"
                    />
                    <YAxis allowDecimals={false} fontSize={11} stroke="#6E6E6E" />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="quantity"
                      name="Cantidad"
                      stroke="#2CC4B4"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-4 text-base font-semibold">Más utilizados</h2>
              {data.top_productos.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">Sin datos todavía</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.top_productos} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
                    <XAxis type="number" allowDecimals={false} fontSize={11} stroke="#6E6E6E" />
                    <YAxis
                      type="category"
                      dataKey="nombre"
                      width={140}
                      fontSize={11}
                      stroke="#6E6E6E"
                      tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 18)}…` : v)}
                    />
                    <Tooltip />
                    <Bar dataKey="cantidad" name="Cantidad" fill="#2CC4B4" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card>
              <h2 className="mb-4 text-base font-semibold">Menos utilizados</h2>
              {data.productos_menos_usados.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">
                  {data.top_productos.length === 0 ? "Sin datos todavía" : "No hay suficientes productos para comparar"}
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.productos_menos_usados} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
                    <XAxis type="number" allowDecimals={false} fontSize={11} stroke="#6E6E6E" />
                    <YAxis
                      type="category"
                      dataKey="nombre"
                      width={140}
                      fontSize={11}
                      stroke="#6E6E6E"
                      tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 18)}…` : v)}
                    />
                    <Tooltip />
                    <Bar dataKey="cantidad" name="Cantidad" fill="#FB5607" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
