import { AlertTriangle, Clock, TrendingDown } from "lucide-react";
import type { AlertOut } from "@/lib/types";
import { alertDetails, alertTitle, LEVEL_TONES } from "@/lib/alertInfo";
import { formatDate, truncate } from "@/lib/format";
import { Modal } from "@/components/ui";
import ProductImage from "@/components/ProductImage";

const ICONS = { expiry: Clock, stock_low_coverage: TrendingDown, slow_pace: AlertTriangle } as const;

/**
 * «Detalle de Alerta»: el producto con su imagen y, **destacado**, el motivo de la alerta con el color de su nivel y su
 * explicación completa. Los datos del producto que son muy largos se cortan con «...» a los mismos 50 caracteres que en
 * el resto del dashboard (el texto entero queda en el título al pasar el mouse). El cuerpo se desplaza si es largo.
 */
export default function AlertDetailModal({ alert, onClose }: { alert: AlertOut; onClose: () => void }) {
  const tone = LEVEL_TONES[alert.level];
  const Icon = ICONS[alert.type] ?? AlertTriangle;
  const details = alertDetails(alert);
  const brandAndCategory = [alert.product_brand, alert.product_category].filter(Boolean).join(" · ");
  return (
    <Modal title="Detalle de Alerta" onClose={onClose} testId="alert-detail" width="max-w-lg">
      {/* La alerta primero: es lo que la persona vino a ver */}
      <div
        data-testid="alert-detail-reason"
        className="flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5"
        style={{ backgroundColor: tone.background, borderColor: tone.border, color: tone.text }}
      >
        <Icon size={26} className="shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
            {alert.level === "critical" ? "Alerta crítica" : "Advertencia"}
            {alert.predictive ? " · Predicción" : ""}
          </p>
          <p className="text-lg font-medium leading-tight">{alertTitle(alert)}</p>
        </div>
      </div>

      <div
        data-testid="alert-detail-text"
        className="mt-3 space-y-2 rounded-2xl border-l-4 bg-white px-4 py-3 text-[15px] leading-relaxed text-ink shadow-card"
        style={{ borderLeftColor: tone.border }}
      >
        {details.map((paragraph, i) => (
          <p key={i} className={i === 0 ? "font-semibold" : "font-normal"}>
            {paragraph}
          </p>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-4">
        <ProductImage url={alert.image_url} alt={alert.product_name} className="h-20 w-20 shrink-0 !rounded-2xl" />
        <div className="min-w-0">
          <h3 data-testid="alert-detail-name" className="break-words text-base font-bold text-ink" title={alert.product_name}>
            {truncate(alert.product_name)}
          </h3>
          {brandAndCategory && (
            <p data-testid="alert-detail-brand" className="text-sm text-muted" title={brandAndCategory}>
              {truncate(brandAndCategory)}
            </p>
          )}
          {alert.predictive && (
            <span className="mt-1 inline-block rounded-full bg-primaryDark px-2.5 py-0.5 text-[11px] font-semibold text-white">
              Predicción
            </span>
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-canvas px-3 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Stock</dt>
          <dd>{alert.product_stock}</dd>
        </div>
        <div className="rounded-xl bg-canvas px-3 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Vencimiento</dt>
          <dd>{formatDate(alert.product_expiry)}</dd>
        </div>
        {alert.product_location && (
          <div className="col-span-2 rounded-xl bg-canvas px-3 py-2">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Ubicación</dt>
            <dd data-testid="alert-detail-location" title={alert.product_location}>
              {truncate(alert.product_location)}
            </dd>
          </div>
        )}
      </dl>
    </Modal>
  );
}
