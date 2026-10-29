const EXPIRED_KEY = "backoffice_session_expired";

/**
 * Cuando la sesión se cierra porque expiró, la página se recarga en el login; este aviso sobrevive a esa recarga (queda
 * en la pestaña) para que el login le cuente a la persona qué pasó. Sin almacenamiento disponible, simplemente no se avisa.
 */
export function markSessionExpired(): void {
  try {
    sessionStorage.setItem(EXPIRED_KEY, "1");
  } catch {
    /* sin almacenamiento */
  }
}

export function sessionExpired(): boolean {
  try {
    return sessionStorage.getItem(EXPIRED_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearSessionExpired(): void {
  try {
    sessionStorage.removeItem(EXPIRED_KEY);
  } catch {
    /* sin almacenamiento */
  }
}
