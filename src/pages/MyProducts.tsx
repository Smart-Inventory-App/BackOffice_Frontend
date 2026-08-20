import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { MyProduct, Paginated } from "@/lib/types";
import { Badge, Card, PageHeader, Spinner } from "@/components/ui";
import ProductImage from "@/components/ProductImage";
import { truncate } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/constants";
import Pagination from "@/components/Pagination";

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

export default function MyProducts() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["my-products", search, page],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      };
      if (search) params.search = search;
      return (await api.get<Paginated<MyProduct>>("/me/products", { params })).data;
    },
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div>
      <PageHeader title="Productos" subtitle="Tus productos cargados" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o marca…"
          className="flex-1 rounded-xl border border-line bg-white px-4 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <Card className="p-0">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 text-center">Imagen</th>
                  <th className="px-5 py-3">Producto</th>
                  <th className="px-5 py-3 text-center">Categoría</th>
                  <th className="px-5 py-3 text-center">Stock</th>
                  <th className="px-5 py-3 text-center">Vencimiento</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-b border-line/60 last:border-0 hover:bg-canvas/60">
                    <td className="px-5 py-3">
                      <div className="flex justify-center">
                        <ProductImage url={p.imagen_url} alt={p.nombre} />
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium" title={p.nombre}>{truncate(p.nombre)}</p>
                      {p.marca && <p className="text-xs text-muted" title={p.marca}>{truncate(p.marca)}</p>}
                    </td>
                    <td className="px-5 py-3 text-center text-muted" title={p.categoria}>{truncate(p.categoria)}</td>
                    <td className="px-5 py-3 text-center">
                      {p.stock <= 1 ? <Badge tone="off">{p.stock}</Badge> : p.stock}
                    </td>
                    <td className="px-5 py-3 text-center">
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
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-muted">
                      No se encontraron productos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </Card>
      )}
    </div>
  );
}
