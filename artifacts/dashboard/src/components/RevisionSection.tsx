import { useState, useEffect, useCallback, useRef } from "react";
import {
  CheckCircle, AlertTriangle, Timer, RefreshCw, ClipboardCheck,
  RotateCcw, XCircle, ChevronDown, ChevronUp, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = `${window.location.origin}/api`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface TecnicoRow {
  id: string;
  nombre: string | null;
  es_subcontrato: boolean;
  es_principal: boolean;
  hora_entrada: string | null;
  hora_salida: string | null;
  total_horas: number | null;
}

interface ReportePendiente {
  id: string;
  numero_reporte: string | number | null;
  created_at: string;
  tecnico_nombre: string | null;
  supervisor_id: string | null;
  supervisor_nombre: string | null;
  cliente_nombre: string;
  numero_llamada: string | null;
  tipo_servicio: string | null;
  trabajo_realizado: string | null;
  estado_revision: string;
  es_reproceso: boolean;
  hora_entrada: string | null;
  hora_salida: string | null;
  estado_servicio: string | null;
  hay_cotizacion: boolean | null;
  descripcion_cotizacion: string | null;
  observaciones: string | null;
  numero_proyecto: string | null;
  placa_vehiculo: string | null;
  equipos_instalados: string | null;
  total_horas_equipo: number | null;
  tecnicos: TecnicoRow[];
}

interface SupervisorStat {
  nombre: string;
  avg_minutos: number;
  total_revisadas: number;
}

interface RevisionKpis {
  pendientes_revision: number;
  pendientes_llamada: number;
  revisadas_hoy: number;
  avg_revision_minutos_semana: number | null;
  reprocesos_hoy: number;
  por_supervisor: SupervisorStat[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMins(m: number | null): string {
  if (m === null || m === undefined) return "—";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return min > 0 ? `${h}h ${min}m` : `${h}h`;
}

function calcElapsed(fromIso: string): { text: string; colorClass: string } {
  const mins = Math.floor((Date.now() - new Date(fromIso).getTime()) / 60000);
  if (mins < 60) return { text: `${mins}m`, colorClass: "text-green-400" };
  if (mins < 240) {
    const h = Math.floor(mins / 60); const m = mins % 60;
    return { text: m > 0 ? `${h}h ${m}m` : `${h}h`, colorClass: "text-amber-400" };
  }
  if (mins < 1440) {
    const h = Math.floor(mins / 60); const m = mins % 60;
    return { text: m > 0 ? `${h}h ${m}m` : `${h}h`, colorClass: "text-red-400" };
  }
  const d = Math.floor(mins / 1440); const h = Math.floor((mins % 1440) / 60);
  return { text: `${d}d ${h}h`, colorClass: "text-red-500" };
}

function sinNumeroLlamada(n: string | null | undefined): boolean {
  if (!n) return true;
  const t = n.trim();
  return t === "" || t.toLowerCase() === "sin número" || t.toLowerCase() === "sin numero";
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function weekAgoStr() {
  const d = new Date(); d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

function monthAgoStr() {
  const d = new Date(); d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

// ── Supervisor avg tooltip ─────────────────────────────────────────────────────

function AvgRevisionCard({ kpis }: { kpis: RevisionKpis }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hasSups = (kpis.por_supervisor ?? []).length > 0;

  return (
    <div
      className="rounded-xl border border-[#2A2A2A] bg-[#161616] p-4 relative cursor-default"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip((v) => !v)}
    >
      <div className="flex items-center gap-1 mb-1.5">
        <p className="text-[10px] text-[#555] uppercase tracking-wide">Prom. revisión semana</p>
        {hasSups && <Info className="h-3 w-3 text-[#444] shrink-0" />}
      </div>
      <p className="text-3xl font-bold tabular-nums text-white">{fmtMins(kpis.avg_revision_minutos_semana)}</p>

      {showTooltip && hasSups && (
        <div
          ref={tooltipRef}
          className="absolute bottom-full left-0 mb-2 z-50 min-w-[220px] rounded-xl border border-[#3A3A3A] bg-[#111] shadow-2xl p-3 space-y-2"
        >
          <p className="text-[9px] text-[#555] uppercase tracking-widest mb-1 font-semibold">Por supervisor (esta semana)</p>
          {kpis.por_supervisor.map((s) => (
            <div key={s.nombre} className="flex items-center justify-between gap-4">
              <span className="text-xs text-[#C0C0C0] truncate max-w-[130px]">{s.nombre}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-white">{fmtMins(s.avg_minutos)}</span>
                <span className="text-[9px] text-[#555]">({s.total_revisadas})</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Boleta card ───────────────────────────────────────────────────────────────

function BoletaCard({
  reporte,
  onRemove,
  onReload,
  revisadoPor,
  showSupervisor,
}: {
  reporte: ReportePendiente;
  onRemove: (id: string) => void;
  onReload: () => void;
  revisadoPor: string;
  showSupervisor: boolean;
}) {
  const { toast } = useToast();
  const [esReproceso, setEsReproceso] = useState(reporte.es_reproceso);
  const [loading, setLoading] = useState<"revisar" | "solicitar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const elapsed = calcElapsed(reporte.created_at);
  const noLlamada = sinNumeroLlamada(reporte.numero_llamada);
  const esPendLlamada = reporte.estado_revision === "pendiente_llamada";

  async function handleRevisar() {
    setLoading("revisar");
    setError(null);
    try {
      const resp = await fetch(`${API}/revision/${reporte.id}/revisar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisado_por: revisadoPor, es_reproceso: esReproceso }),
        cache: "no-store",
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(body.error ?? `HTTP ${resp.status}`);
      }
      onRemove(reporte.id);
      onReload();
      toast({ title: `✓ Boleta #${reporte.numero_reporte} revisada`, description: esReproceso ? "Marcada como reproceso" : undefined });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setError(msg);
      toast({ title: "Error al revisar", description: msg, variant: "destructive" });
      setLoading(null);
    }
  }

  async function handleSolicitarLlamada() {
    setLoading("solicitar");
    setError(null);
    try {
      const resp = await fetch(`${API}/revision/${reporte.id}/solicitar-llamada`, {
        method: "PATCH",
        cache: "no-store",
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(body.error ?? `HTTP ${resp.status}`);
      }
      onRemove(reporte.id);
      onReload();
      toast({ title: `⚠️ # llamada solicitado`, description: `Boleta #${reporte.numero_reporte} movida a pendientes de llamada.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setError(msg);
      toast({ title: "Error al solicitar llamada", description: msg, variant: "destructive" });
      setLoading(null);
    }
  }

  return (
    <div className={`rounded-xl border overflow-hidden flex flex-col ${esPendLlamada ? "border-amber-500/30 bg-[#161616]" : "border-[#2A2A2A] bg-[#161616]"}`}>
      <div className="p-4 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 flex-wrap mb-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-white text-sm">
                #{reporte.numero_reporte ?? reporte.id.slice(0, 8)}
              </span>
              <span className="text-[11px] text-[#555]">
                {new Date(reporte.created_at).toLocaleDateString("es-SV", { day: "2-digit", month: "short" })}
              </span>
              {esReproceso && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                  <RotateCcw className="h-2.5 w-2.5" />Reproceso
                </span>
              )}
              {esPendLlamada && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                  ⚠️ Sin # llamada
                </span>
              )}
            </div>
            <p className="text-xs text-[#666] mt-0.5">
              {reporte.tecnico_nombre ?? "—"} · {reporte.cliente_nombre}
            </p>
            {showSupervisor && reporte.supervisor_nombre && (
              <p className="text-[11px] text-blue-400/70 mt-0.5 flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400/50 shrink-0" />
                {reporte.supervisor_nombre}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {noLlamada ? (
              <span className="text-[11px] font-semibold text-[#CC0000] bg-red-500/10 border border-red-500/20 rounded px-2 py-0.5">
                Sin # llamada
              </span>
            ) : (
              <span className="text-[11px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded px-2 py-0.5">
                SAP #{reporte.numero_llamada}
              </span>
            )}
            <div className="flex items-center gap-1">
              <Timer className="h-3 w-3 text-[#555]" />
              <span className={`text-[11px] font-semibold ${elapsed.colorClass}`}>
                {elapsed.text}
              </span>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="grid grid-cols-1 gap-2 mb-3">
          {reporte.tipo_servicio && (
            <div className="rounded-lg bg-[#1E1E1E] px-3 py-2">
              <p className="text-[10px] text-[#555] uppercase tracking-wide mb-0.5">Tipo de servicio</p>
              <p className="text-xs text-white font-medium">{reporte.tipo_servicio}</p>
            </div>
          )}

          {expanded && reporte.tecnicos && reporte.tecnicos.length > 0 && (
            <div className="rounded-lg bg-[#1E1E1E] px-3 py-2.5">
              <p className="text-[10px] text-[#555] uppercase tracking-wide mb-2">👥 Personal en sitio</p>
              <div className="space-y-1.5">
                {reporte.tecnicos
                  .slice()
                  .sort((a, b) => (b.es_principal ? 1 : 0) - (a.es_principal ? 1 : 0))
                  .map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs text-white font-medium truncate">{t.nombre ?? "—"}</span>
                      {t.es_principal ? (
                        <span className="inline-flex rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-[9px] font-bold px-1.5 py-0.5 shrink-0">Principal</span>
                      ) : (
                        <span className="inline-flex rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 text-[9px] font-bold px-1.5 py-0.5 shrink-0">Auxiliar TAS</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-[#777]">
                      <span>{t.hora_entrada ?? "—"} → {t.hora_salida ?? "—"}</span>
                      {t.total_horas !== null && <span className="text-[#555]">· {t.total_horas}h</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-[#2A2A2A] flex items-center justify-between gap-2 text-[10px] text-[#555]">
                <span>Total personas: <strong className="text-[#9A9A9A]">{reporte.tecnicos.length}</strong></span>
                {reporte.total_horas_equipo !== null && reporte.total_horas_equipo !== undefined && (
                  <span>Total horas equipo: <strong className="text-[#9A9A9A]">{reporte.total_horas_equipo}h</strong></span>
                )}
              </div>
            </div>
          )}

          {reporte.trabajo_realizado && (
            <div className="rounded-lg bg-[#1E1E1E] px-3 py-2">
              <p className="text-[10px] text-[#555] uppercase tracking-wide mb-0.5">Trabajo realizado</p>
              <p className={`text-xs text-[#C0C0C0] leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>{reporte.trabajo_realizado}</p>
            </div>
          )}
          {expanded && (
            <div className="grid grid-cols-2 gap-2">
              {(reporte.hora_entrada || reporte.hora_salida) && (
                <div className="rounded-lg bg-[#1E1E1E] px-3 py-2 col-span-2">
                  <p className="text-[10px] text-[#555] uppercase tracking-wide mb-0.5">Horario</p>
                  <p className="text-xs text-white font-medium">{reporte.hora_entrada ?? "—"} → {reporte.hora_salida ?? "—"}</p>
                </div>
              )}
              {reporte.estado_servicio && (
                <div className="rounded-lg bg-[#1E1E1E] px-3 py-2">
                  <p className="text-[10px] text-[#555] uppercase tracking-wide mb-0.5">Estado</p>
                  <p className="text-xs text-white font-medium">{reporte.estado_servicio}</p>
                </div>
              )}
              {reporte.numero_proyecto && (
                <div className="rounded-lg bg-[#1E1E1E] px-3 py-2">
                  <p className="text-[10px] text-[#555] uppercase tracking-wide mb-0.5">N° Proyecto</p>
                  <p className="text-xs text-white font-mono">{reporte.numero_proyecto}</p>
                </div>
              )}
              {reporte.placa_vehiculo && (
                <div className="rounded-lg bg-[#1E1E1E] px-3 py-2">
                  <p className="text-[10px] text-[#555] uppercase tracking-wide mb-0.5">Placa vehículo</p>
                  <p className="text-xs text-white font-mono">{reporte.placa_vehiculo}</p>
                </div>
              )}
              {reporte.equipos_instalados && (
                <div className="rounded-lg bg-[#1E1E1E] px-3 py-2">
                  <p className="text-[10px] text-[#555] uppercase tracking-wide mb-0.5">Equipos inst.</p>
                  <p className="text-xs text-white">{reporte.equipos_instalados}</p>
                </div>
              )}
              {reporte.hay_cotizacion !== null && reporte.hay_cotizacion !== undefined && (
                <div className="rounded-lg bg-[#1E1E1E] px-3 py-2">
                  <p className="text-[10px] text-[#555] uppercase tracking-wide mb-0.5">Cotización</p>
                  <p className="text-xs text-white font-medium">{reporte.hay_cotizacion ? "Sí" : "No"}</p>
                </div>
              )}
              {reporte.descripcion_cotizacion && (
                <div className="rounded-lg bg-[#1E1E1E] px-3 py-2 col-span-2">
                  <p className="text-[10px] text-[#555] uppercase tracking-wide mb-0.5">Descripción cotización</p>
                  <p className="text-xs text-[#C0C0C0] leading-relaxed">{reporte.descripcion_cotizacion}</p>
                </div>
              )}
              {reporte.observaciones && (
                <div className="rounded-lg bg-[#1E1E1E] px-3 py-2 col-span-2">
                  <p className="text-[10px] text-[#555] uppercase tracking-wide mb-0.5">Observaciones</p>
                  <p className="text-xs text-[#C0C0C0] leading-relaxed">{reporte.observaciones}</p>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-[#555] hover:text-[#9A9A9A] transition-colors py-0.5"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Ver menos" : "Ver completo"}
          </button>
        </div>

        {/* Reproceso toggle */}
        <button
          onClick={() => setEsReproceso(!esReproceso)}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 border transition-colors w-full text-left ${
            esReproceso ? "bg-red-500/10 border-red-500/30" : "bg-[#1E1E1E] border-[#2A2A2A] hover:border-red-500/30"
          }`}
        >
          <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
            esReproceso ? "bg-red-500 border-red-500" : "border-[#3A3A3A]"
          }`}>
            {esReproceso && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
          </div>
          <span className={`text-xs font-medium transition-colors ${esReproceso ? "text-red-400" : "text-[#666]"}`}>
            {esReproceso ? "☑ Reproceso" : "☐ Marcar como reproceso"}
          </span>
        </button>

        {error && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
            <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
            <p className="text-[11px] text-red-400">{error}</p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="border-t border-[#2A2A2A] px-4 py-3 flex gap-2 flex-wrap bg-[#111111]">
        <button
          onClick={handleRevisar}
          disabled={!!loading}
          className="flex items-center gap-1.5 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-50 px-3 py-2 text-xs font-semibold text-white transition-colors"
        >
          <CheckCircle className="h-3.5 w-3.5" />
          {loading === "revisar" ? "Guardando…" : "✓ Boleta revisada"}
        </button>
        {noLlamada && (
          <button
            onClick={handleSolicitarLlamada}
            disabled={!!loading}
            className={`flex items-center gap-1.5 rounded-lg disabled:opacity-50 px-3 py-2 text-xs font-semibold text-white transition-colors ${
              esPendLlamada
                ? "bg-blue-700 hover:bg-blue-600"
                : "bg-amber-700 hover:bg-amber-600"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {loading === "solicitar"
              ? "Enviando…"
              : esPendLlamada
              ? "🔄 Re-enviar a comercial"
              : "⚠️ Falta # llamada"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function RevisionSection({
  supervisorId,
  supervisorNombre,
  fechaDesde: externalFechaDesde,
  fechaHasta: externalFechaHasta,
  onDateChange,
  showSupervisorBreakdown = true,
}: {
  supervisorId?: string;
  supervisorNombre?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  onDateChange?: (desde: string, hasta: string) => void;
  showSupervisorBreakdown?: boolean;
} = {}) {
  const [localDesde, setLocalDesde] = useState(todayStr);
  const [localHasta, setLocalHasta] = useState(todayStr);
  const [reportes, setReportes] = useState<ReportePendiente[]>([]);
  const [kpis, setKpis] = useState<RevisionKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fechaDesde = externalFechaDesde ?? localDesde;
  const fechaHasta = externalFechaHasta ?? localHasta;
  const revisadoPor = supervisorNombre ?? "Supervisor TAS";

  function applyDateRange(desde: string, hasta: string) {
    if (!externalFechaDesde) { setLocalDesde(desde); setLocalHasta(hasta); }
    onDateChange?.(desde, hasta);
  }

  const buildQs = useCallback(() => {
    const params = new URLSearchParams({ _t: String(Date.now()), include_llamada: "true" });
    if (supervisorId) params.set("supervisor_id", supervisorId);
    return params.toString();
  }, [supervisorId]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const qs = buildQs();
      const kpisQs = new URLSearchParams({ _t: String(Date.now()) });
      if (supervisorId) kpisQs.set("supervisor_id", supervisorId);
      const [repRes, kpisRes] = await Promise.all([
        fetch(`${API}/revision/pendientes?${qs}`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`${API}/revision/kpis?${kpisQs}`, { cache: "no-store" }).then((r) => r.json()),
      ]);
      setReportes(repRes.reports ?? []);
      setKpis(kpisRes);
    } catch (err) {
      console.error("[RevisionSection] load error:", err);
    }
    setLoading(false);
    setRefreshing(false);
  }, [buildQs, supervisorId]);

  const removeCard = useCallback((id: string) => {
    setReportes((prev) => prev.filter((r) => r.id !== id));
    setKpis((prev) =>
      prev ? { ...prev, pendientes_revision: Math.max(0, prev.pendientes_revision - 1) } : prev
    );
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), 60000);
    return () => clearInterval(id);
  }, [load]);

  const pending = (kpis?.pendientes_revision ?? 0) + (kpis?.pendientes_llamada ?? 0);
  const displayPending = reportes.length;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5 flex-wrap">
          <ClipboardCheck className="h-4 w-4 text-[#CC0000]" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#555]">
            📋 Revisión de Boletas
          </p>
          {pending > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-bold px-2.5 py-0.5 animate-pulse">
              {pending} pendiente{pending !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick date buttons */}
          <div className="flex items-center gap-1">
            {[
              { label: "Hoy", fn: () => applyDateRange(todayStr(), todayStr()) },
              { label: "Esta semana", fn: () => applyDateRange(weekAgoStr(), todayStr()) },
              { label: "Este mes", fn: () => applyDateRange(monthAgoStr(), todayStr()) },
            ].map(({ label, fn }) => (
              <button
                key={label}
                onClick={fn}
                className="rounded-full border border-[#2A2A2A] bg-[#1C1C1C] px-2.5 py-1 text-[10px] text-[#666] hover:border-[#CC0000]/40 hover:text-white transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
          {/* Date pickers */}
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => applyDateRange(e.target.value, fechaHasta)}
            className="h-7 rounded-lg border border-[#2A2A2A] bg-[#1C1C1C] px-2 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-[#CC0000]/40"
          />
          <span className="text-[#555] text-xs">→</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => applyDateRange(fechaDesde, e.target.value)}
            className="h-7 rounded-lg border border-[#2A2A2A] bg-[#1C1C1C] px-2 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-[#CC0000]/40"
          />
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="text-[#555] hover:text-white transition-colors disabled:opacity-40"
            title="Actualizar"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Mini KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className={`rounded-xl border p-4 ${displayPending > 0 ? "border-red-500/30 bg-red-500/5" : "border-[#2A2A2A] bg-[#161616]"}`}>
            <p className="text-[10px] text-[#555] uppercase tracking-wide mb-1.5">Pendientes ahora</p>
            <p className={`text-3xl font-bold tabular-nums ${displayPending > 0 ? "text-red-400" : "text-white"}`}>{displayPending}</p>
          </div>
          <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] p-4">
            <p className="text-[10px] text-[#555] uppercase tracking-wide mb-1.5">Revisadas hoy</p>
            <p className="text-3xl font-bold tabular-nums text-white">{kpis.revisadas_hoy}</p>
          </div>
          {showSupervisorBreakdown ? (
            <AvgRevisionCard kpis={kpis} />
          ) : (
            <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] p-4">
              <p className="text-[10px] text-[#555] uppercase tracking-wide mb-1.5">Prom. revisión semana</p>
              <p className="text-3xl font-bold tabular-nums text-white">{fmtMins(kpis.avg_revision_minutos_semana)}</p>
            </div>
          )}
          <div className={`rounded-xl border p-4 ${(kpis.reprocesos_hoy ?? 0) > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-[#2A2A2A] bg-[#161616]"}`}>
            <p className="text-[10px] text-[#555] uppercase tracking-wide mb-1.5">♻ Reprocesos hoy</p>
            <p className={`text-3xl font-bold tabular-nums ${(kpis.reprocesos_hoy ?? 0) > 0 ? "text-amber-400" : "text-white"}`}>
              {kpis.reprocesos_hoy ?? 0}
            </p>
          </div>
        </div>
      )}

      {/* Cards */}
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-56 rounded-xl bg-[#161616] animate-pulse border border-[#2A2A2A]" />
          ))}
        </div>
      ) : reportes.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center rounded-xl border border-[#2A2A2A] bg-[#161616]">
          <CheckCircle className="h-10 w-10 text-green-500 mb-3" />
          <p className="text-sm font-semibold text-white">Todas las boletas revisadas</p>
          <p className="text-xs text-[#555] mt-1">No hay boletas pendientes de revisión en este período</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {reportes.map((r) => (
            <BoletaCard
              key={r.id}
              reporte={r}
              onRemove={removeCard}
              onReload={() => load(true)}
              revisadoPor={revisadoPor}
              showSupervisor={showSupervisorBreakdown}
            />
          ))}
        </div>
      )}
    </div>
  );
}
