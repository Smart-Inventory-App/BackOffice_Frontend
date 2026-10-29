import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { LARGOS_CODIGO, digitosDelCodigo, limpiarCodigo } from "@/lib/barcode";
import { isoToDisplay } from "@/lib/dateInput";
import { invalidateInventory } from "@/lib/queries";
import { Picklist, addIfMissing } from "@/components/Picklist";
import { ProductCard } from "@/components/ExistingProduct";
import { detalle } from "@/components/scanTools";
import type {
  BulkCommitResult,
  BulkProductRow,
  ProductDraft,
  ProductMatch,
  ProductSuggestion,
  SalidaOCRResult,
  ScanResult,
} from "@/lib/types";

export type ReceiptDirection = "entrada" | "salida";
export type ReceiptOptions = { categorias: string[]; ubicaciones: string[]; marcas: string[] };

/** Los mismos límites que el formulario de entrada y la carga por archivo. */
const NOMBRE_MAX = 20;
const STOCK_MAX_DIGITS = 6;
const SEARCH_DELAY_MS = 300;

const INPUT = "w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-primary";

export type ReceiptItem = {
  /** Identifica el producto en la lista aunque se quite otro (no es el lugar que ocupa). */
  id: number;
  /** Lo que decía el documento. Un producto agregado a mano no lo tiene. */
  textoLeido: string | null;
  manual: boolean;
  included: boolean;
  /** El nombre del campo: el leído, o el que la persona escribió. */
  name: string;
  /** El producto del inventario elegido (se muestra sin poder editarlo). */
  selected: ProductSuggestion | null;
  /** Los productos recomendados: los más parecidos al nombre. */
  options: ProductSuggestion[];
  /** Porcentaje de parecido de los que recomendó la lectura, por id de producto. */
  similarity: Record<number, number>;
  /** Ya se buscó con el nombre que hay en el campo: sin opciones, significa que no hay coincidencias. */
  searched: boolean;
  /** Entrada: la persona decidió crear un producto nuevo con este nombre. */
  creating: boolean;
  categoria: string;
  marca: string;
  vencimiento: string;
  codigo: string;
  descripcion: string;
  ubicacion: string;
  /** Texto del campo de stock: puede quedar en blanco y entonces se avisa. */
  quantity: string;
};

export type ReceiptError =
  | { field: "name"; kind: "noName" | "noProduct" | "tooLong" }
  | { field: "categoria"; kind: "required" }
  | { field: "codigo"; kind: "invalid" }
  | { field: "quantity"; kind: "required" }
  | { field: "quantity"; kind: "exceeds"; available: number };

const toSuggestion = (match: ProductMatch): ProductSuggestion => ({
  id: match.id,
  nombre: match.nombre,
  marca: match.marca,
  categoria: match.categoria ?? "",
  ubicacion: match.ubicacion,
  vencimiento: match.vencimiento,
  stock: match.stock,
  stock_minimo: null,
  dias_alerta_vencimiento: null,
  codigo_barras: match.codigo_barras,
});

/** Une las listas de productos en ese orden, sin repetir ninguno. */
export function mergeSuggestions(...lists: ProductSuggestion[][]): ProductSuggestion[] {
  const seen = new Set<number>();
  const merged: ProductSuggestion[] = [];
  for (const list of lists) {
    for (const product of list) {
      if (seen.has(product.id)) continue;
      seen.add(product.id);
      merged.push(product);
    }
  }
  return merged;
}

const EMPTY_FIELDS = { creating: false, categoria: "", marca: "", vencimiento: "", codigo: "", descripcion: "", ubicacion: "" };

/**
 * Los productos leídos del documento, como arrancan: el nombre es el texto leído y debajo se recomiendan los productos
 * parecidos, de mayor a menor parecido. Ninguno queda elegido y no se completa ningún otro dato.
 */
export function initReceiptItems(drafts: ProductDraft[]): ReceiptItem[] {
  return drafts.map((draft, index) => {
    const matches = [...draft.coincidencias].sort((a, b) => b.score - a.score);
    const similarity: Record<number, number> = {};
    matches.forEach((match) => {
      similarity[match.id] = Math.round(match.score * 100);
    });
    return {
      id: index,
      textoLeido: draft.texto_leido ?? draft.nombre ?? null,
      manual: false,
      included: true,
      name: draft.texto_leido ?? draft.nombre ?? "",
      selected: null,
      options: matches.map(toSuggestion),
      similarity,
      searched: true,
      ...EMPTY_FIELDS,
      quantity: draft.stock != null && draft.stock > 0 ? String(draft.stock) : "1",
    };
  });
}

