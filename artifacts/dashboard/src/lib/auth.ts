export type DashboardRol = "admin" | "gerente_operaciones" | "supervisor" | "gerente_comercial";

export interface DashboardUsuario {
  id: string;
  nombre: string;
  usuario: string;
  correo: string | null;
  rol: DashboardRol;
}

const SESSION_KEY = "dashboard_session";

export function getSession(): DashboardUsuario | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DashboardUsuario;
  } catch {
    return null;
  }
}

export function setSession(usuario: DashboardUsuario): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(usuario));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

/** Returns the default route for a given role */
export function defaultRouteForRol(rol: DashboardRol): string {
  switch (rol) {
    case "admin":
    case "gerente_operaciones":
      return "/operaciones";
    case "supervisor":
      return "/supervisor";
    case "gerente_comercial":
      return "/comercial";
    default:
      return "/operaciones";
  }
}

/** Tabs visible per role */
export interface NavTab {
  label: string;
  href: string;
}

export function tabsForRol(rol: DashboardRol): NavTab[] {
  switch (rol) {
    case "admin":
      return [
        { label: "Operaciones", href: "/operaciones" },
        { label: "Comercial", href: "/comercial" },
        { label: "Subcontratos", href: "/subcontratos" },
        { label: "Supervisión", href: "/supervisor" },
        { label: "Gestión", href: "/gestion/subcontratos" },
      ];
    case "gerente_operaciones":
      return [
        { label: "Operaciones", href: "/operaciones" },
        { label: "Subcontratos", href: "/subcontratos" },
        { label: "Supervisión", href: "/supervisor" },
        { label: "Gestión", href: "/gestion/subcontratos" },
      ];
    case "supervisor":
      return [
        { label: "Mis Boletas", href: "/supervisor" },
        { label: "Mis Subcontratos", href: "/subcontratos" },
      ];
    case "gerente_comercial":
      return [
        { label: "Comercial", href: "/comercial" },
      ];
    default:
      return [];
  }
}
