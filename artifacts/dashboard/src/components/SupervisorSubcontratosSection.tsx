import { useState, useEffect, useRef, useCallback } from "react";
import {
  RefreshCw, Building2, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown,
  AlertTriangle, Clock, Calendar, CheckCircle2, Phone, Mail, BarChart2,
  X, ExternalLink,
} from "lucide-react";

const API = `${window.location.origin}/api`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActividadProgress { nombre: string; avance: number }

interface ReporteReciente {
  id: string; fecha: string; estado: string;
  actividad_nombre: string | null; porcentaje_avance: number;
  tecnicos_presentes: string | null; cantidad_tecnicos: number | null;
  descripcion_trabajo: string | null;
  hora_checkin: string | null; hora_checkout: string | null;
  created_at: string;
  fotos: Array<{ url: string; tipo: string }>;
}

interface Proyecto {
  id: string; nombre: string; cliente_nombre: string; empresa_id: string;
  empresa_nombre: string; dias_maximos: number; fecha_inicio: string | null;
  fecha_fin_estimada: string | null; estado: string; estado_calculado: string;
  dias_transcurridos: number; dias_restantes: number; dias_para_iniciar: number;
  dias_vencido: number; porcentaje_dias: number; updated_at: string | null;
  actividades: ActividadProgress[]; avance_total: number;
  pendientes_count: number; ultimo_reporte_fecha: string | null;
  reportes_recientes: ReporteReciente[];
  numero_llamada?: string | null;
}

interface PendienteAprobacion {
  id: string; proyecto_id: string; fecha: string; created_at: string;
  actividad_nombre: string | null; porcentaje_avance: number;
  tecnicos_presentes: string | null; cantidad_tecnicos: number | null;
  descripcion_trabajo: string | null; hora_checkin: string | null;
  hora_checkout: string | null; fotos: Array<{ url: string; tipo: string }>;
  proyecto_nombre: string; empresa_nombre: string;
  proyecto_estado_calculado: string; dias_transcurridos: number; dias_maximos: number;
}

interface EmpresaGroup {
  id: string; nombre: string; contacto: string | null;
  telefono: string | null; correo: string | null;
  proyectos: Proyecto[]; total_activos: number; avg_avance: number;
  pendientes: number; completados_total: number;
  avg_aprobacion_horas: number | null; pct_a_tiempo: number | null;
  avg_dias_vs_estimado: number | null;
}

interface PanelKpis {
  total_activos: number; avg_avance: number; dias_promedio_restantes: number;
  pendientes_aprobacion: number; avg_aprobacion_horas: number | null;
  en_riesgo: number; proximos_a_vencer: number; por_iniciar_7d: number;
  completados_este_mes: number;
}

interface PanelData {
  kpis: PanelKpis;
  empresas: EmpresaGroup[];
  pendientes: PendienteAprobacion[];
  completados_mes: Proyecto[];
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("es-SV", { day: "2-digit", month: "short" });
}

