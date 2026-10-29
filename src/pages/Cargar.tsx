import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Barcode, CalendarDays, Camera, ChevronDown, ChevronUp, FileSpreadsheet, PackageSearch, PenLine, Tag, UploadCloud, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { LARGOS_CODIGO, digitosDelCodigo } from "@/lib/barcode";
import { displayToIso, formatDateDigits, isoToDisplay } from "@/lib/dateInput";
import { Card } from "@/components/ui";
import ImageUpload from "@/components/ImageUpload";
import { Picklist, addIfMissing } from "@/components/Picklist";
import Procesamiento, { type Prefill, type SalidaPrefill } from "@/components/Procesamiento";
import ProductoExistente, { type ExistingMethod } from "@/components/ExistingProduct";
import { useScan } from "@/components/scanTools";
import type { BulkParsedRow, BulkProductRow, BulkCommitResult, ProductDraft, ProductSuggestion } from "@/lib/types";
import { apiErrorMessage } from "@/lib/errors";
import { invalidateInventory } from "@/lib/queries";

// Los códigos de barras tienen hasta 14 dígitos (GTIN-14)
const BARCODE_MAX_DIGITS = 14;

const EMPTY = {
  nombre: "",
  marca: "",
  categoria: "",
  stock: "",
  codigo_barras: "",
  vencimiento: "",
  descripcion: "",
  imagen_url: "",
  ubicacion: "",
  stock_minimo: "",
  dias_alerta_vencimiento: "",
};

// Los mismos límites y textos que el formulario de la app (ProductFormFields y la pantalla de carga)
export const NOMBRE_MAX = 20;
export const OPTION_MAX = 20;
export const DESCRIPCION_MAX = 400;
export const STOCK_MAX_DIGITS = 6;
export const STOCK_MINIMO_MAX_DIGITS = 7;
export const DIAS_ALERTA_MAX_DIGITS = 3;
export const SALIDA_NOTA_MAX = 50;

const INPUT = "w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary";
const onlyDigits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);
const unidades = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;

/** El aviso de que se registró una entrada o una salida: va justo encima del formulario. */
function SuccessNotice({ children }: { children: string }) {
  return (
    <div role="status" data-testid="flow-success" className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm text-primaryDark">
      {children}
    </div>
  );
}

/** El rótulo de un campo y, a la derecha, cuántos caracteres lleva de los que admite (como en la app). */
function FieldLabel({ children, required, counter, counterId }: { children: string; required?: boolean; counter?: string; counterId?: string }) {
  return (
    <div className="mb-1 flex items-end justify-between">
      <label className="block text-sm font-medium text-ink">
        {children}
        {required ? " *" : ""}
      </label>
      {counter && (
        <span data-testid={counterId} className="text-xs text-muted">
          {counter}
        </span>
      )}
    </div>
  );
}

/**
 * Un botón con una cámara al lado de un campo: se elige una foto, el módulo de OCR la lee y lo leído completa el campo (la
 * fecha de vencimiento o el código de barras), que sigue siendo editable. Es el mismo botón que tiene la app en esos campos.
 */
