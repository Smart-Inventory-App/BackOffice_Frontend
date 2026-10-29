import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Trash2, ArrowUp, ArrowDown, Download } from "lucide-react";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { downloadFile } from "@/lib/download";
import type { AdminProduct, Paginated } from "@/lib/types";
import { Badge, Card, Spinner } from "@/components/ui";
import { formatDate, formatThousands, truncate } from "@/lib/format";
import ProductImage from "@/components/ProductImage";
import ProductDetailModal from "@/components/ProductDetailModal";
import { PAGE_SIZE } from "@/lib/constants";
import Pagination from "@/components/Pagination";
import FilterDropdown, { FilterSelect } from "@/components/FilterDropdown";

type SortField = "nombre" | "stock" | "vencimiento" | "categoria";

// La alerta de cada producto se calcula en el servidor con las reglas de su dueño (la del producto o la del perfil)
const LEVEL_BADGE = { critical: "off", warning: "warn" } as const;
const LEVEL_TEXT = { critical: "Crítica", warning: "Advertencia" } as const;

/**
 * «Productos de la Plataforma»: la lista de todos los productos cargados por los usuarios, con el mismo formato que el
 * inventario de un usuario (stock y productos totales arriba, buscador, filtros y exportación). Al tocar un producto se
 * abre su información, con el mail de su dueño arriba de todo y su alerta si tiene una.
 */