function diasDesde(s: string): string {
  const mins = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

function timerColor(created_at: string): string {
  const mins = Math.floor((Date.now() - new Date(created_at).getTime()) / 60000);
  return mins > 120 ? "text-red-400" : mins > 60 ? "text-amber-400" : "text-green-400";
}

const ESTADO_COLORS: Record<string, { label: string; cls: string; dot: string }> = {
  por_iniciar: { label: "Por iniciar", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30", dot: "bg-blue-400" },
  en_progreso: { label: "En progreso", cls: "bg-green-500/15 text-green-400 border-green-500/30", dot: "bg-green-400" },
  en_riesgo: { label: "En riesgo", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", dot: "bg-amber-400" },
  vencido: { label: "Vencido", cls: "bg-red-500/15 text-red-400 border-red-500/30 animate-pulse", dot: "bg-red-500" },
  completado: { label: "Completado", cls: "bg-[#333]/50 text-[#666] border-[#2A2A2A]", dot: "bg-[#555]" },
};

function EstadoBadge({ estado }: { estado: string }) {
  const e = ESTADO_COLORS[estado] ?? { label: estado, cls: "bg-white/5 text-[#9A9A9A] border-[#2A2A2A]", dot: "bg-[#555]" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${e.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${e.dot}`} />
      {e.label}
    </span>
  );
}

// Mini progress bar
function MiniBar({ value, color = "#22C55E" }: { value: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="h-1.5 w-full rounded-full bg-[#2A2A2A] overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// Activity pill with progress bar
function ActividadPill({ nombre, avance }: { nombre: string; avance: number }) {
  const color = avance >= 80 ? "#22C55E" : avance >= 40 ? "#F59E0B" : "#6B7280";
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-[10px] text-[#9A9A9A] truncate max-w-[100px] shrink-0">{nombre}</span>
      <div className="flex-1 h-1 rounded-full bg-[#2A2A2A] min-w-[40px] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${avance}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] font-mono text-[#555] shrink-0">{avance}%</span>
    </div>
  );
}

// Photo thumbnails
function PhotoGrid({ fotos }: { fotos: Array<{ url: string }> | null | undefined }) {
  if (!fotos?.length) return null;
  return (
    <div className="flex gap-1.5 flex-wrap mt-1">
      {fotos.slice(0, 5).map((f, i) => (
        <a key={i} href={f.url} target="_blank" rel="noopener noreferrer">
          <img src={f.url} alt="" className="h-12 w-12 rounded-lg object-cover border border-[#2A2A2A] hover:opacity-80 transition-opacity" />
        </a>
      ))}
      {fotos.length > 5 && (
        <div className="h-12 w-12 rounded-lg border border-[#2A2A2A] bg-[#1C1C1C] flex items-center justify-center text-[10px] text-[#555]">
          +{fotos.length - 5}
        </div>
      )}
    </div>
  );
}

// Section header
function SectionHeader({ title, count, children }: { title: string; count?: number; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-semibold text-[#9A9A9A] uppercase tracking-widest">{title}</p>
        {count !== undefined && (
          <span className="rounded-full bg-[#CC0000]/20 text-[#CC0000] text-[10px] font-bold px-2 py-0.5 border border-[#CC0000]/30">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function SubKpiCard({ label, value, sub, accent = false }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 space-y-1.5 ${accent ? "border-[#CC0000]/30 bg-[#CC0000]/5" : "border-[#2A2A2A] bg-[#1C1C1C]"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#555]">{label}</p>
      <p className={`text-2xl font-bold ${accent ? "text-[#CC0000]" : "text-white"}`}>{value}</p>
      {sub && <p className="text-[10px] text-[#555]">{sub}</p>}
    </div>
  );
}

// ── Approval Card ─────────────────────────────────────────────────────────────

function AprobacionCard({
  r, approving, onAprobar, onRechazar,
}: { r: PendienteAprobacion; approving: string | null; onAprobar: (id: string) => void; onRechazar: (id: string, motivo: string) => void }) {
  const isLoading = approving === r.id;
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");

  const handleConfirmRechazo = () => {
    if (!motivo.trim()) return;
    onRechazar(r.id, motivo.trim());
    setRechazando(false);
    setMotivo("");
  };

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white truncate">{r.proyecto_nombre}</p>
          <p className="text-[10px] text-[#555]">{r.empresa_nombre}</p>
        </div>
        <span className={`text-[10px] font-mono font-semibold shrink-0 ${timerColor(r.created_at)}`}>
          {diasDesde(r.created_at)}
        </span>
      </div>

      {/* Actividad + avance */}
      {r.actividad_nombre && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#9A9A9A]">{r.actividad_nombre}</span>
            <span className="text-[10px] font-semibold text-white">{r.porcentaje_avance}%</span>
          </div>
          <MiniBar value={r.porcentaje_avance} color={r.porcentaje_avance >= 80 ? "#22C55E" : "#F59E0B"} />
        </div>
      )}

      {/* Technicians */}
      {r.tecnicos_presentes && (
        <p className="text-[10px] text-[#9A9A9A]">
          👷 {r.tecnicos_presentes}
          {r.cantidad_tecnicos && r.cantidad_tecnicos > 1 && ` (+${r.cantidad_tecnicos - 1} más)`}
        </p>
      )}

      {/* Check-in/out + date */}
      <div className="flex items-center gap-3 text-[10px] text-[#555]">
        <span>📅 {fmtDate(r.fecha)}</span>
        {r.hora_checkin && <span>⏱ {r.hora_checkin}{r.hora_checkout ? ` – ${r.hora_checkout}` : ""}</span>}
        <span>Día {r.dias_transcurridos}/{r.dias_maximos}</span>
      </div>

      {/* Description */}
      {r.descripcion_trabajo && (
        <p className="text-[11px] text-[#9A9A9A] leading-snug line-clamp-3">{r.descripcion_trabajo}</p>
      )}

      {/* Photo thumbnails */}
      <PhotoGrid fotos={r.fotos} />

      {/* Rejection reason input (shown when rechazando) */}
      {rechazando && (
        <div className="space-y-2 pt-1">
          <textarea
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo del rechazo…"
            rows={2}
            className="w-full rounded-lg border border-red-500/30 bg-[#1A1A1A] text-[11px] text-white placeholder-[#555] px-3 py-2 resize-none focus:outline-none focus:border-red-500/60"
          />
          <div className="flex gap-2">
            <button
              onClick={handleConfirmRechazo}
              disabled={!motivo.trim() || isLoading}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-[11px] font-semibold py-2 hover:bg-red-500/30 transition-colors disabled:opacity-40"
            >
              <ThumbsDown className="h-3 w-3" />Confirmar rechazo
            </button>
            <button
              onClick={() => { setRechazando(false); setMotivo(""); }}
              className="px-3 rounded-lg border border-[#333] text-[#777] text-[11px] hover:text-white hover:border-[#555] transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Actions (hidden while entering rejection reason) */}
      {!rechazando && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onAprobar(r.id)}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-green-500/15 border border-green-500/30 text-green-400 text-[11px] font-semibold py-2 hover:bg-green-500/25 transition-colors disabled:opacity-50"
          >
            {isLoading ? <span className="h-3 w-3 rounded-full border-2 border-green-400/40 border-t-green-400 animate-spin" /> : <ThumbsUp className="h-3 w-3" />}
            Aprobar
          </button>
          <button
            onClick={() => setRechazando(true)}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-[11px] font-semibold py-2 hover:bg-red-500/25 transition-colors disabled:opacity-50"
          >
            <ThumbsDown className="h-3 w-3" />Rechazar
          </button>
        </div>
      )}
    </div>
  );
}

// ── Project Row ───────────────────────────────────────────────────────────────

function ProyectoRow({
  p, expanded, onToggle, approving, onAprobar, onRechazar, onContactar, empresa,
}: {
  p: Proyecto; expanded: boolean; onToggle: () => void;
  approving: string | null; onAprobar: (id: string) => void; onRechazar: (id: string, motivo: string) => void;
  onContactar: () => void; empresa: EmpresaGroup;
}) {
  const barColor = p.estado_calculado === "vencido" ? "#EF4444"
    : p.estado_calculado === "en_riesgo" ? "#F59E0B" : "#22C55E";
  const pendingReps = p.reportes_recientes.filter((r) => r.estado === "pendiente");
  const ultimoDias = p.ultimo_reporte_fecha
    ? Math.floor((Date.now() - new Date(p.ultimo_reporte_fecha).getTime()) / 86400000)
    : null;

  return (
    <div className="border border-[#2A2A2A] rounded-xl bg-[#1C1C1C] overflow-hidden">
      {/* Header row */}
      <div className="p-3 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-semibold text-white leading-tight">{p.nombre}</p>
              {p.pendientes_count > 0 && (
                <span className="rounded-full bg-[#CC0000]/20 border border-[#CC0000]/30 text-[#CC0000] text-[10px] font-bold px-1.5 py-0.5">
                  {p.pendientes_count} pend.
                </span>
              )}
            </div>
            <p className="text-[10px] text-[#555] mt-0.5">{p.cliente_nombre}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <EstadoBadge estado={p.estado_calculado} />
            <button onClick={onToggle} className="text-[#555] hover:text-white transition-colors p-0.5">
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Days progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-[#555]">
            <span>{p.estado_calculado === "vencido" ? `${p.dias_vencido}d vencido` : `${p.dias_transcurridos}d transcurridos`}</span>
            <span>{p.estado_calculado !== "completado" ? `${p.dias_restantes}d restantes` : `${fmtDate(p.fecha_fin_estimada)}`}</span>
          </div>
          <MiniBar value={p.porcentaje_dias} color={barColor} />
          <div className="flex justify-between text-[10px] text-[#444]">
            <span>{fmtDate(p.fecha_inicio)}</span>
            <span className="font-mono">{p.dias_transcurridos}/{p.dias_maximos} días</span>
            <span>{fmtDate(p.fecha_fin_estimada)}</span>
          </div>
        </div>

        {/* Avance total */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-[#555]">
            <span>Avance general</span>
            <span className="font-semibold text-white">{p.avance_total}%</span>
          </div>
          <MiniBar value={p.avance_total} color="#CC0000" />
        </div>

        {/* Activity pills */}
        {p.actividades.length > 0 && (
          <div className="space-y-1.5 border-t border-[#222] pt-2">
            {p.actividades.map((a) => (
              <ActividadPill key={a.nombre} nombre={a.nombre} avance={a.avance} />
            ))}
          </div>
        )}

        {/* Footer meta */}
        <div className="flex items-center justify-between gap-2 text-[10px] text-[#444]">
          <span>{ultimoDias !== null ? `Último avance: hace ${ultimoDias}d` : "Sin reportes aún"}</span>
          <button
            onClick={onContactar}
            className="flex items-center gap-1 text-[10px] text-[#555] hover:text-blue-400 transition-colors"
          >
            <Phone className="h-3 w-3" />Contactar
          </button>
        </div>
      </div>

      {/* Expanded timeline */}
      {expanded && (
        <div className="border-t border-[#1A1A1A] bg-[#161616] p-3 space-y-3">
          {/* Pending approvals within this project */}
          {pendingReps.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                ⏳ Pendientes de aprobación
              </p>
              {pendingReps.map((r) => (
                <AprobacionCard
                  key={r.id}
                  r={{
                    ...r,
                    proyecto_id: p.id,
                    cantidad_tecnicos: r.cantidad_tecnicos ?? null,
                    proyecto_nombre: p.nombre,
                    empresa_nombre: p.empresa_nombre,
                    proyecto_estado_calculado: p.estado_calculado,
                    dias_transcurridos: p.dias_transcurridos,
                    dias_maximos: p.dias_maximos,
                  }}
                  approving={approving}
                  onAprobar={onAprobar}
                  onRechazar={onRechazar}
                />
              ))}
            </div>
          )}

          {/* Timeline (approved + rejected) */}
          {p.reportes_recientes.filter((r) => r.estado !== "pendiente").length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wider">Historial</p>
              {p.reportes_recientes.filter((r) => r.estado !== "pendiente").map((r) => (
                <div key={r.id} className="flex items-start gap-2 text-[10px]">
                  <span className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${r.estado === "aprobado" ? "bg-green-500" : "bg-red-500"}`} />
                  <div className="flex-1">
                    <span className="text-[#9A9A9A]">{fmtDate(r.fecha)}</span>
                    {r.actividad_nombre && <span className="text-[#555] ml-1">· {r.actividad_nombre}</span>}
                    <span className="text-[#555] ml-1">· {r.porcentaje_avance}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {p.reportes_recientes.length === 0 && (
            <p className="text-[10px] text-[#555] text-center py-2">Sin reportes registrados aún</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Contact Modal ─────────────────────────────────────────────────────────────

function ContactModal({ empresa, onClose }: { empresa: EmpresaGroup; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative rounded-2xl border border-[#2A2A2A] bg-[#161616] p-6 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-white">{empresa.nombre}</p>
            {empresa.contacto && <p className="text-[11px] text-[#555]">{empresa.contacto}</p>}
          </div>
          <button onClick={onClose} className="text-[#555] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          {empresa.telefono && (
            <a href={`tel:${empresa.telefono}`} className="flex items-center gap-3 rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] p-3 hover:bg-white/5 transition-colors">
              <Phone className="h-4 w-4 text-[#CC0000]" />
              <div>
                <p className="text-[10px] text-[#555] uppercase tracking-wide">Teléfono</p>
                <p className="text-sm text-white">{empresa.telefono}</p>
              </div>
            </a>
          )}
          {empresa.correo && (
            <a href={`mailto:${empresa.correo}`} className="flex items-center gap-3 rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] p-3 hover:bg-white/5 transition-colors">
              <Mail className="h-4 w-4 text-[#CC0000]" />
              <div>
                <p className="text-[10px] text-[#555] uppercase tracking-wide">Correo</p>
                <p className="text-sm text-white">{empresa.correo}</p>
              </div>
              <ExternalLink className="h-3 w-3 text-[#555] ml-auto" />
            </a>
          )}
          {!empresa.telefono && !empresa.correo && (
            <p className="text-xs text-[#555] text-center py-2">No hay datos de contacto registrados</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function SupervisorSubcontratosSection({ supervisorId }: { supervisorId: string }) {
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [expandedProyectos, setExpandedProyectos] = useState<Set<string>>(new Set());
  const [contactModal, setContactModal] = useState<EmpresaGroup | null>(null);
  const [completadosExpanded, setCompletadosExpanded] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Scroll refs
  const refEnRiesgo = useRef<HTMLDivElement>(null);
  const refPorIniciar = useRef<HTMLDivElement>(null);
  const refAprobaciones = useRef<HTMLDivElement>(null);
  const refCompletados = useRef<HTMLDivElement>(null);
  const refEmpresas = useRef<HTMLDivElement>(null);

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ supervisor_id: supervisorId });
      const res = await fetch(`${API}/subcontratos/supervisor-panel?${qs}`, { cache: "no-store" });
      const j = await res.json() as PanelData & { success?: boolean };
      if (j.kpis) {
        setData(j);
        setLastRefresh(new Date());
      }
    } catch { /**/ }
    setLoading(false);
  }, [supervisorId]);

  // Initial load + auto-refresh every 5 minutes
  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  const handleAprobar = async (id: string) => {
    setApproving(id);
    try {
      await fetch(`${API}/subcontratos/reporte/${id}/aprobar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aprobado_por: supervisorId }),
      });
      await load();
    } catch { /**/ }
    setApproving(null);
  };

  const handleRechazar = async (id: string, motivo: string) => {
    setApproving(id);
    try {
      await fetch(`${API}/subcontratos/reporte/${id}/rechazar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comentario_rechazo: motivo }),
      });
      await load();
    } catch { /**/ }
    setApproving(null);
  };

  function toggleProyecto(id: string) {
    setExpandedProyectos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (loading && !data) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-[#161616] border border-[#2A2A2A] animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const { kpis, empresas, pendientes, completados_mes } = data;

  // Derived data for sections E
  const allProyectos = empresas.flatMap((e) => e.proyectos);
  const enRiesgoProyectos = allProyectos.filter((p) => p.estado_calculado === "en_riesgo" || p.estado_calculado === "vencido");
  const porIniciarProyectos = allProyectos.filter((p) => p.estado_calculado === "por_iniciar");
  const empresaById = new Map(empresas.map((e) => [e.id, e]));

  const hasAnything = empresas.length > 0 || pendientes.length > 0;

  if (!hasAnything) {
    return (
      <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] p-8 text-center">
        <Building2 className="h-8 w-8 text-[#333] mx-auto mb-2" />
        <p className="text-sm text-[#555]">No tienes proyectos de subcontratos asignados</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Subsección A — Alert pills bar ──────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {kpis.en_riesgo > 0 && (
          <button onClick={() => scrollTo(refEnRiesgo)} className="flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 text-red-400 text-[11px] font-semibold px-3 py-1.5 hover:bg-red-500/20 transition-colors">
            🔴 {kpis.en_riesgo} en riesgo
          </button>
        )}
        {kpis.proximos_a_vencer > 0 && (
          <button onClick={() => scrollTo(refEnRiesgo)} className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400 text-[11px] font-semibold px-3 py-1.5 hover:bg-amber-500/20 transition-colors">
            🟡 {kpis.proximos_a_vencer} prontos a vencer
          </button>
        )}
        {kpis.por_iniciar_7d > 0 && (
          <button onClick={() => scrollTo(refPorIniciar)} className="flex items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/10 text-blue-400 text-[11px] font-semibold px-3 py-1.5 hover:bg-blue-500/20 transition-colors">
            🔵 {kpis.por_iniciar_7d} por iniciar (7d)
          </button>
        )}
        {kpis.pendientes_aprobacion > 0 && (
          <button onClick={() => scrollTo(refAprobaciones)} className="flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/10 text-green-400 text-[11px] font-semibold px-3 py-1.5 hover:bg-green-500/20 transition-colors">
            🟢 {kpis.pendientes_aprobacion} aprobaciones pendientes
          </button>
        )}
        {kpis.completados_este_mes > 0 && (
          <button onClick={() => scrollTo(refCompletados)} className="flex items-center gap-1.5 rounded-full border border-[#333] bg-[#1C1C1C] text-[#666] text-[11px] font-semibold px-3 py-1.5 hover:bg-white/5 transition-colors">
            ⚪ {kpis.completados_este_mes} completados este mes
          </button>
        )}
        <div className="ml-auto flex items-center gap-2 text-[10px] text-[#444]">
          <span>Act. {lastRefresh.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" })}</span>
          <button onClick={() => void load()} disabled={loading} className="text-[#555] hover:text-white transition-colors disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>


      {/* ── Subsección C — Proyectos por empresa ────────────────────────────── */}
      <div ref={refEmpresas}>
        <SectionHeader title="🏗️ Proyectos por Empresa" count={allProyectos.length} />
        <div className="space-y-4">
          {empresas.map((empresa) => (
            <div key={empresa.id} className="rounded-xl border border-[#2A2A2A] bg-[#161616] overflow-hidden">
              {/* Company header */}
              <div className="px-4 py-3 border-b border-[#1A1A1A] flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-[#CC0000]/10 border border-[#CC0000]/20 flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4 text-[#CC0000]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{empresa.nombre}</p>
                    <p className="text-[10px] text-[#555]">{empresa.total_activos} activo{empresa.total_activos !== 1 ? "s" : ""} · {empresa.completados_total} completado{empresa.completados_total !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[10px] text-[#555]">Avance prom.</p>
                    <p className="text-sm font-bold text-white">{empresa.avg_avance}%</p>
                  </div>
                  {empresa.pendientes > 0 && (
                    <span className="rounded-full bg-[#CC0000]/20 border border-[#CC0000]/30 text-[#CC0000] text-[10px] font-bold px-2 py-0.5">
                      {empresa.pendientes} pend.
                    </span>
                  )}
                  <button
                    onClick={() => setContactModal(empresa)}
                    className="flex items-center gap-1 text-[10px] text-[#555] hover:text-blue-400 transition-colors"
                  >
                    <Phone className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Company projects */}
              <div className="p-3 space-y-2">
                {empresa.proyectos
                  .filter((p) => p.estado_calculado !== "completado")
                  .map((p) => (
                    <ProyectoRow
                      key={p.id}
                      p={p}
                      expanded={expandedProyectos.has(p.id)}
                      onToggle={() => toggleProyecto(p.id)}
                      approving={approving}
                      onAprobar={handleAprobar}
                      onRechazar={handleRechazar}
                      onContactar={() => setContactModal(empresa)}
                      empresa={empresa}
                    />
                  ))}
                {empresa.proyectos.filter((p) => p.estado_calculado !== "completado").length === 0 && (
                  <p className="text-[10px] text-[#555] text-center py-3">No hay proyectos activos</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Subsección D — Aprobaciones pendientes ───────────────────────────── */}
      <div ref={refAprobaciones}>
        <SectionHeader title="⏳ Aprobaciones Pendientes" count={pendientes.length} />
        {pendientes.length === 0 ? (
          <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] p-6 text-center text-xs text-[#555]">
            <CheckCircle2 className="h-6 w-6 text-green-500/40 mx-auto mb-1.5" />
            Sin aprobaciones pendientes
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendientes.map((r) => (
              <AprobacionCard key={r.id} r={r} approving={approving} onAprobar={handleAprobar} onRechazar={handleRechazar} />
            ))}
          </div>
        )}
      </div>

      {/* ── Subsección E — Proyectos por estado ─────────────────────────────── */}

      {/* Por iniciar */}
      {porIniciarProyectos.length > 0 && (
        <div ref={refPorIniciar}>
          <SectionHeader title="🔵 Por Iniciar" count={porIniciarProyectos.length} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {porIniciarProyectos.map((p) => {
              const empresa = empresaById.get(p.empresa_id);
              return (
                <div key={p.id} className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-white">{p.nombre}</p>
                      <p className="text-[10px] text-[#555]">{p.empresa_nombre} · {p.cliente_nombre}</p>
                    </div>
                    <EstadoBadge estado="por_iniciar" />
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-blue-400 font-semibold">
                    <Calendar className="h-3.5 w-3.5" />
                    Inicia en {p.dias_para_iniciar} día{p.dias_para_iniciar !== 1 ? "s" : ""} hábil{p.dias_para_iniciar !== 1 ? "es" : ""}
                  </div>
                  <p className="text-[10px] text-[#555]">{fmtDate(p.fecha_inicio)} → {fmtDate(p.fecha_fin_estimada)} ({p.dias_maximos}d)</p>
                  {p.actividades.length > 0 && (
                    <div className="space-y-1 border-t border-blue-500/10 pt-2">
                      {p.actividades.map((a) => (
                        <p key={a.nombre} className="text-[10px] text-[#555]">• {a.nombre}</p>
                      ))}
                    </div>
                  )}
                  {empresa && (empresa.telefono || empresa.correo) && (
                    <button
                      onClick={() => setContactModal(empresa)}
                      className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <Phone className="h-3 w-3" />Contactar subcontratista
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* En riesgo + Vencidos */}
      {enRiesgoProyectos.length > 0 && (
        <div ref={refEnRiesgo}>
          <SectionHeader title="🟡 En Riesgo / 🔴 Vencidos" count={enRiesgoProyectos.length} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {enRiesgoProyectos.map((p) => {
              const isVencido = p.estado_calculado === "vencido";
              const empresa = empresaById.get(p.empresa_id);
              return (
                <div key={p.id} className={`rounded-xl border p-4 space-y-3 ${isVencido ? "border-red-500/30 bg-red-500/5" : "border-amber-500/25 bg-amber-500/5"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-white">{p.nombre}</p>
                      <p className="text-[10px] text-[#555]">{p.empresa_nombre} · {p.cliente_nombre}</p>
                    </div>
                    <EstadoBadge estado={p.estado_calculado} />
                  </div>
                  <div className="text-[11px] font-semibold">
                    {isVencido
                      ? <span className="text-red-400">⚠ Vencido hace {p.dias_vencido}d</span>
                      : <span className="text-amber-400">⚠ Solo {p.dias_restantes}d restantes ({Math.round(p.porcentaje_dias)}% del tiempo)</span>
                    }
                  </div>
                  <div className="space-y-1">
                    <MiniBar value={p.porcentaje_dias} color={isVencido ? "#EF4444" : "#F59E0B"} />
                    <p className="text-[10px] text-[#555]">Avance: {p.avance_total}% · Último avance: {p.ultimo_reporte_fecha ? fmtDate(p.ultimo_reporte_fecha) : "ninguno"}</p>
                  </div>
                  {empresa && (empresa.telefono || empresa.correo) && (
                    <button
                      onClick={() => setContactModal(empresa)}
                      className={`flex items-center gap-1.5 text-[11px] font-semibold ${isVencido ? "text-red-400 hover:text-red-300" : "text-amber-400 hover:text-amber-300"} transition-colors`}
                    >
                      <Phone className="h-3.5 w-3.5" />Contactar subcontratista
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completados este mes */}
      {completados_mes.length > 0 && (
        <div ref={refCompletados}>
          <SectionHeader title="✅ Completados este Mes" count={completados_mes.length}>
            <button
              onClick={() => setCompletadosExpanded((v) => !v)}
              className="text-[10px] text-[#555] hover:text-foreground transition-colors flex items-center gap-1"
            >
              {completadosExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {completadosExpanded ? "Colapsar" : "Ver"}
            </button>
          </SectionHeader>
          {completadosExpanded && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {completados_mes.map((p) => (
                <div key={p.id} className="rounded-xl border border-[#2A2A2A] bg-[#161616] p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-white">{p.nombre}</p>
                      <p className="text-[10px] text-[#555]">{p.empresa_nombre}</p>
                    </div>
                    <EstadoBadge estado="completado" />
                  </div>
                  <p className="text-[10px] text-[#555]">Avance final: {p.avance_total}% · {p.dias_transcurridos}/{p.dias_maximos}d</p>
                  <p className="text-[10px] text-[#444]">
                    {p.dias_transcurridos <= p.dias_maximos
                      ? <span className="text-green-400">✓ Entregado a tiempo</span>
                      : <span className="text-amber-400">⚠ {p.dias_transcurridos - p.dias_maximos}d sobre el plazo</span>
                    }
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Subsección F — Rendimiento por empresa ───────────────────────────── */}
      {empresas.length > 1 && (
        <div>
          <SectionHeader title="📊 Rendimiento por Empresa" />
          <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-[#1A1A1A]">
                  {["Empresa","Activos","Completados","Avance prom.","% A tiempo","Días vs estimado","Aprob. prom."].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[#555] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {empresas.map((e) => (
                  <tr key={e.id} className="border-b border-[#1A1A1A] last:border-0 hover:bg-white/2 transition-colors">
                    <td className="px-3 py-2.5 text-white font-medium">{e.nombre}</td>
                    <td className="px-3 py-2.5 text-[#9A9A9A]">{e.total_activos}</td>
                    <td className="px-3 py-2.5 text-[#9A9A9A]">{e.completados_total}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-1 rounded-full bg-[#2A2A2A] overflow-hidden">
                          <div className="h-full rounded-full bg-[#CC0000]" style={{ width: `${e.avg_avance}%` }} />
                        </div>
                        <span className="text-[#9A9A9A]">{e.avg_avance}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {e.pct_a_tiempo !== null
                        ? <span className={e.pct_a_tiempo >= 80 ? "text-green-400" : e.pct_a_tiempo >= 50 ? "text-amber-400" : "text-red-400"}>{e.pct_a_tiempo}%</span>
                        : <span className="text-[#444]">—</span>
                      }
                    </td>
                    <td className="px-3 py-2.5">
                      {e.avg_dias_vs_estimado !== null
                        ? <span className={e.avg_dias_vs_estimado <= 0 ? "text-green-400" : "text-amber-400"}>
                            {e.avg_dias_vs_estimado > 0 ? "+" : ""}{e.avg_dias_vs_estimado}d
                          </span>
                        : <span className="text-[#444]">—</span>
                      }
                    </td>
                    <td className="px-3 py-2.5 text-[#9A9A9A]">
                      {e.avg_aprobacion_horas !== null ? `${e.avg_aprobacion_horas}h` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Contact modal */}
      {contactModal && (
        <ContactModal empresa={contactModal} onClose={() => setContactModal(null)} />
      )}
    </div>
  );
}
