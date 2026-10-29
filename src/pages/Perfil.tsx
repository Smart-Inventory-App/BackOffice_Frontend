import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Store, User } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Card, Field, Notice, PageHeader, Segmented, Spinner } from "@/components/ui";
import NumberStepper, { inRange } from "@/components/NumberStepper";
import type { MyProfile } from "@/lib/types";
import { apiErrorMessage } from "@/lib/errors";
import { invalidateInventory } from "@/lib/queries";

// Los mismos límites que valida el servicio y la app
export const TEXT_MAX = 20;
export const DAYS_MIN = 2;
export const DAYS_MAX = 90;
export const HOUR_MAX = 23;

type UserType = MyProfile["user_type"];

const USER_TYPES: { key: UserType; label: string }[] = [
  { key: "individuo", label: "Consumidor final" },
  { key: "comercio", label: "Comercio" },
];

const initials = (profile: MyProfile) => {
  const source = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.username || profile.email;
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
};

const typeLabel = (type: UserType) => USER_TYPES.find((t) => t.key === type)?.label ?? "";
const pad = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/** Un dato del perfil en la vista de solo lectura: vacío se muestra como un guion. */
function Info({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-xl bg-canvas px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd data-testid={testId} className="mt-0.5 break-words text-sm font-medium text-ink">
        {value || "–"}
      </dd>
    </div>
  );
}

/**
 * Mi perfil: los datos personales, el tipo de cuenta y las reglas de alerta. Se ve primero con los datos cargados y, con
 * el lápiz de arriba a la derecha, se pasa a editar cada campo (con «Guardar cambios» y «Cancelar»). Los límites son los de la app: nombre,
 * apellido y usuario hasta 20 caracteres (con contador), los días de las alertas de 2 a 90 y la hora del chequeo diario
 * de 0 a 23 en hora de Argentina. El usuario tiene que ser único: se consulta mientras se escribe.
 */
