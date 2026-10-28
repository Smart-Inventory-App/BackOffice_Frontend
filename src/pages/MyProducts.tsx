import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Barcode, Pencil, Download, History } from "lucide-react";
import { api } from "@/lib/api";
import { limpiarCodigo } from "@/lib/barcode";
import { downloadFile } from "@/lib/download";
import type { AlertList, AlertOut, MyProduct, Paginated } from "@/lib/types";
import { Badge, Card, Spinner } from "@/components/ui";
import { Picklist, addIfMissing } from "@/components/Picklist";
import ProductImage from "@/components/ProductImage";
import ImageUpload from "@/components/ImageUpload";
import ProductDetailModal from "@/components/ProductDetailModal";
import StockTotalModal, { type StockTotalTarget } from "@/components/StockTotalModal";
import { formatDate, formatThousands, truncate } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/constants";
import Pagination from "@/components/Pagination";
import HistorialModal from "@/components/HistorialModal";
import { apiErrorMessage } from "@/lib/errors";
import { invalidateInventory } from "@/lib/queries";

type SortField = "nombre" | "stock" | "vencimiento" | "categoria";

// Cada producto tiene su nivel de alerta según SUS reglas (la propia o la del perfil), el mismo del Centro de Alertas
const LEVEL_BADGE = { critical: "off", warning: "warn" } as const;
const LEVEL_TEXT = { critical: "Crítica", warning: "Advertencia" } as const;

const EDIT_EMPTY = {
  nombre: "",
  marca: "",
  categoria: "",
  stock: "",
  vencimiento: "",
  descripcion: "",
  imagen_url: "",
  ubicacion: "",
  codigo_barras: "",
  stock_minimo: "",
  dias_alerta_vencimiento: "",
};

