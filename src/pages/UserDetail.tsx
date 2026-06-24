import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import type { AppUserDetail } from "@/lib/types";
import { Badge, Card, PageHeader, Spinner } from "@/components/ui";
import ProductImage from "@/components/ProductImage";

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">Estado</p>
          <div className="mt-2">
            {data.is_active ? <Badge tone="ok">Activo</Badge> : <Badge tone="off">Deshabilitado</Badge>}
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Nombre</dt><dd>{[data.first_name, data.last_name].filter(Boolean).join(" ") || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Usuario</dt><dd>{data.username || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Productos</dt><dd>{data.product_count}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Registrado</dt><dd>{data.created_at?.slice(0, 10) ?? "—"}</dd></div>
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold">Productos cargados</h2>
          {data.products.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Este usuario no cargó productos.</p>
          ) : (
            <div className="space-y-3">
              {data.products.map((p) => (
                <div key={p.id} className="flex items-center gap-4 rounded-xl border border-line p-3">
                  <ProductImage url={p.imagen_url} alt={p.nombre} className="h-14 w-14" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.nombre}</p>
                    <p className="text-xs text-muted">
                      {p.categoria} · stock {p.stock}
                      {p.vencimiento ? ` · vence ${p.vencimiento}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
