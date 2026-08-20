import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "@/lib/api";
import type { Admin } from "@/lib/types";

const VIEW_AS_USER_KEY = "backoffice_view_as_user";

interface AuthState {
  admin: Admin | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
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
  };

  const logout = () => {
    setToken(null);
    setAdmin(null);
    setViewAsUser(false);
  };

  const effectiveIsAdmin = Boolean(admin?.is_admin && !viewAsUser);

  return (
    <AuthContext.Provider
      value={{ admin, loading, login, logout, viewAsUser, setViewAsUser, effectiveIsAdmin }}
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
