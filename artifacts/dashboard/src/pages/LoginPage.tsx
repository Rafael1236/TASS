import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { defaultRouteForRol, type DashboardUsuario } from "@/lib/auth";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

const API = `${window.location.origin}/api`;
const tasLogoUrl = `${import.meta.env.BASE_URL}tas-logo.png`;

export default function LoginPage() {
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const { theme, toggle } = useTheme();

  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API}/dashboard/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: usuario.trim(), password }),
      });

      const data = (await res.json()) as { success: boolean; message?: string; usuario?: DashboardUsuario };

      if (!data.success || !data.usuario) {
        setError(data.message ?? "Credenciales inválidas");
        setLoading(false);
        return;
      }

      login(data.usuario);
      navigate(defaultRouteForRol(data.usuario.rol));
    } catch {
      setError("No se pudo conectar con el servidor. Intente nuevamente.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-4 relative">
      {/* Theme toggle */}
      <button
        onClick={toggle}
        className="absolute top-4 right-4 flex items-center justify-center rounded-full border border-[#2A2A2A] bg-[#161616] w-9 h-9 text-sm hover:border-[#3A3A3A] transition-colors"
        title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      >
        {theme === "dark" ? "🌙" : "☀️"}
      </button>
      {/* Card */}
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src={tasLogoUrl} alt="TAS" className="h-12 w-auto mb-4" />
          <h1 className="text-xl font-bold text-white tracking-tight">Panel de Gestión TAS</h1>
          <p className="text-xs text-[#555] mt-1 tracking-[0.1em] uppercase">Acceso restringido</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#555] mb-2">
              Usuario
            </label>
            <input
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="usuario"
              autoComplete="username"
              autoCapitalize="none"
              required
              className="w-full h-11 rounded-lg border border-[#2A2A2A] bg-[#161616] px-4 text-sm text-white placeholder:text-[#3A3A3A] focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50 focus:border-[#CC0000]/50 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#555] mb-2">
              Contraseña
            </label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                className="w-full h-11 rounded-lg border border-[#2A2A2A] bg-[#161616] px-4 pr-10 text-sm text-white placeholder:text-[#3A3A3A] focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50 focus:border-[#CC0000]/50 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-white transition-colors"
                tabIndex={-1}
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !usuario.trim() || !password}
            className="w-full h-11 rounded-lg bg-[#CC0000] hover:bg-[#AA0000] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Iniciando sesión…
              </>
            ) : (
              "Iniciar sesión"
            )}
          </button>
        </form>

        <p className="text-center text-[11px] text-[#333] mt-8">
          TAS El Salvador · Sistema de Reportes Técnicos
        </p>
      </div>
    </div>
  );
}
