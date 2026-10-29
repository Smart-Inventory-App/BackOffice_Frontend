import { useEffect, useRef, useState, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const WHEEL_STEP = 1.15;
// Dos toques seguidos (el segundo sin soltar) y arrastrar: cuánto se agranda por cada 120 px que se aleja el dedo
const DOUBLE_TAP_MS = 350;
const DRAG_PX_PER_DOUBLE = 120;
const MAX_TOUCH_SCALE = 4;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * La imagen de un producto en grande, en el centro de la pantalla pero sin ocuparla toda, con una «X» en la esquina
 * superior derecha para cerrarla (también con Escape o tocando el fondo).
 *
 * - **Con mouse**: la rueda hace zoom, sobre el punto donde está el cursor.
 * - **Desde el celular**: dos toques seguidos, el segundo sin soltar, y arrastrar hacia afuera agranda la imagen; al soltar
 *   vuelve a su tamaño normal.
 */
export default function ImageViewer({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState({ scale: 1, x: 50, y: 50 });
  const [releasing, setReleasing] = useState(false);
  const lastTap = useRef(0);
  const touchZoom = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // La rueda se escucha acá (y no con el onWheel de React) para poder frenar el scroll de la página mientras se hace zoom
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      const x = box.width ? ((event.clientX - box.left) / box.width) * 100 : 50;
      const y = box.height ? ((event.clientY - box.top) / box.height) * 100 : 50;
      setReleasing(false);
      setZoom((current) => ({
        scale: clamp(event.deltaY < 0 ? current.scale * WHEEL_STEP : current.scale / WHEEL_STEP, MIN_SCALE, MAX_SCALE),
        x,
        y,
      }));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const position = (event: TouchEvent) => {
    const box = frame.current?.getBoundingClientRect();
    const touch = event.touches[0];
    return {
      clientX: touch.clientX,
      clientY: touch.clientY,
      x: box && box.width ? ((touch.clientX - box.left) / box.width) * 100 : 50,
      y: box && box.height ? ((touch.clientY - box.top) / box.height) * 100 : 50,
    };
  };

  const onTouchStart = (event: TouchEvent) => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      // El segundo toque de un doble toque: si ahora se arrastra, se hace zoom
      const point = position(event);
      touchZoom.current = { x: point.clientX, y: point.clientY };
      setReleasing(false);
      setZoom({ scale: 1, x: point.x, y: point.y });
    }
    lastTap.current = now;
  };

  const onTouchMove = (event: TouchEvent) => {
    const start = touchZoom.current;
    if (!start) return;
    const touch = event.touches[0];
    const distance = Math.hypot(touch.clientX - start.x, touch.clientY - start.y);
    setZoom((current) => ({ ...current, scale: clamp(1 + distance / DRAG_PX_PER_DOUBLE, MIN_SCALE, MAX_TOUCH_SCALE) }));
  };

  const onTouchEnd = () => {
    if (!touchZoom.current) return;
    // Al soltar, la imagen vuelve a su tamaño normal
    touchZoom.current = null;
    setReleasing(true);
    setZoom((current) => ({ ...current, scale: 1 }));
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div data-testid="image-viewer-backdrop" className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Imagen de ${alt}`}
        className="relative w-full max-w-[min(90vw,640px)] rounded-2xl bg-white p-2 shadow-lift"
      >
        <button
          type="button"
          aria-label="Cerrar imagen"
          data-testid="image-viewer-close"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink shadow-card transition hover:bg-white"
        >
          <X size={20} />
        </button>
        <div
          ref={frame}
          data-testid="image-viewer-frame"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          className="flex max-h-[80vh] touch-none items-center justify-center overflow-hidden rounded-xl bg-canvas"
        >
          <img
            data-testid="image-viewer-image"
            src={url}
            alt={alt}
            draggable={false}
            className={`max-h-[80vh] w-full select-none object-contain ${zoom.scale > 1 ? "cursor-zoom-out" : "cursor-zoom-in"} ${releasing ? "transition-transform duration-200" : ""}`}
            style={{ transform: `scale(${zoom.scale})`, transformOrigin: `${zoom.x}% ${zoom.y}%` }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
