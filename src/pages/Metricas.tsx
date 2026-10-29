import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
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
  // Lo que pasó cada día, para el administrador, es de toda la plataforma
  const scope = effectiveIsAdmin ? "entre todos los usuarios de la plataforma" : undefined;
  return (
    <div>
      {/* Título y descripción a la izquierda y el selector de período a la derecha, alineados verticalmente */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">{effectiveIsAdmin ? "Tendencias de la Plataforma" : "Tendencias"}</h1>
          <p className="mt-1 text-sm text-muted">
            {effectiveIsAdmin ? "Cuánto se consume y cuánto ingresa en todo Smart Inventory" : "Mirá cuánto consumís y cuánto ingresás"}
          </p>
        </div>
        <div data-testid="trends-period-picker" className="[&>div]:mb-0">
          <PeriodPicker period={period} onChange={setPeriod} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-0">
        <section aria-labelledby="trends-consumption-title" data-testid="trends-section-consumo" className="lg:pr-6">
          <h2 id="trends-consumption-title" className="mb-3 text-center text-lg font-bold text-ink">
            Tendencias de consumo
          </h2>
          <TrendsPanel endpoint={endpoint} audience={audience} kind="consumo" period={period} onPeriodChange={setPeriod} scopeText={scope} />
        </section>
        <section aria-labelledby="trends-incomes-title" data-testid="trends-section-ingresos" className="lg:border-l lg:border-line/60 lg:pl-6">
          <h2 id="trends-incomes-title" className="mb-3 text-center text-lg font-bold text-ink">
            Tendencias de ingresos
          </h2>
          <TrendsPanel endpoint={endpoint} audience={audience} kind="ingresos" period={period} onPeriodChange={setPeriod} scopeText={scope} />
        </section>
      </div>
    </div>
  );
}
