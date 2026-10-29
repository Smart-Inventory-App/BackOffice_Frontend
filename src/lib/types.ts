export interface Admin {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  is_active: boolean;
  /** Ingresó con una contraseña inicial que le dio un administrador: antes de seguir tiene que cambiarla. */
  must_change_password?: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
}

export interface AuditEntry {
  id: number;
  user_id: string;
  changed_by: string;
  kind: "status" | "role";
  is_active: boolean | null;
  action: "granted" | "revoked" | null;
  reason: string | null;
  created_at: string | null;
}

export interface CategoryCount {
  label: string;
  count: number;
}

export interface DayCount {
  day: string;
  count: number;
}

export interface UserProductCount {
  user_id: string;
  email: string | null;
  count: number;
}

export interface DashboardStats {
  total_users: number;
  active_users: number;
  inactive_users: number;
  new_users_last_7d: number;
  total_products: number;
  products_with_image: number;
  low_stock_products: number;
  expiring_soon_products: number;
  expired_products: number;
  total_units: number;
  critical_alerts: number;
  warning_alerts: number;
  users_with_alerts: number;
  consumed_last_7d: number;
  restocked_last_7d: number;
  products_by_category: CategoryCount[];
  top_users_by_products: UserProductCount[];
  products_per_day_last_14d: DayCount[];
}

export interface AppUser {
  id: string;
  email: string | null;
  is_active: boolean;
  is_admin: boolean;
  created_at: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  product_count: number;
}

export interface ProductOwner {
  user_id: string;
  email: string | null;
}

export interface AdminProduct {
  id: number;
  nombre: string;
  marca: string | null;
  categoria: string;
  stock: number;
  vencimiento: string | null;
  descripcion: string | null;
  imagen_url: string | null;
  ubicacion: string | null;
  codigo_barras: string | null;
  stock_minimo?: number | null;
  dias_alerta_vencimiento?: number | null;
  created_at: string | null;
  /** La alerta más grave que tiene hoy el producto, y de qué tipos son. */
  alert_level?: AlertLevel | null;
  alert_types?: AlertType[];
  owner: ProductOwner;
}

export interface AdminProductGroupSummary {
  nombre: string;
  categoria: string;
  stock_total: number;
  lotes: number;
  usuarios: number;
  proximo_vencimiento: string | null;
}

export interface AdminProductGroupDetail extends AdminProductGroupSummary {
  productos: AdminProduct[];
}

export interface AppUserDetail extends AppUser {
  products: AdminProduct[];
  total_units: number;
  critical_alerts: number;
  warning_alerts: number;
  consumed_last_30d: number;
  restocked_last_30d: number;
  alerts: AlertOut[];
}

export type AlertLevel = "critical" | "warning";
export type AlertType = "expiry" | "stock_low_coverage" | "slow_pace";

/** Una alerta de un producto, con lo necesario para mostrarla y explicarla (las reglas son las de la app). */
export interface AlertOut {
  key: string;
  product_id: number;
  type: AlertType;
  level: AlertLevel;
  /** «rule»: sale de una regla del usuario; «system»: la genera el sistema por el consumo. */
  origin: "rule" | "system";
  days_to_expiry: number | null;
  days_until_stockout: number | null;
  units_wasted: number | null;
  suggested_qty: number | null;
  limit_days: number | null;
  rule_scope: "product" | "general" | null;
  /** Las del modelo predictivo llevan la marca «Predicción». */
  predictive: boolean;
  product_name: string;
  product_brand: string | null;
  product_category: string | null;
  product_location: string | null;
  product_stock: number;
  product_expiry: string | null;
  image_url: string | null;
  user_id: string | null;
}

export interface AlertSummary {
  critical: number;
  warning: number;
  total: number;
  /** Productos con alertas de «Vencimiento» (vencimiento y ritmo lento) y de «Stock», de cualquier nivel: lo mismo que el inicio de la app. */
  expiring: number;
  low_stock: number;
}

export interface AlertList {
  items: AlertOut[];
  summary: AlertSummary;
}

export interface StockChange {
  id: string;
  kind: "entrada" | "salida" | "modificacion";
  stock_before: number;
  stock_after: number;
  quantity: number;
  occurred_at: string;
  producto: MyProduct;
}

export interface MyStats {
  total_products: number;
  total_units: number;
  products_with_image: number;
  low_stock_products: number;
  expiring_soon_products: number;
  expired_products: number;
  critical_alerts: number;
  warning_alerts: number;
  products_by_category: CategoryCount[];
  /** Unidades en stock por categoría, productos por ubicación y cuándo vencen: los gráficos del dashboard. */
  stock_by_category: CategoryCount[];
  products_by_location: CategoryCount[];
  /** Unidades en stock por marca (solo los productos que tienen marca). */
  stock_by_brand: CategoryCount[];
  expiry_buckets: CategoryCount[];
}

export interface MyProduct {
  id: number;
  nombre: string;
  marca: string | null;
  categoria: string;
  stock: number;
  vencimiento: string | null;
  descripcion: string | null;
  imagen_url: string | null;
  ubicacion: string | null;
  codigo_barras: string | null;
  stock_minimo: number | null;
  dias_alerta_vencimiento: number | null;
  created_at: string | null;
  merged?: boolean;
}

export interface ProductSuggestion {
  id: number;
  nombre: string;
  marca: string | null;
  categoria: string;
  ubicacion: string | null;
  vencimiento: string | null;
  stock: number;
  stock_minimo: number | null;
  dias_alerta_vencimiento: number | null;
  codigo_barras?: string | null;
  imagen_url?: string | null;
}

export interface MyDefaults {
  last_categoria: string | null;
  last_ubicacion: string | null;
}

