import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import type { AlertOut, AppUserDetail, StockChange } from "@/lib/types";
import { formatDateTime, formatThousands, truncate } from "@/lib/format";
import { USER_TREND_PERIODS, type TrendPeriod } from "@/lib/trends";
import { Badge, Button, Card, EmptyState, Modal, Spinner } from "@/components/ui";
import AlertDetailModal from "@/components/AlertDetailModal";
import AlertRow from "@/components/AlertRow";
import ChangeRow from "@/components/ChangeRow";
import ChangesModal from "@/components/ChangesModal";
import TrendsPanel, { PeriodPicker } from "@/components/TrendsPanel";

/** Cuántos cambios y alertas se ven en cada columna; el resto, con «Ver más». */
const PREVIEW = 5;

/** Un dato del perfil: el rótulo chico arriba y el valor abajo. */
function ProfileField({ testId, label, children }: { testId: string; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd data-testid={testId} className="mt-0.5 truncate text-sm text-ink">
        {children}
      </dd>
    </div>
  );
}

/** Cada cuadro de información tiene su color, con el relleno tenue. */
const BOX_TONES = {
  sky: "border-[#B9E0F2] bg-[#EAF6FC] text-[#1D6F9B]",
  blue: "border-[#C3D1F2] bg-[#EDF1FC] text-[#1B3A8F]",
  red: "border-[#F6C3C4] bg-[#FDEFEF] text-[#9B1C1F]",
  yellow: "border-[#F5E1A0] bg-[#FFF8E1] text-[#7A5A00]",
} as const;

/** Un cuadro de información de una columna: solo muestra un número, no se puede tocar. */
function InfoBox({ testId, value, label, tone }: { testId: string; value: number; label: string; tone: keyof typeof BOX_TONES }) {
  return (
    <div data-testid={testId} className={`rounded-xl border px-3 py-2 text-center text-sm ${BOX_TONES[tone]}`}>
      <span className="font-bold">{formatThousands(value)}</span> {label}
    </div>
  );
}

/** Alto fijo que comparten los cambios y las alertas de las dos columnas. */
const ROW_HEIGHT = "h-28";

