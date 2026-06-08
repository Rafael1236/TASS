import { useState, useEffect, useCallback } from "react";
import { DashboardNav } from "@/components/DashboardNav";
import { DashboardFooter } from "@/components/DashboardFooter";
import { SupervisorSubcontratosSection } from "@/components/SupervisorSubcontratosSection";
import { useAuth } from "@/contexts/AuthContext";
import { RefreshCw, FolderOpen, CheckCircle2, AlertTriangle, Calendar, Clock, Timer } from "lucide-react";

const API = `${window.location.origin}/api`;

interface PanelKpis {
  total_activos: number;
  avg_avance: number;
  dias_promedio_restantes: number;
  pendientes_aprobacion: number;
  avg_aprobacion_horas: number | null;
  en_riesgo: number;
  proximos_a_vencer: number;
  por_iniciar_7d: number;
  completados_este_mes: number;
}

function KpiCard({
  label, value, sub, icon: Icon, accent = false, accentColor = "#CC0000", loading = false,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; accent?: boolean; accentColor?: string; loading?: boolean;
}) {
  const borderCls = accent ? `border-[${accentColor}]/30 bg-[${accentColor}]/5` : "border-[#2A2A2A] bg-[#1C1C1C]";
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 ${
      accent && accentColor === "#CC0000" ? "border-[#CC0000]/30 bg-[#CC0000]/5"
        : accent && accentColor === "#EF4444" ? "border-red-500/30 bg-red-500/5"
        : accent && accentColor === "#F59E0B" ? "border-amber-500/30 bg-amber-500/5"
        : accent && accentColor === "#22C55E" ? "border-green-500/30 bg-green-500/5"
        : "border-[#2A2A2A] bg-[#1C1C1C]"
    }`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9A9A9A] leading-tight">{label}</span>
        <Icon className="h-3.5 w-3.5 text-[#444]" />
      </div>
      {loading
        ? <div className="h-9 w-20 bg-white/5 rounded animate-pulse" />
        : <span className={`text-3xl font-bold tracking-tight leading-none ${
            accent && accentColor === "#EF4444" ? "text-red-400"
              : accent && accentColor === "#F59E0B" ? "text-amber-400"
              : accent && accentColor === "#22C55E" ? "text-green-400"
              : accent ? "text-[#CC0000]"
              : "text-white"
          }`}>{value}</span>
      }
      {!loading && sub && <span className="text-[10px] text-[#555]">{sub}</span>}
    </div>
  );
}

function AprobacionKpiCard({
  horas, loading,
}: { horas: number | null; loading: boolean }) {
  const color = horas === null ? "text-white"
    : horas < 2 ? "text-green-400"
    : horas < 8 ? "text-amber-400"
    : "text-red-400";
  const borderCls = horas !== null && horas >= 8 ? "border-red-500/30 bg-red-500/5"
    : horas !== null && horas < 2 ? "border-green-500/30 bg-green-500/5"
    : "border-[#2A2A2A] bg-[#1C1C1C]";
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 ${borderCls}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9A9A9A] leading-tight">
          Mi tiempo prom. aprobación
        </span>
        <Timer className="h-3.5 w-3.5 text-[#444]" />
      </div>
      {loading
        ? <div className="h-9 w-20 bg-white/5 rounded animate-pulse" />
        : <span className={`text-3xl font-bold tracking-tight leading-none ${color}`}>
            {horas !== null ? `${horas}h` : "—"}
          </span>
      }
      {!loading && <span className="text-[10px] text-[#555]">promedio desde envío hasta aprobación</span>}
    </div>
  );
}

export default function SupervisorSubcontratosPage() {
  const { usuario } = useAuth();
  const supervisorId = usuario?.id ?? "";

  const [kpis, setKpis] = useState<PanelKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [sectionKey, setSectionKey] = useState(0);

  const loadKpis = useCallback(async () => {
    if (!supervisorId) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ supervisor_id: supervisorId });
      const res = await fetch(`${API}/subcontratos/supervisor-panel?${qs}`, { cache: "no-store" });
      const j = await res.json() as { kpis?: PanelKpis };
      if (j.kpis) setKpis(j.kpis);
    } catch { /**/ }
    setLoading(false);
  }, [supervisorId]);

  useEffect(() => { void loadKpis(); }, [loadKpis]);

  const handleRefresh = () => {
    void loadKpis();
    setSectionKey((k) => k + 1);
  };

  if (!usuario) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardNav />

      <div className="mx-auto w-full max-w-[1280px] px-4 py-6 space-y-6">

        {/* Header banner */}
        <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] px-5 py-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-[#CC0000]/10 border border-[#CC0000]/20 flex items-center justify-center shrink-0">
            <FolderOpen className="h-4 w-4 text-[#CC0000]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">Mis Subcontratos</p>
            <p className="text-[11px] text-[#555]">Proyectos asignados a ti · solo ves tus subcontratistas</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="text-[#555] hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* ── Row 1 — Overview KPIs ────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="🏗️ Proyectos activos"
              value={kpis?.total_activos ?? 0}
              icon={FolderOpen}
              loading={loading}
            />
            <KpiCard
              label="✅ Completados este mes"
              value={kpis?.completados_este_mes ?? 0}
              icon={CheckCircle2}
              accent={(kpis?.completados_este_mes ?? 0) > 0}
              accentColor="#22C55E"
              loading={loading}
            />
            <KpiCard
              label="⚠️ En riesgo"
              value={kpis?.en_riesgo ?? 0}
              icon={AlertTriangle}
              accent={(kpis?.en_riesgo ?? 0) > 0}
              accentColor="#EF4444"
              loading={loading}
              sub={(kpis?.en_riesgo ?? 0) > 0 ? ">80% días consumidos" : "sin proyectos en riesgo"}
            />
            <KpiCard
              label="🔵 Por iniciar"
              value={kpis?.por_iniciar_7d ?? 0}
              icon={Calendar}
              loading={loading}
              sub="inician en los próximos 7 días"
            />
          </div>

          {/* ── Row 2 — Performance KPIs ──────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="⏳ Aprobaciones pendientes"
              value={kpis?.pendientes_aprobacion ?? 0}
              icon={Clock}
              accent={(kpis?.pendientes_aprobacion ?? 0) > 0}
              accentColor="#CC0000"
              loading={loading}
              sub={(kpis?.pendientes_aprobacion ?? 0) > 0 ? "requieren tu revisión" : "al día con aprobaciones"}
            />
            <AprobacionKpiCard horas={kpis?.avg_aprobacion_horas ?? null} loading={loading} />
            <KpiCard
              label="📊 Avance promedio"
              value={`${kpis?.avg_avance ?? 0}%`}
              icon={FolderOpen}
              loading={loading}
              sub="en proyectos activos"
            />
            <KpiCard
              label="📅 Días prom. restantes"
              value={kpis?.dias_promedio_restantes ?? 0}
              icon={Calendar}
              loading={loading}
              sub="promedio en activos"
            />
          </div>
        </section>

        {/* ── Subcontract sections A–F ─────────────────────────────────────── */}
        <SupervisorSubcontratosSection
          key={sectionKey}
          supervisorId={supervisorId}
        />

        <div className="h-20" />
      </div>

      <DashboardFooter />
    </div>
  );
}
