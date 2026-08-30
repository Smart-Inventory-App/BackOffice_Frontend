import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import AdminShell from "./components/AdminShell";
import Login from "./pages/Login";
import SetPassword from "./pages/SetPassword";
import Dashboard from "./pages/Dashboard";
import MyDashboard from "./pages/MyDashboard";
import Users from "./pages/Users";
import UserDetail from "./pages/UserDetail";
import Products from "./pages/Products";
import MyProducts from "./pages/MyProducts";
import Cargar from "./pages/Cargar";
import Alertas from "./pages/Alertas";
import Auditoria from "./pages/Auditoria";
import Perfil from "./pages/Perfil";
import ML from "./pages/ML";
import Metricas from "./pages/Metricas";

function Protected({ children }: { children: JSX.Element }) {
  const { admin, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted">Cargando…</div>
    );
  }
  if (!admin) return <Navigate to="/login" replace />;
  return <AdminShell>{children}</AdminShell>;
}

function AdminOnly({ children }: { children: JSX.Element }) {
  const { admin, loading, effectiveIsAdmin } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted">Cargando…</div>
    );
  }
  if (!admin) return <Navigate to="/login" replace />;
  if (!effectiveIsAdmin) return <Navigate to="/" replace />;
  return <AdminShell>{children}</AdminShell>;
}

export default function App() {
  const { effectiveIsAdmin } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route
        path="/"
        element={
          <Protected>{effectiveIsAdmin ? <Dashboard /> : <MyDashboard />}</Protected>
        }
      />
      <Route path="/usuarios" element={<AdminOnly><Users /></AdminOnly>} />
      <Route path="/usuarios/:id" element={<AdminOnly><UserDetail /></AdminOnly>} />
      <Route
        path="/productos"
        element={
          <Protected>{effectiveIsAdmin ? <Products /> : <MyProducts />}</Protected>
        }
      />
      <Route path="/cargar" element={<Protected><Cargar /></Protected>} />
      <Route path="/alertas" element={<Protected><Alertas /></Protected>} />
      <Route path="/metricas" element={<Protected><Metricas /></Protected>} />
      <Route path="/perfil" element={<Protected><Perfil /></Protected>} />
      <Route path="/auditoria" element={<AdminOnly><Auditoria /></AdminOnly>} />
      <Route path="/ml" element={<AdminOnly><ML /></AdminOnly>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
