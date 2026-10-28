import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AlertLevel, AlertList, AlertOut } from "@/lib/types";
import { LEVEL_TONES, TYPE_FILTERS, type TypeFilter } from "@/lib/alertInfo";
import { Card, EmptyState, PageHeader, Segmented, Spinner } from "@/components/ui";
import AlertDetailModal from "@/components/AlertDetailModal";
import AlertRow from "@/components/AlertRow";

const LEVELS: AlertLevel[] = ["critical", "warning"];

function Section({ title, subtitle, alerts, onOpen, testId }: {
  title: string;
  subtitle: string;
  alerts: AlertOut[];
  onOpen: (alert: AlertOut) => void;
  testId: string;
}) {
  return (
    <section data-testid={testId} className="mt-6">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      <p className="mb-3 text-sm text-muted">{subtitle}</p>
      <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {alerts.map((alert) => (
          <AlertRow key={alert.key} alert={alert} onClick={() => onOpen(alert)} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Centro de Alertas, como el de la app. Arriba, «Críticas» y «Advertencias»: tocar una filtra por ese nivel (con el
 * contorno rojo o amarillo) y volver a tocarla muestra todas. Debajo, las opciones Todas / Stock / Vencimiento. Los
 * números siguen al tipo elegido. «Según tus reglas» va primero y «Generado por el sistema» después, con la marca
 * «Predicción» en lo que calcula el modelo.
 */
export default function Alertas() {
  const location = useLocation();
  // Desde las tarjetas del inicio se llega con una opción ya elegida; entrando por el menú se ven todas
  const requested = location.state as { tipo?: TypeFilter; level?: AlertLevel } | null;
  const [type, setType] = useState<TypeFilter>(requested?.tipo ?? "todas");
  const [level, setLevel] = useState<AlertLevel | null>(requested?.level ?? null);
  const [detail, setDetail] = useState<AlertOut | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-alerts", type, level],
    queryFn: async () =>
      (
        await api.get<AlertList>("/me/alerts/", {
          params: { ...(type !== "todas" ? { tipo: type } : {}), ...(level ? { level } : {}) },
        })
      ).data,
  });

  const items = data?.items ?? [];
  const rules = items.filter((a) => a.origin === "rule");
  const system = items.filter((a) => a.origin === "system");

  return (
    <div>
      <PageHeader title="Centro de Alertas" subtitle="Lo que necesita tu atención en tu inventario" />

      <div className="grid grid-cols-2 gap-3">
        {LEVELS.map((key) => {
          const tone = LEVEL_TONES[key];
          const selected = level === key;
          return (
            <button
              key={key}
              type="button"
              data-testid={`alert-summary-${key}`}
              aria-pressed={selected}
              onClick={() => setLevel((current) => (current === key ? null : key))}
              className="rounded-2xl border-2 px-4 py-4 text-center transition hover:-translate-y-0.5"
              style={{ backgroundColor: tone.background, borderColor: selected ? tone.border : "transparent" }}
            >
              <p data-testid={`alert-count-${key}`} className="text-3xl font-bold" style={{ color: tone.text }}>
                {data?.summary[key] ?? 0}
              </p>
              <p className="text-sm font-semibold" style={{ color: tone.text }}>
                {tone.label}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <Segmented testIdPrefix="alert-filter" options={TYPE_FILTERS} value={type} onChange={setType} equalWidth />
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <p className="mt-6 text-danger">No se pudieron cargar las alertas.</p>
      ) : items.length === 0 ? (
        <Card className="mt-6">
          <EmptyState>No tenés alertas para mostrar.</EmptyState>
        </Card>
      ) : (
        <>
          {rules.length > 0 && (
            <Section
              testId="alerts-rules"
              title="Según tus reglas"
              subtitle="Vencimiento y stock mínimo configurado."
              alerts={rules}
              onOpen={setDetail}
            />
          )}
          {system.length > 0 && (
            <Section
              testId="alerts-system"
              title="Generado por el sistema"
              subtitle="Predicciones con tu flujo de productos."
              alerts={system}
              onOpen={setDetail}
            />
          )}
        </>
      )}

      {detail && <AlertDetailModal alert={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
