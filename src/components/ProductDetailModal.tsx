import type { ReactNode } from "react";
import { Barcode, CalendarDays, Pencil, History } from "lucide-react";
import type { MyProduct } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { Button, Modal } from "@/components/ui";
import ProductImage from "@/components/ProductImage";

/** Las reglas generales del perfil: las que rigen cuando el producto no tiene una propia. */
export interface GeneralAlertRules {
  coverageDays: number;
  expiryDays: number;
}

/** Un dato del producto, como en la app: el rótulo chico arriba, el valor abajo y una línea gris que separa. */
function Row({
  testId,
  label,
  value,
  note,
  highlight = false,
  noDivider = false,
  icon,
}: {
  testId: string;
  label: string;
  value?: ReactNode;
  /** Aclaración más chica debajo del valor (por ejemplo, que se usa la regla general). */
  note?: string;
  /** Destaca el rótulo y el valor con el color principal. */
  highlight?: boolean;
  noDivider?: boolean;
  /** Un símbolo antes del rótulo, del mismo color que él. */
  icon?: ReactNode;
}) {
  const empty = value === undefined || value === null || value === "";
  return (
    <div className={`py-2 ${noDivider ? "" : "border-b border-line/50"}`}>
      <p className={`flex items-center gap-1.5 text-xs font-semibold ${highlight ? "text-primary" : "text-muted"}`}>
        {icon}
        {label}
      </p>
      <p data-testid={testId} className={`mt-0.5 break-words text-[15px] ${empty ? "text-muted/60" : highlight ? "text-primary" : "text-ink"}`}>
        {empty ? "—" : value}
      </p>
      {note && <p className="mt-0.5 text-[11px] text-muted">{note}</p>}
    </div>
  );
}

const days = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

/**
 * «Información del Producto», con los mismos datos y el mismo orden que la ventana de la app: imagen, nombre, categoría,
 * marca, stock, descripción, ubicación, vencimiento, código de barras, las reglas de alerta (la propia del producto o,
 * si no tiene, la general del perfil, con su aclaración) y la fecha de carga. Además, el inventario suma accesos al
 * historial y a la edición.
 */
export default function ProductDetailModal({
  product,
  onClose,
  onHistory,
  onEdit,
  generalRules,
}: {
  product: MyProduct;
  onClose: () => void;
  onHistory?: () => void;
  onEdit?: () => void;
  generalRules?: GeneralAlertRules | null;
}) {
  const rule = (testId: string, label: string, own: number | null, general: number | undefined, noDivider = false) => {
    if (own != null) return <Row testId={testId} label={label} value={days(own)} noDivider={noDivider} />;
    if (general != null) return <Row testId={testId} label={label} value={days(general)} note="Usando tu regla general" noDivider={noDivider} />;
    return <Row testId={testId} label={label} value="Usando tu regla general" noDivider={noDivider} />;
  };
  const hasFooter = onHistory || onEdit;

  return (
    <Modal
      title="Información del Producto"
      onClose={onClose}
      testId="product-detail"
      width="max-w-md"
      footer={
        hasFooter ? (
          <div className="flex flex-wrap gap-2">
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
        ) : undefined
      }
    >
      <div className="my-2 flex justify-center">
        <ProductImage url={product.imagen_url} alt={product.nombre} className="h-36 w-36 shrink-0 !rounded-xl" />
      </div>
      <h3 data-testid="product-detail-name" className="mb-2 break-words text-center text-lg font-bold text-ink">
        {product.nombre}
      </h3>

      <Row testId="product-detail-categoria" label="Categoría" value={product.categoria} highlight />
      <Row testId="product-detail-marca" label="Marca" value={product.marca} />
      <Row testId="product-detail-stock" label="Stock" value={product.stock} highlight />
      {product.descripcion?.trim() ? <Row testId="product-detail-descripcion" label="Descripción" value={product.descripcion} /> : null}
      <Row testId="product-detail-ubicacion" label="Ubicación de guardado" value={product.ubicacion} />
      <Row testId="product-detail-vencimiento" label="Fecha de vencimiento" icon={<CalendarDays size={14} data-testid="icon-calendar" />} value={product.vencimiento ? formatDate(product.vencimiento) : "Sin vencimiento"} />
      <Row testId="product-detail-codigo" label="Código de barras" icon={<Barcode size={14} data-testid="icon-barcode" />} value={product.codigo_barras} />

      <p className="mb-0.5 mt-4 text-sm font-bold text-muted">Reglas de alerta</p>
      {rule("product-detail-stock-minimo", "Stock mínimo (días de cobertura)", product.stock_minimo, generalRules?.coverageDays, true)}
      {rule("product-detail-dias-alerta", "Días de anticipación (vencimiento)", product.dias_alerta_vencimiento, generalRules?.expiryDays)}

      {product.created_at ? <Row testId="product-detail-created" label="Fecha de carga" value={formatDateTime(product.created_at)} noDivider /> : null}
    </Modal>
  );
}