/** «Alertas de <mail>»: todas las alertas del usuario, en una ventana que se desplaza. */
function UserAlertsModal({ email, alerts, onClose, onOpen }: { email: string; alerts: AlertOut[]; onClose: () => void; onOpen: (alert: AlertOut) => void }) {
  return (
    <Modal title={`Alertas de ${email}`} onClose={onClose} testId="user-alerts-modal" width="max-w-xl">
      {alerts.length === 0 ? (
        <EmptyState>Este usuario no tiene alertas.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {alerts.map((a) => (
            <AlertRow key={a.key} alert={a} compact onClick={() => onOpen(a)} />
          ))}
        </ul>
      )}
    </Modal>
  );
}

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const [alert, setAlert] = useState<AlertOut | null>(null);
  const [period, setPeriod] = useState<TrendPeriod>(14);
  const [allChanges, setAllChanges] = useState(false);
  const [allAlerts, setAllAlerts] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["user", id],
    queryFn: async () => (await api.get<AppUserDetail>(`/admin/users/${id}`)).data,
  });
  const changes = useQuery({
    queryKey: ["user-changes", id],
    queryFn: async () => (await api.get<StockChange[]>(`/admin/users/${id}/changes`, { params: { limit: PREVIEW } })).data,
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <p className="text-danger">No se encontró el usuario.</p>;

  const email = data.email ?? data.id;
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ");
  const metricsEndpoint = `/admin/users/${id}/metrics`;
  const alerts = data.alerts.slice(0, PREVIEW);

  return (
    <div>
      {/* «Volver», el mail y la descripción a la izquierda y, a la derecha, el perfil, centrado en el alto de todo eso */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <Link to="/usuarios" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-primaryDark">
            <ArrowLeft size={16} /> Volver
          </Link>
          <h1 className="break-words text-2xl font-bold text-ink" title={email}>
            {email}
          </h1>
          <p className="mt-1 text-sm text-muted">Detalle de la cuenta y datos cargados</p>
        </div>
        <Card className="!p-4">
          <dl data-testid="user-profile" className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <ProfileField testId="user-profile-name" label="Nombre">
              {name || "—"}
            </ProfileField>
            <ProfileField testId="user-profile-username" label="Usuario">
              {data.username || "—"}
            </ProfileField>
            <ProfileField testId="user-profile-status" label="Estado">
              {data.is_active ? <Badge tone="ok">Activo</Badge> : <Badge tone="off">Deshabilitado</Badge>}
            </ProfileField>
            <ProfileField testId="user-profile-created" label="Fecha de registro">
              {formatDateTime(data.created_at)}
            </ProfileField>
          </dl>
        </Card>
      </div>

      <section data-testid="user-trends" aria-labelledby="user-trends-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="user-trends-title" className="text-lg font-bold text-ink">
            Tendencias del usuario
          </h2>
          <div data-testid="user-trends-period-picker" className="[&>div]:mb-0">
            <PeriodPicker period={period} onChange={setPeriod} periods={USER_TREND_PERIODS} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TrendsPanel endpoint={metricsEndpoint} audience="platform" kind="consumo" period={period} onPeriodChange={setPeriod} showTop={false} compact productLabels />
          <TrendsPanel endpoint={metricsEndpoint} audience="platform" kind="ingresos" period={period} onPeriodChange={setPeriod} showTop={false} compact productLabels />
        </div>
      </section>

      {/* Dos columnas separadas por una línea vertical tenue */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-0">
        <section aria-labelledby="user-changes-title" data-testid="user-changes-section" className="lg:pr-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="user-changes-title" className="text-base font-bold text-ink">
              Últimos cambios del usuario
            </h2>
            <Button tone="ghost" className="!px-3 !py-1.5" onClick={() => setAllChanges(true)}>
              Ver más
            </Button>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <InfoBox testId="user-info-products" tone="blue" value={data.product_count} label={data.product_count === 1 ? "producto total" : "productos totales"} />
            <InfoBox testId="user-info-units" tone="sky" value={data.total_units} label={data.total_units === 1 ? "unidad total" : "unidades totales"} />
          </div>
          <div data-testid="user-changes-list">
            {changes.isLoading ? (
              <Spinner />
            ) : (changes.data ?? []).length === 0 ? (
              <EmptyState>Este usuario todavía no tiene cambios de stock.</EmptyState>
            ) : (
              <ul className="space-y-3">
                {(changes.data ?? []).map((change) => (
                  <ChangeRow key={change.id} change={change} className={`${ROW_HEIGHT} flex flex-col justify-center`} />
                ))}
              </ul>
            )}
          </div>
        </section>

        <section aria-labelledby="user-alerts-title" data-testid="user-alerts-section" className="lg:border-l lg:border-line/60 lg:pl-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="user-alerts-title" className="text-base font-bold text-ink">
              Alertas del usuario
            </h2>
            <Button tone="ghost" className="!px-3 !py-1.5" onClick={() => setAllAlerts(true)}>
              Ver más
            </Button>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <InfoBox testId="user-info-critical" tone="red" value={data.critical_alerts} label={data.critical_alerts === 1 ? "alerta crítica" : "alertas críticas"} />
            <InfoBox testId="user-info-warning" tone="yellow" value={data.warning_alerts} label={data.warning_alerts === 1 ? "alerta de advertencia" : "alertas de advertencias"} />
          </div>
          <div data-testid="user-alerts-list">
            {alerts.length === 0 ? (
              <EmptyState>Este usuario no tiene alertas.</EmptyState>
            ) : (
              <ul className="space-y-3" data-testid="user-alerts">
                {alerts.map((a) => (
                  <AlertRow key={a.key} alert={a} heightClass={ROW_HEIGHT} onClick={() => setAlert(a)} />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {allChanges && (
        <ChangesModal
          endpoint={`/admin/users/${id}/changes`}
          title={`Cambios de ${truncate(email)}`}
          onClose={() => setAllChanges(false)}
        />
      )}
      {allAlerts && <UserAlertsModal email={email} alerts={data.alerts} onClose={() => setAllAlerts(false)} onOpen={setAlert} />}
      {alert && <AlertDetailModal alert={alert} onClose={() => setAlert(null)} />}
    </div>
  );
}
