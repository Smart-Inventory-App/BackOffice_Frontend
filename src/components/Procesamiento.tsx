import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Barcode,
  Camera,
  CheckCircle2,
  FileText,
  RotateCcw,
  ScanLine,
} from "lucide-react";
import { api } from "@/lib/api";
import { limpiarCodigo } from "@/lib/barcode";
import { Card } from "@/components/ui";
import { Picklist, addIfMissing } from "@/components/Picklist";
import type {
  BulkCommitResult,
  BulkProductRow,
  OCRDocType,
  ProductDraft,
  ProductMatch,
  SalidaOCRResult,
  ScanResult,
  ScanState,
} from "@/lib/types";

/** Cada cuánto se le pregunta al módulo si ya terminó. */
const POLL_MS = 1500;

/** El mismo motivo que asienta el backend para una salida por comprobante. */
const MOTIVO_COMPROBANTE = "Documento Comercial";

export type Prefill = { codigo_barras?: string; nombre?: string };

/** Lo que llega a la salida manual desde un renglón que no se pudo identificar. */
export type SalidaPrefill = { busqueda: string; nota?: string };

type Opciones = { categorias: string[]; ubicaciones: string[]; marcas: string[] };

function detalle(err: any, fallback: string): string {
  return err?.response?.data?.detail ?? fallback;
}

function unidades(n: number | string): string {
  return Number(n) === 1 ? "1 unidad" : `${n} unidades`;
}

function formatEspera(segundos: number | null): string {
  if (segundos === null) return "";
  if (segundos < 60) return `~${segundos} s`;
  return `~${Math.round(segundos / 60)} min`;
}

/* ── el escaneo, y la espera ────────────────────────────────────────────── */

/**
 * Manda una foto al módulo y sigue el trabajo hasta que termina.
 *
 * Un código de barras vuelve resuelto en la misma llamada; los demás tipos se
 * encolan y hay que consultarlos. Las dos formas se ven igual desde afuera para
 * que cada flujo no tenga que saber cuál le tocó.
 */
function useScan(docType: OCRDocType) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [directo, setDirecto] = useState<ScanState | null>(null);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);

  const subida = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("doc_type", docType);
      const { data } = await api.post<ScanState>("/me/products/ocr/scan", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return data;
    },
    onMutate: () => {
      setErrorSubida(null);
      setDirecto(null);
      setJobId(null);
    },
    onSuccess: (data) =>
      data.status === "done" ? setDirecto(data) : setJobId(data.job_id),
    onError: (err: any) =>
      setErrorSubida(detalle(err, "No se pudo enviar la foto al módulo de OCR.")),
  });

  const consulta = useQuery({
    queryKey: ["ocr-scan", jobId],
    queryFn: async () => (await api.get<ScanState>(`/me/products/ocr/scan/${jobId}`)).data,
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const estado = query.state.data?.status;
      return estado === "done" || estado === "failed" ? false : POLL_MS;
    },
  });

  const estado = directo ?? consulta.data ?? null;
  const terminado = estado?.status === "done" || estado?.status === "failed";

  return {
    estado,
    resultado: estado?.status === "done" ? estado.result : null,
    error: errorSubida ?? (estado?.status === "failed" ? estado.error : null),
    procesando: subida.isPending || (Boolean(jobId) && !terminado),
    enviado: subida.isPending || Boolean(jobId) || Boolean(directo) || Boolean(errorSubida),
    subir: (file: File) => subida.mutate(file),
    reiniciar: () => {
      setJobId(null);
      setDirecto(null);
      setErrorSubida(null);
      subida.reset();
    },
  };
}

type Scan = ReturnType<typeof useScan>;

function Progreso({ scan, etiqueta }: { scan: Scan; etiqueta: string }) {
  if (!scan.procesando) return null;

  const posicion = scan.estado?.queue_position ?? null;
  const espera = scan.estado?.estimated_wait_seconds ?? null;

  return (
    <p className="flex items-center gap-2 text-sm text-muted">
      <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-line border-t-primary" />
      {posicion
        ? `${etiqueta}: ${posicion}º en la fila${espera !== null ? `, ${formatEspera(espera)}` : ""}`
        : `${etiqueta}: procesando…`}
    </p>
  );
}

