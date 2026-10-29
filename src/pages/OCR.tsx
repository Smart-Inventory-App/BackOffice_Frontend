import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Barcode,
  CalendarClock,
  CheckCircle,
  Cpu,
  Eraser,
  FileText,
  RefreshCw,
  ScanLine,
  Tag,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import type {
  OCRAuditEntry,
  OCRDocType,
  OCREngineStatus,
  OCRResult,
  OCRServiceStatus,
  OCRStats,
  OCRSyncResponse,
} from "@/lib/types";
import type { Paginated } from "@/lib/types";
import { Badge, Card, PageHeader, StatCard, Spinner } from "@/components/ui";
import FilterDropdown from "@/components/FilterDropdown";
import { PeriodPicker } from "@/components/TrendsPanel";
import type { TrendPeriod } from "@/lib/trends";
import Pagination from "@/components/Pagination";
import { apiErrorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";

// La auditoría muestra 10 escaneos por página, todos juntos
const PAGE_SIZE = 10;

const DOC_TYPES: { value: OCRDocType; label: string; hint: string; icon: typeof Tag }[] = [
  {
    value: "product_label",
    label: "Etiqueta",
    hint: "Nombre, marca y detalles del envase",
    icon: Tag,
  },
  {
    value: "expiry_date",
    label: "Vencimiento",
    hint: "Sólo el sello de fecha, con otra preparación de imagen",
    icon: CalendarClock,
  },
  {
    value: "receipt",
    label: "Comprobante",
    hint: "Ticket, remito o factura: renglones, fecha y total",
    icon: FileText,
  },
  {
    value: "barcode",
    label: "Código de barras",
    hint: "No pasa por ningún motor: lo decodifica ZBar",
    icon: Barcode,
  },
];

const DOC_LABELS: Record<OCRDocType, string> = {
  product_label: "Etiqueta",
  expiry_date: "Vencimiento",
  receipt: "Comprobante",
  barcode: "Código de barras",
};

const ENGINES = [
  { value: "", label: "El configurado (híbrido)" },
  { value: "tesseract", label: "Tesseract" },
  { value: "paddleocr", label: "PaddleOCR" },
  { value: "hybrid", label: "Híbrido" },
];

const ENGINE_NAMES: Record<string, string> = { hybrid: "híbrido" };

const CHECK_LABELS: Record<string, string> = {
  redis: "Redis (cola y caché)",
  engine: "Motor configurado",
  barcode: "Decodificador de códigos",
};


/** Milisegundos en la unidad que se lee de un vistazo. */
function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

function formatPct(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return `${(valor * 100).toFixed(1)} %`;
}

/**
 * La confianza, dibujada.
 *
 * El número solo no dice nada a quien mira; el color sí: por debajo de 0,60 la
 * lectura hay que revisarla sí o sí, y entre 0,60 y 0,85 conviene mirarla.
 */
function ConfidenceBar({ value, align = "start" }: { value: number; align?: "start" | "center" | "end" }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = value >= 0.85 ? "bg-primary" : value >= 0.6 ? "bg-amber-400" : "bg-danger";
  const justify = { start: "justify-start", center: "justify-center", end: "justify-end" }[align];
  return (
    <div className={`flex items-center gap-2 ${justify}`}>
      <div className="h-2 w-20 overflow-hidden rounded-full bg-canvas">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right text-xs tabular-nums text-muted">{pct.toFixed(0)} %</span>
    </div>
  );
}

function OkIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle size={16} className="text-primary" />
  ) : (
    <XCircle size={16} className="text-danger" />
  );
}

/* ── estado del módulo ─────────────────────────────────────────────────── */

