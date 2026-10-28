import type { ReactNode } from "react";
import type { MyProduct } from "@/lib/types";
import { formatDate, truncate } from "@/lib/format";
import ProductImage from "@/components/ProductImage";

/** Un producto en una lista, como en la app: imagen, nombre, marca y categoría, stock y vencimiento. */
export default function ProductRow({
  product,
  caption,
  onClick,
  testId,
  right,
}: {
  product: MyProduct;
  /** Un rótulo chico arriba (la fecha de carga, por ejemplo). */
  caption?: string;
  onClick?: () => void;
  testId?: string;
  right?: ReactNode;
}) {
  const body = (
    <>
      {caption && <p className="mb-1.5 text-left text-[11px] text-muted">{caption}</p>}
      <div className="flex items-center gap-3">
        <ProductImage url={product.imagen_url} alt={product.nombre} className="h-14 w-14 shrink-0" />
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate font-semibold text-ink" title={product.nombre}>
            {truncate(product.nombre)}
          </p>
          <p className="truncate text-xs text-muted">{[product.marca, product.categoria].filter(Boolean).join(" · ")}</p>
          {product.vencimiento && <p className="text-xs text-muted">Vence: {formatDate(product.vencimiento)}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-bold text-primary">{product.stock}</p>
          <p className="text-[11px] text-muted">en stock</p>
        </div>
        {right}
      </div>
    </>
  );
  const classes = "block w-full rounded-2xl border border-line/60 bg-white p-3 shadow-card";
  if (!onClick) {
    return <li data-testid={testId} className={classes}>{body}</li>;
  }
  return (
    <li>
      <button type="button" data-testid={testId} onClick={onClick} className={`${classes} transition hover:-translate-y-0.5 hover:shadow-lift`}>
        {body}
      </button>
    </li>
  );
}