function FotoInput({
  label,
  hint,
  file,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // La vista previa vive sólo en esta pestaña y se libera al cambiar de foto.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-sm font-medium text-ink">{label}</p>
      <p className="mt-0.5 text-xs text-muted">{hint}</p>

      {preview ? (
        <div className="mt-2 flex items-start gap-3">
          <img src={preview} alt={label} className="h-24 w-24 rounded-lg border border-line object-cover" />
          {!disabled && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                if (ref.current) ref.current.value = "";
              }}
              className="text-xs font-medium text-muted underline hover:text-danger"
            >
              Quitar
            </button>
          )}
        </div>
      ) : (
        <label
          className={`mt-2 flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-3 text-sm text-muted transition hover:border-primary hover:bg-primary/5 ${
            disabled ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <Camera size={16} />
          Elegí una foto
          <input
            ref={ref}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={disabled}
            onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          />
        </label>
      )}
    </div>
  );
}

/* ── elegir a qué producto se refiere lo leído ──────────────────────────── */

function MatchPicker({
  draft,
  elegido,
  onElegir,
  contexto,
}: {
  draft: ProductDraft;
  elegido: number | null;
  onElegir: (match: ProductMatch | null) => void;
  contexto: "entrada" | "salida";
}) {
  if (draft.coincidencias.length === 0) {
    return (
      <p className="rounded-xl bg-canvas px-4 py-3 text-sm text-muted">
        {contexto === "entrada" ? (
          <>
            No encontramos ningún producto tuyo parecido a{" "}
            <span className="font-medium text-ink">«{draft.texto_leido}»</span>. Revisá el nombre y
            se va a cargar como producto nuevo.
          </>
        ) : (
          <>
            No encontramos ningún producto tuyo parecido a{" "}
            <span className="font-medium text-ink">«{draft.texto_leido}»</span>, así que este
            renglón no se puede descargar.
          </>
        )}
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {contexto === "entrada" ? "¿Es alguno de estos?" : "¿De cuál se descarga?"}
      </p>
      {draft.coincidencias.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onElegir(m)}
          className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-2 text-left text-sm transition ${
            elegido === m.id
              ? "border-primary bg-primary/5"
              : "border-line hover:border-primary/50 hover:bg-canvas"
          }`}
        >
          <span>
            <span className="font-medium text-ink">{m.nombre}</span>
            {m.marca && <span className="text-muted"> · {m.marca}</span>}
            <span className="block text-xs text-muted">
              stock {m.stock}
              {m.vencimiento ? ` · vence ${m.vencimiento}` : ""}
            </span>
          </span>
          <span className="shrink-0 text-xs text-muted">
            {m.por_codigo ? "por código" : `${Math.round(m.score * 100)} % parecido`}
          </span>
        </button>
      ))}
      {contexto === "entrada" && (
        <button
          type="button"
          onClick={() => onElegir(null)}
          className={`w-full rounded-xl border px-4 py-2 text-left text-sm transition ${
            elegido === null
              ? "border-primary bg-primary/5"
              : "border-line hover:border-primary/50 hover:bg-canvas"
          }`}
        >
          <span className="font-medium text-ink">Ninguno: es un producto nuevo</span>
        </button>
      )}
    </div>
  );
}

function Aviso({ resultado }: { resultado: ScanResult }) {
  if (!resultado.needs_review && resultado.advertencias.length === 0) return null;
  return (
    <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span>
        La lectura salió con {Math.round(resultado.confianza * 100)} % de confianza: revisá los
        campos antes de confirmar.
      </span>
    </p>
  );
}

function ErrorScan({ scan }: { scan: Scan }) {
  if (!scan.error) return null;
  return (
    <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
      {scan.error}
    </p>
  );
}

function Confirmado({ texto, onSeguir }: { texto: string; onSeguir: () => void }) {
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primaryDark">
        <CheckCircle2 size={16} /> {texto}
      </p>
      <button
        type="button"
        onClick={onSeguir}
        className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
      >
        <RotateCcw size={14} /> Escanear otra foto
      </button>
    </div>
  );
}

function BotonProcesar({
  onClick,
  disabled,
  procesando,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  procesando: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || procesando}
      className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
    >
      <ScanLine size={16} />
      {procesando ? "Procesando…" : children}
    </button>
  );
}

/* ── entrada · imagen del producto ──────────────────────────────────────── */

const BORRADOR_VACIO = {
  nombre: "",
  marca: "",
  categoria: "",
  stock: "1",
  vencimiento: "",
  codigo_barras: "",
  descripcion: "",
  ubicacion: "",
};

