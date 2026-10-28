import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/ui";
import TrendsPanel from "@/components/TrendsPanel";

/**
 * Tendencias de consumo en una página. Para quien usa el panel como usuario es el consumo de su inventario; para un
 * administrador, el de toda la plataforma.
 */
export default function Metricas() {
  const { effectiveIsAdmin } = useAuth();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Tendencias de Consumo"
        subtitle={effectiveIsAdmin ? "Cuánto se consume y se repone en toda la plataforma" : "Mirá cuánto consumís y reponés"}
      />
      <TrendsPanel
        endpoint={effectiveIsAdmin ? "/admin/metrics" : "/me/metrics"}
        audience={effectiveIsAdmin ? "platform" : "user"}
      />
    </div>
  );
}
