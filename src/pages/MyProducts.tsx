import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Download, History, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { limpiarCodigo } from "@/lib/barcode";
import { downloadFile } from "@/lib/download";
import type { AlertList, AlertOut, MyProduct, MyProfile, Paginated } from "@/lib/types";
import { Badge, Card, ConfirmDialog, Notice, Spinner } from "@/components/ui";
import { Picklist, addIfMissing } from "@/components/Picklist";
import ProductImage from "@/components/ProductImage";
import ImageUpload from "@/components/ImageUpload";
import ProductDetailModal from "@/components/ProductDetailModal";
import { formatDate, formatThousands, truncate } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/constants";
import Pagination from "@/components/Pagination";
import HistorialModal from "@/components/HistorialModal";
import { apiErrorMessage } from "@/lib/errors";
import { invalidateInventory } from "@/lib/queries";
import { OPTION_MAX } from "@/pages/Cargar";

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

// Todos los filtros miden lo mismo, entren o no los textos: lo que no entra se corta con «...»
const FILTER_CLASS =
  "h-10 w-full min-w-0 truncate rounded-xl border border-line bg-white px-4 text-sm outline-none focus:border-primary";

/** Un filtro de la lista: siempre del mismo ancho; las opciones largas se cortan con «...» y se leen enteras al apuntarlas. */
function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  // El filtro que se trae del dashboard puede no estar entre las opciones todavía
  const shown = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select aria-label={label} title={value || undefined} value={value} onChange={(e) => onChange(e.target.value)} className={FILTER_CLASS}>
      <option value="">{allLabel}</option>
      {shown.map((option) => (
        <option key={option} value={option} title={option}>
          {truncate(option)}
        </option>
      ))}
    </select>
  );
}

