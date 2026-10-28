import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/ui";
import TrendsPanel, { PeriodPicker } from "@/components/TrendsPanel";
import type { TrendPeriod } from "@/lib/trends";

/**
 * Tendencias en una página dividida en dos: «Tendencias de consumo» (lo que sale del stock) y «Tendencias de ingresos»
 * (lo que se carga: reposiciones y productos nuevos). Para quien usa el panel como usuario son los datos de su inventario;
 * para un administrador, los de toda la plataforma. El período (7, 14, 30 o 90 días) se elige una vez para las dos.
 */
export default function Metricas() {
  const { effectiveIsAdmin } = useAuth();
  const [period, setPeriod] = useState<TrendPeriod>(14);
  const endpoint = effectiveIsAdmin ? "/admin/metrics" : "/me/metrics";
  const audience = effectiveIsAdmin ? "platform" : "user";
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Tendencias"
        subtitle={effectiveIsAdmin ? "Cuánto se consume y cuánto ingresa en toda la plataforma" : "Mirá cuánto consumís y cuánto ingresás"}
      />
      <PeriodPicker period={period} onChange={setPeriod} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section aria-labelledby="trends-consumption-title" data-testid="trends-section-consumo">
          <h2 id="trends-consumption-title" className="mb-3 text-lg font-bold text-ink">
            Tendencias de consumo
          </h2>
          <TrendsPanel endpoint={endpoint} audience={audience} kind="consumo" period={period} onPeriodChange={setPeriod} />
        </section>
        <section aria-labelledby="trends-incomes-title" data-testid="trends-section-ingresos">
          <h2 id="trends-incomes-title" className="mb-3 text-lg font-bold text-ink">
            Tendencias de ingresos
          </h2>
          <TrendsPanel endpoint={endpoint} audience={audience} kind="ingresos" period={period} onPeriodChange={setPeriod} />
        </section>
      </div>
    </div>
  );
}
