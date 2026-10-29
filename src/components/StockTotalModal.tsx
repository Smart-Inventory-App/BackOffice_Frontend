import { useEffect, useRef, useState } from "react";
import { Layers, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { truncate } from "@/lib/format";
import type { AdminProductGroupDetail, AdminProductGroupSummary } from "@/lib/types";
import ProductImage from "@/components/ProductImage";

export interface StockTotalTarget {
  nombre: string;
  categoria: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Si se indica, se cuenta solo lo de ese usuario; si no, lo de todos los usuarios de la plataforma. */
  userId?: string;
  /** Si se indica, se abre directamente con el stock total de ese producto. */
  initial?: StockTotalTarget | null;
  /** «admin» cuenta lo de toda la plataforma (o de un usuario); «me» solo los productos de quien mira. */
  scope?: "admin" | "me";
}

const MIN_QUERY = 2;

const units = (n: number) => `${n.toLocaleString("es-AR")} ${n === 1 ? "unidad" : "unidades"}`;

// Ventana "Stock total de producto": se busca un producto por nombre y se ve la suma del stock de todos los productos
// con ese nombre y categoría (de cualquier marca). El nombre y el resumen quedan fijos; solo se desplaza el listado.
export default function StockTotalModal({ open, onClose, userId, initial, scope = "admin" }: Props) {
  const base = scope === "me" ? "/me/products" : "/admin/products";
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AdminProductGroupSummary[]>([]);
  const [searched, setSearched] = useState(false);
  const [group, setGroup] = useState<AdminProductGroupDetail | null>(null);
  // Productos del listado que entran en la suma (al principio, todos)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Para ignorar la respuesta de una búsqueda vieja si el usuario ya eligió o escribió otra cosa
  const requestRef = useRef(0);

  const loadGroup = (key: StockTotalTarget) => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    api
      .get<AdminProductGroupDetail>(`${base}/group`, {
        params: { nombre: key.nombre, categoria: key.categoria, ...(userId ? { user_id: userId } : {}) },
      })
      .then(({ data }) => {
        if (request !== requestRef.current) return;
        setGroup(data);
        setSelectedIds(new Set(data.productos.map((p) => p.id)));
      })
      .catch((e) => {
        if (request === requestRef.current) setError(apiErrorMessage(e, "No se pudo cargar el stock total"));
      })
      .finally(() => {
        if (request === requestRef.current) setLoading(false);
      });
  };

  useEffect(() => {
    if (!open) return;
    requestRef.current++;
    setSuggestions([]);
    setSearched(false);
    setGroup(null);
    setError(null);
    setLoading(false);
    setQuery(initial?.nombre ?? "");
    if (initial) loadGroup(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Sugerencias de productos mientras se escribe el nombre
  useEffect(() => {
    if (!open || group || loading) return;
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setSuggestions([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      api
        .get<AdminProductGroupSummary[]>(`${base}/groups`, {
          params: { q, ...(userId ? { user_id: userId } : {}) },
        })
        .then(({ data }) => {
          if (cancelled) return;
          setSuggestions(data);
          setSearched(true);
        })
        .catch(() => {
          if (cancelled) return;
          setSuggestions([]);
          setSearched(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, group, loading, open, userId]);

  if (!open) return null;

  const handleQueryChange = (value: string) => {
    requestRef.current++;
    setQuery(value);
    setGroup(null);
    setError(null);
    setLoading(false);
  };

  const handlePick = (s: AdminProductGroupSummary) => {
    setQuery(s.nombre);
    setSuggestions([]);
    loadGroup(s);
  };

  const toggle = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const included = group ? group.productos.filter((p) => selectedIds.has(p.id)) : [];
  const totalStock = included.reduce((sum, p) => sum + p.stock, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Stock total de producto"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl bg-white p-6 shadow-lift"
      >
        <div className="flex items-center justify-between">
          <h3 className="inline-flex items-center gap-2 text-lg font-semibold">
            <Layers size={18} className="text-primary" /> Stock total de producto
          </h3>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="text-muted hover:text-ink">
            <X size={20} />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          {userId
            ? "Suma el stock de todos los productos del usuario con el mismo nombre y categoría."
            : "Suma el stock de todos los usuarios de la plataforma con el mismo nombre y categoría."}
        </p>

        <label className="mt-4 text-xs font-semibold text-muted" htmlFor="stock-total-input">
          Nombre del producto
        </label>
        <div className="relative mt-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            id="stock-total-input"
            value={query}
            maxLength={60}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Escribí el nombre del producto…"
            className="w-full rounded-xl border border-line bg-white py-2 pl-9 pr-4 text-sm outline-none focus:border-primary"
          />
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {group ? (
          <>
            <div data-testid="stock-total-summary" className="mt-4 rounded-xl border border-line bg-canvas/60 p-4">
              <p data-testid="stock-total-nombre" className="text-lg font-semibold">{group.nombre}</p>
              <p className="text-sm text-muted">Categoría: {group.categoria}</p>
              <p className="mt-3 text-xs font-bold uppercase tracking-wide text-primary">Stock total</p>
              <p data-testid="stock-total-value" className="text-3xl font-bold text-primary">{units(totalStock)}</p>
              <p data-testid="stock-total-lots" className="text-sm text-muted">
                {included.length} {included.length === 1 ? "producto" : "productos"}
                {group.usuarios > 1 ? ` · ${group.usuarios} usuarios` : ""}
              </p>
            </div>
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-muted">Productos encontrados</p>
            <ul data-testid="stock-total-list" className="mt-2 min-h-0 flex-1 space-y-2 overflow-auto pr-1">
              {group.productos.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                  <ProductImage url={p.imagen_url} alt={p.nombre} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium" title={p.nombre}>{truncate(p.nombre)}</p>
                    {p.marca && <p className="text-xs text-muted">{truncate(p.marca, 30)}</p>}
                    <p className="text-xs text-muted">
                      Stock: {p.stock} · Vence: {p.vencimiento ?? "—"}
                    </p>
                    {!userId && (
                      <p className="text-xs text-muted" title={p.owner.email ?? p.owner.user_id}>
                        Dueño: {truncate(p.owner.email ?? p.owner.user_id, 30)}
                      </p>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    aria-label={`Incluir ${p.nombre} (${p.marca ?? "sin marca"}) en el total`}
                    checked={selectedIds.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="h-5 w-5"
                  />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="mt-3 min-h-0 flex-1 overflow-auto">
            {loading && <p className="py-6 text-center text-sm text-muted">Cargando…</p>}
            {!loading && suggestions.length > 0 && (
              <ul data-testid="stock-total-suggestions" className="rounded-xl border border-line">
                {suggestions.map((s) => (
                  <li key={`${s.nombre}-${s.categoria}`} className="border-b border-line/60 last:border-0">
                    <button
                      type="button"
                      onClick={() => handlePick(s)}
                      className="flex w-full flex-col px-4 py-2 text-left hover:bg-canvas"
                    >
                      <span className="text-sm">{s.nombre}</span>
                      <span className="text-xs text-muted">
                        {s.categoria} · Total: {s.stock_total}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!loading && searched && suggestions.length === 0 && (
              <p className="py-3 text-sm text-muted">No hay productos con ese nombre</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
