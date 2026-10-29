import axios from "axios";
import { markSessionExpired } from "@/lib/sessionExpired";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8002";
const TOKEN_KEY = "backoffice_token";

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      // Un 401 con una sesión abierta es una sesión vencida; sin sesión es, por ejemplo, una contraseña incorrecta
      if (getToken()) markSessionExpired();
      setToken(null);
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);