export default function MyProducts() {
  const qc = useQueryClient();
  // Desde los gráficos del dashboard se llega con un filtro ya elegido; entrando por el menú se ve todo
  const initial = (useLocation().state ?? {}) as { categoria?: string; ubicacion?: string; vencido?: "si" | "no"; bajoStock?: boolean; porVencer?: boolean };
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState(initial.categoria ?? "");
  const [ubicacion, setUbicacion] = useState(initial.ubicacion ?? "");
  const [vencido, setVencido] = useState<"" | "si" | "no">(initial.vencido ?? "");
  const [bajoStock, setBajoStock] = useState(initial.bajoStock ?? false);
  const [porVencer, setPorVencer] = useState(initial.porVencer ?? false);
  const [sortBy, setSortBy] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<MyProduct | null>(null);
  const [historialProduct, setHistorialProduct] = useState<MyProduct | null>(null);
  const [detail, setDetail] = useState<MyProduct | null>(null);
  const [stockTotal, setStockTotal] = useState<{ open: boolean; initial: StockTotalTarget | null }>({ open: false, initial: null });
  const [editForm, setEditForm] = useState(EDIT_EMPTY);
  const [editError, setEditError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkCategoria, setBulkCategoria] = useState("");
  const [bulkUbicacion, setBulkUbicacion] = useState("");
  const [bulkMarca, setBulkMarca] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);

  useEffect(() => setPage(0), [search, categoria, ubicacion, vencido, bajoStock, porVencer]);

  const { data: filterOptions } = useQuery({
    queryKey: ["my-products-filter-options"],
    queryFn: async () => {
      const { data } = await api.get<{ categorias: string[]; ubicaciones: string[] }>(
        "/me/products/filters/options",
      );
      return data;
    },
  });
  const categoriaOptions = filterOptions?.categorias ?? [];
  const ubicacionOptions = filterOptions?.ubicaciones ?? [];
  const [editCategoriaOptions, setEditCategoriaOptions] = useState<string[]>([]);
  const [editUbicacionOptions, setEditUbicacionOptions] = useState<string[]>([]);

  useEffect(() => {
    if (filterOptions) {
      setEditCategoriaOptions(filterOptions.categorias);
      setEditUbicacionOptions(filterOptions.ubicaciones);
    }
  }, [filterOptions]);

  const buildFilterParams = (): Record<string, string | number | boolean> => {
    const params: Record<string, string | number | boolean> = {};
    if (search) params.search = search;
    if (categoria) params.categoria = categoria;
    if (ubicacion) params.ubicacion = ubicacion;
    if (vencido) params.vencido = vencido === "si";
    if (bajoStock) params.bajo_stock = true;
    if (porVencer) params.por_vencer = true;
    if (sortBy) {
      params.sort_by = sortBy;
      params.sort_dir = sortDir;
    }
    return params;
  };

  const { data, isLoading } = useQuery({
    queryKey: ["my-products", search, categoria, ubicacion, vencido, bajoStock, porVencer, sortBy, sortDir, page],
    queryFn: async () => {
      const params = { ...buildFilterParams(), limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      return (await api.get<Paginated<MyProduct>>("/me/products", { params })).data;
    },
    placeholderData: keepPreviousData,
  });

  // Stock total y cantidad de productos de la lista, con la búsqueda y los filtros elegidos (como en la app)
  const summary = useQuery({
    queryKey: ["my-products-stock-total", search, categoria, ubicacion, vencido, bajoStock, porVencer],
    queryFn: async () => {
      const { sort_by: _by, sort_dir: _dir, ...filters } = buildFilterParams();
      return (await api.get<{ stock_total: number; products: number }>("/me/products/stock-total", { params: filters })).data;
    },
    placeholderData: keepPreviousData,
  });

  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const exportProducts = async (format: "csv" | "xlsx") => {
    setExporting(format);
    try {
      await downloadFile(
        "/me/products/export",
        { ...buildFilterParams(), format },
        `mis_productos.${format}`,
      );
    } finally {
      setExporting(null);
    }
  };

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
      {sortBy === field && (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </button>
  );

  const openEdit = (p: MyProduct) => {
    setEditError(null);
    setEditing(p);
    setEditForm({
      nombre: p.nombre,
      marca: p.marca ?? "",
      categoria: p.categoria,
      stock: String(p.stock),
      vencimiento: p.vencimiento ?? "",
      descripcion: p.descripcion ?? "",
      imagen_url: p.imagen_url ?? "",
      ubicacion: p.ubicacion ?? "",
      codigo_barras: p.codigo_barras ?? "",
      stock_minimo: p.stock_minimo != null ? String(p.stock_minimo) : "",
      dias_alerta_vencimiento: p.dias_alerta_vencimiento != null ? String(p.dias_alerta_vencimiento) : "",
    });
  };

  const editSet = (field: keyof typeof EDIT_EMPTY) => (e: { target: { value: string } }) =>
    setEditForm((f) => ({ ...f, [field]: e.target.value }));

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      await api.patch(`/me/products/${editing.id}`, {
        nombre: editForm.nombre,
        marca: editForm.marca || null,
        categoria: editForm.categoria,
        stock: Number(editForm.stock),
        vencimiento: editForm.vencimiento || null,
        descripcion: editForm.descripcion || null,
        imagen_url: editForm.imagen_url || null,
        ubicacion: editForm.ubicacion || null,
        codigo_barras: editForm.codigo_barras.trim() || null,
        stock_minimo: editForm.stock_minimo ? Number(editForm.stock_minimo) : null,
        dias_alerta_vencimiento: editForm.dias_alerta_vencimiento
          ? Number(editForm.dias_alerta_vencimiento)
          : null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-products"] });
      invalidateInventory(qc);
      setEditing(null);
    },
    onError: (err: any) => {
      setEditError(apiErrorMessage(err, "No se pudo guardar el producto."));
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  // El nivel de alerta de cada producto, para marcarlo en la lista
  const alerts = useQuery({
    queryKey: ["my-alert-levels"],
    queryFn: async () => (await api.get<AlertList>("/me/alerts/")).data.items,
  });
  const alertByProduct = new Map<number, AlertOut>();
  for (const alert of alerts.data ?? []) {
    const current = alertByProduct.get(alert.product_id);
    if (!current || (current.level === "warning" && alert.level === "critical")) alertByProduct.set(alert.product_id, alert);
  }

  const toggleSelected = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allOnPageSelected = items.length > 0 && items.every((p) => selected.has(p.id));
  const toggleSelectAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        items.forEach((p) => next.delete(p.id));
      } else {
        items.forEach((p) => next.add(p.id));
      }
      return next;
    });
  };

  const openBulkEdit = () => {
    setBulkError(null);
    setBulkCategoria("");
    setBulkUbicacion("");
    setBulkMarca("");
    setShowBulkEdit(true);
  };

  const bulkEdit = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { product_ids: Array.from(selected) };
      if (bulkCategoria) payload.categoria = bulkCategoria;
      if (bulkUbicacion) payload.ubicacion = bulkUbicacion;
      if (bulkMarca) payload.marca = bulkMarca;
      return (await api.patch<{ updated: number }>("/me/products/bulk-edit", payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-products"] });
      invalidateInventory(qc);
      setSelected(new Set());
      setShowBulkEdit(false);
    },
    onError: (err: any) => {
      setBulkError(apiErrorMessage(err, "No se pudo aplicar el cambio."));
    },
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Inventario</h1>
          <p className="mt-1 text-sm text-muted">Tus productos cargados</p>
        </div>
        {summary.data && (
          <div data-testid="inventory-total-summary" className="rounded-2xl border border-line/70 bg-white px-5 py-3 text-right shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Stock total</p>
            <p data-testid="inventory-total-value" className="text-xl font-bold text-primaryDark">
              {formatThousands(summary.data.stock_total)} {summary.data.stock_total === 1 ? "unidad" : "unidades"}
            </p>
            <p data-testid="inventory-total-products" className="text-xs text-muted">
              entre {formatThousands(summary.data.products)} {summary.data.products === 1 ? "producto" : "productos"} en el inventario
            </p>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o marca…"
          className="min-w-[200px] flex-1 rounded-xl border border-line bg-white px-4 py-2 text-sm outline-none focus:border-primary"
        />
        <select
          aria-label="Categoría"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="rounded-xl border border-line bg-white px-4 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">Todas las categorías</option>
          {(categoriaOptions ?? []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          aria-label="Ubicación"
          value={ubicacion}
          onChange={(e) => setUbicacion(e.target.value)}
          className="rounded-xl border border-line bg-white px-4 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">Todas las ubicaciones</option>
          {ubicacionOptions.map((u) => (
            <option key={u} value={u}>
              {u}
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
          Stock bajo
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={porVencer} onChange={(e) => setPorVencer(e.target.checked)} />
          Por vencer
        </label>
        <div className="ml-auto flex gap-2">
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

      {selected.size > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5">
          <p className="text-sm text-primaryDark">
            {selected.size} producto{selected.size === 1 ? "" : "s"} seleccionado{selected.size === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-muted hover:bg-canvas"
            >
              Deseleccionar
            </button>
            <button
              type="button"
              onClick={openBulkEdit}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              Editar en lote
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : (
        <Card className="p-0">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-3 text-center">
                    <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAllOnPage} />
                  </th>
                  <th className="px-3 py-3 text-center">Imagen</th>
                  <th className="px-3 py-3">
                    <SortHeader field="nombre" label="Producto" />
                  </th>
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
                  <tr key={p.id} className="border-b border-line/60 last:border-0 hover:bg-canvas/60">
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSelected(p.id)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-center">
                        <ProductImage url={p.imagen_url} alt={p.nombre} className="h-14 w-14" />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        data-testid={`product-open-${p.id}`}
                        onClick={() => setDetail(p)}
                        className="text-left font-semibold text-ink hover:text-primaryDark hover:underline"
                        title={p.nombre}
                      >
                        {truncate(p.nombre)}
                      </button>
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
                    <td className="px-3 py-3 text-center text-muted" title={p.categoria}>{truncate(p.categoria)}</td>
                    <td className="px-3 py-3 text-center font-semibold" data-testid={`product-stock-${p.id}`}>
                      {p.stock}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {p.vencimiento ? <span className="text-muted">{formatDate(p.vencimiento)}</span> : "—"}
                    </td>
                    <td className="px-3 py-3 text-center" data-testid={`product-alert-${p.id}`}>
                      {alertByProduct.get(p.id) ? (
                        <Badge tone={LEVEL_BADGE[alertByProduct.get(p.id)!.level]}>
                          {LEVEL_TEXT[alertByProduct.get(p.id)!.level]}
                        </Badge>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => openEdit(p)}
                          className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-canvas hover:text-primaryDark"
                        >
                          <Pencil size={14} /> Editar
                        </button>
                        <button
                          onClick={() => setHistorialProduct(p)}
                          className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-canvas hover:text-primaryDark"
                        >
                          <History size={14} /> Historial
                        </button>
                      </div>
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

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-lift">
            <h3 className="text-lg font-semibold">Editar producto</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Nombre</label>
                <input
                  value={editForm.nombre}
                  onChange={editSet("nombre")}
                  className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Marca</label>
                  <input
                    value={editForm.marca}
                    onChange={editSet("marca")}
                    className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <Picklist
                  label="Categoría"
                  value={editForm.categoria}
                  options={editCategoriaOptions}
                  onChange={(v) => {
                    setEditForm((f) => ({ ...f, categoria: v }));
                    setEditCategoriaOptions((prev) => addIfMissing(prev, v));
                  }}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Stock</label>
                  <input
                    type="number"
                    min={0}
                    value={editForm.stock}
                    onChange={editSet("stock")}
                    className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Vencimiento</label>
                  <input
                    type="date"
                    value={editForm.vencimiento}
                    onChange={editSet("vencimiento")}
                    className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Picklist
                  label="Ubicación"
                  value={editForm.ubicacion}
                  options={editUbicacionOptions}
                  emptyLabel="Sin ubicación"
                  onChange={(v) => {
                    setEditForm((f) => ({ ...f, ubicacion: v }));
                    setEditUbicacionOptions((prev) => addIfMissing(prev, v));
                  }}
                />
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Código de barras</label>
                  <input
                    inputMode="numeric"
                    value={editForm.codigo_barras}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, codigo_barras: limpiarCodigo(e.target.value) }))
                    }
                    placeholder="Sin código"
                    className="w-full rounded-xl border border-line px-4 py-2 font-mono text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
              <ImageUpload value={editForm.imagen_url} onChange={(url) => setEditForm((f) => ({ ...f, imagen_url: url }))} />
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Descripción</label>
                <textarea
                  value={editForm.descripcion}
                  onChange={editSet("descripcion")}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Reglas de alerta de producto (opcional)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-ink">Stock mínimo (días)</label>
                    <input
                      type="number"
                      min={1}
                      max={9999999}
                      value={editForm.stock_minimo}
                      onChange={editSet("stock_minimo")}
                      placeholder="Usa tu regla general"
                      className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-ink">Aviso de vencimiento (días)</label>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={editForm.dias_alerta_vencimiento}
                      onChange={editSet("dias_alerta_vencimiento")}
                      placeholder="Usa tu regla general"
                      className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>
            </div>

            {editError && (
              <div className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
                {editError}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
              >
                Cancelar
              </button>
              <button
                onClick={() => saveEdit.mutate()}
                disabled={saveEdit.isPending}
                className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {saveEdit.isPending ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-lift">
            <h3 className="text-lg font-semibold">Editar {selected.size} productos</h3>
            <p className="mt-1 text-sm text-muted">
              Solo se cambian los campos que completes acá — dejá "No cambiar" en los demás.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Categoría</label>
                <select
                  value={bulkCategoria}
                  onChange={(e) => setBulkCategoria(e.target.value)}
                  className="w-full rounded-xl border border-line bg-white px-4 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">No cambiar</option>
                  {editCategoriaOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Ubicación</label>
                <select
                  value={bulkUbicacion}
                  onChange={(e) => setBulkUbicacion(e.target.value)}
                  className="w-full rounded-xl border border-line bg-white px-4 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">No cambiar</option>
                  {editUbicacionOptions.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Marca</label>
                <input
                  value={bulkMarca}
                  onChange={(e) => setBulkMarca(e.target.value)}
                  placeholder="Dejar vacío para no cambiar"
                  className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>

            {bulkError && (
              <div className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
                {bulkError}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowBulkEdit(false)}
                className="flex-1 rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
              >
                Cancelar
              </button>
              <button
                onClick={() => bulkEdit.mutate()}
                disabled={bulkEdit.isPending || (!bulkCategoria && !bulkUbicacion && !bulkMarca)}
                className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {bulkEdit.isPending ? "Aplicando…" : "Aplicar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <ProductDetailModal
          product={detail}
          onClose={() => setDetail(null)}
          onStockTotal={() => {
            setStockTotal({ open: true, initial: { nombre: detail.nombre, categoria: detail.categoria } });
            setDetail(null);
          }}
          onHistory={() => {
            setHistorialProduct(detail);
            setDetail(null);
          }}
          onEdit={() => {
            openEdit(detail);
            setDetail(null);
          }}
        />
      )}

      <StockTotalModal
        scope="me"
        open={stockTotal.open}
        initial={stockTotal.initial}
        onClose={() => setStockTotal({ open: false, initial: null })}
      />

      {historialProduct && (
        <HistorialModal
          product={historialProduct}
          onClose={() => setHistorialProduct(null)}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ["my-products"] });
            invalidateInventory(qc);
          }}
        />
      )}
    </div>
  );
}
