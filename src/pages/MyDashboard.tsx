import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Boxes, Clock, Cuboid, TrendingDown } from "lucide-react";
import { api } from "@/lib/api";
import type { MyProduct, MyProfile, MyStats, Paginated, StockChange } from "@/lib/types";
import { formatDateTime, formatThousands } from "@/lib/format";
import { Button, Card, EmptyState, Spinner, StatTile } from "@/components/ui";
import ChangeRow from "@/components/ChangeRow";
import ChangesModal from "@/components/ChangesModal";
import ProductDetailModal from "@/components/ProductDetailModal";
import ProductRow from "@/components/ProductRow";
import TrendsModal from "@/components/TrendsModal";

const RECENT_CHANGES = 5;
const RECENT_PRODUCTS = 3;
// El nombre del saludo se corta, como en la app
const NAME_MAX = 20;

/**
 * Inicio del usuario, como el de la app: el saludo, las cuatro tarjetas del inventario (cada una lleva a su pantalla),
 * el botón de tendencias, los últimos cambios de stock y los productos recientes.
 */
export default function MyDashboard() {
  const navigate = useNavigate();
  const [showTrends, setShowTrends] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [detail, setDetail] = useState<MyProduct | null>(null);

  const stats = useQuery({
    queryKey: ["my-stats"],
    queryFn: async () => (await api.get<MyStats>("/me/stats")).data,
  });
  const profile = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => (await api.get<MyProfile>("/me/profile")).data,
  });
  const changes = useQuery({
    queryKey: ["my-changes", RECENT_CHANGES],
    queryFn: async () => (await api.get<StockChange[]>("/me/changes", { params: { limit: RECENT_CHANGES } })).data,
  });
  const recent = useQuery({
    queryKey: ["my-recent-products", RECENT_PRODUCTS],
    queryFn: async () => (await api.get<Paginated<MyProduct>>("/me/products", { params: { limit: RECENT_PRODUCTS } })).data.items,
  });

  if (stats.isLoading) return <Spinner />;
  if (stats.isError || !stats.data) {
    return <p className="text-danger">No se pudo cargar el estado de tu inventario.</p>;
  }

  const data = stats.data;
  const name = profile.data?.first_name?.trim();
  const greeting = name ? `Bienvenido, ${name.length > NAME_MAX ? `${name.slice(0, NAME_MAX)}...` : name}` : "Bienvenido";
  // Las tarjetas de alertas abren el Centro de Alertas con esa opción ya elegida
  const goToAlerts = (tipo: "stock" | "vencimiento") => navigate("/alertas", { state: { tipo } });

  return (
    <div>
      <div className="mb-6">
        <h1 data-testid="home-greeting" className="text-2xl font-bold text-ink">
          {greeting}
        </h1>
        <p className="mt-1 text-sm text-muted">Tu estado</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          testId="stat-products"
          icon={Cuboid}
          tone="blue"
          title="Productos"
          value={formatThousands(data.total_products)}
          comment="Total inventario"
          solidComment
          onClick={() => navigate("/productos")}
        />
        <StatTile
          testId="stat-stock"
          icon={Boxes}
          tone="teal"
          accent="#2CC4B4"
          title="Productos en stock"
          value={formatThousands(data.total_units)}
          comment="Total unidades"
          onClick={() => navigate("/productos")}
        />
        <StatTile
          testId="stat-expiring"
          icon={Clock}
          tone="yellow"
          title="Vencimientos"
          value={formatThousands(data.expiring_soon_products)}
          comment="Alertas de productos"
          onClick={() => goToAlerts("vencimiento")}
        />
        <StatTile
          testId="stat-low"
          icon={TrendingDown}
          tone="red"
          title="Stock bajo"
          value={formatThousands(data.low_stock_products)}
          comment="Alertas de stock"
          onClick={() => goToAlerts("stock")}
        />
      </div>

      <button
        type="button"
        data-testid="home-trends"
        onClick={() => setShowTrends(true)}
        className="mt-4 flex w-full items-center gap-4 rounded-2xl border border-line/60 bg-white p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
          <BarChart3 size={20} />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold text-ink">Tendencias</span>
          <span className="block text-xs text-muted">Mirá cuánto consumís y reponés</span>
        </span>
      </button>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-label="Últimos Cambios">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">Últimos Cambios</h2>
            <Button tone="ghost" className="!px-3 !py-1.5" onClick={() => setShowChanges(true)}>
              Ver más
            </Button>
          </div>
          {changes.isLoading ? (
            <Spinner />
          ) : (changes.data ?? []).length === 0 ? (
            <Card>
              <EmptyState>Todavía no hay cambios de stock.</EmptyState>
            </Card>
          ) : (
            <ul className="space-y-3" data-testid="home-changes">
              {(changes.data ?? []).map((change) => (
                <ChangeRow key={change.id} change={change} />
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Productos Recientes">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">Productos Recientes</h2>
            <Button tone="ghost" className="!px-3 !py-1.5" onClick={() => navigate("/productos")}>
              Ver inventario
            </Button>
          </div>
          {recent.isLoading ? (
            <Spinner />
          ) : (recent.data ?? []).length === 0 ? (
            <Card>
              <EmptyState>No tenés productos cargados</EmptyState>
            </Card>
          ) : (
            <ul className="space-y-3" data-testid="home-recent">
              {(recent.data ?? []).map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  testId={`recent-${product.id}`}
                  caption={`Cargado el ${formatDateTime(product.created_at)}`}
                  onClick={() => setDetail(product)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {showTrends && <TrendsModal onClose={() => setShowTrends(false)} />}
      {showChanges && <ChangesModal onClose={() => setShowChanges(false)} />}
      {detail && <ProductDetailModal product={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
