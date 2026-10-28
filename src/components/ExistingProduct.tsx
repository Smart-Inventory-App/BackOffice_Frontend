import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { LARGOS_CODIGO, digitosDelCodigo, limpiarCodigo } from "@/lib/barcode";
import { isoToDisplay } from "@/lib/dateInput";
import { invalidateInventory } from "@/lib/queries";
import { BotonProcesar, ErrorScan, FotoInput, Progreso, detalle, unidades, useScan } from "@/components/scanTools";
import ProductImage from "@/components/ProductImage";
import type { Prefill } from "@/components/Procesamiento";
import type { ProductDraft, ProductMatch, ProductSuggestion } from "@/lib/types";

/** Como en la app: el campo muestra el nombre y los datos del producto elegido van en su tarjeta. */
const NAME_MAX = 60;
const STOCK_MAX_DIGITS = 6;
const BARCODE_MAX = 14;

export type ExistingMethod = "nombre" | "etiqueta" | "codigo";
type Step = "input" | "edit" | "results";

const INPUT = "w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary";
const PRIMARY = "rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50";
const SECONDARY = "rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas";

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
function mergeSuggestions(...lists: ProductSuggestion[][]): ProductSuggestion[] {
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

const productLabel = (p: ProductSuggestion) => p.nombre + (p.marca ? ` · ${p.marca}` : "");

function Field({ label, children, error }: { label: string; children: ReactNode; error?: string | null }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink">{label}</label>
      {children}
      {error && (
        <p data-testid="existing-error" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** La información del producto elegido: lo que hay que ver antes de ingresarle stock. */
function ProductCard({ product }: { product: ProductSuggestion }) {
  return (
    <div data-testid="existing-selected" className="flex items-start gap-4 rounded-xl border border-primary/40 bg-primary/5 p-4">
      <ProductImage url={product.imagen_url ?? null} alt={product.nombre} className="h-20 w-20 shrink-0 !rounded-xl" />
      <div className="min-w-0 space-y-0.5 text-sm">
        <p data-testid="existing-selected-name" className="break-words text-base font-semibold text-ink">
          {product.nombre}
        </p>
        {product.marca && <p className="text-muted">{product.marca}</p>}
        <p className="text-muted">Categoría: {product.categoria || "—"}</p>
        <p className="font-medium text-ink">Stock actual: {product.stock}</p>
        <p className="text-muted">{product.vencimiento ? `Vence ${isoToDisplay(product.vencimiento)}` : "Sin vencimiento"}</p>
        {product.ubicacion && <p className="text-muted">Ubicación: {product.ubicacion}</p>}
        {product.codigo_barras && <p className="text-muted">Código de barras: {product.codigo_barras}</p>}
      </div>
    </div>
  );
}

/**
 * «Producto existente»: encontrar un producto que ya está cargado —por su nombre, escaneando su etiqueta o con su código de
 * barras escrito a mano o leído de una foto— y, al elegirlo, ver su información e ingresarle stock. Es el mismo recorrido
 * que «Ingresar producto existente» de la app: lo leído se puede corregir antes de buscar, se muestran los productos
 * parecidos y, si no hay ninguno, se ofrece cargarlo como producto nuevo.
 *
 * En una salida (`mode="exit"`) no se pide stock: el producto elegido vuelve al formulario de salida, donde se indican la
 * cantidad y el motivo.
 */
export default function ProductoExistente({
  mode = "entry",
  method,
  onLoadAsNew,
  onSelectProduct,
}: {
  mode?: "entry" | "exit";
  method: ExistingMethod;
  /** Entrada: no hay ningún producto parecido y la persona quiere cargar uno nuevo con lo escaneado. */
  onLoadAsNew?: (prefill: Prefill) => void;
  /** Salida: el producto elegido entre las coincidencias. */
  onSelectProduct?: (product: ProductSuggestion) => void;
}) {
  const qc = useQueryClient();
  const etiqueta = useScan("product_label");
  const codigoScan = useScan("barcode");

  const [step, setStep] = useState<Step>("input");
  const [error, setError] = useState<{ message: string; field: "name" | "barcode" | "stock" | null } | null>(null);
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [labelName, setLabelName] = useState("");
  const [labelDraft, setLabelDraft] = useState<ProductDraft | null>(null);
  const [fotoEtiqueta, setFotoEtiqueta] = useState<File | null>(null);
  const [fotoCodigo, setFotoCodigo] = useState<File | null>(null);
  const [options, setOptions] = useState<ProductSuggestion[]>([]);
  const [selected, setSelected] = useState<ProductSuggestion | null>(null);
  const [stock, setStock] = useState("");
  const [searching, setSearching] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const exit = mode === "exit";
  const showError = (message: string, field: "name" | "barcode" | "stock" | null = null) => setError({ message, field });
  const fieldError = (field: "name" | "barcode" | "stock") => (error?.field === field ? error.message : null);

  // Sugerencias mientras se escribe el nombre
  useEffect(() => {
    if (method !== "nombre" || selected) return;
    const q = query.trim();
    if (q.length < 2) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      api
        .get<ProductSuggestion[]>("/me/products/suggest", { params: { q } })
        .then(({ data }) => !cancelled && setOptions(data))
        .catch(() => !cancelled && setOptions([]));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, selected, method]);

  // La etiqueta leída: se corrige antes de buscar
  const etiquetaDraft = etiqueta.resultado?.draft ?? null;
  useEffect(() => {
    if (!etiquetaDraft || step !== "input" || method !== "etiqueta") return;
    setLabelDraft(etiquetaDraft);
    setLabelName(etiquetaDraft.nombre ?? "");
    setStep("edit");
  }, [etiquetaDraft, step, method]);

  // El código leído de la foto completa el campo, que sigue siendo editable
  const codigoLeido = codigoScan.resultado;
  useEffect(() => {
    if (!codigoLeido || method !== "codigo") return;
    setBarcode(digitosDelCodigo(codigoLeido.draft?.codigo_barras ?? ""));
    setError(codigoLeido.draft?.codigo_barras ? null : { message: "No se pudo leer un código de barras en la foto. Escribilo a mano o volvé a escanear con una foto más nítida.", field: "barcode" });
  }, [codigoLeido, method]);

  const clearSelection = () => {
    setSelected(null);
    setStock("");
    setError(null);
  };

  const search = async (find: () => Promise<ProductSuggestion[]>) => {
    setSearching(true);
    try {
      setOptions(await find());
      clearSelection();
      setStep("results");
    } catch {
      showError("No se pudieron buscar los productos. Intentá de nuevo.");
    } finally {
      setSearching(false);
    }
  };

  const searchBarcode = async () => {
    setError(null);
    const digits = digitosDelCodigo(barcode);
    if (!LARGOS_CODIGO.includes(digits.length)) {
      showError("El código de barras es inválido", "barcode");
      return;
    }
    await search(async () => (await api.get<ProductSuggestion[]>(`/me/products/by-barcode/${digits}/all`)).data);
  };

  const searchLabel = async () => {
    setError(null);
    const name = labelName.trim();
    if (!name) {
      showError("Escribí el nombre del producto", "name");
      return;
    }
    // Se compara con el nombre, la marca y la descripción de los productos, no solo con el nombre
    const text = [name, labelDraft?.marca, labelDraft?.descripcion].filter(Boolean).join(" ");
    await search(async () => {
      const ask = async (url: string, q: string) => (await api.get<ProductSuggestion[]>(url, { params: { q } })).data;
      // Además de esa comparación, se buscan siempre los productos con un nombre parecido al que quedó escrito (la persona
      // pudo corregirlo): así aparecen sí o sí, aunque la marca y la descripción leídas los alejen
      const [byText, byName, similar] = await Promise.allSettled([
        ask("/me/products/match", text),
        text === name ? Promise.resolve([] as ProductSuggestion[]) : ask("/me/products/match", name),
        ask("/me/products/suggest", name),
      ]);
      if (byText.status === "rejected" && byName.status === "rejected" && similar.status === "rejected") throw byText.reason;
      const found = mergeSuggestions(...[byText, byName, similar].map((r) => (r.status === "fulfilled" ? r.value : [])));
      // Con el nombre tal cual lo leyó la etiqueta, también sirven las coincidencias que armó el escaneo
      if (found.length === 0 && name === (labelDraft?.nombre ?? "").trim()) return (labelDraft?.coincidencias ?? []).map(toSuggestion);
      return found;
    });
  };

  const pick = (option: ProductSuggestion) => {
    setSelected(option);
    setError(null);
    if (method === "nombre") {
      // En el campo va solo el nombre: la marca y los demás datos se muestran en la tarjeta del producto
      setQuery(option.nombre);
      setOptions([]);
    }
  };

  const restock = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ stock: number }>(`/me/products/${selected!.id}/restock`, { quantity: Number(stock) });
      return data;
    },
    onSuccess: (data) => {
      invalidateInventory(qc);
      qc.invalidateQueries({ queryKey: ["my-products-filter-options"] });
      setDone(`Se ha registrado la entrada de ${unidades(Number(stock))} de "${selected!.nombre}". Stock actual ${data.stock}.`);
      reset();
    },
    onError: (err: any) => showError(detalle(err, "No se pudo guardar el producto")),
  });

  const confirm = () => {
    if (!selected) return;
    if (exit) {
      onSelectProduct?.(selected);
      return;
    }
    if (!stock || Number(stock) <= 0) {
      showError("El stock debe ser mayor a 0", "stock");
      return;
    }
    setError(null);
    setDone(null);
    restock.mutate();
  };

  function reset() {
    etiqueta.reiniciar();
    codigoScan.reiniciar();
    setStep("input");
    setError(null);
    setQuery("");
    setBarcode("");
    setLabelName("");
    setLabelDraft(null);
    setFotoEtiqueta(null);
    setFotoCodigo(null);
    setOptions([]);
    setSelected(null);
    setStock("");
  }

  // Lo escaneado, para llevarlo al formulario de un producto nuevo
  const asNew = (): Prefill =>
    method === "codigo"
      ? { codigo_barras: digitosDelCodigo(barcode) }
      : {
          nombre: labelName.trim() || labelDraft?.nombre || "",
          marca: labelDraft?.marca ?? "",
          descripcion: labelDraft?.descripcion ?? "",
          vencimiento: labelDraft?.vencimiento ?? "",
          codigo_barras: labelDraft?.codigo_barras ?? "",
        };

  const errorBanner = error && !error.field && (
    <p data-testid="existing-error" role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
      {error.message}
    </p>
  );

  const optionsList = (title: string) => (
    <div className="space-y-1.5">
      <p data-testid="existing-options-title" className="text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </p>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          data-testid={`existing-option-${option.id}`}
          onClick={() => pick(option)}
          className="block w-full rounded-xl border border-line px-4 py-2 text-left text-sm transition hover:border-primary/50 hover:bg-canvas"
        >
          <span className="font-medium text-ink">{productLabel(option)}</span>
          <span className="block text-xs text-muted">
            {option.vencimiento ? `Vence ${isoToDisplay(option.vencimiento)}` : "Sin vencimiento"} · Stock: {option.stock}
          </span>
        </button>
      ))}
    </div>
  );

  // Con un producto elegido desaparecen las demás opciones: su información y, en una entrada, el stock a ingresar
  const selectedForm = selected && (
    <div className="space-y-4">
      <ProductCard product={selected} />
      {!exit && (
        <div className="max-w-xs">
          <Field label="Stock a ingresar *" error={fieldError("stock")}>
            <input
              inputMode="numeric"
              placeholder="0"
              aria-label="Stock a ingresar"
              maxLength={STOCK_MAX_DIGITS}
              value={stock}
              onChange={(e) => {
                setStock(e.target.value.replace(/\D/g, "").slice(0, STOCK_MAX_DIGITS));
                setError(null);
              }}
              className={INPUT}
            />
          </Field>
        </div>
      )}
      {errorBanner}
      <div className="flex flex-wrap gap-2">
        <button type="button" data-testid="existing-confirm" onClick={confirm} disabled={restock.isPending} className={PRIMARY}>
          {restock.isPending ? "Guardando…" : "Confirmar"}
        </button>
        <button type="button" data-testid="existing-change" onClick={clearSelection} className={SECONDARY}>
          {method === "nombre" ? "Cancelar" : "Cambiar"}
        </button>
      </div>
    </div>
  );

  const notFound = (
    <div className="space-y-3">
      <p data-testid="existing-not-found" className="rounded-xl bg-canvas px-4 py-3 text-sm text-muted">
        No existe un producto con la información escaneada
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" data-testid="existing-edit-again" onClick={() => setStep(method === "etiqueta" ? "edit" : "input")} className={SECONDARY}>
          {exit ? "Volver atrás" : "Editar de nuevo"}
        </button>
        {!exit && (
          <button type="button" data-testid="existing-load-new" onClick={() => onLoadAsNew?.(asNew())} className={PRIMARY}>
            Cargar nuevo producto
          </button>
        )}
      </div>
    </div>
  );

  const successNotice = done && (
    <p role="status" data-testid="flow-success" className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm text-primaryDark">
      <CheckCircle2 size={16} className="shrink-0" /> {done}
    </p>
  );

  /* ── por nombre ── */
  if (method === "nombre") {
    return (
      <div className="space-y-4">
        {successNotice}
        <Field label="Nombre del producto *">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              clearSelection();
              setDone(null);
            }}
            placeholder="Escribí el nombre del producto"
            aria-label="Nombre del producto"
            maxLength={NAME_MAX}
            autoComplete="off"
            className={INPUT}
          />
        </Field>
        {!selected && options.length > 0 && optionsList("Elegí el producto")}
        {!selected && query.trim().length >= 2 && options.length === 0 && (
          <p className="text-xs text-muted">No encontramos ningún producto tuyo con ese nombre.</p>
        )}
        {selectedForm}
      </div>
    );
  }

  /* ── resultados de una búsqueda por lo escaneado ── */
  if (step === "results") {
    return (
      <div className="space-y-4">
        {options.length === 0 ? (
          notFound
        ) : (
          <>
            {!selected && optionsList("Productos reconocidos")}
            {selectedForm}
            {!selected && (
              <button type="button" data-testid="existing-edit-again" onClick={() => { clearSelection(); setStep(method === "etiqueta" ? "edit" : "input"); }} className="text-xs font-medium text-muted underline hover:text-primaryDark">
                Editar de nuevo
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  /* ── por etiqueta ── */
  if (method === "etiqueta") {
    if (step === "edit") {
      return (
        <div className="space-y-4">
          {errorBanner}
          <p className="text-sm font-semibold text-ink">Información leída de la etiqueta</p>
          {!labelDraft?.nombre && (
            <p data-testid="existing-name-not-read" className="text-sm text-muted">
              No se pudo leer el nombre del producto en la etiqueta. Escribilo para continuar.
            </p>
          )}
          {labelDraft?.texto_leido && <p className="text-xs text-muted">Texto leído: {labelDraft.texto_leido}</p>}
          {labelDraft?.marca && <p className="text-sm text-muted">Marca: {labelDraft.marca}</p>}
          {labelDraft?.vencimiento && <p className="text-sm text-muted">Vencimiento: {isoToDisplay(labelDraft.vencimiento)}</p>}
          <div className="max-w-md">
            <Field label="Nombre del producto *" error={fieldError("name")}>
              <input
                value={labelName}
                onChange={(e) => {
                  setLabelName(e.target.value);
                  setError(null);
                }}
                placeholder="Escribí el nombre del producto"
                aria-label="Nombre del producto"
                className={`${INPUT} ${error?.field === "name" ? "border-danger" : ""}`}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="existing-edit-confirm" onClick={searchLabel} disabled={searching} className={PRIMARY}>
              Confirmar
            </button>
            <button type="button" data-testid="existing-edit-cancel" onClick={reset} className={SECONDARY}>
              Cancelar
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {successNotice}
        <div className="max-w-sm">
          <FotoInput label="Escanea la etiqueta de un producto" hint="El envase o su etiqueta, de frente" file={fotoEtiqueta} disabled={etiqueta.procesando} onChange={setFotoEtiqueta} />
        </div>
        <BotonProcesar onClick={() => fotoEtiqueta && etiqueta.subir(fotoEtiqueta)} disabled={!fotoEtiqueta} procesando={etiqueta.procesando}>
          Leer etiqueta
        </BotonProcesar>
        <Progreso scan={etiqueta} etiqueta="Etiqueta" />
        <ErrorScan scan={etiqueta} />
      </div>
    );
  }

  /* ── por código de barras: escrito a mano o leído de una foto ── */
  return (
    <div className="space-y-4">
      {successNotice}
      <div className="max-w-md">
        <Field label="Código de barras" error={fieldError("barcode")}>
          <input
            inputMode="numeric"
            value={barcode}
            onChange={(e) => {
              setBarcode(limpiarCodigo(e.target.value).slice(0, BARCODE_MAX + 3));
              setError(null);
            }}
            placeholder="Código de barras"
            aria-label="Código de barras"
            className={`${INPUT} ${error?.field === "barcode" ? "border-danger" : ""}`}
          />
        </Field>
      </div>
      {errorBanner}
      <div className="flex flex-wrap gap-2">
        <button type="button" data-testid="existing-search-barcode" onClick={searchBarcode} disabled={searching} className={PRIMARY}>
          Buscar
        </button>
      </div>

      <div className="max-w-sm">
        <FotoInput label="Escanea un código de barras" hint="De cerca y derecho: se decodifica en menos de un segundo" file={fotoCodigo} disabled={codigoScan.procesando} onChange={setFotoCodigo} />
      </div>
      <BotonProcesar onClick={() => fotoCodigo && codigoScan.subir(fotoCodigo)} disabled={!fotoCodigo} procesando={codigoScan.procesando}>
        Leer código
      </BotonProcesar>
      <Progreso scan={codigoScan} etiqueta="Código de barras" />
      <ErrorScan scan={codigoScan} />
    </div>
  );
}
