import {
  useGetDashboardCharts,
  getGetDashboardChartsQueryKey,
} from "@workspace/api-client-react";
import { DashboardFilters } from "@/hooks/use-dashboard-filters";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

interface Props {
  filters: DashboardFilters;
}

// ── Colour palettes ──────────────────────────────────────────────────────────

const TAS_RED   = "#CC0000";
const TAS_GRAY  = "#4A4A4A";

const TIPO_COLORS = [
  "#CC0000", "#E57373", "#FF8A65", "#FFB74D", "#81C784", "#64B5F6", "#BA68C8",
];

const ESTADO_COLORS: Record<string, string> = {
  terminado:              "#2E7D32",
  "pendiente repuesto":   "#F57F17",
  "requiere visita adicional": "#CC0000",
  "en proceso":           "#9E9E9E",
};

function estadoColor(estado: string): string {
  const key = estado.toLowerCase();
  for (const [k, v] of Object.entries(ESTADO_COLORS)) {
    if (key.includes(k)) return v;
  }
  return "#9E9E9E";
}

// ── Shared tooltip style ─────────────────────────────────────────────────────

const tooltipStyle = {
  backgroundColor: "#0A0A0A",
  borderColor: "#2A2A2A",
  borderRadius: 8,
  fontSize: 12,
};

// ── Empty state ──────────────────────────────────────────────────────────────

function Empty() {
  return (
    <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
      No hay datos para el período seleccionado
    </div>
  );
}

// ── Card wrapper ─────────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] p-5 flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {children}
    </div>
  );
}

// ── Custom pie label ─────────────────────────────────────────────────────────

const RADIAN = Math.PI / 180;
function PieLabel({
  cx, cy, midAngle, innerRadius, outerRadius, pct,
}: {
  cx: number; cy: number; midAngle: number;
  innerRadius: number; outerRadius: number; pct: number;
}) {
  if (pct < 5) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11}>
      {pct.toFixed(0)}%
    </text>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function ChartsSection({ filters }: Props) {
  const params = {
    date_range: filters.date_range as "today" | "week" | "month" | "custom",
    from: filters.from,
    to: filters.to,
    tecnico: filters.tecnico || undefined,
    cliente: filters.cliente || undefined,
    estado: filters.estado || undefined,
    tipo_servicio: filters.tipo_servicio || undefined,
  };

  const { data, isLoading } = useGetDashboardCharts(params, {
    query: {
      queryKey: getGetDashboardChartsQueryKey(params),
    },
  });

  const LoadingCard = ({ title }: { title: string }) => (
    <ChartCard title={title}>
      <Skeleton className="h-52 w-full rounded-lg" />
    </ChartCard>
  );

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        {["Boletas por Técnico","Horas Trabajadas por Técnico","Distribución por Tipo de Servicio","Estado de Servicios","Boletas por Día"].map((t) => (
          <LoadingCard key={t} title={t} />
        ))}
      </div>
    );
  }

  const rpt   = data?.reportesPorTecnico ?? [];
  const hrs   = data?.horasPorTecnico ?? [];
  const tipos = data?.porTipoServicio ?? [];
  const est   = data?.porEstado ?? [];
  const dias  = data?.porDia ?? [];

  return (
    <div className="grid gap-6 md:grid-cols-2">

      {/* Chart 1 — Reportes por Técnico */}
      <ChartCard title="Boletas por Técnico">
        {rpt.length === 0 ? <Empty /> : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rpt} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <XAxis dataKey="nombre" stroke="#888" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#888" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.07)" }} />
                <Bar dataKey="reportes" fill={TAS_RED} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      {/* Chart 2 — Horas por Técnico */}
      <ChartCard title="Horas Trabajadas por Técnico">
        {hrs.length === 0 ? <Empty /> : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hrs} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <XAxis dataKey="nombre" stroke="#888" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#888" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}h`} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.07)" }} formatter={(v: number) => [`${v}h`, "Horas"]} />
                <Bar dataKey="horas" fill={TAS_GRAY} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      {/* Chart 3 — Tipo de Servicio (pie) */}
      <ChartCard title="Distribución por Tipo de Servicio">
        {tipos.length === 0 ? <Empty /> : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={tipos}
                  dataKey="reportes"
                  nameKey="tipo"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  labelLine={false}
                  label={(props) => <PieLabel {...props} pct={props.pct} />}
                >
                  {tipos.map((_, i) => (
                    <Cell key={i} fill={TIPO_COLORS[i % TIPO_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [`${v} boleta${v !== 1 ? "s" : ""}`, name]} />
                <Legend
                  formatter={(value) => <span style={{ color: "#ccc", fontSize: 11 }}>{value}</span>}
                  iconSize={10}
                  wrapperStyle={{ paddingTop: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      {/* Chart 4 — Estado de Servicios (pie) */}
      <ChartCard title="Estado de Servicios">
        {est.length === 0 ? <Empty /> : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={est}
                  dataKey="reportes"
                  nameKey="estado"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  labelLine={false}
                  label={(props) => <PieLabel {...props} pct={props.pct} />}
                >
                  {est.map((entry, i) => (
                    <Cell key={i} fill={estadoColor(entry.estado)} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [`${v} boleta${v !== 1 ? "s" : ""}`, name]} />
                <Legend
                  formatter={(value) => <span style={{ color: "#ccc", fontSize: 11 }}>{value}</span>}
                  iconSize={10}
                  wrapperStyle={{ paddingTop: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      {/* Chart 5 — Reportes por Día (full width) */}
      <div className="md:col-span-2">
        <ChartCard title="Boletas por Día">
          {dias.length === 0 ? <Empty /> : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dias} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <XAxis dataKey="dia" stroke="#888" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: "rgba(255,255,255,0.07)" }}
                    formatter={(v: number) => [`${v} boleta${v !== 1 ? "s" : ""}`, "Boletas"]}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fecha ?? label}
                  />
                  <Bar dataKey="reportes" fill={TAS_RED} radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

    </div>
  );
}
