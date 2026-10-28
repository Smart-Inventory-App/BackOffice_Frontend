import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "@/lib/api";
import type { Admin } from "@/lib/types";
import { signOutFromGoogle } from "@/lib/google";
import { markJustLoggedIn } from "@/lib/welcome";

const VIEW_AS_USER_KEY = "backoffice_view_as_user";

interface AuthState {
  admin: Admin | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** Ingreso (y registro, si es la primera vez) con Google: se manda el idToken que dio Google. */
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => void;
  /** Vuelve a pedir los datos de la sesión (por ejemplo, después de cambiar la contraseña). */
  refresh: () => Promise<void>;
  viewAsUser: boolean;
  setViewAsUser: (value: boolean) => void;
  effectiveIsAdmin: boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewAsUser, setViewAsUserState] = useState(
    () => localStorage.getItem(VIEW_AS_USER_KEY) === "1",
  );

  const setViewAsUser = (value: boolean) => {
    setViewAsUserState(value);
    if (value) localStorage.setItem(VIEW_AS_USER_KEY, "1");
    else localStorage.removeItem(VIEW_AS_USER_KEY);
  };

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<Admin>("/admin/auth/me")
      .then((res) => setAdmin(res.data))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await api.post<{ access_token: string }>("/admin/auth/login", {
      email,
      password,
    });
    setToken(data.access_token);
    const me = await api.get<Admin>("/admin/auth/me");
    setAdmin(me.data);
    setViewAsUser(false);
    markJustLoggedIn();
  };

  const loginWithGoogle = async (idToken: string) => {
    const { data } = await api.post<{ access_token: string }>("/admin/auth/google", { id_token: idToken });
    setToken(data.access_token);
    const me = await api.get<Admin>("/admin/auth/me");
    setAdmin(me.data);
    setViewAsUser(false);
    markJustLoggedIn();
  };

  const refresh = async () => {
    const me = await api.get<Admin>("/admin/auth/me");
    setAdmin(me.data);
  };

  const logout = () => {
    // Google no tiene que volver a entrar solo con la misma cuenta
    signOutFromGoogle();
    setToken(null);
    setAdmin(null);
    setViewAsUser(false);
  };

  const effectiveIsAdmin = Boolean(admin?.is_admin && !viewAsUser);

  return (
    <AuthContext.Provider
      value={{ admin, loading, login, loginWithGoogle, logout, refresh, viewAsUser, setViewAsUser, effectiveIsAdmin }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
