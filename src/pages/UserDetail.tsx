import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import type { AdminProduct, AlertOut, AppUserDetail } from "@/lib/types";
import { formatDate, formatDateTime, formatThousands } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, Spinner, StatCard } from "@/components/ui";
import AlertDetailModal from "@/components/AlertDetailModal";
import AlertRow from "@/components/AlertRow";
import ProductImage from "@/components/ProductImage";

const LEVEL_TONE = { critical: "off", warning: "warn" } as const;
const LEVEL_TEXT = { critical: "Crítica", warning: "Advertencia" } as const;

function ProductLine({ product }: { product: AdminProduct }) {
  return (
    <div data-testid={`user-product-${product.id}`} className="flex items-center gap-4 rounded-2xl border border-line/60 bg-white p-3">
      <ProductImage url={product.imagen_url} alt={product.nombre} className="h-14 w-14" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink">{product.nombre}</p>
        <p className="truncate text-xs text-muted">
          {[product.marca, product.categoria].filter(Boolean).join(" · ")}
          {product.vencimiento ? ` · vence ${formatDate(product.vencimiento)}` : ""}
        </p>
      </div>
      {product.alert_level && <Badge tone={LEVEL_TONE[product.alert_level]}>{LEVEL_TEXT[product.alert_level]}</Badge>}
      <div className="shrink-0 text-right">
        <p className="text-lg font-bold text-primary">{product.stock}</p>
        <p className="text-[11px] text-muted">en stock</p>
      </div>
    </div>
  );
}

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const [alert, setAlert] = useState<AlertOut | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["user", id],
    queryFn: async () => (await api.get<AppUserDetail>(`/admin/users/${id}`)).data,
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <p className="text-danger">No se encontró el usuario.</p>;

  return (
    <div>
      <Link to="/usuarios" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-primaryDark">
        <ArrowLeft size={16} /> Volver a usuarios
      </Link>

      <PageHeader title={data.email ?? data.id} subtitle="Detalle de la cuenta y datos cargados" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Unidades en stock" value={formatThousands(data.total_units)} hint={`${data.product_count} productos`} />
        <StatCard label="Alertas críticas" value={data.critical_alerts} accent="danger" />
        <StatCard label="Advertencias" value={data.warning_alerts} accent="muted" />
        <StatCard
          label="Consumido (30 días)"
          value={formatThousands(data.consumed_last_30d)}
          accent="primaryDark"
          hint={`${formatThousands(data.restocked_last_30d)} repuestas`}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">Estado</p>
          <div className="mt-2">
            {data.is_active ? <Badge tone="ok">Activo</Badge> : <Badge tone="off">Deshabilitado</Badge>}
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Nombre</dt><dd>{[data.first_name, data.last_name].filter(Boolean).join(" ") || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Usuario</dt><dd>{data.username || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Productos</dt><dd>{data.product_count}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Registrado</dt><dd>{formatDateTime(data.created_at)}</dd></div>
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold">Alertas del usuario</h2>
          {data.alerts.length === 0 ? (
            <EmptyState>Este usuario no tiene alertas.</EmptyState>
          ) : (
            <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2" data-testid="user-alerts">
              {data.alerts.map((a) => (
                <AlertRow key={a.key} alert={a} onClick={() => setAlert(a)} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-4 text-base font-semibold">Productos cargados</h2>
        {data.products.length === 0 ? (
          <EmptyState>Este usuario no cargó productos.</EmptyState>
        ) : (
          <div className="space-y-3">
            {data.products.map((p) => (
              <ProductLine key={p.id} product={p} />
            ))}
          </div>
        )}
      </Card>

      {alert && <AlertDetailModal alert={alert} onClose={() => setAlert(null)} />}
    </div>
  );
}