function ScanFieldButton({
  docType,
  label,
  onRead,
  onFail,
}: {
  docType: "expiry_date" | "barcode";
  label: string;
  onRead: (draft: ProductDraft | null) => void;
  onFail: (message: string) => void;
}) {
  const scan = useScan(docType);
  const input = useRef<HTMLInputElement>(null);
  const resultado = scan.resultado;

  useEffect(() => {
    if (!resultado) return;
    onRead(resultado.draft);
    scan.reiniciar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado]);

  useEffect(() => {
    if (scan.error) onFail(scan.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan.error]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        data-testid={`scan-${docType}`}
        aria-label={label}
        title={label}
        disabled={scan.procesando}
        onClick={() => input.current?.click()}
        className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-line bg-white text-primary transition hover:bg-primary/10 disabled:opacity-60"
      >
        {scan.procesando ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-primary" /> : <Camera size={18} />}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        data-testid={`scan-${docType}-input`}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) scan.subir(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function ManualForm({ prefill, onPrefillUsed }: { prefill?: Prefill | null; onPrefillUsed?: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [vencText, setVencText] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [categoriaOptions, setCategoriaOptions] = useState<string[]>([]);
  const [ubicacionOptions, setUbicacionOptions] = useState<string[]>([]);
  const [marcaOptions, setMarcaOptions] = useState<string[]>([]);
  const [duplicado, setDuplicado] = useState<ProductSuggestion | null>(null);
  const [codigoError, setCodigoError] = useState<string | null>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  // Lo que salió mal al leer una foto, debajo del campo escaneado
  const [scanNote, setScanNote] = useState<{ field: "vencimiento" | "codigo"; text: string } | null>(null);

  useEffect(() => {
    api
      .get<{ categorias: string[]; ubicaciones: string[]; marcas: string[] }>(
        "/me/products/filters/options",
      )
      .then(({ data }) => {
        setCategoriaOptions(data.categorias);
        setUbicacionOptions(data.ubicaciones);
        setMarcaOptions(data.marcas);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!prefill) return;
    setForm((f) => ({ ...f, ...prefill }));
    onPrefillUsed?.();
  }, [prefill, onPrefillUsed]);

  useEffect(() => {
    const q = form.nombre.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(() => {
      api
        .get<ProductSuggestion[]>("/me/products/suggest", { params: { q } })
        .then(({ data }) => setSuggestions(data))
        .catch(() => setSuggestions([]));
    }, 300);
    return () => clearTimeout(handle);
  }, [form.nombre]);

  useEffect(() => {
    const digitos = digitosDelCodigo(form.codigo_barras);
    setDuplicado(null);
    setCodigoError(null);
    if (!LARGOS_CODIGO.includes(digitos.length)) return;

    const handle = setTimeout(() => {
      api
        .get<ProductSuggestion | null>(`/me/products/by-barcode/${digitos}`)
        .then(({ data }) => setDuplicado(data))
        // Un 400 acá es el mismo rechazo que daría el alta —un código que no tiene el
        // largo de un código de barras—: se muestra antes de apretar Guardar, no después.
        .catch((err: any) => setCodigoError(apiErrorMessage(err, "") || null));
    }, 400);
    return () => clearTimeout(handle);
  }, [form.codigo_barras]);

  const set = (field: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  // La fecha se escribe con solo los números (DD/MM/AAAA); el formulario guarda AAAA-MM-DD cuando está completa y es real
  const onVencimiento = (raw: string) => {
    const text = formatDateDigits(raw);
    setVencText(text);
    setForm((f) => ({ ...f, vencimiento: text === "" ? "" : (displayToIso(text) ?? text) }));
  };
  // Abre el calendario del navegador (si no sabe abrirlo solo, se hace clic en el campo de fecha)
  const openCalendar = () => {
    const input = dateRef.current;
    if (!input) return;
    try {
      if (typeof input.showPicker === "function") input.showPicker();
      else input.click();
    } catch {
      input.click();
    }
  };
  const vencInvalid = vencText.length === 10 && displayToIso(vencText) === null;

  // Si el valor llega de afuera (una sugerencia, el reconocimiento de imagen), se refleja en el campo
  useEffect(() => {
    setVencText((current) => (displayToIso(current) === form.vencimiento || current === form.vencimiento ? current : isoToDisplay(form.vencimiento)));
  }, [form.vencimiento]);

  const selectSuggestion = (s: ProductSuggestion) => {
    setForm((f) => ({
      ...f,
      nombre: s.nombre,
      marca: s.marca ?? f.marca,
      categoria: s.categoria,
      ubicacion: s.ubicacion ?? f.ubicacion,
      vencimiento: s.vencimiento ?? f.vencimiento,
      stock_minimo: s.stock_minimo != null ? String(s.stock_minimo) : f.stock_minimo,
      dias_alerta_vencimiento:
        s.dias_alerta_vencimiento != null ? String(s.dias_alerta_vencimiento) : f.dias_alerta_vencimiento,
    }));
    setCategoriaOptions((prev) => addIfMissing(prev, s.categoria));
    setUbicacionOptions((prev) => addIfMissing(prev, s.ubicacion));
    setMarcaOptions((prev) => addIfMissing(prev, s.marca));
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post("/me/products", {
          nombre: form.nombre.trim(),
          marca: form.marca || null,
          categoria: form.categoria,
          stock: Number(form.stock),
          codigo_barras: form.codigo_barras || null,
          vencimiento: form.vencimiento || null,
          descripcion: form.descripcion || null,
          imagen_url: form.imagen_url || null,
          ubicacion: form.ubicacion || null,
          stock_minimo: form.stock_minimo ? Number(form.stock_minimo) : null,
          dias_alerta_vencimiento: form.dias_alerta_vencimiento ? Number(form.dias_alerta_vencimiento) : null,
        })
      ).data,
    onSuccess: (data: { merged?: boolean; stock?: number }) => {
      qc.invalidateQueries({ queryKey: ["my-products"] });
      invalidateInventory(qc);
      setOkMessage(
        `Se ha registrado la entrada de ${unidades(Number(form.stock))} de "${form.nombre.trim()}". Stock actual ${data.stock ?? form.stock}.`,
      );
      setForm(EMPTY);
      setVencText("");
      setDuplicado(null);
      setError(null);
    },
    onError: (err: any) => {
      setError(apiErrorMessage(err, "No se pudo guardar el producto."));
      setOkMessage(null);
    },
  });

  // Las mismas verificaciones, y con los mismos mensajes, que la app
  const validate = (): string | null => {
    if (!form.nombre.trim()) return "El nombre es requerido";
    if (!form.categoria.trim()) return "La categoría es requerida";
    if (!form.stock || Number(form.stock) <= 0) return "El stock debe ser mayor a 0";
    if (vencText && displayToIso(vencText) === null) {
      return "Fecha de vencimiento inválida. Ingresa el día y el mes con 2 dígitos y el año con 4 dígitos. Por ejemplo: 05/03/2027";
    }
    if (form.codigo_barras && !LARGOS_CODIGO.includes(digitosDelCodigo(form.codigo_barras).length)) {
      return "El código de barras es inválido";
    }
    return null;
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setOkMessage(null);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    create.mutate();
  };

  return (
    <Card className="w-full">
      {okMessage && <SuccessNotice>{okMessage}</SuccessNotice>}
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <div className="relative">
          <FieldLabel required counter={`${form.nombre.length}/${NOMBRE_MAX}`} counterId="nombre-counter">
            Nombre
          </FieldLabel>
          <input
            value={form.nombre}
            onChange={set("nombre")}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="ej. Leche entera 1L"
            maxLength={NOMBRE_MAX}
            autoComplete="off"
            aria-label="Nombre"
            className={INPUT}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-line bg-white shadow-lg">
              {suggestions.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => selectSuggestion(s)}
                  className="block w-full border-b border-line/60 px-4 py-2 text-left text-sm last:border-0 hover:bg-canvas"
                >
                  <p>
                    {s.nombre}
                    {s.marca && <span className="text-muted"> · {s.marca}</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {s.vencimiento ? `Vence ${s.vencimiento}` : "Sin vencimiento"} · Stock: {s.stock}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <FieldLabel required>Stock</FieldLabel>
          <input
            inputMode="numeric"
            value={form.stock}
            onChange={(e) => setForm((f) => ({ ...f, stock: onlyDigits(e.target.value, STOCK_MAX_DIGITS) }))}
            placeholder="0"
            aria-label="Stock"
            className={INPUT}
          />
        </div>
        </div>
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <Picklist
          label="Marca"
          value={form.marca}
          options={marcaOptions}
          addPlaceholder="Opcional"
          maxLength={OPTION_MAX}
          onChange={(v) => {
            setForm((f) => ({ ...f, marca: v }));
            setMarcaOptions((prev) => addIfMissing(prev, v));
          }}
        />
        <Picklist
          label="Categoría *"
          value={form.categoria}
          options={categoriaOptions}
          addPlaceholder="Ej. Lácteos"
          maxLength={OPTION_MAX}
          onChange={(v) => {
            setForm((f) => ({ ...f, categoria: v }));
            setCategoriaOptions((prev) => addIfMissing(prev, v));
          }}
        />
        </div>
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <div>
          <FieldLabel>Fecha de vencimiento</FieldLabel>
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              value={vencText}
              onChange={(e) => onVencimiento(e.target.value)}
              placeholder="DD/MM/AAAA"
              maxLength={10}
              aria-label="Fecha de vencimiento"
              className={`${INPUT} min-w-0 flex-1 ${vencInvalid ? "border-danger" : ""}`}
            />
            {/* El calendario del navegador, anclado al botón: elegir un día completa el campo de al lado */}
            <div className="relative shrink-0">
              <button
                type="button"
                data-testid="open-calendar"
                aria-label="Elegir la fecha en el calendario"
                title="Elegir la fecha en el calendario"
                onClick={openCalendar}
                className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-line bg-white text-primary transition hover:bg-primary/10"
              >
                <CalendarDays size={18} />
              </button>
              <input
                ref={dateRef}
                type="date"
                tabIndex={-1}
                aria-hidden
                data-testid="calendar-input"
                value={displayToIso(vencText) ?? ""}
                onChange={(e) => e.target.value && onVencimiento(isoToDisplay(e.target.value))}
                className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
              />
            </div>
            <ScanFieldButton
              docType="expiry_date"
              label="Escanear fecha de vencimiento"
              onRead={(draft) => {
                if (draft?.vencimiento) {
                  onVencimiento(isoToDisplay(draft.vencimiento));
                  setScanNote(null);
                } else {
                  setScanNote({ field: "vencimiento", text: "No se pudo leer una fecha en la foto" });
                }
              }}
              onFail={(text) => setScanNote({ field: "vencimiento", text })}
            />
          </div>
          {scanNote?.field === "vencimiento" && <p data-testid="scan-note" className="mt-1 text-xs text-amber-700">{scanNote.text}</p>}
        </div>
        <div>
          <FieldLabel>Código de barras</FieldLabel>
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              value={form.codigo_barras}
              onChange={(e) => setForm((f) => ({ ...f, codigo_barras: onlyDigits(e.target.value, BARCODE_MAX_DIGITS) }))}
              placeholder="Opcional"
              aria-label="Código de barras"
              className={`${INPUT} min-w-0 flex-1`}
            />
            <ScanFieldButton
              docType="barcode"
              label="Escanear código de barras"
              onRead={(draft) => {
                if (draft?.codigo_barras) {
                  setForm((f) => ({ ...f, codigo_barras: onlyDigits(draft.codigo_barras ?? "", BARCODE_MAX_DIGITS) }));
                  setScanNote(null);
                } else {
                  setScanNote({ field: "codigo", text: "No se pudo leer un código de barras: podés escribirlo" });
                }
              }}
              onFail={(text) => setScanNote({ field: "codigo", text })}
            />
          </div>
          {scanNote?.field === "codigo" && <p data-testid="scan-note" className="mt-1 text-xs text-amber-700">{scanNote.text}</p>}
          {codigoError ? (
            <p className="mt-1 text-xs text-danger">{codigoError}</p>
          ) : duplicado ? (
            <div className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div className="space-y-1.5">
                <p>
                  Ya tenés <span className="font-medium">«{duplicado.nombre}»</span>
                  {duplicado.marca ? ` de ${duplicado.marca}` : ""} con este código (stock{" "}
                  {duplicado.stock}
                  {duplicado.vencimiento ? `, vence ${duplicado.vencimiento}` : ""}).
                </p>
                <p className="text-xs">
                  Si es el mismo producto, sumale el stock. Si es otro lote con distinto vencimiento,
                  podés cargarlo igual.
                </p>
                <button
                  type="button"
                  onClick={() => selectSuggestion(duplicado)}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                >
                  Sumar stock a ese producto
                </button>
              </div>
            </div>
          ) : null}
        </div>
        </div>
        <div>
          <FieldLabel counter={`${form.descripcion.length}/${DESCRIPCION_MAX}`} counterId="descripcion-counter">
            Descripción
          </FieldLabel>
          <textarea
            value={form.descripcion}
            onChange={set("descripcion")}
            rows={3}
            maxLength={DESCRIPCION_MAX}
            placeholder="Opcional"
            aria-label="Descripción"
            className={`${INPUT} resize-none`}
          />
        </div>
        <Picklist
          label="Ubicación de guardado"
          value={form.ubicacion}
          options={ubicacionOptions}
          addPlaceholder="Opcional"
          maxLength={OPTION_MAX}
          onChange={(v) => {
            setForm((f) => ({ ...f, ubicacion: v }));
            setUbicacionOptions((prev) => addIfMissing(prev, v));
          }}
        />

        {/* Reglas propias del producto: cerradas al entrar; lo escrito se conserva aunque se cierren */}
        <div className="rounded-2xl border border-line/70 bg-canvas/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-muted">Reglas de alerta de producto</p>
            <button
              type="button"
              data-testid="alerts-toggle"
              aria-expanded={alertsOpen}
              aria-label={alertsOpen ? "Ocultar reglas de alerta de producto" : "Mostrar reglas de alerta de producto"}
              onClick={() => setAlertsOpen((open) => !open)}
              className="rounded-full p-1 text-primaryDark transition hover:bg-primary/10"
            >
              {alertsOpen ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
            </button>
          </div>
          {alertsOpen && (
            <div data-testid="alerts-section" className="mt-3 space-y-4">
              <div>
                <FieldLabel>Stock mínimo (días de cobertura)</FieldLabel>
                <input
                  inputMode="numeric"
                  value={form.stock_minimo}
                  onChange={(e) => setForm((f) => ({ ...f, stock_minimo: onlyDigits(e.target.value, STOCK_MINIMO_MAX_DIGITS) }))}
                  placeholder="Opcional"
                  aria-label="Stock mínimo (días de cobertura)"
                  className={`${INPUT} bg-white`}
                />
                <p className="mt-1 text-xs text-muted">{form.stock_minimo ? "Regla propia de este producto" : "Usando tu regla general"}</p>
              </div>
              <div>
                <FieldLabel>Días de anticipación (vencimiento)</FieldLabel>
                <input
                  inputMode="numeric"
                  value={form.dias_alerta_vencimiento}
                  onChange={(e) => setForm((f) => ({ ...f, dias_alerta_vencimiento: onlyDigits(e.target.value, DIAS_ALERTA_MAX_DIGITS) }))}
                  placeholder="Opcional"
                  aria-label="Días de anticipación (vencimiento)"
                  className={`${INPUT} bg-white`}
                />
                <p className="mt-1 text-xs text-muted">{form.dias_alerta_vencimiento ? "Regla propia de este producto" : "Usando tu regla general"}</p>
              </div>
            </div>
          )}
        </div>

        <ImageUpload value={form.imagen_url} onChange={(url) => setForm((f) => ({ ...f, imagen_url: url }))} />

        {error && (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={create.isPending}
          className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {create.isPending ? "Guardando…" : "Guardar producto"}
        </button>
      </form>
    </Card>
  );
}

// Los motivos de salida de la app, en su mismo orden
const EXIT_REASONS = [
  { key: "sold", label: "Vendido" },
  { key: "consumed", label: "Consumido" },
  { key: "expired", label: "Vencido" },
  { key: "rented", label: "Alquilado" },
] as const;
type ExitReason = (typeof EXIT_REASONS)[number]["key"];

function SalidaForm({
  prefill,
  onPrefillUsed,
}: {
  prefill?: SalidaPrefill | null;
  onPrefillUsed?: () => void;
}) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selected, setSelected] = useState<ProductSuggestion | null>(null);
  const [cantidad, setCantidad] = useState("");
  // Sin motivo elegido al principio: hay que elegir uno (volver a tocar el elegido lo deselecciona)
  const [motivo, setMotivo] = useState<ExitReason | null>(null);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!prefill) return;
    setNota((prefill.nota ?? "").slice(0, SALIDA_NOTA_MAX));
    setOkMessage(null);
    setError(null);
    if (prefill.producto) {
      // Un producto ya reconocido (por su etiqueta o su código de barras): queda elegido, como en la app
      setSelected(prefill.producto);
      setQuery(prefill.producto.nombre);
      setSuggestions([]);
      setShowSuggestions(false);
    } else {
      setSelected(null);
      setQuery(prefill.busqueda ?? "");
      setShowSuggestions(true);
    }
    onPrefillUsed?.();
  }, [prefill, onPrefillUsed]);

  useEffect(() => {
    if (selected) return;
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(() => {
      api
        .get<ProductSuggestion[]>("/me/products/suggest", { params: { q } })
        .then(({ data }) => setSuggestions(data))
        .catch(() => setSuggestions([]));
    }, 300);
    return () => clearTimeout(handle);
  }, [query, selected]);

  const onQueryChange = (v: string) => {
    setQuery(v);
    setSelected(null);
  };

  const pick = (s: ProductSuggestion) => {
    setSelected(s);
    setQuery(s.nombre + (s.marca ? ` · ${s.marca}` : ""));
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const salida = useMutation({
    mutationFn: async () => {
      if (!selected || !motivo) throw new Error("incompleto");
      return (
        await api.post<{ stock: number }>("/me/products/salida", {
          product_id: selected.id,
          quantity: Number(cantidad),
          event_type: motivo,
          note: nota || undefined,
        })
      ).data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["my-products"] });
      invalidateInventory(qc);
      setOkMessage(`Se ha registrado la salida de ${unidades(Number(cantidad))} de "${selected?.nombre}". Stock actual ${data.stock}.`);
      setError(null);
      setQuery("");
      setSelected(null);
      setCantidad("");
      setMotivo(null);
      setNota("");
    },
    onError: (err: any) => {
      setError(apiErrorMessage(err, "No se pudo registrar la salida."));
      setOkMessage(null);
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setOkMessage(null);
    // Las mismas verificaciones, y con los mismos mensajes, que la app
    const problem = !selected
      ? "Elegí un producto de la lista de sugerencias"
      : !cantidad || Number(cantidad) <= 0
        ? "La cantidad debe ser mayor a 0"
        : !motivo
          ? "Elegí el motivo de la salida"
          : null;
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    salida.mutate();
  };

  return (
    <Card className="w-full">
      {okMessage && <SuccessNotice>{okMessage}</SuccessNotice>}
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="relative">
          <FieldLabel required counter={`${query.length}/${NOMBRE_MAX}`} counterId="producto-counter">
            Producto
          </FieldLabel>
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Buscá un producto que ya tenés cargado"
            maxLength={NOMBRE_MAX}
            autoComplete="off"
            aria-label="Producto"
            className={INPUT}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-line bg-white shadow-lg">
              {suggestions.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => pick(s)}
                  className="block w-full border-b border-line/60 px-4 py-2 text-left text-sm last:border-0 hover:bg-canvas"
                >
                  <p>
                    {s.nombre}
                    {s.marca && <span className="text-muted"> · {s.marca}</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {s.vencimiento ? `Vence ${s.vencimiento}` : "Sin vencimiento"} · Stock: {s.stock}
                  </p>
                </button>
              ))}
            </div>
          )}
          {!selected && query.trim().length >= 2 && suggestions.length === 0 && (
            <p className="mt-1 text-xs text-muted">No encontramos ningún producto tuyo con ese nombre.</p>
          )}
          {selected && (
            <div data-testid="salida-selected" className="mt-2 rounded-xl bg-canvas px-4 py-2.5 text-sm">
              <p className="font-medium text-ink">
                {selected.nombre}
                {selected.marca && <span className="font-normal text-muted"> · {selected.marca}</span>}
              </p>
              <p className="text-xs text-muted">
                Stock actual: {selected.stock} · {selected.vencimiento ? `Vence ${selected.vencimiento}` : "Sin vencimiento"}
              </p>
            </div>
          )}
        </div>
        <div>
          <FieldLabel required>Stock a sacar</FieldLabel>
          <input
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => setCantidad(onlyDigits(e.target.value, STOCK_MAX_DIGITS))}
            placeholder="0"
            aria-label="Stock a sacar"
            className={INPUT}
          />
        </div>
        <div>
          <FieldLabel required>Motivo</FieldLabel>
          <div role="group" aria-label="Motivo" className="flex flex-wrap gap-2">
            {EXIT_REASONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                data-testid={`salida-motivo-${key}`}
                aria-pressed={motivo === key}
                onClick={() => setMotivo(motivo === key ? null : key)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                  motivo === key ? "border-primary bg-primary text-white" : "border-line bg-white text-muted hover:text-primaryDark"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel counter={`${nota.length}/${SALIDA_NOTA_MAX}`} counterId="salida-nota-counter">
            Descripción de Motivo
          </FieldLabel>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            maxLength={SALIDA_NOTA_MAX}
            placeholder="Descripción de salida (ej. vencido en heladera)"
            aria-label="Descripción de Motivo"
            className={`${INPUT} resize-none`}
          />
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={salida.isPending}
          className="w-full rounded-xl bg-danger py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {salida.isPending ? "Registrando…" : "Registrar salida"}
        </button>
      </form>
    </Card>
  );
}

