import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { AdminProduct } from "@/lib/types";
import { Badge, Card, PageHeader, Spinner } from "@/components/ui";
import ProductImage from "@/components/ProductImage";

function isExpiringSoon(date: string | null): boolean {
  if (!date) return false;
  const d = new Date(date).getTime();
  const now = Date.now();
  return d >= now && d <= now + 7 * 24 * 60 * 60 * 1000;
}
function isExpired(date: string | null): boolean {
  if (!date) return false;
  return new Date(date).getTime() < Date.now();
}

export default function Products() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [onlyImage, setOnlyImage] = useState(false);
  const [toDelete, setToDelete] = useState<AdminProduct | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["products", search, onlyImage],
    queryFn: async () => {
      const params: Record<string, string | boolean> = {};
      if (search) params.search = search;
      if (onlyImage) params.only_with_image = true;
      return (await api.get<AdminProduct[]>("/admin/products/", { params })).data;
    },
  });

  const del = useMutation({
    mutationFn: async (id: number) => api.delete(`/admin/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      setToDelete(null);
    },
  });

  return (
    <div>
      <PageHeader title="Productos" subtitle="Datos e imágenes cargados por los usuarios de la app" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o marca…"
          className="flex-1 rounded-xl border border-line bg-white px-4 py-2 text-sm outline-none focus:border-primary"
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={onlyImage} onChange={(e) => setOnlyImage(e.target.checked)} />
          Solo con imagen
        </label>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Imagen</th>
                <th className="px-5 py-3">Producto</th>
                <th className="px-5 py-3">Categoría</th>
                <th className="px-5 py-3">Stock</th>
                <th className="px-5 py-3">Vencimiento</th>
                <th className="px-5 py-3">Dueño</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((p) => (
                <tr key={p.id} className="border-b border-line/60 last:border-0 hover:bg-canvas/60">
                  <td className="px-5 py-3"><ProductImage url={p.imagen_url} alt={p.nombre} /></td>
                  <td className="px-5 py-3">
                    <p className="font-medium">{p.nombre}</p>
                    {p.marca && <p className="text-xs text-muted">{p.marca}</p>}
                  </td>
                  <td className="px-5 py-3 text-muted">{p.categoria}</td>
                  <td className="px-5 py-3">
                    {p.stock <= 1 ? <Badge tone="off">{p.stock}</Badge> : p.stock}
                  </td>
                  <td className="px-5 py-3">
                    {p.vencimiento ? (
                      isExpired(p.vencimiento) ? (
                        <Badge tone="off">{p.vencimiento}</Badge>
                      ) : isExpiringSoon(p.vencimiento) ? (
                        <Badge tone="warn">{p.vencimiento}</Badge>
                      ) : (
                        <span className="text-muted">{p.vencimiento}</span>
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted">{p.owner.email ?? p.owner.user_id.slice(0, 8)}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => setToDelete(p)}
                      className="inline-flex items-center gap-1 rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
                    >
                      <Trash2 size={14} /> Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {data && data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted">
                    No se encontraron productos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Eliminar producto</h3>
            <p className="mt-2 text-sm text-muted">
              ¿Seguro que querés eliminar <span className="font-medium text-ink">{toDelete.nombre}</span>? Esta acción no se puede deshacer.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setToDelete(null)}
                className="flex-1 rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
              >
                Cancelar
              </button>
              <button
                onClick={() => del.mutate(toDelete.id)}
                disabled={del.isPending}
                className="flex-1 rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {del.isPending ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
