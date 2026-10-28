import type { AlertOut } from "@/lib/types";
import { alertDescription, alertTitle, LEVEL_TONES } from "@/lib/alertInfo";
import ProductImage from "@/components/ProductImage";

/**
 * Una alerta en la lista: fondo blanco, el nivel como una barra de color a la izquierda, el título y una descripción de
 * hasta dos renglones. Las del modelo predictivo llevan la marca «Predicción» fija arriba a la derecha.
 */
export default function AlertRow({ alert, onClick, compact = false }: { alert: AlertOut; onClick: () => void; compact?: boolean }) {
  const tone = LEVEL_TONES[alert.level];
  return (
    <li>
      <button
        type="button"
        data-testid={`alert-item-${alert.key}`}
        onClick={onClick}
        className={`relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-line/60 bg-white py-3 pl-5 pr-3 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-lift ${compact ? "min-h-[88px]" : "h-[116px]"}`}
      >
        <span aria-hidden className="absolute inset-y-0 left-0 w-2" style={{ backgroundColor: tone.border }} />
        {alert.predictive && (
          <span
            data-testid={`alert-prediction-${alert.key}`}
            className="absolute right-3 top-3 rounded-full bg-primaryDark px-2.5 py-0.5 text-[10px] font-semibold text-white"
          >
            Predicción
          </span>
        )}
        <ProductImage url={alert.image_url} alt={alert.product_name} className={`shrink-0 !rounded-xl ${compact ? "h-12 w-12" : "h-16 w-16"}`} />
        <div className="min-w-0 flex-1 pr-16">
          <p className="truncate text-sm font-bold text-ink" title={alert.product_name}>
            {alert.product_name}
          </p>
          <p className="mt-0.5 text-xs font-semibold" style={{ color: tone.text }}>
            {alertTitle(alert)}
          </p>
          <p data-testid={`alert-description-${alert.key}`} className="mt-1 line-clamp-2 text-xs text-muted">
            {alertDescription(alert)}
          </p>
        </div>
      </button>
    </li>
  );
}