/** Un producto agregado a mano: sin texto leído, con el nombre y el stock en blanco. */
export function blankReceiptItem(id: number): ReceiptItem {
  return {
    id, textoLeido: null, manual: true, included: true, name: "", selected: null, options: [], similarity: {},
    searched: false, ...EMPTY_FIELDS, quantity: "",
  };
}

const parseQuantity = (quantity: string): number => {
  const value = parseInt(quantity, 10);
  return Number.isNaN(value) ? 0 : value;
};

/**
 * Lo que está mal de cada producto, por id. En una salida el stock a sacar no puede superar el que se tiene del producto
 * (si dos productos leídos son el mismo, entre los dos).
 */
export function validateReceiptItems(items: ReceiptItem[], direction: ReceiptDirection): Record<number, ReceiptError[]> {
  const errors: Record<number, ReceiptError[]> = {};
  const taken: Record<number, number> = {};
  for (const item of items) {
    const list: ReceiptError[] = [];
    if (item.creating) {
      if (!item.name.trim()) list.push({ field: "name", kind: "noName" });
      else if (item.name.trim().length > NOMBRE_MAX) list.push({ field: "name", kind: "tooLong" });
      if (!item.categoria.trim()) list.push({ field: "categoria", kind: "required" });
      if (item.codigo && !LARGOS_CODIGO.includes(digitosDelCodigo(item.codigo).length)) list.push({ field: "codigo", kind: "invalid" });
    } else if (!item.selected) {
      list.push({ field: "name", kind: item.name.trim() ? "noProduct" : "noName" });
    }
    const quantity = parseQuantity(item.quantity);
    if (quantity <= 0) {
      list.push({ field: "quantity", kind: "required" });
    } else if (direction === "salida" && item.selected) {
      taken[item.selected.id] = (taken[item.selected.id] ?? 0) + quantity;
      if (taken[item.selected.id] > item.selected.stock) list.push({ field: "quantity", kind: "exceeds", available: item.selected.stock });
    }
    errors[item.id] = list;
  }
  return errors;
}

/** Las filas que se mandan en una entrada: el producto elegido (se le suma stock) o el nuevo que se creó. */
export function buildEntradaRows(items: ReceiptItem[]): BulkProductRow[] {
  return items.map((item, index) => {
    const base = { row_number: index + 1, stock: parseQuantity(item.quantity), imagen_url: null, stock_minimo: null, dias_alerta_vencimiento: null };
    if (item.selected) {
      const p = item.selected;
      return {
        ...base, nombre: p.nombre, marca: p.marca, categoria: p.categoria, vencimiento: p.vencimiento, codigo_barras: p.codigo_barras ?? null,
        descripcion: null, ubicacion: p.ubicacion,
      };
    }
    return {
      ...base, nombre: item.name.trim(), marca: item.marca || null, categoria: item.categoria, vencimiento: item.vencimiento || null,
      codigo_barras: item.codigo ? digitosDelCodigo(item.codigo) : null, descripcion: item.descripcion || null, ubicacion: item.ubicacion || null,
    };
  });
}

function messageOf(error: ReceiptError, direction: ReceiptDirection): string {
  if (error.field === "name") {
    if (error.kind === "noName") return "Escribí el nombre del producto";
    if (error.kind === "tooLong") return `El nombre no puede superar los ${NOMBRE_MAX} caracteres`;
    return direction === "entrada" ? "Elegí un producto de tu inventario o creá uno nuevo" : "Elegí un producto de tu inventario";
  }
  if (error.field === "categoria") return "La categoría es requerida";
  if (error.field === "codigo") return "El código de barras es inválido";
  if (error.kind === "required") return "El stock debe ser mayor a 0";
  return `El stock no puede superar el disponible (${error.available})`;
}

