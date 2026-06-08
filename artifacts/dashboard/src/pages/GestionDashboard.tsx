import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardNav } from "@/components/DashboardNav";
import { DashboardFooter } from "@/components/DashboardFooter";
import { Building2, Users, BookOpen, Shield, ChevronRight } from "lucide-react";
import GestionSubcontratos from "@/pages/gestion/GestionSubcontratos";
import GestionTecnicos from "@/pages/gestion/GestionTecnicos";
import GestionClientes from "@/pages/gestion/GestionClientes";
import GestionUsuarios from "@/pages/gestion/GestionUsuarios";

export type GestionModule = "subcontratos" | "tecnicos" | "clientes" | "usuarios";

interface ModuleDef {
  key: GestionModule;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly: boolean;
}

const MODULES: ModuleDef[] = [
  { key: "subcontratos", label: "Subcontratos", desc: "Empresas y técnicos subcontratistas", icon: Building2, adminOnly: false },
  { key: "tecnicos", label: "Técnicos TAS", desc: "Personal técnico y supervisores", icon: Users, adminOnly: false },
  { key: "clientes", label: "Clientes (CRM)", desc: "Organización y datos comerciales", icon: BookOpen, adminOnly: true },
  { key: "usuarios", label: "Usuarios y Roles", desc: "Acceso al sistema", icon: Shield, adminOnly: true },
];

interface Props {
  activeModule: GestionModule;
}

export default function GestionDashboard({ activeModule }: Props) {
  const { usuario } = useAuth();
  const isAdmin = usuario?.rol === "admin";

  if (!isAdmin && (activeModule === "clientes" || activeModule === "usuarios")) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <DashboardNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-[#555]">
            <Shield className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg mb-2">Acceso restringido a administradores</p>
            <Link href="/gestion/subcontratos" className="text-sm text-[#7C3AED] hover:text-[#A78BFA]">
              Ir a Subcontratos →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const visibleModules = isAdmin ? MODULES : MODULES.filter((m) => !m.adminOnly);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <DashboardNav />
      <div className="flex flex-1 max-w-[1400px] mx-auto w-full px-4 py-6 gap-6 min-h-0">
        {/* Sidebar */}
        <aside className="w-52 shrink-0">
          <div className="sticky top-20">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-[#7C3AED]" />
              <h2 className="text-sm font-bold text-white">Gestión</h2>
            </div>
            <nav className="flex flex-col gap-1">
              {visibleModules.map((m) => {
                const isActive = activeModule === m.key;
                const Icon = m.icon;
                return (
                  <Link
                    key={m.key}
                    href={`/gestion/${m.key}`}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors border ${
                      isActive
                        ? "bg-[#7C3AED]/15 text-white border-[#7C3AED]/30"
                        : "text-[#666] hover:text-white hover:bg-white/5 border-transparent"
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-[#A78BFA]" : ""}`} />
                    <div className="min-w-0">
                      <p className={`font-medium truncate ${isActive ? "text-white" : ""}`}>{m.label}</p>
                      <p className="text-[10px] text-[#555] truncate">{m.desc}</p>
                    </div>
                    {isActive && <ChevronRight className="w-3 h-3 ml-auto text-[#7C3AED] shrink-0" />}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-hidden">
          {activeModule === "subcontratos" && <GestionSubcontratos />}
          {activeModule === "tecnicos" && <GestionTecnicos />}
          {activeModule === "clientes" && isAdmin && <GestionClientes />}
          {activeModule === "usuarios" && isAdmin && <GestionUsuarios />}
        </main>
      </div>
      <DashboardFooter />
    </div>
  );
}
