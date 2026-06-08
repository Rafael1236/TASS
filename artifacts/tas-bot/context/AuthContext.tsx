import React, { createContext, useCallback, useContext, useState } from "react";

import { getApiBase } from "@/lib/apiBase";

export interface TecnicoSession {
  id: string;
  nombre: string;
  usuario: string;
  departamento: string;
  firstName: string;
  rol: "tecnico" | "supervisor" | "admin" | "subcontratista";
  empresa_id?: string | null;
}

interface LoginResult {
  success: boolean;
  message?: string;
  tipo?: "tecnico" | "subcontratista";
  web_only?: boolean;
}

interface AuthContextValue {
  tecnico: TecnicoSession | null;
  login: (usuario: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  // TODO: Remove before production launch
  devLogin: (session: TecnicoSession) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tecnico, setTecnico] = useState<TecnicoSession | null>(null);

  const login = useCallback(async (usuario: string, password: string): Promise<LoginResult> => {
    try {
      const res = await fetch(`${getApiBase()}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: usuario.trim().toLowerCase(), password }),
      });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        web_only?: boolean;
        tipo?: string;
        usuario?: {
          id: string;
          nombre: string;
          usuario: string;
          departamento: string;
          rol?: string;
          empresa_id?: string | null;
        };
        // legacy
        tecnico?: {
          id: string;
          nombre: string;
          usuario: string;
          departamento: string;
          rol?: string;
        };
      };

      // Web-only role: gerente_operaciones / gerente_comercial
      if (!json.success && json.web_only) {
        return { success: false, message: json.message, web_only: true };
      }

      if (json.success) {
        const u = json.usuario ?? json.tecnico;
        if (!u) return { success: false, message: "Respuesta inválida del servidor" };

        const nombre = u.nombre;
        const firstName = nombre.split(" ")[0] ?? nombre;
        const rawRol = u.rol ?? "tecnico";
        const rol: TecnicoSession["rol"] =
          rawRol === "admin"          ? "admin"
          : rawRol === "supervisor"   ? "supervisor"
          : rawRol === "subcontratista" ? "subcontratista"
          : "tecnico";

        const tipo = (json.tipo === "subcontratista" ? "subcontratista" : "tecnico") as "tecnico" | "subcontratista";

        setTecnico({
          id: u.id,
          nombre: u.nombre,
          usuario: u.usuario,
          departamento: u.departamento,
          firstName,
          rol,
          empresa_id: (json.usuario as { empresa_id?: string | null } | undefined)?.empresa_id ?? null,
        });

        return { success: true, tipo };
      }

      return { success: false, message: json.message ?? "Error al iniciar sesión" };
    } catch {
      return { success: false, message: "Sin conexión. Verifica tu red." };
    }
  }, []);

  const logout = useCallback(() => {
    setTecnico(null);
  }, []);

  // TODO: Remove before production launch
  const devLogin = useCallback((session: TecnicoSession) => {
    setTecnico(session);
  }, []);

  return (
    <AuthContext.Provider value={{ tecnico, login, logout, devLogin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