function EngineCard({ engine }: { engine: OCREngineStatus }) {
  const replicas = engine.replicas.length || 1;
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 font-semibold text-ink">
          <Cpu size={16} className="text-muted" />
          {engine.name}
        </span>
        <Badge tone={engine.available ? "ok" : "off"}>
          {engine.available ? "Disponible" : "Caído"}
        </Badge>
      </div>
      <p className="mt-2 text-xs text-muted">versión {engine.version || "desconocida"}</p>
      <p className="mt-1 text-xs text-muted">
        {replicas === 1 ? "1 instancia" : `${replicas} instancias (se reparten por turno)`}
      </p>
      <ul className="mt-2 space-y-0.5">
        {(engine.replicas.length ? engine.replicas : [engine.url]).map((url) => (
          <li key={url} className="truncate font-mono text-[11px] text-muted">
            {url}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ServiceStatus() {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["ocr-status"],
    queryFn: async () => (await api.get<OCRServiceStatus>("/admin/ocr/status")).data,
    refetchInterval: 30_000,
  });

  const purge = useMutation({
    mutationFn: async () => (await api.post<{ purged: number }>("/admin/ocr/temp/purge")).data,
  });

  if (isLoading) return <Spinner />;

  const checks = (data?.checks?.checks as Record<string, boolean> | undefined) ?? {};
  const engineName = (data?.checks?.engine_name as string | undefined) ?? "—";

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-ink">Estado del módulo</h2>
          <Badge tone={data?.available ? "ok" : "off"}>
            {data?.available ? "Operativo" : "No disponible"}
          </Badge>
          <span className="text-xs text-muted">motor por defecto: {ENGINE_NAMES[engineName] ?? engineName}</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["ocr-status"] })}
            className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-1.5 text-sm font-medium text-muted hover:bg-canvas"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} /> Actualizar
          </button>
          <button
            type="button"
            onClick={() => purge.mutate()}
            disabled={purge.isPending}
            className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-1.5 text-sm font-medium text-muted hover:bg-canvas disabled:opacity-50"
          >
            <Eraser size={14} /> Limpiar temporales
          </button>
        </div>
      </div>

      {purge.isSuccess && (
        <p className="mb-4 text-sm text-primaryDark">
          {purge.data.purged === 0
            ? "No había imágenes temporales sin descartar."
            : `Se borraron ${purge.data.purged} imágenes que habían quedado sin descartar.`}
        </p>
      )}

      {!data?.available && (
        <p className="mb-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
          El coordinador no responde o alguno de sus chequeos está en rojo. Mientras tanto, los
          escaneos de los usuarios van a fallar.
        </p>
      )}

      <div className="mb-5 flex flex-wrap gap-4">
        {Object.entries(checks).map(([name, ok]) => (
          <span key={name} className="inline-flex items-center gap-2 text-sm text-ink">
            <OkIcon ok={Boolean(ok)} /> {CHECK_LABELS[name] ?? name}
          </span>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(data?.engines ?? []).map((engine) => (
          <EngineCard key={engine.name} engine={engine} />
        ))}
      </div>
      {(data?.engines ?? []).length === 0 && (
        <p className="text-sm text-muted">No se pudo consultar a los motores.</p>
      )}
    </Card>
  );
}

/* ── cómo viene funcionando ────────────────────────────────────────────── */

function Stats({ dias, onDiasChange }: { dias: TrendPeriod; onDiasChange: (d: TrendPeriod) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["ocr-stats", dias],
    queryFn: async () => (await api.get<OCRStats>("/admin/ocr/stats", { params: { dias } })).data,
    placeholderData: keepPreviousData,
  });

  if (isLoading) return <Spinner />;

  const total = data?.ejecuciones ?? 0;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Cómo viene funcionando</h2>
        <div data-testid="ocr-period-picker" className="[&>div]:mb-0">
          <PeriodPicker period={dias} onChange={onDiasChange} />
        </div>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ejecuciones" value={total} hint={`de ${data?.usuarios ?? 0} usuarios`} />
        <StatCard
          label="Fallidas"
          value={data?.fallidas ?? 0}
          accent={data?.fallidas ? "danger" : "muted"}
          hint={total ? `${(((data?.exitosas ?? 0) / total) * 100).toFixed(0)} % terminó bien` : "sin datos"}
        />
        <StatCard
          label="Tiempo promedio"
          value={formatMs(data?.ms_promedio)}
          accent="primaryDark"
          hint="de punta a punta, dentro del módulo"
        />
        <StatCard
          label="Confianza promedio"
          value={formatPct(data?.confianza_promedio)}
          accent="primaryDark"
          hint="lo que el módulo dice de sus lecturas"
        />
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-line text-center text-xs uppercase tracking-wide text-muted">
              <th className="px-5 py-3 text-left">Tipo de documento</th>
              <th className="px-5 py-3">Ejecuciones</th>
              <th className="px-5 py-3">Fallidas</th>
              <th className="px-5 py-3">Tiempo promedio</th>
              <th className="px-5 py-3">Peor tiempo</th>
              <th className="px-5 py-3 text-right">Confianza</th>
            </tr>
          </thead>
          <tbody>
            {(data?.por_tipo ?? []).map((t) => (
              <tr key={t.doc_type} className="border-b border-line/60 last:border-0">
                <td className="px-5 py-3 font-medium text-ink">{DOC_LABELS[t.doc_type] ?? t.doc_type}</td>
                <td className="px-5 py-3 text-center tabular-nums">{t.ejecuciones}</td>
                <td className={`px-5 py-3 text-center tabular-nums ${t.fallidas ? "text-danger" : "text-muted"}`}>
                  {t.fallidas}
                </td>
                <td className="px-5 py-3 text-center tabular-nums">{formatMs(t.ms_promedio)}</td>
                <td className="px-5 py-3 text-center tabular-nums text-muted">{formatMs(t.ms_maximo)}</td>
                <td className="px-5 py-3 text-right">
                  {t.confianza_promedio !== null ? <ConfidenceBar value={t.confianza_promedio} align="end" /> : "—"}
                </td>
              </tr>
            ))}
            {(data?.por_tipo ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-muted">
                  Todavía no se ejecutó ningún escaneo en este período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

    </section>
  );
}

