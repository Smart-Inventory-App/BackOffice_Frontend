import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, ScanLine } from "lucide-react";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import ProductImage from "@/components/ProductImage";
import type { OCRDocType, ScanState } from "@/lib/types";

/** Cada cuánto se le pregunta al módulo si ya terminó. */
const POLL_MS = 1500;

const OCR_NO_DISPONIBLE =
  "El módulo de OCR no está disponible en este momento. Probá de nuevo en unos minutos o cargalo a mano.";

export function detalle(err: any, fallback: string): string {
  // Un 502/503/504 trae el error de red crudo del gateway («[Errno -2] Name or
  // service not known»): al usuario sólo le sirve saber que el módulo no responde.
  if ([502, 503, 504].includes(err?.response?.status)) return OCR_NO_DISPONIBLE;
  const mensaje = apiErrorMessage(err, fallback);
  // El coordinador calcula cuánto falta para recuperar el cupo: sin ese dato,
  // «superaste el límite» no dice cuándo volver a intentar.
  const espera = Number(err?.response?.headers?.["retry-after"]);
  if (err?.response?.status === 429 && espera > 0) {
    return `${mensaje} Podés volver a intentar en ${formatEspera(espera).replace("~", "")}.`;
  }
  return mensaje;
}

export function unidades(n: number | string): string {
  return Number(n) === 1 ? "1 unidad" : `${n} unidades`;
}

export function formatEspera(segundos: number | null): string {
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
export function useScan(docType: OCRDocType) {
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
      // Si la consulta falló —el trabajo expiró, no es de este usuario o el
      // módulo se cayó a mitad de camino— seguir preguntando no lo arregla.
      if (query.state.status === "error") return false;
      const estado = query.state.data?.status;
      return estado === "done" || estado === "failed" ? false : POLL_MS;
    },
  });

  const estado = directo ?? consulta.data ?? null;
  const terminado = estado?.status === "done" || estado?.status === "failed";
  // Sin esto, un error al consultar dejaba la pantalla en "procesando…" para
  // siempre y sin decir nada: el trabajo seguía "sin terminar" desde acá.
  const errorConsulta = consulta.isError
    ? detalle(consulta.error, "Se perdió el seguimiento del escaneo. Probá subir la foto de nuevo.")
    : null;

  return {
    estado,
    resultado: estado?.status === "done" ? estado.result : null,
    error: errorSubida ?? errorConsulta ?? (estado?.status === "failed" ? estado.error : null),
    procesando: subida.isPending || (Boolean(jobId) && !terminado && !consulta.isError),
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

export type Scan = ReturnType<typeof useScan>;

export function Progreso({ scan, etiqueta }: { scan: Scan; etiqueta: string }) {
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

export function FotoInput({
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
          <ProductImage url={preview} alt={label} className="h-24 w-24" />
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

export function ErrorScan({ scan }: { scan: Scan }) {
  if (!scan.error) return null;
  return (
    <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
      {scan.error}
    </p>
  );
}

export function BotonProcesar({
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

