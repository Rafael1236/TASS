import { useState, useEffect, useCallback } from "react";
import { RotateCcw, RefreshCw, ExternalLink } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const API = `${window.location.origin}/api`;

interface Reproceso {
  id: string;
  numero_reporte: string | number | null;
  revisado_at: string | null;
  tecnico_nombre: string | null;
  cliente_nombre: string;
  numero_llamada: string | null;
  tipo_servicio: string | null;
}

interface TecnicoStat {
  nombre: string;
  count: number;
  ultima_fecha: string | null;
  llamadas: string[];
}

interface Props {
  fechaDesde: string;
  fechaHasta: string;
  supervisorId?: string;
  onSapSelect: (num: string) => void;
}

export function ReprocesosSection({ fechaDesde, fechaHasta, supervisorId, onSapSelect }: Props) {
  const [reprocesos, setReprocesos] = useState<Reproceso[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const qs = new URLSearchParams({ fecha_desde: fechaDesde, fecha_hasta: fechaHasta, _t: String(Date.now()) });
      if (supervisorId) qs.set("supervisor_id", supervisorId);
      const res = await fetch(`${API}/revision/reprocesos?${qs}`, { cache: "no-store" });
      const json = await res.json() as { reprocesos?: Reproceso[] };
      setReprocesos(json.reprocesos ?? []);
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  }, [fechaDesde, fechaHasta, supervisorId]);

  useEffect(() => { load(); }, [load]);

  // Aggregate by technician
  const byTecnico: Record<string, TecnicoStat> = {};
  for (const r of reprocesos) {
    const n = r.tecnico_nombre ?? "Sin nombre";
    if (!byTecnico[n]) byTecnico[n] = { nombre: n, count: 0, ultima_fecha: null, llamadas: [] };
    byTecnico[n].count++;
    if (r.revisado_at && (!byTecnico[n].ultima_fecha || r.revisado_at > byTecnico[n].ultima_fecha!)) {
      byTecnico[n].ultima_fecha = r.revisado_at;
    }
    if (r.numero_llamada && !byTecnico[n].llamadas.includes(r.numero_llamada)) {
      byTecnico[n].llamadas.push(r.numero_llamada);
    }
  }
  const stats = Object.values(byTecnico).sort((a, b) => b.count - a.count);
  const chartData = stats.slice(0, 8).map((s) => ({ name: s.nombre.split(" ")[0] ?? s.nombre, fullName: s.nombre, value: s.count }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <RotateCcw className="h-4 w-4 text-amber-400" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#555]">
            ♻️ Técnicos con Reprocesos
          </p>
          {reprocesos.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-bold px-2.5 py-0.5">
              {reprocesos.length} boleta{reprocesos.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="text-[#555] hover:text-white transition-colors disabled:opacity-40"
          title="Actualizar"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="h-48 rounded-xl bg-[#161616] border border-[#2A2A2A] animate-pulse" />
      ) : reprocesos.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center rounded-xl border border-[#2A2A2A] bg-[#161616]">
          <RotateCcw className="h-8 w-8 text-[#3A3A3A] mb-2" />
          <p className="text-xs text-[#555]">Sin reprocesos en el período seleccionado</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Bar chart */}
          {chartData.length > 0 && (
            <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] p-4">
              <p className="text-[10px] text-[#555] uppercase tracking-wide mb-3">Reprocesos por técnico</p>
              <ResponsiveContainer width="100%" height={Math.max(chartData.length * 36, 120)}>
                <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#666", fontSize: 10 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#9A9A9A", fontSize: 11 }} width={72} />
                  <Tooltip
                    contentStyle={{ background: "#1C1C1C", border: "1px solid #2A2A2A", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "#fff" }}
                    formatter={(v: number, _n: string, entry: { payload?: { fullName?: string } }) => [v, entry.payload?.fullName ?? ""]}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? "#CC0000" : i === 1 ? "#aa2200" : "#7a1800"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table */}
          <div className="rounded-xl border border-amber-500/20 bg-[#161616] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2A2A2A]">
                    <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-[#555] uppercase tracking-wide">Técnico</th>
                    <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-[#555] uppercase tracking-wide"># Reprocesos</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-[#555] uppercase tracking-wide hidden sm:table-cell">Última fecha</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-[#555] uppercase tracking-wide">Llamadas SAP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1C1C1C]">
                  {stats.map((s) => (
                    <tr key={s.nombre} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2.5 text-white font-medium">{s.nombre}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex items-center justify-center rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold w-6 h-6">
                          {s.count}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[#555] hidden sm:table-cell">
                        {s.ultima_fecha ? new Date(s.ultima_fecha).toLocaleDateString("es-SV", { day: "2-digit", month: "short" }) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {s.llamadas.length === 0 ? (
                            <span className="text-[#555]">—</span>
                          ) : (
                            s.llamadas.map((n) => (
                              <button
                                key={n}
                                onClick={() => onSapSelect(n)}
                                className="inline-flex items-center gap-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 text-[10px] font-mono hover:bg-blue-500/20 transition-colors"
                              >
                                #{n}<ExternalLink className="h-2.5 w-2.5 shrink-0" />
                              </button>
                            ))
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
