import type { AlertOut } from "@/lib/types";
import { alertDetails, alertTitle, LEVEL_TONES } from "@/lib/alertInfo";
import { formatDate } from "@/lib/format";
import { Modal } from "@/components/ui";
import ProductImage from "@/components/ProductImage";

/**
 * «Detalle de Alerta»: el producto con su imagen, el motivo con el color de su nivel y la explicación completa. El cuerpo
 * se desplaza si la explicación es larga.
 */
export default function AlertDetailModal({ alert, onClose }: { alert: AlertOut; onClose: () => void }) {
  const tone = LEVEL_TONES[alert.level];
  return (
    <Modal title="Detalle de Alerta" onClose={onClose} testId="alert-detail" width="max-w-lg">
      <div className="flex items-center gap-4">
        <ProductImage url={alert.image_url} alt={alert.product_name} className="h-24 w-24 shrink-0 !rounded-2xl" />
        <div className="min-w-0">
          <h3 className="break-words text-lg font-bold text-ink">{alert.product_name}</h3>
          <p className="text-sm text-muted">{[alert.product_brand, alert.product_category].filter(Boolean).join(" · ")}</p>
          {alert.predictive && (
            <span className="mt-1 inline-block rounded-full bg-primaryDark px-2.5 py-0.5 text-[11px] font-semibold text-white">
              Predicción
            </span>
          )}
        </div>
      </div>

      <div
        data-testid="alert-detail-reason"
        className="mt-4 rounded-2xl px-4 py-3 text-sm font-semibold"
        style={{ backgroundColor: tone.background, color: tone.text }}
      >
        {alertTitle(alert)}
      </div>

      <div data-testid="alert-detail-text" className="mt-4 space-y-2 text-sm text-ink">
        {alertDetails(alert).map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-2 text-sm">
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
            <dd>{alert.product_location}</dd>
          </div>
        )}
      </dl>
    </Modal>
  );
}