export interface MyProfile {
  email: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  /** Días de cobertura mínimos (stock mínimo) para todos los productos. */
  stock_minimo: number;
  /** Días de anticipación del aviso de vencimiento para todos los productos. */
  dias_alerta_vencimiento: number;
  /** Hora argentina (0 a 23) del chequeo diario de alertas. */
  alert_check_hour: number;
  user_type: "individuo" | "comercio";
}

export interface BulkProductRow {
  row_number: number;
  nombre: string;
  marca: string | null;
  categoria: string;
  stock: number;
  codigo_barras?: string | null;
  vencimiento: string | null;
  descripcion: string | null;
  imagen_url: string | null;
  ubicacion: string | null;
  stock_minimo: number | null;
  dias_alerta_vencimiento: number | null;
}

export interface BulkParsedRow {
  row_number: number;
  data: BulkProductRow | null;
  valid: boolean;
  errors: string[];
  action: "create" | "merge" | "salida" | null;
  existing_stock: number | null;
}

export interface BulkParseResponse {
  rows: BulkParsedRow[];
}

export interface BulkCommitResult {
  created: number;
  merged: number;
  failed: number;
  errors: string[];
}

export interface ConsumoPorDia {
  day: string;
  quantity: number;
}

export interface ProductoConsumo {
  product_id: number;
  nombre: string;
  cantidad: number;
  /** Solo en el ranking de toda la plataforma: el usuario al que pertenece el producto. */
  owner_email?: string | null;
}

export interface MyMetrics {
  period_days: number;
  total_consumido: number;
  total_entradas: number;
  consumo_por_dia: ConsumoPorDia[];
  top_productos: ProductoConsumo[];
  /** Todo lo que ingresó al stock: reposiciones y el stock con el que se cargaron los productos nuevos. */
  total_ingresos: number;
  ingresos_por_dia: ConsumoPorDia[];
}

export interface ConsumptionEvent {
  id: number;
  quantity: number;
  event_type: "consumed" | "expired" | "sold" | "rented" | "restocked";
  consumed_at: string;
  note: string | null;
  actor_email: string | null;
  reverses_event_id: number | null;
  reversed: boolean;
}

export interface ActivityEntry {
  id: string;
  kind:
    | "status"
    | "role"
    | "login"
    | "registered"
    | "product_created"
    | "product_exit"
    | "product_updated"
    | "product_deleted";
  actor_email: string | null;
  target_user_id: string | null;
  target_email: string | null;
  description: string;
  created_at: string | null;
}

/* Módulo de OCR */

export type OCRDocType = "product_label" | "expiry_date" | "receipt" | "barcode";

export interface OCREngineStatus {
  name: string;
  url: string;
  available: boolean;
  version: string;
  replicas: string[];
}

export interface OCRServiceStatus {
  available: boolean;
  checks: Record<string, unknown>;
  engines: OCREngineStatus[];
}

export interface OCRField {
  value: string | number | null;
  confidence: number;
}

export interface OCRReceiptItem {
  nombre_producto: OCRField;
  cantidad: OCRField;
}

export interface OCRResult {
  fields: Record<string, OCRField>;
  items: OCRReceiptItem[];
  document_confidence: number;
  needs_review: boolean;
  engine: string;
  raw_text: string;
  processing_ms: number;
  rotation: number;
  attempts: number;
  warnings: string[];
  texto_legible: string;
}

export interface OCRSyncResponse {
  doc_type: OCRDocType;
  result: OCRResult;
}

export interface OCRAuditEntry {
  id: number;
  job_id: string | null;
  user_email: string;
  user_id: string | null;
  origen: "app" | "panel";
  doc_type: OCRDocType;
  engine: string | null;
  status: "done" | "failed";
  confianza: number | null;
  processing_ms: number | null;
  campos: number | null;
  resumen: string | null;
  created_at: string;
}

export interface OCRDocTypeStats {
  doc_type: OCRDocType;
  ejecuciones: number;
  exitosas: number;
  fallidas: number;
  ms_promedio: number | null;
  ms_maximo: number | null;
  confianza_promedio: number | null;
}

export interface OCRStats {
  dias: number;
  ejecuciones: number;
  exitosas: number;
  fallidas: number;
  usuarios: number;
  ms_promedio: number | null;
  confianza_promedio: number | null;
  por_tipo: OCRDocTypeStats[];
}

export interface ProductMatch {
  id: number;
  nombre: string;
  marca: string | null;
  categoria: string | null;
  ubicacion: string | null;
  vencimiento: string | null;
  stock: number;
  codigo_barras: string | null;
  score: number;
  por_codigo: boolean;
}

export interface ProductDraft {
  nombre: string | null;
  marca: string | null;
  descripcion: string | null;
  vencimiento: string | null;
  codigo_barras: string | null;
  pais_registro: string | null;
  stock: number | null;
  confianzas: Record<string, number>;
  texto_leido: string | null;
  coincidencias: ProductMatch[];
  coincidencia_id: number | null;
}

export interface ReceiptInfo {
  comercio: string | null;
  fecha_compra: string | null;
  total: number | null;
}

export interface ScanResult {
  doc_type: OCRDocType;
  draft: ProductDraft | null;
  items: ProductDraft[];
  comprobante: ReceiptInfo | null;
  needs_review: boolean;
  confianza: number;
  texto_legible: string;
  advertencias: string[];
  sin_coincidencia: number;
}

export interface ScanState {
  job_id: string | null;
  status: "queued" | "processing" | "done" | "failed";
  doc_type: OCRDocType;
  result: ScanResult | null;
  error: string | null;
  queue_position: number | null;
  estimated_wait_seconds: number | null;
}

export interface SalidaOCRResult {
  procesados: number;
  fallidos: number;
  errores: string[];
}