interface EditableRow {
  key: string;
  fileName: string;
  row_number: number;
  data: BulkProductRow;
  action: "create" | "merge" | "salida" | null;
  existing_stock: number | null;
  included: boolean;
}

// Los mensajes de la carga por archivo: van debajo del campo al que se refieren
const NOMBRE_REQUERIDO = "El nombre del producto es obligatorio";
const STOCK_INVALIDO = "El stock debe ser mayor a 0";

function validateRowLocal(data: BulkProductRow, direction: "entrada" | "salida"): string[] {
  const errors: string[] = [];
  if (!data.nombre.trim()) errors.push(NOMBRE_REQUERIDO);
  if (direction === "entrada" && !data.categoria.trim()) errors.push("categoria es obligatoria");
  if (!data.stock || data.stock <= 0) errors.push(STOCK_INVALIDO);
  return errors;
}

function BulkUpload({ direction }: { direction: "entrada" | "salida" }) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [categoriaOptions, setCategoriaOptions] = useState<string[]>([]);
  const [ubicacionOptions, setUbicacionOptions] = useState<string[]>([]);
  const [result, setResult] = useState<BulkCommitResult | null>(null);
  // Se intentó confirmar con productos incompletos: se avisa cuáles hay que corregir o quitar
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    api
      .get<{ categorias: string[]; ubicaciones: string[] }>("/me/products/filters/options")
      .then(({ data }) => {
        setCategoriaOptions(data.categorias);
        setUbicacionOptions(data.ubicaciones);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setRows([]);
    setActiveKey(null);
    setResult(null);
    setParseErrors([]);
  }, [direction]);

  const handleFiles = async (fileList: FileList) => {
    setResult(null);
    setParsing(true);
    setParseErrors([]);
    const newRows: EditableRow[] = [];
    const errs: string[] = [];

    for (const file of Array.from(fileList)) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const { data } = await api.post<{ rows: BulkParsedRow[] }>("/me/products/bulk/parse", formData, {
          headers: { "Content-Type": "multipart/form-data" },
          params: { mode: direction },
        });
        data.rows.forEach((r) => {
          if (!r.data) return;
          nextId.current += 1;
          newRows.push({
            key: `${nextId.current}-${file.name}-${r.row_number}`,
            fileName: file.name,
            row_number: r.row_number,
            data: r.data,
            action: r.action,
            existing_stock: r.existing_stock,
            included: r.valid,
          });
        });
      } catch (err: any) {
        errs.push(`${file.name}: ${apiErrorMessage(err, "no se pudo leer el archivo")}`);
      }
    }

    setRows((prev) => [...prev, ...newRows]);
    setParseErrors(errs);
    setParsing(false);
    if (newRows.length > 0) setActiveKey(newRows[0].key);
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    e.target.value = "";
  };

  const updateRow = (key: string, patch: Partial<BulkProductRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, data: { ...r.data, ...patch } } : r)));
  };

  const toggleIncluded = (key: string, included: boolean) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, included } : r)));
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
    setActiveKey((prev) => (prev === key ? null : prev));
  };

  const clearAll = () => {
    setRows([]);
    setActiveKey(null);
    setResult(null);
    setParseErrors([]);
  };

  const commit = useMutation({
    mutationFn: async () => {
      const toSend = rows
        .filter((r) => r.included && validateRowLocal(r.data, direction).length === 0)
        .map((r) => r.data);
      const { data } = await api.post<BulkCommitResult>("/me/products/bulk/commit", {
        rows: toSend,
        mode: direction,
      });
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["my-products"] });
      invalidateInventory(qc);
      setResult(data);
      setRows([]);
      setActiveKey(null);
    },
  });

  const includedRows = rows.filter((r) => r.included && validateRowLocal(r.data, direction).length === 0);
  const invalidRows = rows.filter((r) => validateRowLocal(r.data, direction).length > 0);

  // Con un producto al que le falta un dato o con un stock inválido no se confirma: hay que corregirlo o quitarlo
  const confirmarCarga = () => {
    if (invalidRows.length > 0) {
      setBlocked(true);
      setActiveKey(invalidRows[0].key);
      return;
    }
    setBlocked(false);
    commit.mutate();
  };
  const active = rows.find((r) => r.key === activeKey) ?? null;
  const activeErrors = active ? validateRowLocal(active.data, direction) : [];

  return (
    <Card className="w-full">
      <p className="mb-4 text-sm text-muted">
        {direction === "entrada" ? (
          <>
            Subí uno o varios archivos CSV o Excel (.xlsx) con las columnas: nombre, stock y
            categoria (obligatorias) y, si querés, marca, vencimiento, codigo_barras, descripcion,
            ubicacion, dias_stock_minimo y dias_alerta_vencimiento. Las opcionales pueden ir en
            cualquier orden o faltar: quedan vacías. Es el mismo formato que genera la exportación.
            Cada producto que se lea aparece como una pestaña que podés revisar y modificar antes de
            confirmar la carga.
          </>
        ) : (
          <>
            Subí uno o varios archivos CSV o Excel (.xlsx) con las columnas: nombre y stock
            (cantidad a sacar), obligatorias, y marca y vencimiento (opcionales, para identificar el
            lote si hay más de uno con ese nombre). Cada fila tiene que coincidir con un producto que
            ya tengas cargado.
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-line px-5 py-3 text-sm font-medium text-ink transition hover:border-primary hover:bg-primary/5">
          <UploadCloud size={20} className="text-muted" />
          Elegí uno o más archivos
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            multiple
            onChange={onFileChange}
            className="hidden"
          />
        </label>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="ml-auto rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
          >
            Limpiar todo
          </button>
        )}
      </div>

      {parsing && <p className="mt-4 text-sm text-muted">Leyendo archivo(s)…</p>}
      {parseErrors.length > 0 && (
        <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          <ul className="list-disc pl-5">
            {parseErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm text-primaryDark">
          {direction === "entrada" ? (
            <>
              Carga terminada: {result.created} productos nuevos, {result.merged} con stock sumado
            </>
          ) : (
            <>Carga terminada: {result.merged} salidas aplicadas</>
          )}
          {result.failed > 0 ? `, ${result.failed} con error` : ""}.
          {result.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-danger">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-4 flex gap-4">
          <div className="w-56 shrink-0">
            <div className="max-h-[55vh] space-y-1 overflow-auto rounded-xl border border-line p-2">
              {rows.map((r) => {
                const errs = validateRowLocal(r.data, direction);
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setActiveKey(r.key)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                      activeKey === r.key ? "bg-primary text-white" : "hover:bg-canvas"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={r.included}
                      disabled={errs.length > 0}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => toggleIncluded(r.key, e.target.checked)}
                    />
                    <span className="flex-1 truncate" title={r.data.nombre || `Fila ${r.row_number}`}>
                      {r.data.nombre || `Fila ${r.row_number}`}
                    </span>
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        errs.length > 0 ? "bg-danger" : "bg-primary"
                      } ${activeKey === r.key ? "bg-white" : ""}`}
                    />
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">
              {includedRows.length} de {rows.length} productos incluidos
            </p>
          </div>

          <div className="flex-1">
            {active ? (
              <div className="space-y-3 rounded-xl border border-line p-4">
                <div className="flex items-center justify-between">
                  <p data-testid="bulk-file-name" className="text-xs text-muted">
                    {active.fileName}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeRow(active.key)}
                    className="text-xs font-medium text-danger hover:underline"
                  >
                    Quitar de la lista
                  </button>
                </div>

                {activeErrors.filter((e) => e !== NOMBRE_REQUERIDO && e !== STOCK_INVALIDO).length > 0 && (
                  <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                    {activeErrors.filter((e) => e !== NOMBRE_REQUERIDO && e !== STOCK_INVALIDO).join(" · ")}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Nombre</label>
                  <input
                    placeholder="ej. Leche entera 1L"
                    value={active.data.nombre}
                    onChange={(e) => updateRow(active.key, { nombre: e.target.value })}
                    className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                  />
                  {activeErrors.includes(NOMBRE_REQUERIDO) && (
                    <p data-testid="bulk-nombre-error" className="mt-1 text-xs text-danger">
                      {NOMBRE_REQUERIDO}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-ink">Marca</label>
                    <input
                      placeholder="Opcional"
                      value={active.data.marca ?? ""}
                      onChange={(e) => updateRow(active.key, { marca: e.target.value || null })}
                      className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  {direction === "entrada" && (
                    <Picklist
                      label="Categoría"
                      addPlaceholder="Ej. Lácteos"
                      value={active.data.categoria}
                      options={categoriaOptions}
                      onChange={(v) => {
                        updateRow(active.key, { categoria: v });
                        setCategoriaOptions((prev) => addIfMissing(prev, v));
                      }}
                      required
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-ink">
                      {direction === "entrada" ? "Stock" : "Cantidad a sacar"}
                    </label>
                    {/* El stock leído se puede borrar: en blanco queda sin completar (no se rellena con 0) y hay que cargarlo */}
                    <input
                      placeholder="0"
                      inputMode="numeric"
                      aria-label={direction === "entrada" ? "Stock" : "Cantidad a sacar"}
                      maxLength={STOCK_MAX_DIGITS}
                      value={active.data.stock > 0 ? String(active.data.stock) : ""}
                      onChange={(e) => updateRow(active.key, { stock: Number(onlyDigits(e.target.value, STOCK_MAX_DIGITS)) })}
                      className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                    />
                    {activeErrors.includes(STOCK_INVALIDO) && (
                      <p data-testid="bulk-stock-error" className="mt-1 text-xs text-danger">
                        {STOCK_INVALIDO}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-ink">Vencimiento</label>
                    <input
                      type="date"
                      value={active.data.vencimiento ?? ""}
                      onChange={(e) => updateRow(active.key, { vencimiento: e.target.value || null })}
                      className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                {direction === "entrada" && (
                  <>
                    <Picklist
                      label="Ubicación"
                      value={active.data.ubicacion ?? ""}
                      options={ubicacionOptions}
                      emptyLabel="Ej. Heladera, Alacena A, Freezer"
                      addPlaceholder="Opcional"
                      onChange={(v) => {
                        updateRow(active.key, { ubicacion: v || null });
                        setUbicacionOptions((prev) => addIfMissing(prev, v));
                      }}
                    />
                    <div>
                      <label className="mb-1 block text-sm font-medium text-ink">Descripción</label>
                      <textarea
                        placeholder="Opcional"
                        value={active.data.descripcion ?? ""}
                        onChange={(e) => updateRow(active.key, { descripcion: e.target.value || null })}
                        rows={2}
                        className="w-full resize-none rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-bold text-muted">Reglas de alerta de producto</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-ink">Stock mínimo (días de cobertura)</label>
                          <input
                            type="number"
                            min={1}
                            value={active.data.stock_minimo ?? ""}
                            onChange={(e) =>
                              updateRow(active.key, {
                                stock_minimo: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                            placeholder="Opcional"
                            className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                          />
                          <p className="mt-1 text-xs text-muted">{active.data.stock_minimo != null ? "Regla propia de este producto" : "Usando tu regla general"}</p>
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-ink">Días de anticipación (vencimiento)</label>
                          <input
                            type="number"
                            min={1}
                            value={active.data.dias_alerta_vencimiento ?? ""}
                            onChange={(e) =>
                              updateRow(active.key, {
                                dias_alerta_vencimiento: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                            placeholder="Opcional"
                            className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                          />
                          <p className="mt-1 text-xs text-muted">{active.data.dias_alerta_vencimiento != null ? "Regla propia de este producto" : "Usando tu regla general"}</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="p-4 text-sm text-muted">Elegí un producto de la lista para revisarlo.</p>
            )}
          </div>
        </div>
      )}

      {blocked && invalidRows.length > 0 && (
        <p data-testid="bulk-invalid" role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          Corregí o eliminá {invalidRows.length === 1 ? "el producto" : `los ${invalidRows.length} productos`} con datos incompletos o inválidos antes de confirmar:{" "}
          {invalidRows.map((r) => `«${r.data.nombre || `Fila ${r.row_number}`}»`).join(", ")}.
        </p>
      )}

      {rows.length > 0 && (
        <button
          onClick={confirmarCarga}
          disabled={commit.isPending || (includedRows.length === 0 && invalidRows.length === 0)}
          className="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {commit.isPending ? "Confirmando…" : `Confirmar carga (${includedRows.length} productos)`}
        </button>
      )}
    </Card>
  );
}

type Direction = "existente" | "entrada" | "salida";
type Tab = "manual" | "archivo" | "procesamiento";

const TABS: { value: Tab; label: string; icon: LucideIcon }[] = [
  { value: "manual", label: "Manual", icon: PenLine },
  { value: "archivo", label: "Archivo", icon: FileSpreadsheet },
  { value: "procesamiento", label: "Procesamiento", icon: Camera },
];

// Cómo se busca un producto que ya está cargado: por su nombre, por su etiqueta o por su código de barras
// Del mismo azul que el botón «Producto existente»
const EXISTING_ACTIVE = "bg-primaryDark text-white shadow-card";
const EXISTING_METHODS: { value: ExistingMethod; label: string; icon: LucideIcon; active: string }[] = [
  { value: "nombre", label: "Nombre", icon: PenLine, active: EXISTING_ACTIVE },
  { value: "etiqueta", label: "Etiqueta", icon: Tag, active: EXISTING_ACTIVE },
  { value: "codigo", label: "Código de barras", icon: Barcode, active: EXISTING_ACTIVE },
];

const DIRECTIONS: { value: Direction; label: string; icon: LucideIcon; active: string }[] = [
  { value: "existente", label: "Producto existente", icon: PackageSearch, active: EXISTING_ACTIVE },
  { value: "entrada", label: "Entrada", icon: ArrowDownToLine, active: "bg-primary text-white shadow-card" },
  { value: "salida", label: "Salida", icon: ArrowUpFromLine, active: "bg-critical text-white shadow-card" },
];

/** Un selector de botones con ícono, sin título: el elegido va relleno (de color propio si lo tiene). */
function FlowSwitch<T extends string>({
  label,
  options,
  value,
  onChange,
  testId,
}: {
  label: string;
  options: { value: T; label: string; icon: LucideIcon; active?: string }[];
  value: T;
  onChange: (value: T) => void;
  testId: string;
}) {
  return (
    <div role="group" aria-label={label} data-testid={testId} className="inline-flex gap-1 rounded-2xl border border-line/70 bg-white p-1 shadow-card">
      {options.map(({ value: key, label: text, icon: Icon, active }) => {
        const selected = key === value;
        return (
          <button
            key={key}
            type="button"
            data-testid={`${testId}-${key}`}
            aria-pressed={selected}
            onClick={() => onChange(key)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              selected ? active ?? "bg-primary text-white shadow-card" : "text-muted hover:bg-canvas hover:text-primaryDark"
            }`}
          >
            <Icon size={16} />
            {text}
          </button>
        );
      })}
    </div>
  );
}

