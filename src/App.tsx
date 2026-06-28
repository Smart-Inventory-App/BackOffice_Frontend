import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import AdminShell from "./components/AdminShell";
import Login from "./pages/Login";
import SetPassword from "./pages/SetPassword";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import UserDetail from "./pages/UserDetail";
import Products from "./pages/Products";

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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/usuarios" element={<Protected><Users /></Protected>} />
      <Route path="/usuarios/:id" element={<Protected><UserDetail /></Protected>} />
      <Route path="/productos" element={<Protected><Products /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
