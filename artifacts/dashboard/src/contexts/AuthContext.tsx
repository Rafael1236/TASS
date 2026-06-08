import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { getSession, setSession, clearSession, type DashboardUsuario } from "@/lib/auth";

interface AuthContextValue {
  usuario: DashboardUsuario | null;
  login: (usuario: DashboardUsuario) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<DashboardUsuario | null>(() => getSession());

  const login = useCallback((u: DashboardUsuario) => {
    setSession(u);
    setUsuario(u);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUsuario(null);
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
