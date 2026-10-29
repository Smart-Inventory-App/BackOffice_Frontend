import { ArrowRight } from "lucide-react";
import type { StockChange } from "@/lib/types";
import { formatDateTime, truncate } from "@/lib/format";
import ProductImage from "@/components/ProductImage";

const KIND_LABEL: Record<StockChange["kind"], string> = {
  entrada: "Entrada de producto",
  salida: "Salida de producto",
  modificacion: "Modificación del producto",
};

const KIND_TONE: Record<StockChange["kind"], string> = {
  entrada: "bg-primary/15 text-tealInk",
  salida: "bg-critical/15 text-criticalInk",
  modificacion: "bg-primaryDark/10 text-primaryDark",
};

/** Un cambio de stock: el motivo arriba, el producto, el stock antes y después, y la fecha y hora argentinas. */
export default function ChangeRow({ change, className = "" }: { change: StockChange; className?: string }) {
  const { producto } = change;
  return (
    <li data-testid={`change-${change.id}`} className={`rounded-2xl border border-line/60 bg-white p-3 shadow-card ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${KIND_TONE[change.kind]}`}>
          {KIND_LABEL[change.kind]}
        </span>
        <span className="text-[11px] text-muted">{formatDateTime(change.occurred_at)}</span>
      </div>
      <div className="flex items-center gap-3">
        <ProductImage url={producto.imagen_url} alt={producto.nombre} className="h-12 w-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink" title={producto.nombre}>
            {truncate(producto.nombre)}
          </p>
          <p className="truncate text-xs text-muted">{[producto.marca, producto.categoria].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="shrink-0 text-right text-sm" data-testid={`change-${change.id}-stock`}>
          <span className="text-muted">{change.stock_before}</span>
          <ArrowRight size={14} className="mx-1 inline text-muted" />
          <span className="font-bold text-ink">{change.stock_after}</span>
          <p className="text-[11px] text-muted">stock</p>
        </div>
      </div>
    </li>
  );
}
