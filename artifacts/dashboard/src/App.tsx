import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { defaultRouteForRol } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/LoginPage";
import Dashboard from "@/pages/Dashboard";
import ComercialDashboard from "@/pages/ComercialDashboard";
import SubcontratosDashboard from "@/pages/SubcontratosDashboard";
import SupervisorDashboard from "@/pages/SupervisorDashboard";
import SupervisorSubcontratosPage from "@/pages/SupervisorSubcontratosPage";
import GestionDashboard from "@/pages/GestionDashboard";

const queryClient = new QueryClient();

// ── Auth guard ────────────────────────────────────────────────────────────────

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth();
  const [location] = useLocation();

  if (!usuario) {
    return <Redirect to="/" />;
  }

  const rol = usuario.rol;

  // Role-based redirects for existing dashboards
  if (location === "/supervisor" && rol === "gerente_comercial") {
    return <Redirect to={defaultRouteForRol(rol)} />;
  }
  if (location === "/comercial" && rol === "supervisor") {
    return <Redirect to={defaultRouteForRol(rol)} />;
  }
  if ((location === "/operaciones" || location === "/") && rol === "gerente_comercial") {
    return <Redirect to="/comercial" />;
  }

  // Gestion access: only admin and gerente_operaciones
  if (location.startsWith("/gestion") && rol !== "admin" && rol !== "gerente_operaciones") {
    return <Redirect to={defaultRouteForRol(rol)} />;
  }

  return <>{children}</>;
}

// ── Router ─────────────────────────────────────────────────────────────────────

function Router() {
  const { usuario } = useAuth();

  return (
    <Switch>
      {/* Login — if already logged in redirect to their dashboard */}
      <Route path="/">
        {usuario ? <Redirect to={defaultRouteForRol(usuario.rol)} /> : <LoginPage />}
      </Route>

      {/* Protected routes */}
      <Route path="/operaciones">
        <RequireAuth><Dashboard /></RequireAuth>
      </Route>

      <Route path="/supervisor">
        <RequireAuth><SupervisorDashboard /></RequireAuth>
      </Route>

      <Route path="/comercial">
        <RequireAuth><ComercialDashboard /></RequireAuth>
      </Route>

      <Route path="/subcontratos">
        <RequireAuth>
          {usuario?.rol === "supervisor"
            ? <SupervisorSubcontratosPage />
            : <SubcontratosDashboard />}
        </RequireAuth>
      </Route>

      {/* Gestión routes */}
      <Route path="/gestion">
        <RequireAuth><Redirect to="/gestion/subcontratos" /></RequireAuth>
      </Route>

      <Route path="/gestion/subcontratos">
        <RequireAuth><GestionDashboard activeModule="subcontratos" /></RequireAuth>
      </Route>

      <Route path="/gestion/tecnicos">
        <RequireAuth><GestionDashboard activeModule="tecnicos" /></RequireAuth>
      </Route>

      <Route path="/gestion/clientes">
        <RequireAuth><GestionDashboard activeModule="clientes" /></RequireAuth>
      </Route>

      <Route path="/gestion/usuarios">
        <RequireAuth><GestionDashboard activeModule="usuarios" /></RequireAuth>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
