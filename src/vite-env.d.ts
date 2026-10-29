/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** ID del cliente «Aplicación web» de Google Cloud: el mismo que usa la app y el servicio de cuentas. Sin él no hay botón de Google. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