export default function Cargar() {
  const [tab, setTab] = useState<Tab>("manual");
  const [direction, setDirection] = useState<Direction>("entrada");
  const [existingMethod, setExistingMethod] = useState<ExistingMethod>("nombre");

  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const irAManual = (valores: Prefill) => {
    setPrefill(valores);
    setDirection("entrada");
    setTab("manual");
  };

  const [salidaPrefill, setSalidaPrefill] = useState<SalidaPrefill | null>(null);
  const irASalidaManual = (valores: SalidaPrefill) => {
    setSalidaPrefill(valores);
    setDirection("salida");
    setTab("manual");
  };

  return (
    <div>
      {/* El título y su descripción a la izquierda; a la derecha, solo los botones del tipo de flujo y del método de carga */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[14rem] flex-1">
          <h1 className="text-2xl font-bold text-ink">Flujo de producto</h1>
          <p className="mt-1 text-sm text-muted">Alta y baja de productos a tu inventario</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <FlowSwitch label="Tipo de flujo" testId="flow-direction" options={DIRECTIONS} value={direction} onChange={setDirection} />
          {direction === "existente" ? (
            <FlowSwitch label="Cómo buscar el producto" testId="flow-existing" options={EXISTING_METHODS} value={existingMethod} onChange={setExistingMethod} />
          ) : (
            <FlowSwitch label="Método de carga" testId="flow-method" options={TABS} value={tab} onChange={setTab} />
          )}
        </div>
      </div>

      {direction === "existente" ? (
        <Card className="w-full">
          <ProductoExistente key={existingMethod} mode="entry" method={existingMethod} onLoadAsNew={irAManual} />
        </Card>
      ) : tab === "manual" ? (
        direction === "entrada" ? (
          <ManualForm prefill={prefill} onPrefillUsed={() => setPrefill(null)} />
        ) : (
          <SalidaForm prefill={salidaPrefill} onPrefillUsed={() => setSalidaPrefill(null)} />
        )
      ) : tab === "archivo" ? (
        <BulkUpload direction={direction} />
      ) : (
        <Procesamiento direction={direction} irAManual={irAManual} irASalidaManual={irASalidaManual} />
      )}
    </div>
  );
}
