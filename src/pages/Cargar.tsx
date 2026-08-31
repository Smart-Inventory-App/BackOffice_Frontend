import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UploadCloud } from "lucide-react";
import { api } from "@/lib/api";
import { Card, PageHeader } from "@/components/ui";
import { Picklist, addIfMissing } from "@/components/Picklist";
import type { BulkParsedRow, BulkProductRow, BulkCommitResult, ProductSuggestion } from "@/lib/types";

const EMPTY = {
  nombre: "",
  marca: "",
  categoria: "",
  stock: "",
  vencimiento: "",
  descripcion: "",
  imagen_url: "",
  ubicacion: "",
  stock_minimo: "",
  dias_alerta_vencimiento: "",
};

function ManualForm() {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [categoriaOptions, setCategoriaOptions] = useState<string[]>([]);
  const [ubicacionOptions, setUbicacionOptions] = useState<string[]>([]);
  const [marcaOptions, setMarcaOptions] = useState<string[]>([]);

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

  const set = (field: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

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
          nombre: form.nombre,
          marca: form.marca || null,
          categoria: form.categoria,
          stock: Number(form.stock),
          vencimiento: form.vencimiento || null,
          descripcion: form.descripcion || null,
          imagen_url: form.imagen_url || null,
          ubicacion: form.ubicacion || null,
          stock_minimo: form.stock_minimo ? Number(form.stock_minimo) : null,
          dias_alerta_vencimiento: form.dias_alerta_vencimiento ? Number(form.dias_alerta_vencimiento) : null,
        })
      ).data,
    onSuccess: (data: { merged?: boolean }) => {
      qc.invalidateQueries({ queryKey: ["my-products"] });
      qc.invalidateQueries({ queryKey: ["my-stats"] });
      setForm((f) => ({ ...EMPTY, categoria: f.categoria, ubicacion: f.ubicacion }));
      setOkMessage(
        data.merged
          ? "Se sumó el stock a un producto que ya tenías cargado."
          : "Producto cargado correctamente.",
      );
      setError(null);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail ?? "No se pudo cargar el producto.");
      setOkMessage(null);
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setOkMessage(null);
    create.mutate();
  };

  return (
    <Card className="max-w-xl">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="relative">
          <label className="mb-1 block text-sm font-medium text-ink">Nombre</label>
          <input
            value={form.nombre}
            onChange={set("nombre")}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            required
            autoComplete="off"
            className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-line bg-white shadow-lg">
              {suggestions.map((s) => (
                <button
                  type="button"
                  key={s.nombre}
                  onClick={() => selectSuggestion(s)}
                  className="block w-full border-b border-line/60 px-4 py-2 text-left text-sm last:border-0 hover:bg-canvas"
                >
                  {s.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
        <Picklist
          label="Marca"
          value={form.marca}
          options={marcaOptions}
          emptyLabel="Sin marca"
          onChange={(v) => {
            setForm((f) => ({ ...f, marca: v }));
            setMarcaOptions((prev) => addIfMissing(prev, v));
          }}
        />
        <div className="grid grid-cols-2 gap-4">
          <Picklist
            label="Categoría"
            value={form.categoria}
            options={categoriaOptions}
            onChange={(v) => {
              setForm((f) => ({ ...f, categoria: v }));
              setCategoriaOptions((prev) => addIfMissing(prev, v));
            }}
            required
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Stock</label>
            <input
              type="number"
              min={1}
              value={form.stock}
              onChange={set("stock")}
              required
              className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Vencimiento</label>
            <input
              type="date"
              value={form.vencimiento}
              onChange={set("vencimiento")}
              className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <Picklist
            label="Ubicación"
            value={form.ubicacion}
            options={ubicacionOptions}
            onChange={(v) => {
              setForm((f) => ({ ...f, ubicacion: v }));
              setUbicacionOptions((prev) => addIfMissing(prev, v));
            }}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">URL de imagen</label>
          <input
            value={form.imagen_url}
            onChange={set("imagen_url")}
            placeholder="https://…"
            className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Descripción</label>
          <textarea
            value={form.descripcion}
            onChange={set("descripcion")}
            rows={3}
            className="w-full resize-none rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Alertas para este producto (opcional)
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Stock mínimo</label>
              <input
                type="number"
                min={1}
                value={form.stock_minimo}
                onChange={set("stock_minimo")}
                placeholder="Usa tu regla general"
                className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Días de anticipación</label>
              <input
                type="number"
                min={1}
                value={form.dias_alerta_vencimiento}
                onChange={set("dias_alerta_vencimiento")}
                placeholder="Usa tu regla general"
                className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            {error}
          </div>
        )}
        {okMessage && (
          <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm text-primaryDark">
            {okMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={create.isPending}
          className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {create.isPending ? "Cargando…" : "Cargar producto"}
        </button>
      </form>
    </Card>
  );
}

function SalidaForm() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selected, setSelected] = useState<ProductSuggestion | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState<"consumed" | "expired">("consumed");
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

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
      if (!selected) throw new Error("no seleccionado");
      return (
        await api.post<{ stock: number }>("/me/products/salida", {
          product_id: selected.id,
          quantity: Number(cantidad),
          event_type: motivo,
        })
      ).data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["my-products"] });
      qc.invalidateQueries({ queryKey: ["my-stats"] });
      qc.invalidateQueries({ queryKey: ["my-metrics"] });
      setOkMessage(`Se sacaron ${cantidad} unidades de "${selected?.nombre}". Stock actual: ${data.stock}.`);
      setError(null);
      setQuery("");
      setSelected(null);
      setCantidad("");
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail ?? "No se pudo registrar la salida.");
      setOkMessage(null);
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setOkMessage(null);
    if (!selected) {
      setError("Elegí un producto de la lista de sugerencias — no se puede sacar algo que no existe.");
      return;
    }
    setError(null);
    salida.mutate();
  };

  return (
    <Card className="max-w-xl">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="relative">
          <label className="mb-1 block text-sm font-medium text-ink">Producto</label>
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Escribí para buscar un producto que ya tengas cargado"
            required
            autoComplete="off"
            className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
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
                  {s.nombre}
                  {s.marca && <span className="text-muted"> · {s.marca}</span>}
                </button>
              ))}
            </div>
          )}
          {!selected && query.trim().length >= 2 && suggestions.length === 0 && (
            <p className="mt-1 text-xs text-muted">No encontramos ningún producto tuyo con ese nombre.</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Cantidad a sacar</label>
            <input
              type="number"
              min={1}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              required
              className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Motivo</label>
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value as "consumed" | "expired")}
              className="w-full rounded-xl border border-line bg-white px-4 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="consumed">Consumido</option>
              <option value="expired">Vencido</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            {error}
          </div>
        )}
        {okMessage && (
          <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm text-primaryDark">
            {okMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={salida.isPending || !selected}
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

function validateRowLocal(data: BulkProductRow, direction: "entrada" | "salida"): string[] {
  const errors: string[] = [];
  if (!data.nombre.trim()) errors.push("nombre es obligatorio");
  if (direction === "entrada" && !data.categoria.trim()) errors.push("categoria es obligatoria");
  if (!data.stock || data.stock <= 0) errors.push("stock debe ser mayor a 0");
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
        errs.push(`${file.name}: ${err?.response?.data?.detail ?? "no se pudo leer el archivo"}`);
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
      qc.invalidateQueries({ queryKey: ["my-stats"] });
      qc.invalidateQueries({ queryKey: ["my-metrics"] });
      setResult(data);
      setRows([]);
      setActiveKey(null);
    },
  });

  const includedRows = rows.filter((r) => r.included && validateRowLocal(r.data, direction).length === 0);
  const active = rows.find((r) => r.key === activeKey) ?? null;
  const activeErrors = active ? validateRowLocal(active.data, direction) : [];

  return (
    <Card className="max-w-5xl">
      <p className="mb-4 text-sm text-muted">
        {direction === "entrada" ? (
          <>
            Subí uno o varios archivos CSV o Excel (.xlsx) con las columnas: nombre, marca,
            categoria, stock, vencimiento, descripcion, imagen_url, ubicacion, stock_minimo,
            dias_alerta_vencimiento (las últimas dos son opcionales). Cada producto que se lea
            aparece como una pestaña que podés revisar y modificar antes de confirmar la carga.
          </>
        ) : (
          <>
            Subí uno o varios archivos CSV o Excel (.xlsx) con las columnas: nombre, marca, stock
            (cantidad a sacar), vencimiento (opcional, para identificar el lote si hay más de uno
            con ese nombre). Cada fila tiene que coincidir con un producto que ya tengas cargado.
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
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
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
                  <p className="text-xs text-muted">
                    {active.fileName} · fila {active.row_number}
                    {active.action === "merge" && (
                      <> · va a sumar {active.existing_stock ?? 0} + {active.data.stock}</>
                    )}
                    {active.action === "create" && <> · producto nuevo</>}
                    {active.action === "salida" && (
                      <>
                        {" "}
                        · va a sacar {active.data.stock} (quedan{" "}
                        {(active.existing_stock ?? 0) - active.data.stock})
                      </>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeRow(active.key)}
                    className="text-xs font-medium text-danger hover:underline"
                  >
                    Quitar de la lista
                  </button>
                </div>

                {activeErrors.length > 0 && (
                  <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                    {activeErrors.join(" · ")}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Nombre</label>
                  <input
                    value={active.data.nombre}
                    onChange={(e) => updateRow(active.key, { nombre: e.target.value })}
                    className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-ink">Marca</label>
                    <input
                      value={active.data.marca ?? ""}
                      onChange={(e) => updateRow(active.key, { marca: e.target.value || null })}
                      className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  {direction === "entrada" && (
                    <Picklist
                      label="Categoría"
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
                    <input
                      type="number"
                      min={1}
                      value={active.data.stock}
                      onChange={(e) => updateRow(active.key, { stock: Number(e.target.value) })}
                      className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                    />
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
                      emptyLabel="Sin ubicación"
                      onChange={(v) => {
                        updateRow(active.key, { ubicacion: v || null });
                        setUbicacionOptions((prev) => addIfMissing(prev, v));
                      }}
                    />
                    <div>
                      <label className="mb-1 block text-sm font-medium text-ink">Descripción</label>
                      <textarea
                        value={active.data.descripcion ?? ""}
                        onChange={(e) => updateRow(active.key, { descripcion: e.target.value || null })}
                        rows={2}
                        className="w-full resize-none rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                        Alertas para este producto (opcional)
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-ink">Stock mínimo</label>
                          <input
                            type="number"
                            min={1}
                            value={active.data.stock_minimo ?? ""}
                            onChange={(e) =>
                              updateRow(active.key, {
                                stock_minimo: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                            placeholder="Usa tu regla general"
                            className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-ink">Días de anticipación</label>
                          <input
                            type="number"
                            min={1}
                            value={active.data.dias_alerta_vencimiento ?? ""}
                            onChange={(e) =>
                              updateRow(active.key, {
                                dias_alerta_vencimiento: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                            placeholder="Usa tu regla general"
                            className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                          />
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

      {rows.length > 0 && (
        <button
          onClick={() => commit.mutate()}
          disabled={commit.isPending || includedRows.length === 0}
          className="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {commit.isPending ? "Confirmando…" : `Confirmar carga (${includedRows.length} productos)`}
        </button>
      )}
    </Card>
  );
}

export default function Cargar() {
  const [tab, setTab] = useState<"manual" | "archivo">("manual");
  const [direction, setDirection] = useState<"entrada" | "salida">("entrada");

  return (
    <div>
      <PageHeader
        title="Flujo de producto"
        subtitle={
          direction === "entrada"
            ? "Alta de productos a tu inventario"
            : "Registrá salidas de stock de tu inventario"
        }
      />

      <div className="mb-3 flex gap-2">
        <button
          onClick={() => setDirection("entrada")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            direction === "entrada" ? "bg-primary text-white" : "bg-canvas text-muted hover:text-primaryDark"
          }`}
        >
          Entrada
        </button>
        <button
          onClick={() => setDirection("salida")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            direction === "salida" ? "bg-danger text-white" : "bg-canvas text-muted hover:text-primaryDark"
          }`}
        >
          Salida
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab("manual")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            tab === "manual" ? "bg-primary text-white" : "bg-canvas text-muted hover:text-primaryDark"
          }`}
        >
          Manual
        </button>
        <button
          onClick={() => setTab("archivo")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            tab === "archivo" ? "bg-primary text-white" : "bg-canvas text-muted hover:text-primaryDark"
          }`}
        >
          Archivo
        </button>
      </div>

      {tab === "manual" ? (
        direction === "entrada" ? (
          <ManualForm />
        ) : (
          <SalidaForm />
        )
      ) : (
        <BulkUpload direction={direction} />
      )}
    </div>
  );
}
