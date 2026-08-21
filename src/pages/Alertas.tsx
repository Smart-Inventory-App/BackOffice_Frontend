import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, PackageX } from "lucide-react";
import { api } from "@/lib/api";
import type { MyProduct, Paginated } from "@/lib/types";
import { Badge, Card, PageHeader, Spinner } from "@/components/ui";
import { truncate } from "@/lib/format";

function AlertSection({
  title,
  icon,
  tone,
  emptyText,
  items,
  isLoading,
  dateField,
}: {
  title: string;
  icon: ReactNode;
  tone: "off" | "warn";
  emptyText: string;
  items: MyProduct[];
  isLoading: boolean;
  dateField?: boolean;
}) {
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="ml-auto">
          <Badge tone={tone}>{items.length}</Badge>
        </span>
      </div>
      {isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {items.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink" title={p.nombre}>
                  {truncate(p.nombre)}
                </p>
                <p className="truncate text-xs text-muted" title={p.categoria}>
                  {p.categoria}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {dateField ? (
                  <span className="text-xs text-muted">{p.vencimiento}</span>
                ) : (
                  <Badge tone="off">{p.stock} en stock</Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function Alertas() {
  const bajoStock = useQuery({
    queryKey: ["alertas-bajo-stock"],
    queryFn: async () =>
      (
        await api.get<Paginated<MyProduct>>("/me/products", {
          params: { bajo_stock: true, limit: 100 },
        })
      ).data.items,
  });

  const porVencer = useQuery({
    queryKey: ["alertas-por-vencer"],
    queryFn: async () =>
      (
        await api.get<Paginated<MyProduct>>("/me/products", {
          params: { por_vencer: true, limit: 100 },
        })
      ).data.items,
  });

  const vencidos = useQuery({
    queryKey: ["alertas-vencidos"],
    queryFn: async () =>
      (
        await api.get<Paginated<MyProduct>>("/me/products", {
          params: { vencido: true, limit: 100 },
        })
      ).data.items,
  });

  return (
    <div>
      <PageHeader title="Alertas" subtitle="Lo que necesita tu atención en tu inventario" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AlertSection
          title="Bajo stock"
          icon={<PackageX size={18} className="text-danger" />}
          tone="off"
          emptyText="No tenés productos con stock bajo."
          items={bajoStock.data ?? []}
          isLoading={bajoStock.isLoading}
        />
        <AlertSection
          title="Por vencer (7 días)"
          icon={<Clock size={18} className="text-amber-600" />}
          tone="warn"
          emptyText="No tenés productos por vencer esta semana."
          items={porVencer.data ?? []}
          isLoading={porVencer.isLoading}
          dateField
        />
        <AlertSection
          title="Vencidos"
          icon={<AlertTriangle size={18} className="text-danger" />}
          tone="off"
          emptyText="No tenés productos vencidos."
          items={vencidos.data ?? []}
          isLoading={vencidos.isLoading}
          dateField
        />
      </div>
    </div>
  );
}