export default function MyProducts() {
  const qc = useQueryClient();
  // Desde los gráficos del dashboard se llega con un filtro ya elegido; entrando por el menú se ve todo
  const initial = (useLocation().state ?? {}) as {
    categoria?: string;
    ubicacion?: string;
    marca?: string;
    vencido?: "si" | "no";
    bajoStock?: boolean;
    porVencer?: boolean;
  };
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState(initial.categoria ?? "");
  const [ubicacion, setUbicacion] = useState(initial.ubicacion ?? "");
  const [marca, setMarca] = useState(initial.marca ?? "");
  const [vencido, setVencido] = useState<"" | "si" | "no">(initial.vencido ?? "");
  const [bajoStock, setBajoStock] = useState(initial.bajoStock ?? false);
  const [porVencer, setPorVencer] = useState(initial.porVencer ?? false);
  const [sortBy, setSortBy] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<MyProduct | null>(null);
  const [historialProduct, setHistorialProduct] = useState<MyProduct | null>(null);
  const [detail, setDetail] = useState<MyProduct | null>(null);
  const [editForm, setEditForm] = useState(EDIT_EMPTY);
  const [editError, setEditError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkCategoria, setBulkCategoria] = useState("");
  const [bulkUbicacion, setBulkUbicacion] = useState("");
  const [bulkMarca, setBulkMarca] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MyProduct | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => setPage(0), [search, categoria, ubicacion, marca, vencido, bajoStock, porVencer]);

  const { data: filterOptions } = useQuery({
    queryKey: ["my-products-filter-options"],
    queryFn: async () => {
      const { data } = await api.get<{ categorias: string[]; ubicaciones: string[]; marcas?: string[] }>(
        "/me/products/filters/options",
      );
      return data;
    },
  });
  const categoriaOptions = filterOptions?.categorias ?? [];
  const ubicacionOptions = filterOptions?.ubicaciones ?? [];
  const marcaOptions = filterOptions?.marcas ?? [];
  const [editCategoriaOptions, setEditCategoriaOptions] = useState<string[]>([]);
  const [editUbicacionOptions, setEditUbicacionOptions] = useState<string[]>([]);
  const [editMarcaOptions, setEditMarcaOptions] = useState<string[]>([]);

  useEffect(() => {
    if (filterOptions) {
      setEditCategoriaOptions(filterOptions.categorias);
      setEditUbicacionOptions(filterOptions.ubicaciones);
      setEditMarcaOptions(filterOptions.marcas ?? []);
    }
  }, [filterOptions]);

  // Las reglas generales del perfil, para la ventana de información del producto
  const profile = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => (await api.get<MyProfile>("/me/profile")).data,
  });
  const generalRules = profile.data ? { coverageDays: profile.data.stock_minimo, expiryDays: profile.data.dias_alerta_vencimiento } : null;

  const buildFilterParams = (): Record<string, string | number | boolean> => {
    const params: Record<string, string | number | boolean> = {};
    if (search) params.search = search;
    if (categoria) params.categoria = categoria;
    if (ubicacion) params.ubicacion = ubicacion;
    if (marca) params.marca = marca;
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
    queryKey: ["my-products", search, categoria, ubicacion, marca, vencido, bajoStock, porVencer, sortBy, sortDir, page],
    queryFn: async () => {
      const params = { ...buildFilterParams(), limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      return (await api.get<Paginated<MyProduct>>("/me/products", { params })).data;
    },
    placeholderData: keepPreviousData,
  });

  // Stock total y cantidad de productos de la lista, con la búsqueda y los filtros elegidos (como en la app)
  const summary = useQuery({
    queryKey: ["my-products-stock-total", search, categoria, ubicacion, marca, vencido, bajoStock, porVencer],
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

  const refreshInventory = () => {
    qc.invalidateQueries({ queryKey: ["my-products"] });
    qc.invalidateQueries({ queryKey: ["my-products-filter-options"] });
    invalidateInventory(qc);
  };

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
      refreshInventory();
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
      refreshInventory();
      setSelected(new Set());
      setShowBulkEdit(false);
    },
    onError: (err: any) => {
      setBulkError(apiErrorMessage(err, "No se pudo aplicar el cambio."));
    },
  });

  const deleteOne = useMutation({
    mutationFn: async (product: MyProduct) => {
      await api.delete(`/me/products/${product.id}`);
      return product.id;
    },
    onSuccess: (id) => {
      refreshInventory();
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setDeleting(null);
    },
    onError: (err: any) => {
      setDeleting(null);
      setDeleteError(apiErrorMessage(err, "No se pudo eliminar el producto."));
    },
  });

  const deleteMany = useMutation({
    mutationFn: async () => (await api.post<{ deleted: number }>("/me/products/bulk-delete", { product_ids: Array.from(selected) })).data,
    onSuccess: () => {
      refreshInventory();
      setSelected(new Set());
      setBulkDeleting(false);
    },
    onError: (err: any) => {
      setBulkDeleting(false);
      setDeleteError(apiErrorMessage(err, "No se pudieron eliminar los productos."));
    },
  });

  const count = selected.size;

  return (
    // En pantallas anchas todo entra sin desplazar la página: solo se desplaza la lista de productos
    <div className="md:flex md:h-[calc(100vh-4.5rem)] md:flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Inventario</h1>
          <p className="mt-1 text-sm text-muted">Tus productos cargados</p>
        </div>
        {summary.data && (
          <p data-testid="inventory-total-summary" className="flex flex-wrap items-baseline gap-x-3 text-base font-semibold uppercase tracking-wide text-muted">
            <span>Stock</span>
            <span data-testid="inventory-total-value" className="text-2xl font-extrabold normal-case text-primaryDark">
              {formatThousands(summary.data.stock_total)} {summary.data.stock_total === 1 ? "Unidad" : "Unidades"}
            </span>
            <span aria-hidden className="text-line">|</span>
            <span data-testid="inventory-total-products" className="text-2xl font-extrabold normal-case text-ink">
              {formatThousands(summary.data.products)} {summary.data.products === 1 ? "Producto" : "Productos"}
            </span>
          </p>
        )}
      </div>

      {/* Una sola cuadrícula: el buscador llega hasta el borde derecho del último filtro; a su derecha va la exportación y, junto a los filtros, las casillas */}
      <div className="mb-3 grid grid-cols-2 items-center gap-3 md:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o marca…"
          className="col-span-2 h-10 min-w-0 rounded-xl border border-line bg-white px-4 text-sm outline-none focus:border-primary md:col-span-4"
        />
        <div className="col-span-2 flex justify-end gap-2 md:col-span-1">
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
        <FilterSelect label="Categoría" allLabel="Todas las categorías" value={categoria} options={categoriaOptions} onChange={setCategoria} />
        <FilterSelect label="Marca" allLabel="Todas las marcas" value={marca} options={marcaOptions} onChange={setMarca} />
        <FilterSelect label="Ubicación" allLabel="Todas las ubicaciones" value={ubicacion} options={ubicacionOptions} onChange={setUbicacion} />
        <select
          aria-label="Vencimiento"
          value={vencido}
          onChange={(e) => setVencido(e.target.value as "" | "si" | "no")}
          className={FILTER_CLASS}
        >
          <option value="">Todos los vencimientos</option>
          <option value="si">Vencidos</option>
          <option value="no">No vencidos</option>
        </select>
        <div className="col-span-2 flex items-center justify-end gap-4 md:col-span-1">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={bajoStock} onChange={(e) => setBajoStock(e.target.checked)} />
            Stock bajo
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={porVencer} onChange={(e) => setPorVencer(e.target.checked)} />
            Por vencer
          </label>
        </div>
      </div>

      {/* La barra de selección solo aparece cuando hay productos elegidos */}
      {count > 0 && (
      <div
        data-testid="selection-bar"
        className="mb-3 flex h-12 shrink-0 items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-4"
      >
        <div className="flex items-center gap-2">
          <button
              type="button"
              data-testid="selection-clear"
              aria-label="Deseleccionar todo"
              title="Deseleccionar todo"
              onClick={() => setSelected(new Set())}
              className="rounded-full p-1 text-primaryDark transition hover:bg-primary/15"
            >
              <X size={16} />
            </button>
          <p data-testid="selection-count" className="text-sm text-primaryDark">
            {`${count} producto${count === 1 ? "" : "s"} seleccionado${count === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="selection-delete"
            onClick={() => setBulkDeleting(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 bg-white px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
          >
            <Trash2 size={13} /> Borrar todo
          </button>
          <button
            type="button"
            data-testid="selection-edit"
            onClick={openBulkEdit}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
          >
            Editar todo
          </button>
        </div>
      </div>
      )}

      {deleteError && (
        <div className="mb-4">
          <Notice tone="error">{deleteError}</Notice>
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : (
        <Card className="flex min-h-0 flex-col p-0 md:flex-1">
          <div className="max-h-[60vh] min-h-0 overflow-auto md:max-h-none md:flex-1">
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
                  <tr
                    key={p.id}
                    data-testid={`product-row-${p.id}`}
                    onClick={() => setDetail(p)}
                    className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-canvas/60"
                  >
                    <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${p.nombre}`}
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
                        className="text-left text-base font-semibold text-ink hover:text-primaryDark hover:underline"
                        title={p.nombre}
                      >
                        {truncate(p.nombre)}
                      </button>
                      {p.marca && <p className="text-xs text-muted" title={p.marca}>{truncate(p.marca)}</p>}
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
                    <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
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
                        <button
                          type="button"
                          data-testid={`product-delete-${p.id}`}
                          aria-label={`Eliminar ${p.nombre}`}
                          onClick={() => {
                            setDeleteError(null);
                            setDeleting(p);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-danger/60 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
                        >
                          <Trash2 size={14} /> Eliminar
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
                <Picklist
                  label="Marca"
                  value={editForm.marca}
                  options={editMarcaOptions}
                  emptyLabel="Sin marca"
                  maxLength={OPTION_MAX}
                  onChange={(v) => {
                    setEditForm((f) => ({ ...f, marca: v }));
                    setEditMarcaOptions((prev) => addIfMissing(prev, v));
                  }}
                />
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
              <Picklist
                label="Marca"
                value={bulkMarca}
                options={editMarcaOptions}
                emptyLabel="No cambiar"
                maxLength={OPTION_MAX}
                onChange={(v) => {
                  setBulkMarca(v);
                  setEditMarcaOptions((prev) => addIfMissing(prev, v));
                }}
              />
              <Picklist
                label="Categoría"
                value={bulkCategoria}
                options={editCategoriaOptions}
                emptyLabel="No cambiar"
                maxLength={OPTION_MAX}
                onChange={(v) => {
                  setBulkCategoria(v);
                  setEditCategoriaOptions((prev) => addIfMissing(prev, v));
                }}
              />
              <Picklist
                label="Ubicación"
                value={bulkUbicacion}
                options={editUbicacionOptions}
                emptyLabel="No cambiar"
                maxLength={OPTION_MAX}
                onChange={(v) => {
                  setBulkUbicacion(v);
                  setEditUbicacionOptions((prev) => addIfMissing(prev, v));
                }}
              />
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

      {deleting && (
        <ConfirmDialog
          title="Eliminar producto"
          message={`¿Eliminar "${truncate(deleting.nombre)}" del inventario? Se borra también su historial y no se puede deshacer.`}
          confirmLabel="Eliminar"
          danger
          busy={deleteOne.isPending}
          onConfirm={() => deleteOne.mutate(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}

      {bulkDeleting && (
        <ConfirmDialog
          title="Borrar productos"
          message={`¿Borrar los ${count} productos seleccionados del inventario? Se borra también su historial y no se puede deshacer.`}
          confirmLabel="Borrar todo"
          danger
          busy={deleteMany.isPending}
          onConfirm={() => deleteMany.mutate()}
          onCancel={() => setBulkDeleting(false)}
        />
      )}

      {detail && (
        <ProductDetailModal
          product={detail}
          generalRules={generalRules}
          onClose={() => setDetail(null)}
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

      {historialProduct && (
        <HistorialModal
          product={historialProduct}
          onClose={() => setHistorialProduct(null)}
          onChanged={refreshInventory}
        />
      )}
    </div>
  );
}
