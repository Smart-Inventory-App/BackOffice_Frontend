import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { ImageOff } from "lucide-react";
import ImageViewer from "@/components/ImageViewer";

/**
 * La imagen de un producto. Siempre que hay una, se puede tocar para verla en grande (con zoom) en el centro de la pantalla.
 * Va dentro de filas y tarjetas que también se tocan, así que el clic no llega a la fila: solo abre la imagen.
 */
export default function ProductImage({
  url,
  alt,
  className = "h-12 w-12",
  zoomable = true,
}: {
  url: string | null;
  alt: string;
  className?: string;
  zoomable?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  if (!url || failed) {
    return (
      <div className={`flex items-center justify-center rounded-lg bg-canvas text-muted ${className}`}>
        <ImageOff size={18} />
      </div>
    );
  }

  const image = (
    <img
      src={url}
      alt={alt}
      onError={() => setFailed(true)}
      className={`rounded-lg border border-line object-cover ${className}`}
    />
  );
  if (!zoomable) return image;

  const show = (event: MouseEvent | KeyboardEvent) => {
    event.stopPropagation();
    event.preventDefault();
    setOpen(true);
  };

  return (
    <>
      {/* No es un <button> porque casi siempre está dentro de uno (una fila, una alerta) */}
      <span
        role="button"
        tabIndex={0}
        aria-label={`Ampliar la imagen de ${alt}`}
        data-testid="product-image-zoom"
        onClick={show}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") show(event);
        }}
        className="inline-flex shrink-0 cursor-zoom-in rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {image}
      </span>
      {/* El visor se dibuja aparte, pero para React sigue dentro de la fila: sus clics (cerrar, tocar el fondo) no tienen que llegar a ella */}
      {open && (
        <span onClick={(event) => event.stopPropagation()}>
          <ImageViewer url={url} alt={alt} onClose={() => setOpen(false)} />
        </span>
      )}
    </>
  );
}
