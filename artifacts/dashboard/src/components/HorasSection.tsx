import { useState, useEffect, useCallback } from "react";
import { Clock, RefreshCw } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const API = `${window.location.origin}/api`;

interface TecnicoHoras {
  nombre: string;
  total_horas: number;
  num_boletas: number;
  avg_horas: number;
}

interface Props {
  fechaDesde: string;
  fechaHasta: string;
  supervisorId?: string;
}

export function HorasSection({ fechaDesde, fechaHasta, supervisorId }: Props) {
  const [tecnicos, setTecnicos] = useState<TecnicoHoras[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtroTecnico, setFiltroTecnico] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const qs = new URLSearchParams({ fecha_desde: fechaDesde, fecha_hasta: fechaHasta, _t: String(Date.now()) });
      if (supervisorId) qs.set("supervisor_id", supervisorId);
      const res = await fetch(`${API}/dashboard/horas-tecnico?${qs}`, { cache: "no-store" });
      const json = await res.json() as { tecnicos?: TecnicoHoras[] };
      setTecnicos(json.tecnicos ?? []);
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  }, [fechaDesde, fechaHasta, supervisorId]);

  useEffect(() => { load(); }, [load]);

  const filtered = filtroTecnico
    ? tecnicos.filter((t) => t.nombre.toLowerCase().includes(filtroTecnico.toLowerCase()))
    : tecnicos;

  const chartData = filtered.slice(0, 10).map((t) => ({
    name: t.nombre.split(" ")[0] ?? t.nombre,
    fullName: t.nombre,
    horas: t.total_horas,
  }));

  const totalHoras = filtered.reduce((s, t) => s + t.total_horas, 0);
  const totalBoletas = filtered.reduce((s, t) => s + t.num_boletas, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <Clock className="h-4 w-4 text-blue-400" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#555]">
            ⏱️ Horas Trabajadas
          </p>
          {!loading && tecnicos.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 text-[10px] font-bold px-2.5 py-0.5">
              {Math.round(totalHoras * 10) / 10}h total
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={filtroTecnico}
            onChange={(e) => setFiltroTecnico(e.target.value)}
            placeholder="Filtrar técnico..."
            className="h-7 rounded-lg border border-[#2A2A2A] bg-[#1C1C1C] px-2.5 text-xs text-foreground placeholder:text-[#555] focus:outline-none focus:ring-1 focus:ring-blue-500/40 w-36"
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

      {loading ? (
        <div className="h-48 rounded-xl bg-[#161616] border border-[#2A2A2A] animate-pulse" />
      ) : tecnicos.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center rounded-xl border border-[#2A2A2A] bg-[#161616]">
          <Clock className="h-8 w-8 text-[#3A3A3A] mb-2" />
          <p className="text-xs text-[#555]">Sin datos de horas en el período seleccionado</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Chart */}
          {chartData.length > 0 && (
            <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] p-4">
              <p className="text-[10px] text-[#555] uppercase tracking-wide mb-3">Horas por técnico</p>
              <ResponsiveContainer width="100%" height={Math.max(chartData.length * 36, 120)}>
                <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#666", fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#9A9A9A", fontSize: 11 }} width={72} />
                  <Tooltip
                    contentStyle={{ background: "#1C1C1C", border: "1px solid #2A2A2A", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "#fff" }}
                    formatter={(v: number, _n: string, entry: { payload?: { fullName?: string } }) => [`${v}h`, entry.payload?.fullName ?? ""]}
                  />
                  <Bar dataKey="horas" fill="#1D4ED8" radius={[0, 4, 4, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table */}
          <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2A2A2A]">
                    <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-[#555] uppercase tracking-wide">Técnico</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-[#555] uppercase tracking-wide">Total horas</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-[#555] uppercase tracking-wide hidden sm:table-cell"># Boletas</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-[#555] uppercase tracking-wide hidden sm:table-cell">Prom h/boleta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1C1C1C]">
                  {filtered.map((t) => (
                    <tr key={t.nombre} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2.5 text-white font-medium">{t.nombre}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="font-bold text-blue-400">{t.total_horas}h</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-[#9A9A9A] hidden sm:table-cell">{t.num_boletas}</td>
                      <td className="px-3 py-2.5 text-right text-[#9A9A9A] hidden sm:table-cell">{t.avg_horas}h</td>
                    </tr>
                  ))}
                </tbody>
                {filtered.length > 1 && (
                  <tfoot>
                    <tr className="border-t border-[#2A2A2A] bg-[#111]">
                      <td className="px-3 py-2.5 text-[10px] text-[#555] font-semibold uppercase">TOTAL</td>
                      <td className="px-3 py-2.5 text-right font-bold text-white">{Math.round(totalHoras * 100) / 100}h</td>
                      <td className="px-3 py-2.5 text-right text-[#9A9A9A] hidden sm:table-cell">{totalBoletas}</td>
                      <td className="px-3 py-2.5 text-right text-[#9A9A9A] hidden sm:table-cell">
                        {totalBoletas > 0 ? (Math.round((totalHoras / totalBoletas) * 100) / 100) : 0}h
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
