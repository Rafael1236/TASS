import { useState, useEffect, useCallback } from "react";
import { DashboardNav } from "@/components/DashboardNav";
import { RevisionSection } from "@/components/RevisionSection";
import { ReprocesosSection } from "@/components/ReprocesosSection";
import { HorasSection } from "@/components/HorasSection";
import { DashboardFooter } from "@/components/DashboardFooter";
import { SapCallReport } from "@/components/SapCallReport";
import { SmartSearchBar } from "@/components/SmartSearchBar";
import { useAuth } from "@/contexts/AuthContext";
import {
  RotateCcw, ClipboardList, Timer,
  RefreshCw, Users, BarChart2, TrendingUp, CheckCircle,
  AlertTriangle, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from "recharts";

const API = `${window.location.origin}/api`;
const TAS_RED = "#CC0000";

// ── Date helpers ───────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }
function weekAgoStr() { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); }
function monthStartStr() { const t = todayStr(); return `${t.slice(0, 7)}-01`; }

function fmtMins(m: number | null | undefined): string {
  if (m === null || m === undefined) return "—";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); const min = m % 60;
  return min > 0 ? `${h}h ${min}m` : `${h}h`;
}
function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("es-SV", { day: "2-digit", month: "short" });
}
function fmtDateShort(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return `${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")}`;
}
function diffPct(curr: number, prev: number): { val: number; sign: string; color: string } | null {
  if (!prev) return null;
  const p = Math.round(((curr - prev) / prev) * 100);
  return { val: Math.abs(p), sign: p >= 0 ? "↑" : "↓", color: p >= 0 ? "text-green-400" : "text-red-400" };
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SupKpis {
  boletas_hoy: number;
  boletas_semana: number;
  boletas_mes: number;
  pendientes_revision: number;
  pendientes_llamada: number;
  avg_revision_minutos: number | null;
  reprocesos_mes: number;
  subcontratos_activos: number;
  aprobaciones_pendientes: number;
  resumen: {
    boletas_periodo: number;
    prev_boletas: number;
    avg_revision_minutos: number | null;
    prev_avg_revision_minutos: number | null;
    reprocesos_periodo: number;
    pct_reproceso: number;
    horas_equipo: number;
  };
}

interface DiaRend {
  dia: string;
  fecha: string;
  revisadas: number;
  avg_minutos: number | null;
}

interface TecnicoRow {
  nombre: string;
  boletas: number;
  horas: number;
  reprocesos: number;
  ultima_fecha: string | null;
  ultimo_estado: string | null;
  last_boletas?: Array<{
    id: string;
    numero_reporte: number | null;
    created_at: string;
    estado_revision: string;
    cliente_nombre: string;
  }>;
}

// ── Small Components ──────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, accent = false, accentColor = TAS_RED, icon: Icon, loading = false,
}: {
  label: string; value: string | number; sub?: string; accent?: boolean;
  accentColor?: string; icon: React.ElementType; loading?: boolean;
}) {
  const accentStyle = accent
    ? { borderColor: `${accentColor}55`, backgroundColor: `${accentColor}10` }
    : {};
  return (
    <div className="rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] p-4 flex flex-col gap-2 transition-colors" style={accent ? accentStyle : {}}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9A9A9A] leading-tight">{label}</span>
        <Icon className="h-3.5 w-3.5 text-[#444]" style={accent ? { color: accentColor } : {}} />
      </div>
      {loading ? (
        <div className="h-9 w-16 bg-white/5 rounded animate-pulse" />
      ) : (
        <span className="text-3xl font-bold tracking-tight leading-none text-white" style={accent ? { color: accentColor } : {}}>{value}</span>
      )}
      {sub && !loading && <span className="text-[10px] text-[#555]">{sub}</span>}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#CC0000]" />
        <h2 className="text-sm font-semibold text-[#9A9A9A] uppercase tracking-widest">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: string | null }) {
  if (!estado) return null;
  const map: Record<string, { label: string; cls: string }> = {
    revisada: { label: "Revisada", cls: "bg-green-500/15 text-green-400 border-green-500/30" },
    pendiente_revision: { label: "Pendiente", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    pendiente_llamada: { label: "Sin llamada", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  };
  const e = map[estado] ?? { label: estado, cls: "bg-white/5 text-[#9A9A9A] border-[#2A2A2A]" };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${e.cls}`}>{e.label}</span>;
}

const tooltipStyle = { backgroundColor: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 8, color: "#fff", fontSize: 11 };

// ── Section 3: Rendimiento Charts ─────────────────────────────────────────────

function RendimientoSection({ supervisorId }: { supervisorId: string }) {
  const [data, setData] = useState<DiaRend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/revision/supervisor-rendimiento?supervisor_id=${supervisorId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { por_dia?: DiaRend[] }) => setData(j.por_dia ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [supervisorId]);

  if (loading) return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[0, 1].map((i) => <div key={i} className="h-52 rounded-xl bg-[#161616] border border-[#2A2A2A] animate-pulse" />)}
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Bar chart: boletas revisadas por día */}
      <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] p-4">
        <p className="text-[11px] font-semibold text-[#9A9A9A] uppercase tracking-wider mb-3">Boletas revisadas por día</p>
        {data.every((d) => d.revisadas === 0) ? (
          <div className="h-40 flex items-center justify-center text-xs text-[#555]">Sin datos esta semana</div>
        ) : (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <XAxis dataKey="dia" stroke="#888" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#888" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  formatter={(v: number) => [`${v} boleta${v !== 1 ? "s" : ""}`, "Revisadas"]} />
                <Bar dataKey="revisadas" fill={TAS_RED} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Line chart: tiempo promedio por día */}
      <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] p-4">
        <p className="text-[11px] font-semibold text-[#9A9A9A] uppercase tracking-wider mb-3">Tiempo promedio de revisión</p>
        {data.every((d) => d.avg_minutos === null) ? (
          <div className="h-40 flex items-center justify-center text-xs text-[#555]">Sin datos esta semana</div>
        ) : (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
                <XAxis dataKey="dia" stroke="#888" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#888" fontSize={10} tickLine={false} axisLine={false} unit="m" />
                <Tooltip contentStyle={tooltipStyle}
                  formatter={(v: number) => [`${v ?? "—"}m`, "Promedio"]} />
                <ReferenceLine y={30} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: "Meta 30m", fill: "#F59E0B", fontSize: 9 }} />
                <Line type="monotone" dataKey="avg_minutos" stroke={TAS_RED} strokeWidth={2}
                  dot={{ fill: TAS_RED, r: 3 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section 5: Mis Técnicos ───────────────────────────────────────────────────

function TecnicosSection({
  supervisorId, fechaDesde, fechaHasta,
}: { supervisorId: string; fechaDesde: string; fechaHasta: string }) {
  const [tecnicos, setTecnicos] = useState<TecnicoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ supervisor_id: supervisorId, fecha_desde: fechaDesde, fecha_hasta: fechaHasta });
      const res = await fetch(`${API}/revision/supervisor-tecnicos?${qs}`, { cache: "no-store" });
      const j = await res.json() as { tecnicos?: TecnicoRow[] };
      setTecnicos(j.tecnicos ?? []);
    } catch { /**/ }
    setLoading(false);
  }, [supervisorId, fechaDesde, fechaHasta]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="h-32 rounded-xl bg-[#161616] border border-[#2A2A2A] animate-pulse" />;
  if (!tecnicos.length) return (
    <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] p-6 text-center text-xs text-[#555]">
      Sin actividad de técnicos en el período seleccionado
    </div>
  );

  return (
    <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#2A2A2A]">
              {["Técnico", "Boletas", "Horas", "Reprocesos", "Última boleta", "Estado"].map((h) => (
                <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-[#555] uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
              <th className="px-3 py-2.5 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1C1C1C]">
            {tecnicos.map((t) => (
              <>
                <tr
                  key={t.nombre}
                  className="cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => setExpanded(expanded === t.nombre ? null : t.nombre)}
                >
                  <td className="px-3 py-2.5 text-white font-medium">{t.nombre}</td>
                  <td className="px-3 py-2.5 text-[#9A9A9A]">{t.boletas}</td>
                  <td className="px-3 py-2.5 text-[#9A9A9A]">{t.horas > 0 ? `${t.horas}h` : "—"}</td>
                  <td className="px-3 py-2.5">
                    {t.reprocesos > 0
                      ? <span className="text-amber-400 font-semibold">{t.reprocesos}</span>
                      : <span className="text-[#555]">0</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[#9A9A9A]">{fmtDate(t.ultima_fecha)}</td>
                  <td className="px-3 py-2.5"><EstadoBadge estado={t.ultimo_estado} /></td>
                  <td className="px-3 py-2.5 text-[#555]">
                    {expanded === t.nombre ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </td>
                </tr>
                {expanded === t.nombre && t.last_boletas && t.last_boletas.length > 0 && (
                  <tr key={`${t.nombre}-exp`}>
                    <td colSpan={7} className="px-3 pb-3 bg-[#0F0F0F]">
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] text-[#555] font-semibold uppercase tracking-wider mb-2">Últimas boletas</p>
                        {t.last_boletas.map((b) => (
                          <div key={b.id} className="flex items-center justify-between rounded-lg bg-[#161616] px-3 py-2">
                            <span className="text-[11px] text-[#9A9A9A]">
                              {b.numero_reporte ? `#${b.numero_reporte}` : "—"} · {b.cliente_nombre}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-[#555]">{fmtDateShort(b.created_at)}</span>
                              <EstadoBadge estado={b.estado_revision} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Section 8: Resumen del Período ────────────────────────────────────────────

function ResumenSection({
  supervisorId, fechaDesde, fechaHasta,
}: { supervisorId: string; fechaDesde: string; fechaHasta: string }) {
  const [data, setData] = useState<SupKpis["resumen"] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ supervisor_id: supervisorId, fecha_desde: fechaDesde, fecha_hasta: fechaHasta });
      const res = await fetch(`${API}/revision/supervisor-dashboard?${qs}`, { cache: "no-store" });
      const j = await res.json() as SupKpis;
      setData(j.resumen ?? null);
    } catch { /**/ }
    setLoading(false);
  }, [supervisorId, fechaDesde, fechaHasta]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="h-32 rounded-xl bg-[#161616] border border-[#2A2A2A] animate-pulse" />;
  if (!data) return null;

  const bltDiff = diffPct(data.boletas_periodo, data.prev_boletas);
  const avgCurr = data.avg_revision_minutos;
  const avgPrev = data.prev_avg_revision_minutos;
  const avgDiff = avgCurr !== null && avgPrev !== null
    ? { val: Math.abs(avgCurr - avgPrev), faster: avgCurr < avgPrev }
    : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Boletas revisadas */}
      <div className="rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] p-4 space-y-2">
        <p className="text-[10px] text-[#555] uppercase tracking-wide">Boletas en período</p>
        <p className="text-3xl font-bold text-white">{data.boletas_periodo}</p>
        {bltDiff && (
          <p className={`text-[10px] font-semibold ${bltDiff.sign === "↑" ? "text-green-400" : "text-red-400"}`}>
            {bltDiff.sign} {bltDiff.val}% vs período anterior
          </p>
        )}
      </div>
      {/* Reprocesos */}
      <div className="rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] p-4 space-y-2">
        <p className="text-[10px] text-[#555] uppercase tracking-wide">Reprocesos</p>
        <p className={`text-3xl font-bold ${data.reprocesos_periodo > 0 ? "text-amber-400" : "text-white"}`}>
          {data.reprocesos_periodo}
        </p>
        <p className="text-[10px] text-[#555]">{data.pct_reproceso}% del total</p>
      </div>
      {/* Tiempo promedio */}
      <div className="rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] p-4 space-y-2">
        <p className="text-[10px] text-[#555] uppercase tracking-wide">Tiempo prom. revisión</p>
        <p className={`text-3xl font-bold ${
          avgCurr === null ? "text-white"
            : avgCurr < 30 ? "text-green-400"
            : avgCurr < 60 ? "text-amber-400"
            : "text-red-400"
        }`}>{fmtMins(avgCurr)}</p>
        {avgDiff && (
          <p className={`text-[10px] font-semibold ${avgDiff.faster ? "text-green-400" : "text-red-400"}`}>
            {avgDiff.faster ? "↓" : "↑"} {avgDiff.val}m vs período anterior
          </p>
        )}
      </div>
      {/* Horas equipo */}
      <div className="rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] p-4 space-y-2">
        <p className="text-[10px] text-[#555] uppercase tracking-wide">Horas equipo</p>
        <p className="text-3xl font-bold text-white">{data.horas_equipo}h</p>
        <p className="text-[10px] text-[#555]">registradas en el período</p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SupervisorDashboard() {
  const { usuario } = useAuth();

  const [sapActive, setSapActive] = useState<string | null>(null);
  const [searchResetKey, setSearchResetKey] = useState(0);
  const [fechaDesde, setFechaDesde] = useState(todayStr);
  const [fechaHasta, setFechaHasta] = useState(todayStr);
  const [kpis, setKpis] = useState<SupKpis | null>(null);
  const [kpisLoading, setKpisLoading] = useState(true);

  if (!usuario) return null;
  const supervisorId = usuario.id;

  const loadKpis = useCallback(async () => {
    setKpisLoading(true);
    try {
      const qs = new URLSearchParams({ supervisor_id: supervisorId, _t: String(Date.now()) });
      const res = await fetch(`${API}/revision/supervisor-dashboard?${qs}`, { cache: "no-store" });
      const j = await res.json() as SupKpis;
      setKpis(j);
    } catch { /**/ }
    setKpisLoading(false);
  }, [supervisorId]);

  useEffect(() => { void loadKpis(); }, [loadKpis]);

  function handleDateChange(desde: string, hasta: string) {
    setFechaDesde(desde);
    setFechaHasta(hasta);
  }

  function handleReset() {
    setFechaDesde(todayStr());
    setFechaHasta(todayStr());
    setSapActive(null);
    setSearchResetKey((k) => k + 1);
  }

  const pendingTotal = (kpis?.pendientes_revision ?? 0) + (kpis?.pendientes_llamada ?? 0);
  const avgMins = kpis?.avg_revision_minutos ?? null;
  const avgColor = avgMins === null ? "text-white" : avgMins < 30 ? "text-green-400" : avgMins < 60 ? "text-amber-400" : "text-red-400";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardNav />

      <div className="mx-auto w-full max-w-[1280px] px-4 py-6 space-y-8">

        {/* Welcome banner */}
        <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] px-5 py-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-[#CC0000]/10 border border-[#CC0000]/20 flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-[#CC0000]">{usuario.nombre.charAt(0).toUpperCase()}</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">Hola, {usuario.nombre.split(" ")[0]}</p>
            <p className="text-[11px] text-[#555]">Vista de supervisión — solo ves datos asignados a ti</p>
          </div>
          <button onClick={() => void loadKpis()} className="text-[#555] hover:text-white transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* Unified Smart Search */}
        <SmartSearchBar key={searchResetKey} onSapSelect={setSapActive} supervisorId={supervisorId} />

        {sapActive ? (
          <SapCallReport numeroChamada={sapActive} onBack={() => setSapActive(null)} />
        ) : (
          <>
            {/* ── SECTION 1: KPI Cards ─────────────────────────────────────── */}
            <section className="space-y-3">
              {/* Row 1 — Actividad */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard label="Boletas hoy" value={kpis?.boletas_hoy ?? 0} icon={ClipboardList} loading={kpisLoading} />
                <KpiCard label="Boletas esta semana" value={kpis?.boletas_semana ?? 0} icon={ClipboardList} loading={kpisLoading} />
                <KpiCard label="Boletas este mes" value={kpis?.boletas_mes ?? 0} icon={BarChart2} loading={kpisLoading} />
                <KpiCard
                  label="Pendientes de revisión" value={pendingTotal}
                  icon={AlertTriangle} accent={pendingTotal > 0} accentColor={TAS_RED} loading={kpisLoading}
                />
              </div>
              {/* Row 2 — Rendimiento */}
              <div className="grid grid-cols-2 gap-3">
                {/* Avg revision — colored */}
                <div className={`rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] p-4 flex flex-col gap-2 ${
                  avgMins !== null && avgMins < 30 ? "border-green-500/30 bg-green-500/5"
                    : avgMins !== null && avgMins >= 60 ? "border-red-500/30 bg-red-500/5"
                    : avgMins !== null ? "border-amber-500/30 bg-amber-500/5" : ""
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9A9A9A] leading-tight">Mi tiempo prom. revisión</span>
                    <Timer className="h-3.5 w-3.5 text-[#444]" />
                  </div>
                  {kpisLoading
                    ? <div className="h-9 w-20 bg-white/5 rounded animate-pulse" />
                    : <span className={`text-3xl font-bold tracking-tight leading-none ${avgColor}`}>{fmtMins(avgMins)}</span>}
                  {!kpisLoading && <span className="text-[10px] text-[#555]">este mes · meta: &lt;30m</span>}
                </div>
                <KpiCard
                  label="Reprocesos este mes" value={kpis?.reprocesos_mes ?? 0}
                  icon={RotateCcw} accent={(kpis?.reprocesos_mes ?? 0) > 0} accentColor="#F59E0B" loading={kpisLoading}
                />
              </div>
            </section>

            {/* ── Date filter bar ───────────────────────────────────────────── */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-[#555] uppercase tracking-widest font-semibold">Período:</span>
              {[
                { label: "Hoy", fn: () => handleDateChange(todayStr(), todayStr()) },
                { label: "Esta semana", fn: () => handleDateChange(weekAgoStr(), todayStr()) },
                { label: "Este mes", fn: () => handleDateChange(monthStartStr(), todayStr()) },
              ].map(({ label, fn }) => (
                <button key={label} onClick={fn} className="rounded-full border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1 text-[10px] text-[#666] hover:border-[#CC0000]/40 hover:text-white transition-colors">{label}</button>
              ))}
              <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="h-7 rounded-lg border border-[#2A2A2A] bg-[#1C1C1C] px-2 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-[#CC0000]/40" />
              <span className="text-[#555] text-xs">→</span>
              <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="h-7 rounded-lg border border-[#2A2A2A] bg-[#1C1C1C] px-2 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-[#CC0000]/40" />
              <button onClick={handleReset} className="ml-auto flex items-center gap-1.5 rounded-full border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[10px] text-[#666] hover:border-[#CC0000]/40 hover:text-white transition-colors">
                <RotateCcw className="h-3 w-3" />Restablecer filtros
              </button>
            </div>

            {/* ── SECTION 2: Mis Boletas Pendientes ────────────────────────── */}
            <section className="space-y-4">
              <SectionHeader icon={ClipboardList} title="Mis Boletas Pendientes" />
              <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-2.5">
                <span className="text-blue-400 text-xs">ℹ️</span>
                <p className="text-xs text-blue-400">Las boletas pendientes siempre se muestran independientemente del filtro de fechas.</p>
              </div>
              <RevisionSection
                supervisorId={supervisorId}
                supervisorNombre={usuario.nombre}
                showSupervisorBreakdown={false}
              />
            </section>

            {/* ── SECTION 3: Mi Rendimiento ─────────────────────────────────── */}
            <section className="space-y-4">
              <SectionHeader icon={TrendingUp} title="Mi Rendimiento esta semana" />
              <RendimientoSection supervisorId={supervisorId} />
            </section>

            {/* ── SECTION 4: Reprocesos ────────────────────────────────────── */}
            <section className="space-y-4">
              <SectionHeader icon={RotateCcw} title="Reprocesos" />
              <ReprocesosSection
                fechaDesde={fechaDesde}
                fechaHasta={fechaHasta}
                supervisorId={supervisorId}
                onSapSelect={(num) => setSapActive(num)}
              />
            </section>

            {/* ── SECTION 5: Mis Técnicos ───────────────────────────────────── */}
            <section className="space-y-4">
              <SectionHeader icon={Users} title="Actividad de Mis Técnicos" />
              <TecnicosSection
                supervisorId={supervisorId}
                fechaDesde={fechaDesde}
                fechaHasta={fechaHasta}
              />
            </section>

            {/* ── SECTION 6: Horas de Mi Equipo ────────────────────────────── */}
            <section className="space-y-4">
              <SectionHeader icon={Timer} title="Horas de Mi Equipo" />
              <HorasSection
                fechaDesde={fechaDesde}
                fechaHasta={fechaHasta}
                supervisorId={supervisorId}
              />
            </section>

            {/* ── SECTION 7: Resumen del Período ───────────────────────────── */}
            <section className="space-y-4">
              <SectionHeader icon={CheckCircle} title="Mi Resumen del Período" />
              <ResumenSection
                supervisorId={supervisorId}
                fechaDesde={fechaDesde}
                fechaHasta={fechaHasta}
              />
            </section>
          </>
        )}

        <div className="h-20" />
      </div>

      <DashboardFooter />
    </div>
  );
}