export default function Products() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState("");
  const [marca, setMarca] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [alertLevel, setAlertLevel] = useState<"" | "critical" | "warning">("");
  const [sortBy, setSortBy] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [toDelete, setToDelete] = useState<AdminProduct | null>(null);
  const [detail, setDetail] = useState<AdminProduct | null>(null);

  useEffect(() => setPage(0), [search, categoria, marca, ownerId, alertLevel]);

  const { data: filterOptions } = useQuery({
    queryKey: ["products-filter-options", ownerId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (ownerId) params.user_id = ownerId;
      const { data } = await api.get<{
        categorias: string[];
        marcas?: string[];
        owners: { user_id: string; email: string | null }[];
      }>("/admin/products/filters/options", { params });
      return data;
    },
  });

  // Si al elegir otro usuario la categoría o la marca ya no existe entre sus productos, se quita el filtro
  useEffect(() => {
    if (categoria && filterOptions && !filterOptions.categorias.includes(categoria)) setCategoria("");
    if (marca && filterOptions && !(filterOptions.marcas ?? []).includes(marca)) setMarca("");
  }, [ownerId, filterOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildFilterParams = (): Record<string, string | number | boolean> => {
    const params: Record<string, string | number | boolean> = {};
    if (search) params.search = search;
    if (categoria) params.categoria = categoria;
    if (marca) params.marca = marca;
    if (ownerId) params.user_id = ownerId;
    if (alertLevel) params.alert_level = alertLevel;
    if (sortBy) {
      params.sort_by = sortBy;
      params.sort_dir = sortDir;
    }
    return params;
  };

  const { data, isLoading } = useQuery({
    queryKey: ["products", search, categoria, marca, ownerId, alertLevel, sortBy, sortDir, page],
    queryFn: async () => {
      const params = { ...buildFilterParams(), limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      return (await api.get<Paginated<AdminProduct>>("/admin/products/", { params })).data;
    },
    placeholderData: keepPreviousData,
  });

  // Stock total y cantidad de productos de la lista, con la búsqueda y los filtros elegidos (como en el inventario)
  const summary = useQuery({
    queryKey: ["products-stock-total", search, categoria, marca, ownerId, alertLevel],
    queryFn: async () => {
      const { sort_by: _by, sort_dir: _dir, ...filters } = buildFilterParams();
      return (await api.get<{ stock_total: number; products: number }>("/admin/products/stock-total", { params: filters })).data;
    },
    placeholderData: keepPreviousData,
  });

  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const exportProducts = async (format: "csv" | "xlsx") => {
    setExporting(format);
    try {
      await downloadFile("/admin/products/export", { ...buildFilterParams(), format }, `productos.${format}`);
    } finally {
      setExporting(null);
    }
  };

  const del = useMutation({
    mutationFn: async (id: number) => api.delete(`/admin/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["products-stock-total"] });
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

  // El botón no hereda las mayúsculas del encabezado: se piden acá
  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <button type="button" onClick={() => toggleSort(field)} className="inline-flex items-center gap-1 uppercase hover:text-primaryDark">
      {label}
      {sortBy === field && (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </button>
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    // En pantallas anchas todo entra sin desplazar la página: solo se desplaza la lista de productos
    <div className="md:flex md:h-[calc(100vh-4.5rem)] md:flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Productos de la Plataforma</h1>
          <p className="mt-1 text-sm text-muted">Datos de cada producto cargado por los usuarios de la aplicación</p>
        </div>
        {summary.data && (
          <p data-testid="products-total-summary" className="flex flex-wrap items-baseline gap-x-3 text-base font-semibold uppercase tracking-wide text-muted">
            <span>Stock</span>
            <span data-testid="products-total-value" className="text-2xl font-extrabold normal-case text-primaryDark">
              {formatThousands(summary.data.stock_total)} {summary.data.stock_total === 1 ? "Unidad" : "Unidades"}
            </span>
            <span aria-hidden className="text-line">|</span>
            <span data-testid="products-total-products" className="text-2xl font-extrabold normal-case text-ink">
              {formatThousands(summary.data.products)} {summary.data.products === 1 ? "Producto" : "Productos"}
            </span>
          </p>
        )}
      </div>

      {/* Arriba, el buscador y la exportación; abajo, los filtros ocupan todo el ancho: el último termina donde termina «Excel» */}
      <div className="mb-3 space-y-3">
       <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, marca o mail de usuario…"
          className="h-10 min-w-0 flex-1 basis-60 rounded-xl border border-line bg-white px-4 text-sm outline-none focus:border-primary"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => exportProducts("csv")}
            disabled={exporting !== null}
            className="inline-flex h-10 w-20 items-center justify-center gap-1.5 rounded-xl border border-line px-2 text-sm font-medium text-muted transition hover:bg-canvas hover:text-primaryDark disabled:opacity-60"
          >
            <Download size={14} /> {exporting === "csv" ? "…" : "CSV"}
          </button>
          <button
            type="button"
            onClick={() => exportProducts("xlsx")}
            disabled={exporting !== null}
            className="inline-flex h-10 w-20 items-center justify-center gap-1.5 rounded-xl border border-line px-2 text-sm font-medium text-muted transition hover:bg-canvas hover:text-primaryDark disabled:opacity-60"
          >
            <Download size={14} /> {exporting === "xlsx" ? "…" : "Excel"}
          </button>
        </div>
       </div>
       <div data-testid="products-filters" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <FilterSelect label="Categoría" allLabel="Todas las categorías" value={categoria} options={filterOptions?.categorias ?? []} onChange={setCategoria} />
        <FilterSelect label="Marca" allLabel="Todas las marcas" value={marca} options={filterOptions?.marcas ?? []} onChange={setMarca} />
        <FilterDropdown
          label="Usuario"
          allLabel="Todos los usuarios"
          value={ownerId}
          options={(filterOptions?.owners ?? []).map((o) => ({ value: o.user_id, label: o.email ?? o.user_id }))}
          onChange={setOwnerId}
        />
        <FilterDropdown
          label="Nivel de alerta"
          allLabel="Todas las alertas"
          value={alertLevel}
          options={[
            { value: "critical", label: "Críticas" },
            { value: "warning", label: "Advertencias" },
          ]}
          onChange={(v) => setAlertLevel(v as "" | "critical" | "warning")}
        />
       </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <Card className="flex min-h-0 flex-col p-0 md:flex-1">
          <div className="max-h-[60vh] min-h-0 overflow-auto md:max-h-none md:flex-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-3 text-center">Imagen</th>
                  <th className="px-3 py-3">
                    <SortHeader field="nombre" label="Producto" />
                  </th>
                  <th className="px-3 py-3 text-center">Usuario</th>
                  <th className="px-3 py-3 text-center">
                    <SortHeader field="categoria" label="Categoría" />
                  </th>
                  <th className="px-3 py-3 text-center">
                    <SortHeader field="stock" label="Stock" />
                  </th>
                  <th className="px-3 py-3 text-center">
                    <SortHeader field="vencimiento" label="Vencimiento" />
                  </th>
                  <th className="px-3 py-3 text-center">Alerta</th>
                  <th className="px-3 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr
                    key={p.id}
                    data-testid={`product-row-${p.id}`}
                    onClick={() => setDetail(p)}
                    className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-canvas/60"
                  >
                    <td className="px-3 py-3">
                      <div className="flex justify-center">
                        <ProductImage url={p.imagen_url} alt={p.nombre} className="h-14 w-14" />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        data-testid={`product-open-${p.id}`}
                        className="text-left text-base font-semibold text-ink hover:text-primaryDark hover:underline"
                        title={p.nombre}
                      >
                        {truncate(p.nombre)}
                      </button>
                      {p.marca && <p className="text-xs text-muted" title={p.marca}>{truncate(p.marca)}</p>}
                    </td>
                    <td
                      data-testid={`product-owner-${p.id}`}
                      className={`px-3 py-3 text-center ${p.owner.is_active === false ? "font-medium text-danger" : "text-muted"}`}
                      title={p.owner.email ?? p.owner.user_id}
                    >
                      {truncate(p.owner.email ?? p.owner.user_id)}
                    </td>
                    <td className="px-3 py-3 text-center text-muted" title={p.categoria}>{truncate(p.categoria)}</td>
                    <td className="px-3 py-3 text-center font-semibold">{p.stock}</td>
                    <td className="px-3 py-3 text-center text-muted">{p.vencimiento ? formatDate(p.vencimiento) : "—"}</td>
                    <td className="px-3 py-3 text-center" data-testid={`product-alert-${p.id}`}>
                      {p.alert_level ? <Badge tone={LEVEL_BADGE[p.alert_level]}>{LEVEL_TEXT[p.alert_level]}</Badge> : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
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
                    <td colSpan={8} className="px-5 py-10 text-center text-muted">
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

      {detail && (
        <ProductDetailModal
          product={detail}
          ownerEmail={detail.owner.email ?? detail.owner.user_id}
          ownerDisabled={detail.owner.is_active === false}
          alerts={detail.alerts ?? []}
          onClose={() => setDetail(null)}
        />
      )}

      {toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-lift">
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
