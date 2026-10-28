import type { ReactNode } from "react";
import { Layers, Pencil, History } from "lucide-react";
import type { MyProduct } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { Button, Modal } from "@/components/ui";
import ProductImage from "@/components/ProductImage";

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-canvas px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 break-words text-sm text-ink">{children}</p>
    </div>
  );
}

const days = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

/**
 * «Información del Producto»: todo lo que se sabe de un producto, con accesos a su stock total, a su historial y a su
 * edición. Las reglas de alerta propias del producto se muestran aparte de las generales del perfil.
 */
export default function ProductDetailModal({
  product,
  onClose,
  onStockTotal,
  onHistory,
  onEdit,
}: {
  product: MyProduct;
  onClose: () => void;
  onStockTotal?: () => void;
  onHistory?: () => void;
  onEdit?: () => void;
}) {
  const hasRules = product.stock_minimo != null || product.dias_alerta_vencimiento != null;
  return (
    <Modal
      title="Información del Producto"
      onClose={onClose}
      testId="product-detail"
      width="max-w-xl"
      footer={
        <div className="flex flex-wrap gap-2">
          {onStockTotal && (
            <Button tone="outline" className="flex-1" onClick={onStockTotal}>
              <Layers size={16} /> Stock total
            </Button>
          )}
          {onHistory && (
            <Button tone="outline" className="flex-1" onClick={onHistory}>
              <History size={16} /> Historial
            </Button>
          )}
          {onEdit && (
            <Button className="flex-1" onClick={onEdit}>
              <Pencil size={16} /> Editar
            </Button>
          )}
        </div>
      }
    >
      <div className="flex items-start gap-4">
        <ProductImage url={product.imagen_url} alt={product.nombre} className="h-28 w-28 shrink-0 !rounded-2xl" />
        <div className="min-w-0">
          <h3 data-testid="product-detail-name" className="break-words text-xl font-bold text-ink">
            {product.nombre}
          </h3>
          {product.marca && <p className="text-sm text-muted">{product.marca}</p>}
          <p className="mt-2 text-3xl font-bold text-primary" data-testid="product-detail-stock">
            {product.stock}{" "}
            <span className="text-sm font-medium text-muted">{product.stock === 1 ? "unidad" : "unidades"}</span>
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Item label="Categoría">{product.categoria}</Item>
        <Item label="Ubicación">{product.ubicacion || "—"}</Item>
        <Item label="Vencimiento">{formatDate(product.vencimiento)}</Item>
        <Item label="Código de barras">{product.codigo_barras || "—"}</Item>
      </div>

      {product.descripcion && (
        <div className="mt-2">
          <Item label="Descripción">{product.descripcion}</Item>
        </div>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Item label="Aviso de stock mínimo">
          {product.stock_minimo != null ? `${days(product.stock_minimo)} (regla de este producto)` : "Tu regla general"}
        </Item>
        <Item label="Aviso de vencimiento">
          {product.dias_alerta_vencimiento != null ? `${days(product.dias_alerta_vencimiento)} (regla de este producto)` : "Tu regla general"}
        </Item>
      </div>
      {!hasRules && <p className="mt-1 text-xs text-muted">Se avisa con las reglas generales de tu perfil.</p>}

      <p className="mt-4 text-xs text-muted">Fecha de carga: {formatDateTime(product.created_at)}</p>
    </Modal>
  );
}
