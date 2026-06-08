import { useLocation, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { tabsForRol } from "@/lib/auth";
import { LogOut, User, Settings, Users, ChevronRight } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useEffect, useState, useCallback, useRef } from "react";

const tasLogoUrl = `${import.meta.env.BASE_URL}tas-logo.png`;
const API = `${window.location.origin}/api`;

interface NotifCounts {
  revision_pendientes: number;
  sin_llamada: number;
  subcontratos_pendientes: number;
  cotizaciones_pendientes: number;
}

function badgeForHref(href: string, counts: NotifCounts): number {
  if (href === "/supervisor") return counts.revision_pendientes;
  if (href === "/subcontratos") return counts.subcontratos_pendientes;
  if (href === "/operaciones") return counts.revision_pendientes;
  if (href === "/comercial") return counts.cotizaciones_pendientes + counts.sin_llamada;
  return 0;
}

export function DashboardNav() {
  const { usuario, logout } = useAuth();
  const [location] = useLocation();
  const { theme, toggle } = useTheme();
  const [counts, setCounts] = useState<NotifCounts>({
    revision_pendientes: 0,
    sin_llamada: 0,
    subcontratos_pendientes: 0,
    cotizaciones_pendientes: 0,
  });
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const fetchCounts = useCallback(async () => {
    if (!usuario) return;
    try {
      const params = new URLSearchParams();
      if (usuario.rol === "supervisor") {
        params.set("supervisor_id", usuario.id);
      }
      const res = await fetch(`${API}/dashboard/notification-counts?${params}`, { cache: "no-store" });
      if (res.ok) setCounts(await res.json());
    } catch { /* silent */ }
  }, [usuario]);

  useEffect(() => {
    fetchCounts();
    const id = setInterval(fetchCounts, 60000);
    return () => clearInterval(id);
  }, [fetchCounts]);

  // Close user menu when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [userMenuOpen]);

  if (!usuario) return null;

  const tabs = tabsForRol(usuario.rol);
  const canManage = usuario.rol === "admin" || usuario.rol === "gerente_operaciones";

  function handleLogout() {
    logout();
    window.location.href = import.meta.env.BASE_URL;
  }

  const gestionLink = usuario.rol === "admin"
    ? "/gestion/usuarios"
    : "/gestion/tecnicos";
  const gestionLabel = usuario.rol === "admin"
    ? "Gestionar usuarios"
    : "Gestionar técnicos";

  return (
    <nav className="sticky top-0 z-50 border-b border-[#2A2A2A] bg-[#0A0A0A]/95 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-[1400px] px-4 h-14 flex items-center justify-between gap-4">
        {/* Left: logo + tabs */}
        <div className="flex items-center gap-1 min-w-0">
          <img src={tasLogoUrl} alt="TAS" className="h-6 w-auto shrink-0 mr-3" />
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
            {tabs.map((tab) => {
              const isActive = location === tab.href || (tab.href !== "/" && location.startsWith(tab.href));
              const count = badgeForHref(tab.href, counts);
              const isGestion = tab.href.startsWith("/gestion");
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`relative px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-colors ${
                    isActive
                      ? isGestion
                        ? "bg-[#7C3AED] text-white"
                        : "bg-[#CC0000] text-white"
                      : "text-[#777] hover:text-white hover:bg-white/5"
                  }`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className={`absolute -top-1.5 -right-1 min-w-[17px] h-[17px] rounded-full text-[9px] font-bold flex items-center justify-center px-1 leading-none border ${
                      isActive
                        ? "bg-white text-[#CC0000] border-transparent"
                        : "bg-[#CC0000] text-white border-[#0A0A0A]"
                    }`}>
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right: user mini modal + theme toggle + logout */}
        <div className="flex items-center gap-2 shrink-0">
          {/* User mini modal */}
          {canManage && (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className={`flex items-center justify-center rounded-full border w-8 h-8 transition-colors ${
                  userMenuOpen
                    ? "border-[#7C3AED]/60 bg-[#7C3AED]/15 text-[#A78BFA]"
                    : "border-[#2A2A2A] bg-[#161616] text-[#555] hover:text-white hover:border-[#3A3A3A]"
                }`}
                title="Gestión de usuarios"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-10 w-64 bg-[#161616] border border-[#2A2A2A] rounded-xl shadow-2xl z-50 overflow-hidden">
                  {/* User info */}
                  <div className="px-4 py-3 border-b border-[#2A2A2A]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#7C3AED]/20 border border-[#7C3AED]/30 flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5 text-[#A78BFA]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{usuario.nombre}</p>
                        <p className="text-xs text-[#555] capitalize">{roleLabel(usuario.rol)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Quick links */}
                  <div className="p-2">
                    <Link
                      href={gestionLink}
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-[#AAA] hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-[#7C3AED]" />
                        <span>{gestionLabel}</span>
                      </div>
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                    {usuario.rol === "admin" && (
                      <Link
                        href="/gestion/subcontratos"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-[#AAA] hover:text-white hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Settings className="w-3.5 h-3.5 text-[#7C3AED]" />
                          <span>Panel de Gestión</span>
                        </div>
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>

                  {/* Special note for gerentes */}
                  {usuario.rol === "gerente_operaciones" && (
                    <div className="px-4 py-2 border-t border-[#2A2A2A]">
                      <p className="text-[10px] text-[#555]">Acceso a Módulos 1 y 2 de Gestión</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="hidden sm:flex items-center gap-2 text-xs text-[#666]">
            <User className="h-3.5 w-3.5" />
            <span className="font-medium text-[#999]">{usuario.nombre.split(" ")[0]}</span>
            <span className="text-[#3A3A3A] capitalize">{roleLabel(usuario.rol)}</span>
          </div>
          <button
            onClick={toggle}
            className="flex items-center justify-center rounded-full border border-[#2A2A2A] bg-[#161616] w-8 h-8 text-sm hover:border-[#3A3A3A] transition-colors"
            title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          >
            {theme === "dark" ? "🌙" : "☀️"}
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-full border border-[#2A2A2A] bg-[#161616] px-3 py-1.5 text-xs font-medium text-[#777] hover:text-white hover:border-red-500/40 transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </div>
    </nav>
  );
}

function roleLabel(rol: string): string {
  switch (rol) {
    case "admin": return "· Admin";
    case "gerente_operaciones": return "· Gte. Operaciones";
    case "supervisor": return "· Supervisor";
    case "gerente_comercial": return "· Gte. Comercial";
    default: return "";
  }
}