function EntradaProducto({ opciones, setOpciones }: { opciones: Opciones; setOpciones: (o: Opciones) => void }) {
  const qc = useQueryClient();
  const etiqueta = useScan("product_label");
  const vencimiento = useScan("expiry_date");
  const codigo = useScan("barcode");

  const [fotos, setFotos] = useState<{ producto: File | null; vencimiento: File | null; codigo: File | null }>({
    producto: null,
    vencimiento: null,
    codigo: null,
  });
  const [form, setForm] = useState<typeof BORRADOR_VACIO | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [elegido, setElegido] = useState<number | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const procesando = etiqueta.procesando || vencimiento.procesando || codigo.procesando;
  const listo = Boolean(etiqueta.resultado) && !procesando;

  // El borrador se arma una sola vez, cuando terminaron todas las fotos que se
  // mandaron: a partir de ahí es del usuario y no se lo pisa.
  useEffect(() => {
    if (!listo || form) return;
    const principal = etiqueta.resultado?.draft;
    if (!principal) return;

    setDraft(principal);
    setElegido(principal.coincidencia_id);

    const match = principal.coincidencias.find((m) => m.id === principal.coincidencia_id);
    setForm({
      ...BORRADOR_VACIO,
      nombre: match?.nombre ?? principal.nombre ?? "",
      marca: match?.marca ?? principal.marca ?? "",
      categoria: match?.categoria ?? "",
      ubicacion: match?.ubicacion ?? "",
      descripcion: principal.descripcion ?? "",
      vencimiento:
        vencimiento.resultado?.draft?.vencimiento ?? match?.vencimiento ?? "",
      codigo_barras:
        codigo.resultado?.draft?.codigo_barras ?? match?.codigo_barras ?? "",
    });
  }, [listo, form, etiqueta.resultado, vencimiento.resultado, codigo.resultado]);

  const cargar = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ merged?: boolean; nombre: string }>("/me/products", {
        nombre: form!.nombre,
        marca: form!.marca || null,
        categoria: form!.categoria,
        stock: Number(form!.stock),
        vencimiento: form!.vencimiento || null,
        descripcion: form!.descripcion || null,
        ubicacion: form!.ubicacion || null,
        codigo_barras: form!.codigo_barras || null,
      });
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["my-products"] });
      qc.invalidateQueries({ queryKey: ["my-stats"] });
      setHecho(
        data.merged
          ? `Se ${Number(form!.stock) === 1 ? "sumó" : "sumaron"} ${unidades(form!.stock)} a «${data.nombre}», que ya tenías cargado.`
          : `«${data.nombre}» quedó cargado con ${unidades(form!.stock)}.`,
      );
    },
  });

  const reiniciar = () => {
    etiqueta.reiniciar();
    vencimiento.reiniciar();
    codigo.reiniciar();
    setFotos({ producto: null, vencimiento: null, codigo: null });
    setForm(null);
    setDraft(null);
    setElegido(null);
    setHecho(null);
    cargar.reset();
  };

  const procesar = () => {
    if (fotos.producto) etiqueta.subir(fotos.producto);
    if (fotos.vencimiento) vencimiento.subir(fotos.vencimiento);
    if (fotos.codigo) codigo.subir(fotos.codigo);
  };

  const elegirMatch = (match: ProductMatch | null) => {
    setElegido(match?.id ?? null);
    if (!match || !form) return;
    // Tomar la coincidencia es decir «es este producto»: los datos del que ya
    // está cargado mandan, para que el alta lo encuentre y le sume stock en vez
    // de crear un duplicado con el nombre que leyó la cámara.
    setForm({
      ...form,
      nombre: match.nombre,
      marca: match.marca ?? "",
      categoria: match.categoria ?? form.categoria,
      ubicacion: match.ubicacion ?? form.ubicacion,
      codigo_barras: form.codigo_barras || match.codigo_barras || "",
    });
  };

  if (hecho) return <Confirmado texto={hecho} onSeguir={reiniciar} />;

  const set = (campo: keyof typeof BORRADOR_VACIO) => (e: { target: { value: string } }) =>
    setForm((f) => (f ? { ...f, [campo]: e.target.value } : f));

  return (
    <div className="space-y-4">
      {!form && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <FotoInput
              label="Foto del producto *"
              hint="El envase o su etiqueta, de frente"
              file={fotos.producto}
              disabled={procesando}
              onChange={(f) => setFotos((s) => ({ ...s, producto: f }))}
            />
            <FotoInput
              label="Fecha de vencimiento"
              hint="El sello impreso, si está en otra cara"
              file={fotos.vencimiento}
              disabled={procesando}
              onChange={(f) => setFotos((s) => ({ ...s, vencimiento: f }))}
            />
            <FotoInput
              label="Código de barras"
              hint="Para que el producto se reconozca solo la próxima vez"
              file={fotos.codigo}
              disabled={procesando}
              onChange={(f) => setFotos((s) => ({ ...s, codigo: f }))}
            />
          </div>

          <BotonProcesar onClick={procesar} disabled={!fotos.producto} procesando={procesando}>
            Procesar fotos
          </BotonProcesar>

          <Progreso scan={etiqueta} etiqueta="Etiqueta" />
          <Progreso scan={vencimiento} etiqueta="Vencimiento" />
          <Progreso scan={codigo} etiqueta="Código de barras" />
          <ErrorScan scan={etiqueta} />
          <ErrorScan scan={vencimiento} />
          <ErrorScan scan={codigo} />
        </>
      )}

      {form && draft && (
        <div className="space-y-4">
          {etiqueta.resultado && <Aviso resultado={etiqueta.resultado} />}

          {/* Que una foto secundaria falle no cancela el alta: el resto del
              borrador sirve igual y el campo que faltó se completa a mano. */}
          {(vencimiento.error || codigo.error) && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                {vencimiento.error && codigo.error
                  ? "No se pudieron leer la fecha de vencimiento ni el código de barras."
                  : vencimiento.error
                    ? "No se pudo leer la fecha de vencimiento."
                    : "No se pudo leer el código de barras."}{" "}
                Podés completarlo a mano acá abajo.
              </span>
            </p>
          )}

          <MatchPicker draft={draft} elegido={elegido} onElegir={elegirMatch} contexto="entrada" />

          <div className="space-y-4 rounded-xl border border-line p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Nombre</label>
                <input
                  value={form.nombre}
                  onChange={set("nombre")}
                  className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                />
                {draft.texto_leido && draft.texto_leido !== form.nombre && (
                  <p className="mt-1 text-xs text-muted">Se leyó: «{draft.texto_leido}»</p>
                )}
              </div>
              <Picklist
                label="Marca"
                value={form.marca}
                options={opciones.marcas}
                emptyLabel="Sin marca"
                onChange={(v) => {
                  setForm((f) => (f ? { ...f, marca: v } : f));
                  setOpciones({ ...opciones, marcas: addIfMissing(opciones.marcas, v) });
                }}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Picklist
                label="Categoría"
                value={form.categoria}
                options={opciones.categorias}
                required
                onChange={(v) => {
                  setForm((f) => (f ? { ...f, categoria: v } : f));
                  setOpciones({ ...opciones, categorias: addIfMissing(opciones.categorias, v) });
                }}
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Unidades a cargar</label>
                <input
                  type="number"
                  min={1}
                  value={form.stock}
                  onChange={set("stock")}
                  className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Vencimiento</label>
                <input
                  type="date"
                  value={form.vencimiento}
                  onChange={set("vencimiento")}
                  className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Código de barras</label>
                <input
                  inputMode="numeric"
                  value={form.codigo_barras}
                  onChange={(e) =>
                    setForm((f) => (f ? { ...f, codigo_barras: limpiarCodigo(e.target.value) } : f))
                  }
                  placeholder="Sin código"
                  className="w-full rounded-xl border border-line px-4 py-2 font-mono text-sm outline-none focus:border-primary"
                />
              </div>
            </div>

            <Picklist
              label="Ubicación"
              value={form.ubicacion}
              options={opciones.ubicaciones}
              onChange={(v) => {
                setForm((f) => (f ? { ...f, ubicacion: v } : f));
                setOpciones({ ...opciones, ubicaciones: addIfMissing(opciones.ubicaciones, v) });
              }}
            />

            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Descripción</label>
              <textarea
                value={form.descripcion}
                onChange={set("descripcion")}
                rows={3}
                className="w-full resize-none rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          {cargar.isError && (
            <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
              {detalle(cargar.error, "No se pudo cargar el producto.")}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => cargar.mutate()}
              disabled={cargar.isPending || !form.nombre || !form.categoria || !form.stock}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {cargar.isPending ? "Cargando…" : "Confirmar carga"}
            </button>
            <button
              type="button"
              onClick={reiniciar}
              className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
            >
              Descartar y escanear otra
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── entrada · código de barras ─────────────────────────────────────────── */

