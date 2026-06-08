import { useState, useEffect, useCallback } from "react";
import { Phone, Timer, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = `${window.location.origin}/api`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReportePendienteLlamada {
  id: string;
  numero_reporte: string | number | null;
  created_at: string;
  tecnico_nombre: string | null;
  cliente_nombre: string;
  tipo_servicio: string | null;
  trabajo_realizado: string | null;
  numero_llamada_solicitado_at: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMins(m: number | null): string {
  if (m === null || m === undefined) return "—";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return min > 0 ? `${h}h ${min}m` : `${h}h`;
}

function calcElapsed(fromIso: string | null): { text: string; colorClass: string } {
  if (!fromIso) return { text: "—", colorClass: "text-[#555]" };
  const mins = Math.floor((Date.now() - new Date(fromIso).getTime()) / 60000);
  if (mins < 120) {
    const h = Math.floor(mins / 60); const m = mins % 60;
    return { text: h > 0 ? `${h}h ${m}m` : `${m}m`, colorClass: "text-green-400" };
  } else if (mins < 480) {
    const h = Math.floor(mins / 60); const m = mins % 60;
    return { text: `${h}h ${m}m`, colorClass: "text-amber-400" };
  } else if (mins < 1440) {
    const h = Math.floor(mins / 60); const m = mins % 60;
    return { text: `${h}h ${m}m`, colorClass: "text-red-400" };
  } else {
    const d = Math.floor(mins / 1440); const h = Math.floor((mins % 1440) / 60);
    return { text: `${d}d ${h}h`, colorClass: "text-red-500 font-bold" };
  }
}

// ── Individual card ───────────────────────────────────────────────────────────

function LlamadaCard({
  reporte,
  onRemove,
  onReload,
}: {
  reporte: ReportePendienteLlamada;
  onRemove: (id: string) => void;
  onReload: () => void;
}) {
  const { toast } = useToast();
  const [numeroLlamada, setNumeroLlamada] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const elapsed = calcElapsed(reporte.numero_llamada_solicitado_at);

  async function handleSave() {
    if (!numeroLlamada.trim()) return;
    console.log("[BoltasPendientesLlamada] ingresar-llamada for id:", reporte.id);
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch(`${API}/revision/${reporte.id}/ingresar-llamada`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero_llamada: numeroLlamada.trim(), ingresado_por: "Área Comercial" }),
        cache: "no-store",
      });
      console.log("[BoltasPendientesLlamada] ingresar-llamada response:", resp.status);
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(body.error ?? `HTTP ${resp.status}`);
      }
      onRemove(reporte.id);
      onReload();
      toast({
        title: "✓ # llamada ingresado",
        description: `Boleta #${reporte.numero_reporte} actualizada con SAP #${numeroLlamada.trim()}`,
      });
    } catch (err) {
      console.error("[BoltasPendientesLlamada] error:", err);
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setError(msg);
      toast({ title: "Error al guardar", description: msg, variant: "destructive" });
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-500/20 bg-[#161616] overflow-hidden">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 flex-wrap mb-3">
          <div>
            <span className="font-semibold text-white text-sm">
              #{reporte.numero_reporte ?? reporte.id.slice(0, 8)}
            </span>
            <p className="text-xs text-[#666] mt-0.5">
              {reporte.tecnico_nombre ?? "—"} · {reporte.cliente_nombre}
            </p>
            <p className="text-[11px] text-[#555] mt-0.5">
              {new Date(reporte.created_at).toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" })}
              {reporte.tipo_servicio && ` · ${reporte.tipo_servicio}`}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Timer className="h-3 w-3 text-[#555]" />
            <span className={`text-[11px] font-semibold ${elapsed.colorClass}`}>
              Sin # llamada: {elapsed.text}
            </span>
          </div>
        </div>

        {/* Work description */}
        {reporte.trabajo_realizado && (
          <div className="rounded-lg bg-[#1E1E1E] px-3 py-2 mb-3">
            <p className="text-[10px] text-[#555] uppercase tracking-wide mb-0.5">Trabajo realizado</p>
            <p className="text-xs text-[#C0C0C0] line-clamp-2 leading-relaxed">{reporte.trabajo_realizado}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
            <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
            <p className="text-[11px] text-red-400">{error}</p>
          </div>
        )}

        {/* Input row */}
        <div className="flex gap-2">
          <input
            type="text"
            value={numeroLlamada}
            onChange={(e) => setNumeroLlamada(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="Número de llamada SAP"
            className="flex-1 h-9 rounded-lg border border-[#2A2A2A] bg-[#1E1E1E] px-3 text-sm text-white placeholder:text-[#444] focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/50"
          />
          <button
            onClick={handleSave}
            disabled={!numeroLlamada.trim() || saving}
            className="h-9 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-xs font-semibold text-white transition-colors"
          >
            {saving ? "…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function BoltasPendientesLlamada() {
  const [reportes, setReportes] = useState<ReportePendienteLlamada[]>([]);
  const [avgMins, setAvgMins] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const ts = Date.now();
      const [listRes, kpisRes] = await Promise.all([
        fetch(`${API}/revision/pendientes-llamada?_t=${ts}`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`${API}/revision/kpis?_t=${ts}`, { cache: "no-store" }).then((r) => r.json()),
      ]);
      setReportes(listRes.reports ?? []);
      setAvgMins(kpisRes.avg_llamada_minutos_semana ?? null);
    } catch (err) {
      console.error("[BoltasPendientesLlamada] load error:", err);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  const removeCard = useCallback((id: string) => {
    setReportes((prev) => prev.filter((r) => r.id !== id));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), 60000);
    return () => clearInterval(id);
  }, [load]);

  if (loading || reportes.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Phone className="h-4 w-4 text-amber-400" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#555]">
            📞 Boletas pendientes de llamada
          </p>
          <span className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-bold px-2.5 py-0.5 animate-pulse">
            {reportes.length} pendiente{reportes.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="text-[#555] hover:text-white transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Mini KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-[10px] text-[#555] uppercase tracking-wide mb-1.5">Sin # llamada</p>
          <p className="text-3xl font-bold tabular-nums text-amber-400">{reportes.length}</p>
        </div>
        <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] p-4">
          <p className="text-[10px] text-[#555] uppercase tracking-wide mb-1.5">T. prom. ingreso</p>
          <p className="text-3xl font-bold tabular-nums text-white">{fmtMins(avgMins)}</p>
        </div>
        <div className="hidden sm:block rounded-xl border border-[#2A2A2A] bg-[#161616] p-4">
          <p className="text-[10px] text-[#555] uppercase tracking-wide mb-1.5">Estado</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <p className="text-sm font-medium text-amber-400">Requiere acción</p>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {reportes.map((r) => (
          <LlamadaCard key={r.id} reporte={r} onRemove={removeCard} onReload={() => load(true)} />
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-[#555] pt-1">
        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
        Al ingresar el número SAP, la boleta se marca automáticamente como revisada
      </div>
    </div>
  );
}