function CabeceraComprobante({ resultado }: { resultado: ScanResult }) {
  const c = resultado.comprobante;
  if (!c) return null;
  return (
    <div className="rounded-xl border border-line p-4 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Comprobante</p>
      <p className="mt-1 font-medium text-ink">{c.comercio ?? "Comercio no reconocido"}</p>
      <p className="text-muted">
        {c.fecha_compra ? `Fecha ${c.fecha_compra}` : "Sin fecha"}
        {c.total !== null ? ` · total ${c.total}` : ""} · {resultado.items.length} renglones leídos
      </p>
    </div>
  );
}

/**
 * Los productos leídos de un ticket, remito o factura, con el mismo formato que la carga por archivo: a la izquierda la
 * lista (con su casilla y un punto rojo si falta algo) y a la derecha el producto elegido para revisar. Cada uno arranca
 * con el texto leído como nombre y, debajo, los productos del inventario parecidos; al elegir uno se ve su información
 * (sin poder editarla) y se indica el stock. Se pueden quitar productos y agregar uno a mano. En una entrada, si ninguno
 * corresponde, se crea un producto nuevo; en una salida solo se puede descontar de un producto que existe.
 */
export default function ReceiptReview({
  direction,
  resultado,
  opciones,
  setOpciones,
  origen,
  onDone,
  onScanAnother,
}: {
  direction: ReceiptDirection;
  resultado: ScanResult;
  opciones: ReceiptOptions;
  setOpciones: (o: ReceiptOptions) => void;
  /** El motivo que queda asentado en los movimientos. */
  origen: string;
  onDone: (data: BulkCommitResult | SalidaOCRResult) => void;
  onScanAnother: () => void;
}) {
  const qc = useQueryClient();
  const entrada = direction === "entrada";
  const [items, setItems] = useState<ReceiptItem[]>(() => initReceiptItems(resultado.items));
  const [activeId, setActiveId] = useState<number | null>(() => (resultado.items.length > 0 ? 0 : null));
  const [submitted, setSubmitted] = useState(false);
  const nextId = useRef(resultado.items.length);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const pending = timers.current;
    return () => {
      mounted.current = false;
      Object.values(pending).forEach(clearTimeout);
    };
  }, []);

  const update = (id: number, patch: Partial<ReceiptItem>) => setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  // Se buscan los productos parecidos al nombre que quedó escrito, un instante después de la última letra
  const search = (id: number, text: string) => {
    clearTimeout(timers.current[id]);
    const name = text.trim();
    if (name.length < 2) return;
    timers.current[id] = setTimeout(async () => {
      const ask = async (url: string) => (await api.get<ProductSuggestion[]>(url, { params: { q: name } })).data;
      const [byMatch, bySuggest] = await Promise.allSettled([ask("/me/products/match"), ask("/me/products/suggest")]);
      if (!mounted.current || (byMatch.status === "rejected" && bySuggest.status === "rejected")) return;
      const found = mergeSuggestions(byMatch.status === "fulfilled" ? byMatch.value : [], bySuggest.status === "fulfilled" ? bySuggest.value : []);
      // Si mientras tanto siguió escribiendo, esta búsqueda ya no sirve
      setItems((prev) => prev.map((item) => (item.id === id && item.name === text ? { ...item, options: found, searched: true } : item)));
    }, SEARCH_DELAY_MS);
  };

  const changeName = (id: number, text: string, creating: boolean) => {
    if (creating) {
      update(id, { name: text });
      return;
    }
    // Al cambiar el nombre se pierde el producto elegido y se buscan los parecidos al nuevo nombre
    update(id, { name: text, selected: null, options: [], similarity: {}, searched: false });
    search(id, text);
  };

  const pick = (id: number, option: ProductSuggestion) => update(id, { selected: option, name: option.nombre, options: [], similarity: {}, searched: true, creating: false });

  const chooseAnother = (item: ReceiptItem) => {
    update(item.id, { selected: null, options: [], similarity: {}, searched: false });
    search(item.id, item.name);
  };

  const startCreating = (item: ReceiptItem) => update(item.id, { creating: true, selected: null });

  const backToExisting = (item: ReceiptItem) => {
    update(item.id, { creating: false, options: [], similarity: {}, searched: false });
    search(item.id, item.name);
  };

  const addItem = () => {
    const id = nextId.current++;
    // El nuevo queda al inicio de la lista, a la vista
    setItems((prev) => [blankReceiptItem(id), ...prev]);
    setActiveId(id);
  };

  const removeItem = (id: number) => {
    clearTimeout(timers.current[id]);
    const index = items.findIndex((item) => item.id === id);
    const rest = items.filter((item) => item.id !== id);
    setItems(rest);
    setActiveId((current) => (current === id ? (rest[Math.min(index, rest.length - 1)]?.id ?? null) : current));
  };

  const errors = validateReceiptItems(items, direction);
  const invalid = items.filter((item) => errors[item.id].length > 0);
  const toSend = items.filter((item) => item.included && errors[item.id].length === 0);
  const active = items.find((item) => item.id === activeId) ?? null;

  const confirmar = useMutation({
    mutationFn: async () => {
      if (entrada) {
        const { data } = await api.post<BulkCommitResult>("/me/products/bulk/commit", { rows: buildEntradaRows(toSend), mode: "entrada", origen });
        return data;
      }
      const { data } = await api.post<SalidaOCRResult>("/me/products/ocr/salida", {
        items: toSend.map((item) => ({ product_id: item.selected!.id, quantity: parseQuantity(item.quantity) })),
        comercio: resultado.comprobante?.comercio ?? null,
      });
      return data;
    },
    onSuccess: (data) => {
      invalidateInventory(qc);
      qc.invalidateQueries({ queryKey: ["my-products-filter-options"] });
      onDone(data);
    },
  });

  const confirm = () => {
    if (items.length === 0) return;
    setSubmitted(true);
    // Con productos incompletos o con un stock inválido no se confirma: hay que corregirlos o quitarlos
    if (invalid.length > 0) {
      setActiveId(invalid[0].id);
      return;
    }
    if (toSend.length > 0) confirmar.mutate();
  };

  const errorOf = (item: ReceiptItem, field: ReceiptError["field"]) => {
    // Lo que está mal se avisa enseguida, debajo de su campo
    const found = errors[item.id].find((e) => e.field === field);
    return found ? messageOf(found, direction) : null;
  };

  const label = (item: ReceiptItem) => item.name.trim() || (item.manual ? "Producto nuevo" : "Sin nombre");

  const renderOptions = (item: ReceiptItem) => {
    if (item.options.length > 0) {
      return (
        <div data-testid={`receipt-options-${item.id}`} className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{entrada ? "¿Es alguno de estos?" : "¿De cuál se descarga?"}</p>
          {item.options.map((option) => (
            <button
              key={option.id}
              type="button"
              data-testid={`receipt-option-${item.id}-${option.id}`}
              onClick={() => pick(item.id, option)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-line px-4 py-2 text-left text-sm transition hover:border-primary/50 hover:bg-canvas"
            >
              <span>
                <span className="font-medium text-ink">{option.nombre}</span>
                {option.marca && <span className="text-muted"> · {option.marca}</span>}
                <span className="block text-xs text-muted">
                  {option.vencimiento ? `Vence ${isoToDisplay(option.vencimiento)}` : "Sin vencimiento"} · Stock: {option.stock}
                </span>
              </span>
              {item.similarity[option.id] != null && (
                <span data-testid={`receipt-similarity-${item.id}-${option.id}`} className="shrink-0 text-xs text-muted">
                  {item.similarity[option.id]}% de similitud
                </span>
              )}
            </button>
          ))}
        </div>
      );
    }
    if (item.searched && item.name.trim()) {
      return (
        <p data-testid={`receipt-no-match-${item.id}`} className="rounded-xl bg-canvas px-4 py-3 text-sm text-muted">
          No hay productos en tu inventario que coincidan con este nombre
        </p>
      );
    }
    return null;
  };

  const renderNewProduct = (item: ReceiptItem) => (
    <div data-testid={`receipt-new-${item.id}`} className="space-y-3 rounded-xl border border-line p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Producto nuevo</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Picklist
          label="Categoría *"
          addPlaceholder="Ej. Lácteos"
          maxLength={NOMBRE_MAX}
          value={item.categoria}
          options={opciones.categorias}
          onChange={(v) => {
            update(item.id, { categoria: v });
            setOpciones({ ...opciones, categorias: addIfMissing(opciones.categorias, v) });
          }}
        />
        <Picklist
          label="Marca"
          addPlaceholder="Opcional"
          maxLength={NOMBRE_MAX}
          emptyLabel="Sin marca"
          value={item.marca}
          options={opciones.marcas}
          onChange={(v) => {
            update(item.id, { marca: v });
            setOpciones({ ...opciones, marcas: addIfMissing(opciones.marcas, v) });
          }}
        />
      </div>
      {errorOf(item, "categoria") && <p className="text-xs text-danger">{errorOf(item, "categoria")}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Fecha de vencimiento</label>
          <input type="date" value={item.vencimiento} onChange={(e) => update(item.id, { vencimiento: e.target.value })} className={INPUT} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Código de barras</label>
          <input
            inputMode="numeric"
            placeholder="Opcional"
            aria-label="Código de barras"
            value={item.codigo}
            onChange={(e) => update(item.id, { codigo: limpiarCodigo(e.target.value) })}
            className={INPUT}
          />
          {errorOf(item, "codigo") && <p className="mt-1 text-xs text-danger">{errorOf(item, "codigo")}</p>}
        </div>
      </div>
      <Picklist
        label="Ubicación de guardado"
        addPlaceholder="Opcional"
        maxLength={NOMBRE_MAX}
        value={item.ubicacion}
        options={opciones.ubicaciones}
        onChange={(v) => {
          update(item.id, { ubicacion: v });
          setOpciones({ ...opciones, ubicaciones: addIfMissing(opciones.ubicaciones, v) });
        }}
      />
      <div>
        <label className="mb-1 block text-sm font-medium text-ink">Descripción</label>
        <textarea placeholder="Opcional" rows={2} value={item.descripcion} onChange={(e) => update(item.id, { descripcion: e.target.value })} className={`${INPUT} resize-none`} />
      </div>
      <button type="button" data-testid={`receipt-back-${item.id}`} onClick={() => backToExisting(item)} className="text-xs font-medium text-muted underline hover:text-primaryDark">
        Elegir un producto existente
      </button>
    </div>
  );

  const renderDetail = (item: ReceiptItem) => (
    <div data-testid={`receipt-detail-${item.id}`} className="space-y-4 rounded-xl border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {item.manual ? (
            <p data-testid={`receipt-manual-${item.id}`} className="text-sm font-semibold text-ink">{entrada ? "Entrada manual" : "Salida manual"}</p>
          ) : (
            <>
              <p className="text-[11px] text-muted">Texto leído</p>
              <p data-testid={`receipt-read-${item.id}`} className="break-words font-mono text-sm font-semibold text-ink">{item.textoLeido}</p>
            </>
          )}
        </div>
        <button
          type="button"
          data-testid={`receipt-remove-${item.id}`}
          onClick={() => removeItem(item.id)}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-danger hover:underline"
        >
          <Trash2 size={13} /> Quitar de la lista
        </button>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-ink">{item.creating ? "Nombre *" : "Producto"}</label>
        <input
          data-testid={`receipt-name-${item.id}`}
          aria-label={item.creating ? "Nombre del producto nuevo" : "Producto"}
          placeholder="Nombre o código de barras"
          maxLength={item.creating ? NOMBRE_MAX : 60}
          value={item.name}
          onChange={(e) => changeName(item.id, e.target.value, item.creating)}
          className={`${INPUT} ${errorOf(item, "name") ? "border-danger" : ""}`}
        />
        {errorOf(item, "name") && <p data-testid={`receipt-name-error-${item.id}`} className="mt-1 text-xs text-danger">{errorOf(item, "name")}</p>}
      </div>

      {item.creating ? (
        renderNewProduct(item)
      ) : item.selected ? (
        <div className="space-y-2">
          <ProductCard product={item.selected} testIdPrefix={`receipt-selected-${item.id}`} />
          <button type="button" data-testid={`receipt-change-${item.id}`} onClick={() => chooseAnother(item)} className="text-xs font-medium text-muted underline hover:text-primaryDark">
            Elegir un producto diferente
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {renderOptions(item)}
          {entrada && (
            <button
              type="button"
              data-testid={`receipt-create-${item.id}`}
              onClick={() => startCreating(item)}
              className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-canvas"
            >
              Crear producto nuevo
            </button>
          )}
        </div>
      )}

      <div className="max-w-xs">
        <label className="mb-1 block text-sm font-medium text-ink">{entrada ? "Stock" : "Stock a sacar"}</label>
        <input
          inputMode="numeric"
          placeholder="0"
          aria-label={entrada ? "Stock" : "Stock a sacar"}
          data-testid={`receipt-quantity-${item.id}`}
          maxLength={STOCK_MAX_DIGITS}
          value={item.quantity}
          onChange={(e) => update(item.id, { quantity: e.target.value.replace(/\D/g, "").slice(0, STOCK_MAX_DIGITS) })}
          className={`${INPUT} ${errorOf(item, "quantity") ? "border-danger" : ""}`}
        />
        {errorOf(item, "quantity") && <p data-testid={`receipt-quantity-error-${item.id}`} className="mt-1 text-xs text-danger">{errorOf(item, "quantity")}</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <CabeceraComprobante resultado={resultado} />
      {!entrada && (
        <p className="rounded-xl bg-canvas px-4 py-2.5 text-sm text-muted">
          El motivo de estas salidas queda asentado como <span className="font-medium text-ink">{origen}</span>.
        </p>
      )}

      {items.length === 0 && (
        <p data-testid="receipt-empty" className="rounded-xl bg-canvas px-4 py-3 text-sm text-muted">
          No se reconoció ningún producto en esta foto. Probá con una toma más nítida o agregá los productos a mano.
        </p>
      )}

      <div className="flex flex-col gap-4 md:flex-row">
        <div className="w-full shrink-0 md:w-60">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p data-testid="receipt-items-title" className="text-sm font-bold text-ink">{entrada ? "Productos a ingresar" : "Productos a salir"}</p>
            <button
              type="button"
              data-testid="receipt-add"
              aria-label="Agregar un producto"
              title="Agregar un producto"
              onClick={addItem}
              className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-primary bg-white text-primary transition hover:bg-primary/10"
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="max-h-[55vh] space-y-1 overflow-auto rounded-xl border border-line p-2">
            {items.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted">Sin productos</p>}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`receipt-line-${item.id}`}
                onClick={() => setActiveId(item.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${activeId === item.id ? "bg-primary text-white" : "hover:bg-canvas"}`}
              >
                <input
                  type="checkbox"
                  aria-label={`Incluir ${label(item)}`}
                  checked={item.included && errors[item.id].length === 0}
                  disabled={errors[item.id].length > 0}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => update(item.id, { included: e.target.checked })}
                />
                <span className="flex-1 truncate" title={label(item)}>{label(item)}</span>
                <span
                  data-testid={`receipt-dot-${item.id}`}
                  className={`h-2 w-2 shrink-0 rounded-full ${errors[item.id].length > 0 ? "bg-danger" : "bg-primary"} ${activeId === item.id ? "!bg-white" : ""}`}
                />
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {toSend.length} de {items.length} {items.length === 1 ? "producto incluido" : "productos incluidos"}
          </p>
        </div>

        <div className="min-w-0 flex-1">{active ? renderDetail(active) : null}</div>
      </div>

      {submitted && invalid.length > 0 && (
        <p data-testid="receipt-invalid" role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          Corregí o eliminá {invalid.length === 1 ? "el producto" : `los ${invalid.length} productos`} con datos incompletos o inválidos antes de confirmar:{" "}
          {invalid.map((item) => `«${label(item)}»`).join(", ")}.
        </p>
      )}

      {confirmar.isError && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {detalle(confirmar.error, entrada ? "No se pudo cargar el comprobante." : "No se pudieron registrar las salidas.")}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="receipt-confirm"
          onClick={confirm}
          disabled={confirmar.isPending || toSend.length === 0}
          className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 ${entrada ? "bg-primary" : "bg-danger"}`}
        >
          {confirmar.isPending
            ? entrada ? "Cargando…" : "Registrando…"
            : `${entrada ? "Confirmar carga" : "Confirmar salida"} (${toSend.length} ${toSend.length === 1 ? "producto" : "productos"})`}
        </button>
        <button type="button" onClick={onScanAnother} className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas">
          Descartar y escanear otro
        </button>
      </div>
    </div>
  );
}
