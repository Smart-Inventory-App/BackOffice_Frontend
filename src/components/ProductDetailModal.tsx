import type { ReactNode } from "react";
import { Barcode, CalendarDays, Pencil, History } from "lucide-react";
import type { AlertOut, MyProduct } from "@/lib/types";
import { alertDetails, alertTitle, LEVEL_TONES } from "@/lib/alertInfo";
import PredictionBadge from "@/components/PredictionBadge";
import { formatDate, formatDateTime } from "@/lib/format";
import { Badge, Button, Modal } from "@/components/ui";
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

/** Lo que muestra la ventana de un producto: el del usuario o el de cualquiera de la plataforma (con reglas opcionales). */
export type DetailProduct = Omit<MyProduct, "stock_minimo" | "dias_alerta_vencimiento" | "merged"> & {
  stock_minimo?: number | null;
  dias_alerta_vencimiento?: number | null;
};

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
  ownerEmail,
  ownerDisabled = false,
  alerts,
}: {
  product: DetailProduct;
  onClose: () => void;
  onHistory?: () => void;
  onEdit?: () => void;
  generalRules?: GeneralAlertRules | null;
  /** Para el administrador: el mail del usuario dueño del producto, arriba de todo. */
  ownerEmail?: string | null;
  /** Para el administrador: el usuario dueño tiene la cuenta deshabilitada (su mail va en rojo, con una insignia). */
  ownerDisabled?: boolean;
  /** Para el administrador: las alertas que tiene el producto, con el color y la información de cada una. */
  alerts?: AlertOut[];
}) {
  // Para el administrador, las reglas generales son las del usuario dueño, no las suyas
  const generalText = ownerEmail !== undefined ? "Usando la regla general del usuario" : "Usando tu regla general";
  const rule = (testId: string, label: string, own: number | null, general: number | undefined, noDivider = false) => {
    if (own != null) return <Row testId={testId} label={label} value={days(own)} noDivider={noDivider} />;
    if (general != null) return <Row testId={testId} label={label} value={days(general)} note={generalText} noDivider={noDivider} />;
    return <Row testId={testId} label={label} value={generalText} noDivider={noDivider} />;
  };
  const hasFooter = onHistory || onEdit;

  return (
    <Modal
      title="Información del Producto"
      onClose={onClose}
      testId="product-detail"
      width={ownerEmail !== undefined ? "max-w-xl" : "max-w-md"}
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
      {ownerEmail !== undefined && (
        <Row
          testId="product-detail-owner"
          label="Usuario"
          value={
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className={ownerDisabled ? "font-semibold text-danger" : undefined}>{ownerEmail}</span>
              {ownerDisabled && <Badge tone="off">Usuario deshabilitado</Badge>}
            </span>
          }
        />
      )}
      <div className="my-2 flex justify-center">
        <ProductImage url={product.imagen_url} alt={product.nombre} className="h-36 w-36 shrink-0 !rounded-xl" />
      </div>
      <h3 data-testid="product-detail-name" className="mb-2 break-words text-center text-lg font-bold text-ink">
        {product.nombre}
      </h3>

      <Row testId="product-detail-categoria" label="Categoría" value={product.categoria} highlight />
      <Row testId="product-detail-marca" label="Marca" value={product.marca} />
      <Row testId="product-detail-stock" label="Stock" value={product.stock} highlight />
      {(alerts ?? []).map((a, i) => {
        const tone = LEVEL_TONES[a.level];
        return (
          <div
            key={a.key}
            data-testid={`product-detail-alert-${i}`}
            className="relative my-2 rounded-xl border px-3 py-2"
            style={{ background: tone.background, borderColor: tone.border, color: tone.text }}
          >
            {a.predictive && <PredictionBadge testId={`product-detail-alert-prediction-${i}`} className="absolute right-3 top-2" />}
            <p className="text-xs font-semibold">{a.level === "critical" ? "Alerta crítica" : "Advertencia"}</p>
            <p data-testid={`product-detail-alert-title-${i}`} className="text-[15px] font-bold">{alertTitle(a)}</p>
            {alertDetails(a).map((paragraph) => (
              <p key={paragraph} className="mt-1 text-xs">
                {paragraph}
              </p>
            ))}
          </div>
        );
      })}
      {product.descripcion?.trim() ? <Row testId="product-detail-descripcion" label="Descripción" value={product.descripcion} /> : null}
      <Row testId="product-detail-ubicacion" label="Ubicación de guardado" value={product.ubicacion} />
      <Row testId="product-detail-vencimiento" label="Fecha de vencimiento" icon={<CalendarDays size={14} data-testid="icon-calendar" />} value={product.vencimiento ? formatDate(product.vencimiento) : "Sin vencimiento"} />
      <Row testId="product-detail-codigo" label="Código de barras" icon={<Barcode size={14} data-testid="icon-barcode" />} value={product.codigo_barras} />

      <p className="mb-0.5 mt-4 text-sm font-bold text-muted">Reglas de alerta</p>
      {rule("product-detail-stock-minimo", "Stock mínimo (días de cobertura)", product.stock_minimo ?? null, generalRules?.coverageDays, true)}
      {rule("product-detail-dias-alerta", "Días de anticipación (vencimiento)", product.dias_alerta_vencimiento ?? null, generalRules?.expiryDays)}

      {product.created_at ? <Row testId="product-detail-created" label="Fecha de carga" value={formatDateTime(product.created_at)} noDivider /> : null}
    </Modal>
  );
}