/* ── probar el módulo ──────────────────────────────────────────────────── */

function ReadingDetail({ result, docType }: { result: OCRResult; docType: OCRDocType }) {
  const fields = Object.entries(result.fields).filter(([, f]) => f.value !== null && f.value !== "");

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge tone={result.needs_review ? "warn" : "ok"}>
          {result.needs_review ? "Necesita revisión" : "Lectura confiable"}
        </Badge>
        <span className="text-muted">
          motor <span className="font-medium text-ink">{result.engine || "—"}</span>
        </span>
        <span className="text-muted">
          en <span className="font-medium text-ink">{formatMs(result.processing_ms)}</span>
        </span>
        <span className="text-muted">
          {result.attempts} {result.attempts === 1 ? "intento" : "intentos"}
          {result.rotation ? `, giro ${result.rotation}°` : ""}
        </span>
        <span className="inline-flex items-center gap-2 text-muted">
          confianza del documento <ConfidenceBar value={result.document_confidence} />
        </span>
      </div>

      {result.warnings.length > 0 && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="mb-1 inline-flex items-center gap-2 font-medium">
            <AlertTriangle size={14} /> Advertencias del procesamiento
          </p>
          <ul className="list-inside list-disc">
            {result.warnings.map((w) => (
              <li key={w} className="font-mono text-xs">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {docType === "receipt" ? (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-canvas">
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2">Renglón leído</th>
                <th className="px-4 py-2">Confianza</th>
                <th className="px-4 py-2 text-right">Cantidad</th>
                <th className="px-4 py-2">Confianza</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((item, i) => (
                <tr key={i} className="border-t border-line/60">
                  <td className="px-4 py-2 text-ink">{String(item.nombre_producto.value ?? "—")}</td>
                  <td className="px-4 py-2">
                    <ConfidenceBar value={item.nombre_producto.confidence} />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {String(item.cantidad.value ?? "—")}
                  </td>
                  <td className="px-4 py-2">
                    <ConfidenceBar value={item.cantidad.confidence} />
                  </td>
                </tr>
              ))}
              {result.items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted">
                    No se reconoció ningún renglón.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-canvas">
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2">Campo</th>
              <th className="px-4 py-2">Valor leído</th>
              <th className="px-4 py-2">Confianza</th>
            </tr>
          </thead>
          <tbody>
            {fields.map(([name, field]) => (
              <tr key={name} className="border-t border-line/60">
                <td className="px-4 py-2 font-mono text-xs text-muted">{name}</td>
                <td className="px-4 py-2 text-ink">{String(field.value)}</td>
                <td className="px-4 py-2">
                  <ConfidenceBar value={field.confidence} />
                </td>
              </tr>
            ))}
            {fields.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted">
                  No se pudo extraer ningún campo de esta foto.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
          Texto reconocido
        </p>
        <p className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-canvas px-4 py-3 font-mono text-xs text-ink">
          {result.texto_legible || "(vacío)"}
        </p>
      </div>
    </div>
  );
}

function Playground({ onScanned }: { onScanned: () => void }) {
  const [docType, setDocType] = useState<OCRDocType>("product_label");
  const [engine, setEngine] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // La vista previa vive sólo en el navegador y se libera al cambiar de foto:
  // ni siquiera acá la imagen queda dando vueltas.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const scan = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("file", file as File);
      form.append("doc_type", docType);
      if (engine) form.append("engine", engine);
      const { data } = await api.post<OCRSyncResponse>("/admin/ocr/scan", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return data;
    },
    onSuccess: onScanned,
  });

  const elegido = DOC_TYPES.find((d) => d.value === docType)!;

  return (
    <Card>
      <h2 className="text-lg font-semibold text-ink">Probar el módulo</h2>
      <p className="mt-1 text-sm text-muted">
        Subí una foto y mirá exactamente qué leyó: campo por campo, con su confianza, qué motor
        ganó y cuánto tardó. <strong className="font-bold text-ink">La foto no se guarda en ningún lado.</strong>
      </p>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {DOC_TYPES.map((d) => {
          const Icon = d.icon;
          const activo = docType === d.value;
          return (
            <button
              key={d.value}
              type="button"
              onClick={() => setDocType(d.value)}
              className={`rounded-xl border p-3 text-left transition ${
                activo
                  ? "border-primary bg-primary/5"
                  : "border-line hover:border-primary/50 hover:bg-canvas"
              }`}
            >
              <span className="inline-flex items-center gap-2 text-sm font-medium text-ink">
                <Icon size={16} className={activo ? "text-primary" : "text-muted"} />
                {d.label}
              </span>
              <span className="mt-1 block text-xs text-muted">{d.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-line px-5 py-3 text-sm font-medium text-ink transition hover:border-primary hover:bg-primary/5">
          <UploadCloud size={20} className="text-muted" />
          {file ? file.name : "Elegí una foto"}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              scan.reset();
            }}
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-muted">
          Motor
          <select
            value={engine}
            onChange={(e) => setEngine(e.target.value)}
            disabled={docType === "barcode"}
            className="rounded-xl border border-line px-3 py-2 text-sm text-ink disabled:opacity-50"
          >
            {ENGINES.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => scan.mutate()}
          disabled={!file || scan.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primaryDark disabled:opacity-50"
        >
          <ScanLine size={16} />
          {scan.isPending ? "Procesando…" : "Escanear"}
        </button>

        {file && (
          <button
            type="button"
            onClick={() => {
              setFile(null);
              scan.reset();
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas"
          >
            Limpiar
          </button>
        )}
      </div>

      {docType === "barcode" && (
        <p className="mt-2 text-xs text-muted">
          Un código de barras no pasa por ningún motor OCR: no se lee reconociendo caracteres sino
          decodificando la simbología, así que elegir motor no cambia nada.
        </p>
      )}

      {preview && (
        <div className="mt-4 flex items-start gap-4">
          <img
            src={preview}
            alt="Foto a escanear"
            className="max-h-48 rounded-xl border border-line object-contain"
          />
          {scan.isPending && (
            <p className="text-sm text-muted">
              Un comprobante puede tardar cerca de un minuto: se prueban varios giros y filtros
              hasta dar con la lectura buena.
            </p>
          )}
        </div>
      )}

      {scan.isError && (
        <p className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
          {apiErrorMessage(scan.error, "No se pudo procesar la foto.")}
        </p>
      )}

      {scan.data && <ReadingDetail result={scan.data.result} docType={scan.data.doc_type} />}
    </Card>
  );
}

/* ── auditoría ─────────────────────────────────────────────────────────── */

function OrigenBadge({ origen }: { origen: string }) {
  if (origen === "panel") return <Badge tone="neutral">Panel</Badge>;
  // «App», en celeste verdoso
  return (
    <span
      data-testid="origen-app"
      className="inline-flex items-center rounded-full bg-[#CDEFF0] px-2.5 py-0.5 text-xs font-medium text-[#0F6E78]"
    >
      App
    </span>
  );
}

function Audit() {
  const [user, setUser] = useState("");
  const [docType, setDocType] = useState<"" | OCRDocType>("");
  const [origen, setOrigen] = useState<"" | "app" | "panel">("");
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [user, docType, origen]);

  const { data, isLoading } = useQuery({
    queryKey: ["ocr-audit", user, docType, origen, page],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      };
      if (user) params.user = user;
      if (docType) params.doc_type = docType;
      if (origen) params.origen = origen;
      return (await api.get<Paginated<OCRAuditEntry>>("/admin/ocr/audit", { params })).data;
    },
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];

  return (
    <section>
      <h2 className="text-lg font-semibold text-ink">Auditoría de escaneos</h2>
      <p className="mt-1 text-sm text-muted">
        Un renglón por ejecución, con quién la pidió y qué salió. Es lo único que queda de cada
        escaneo: las fotos se descartan apenas termina el procesamiento, así que el resumen viene
        recortado.
      </p>

      {/* El buscador y los dos filtros ocupan todo el ancho: el último termina donde termina la lista */}
      <div data-testid="ocr-audit-filters" className="my-4 flex flex-wrap items-center gap-3">
        <input
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder="Filtrar por usuario"
          className="h-10 min-w-0 flex-1 basis-64 rounded-xl border border-line bg-white px-4 text-sm text-ink outline-none placeholder:text-muted focus:border-primary"
        />
        <div className="w-full sm:w-64">
          <FilterDropdown
            label="Tipo de escaneo"
            allLabel="Todos los tipos"
            value={docType}
            options={DOC_TYPES.map((d) => ({ value: d.value, label: d.label }))}
            onChange={(v) => setDocType(v as "" | OCRDocType)}
          />
        </div>
        <div className="w-full sm:w-64">
          <FilterDropdown
            label="Origen"
            allLabel="Todos los orígenes"
            value={origen}
            options={[
              { value: "app", label: "App" },
              { value: "panel", label: "Panel" },
            ]}
            onChange={(v) => setOrigen(v as "" | "app" | "panel")}
          />
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <Card className="p-0">
          {/* Los 10 escaneos de la página, todos juntos y sin desplazarse */}
          <div data-testid="ocr-audit-list" className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white">
                <tr className="border-b border-line text-center text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3">Usuario</th>
                  <th className="px-3 py-3">Origen</th>
                  <th className="px-3 py-3">Tipo de escaneo</th>
                  <th className="px-3 py-3">Motor</th>
                  <th className="px-3 py-3">Tiempo</th>
                  <th className="px-3 py-3">Confianza</th>
                  <th className="px-3 py-3">Qué se leyó</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id} className="border-b border-line/60 text-center last:border-0 hover:bg-canvas/60">
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{formatDateTime(e.created_at)}</td>
                    <td className="px-3 py-3 text-ink">{e.user_email}</td>
                    <td className="px-3 py-3">
                      <OrigenBadge origen={e.origen} />
                    </td>
                    <td className="px-3 py-3">
                      {e.status === "failed" ? (
                        <Badge tone="off">{DOC_LABELS[e.doc_type] ?? e.doc_type} · falló</Badge>
                      ) : (
                        <span className="text-ink">{DOC_LABELS[e.doc_type] ?? e.doc_type}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-muted">{e.engine ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">{formatMs(e.processing_ms)}</td>
                    <td className="px-3 py-3">
                      {e.confianza !== null ? <ConfidenceBar value={e.confianza} align="center" /> : "—"}
                    </td>
                    <td className="max-w-xs truncate px-3 py-3 text-muted" title={e.resumen ?? ""}>
                      {e.resumen ?? "—"}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-muted">
                      No hay escaneos registrados con estos filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={data?.total ?? 0}
            onPageChange={setPage}
          />
        </Card>
      )}
    </section>
  );
}

/* ── página ────────────────────────────────────────────────────────────── */

export default function OCR() {
  const queryClient = useQueryClient();
  const [dias, setDias] = useState<TrendPeriod>(7);

  return (
    <div className="space-y-8">
      <PageHeader
        title="OCR"
        subtitle="Estado del módulo de lectura de imágenes, cómo viene funcionando y qué escaneó cada usuario"
      />

      <ServiceStatus />

      <Stats dias={dias} onDiasChange={setDias} />

      <Playground
        onScanned={() => {
          queryClient.invalidateQueries({ queryKey: ["ocr-audit"] });
          queryClient.invalidateQueries({ queryKey: ["ocr-stats"] });
        }}
      />

      <Audit />
    </div>
  );
}