export default function Perfil() {
  const qc = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => (await api.get<MyProfile>("/me/profile")).data,
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [userType, setUserType] = useState<UserType>("individuo");
  const [stockMinimo, setStockMinimo] = useState("");
  const [diasAlerta, setDiasAlerta] = useState("");
  const [checkHour, setCheckHour] = useState("");
  const [usernameTaken, setUsernameTaken] = useState(false);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // Vuelve el formulario a lo guardado (al cargar, al guardar y al cancelar)
  const fill = (profile: MyProfile) => {
    setFirstName(profile.first_name ?? "");
    setLastName(profile.last_name ?? "");
    setUsername(profile.username ?? "");
    setUserType(profile.user_type);
    setStockMinimo(String(profile.stock_minimo));
    setDiasAlerta(String(profile.dias_alerta_vencimiento));
    setCheckHour(String(profile.alert_check_hour));
  };

  useEffect(() => {
    if (profile) fill(profile);
  }, [profile]);

  // ¿Ya tiene ese usuario otra cuenta? Se pregunta cuando el usuario deja de escribir
  useEffect(() => {
    const wanted = username.trim();
    if (!profile || !wanted || wanted === (profile.username ?? "")) {
      setUsernameTaken(false);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      api
        .get<{ available: boolean }>("/me/profile/username-available", { params: { username: wanted } })
        .then(({ data }) => {
          if (!cancelled) setUsernameTaken(!data.available);
        })
        .catch(() => {
          if (!cancelled) setUsernameTaken(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [username, profile]);

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.put<MyProfile>("/me/profile", {
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          username: username.trim() || null,
          user_type: userType,
          stock_minimo: Number(stockMinimo),
          dias_alerta_vencimiento: Number(diasAlerta),
          alert_check_hour: Number(checkHour),
        })
      ).data,
    onSuccess: (data) => {
      qc.setQueryData(["my-profile"], data);
      invalidateInventory(qc);
      qc.invalidateQueries({ queryKey: ["my-alerts"] });
      setOkMessage("Cambios guardados.");
      setError(null);
      setEditing(false);
    },
    onError: (err: any) => {
      setError(apiErrorMessage(err, "No se pudo guardar."));
      setOkMessage(null);
    },
  });

  const rulesValid = inRange(stockMinimo, DAYS_MIN, DAYS_MAX) && inRange(diasAlerta, DAYS_MIN, DAYS_MAX) && inRange(checkHour, 0, HOUR_MAX);
  const canSave = rulesValid && !usernameTaken && !save.isPending;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setOkMessage(null);
    if (canSave) save.mutate();
  };

  if (isLoading || !profile) return <Spinner />;

  const startEditing = () => {
    fill(profile);
    setOkMessage(null);
    setError(null);
    setEditing(true);
  };
  const cancelEditing = () => {
    fill(profile);
    setError(null);
    setEditing(false);
  };

  const counter = (value: string) => `${value.length}/${TEXT_MAX}`;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Mi perfil" subtitle="Tus datos y las reglas de alerta de stock y vencimiento" />

      <Card className="mb-4 flex items-center gap-4">
        <span
          data-testid="profile-avatar"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-xl font-bold text-primary"
        >
          {initials(profile)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-ink">
            {[profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Sin nombre cargado"}
          </p>
          <p className="truncate text-sm text-muted">{profile.email}</p>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primaryDark px-3 py-0.5 text-xs font-semibold text-white" data-testid="profile-type-badge">
            {profile.user_type === "comercio" ? <Store size={12} /> : <User size={12} />}
            {typeLabel(profile.user_type)}
          </span>
        </div>
        {!editing && (
          <button
            type="button"
            data-testid="profile-edit"
            aria-label="Editar perfil"
            title="Editar perfil"
            onClick={startEditing}
            className="shrink-0 rounded-full border border-line p-2.5 text-primaryDark transition hover:bg-primary/10"
          >
            <Pencil size={18} />
          </button>
        )}
      </Card>

      {okMessage && !editing && (
        <div className="mb-4">
          <Notice tone="ok">{okMessage}</Notice>
        </div>
      )}

      {!editing ? (
        <div className="space-y-4" data-testid="profile-view">
          <Card className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Datos personales</p>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Info label="Nombre" value={profile.first_name ?? ""} testId="profile-view-first-name" />
              <Info label="Apellido" value={profile.last_name ?? ""} testId="profile-view-last-name" />
              <Info label="Mail" value={profile.email} testId="profile-view-email" />
              <Info label="Usuario" value={profile.username ?? ""} testId="profile-view-username" />
            </dl>
          </Card>
          <Card className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Configuración</p>
            <dl className="space-y-3">
              <div className="rounded-xl bg-canvas px-3 py-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Tipo de cuenta</dt>
                <dd className="mt-1">
                  <span
                    data-testid="profile-view-type"
                    className="inline-block rounded-full bg-teal-100 px-3 py-1 text-sm font-semibold text-teal-800"
                    style={{ backgroundColor: "#d4f1ee", color: "#1f7a70" }}
                  >
                    {typeLabel(profile.user_type)}
                  </span>
                </dd>
                <dd className="mt-1 text-xs text-muted">Ajusta las predicciones de consumo a tu escala de uso</dd>
              </div>
              <Info label="Alertar si el stock se agota en menos de" value={`${profile.stock_minimo} días`} testId="profile-view-stock-days" />
              <Info label="Alertar si el producto vence en menos de" value={`${profile.dias_alerta_vencimiento} días`} testId="profile-view-expiry-days" />
              <Info label="Hora del chequeo diario de alertas" value={`${pad(profile.alert_check_hour)} hs · Hora de Argentina (UTC-3)`} testId="profile-view-check-hour" />
            </dl>
            <p className="text-xs text-muted">
              Estas reglas valen para todos tus productos; si un producto tiene la suya, esa es la que manda.
            </p>
          </Card>
        </div>
      ) : (
      <form onSubmit={onSubmit} className="space-y-4">
        <Card className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Datos personales</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Nombre"
              value={firstName}
              maxLength={TEXT_MAX}
              onChange={(e) => setFirstName(e.target.value)}
              help={counter(firstName)}
            />
            <Field
              label="Apellido"
              value={lastName}
              maxLength={TEXT_MAX}
              onChange={(e) => setLastName(e.target.value)}
              help={counter(lastName)}
            />
          </div>
          <Field
            label="Usuario"
            value={username}
            maxLength={TEXT_MAX}
            onChange={(e) => setUsername(e.target.value)}
            error={usernameTaken ? "Ese nombre de usuario ya está en uso." : null}
            help={counter(username)}
          />
          <div>
            <p className="mb-1 text-sm font-medium text-ink">Tipo de cuenta</p>
            <Segmented testIdPrefix="profile-type" options={USER_TYPES} value={userType} onChange={setUserType} />
          </div>
        </Card>

        <Card className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Reglas de alerta</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberStepper
              testId="profile-stock-days"
              label="Alertar si el stock se agota en menos de"
              value={stockMinimo}
              onChange={setStockMinimo}
              min={DAYS_MIN}
              max={DAYS_MAX}
              unit="días"
              help="Se avisa si el stock alcanza para menos de esos días."
            />
            <NumberStepper
              testId="profile-expiry-days"
              label="Alertar si el producto vence en menos de"
              value={diasAlerta}
              onChange={setDiasAlerta}
              min={DAYS_MIN}
              max={DAYS_MAX}
              unit="días"
              help="Se avisa si faltan menos de esos días para que venza."
            />
          </div>
          <NumberStepper
            testId="profile-check-hour"
            label="Hora del chequeo diario de alertas"
            value={checkHour}
            onChange={setCheckHour}
            min={0}
            max={HOUR_MAX}
            unit="horas"
            help="Hora de Argentina (UTC-3)."
          />
          <p className="text-xs text-muted">
            Estas reglas valen para todos tus productos; si un producto tiene la suya, esa es la que manda.
          </p>
        </Card>

        {error && <Notice tone="error">{error}</Notice>}

        <div className="flex gap-3">
          <Button type="button" tone="outline" className="flex-1" data-testid="profile-cancel" onClick={cancelEditing}>
            Cancelar
          </Button>
          <Button type="submit" className="flex-1" disabled={!canSave}>
            {save.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </form>
      )}
    </div>
  );
}