function EntradaCodigo({ irAManual }: { irAManual: (p: Prefill) => void }) {
  const qc = useQueryClient();
  const codigo = useScan("barcode");
  const [foto, setFoto] = useState<File | null>(null);
  const [cantidad, setCantidad] = useState("1");
  const [hecho, setHecho] = useState<string | null>(null);

  const draft = codigo.resultado?.draft ?? null;
  const match = draft?.coincidencias[0] ?? null;

  const cargar = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ merged?: boolean; nombre: string }>("/me/products", {
        nombre: match!.nombre,
        marca: match!.marca,
        categoria: match!.categoria,
        stock: Number(cantidad),
        vencimiento: match!.vencimiento,
        ubicacion: match!.ubicacion,
        codigo_barras: draft!.codigo_barras,
      });
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["my-products"] });
      qc.invalidateQueries({ queryKey: ["my-stats"] });
      setHecho(`Se ${Number(cantidad) === 1 ? "sumó" : "sumaron"} ${unidades(cantidad)} a «${data.nombre}».`);
    },
  });

  const reiniciar = () => {
    codigo.reiniciar();
    setFoto(null);
    setCantidad("1");
    setHecho(null);
    cargar.reset();
  };

  if (hecho) return <Confirmado texto={hecho} onSeguir={reiniciar} />;

  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <FotoInput
          label="Foto del código de barras"
          hint="De cerca y derecho: se decodifica en menos de un segundo"
          file={foto}
          disabled={codigo.procesando}
          onChange={setFoto}
        />
      </div>

      {!draft && (
        <BotonProcesar
          onClick={() => foto && codigo.subir(foto)}
          disabled={!foto}
          procesando={codigo.procesando}
        >
          Leer código
        </BotonProcesar>
      )}

      <ErrorScan scan={codigo} />

      {draft && (
        <div className="space-y-4">
          <div className="rounded-xl border border-line p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Código leído</p>
            <p className="font-mono text-xl font-semibold text-ink">{draft.codigo_barras}</p>
            {draft.pais_registro && (
              <p className="mt-1 text-xs text-muted">Registrado en {draft.pais_registro}</p>
            )}
          </div>

          {match ? (
            <>
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
                <p className="text-sm text-muted">Corresponde a</p>
                <p className="text-lg font-semibold text-ink">{match.nombre}</p>
                <p className="text-sm text-muted">
                  {match.marca ? `${match.marca} · ` : ""}stock actual {match.stock}
                  {match.vencimiento ? ` · vence ${match.vencimiento}` : ""}
                </p>
              </div>

              <div className="max-w-xs">
                <label className="mb-1 block text-sm font-medium text-ink">Unidades a cargar</label>
                <input
                  type="number"
                  min={1}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                />
              </div>

              {cargar.isError && (
                <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
                  {detalle(cargar.error, "No se pudo cargar el stock.")}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => cargar.mutate()}
                  disabled={cargar.isPending || Number(cantidad) < 1}
                  className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {cargar.isPending ? "Cargando…" : "Confirmar entrada"}
                </button>
                <button
                  type="button"
                  onClick={reiniciar}
                  className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
                >
                  Leer otro código
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="rounded-xl bg-canvas px-4 py-3 text-sm text-muted">
                No tenés ningún producto con este código. Cargalo una vez y las próximas veces la
                foto del código va a alcanzar.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => irAManual({ codigo_barras: draft.codigo_barras ?? "" })}
                  className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Cargar producto nuevo con este código
                </button>
                <button
                  type="button"
                  onClick={reiniciar}
                  className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
                >
                  Leer otro código
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── comprobante: renglones editables ───────────────────────────────────── */

type Renglon = {
  draft: ProductDraft;
  incluir: boolean;
  nombre: string;
  marca: string;
  categoria: string;
  cantidad: string;
  vencimiento: string;
  codigo_barras: string;
  elegido: number | null;
};

function aRenglon(draft: ProductDraft): Renglon {
  const match = draft.coincidencias.find((m) => m.id === draft.coincidencia_id) ?? null;
  return {
    draft,
    incluir: true,
    nombre: match?.nombre ?? draft.nombre ?? "",
    marca: match?.marca ?? "",
    categoria: match?.categoria ?? "",
    cantidad: String(draft.stock ?? 1),
    vencimiento: match?.vencimiento ?? "",
    codigo_barras: match?.codigo_barras ?? "",
    elegido: draft.coincidencia_id,
  };
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

/* ── entrada · comprobante ──────────────────────────────────────────────── */

function EntradaComprobante({ opciones, setOpciones }: { opciones: Opciones; setOpciones: (o: Opciones) => void }) {
  const qc = useQueryClient();
  const scan = useScan("receipt");
  const [foto, setFoto] = useState<File | null>(null);
  const [renglones, setRenglones] = useState<Renglon[] | null>(null);
  const [hecho, setHecho] = useState<BulkCommitResult | null>(null);

  useEffect(() => {
    if (scan.resultado && !renglones) setRenglones(scan.resultado.items.map(aRenglon));
  }, [scan.resultado, renglones]);

  const incluidos = (renglones ?? []).filter((r) => r.incluir && r.nombre && r.categoria);
  const sinCategoria = (renglones ?? []).filter((r) => r.incluir && r.nombre && !r.categoria).length;

  const confirmar = useMutation({
    mutationFn: async () => {
      const rows: BulkProductRow[] = incluidos.map((r, i) => ({
        row_number: i + 1,
        nombre: r.nombre,
        marca: r.marca || null,
        categoria: r.categoria,
        stock: Number(r.cantidad) || 1,
        vencimiento: r.vencimiento || null,
        codigo_barras: r.codigo_barras || null,
        descripcion: null,
        imagen_url: null,
        ubicacion: null,
        stock_minimo: null,
        dias_alerta_vencimiento: null,
      }));
      const { data } = await api.post<BulkCommitResult>("/me/products/bulk/commit", {
        rows,
        mode: "entrada",
        origen: MOTIVO_COMPROBANTE,
      });
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["my-products"] });
      qc.invalidateQueries({ queryKey: ["my-stats"] });
      setHecho(data);
    },
  });

  const reiniciar = () => {
    scan.reiniciar();
    setFoto(null);
    setRenglones(null);
    setHecho(null);
    confirmar.reset();
  };

  const editar = (i: number, cambio: Partial<Renglon>) =>
    setRenglones((rs) => (rs ? rs.map((r, j) => (j === i ? { ...r, ...cambio } : r)) : rs));

  if (hecho) {
    return (
      <Confirmado
        texto={`${
          hecho.created === 1 ? "1 producto nuevo" : `${hecho.created} productos nuevos`
        } y ${
          hecho.merged === 1 ? "1 actualizado" : `${hecho.merged} actualizados`
        } desde el comprobante.${
          hecho.failed
            ? ` ${hecho.failed === 1 ? "1 renglón no se pudo cargar" : `${hecho.failed} renglones no se pudieron cargar`}.`
            : ""
        }`}
        onSeguir={reiniciar}
      />
    );
  }

  return (
    <div className="space-y-4">
      {!renglones && (
        <>
          <div className="max-w-sm">
            <FotoInput
              label="Foto del ticket, remito o factura"
              hint="Entera y sin doblar. Es el documento que más tarda: cerca de un minuto"
              file={foto}
              disabled={scan.procesando}
              onChange={setFoto}
            />
          </div>
          <BotonProcesar
            onClick={() => foto && scan.subir(foto)}
            disabled={!foto}
            procesando={scan.procesando}
          >
            Leer comprobante
          </BotonProcesar>
          <Progreso scan={scan} etiqueta="Comprobante" />
          <ErrorScan scan={scan} />
        </>
      )}

      {renglones && scan.resultado && (
        <>
          <CabeceraComprobante resultado={scan.resultado} />
          {renglones.length === 0 && (
            <p className="rounded-xl bg-canvas px-4 py-3 text-sm text-muted">
              No se reconoció ningún renglón en esta foto. Probá con una toma más nítida o cargá los
              productos a mano.
            </p>
          )}

          {renglones.map((r, i) => (
            <Card key={i} className={r.incluir ? "" : "opacity-50"}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Renglón leído
                  </p>
                  <p className="font-mono text-sm text-ink">«{r.draft.texto_leido}»</p>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={r.incluir}
                    onChange={(e) => editar(i, { incluir: e.target.checked })}
                    className="h-4 w-4 accent-[var(--color-primary,#14b8a6)]"
                  />
                  Cargar
                </label>
              </div>

              <div className="mb-3">
                <MatchPicker
                  draft={r.draft}
                  elegido={r.elegido}
                  contexto="entrada"
                  onElegir={(m) =>
                    editar(i, {
                      elegido: m?.id ?? null,
                      ...(m
                        ? {
                            nombre: m.nombre,
                            marca: m.marca ?? "",
                            categoria: m.categoria ?? r.categoria,
                            codigo_barras: r.codigo_barras || m.codigo_barras || "",
                          }
                        : {}),
                    })
                  }
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Nombre</label>
                  <input
                    value={r.nombre}
                    onChange={(e) => editar(i, { nombre: e.target.value })}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <Picklist
                  label="Categoría"
                  value={r.categoria}
                  options={opciones.categorias}
                  required
                  onChange={(v) => {
                    editar(i, { categoria: v });
                    setOpciones({ ...opciones, categorias: addIfMissing(opciones.categorias, v) });
                  }}
                />
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Cantidad</label>
                  <input
                    type="number"
                    min={1}
                    value={r.cantidad}
                    onChange={(e) => editar(i, { cantidad: e.target.value })}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Vencimiento</label>
                  <input
                    type="date"
                    value={r.vencimiento}
                    onChange={(e) => editar(i, { vencimiento: e.target.value })}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Código de barras</label>
                  <input
                    inputMode="numeric"
                    value={r.codigo_barras}
                    onChange={(e) => editar(i, { codigo_barras: limpiarCodigo(e.target.value) })}
                    placeholder="Sin código"
                    className="w-full rounded-xl border border-line px-3 py-2 font-mono text-sm outline-none focus:border-primary"
                  />
                </div>
                <Picklist
                  label="Marca"
                  value={r.marca}
                  options={opciones.marcas}
                  emptyLabel="Sin marca"
                  onChange={(v) => {
                    editar(i, { marca: v });
                    setOpciones({ ...opciones, marcas: addIfMissing(opciones.marcas, v) });
                  }}
                />
              </div>
            </Card>
          ))}

          {sinCategoria > 0 && (
            <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              {sinCategoria === 1
                ? "Falta elegir la categoría de un renglón para poder cargarlo."
                : `Faltan las categorías de ${sinCategoria} renglones para poder cargarlos.`}
            </p>
          )}

          {confirmar.isError && (
            <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
              {detalle(confirmar.error, "No se pudo cargar el comprobante.")}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => confirmar.mutate()}
              disabled={confirmar.isPending || incluidos.length === 0}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {confirmar.isPending
                ? "Cargando…"
                : `Confirmar carga (${incluidos.length} ${incluidos.length === 1 ? "producto" : "productos"})`}
            </button>
            <button
              type="button"
              onClick={reiniciar}
              className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
            >
              Descartar y escanear otro
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── salida · código de barras ──────────────────────────────────────────── */

function SalidaCodigo() {
  const qc = useQueryClient();
  const codigo = useScan("barcode");
  const [foto, setFoto] = useState<File | null>(null);
  const [cantidad, setCantidad] = useState("1");
  const [motivo, setMotivo] = useState<"consumed" | "expired">("consumed");
  const [hecho, setHecho] = useState<string | null>(null);

  const draft = codigo.resultado?.draft ?? null;
  const match = draft?.coincidencias[0] ?? null;

  const descargar = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ nombre: string; stock: number }>("/me/products/salida", {
        product_id: match!.id,
        quantity: Number(cantidad),
        event_type: motivo,
      });
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["my-products"] });
      qc.invalidateQueries({ queryKey: ["my-stats"] });
      setHecho(`${Number(cantidad) === 1 ? "Salió" : "Salieron"} ${unidades(cantidad)} de «${data.nombre}». Quedan ${data.stock}.`);
    },
  });

  const reiniciar = () => {
    codigo.reiniciar();
    setFoto(null);
    setCantidad("1");
    setHecho(null);
    descargar.reset();
  };

  if (hecho) return <Confirmado texto={hecho} onSeguir={reiniciar} />;

  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <FotoInput
          label="Foto del código de barras"
          hint="De cerca y derecho: se decodifica en menos de un segundo"
          file={foto}
          disabled={codigo.procesando}
          onChange={setFoto}
        />
      </div>

      {!draft && (
        <BotonProcesar
          onClick={() => foto && codigo.subir(foto)}
          disabled={!foto}
          procesando={codigo.procesando}
        >
          Leer código
        </BotonProcesar>
      )}

      <ErrorScan scan={codigo} />

      {draft && (
        <div className="space-y-4">
          <div className="rounded-xl border border-line p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Código leído</p>
            <p className="font-mono text-xl font-semibold text-ink">{draft.codigo_barras}</p>
          </div>

          {match ? (
            <>
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
                <p className="text-sm text-muted">Corresponde a</p>
                <p className="text-lg font-semibold text-ink">{match.nombre}</p>
                <p className="text-sm text-muted">
                  {match.marca ? `${match.marca} · ` : ""}stock actual {match.stock}
                </p>
              </div>

              <div className="grid max-w-md gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Unidades a sacar</label>
                  <input
                    type="number"
                    min={1}
                    max={match.stock}
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Motivo</label>
                  <select
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value as "consumed" | "expired")}
                    className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
                  >
                    <option value="consumed">Consumido</option>
                    <option value="expired">Vencido</option>
                  </select>
                </div>
              </div>

              {descargar.isError && (
                <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
                  {detalle(descargar.error, "No se pudo registrar la salida.")}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => descargar.mutate()}
                  disabled={descargar.isPending || Number(cantidad) < 1}
                  className="rounded-xl bg-danger px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {descargar.isPending ? "Registrando…" : "Confirmar salida"}
                </button>
                <button
                  type="button"
                  onClick={reiniciar}
                  className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
                >
                  Leer otro código
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="rounded-xl bg-canvas px-4 py-3 text-sm text-muted">
                No tenés ningún producto con este código, así que no hay nada que descargar. Si es
                un producto que sí tenés, cargale el código desde su ficha y la próxima vez lo
                vamos a reconocer.
              </p>
              <button
                type="button"
                onClick={reiniciar}
                className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
              >
                Leer otro código
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── salida · comprobante ───────────────────────────────────────────────── */

function SalidaComprobante({ irASalidaManual }: { irASalidaManual: (p: SalidaPrefill) => void }) {
  const qc = useQueryClient();
  const scan = useScan("receipt");
  const [foto, setFoto] = useState<File | null>(null);
  const [renglones, setRenglones] = useState<Renglon[] | null>(null);
  const [hecho, setHecho] = useState<SalidaOCRResult | null>(null);

  useEffect(() => {
    if (scan.resultado && !renglones) setRenglones(scan.resultado.items.map(aRenglon));
  }, [scan.resultado, renglones]);

  // Sólo se puede descargar de un producto que existe: un renglón sin
  // coincidencia no tiene de dónde restar.
  const descargables = (renglones ?? []).filter((r) => r.incluir && r.elegido !== null);
  const sinIdentificar = (renglones ?? []).filter((r) => r.elegido === null).length;

  const confirmar = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<SalidaOCRResult>("/me/products/ocr/salida", {
        items: descargables.map((r) => ({
          product_id: r.elegido,
          quantity: Number(r.cantidad) || 1,
        })),
        comercio: scan.resultado?.comprobante?.comercio ?? null,
      });
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["my-products"] });
      qc.invalidateQueries({ queryKey: ["my-stats"] });
      setHecho(data);
    },
  });

  const reiniciar = () => {
    scan.reiniciar();
    setFoto(null);
    setRenglones(null);
    setHecho(null);
    confirmar.reset();
  };

  const editar = (i: number, cambio: Partial<Renglon>) =>
    setRenglones((rs) => (rs ? rs.map((r, j) => (j === i ? { ...r, ...cambio } : r)) : rs));

  if (hecho) {
    return (
      <div className="space-y-3">
        <Confirmado
          texto={
            hecho.procesados === 1
              ? `Salió 1 producto por ${MOTIVO_COMPROBANTE}.`
              : `Salieron ${hecho.procesados} productos por ${MOTIVO_COMPROBANTE}.`
          }
          onSeguir={reiniciar}
        />
        {hecho.errores.length > 0 && (
          <ul className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            {hecho.errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!renglones && (
        <>
          <div className="max-w-sm">
            <FotoInput
              label="Foto del ticket, remito o factura"
              hint="Entera y sin doblar. Es el documento que más tarda: cerca de un minuto"
              file={foto}
              disabled={scan.procesando}
              onChange={setFoto}
            />
          </div>
          <BotonProcesar
            onClick={() => foto && scan.subir(foto)}
            disabled={!foto}
            procesando={scan.procesando}
          >
            Leer comprobante
          </BotonProcesar>
          <Progreso scan={scan} etiqueta="Comprobante" />
          <ErrorScan scan={scan} />
        </>
      )}

      {renglones && scan.resultado && (
        <>
          <CabeceraComprobante resultado={scan.resultado} />

          <p className="rounded-xl bg-canvas px-4 py-2.5 text-sm text-muted">
            El motivo de estas salidas queda asentado como{" "}
            <span className="font-medium text-ink">{MOTIVO_COMPROBANTE}</span>.
          </p>

          {sinIdentificar > 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                No se pudo cargar {sinIdentificar}{" "}
                {sinIdentificar === 1 ? "producto" : "productos"}: no encontramos en tu inventario
                ningún producto con ese nombre. Podés cargar{" "}
                {sinIdentificar === 1 ? "esa salida" : "cada una"} a mano con el botón de su renglón.
              </span>
            </p>
          )}

          {renglones.map((r, i) => (
            <Card key={i} className={r.elegido === null ? "opacity-60" : ""}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Renglón leído
                  </p>
                  <p className="font-mono text-sm text-ink">«{r.draft.texto_leido}»</p>
                </div>
                {r.elegido !== null && (
                  <label className="flex shrink-0 items-center gap-2 text-sm text-muted">
                    <input
                      type="checkbox"
                      checked={r.incluir}
                      onChange={(e) => editar(i, { incluir: e.target.checked })}
                      className="h-4 w-4"
                    />
                    Descargar
                  </label>
                )}
              </div>

              <MatchPicker
                draft={r.draft}
                elegido={r.elegido}
                contexto="salida"
                onElegir={(m) => editar(i, { elegido: m?.id ?? null, nombre: m?.nombre ?? r.nombre })}
              />

              {r.elegido === null && (
                <button
                  type="button"
                  onClick={() =>
                    irASalidaManual({
                      busqueda: r.draft.texto_leido ?? r.nombre,
                      nota: scan.resultado?.comprobante?.comercio
                        ? `${MOTIVO_COMPROBANTE} - ${scan.resultado.comprobante.comercio}`
                        : MOTIVO_COMPROBANTE,
                    })
                  }
                  className="mt-3 rounded-xl border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-canvas"
                >
                  Cargar esta salida a mano
                </button>
              )}

              {r.elegido !== null && (
                <div className="mt-3 max-w-xs">
                  <label className="mb-1 block text-sm font-medium text-ink">Unidades a sacar</label>
                  <input
                    type="number"
                    min={1}
                    value={r.cantidad}
                    onChange={(e) => editar(i, { cantidad: e.target.value })}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              )}
            </Card>
          ))}

          {confirmar.isError && (
            <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
              {detalle(confirmar.error, "No se pudieron registrar las salidas.")}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => confirmar.mutate()}
              disabled={confirmar.isPending || descargables.length === 0}
              className="rounded-xl bg-danger px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {confirmar.isPending
                ? "Registrando…"
                : `Confirmar salida (${descargables.length} ${
                    descargables.length === 1 ? "producto" : "productos"
                  })`}
            </button>
            <button
              type="button"
              onClick={reiniciar}
              className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
            >
              Descartar y escanear otro
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── selector de subflujo ───────────────────────────────────────────────── */

type Modo = "producto" | "comprobante" | "codigo";

const MODOS: Record<"entrada" | "salida", { value: Modo; label: string; hint: string; icon: typeof Camera }[]> = {
  entrada: [
    {
      value: "producto",
      label: "Imagen del producto",
      hint: "El envase o su etiqueta. Podés sumar la fecha de vencimiento y el código",
      icon: Camera,
    },
    {
      value: "comprobante",
      label: "Ticket, remito o factura",
      hint: "Carga todos los productos de una compra de una sola vez",
      icon: FileText,
    },
    {
      value: "codigo",
      label: "Código de barras",
      hint: "Lo más rápido si el producto ya lo tenés cargado con su código",
      icon: Barcode,
    },
  ],
  salida: [
    {
      value: "codigo",
      label: "Código de barras",
      hint: "Escaneás el envase y elegís cuántas unidades salen",
      icon: Barcode,
    },
    {
      value: "comprobante",
      label: "Ticket, remito o factura",
      hint: "Descarga lo que figura en el documento, con motivo Documento Comercial",
      icon: FileText,
    },
  ],
};

export default function Procesamiento({
  direction,
  irAManual,
  irASalidaManual,
}: {
  direction: "entrada" | "salida";
  irAManual: (p: Prefill) => void;
  irASalidaManual: (p: SalidaPrefill) => void;
}) {
  const modos = MODOS[direction];
  const [modo, setModo] = useState<Modo>(modos[0].value);
  const [opciones, setOpciones] = useState<Opciones>({ categorias: [], ubicaciones: [], marcas: [] });

  // Si se cambia de entrada a salida, el subflujo elegido puede no existir del
  // otro lado: no hay salida por imagen de producto.
  useEffect(() => {
    if (!modos.some((m) => m.value === modo)) setModo(modos[0].value);
  }, [modos, modo]);

  useEffect(() => {
    api
      .get<Opciones>("/me/products/filters/options")
      .then(({ data }) => setOpciones(data))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-ink">
          Sacale una foto a lo que quieras {direction === "entrada" ? "cargar" : "descargar"} y el
          sistema la lee por vos: reconoce el producto, lo busca entre los que ya tenés y te deja{" "}
          <span className="font-medium">revisar y corregir todo</span> antes de confirmar. Nada se
          guarda hasta que lo confirmás.
        </p>
        <p className="mt-2 text-sm text-muted">
          Las fotos <span className="font-medium text-ink">no se almacenan</span>: se procesan y se
          descartan. De cada lectura queda sólo un registro breve en la auditoría del módulo.
        </p>
      </Card>

      <div className={`grid gap-3 ${modos.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        {modos.map((m) => {
          const Icon = m.icon;
          const activo = modo === m.value;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => setModo(m.value)}
              className={`rounded-xl border p-4 text-left transition ${
                activo ? "border-primary bg-primary/5" : "border-line hover:border-primary/50 hover:bg-canvas"
              }`}
            >
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                <Icon size={16} className={activo ? "text-primary" : "text-muted"} />
                {m.label}
              </span>
              <span className="mt-1 block text-xs text-muted">{m.hint}</span>
            </button>
          );
        })}
      </div>

      <Card>
        {direction === "entrada" ? (
          modo === "producto" ? (
            <EntradaProducto opciones={opciones} setOpciones={setOpciones} />
          ) : modo === "comprobante" ? (
            <EntradaComprobante opciones={opciones} setOpciones={setOpciones} />
          ) : (
            <EntradaCodigo irAManual={irAManual} />
          )
        ) : modo === "codigo" ? (
          <SalidaCodigo />
        ) : (
          <SalidaComprobante irASalidaManual={irASalidaManual} />
        )}
      </Card>
    </div>
  );
}
