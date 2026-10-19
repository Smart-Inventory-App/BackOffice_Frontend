import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Trash2, ArrowUp, ArrowDown, Barcode, Download, Layers } from "lucide-react";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { downloadFile } from "@/lib/download";
import type { AdminProduct, Paginated } from "@/lib/types";
import { Badge, Card, PageHeader, Spinner } from "@/components/ui";
import ProductImage from "@/components/ProductImage";
import { truncate } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/constants";
import Pagination from "@/components/Pagination";
import StockTotalModal, { type StockTotalTarget } from "@/components/StockTotalModal";

type SortField = "nombre" | "stock" | "vencimiento" | "categoria";

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
  const [categoria, setCategoria] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [vencido, setVencido] = useState<"" | "si" | "no">("");
  const [bajoStock, setBajoStock] = useState(false);
  const [sortBy, setSortBy] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [toDelete, setToDelete] = useState<AdminProduct | null>(null);
  // Ventana de stock total: abierta desde el botón de arriba (busca por nombre) o desde un producto de la tabla
  const [stockTotal, setStockTotal] = useState<{ initial: StockTotalTarget | null; userId?: string } | null>(null);

  useEffect(() => setPage(0), [search, onlyImage, categoria, ownerId, vencido, bajoStock]);

  const { data: filterOptions } = useQuery({
    queryKey: ["products-filter-options", ownerId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (ownerId) params.user_id = ownerId;
      const { data } = await api.get<{
        categorias: string[];
        owners: { user_id: string; email: string | null }[];
      }>("/admin/products/filters/options", { params });
      return data;
    },
  });

  useEffect(() => {
    if (categoria && filterOptions && !filterOptions.categorias.includes(categoria)) {
      setCategoria("");
    }
  }, [ownerId, filterOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildFilterParams = (): Record<string, string | number | boolean> => {
    const params: Record<string, string | number | boolean> = {};
    if (search) params.search = search;
    if (onlyImage) params.only_with_image = true;
    if (categoria) params.categoria = categoria;
    if (ownerId) params.user_id = ownerId;
    if (vencido) params.vencido = vencido === "si";
    if (bajoStock) params.bajo_stock = true;
    if (sortBy) {
      params.sort_by = sortBy;
      params.sort_dir = sortDir;
    }
    return params;
  };

  const { data, isLoading } = useQuery({
    queryKey: ["products", search, onlyImage, categoria, ownerId, vencido, bajoStock, sortBy, sortDir, page],
    queryFn: async () => {
      const params = { ...buildFilterParams(), limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      return (await api.get<Paginated<AdminProduct>>("/admin/products/", { params })).data;
    },
    placeholderData: keepPreviousData,
  });

  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const exportProducts = async (format: "csv" | "xlsx") => {
    setExporting(format);
    try {
      await downloadFile(
        "/admin/products/export",
        { ...buildFilterParams(), format },
        `productos.${format}`,
      );
    } finally {
      setExporting(null);
    }
  };

  const del = useMutation({
    mutationFn: async (id: number) => api.delete(`/admin/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      setToDelete(null);
    },
  });

  const toggleSort = (field: SortField) => {
    if (sortBy !== field) {
      setSortBy(field);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortBy(null);
    }
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <button
      type="button"
      onClick={() => toggleSort(field)}
      className="inline-flex items-center gap-1 hover:text-primaryDark"
    >
      {label}
      {sortBy === field &&
        (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </button>
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Productos" subtitle="Datos e imágenes cargados por los usuarios de la app" />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStockTotal({ initial: null, userId: ownerId || undefined })}
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/10"
          >
            <Layers size={14} /> Stock total
          </button>
          <button
            type="button"
            onClick={() => exportProducts("csv")}
            disabled={exporting !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm font-medium text-muted transition hover:bg-canvas hover:text-primaryDark disabled:opacity-60"
          >
            <Download size={14} /> {exporting === "csv" ? "Exportando…" : "CSV"}
          </button>
          <button
            type="button"
            onClick={() => exportProducts("xlsx")}
            disabled={exporting !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm font-medium text-muted transition hover:bg-canvas hover:text-primaryDark disabled:opacity-60"
          >
            <Download size={14} /> {exporting === "xlsx" ? "Exportando…" : "Excel"}
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o marca…"
          className="min-w-[200px] flex-1 rounded-xl border border-line bg-white px-4 py-2 text-sm outline-none focus:border-primary"
        />
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="rounded-xl border border-line bg-white px-4 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">Todas las categorías</option>
          {(filterOptions?.categorias ?? []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          className="max-w-[220px] rounded-xl border border-line bg-white px-4 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">Todos los usuarios</option>
          {(filterOptions?.owners ?? []).map((o) => (
            <option key={o.user_id} value={o.user_id} title={o.email ?? o.user_id}>
              {o.email ?? o.user_id}
            </option>
          ))}
        </select>
        <select
          value={vencido}
          onChange={(e) => setVencido(e.target.value as any)}
          className="rounded-xl border border-line bg-white px-4 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">Vencimiento: todos</option>
          <option value="si">Vencidos</option>
          <option value="no">No vencidos</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={bajoStock} onChange={(e) => setBajoStock(e.target.checked)} />
          Bajo stock
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={onlyImage} onChange={(e) => setOnlyImage(e.target.checked)} />
          Solo con imagen
        </label>
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
                  <th className="px-5 py-3">
                    <SortHeader field="nombre" label="Producto" />
                  </th>
                  <th className="px-5 py-3 text-center">
                    <SortHeader field="categoria" label="Categoría" />
                  </th>
                  <th className="px-5 py-3 text-center">
                    <SortHeader field="stock" label="Stock" />
                  </th>
                  <th className="px-5 py-3 text-center">
                    <SortHeader field="vencimiento" label="Vencimiento" />
                  </th>
                  <th className="px-5 py-3 text-center">Dueño</th>
                  <th className="px-5 py-3 text-center">Acciones</th>
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
                      {p.codigo_barras && (
                        <p
                          className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] text-muted"
                          title="Código de barras"
                        >
                          <Barcode size={11} /> {p.codigo_barras}
                        </p>
                      )}
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
                    <td className="px-5 py-3 text-center text-muted" title={p.owner.email ?? p.owner.user_id}>
                      {truncate(p.owner.email ?? p.owner.user_id)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => setStockTotal({ initial: { nombre: p.nombre, categoria: p.categoria }, userId: p.owner.user_id })}
                        title="Ver el stock total de este producto"
                        aria-label={`Stock total de ${p.nombre}`}
                        className="mr-2 inline-flex items-center gap-1 rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10"
                      >
                        <Layers size={14} /> Stock total
                      </button>
                      <button
                        onClick={() => { del.reset(); setToDelete(p); }}
                        className="inline-flex items-center gap-1 rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
                      >
                        <Trash2 size={14} /> Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-muted">
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

      <StockTotalModal
        open={stockTotal !== null}
        onClose={() => setStockTotal(null)}
        userId={stockTotal?.userId}
        initial={stockTotal?.initial}
      />

      {toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Eliminar producto</h3>
            <p className="mt-2 text-sm text-muted">
              ¿Seguro que querés eliminar <span className="font-medium text-ink">{toDelete.nombre}</span>? Esta acción no se puede deshacer.
            </p>
            {del.isError && (
              <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                {apiErrorMessage(del.error, "No se pudo eliminar el producto")}
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => { del.reset(); setToDelete(null); }}
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
