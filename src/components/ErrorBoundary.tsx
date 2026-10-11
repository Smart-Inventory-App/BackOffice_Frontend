import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  failed: boolean;
}

/**
 * Último recurso ante un error de renderizado.
 *
 * Sin esto, cualquier excepción al dibujar una pantalla desmonta toda la
 * aplicación y el usuario queda frente a una página en blanco, sin saber qué
 * pasó ni cómo seguir.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Error de interfaz:", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-xl font-semibold text-ink">Algo salió mal</h1>
          <p className="text-sm text-muted">
            Ocurrió un error inesperado al mostrar esta pantalla. Tus datos no se modificaron: recargá la página para
            seguir.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white"
          >
            Recargar
          </button>
        </div>
      </div>
    );
  }
}
