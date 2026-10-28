import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Store, User } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Card, Field, Notice, PageHeader, Segmented, Spinner } from "@/components/ui";
import NumberStepper, { inRange } from "@/components/NumberStepper";
import type { MyProfile } from "@/lib/types";
import { apiErrorMessage } from "@/lib/errors";

// Los mismos límites que valida el servicio y la app
export const TEXT_MAX = 20;
export const DAYS_MIN = 2;
export const DAYS_MAX = 90;
export const HOUR_MAX = 23;

type UserType = MyProfile["user_type"];

const USER_TYPES: { key: UserType; label: string }[] = [
  { key: "individuo", label: "Individuo" },
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

/**
 * Mi perfil: los datos personales, el tipo de cuenta y las reglas de alerta. Los límites son los de la app: nombre,
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

  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.first_name ?? "");
    setLastName(profile.last_name ?? "");
    setUsername(profile.username ?? "");
    setUserType(profile.user_type);
    setStockMinimo(String(profile.stock_minimo));
    setDiasAlerta(String(profile.dias_alerta_vencimiento));
    setCheckHour(String(profile.alert_check_hour));
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
      qc.invalidateQueries({ queryKey: ["my-stats"] });
      qc.invalidateQueries({ queryKey: ["my-alerts"] });
      setOkMessage("Cambios guardados.");
      setError(null);
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
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-ink">
            {[profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Sin nombre cargado"}
          </p>
          <p className="truncate text-sm text-muted">{profile.email}</p>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primaryDark px-3 py-0.5 text-xs font-semibold text-white" data-testid="profile-type-badge">
            {profile.user_type === "comercio" ? <Store size={12} /> : <User size={12} />}
            {profile.user_type === "comercio" ? "Comercio" : "Individuo"}
          </span>
        </div>
      </Card>

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
              label="Stock mínimo (días de cobertura)"
              value={stockMinimo}
              onChange={setStockMinimo}
              min={DAYS_MIN}
              max={DAYS_MAX}
              unit="días"
              help="Se avisa si el stock alcanza para menos de esos días."
            />
            <NumberStepper
              testId="profile-expiry-days"
              label="Aviso de vencimiento (días)"
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
            label="Hora del chequeo diario"
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
        {okMessage && <Notice tone="ok">{okMessage}</Notice>}

        <Button type="submit" className="w-full" disabled={!canSave}>
          {save.isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </form>
    </div>
  );
}
