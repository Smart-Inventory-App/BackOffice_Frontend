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
  is_active: boolean;
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
  created_at: string | null;
  merged?: boolean;
}

export interface ProductSuggestion {
  nombre: string;
  marca: string | null;
  categoria: string;
  ubicacion: string | null;
}

export interface MyDefaults {
  last_categoria: string | null;
  last_ubicacion: string | null;
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
}

export interface BulkParsedRow {
  row_number: number;
  data: BulkProductRow | null;
  valid: boolean;
  errors: string[];
  action: "create" | "merge" | null;
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
