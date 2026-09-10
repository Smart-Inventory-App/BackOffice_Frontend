export interface Admin {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  is_active: boolean;
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
  created_at: string | null;
  owner: ProductOwner;
}

export interface AppUserDetail extends AppUser {
  products: AdminProduct[];
}

export interface MyStats {
  total_products: number;
  products_with_image: number;
  low_stock_products: number;
  expiring_soon_products: number;
  expired_products: number;
  products_by_category: CategoryCount[];
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
  stock_minimo: number;
  dias_alerta_vencimiento: number;
}

export interface BulkProductRow {
  row_number: number;
  nombre: string;
  marca: string | null;
  categoria: string;
  stock: number;
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
}

export interface MyMetrics {
  period_days: number;
  total_consumido: number;
  total_entradas: number;
  consumo_por_dia: ConsumoPorDia[];
  top_productos: ProductoConsumo[];
  productos_menos_usados: ProductoConsumo[];
}

export interface ConsumptionEvent {
  id: number;
  quantity: number;
  event_type: "consumed" | "expired" | "restocked";
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
    | "product_updated"
    | "product_deleted";
  actor_email: string | null;
  target_user_id: string | null;
  target_email: string | null;
  description: string;
  created_at: string | null;
}

/* ── Módulo de OCR ──────────────────────────────────────────────────────────
 * El panel habla con `ocr_service` a través del backoffice; estos tipos son los
 * que devuelve `/admin/ocr/*`. Las fotos escaneadas no se guardan en ningún
 * lado: lo único que queda de cada ejecución es su renglón de auditoría.
 */

export type OCRDocType = "product_label" | "expiry_date" | "receipt" | "barcode";

export interface OCREngineStatus {
  name: string;
  url: string;
  available: boolean;
  version: string;
  /** Un motor puede estar replicado; PaddleOCR lo está. */
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
  /** Giro con el que se obtuvo la lectura, y cuántas combinaciones hicieron falta. */
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
