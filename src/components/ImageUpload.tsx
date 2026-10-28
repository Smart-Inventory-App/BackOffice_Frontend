import { useRef, useState, type DragEvent } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const IMAGE_MAX_MB = 10;

/**
 * La imagen de un producto, que se sube como **archivo adjunto** (no como un enlace): se elige o se arrastra una foto, se
 * ve la vista previa y el archivo viaja al servicio de almacenamiento a través de `POST /me/products/image`, que devuelve
 * la dirección que se guarda en el producto. Se acepta JPG, PNG o WebP de hasta 10 MB.
 */
export default function ImageUpload({
  value,
  onChange,
  label = "Imagen del producto",
}: {
  /** La dirección de la imagen ya subida (o vacío). */
  value: string;
  onChange: (url: string) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!IMAGE_TYPES.includes(file.type)) {
      setError("La imagen tiene que ser JPG, PNG o WebP.");
      return;
    }
    if (file.size > IMAGE_MAX_MB * 1024 * 1024) {
      setError(`La imagen pesa más de ${IMAGE_MAX_MB} MB.`);
      return;
    }
    setPreview(URL.createObjectURL(file));
    setFileName(file.name);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post<{ url: string }>("/me/products/image", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange(data.url);
    } catch (err: any) {
      setPreview(null);
      setFileName(null);
      setError(apiErrorMessage(err, "No se pudo subir la imagen."));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = () => {
    setPreview(null);
    setFileName(null);
    setError(null);
    onChange("");
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    upload(event.dataTransfer.files?.[0]);
  };

  const shown = preview ?? (value || null);

  return (
    <div>
      <p className="mb-1 block text-sm font-medium text-ink">{label}</p>
      <div
        data-testid="image-upload"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex items-center gap-4 rounded-2xl border-2 border-dashed p-3 transition ${
          dragging ? "border-primary bg-primary/5" : "border-[#D9D9D9] bg-white"
        }`}
      >
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-canvas text-muted">
          {shown ? (
            <img data-testid="image-upload-preview" src={shown} alt="Vista previa de la imagen" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus size={26} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {uploading ? (
            <p className="inline-flex items-center gap-2 text-sm text-muted" role="status">
              <Loader2 size={16} className="animate-spin" /> Subiendo imagen…
            </p>
          ) : (
            <>
              <p className="truncate text-sm text-ink" title={fileName ?? undefined}>
                {fileName ?? (value ? "Imagen cargada" : "Arrastrá una foto o elegila desde tu equipo")}
              </p>
              <p className="text-xs text-muted">JPG, PNG o WebP, hasta {IMAGE_MAX_MB} MB.</p>
            </>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-primaryDark transition hover:bg-primary/10 disabled:opacity-50"
            >
              {shown ? "Cambiar imagen" : "Elegir imagen"}
            </button>
            {shown && !uploading && (
              <button
                type="button"
                onClick={remove}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-critical transition hover:bg-critical/10"
              >
                <Trash2 size={13} /> Quitar
              </button>
            )}
          </div>
        </div>
        <input
          ref={inputRef}
          data-testid="image-upload-input"
          type="file"
          accept={IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(e) => upload(e.target.files?.[0])}
        />
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
