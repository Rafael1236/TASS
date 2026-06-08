import {
  useGetComercialCharts,
  getGetComercialChartsQueryKey,
} from "@workspace/api-client-react";
import { ComercialFilters } from "@/hooks/use-comercial-filters";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bar, BarChart, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts";

interface Props { filters: ComercialFilters }

const tooltipStyle = { backgroundColor: "#0A0A0A", borderColor: "#2A2A2A", borderRadius: 8, fontSize: 12 };

const RADIAN = Math.PI / 180;
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, value }: {
  cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; value: number;
}) {
  if (value === 0) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11}>{value}</text>;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] p-5 flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {children}
    </div>
  );
}

function Empty() {
  return (
    <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
      No hay datos para el período seleccionado
    </div>
  );
}

export function ComercialCharts({ filters }: Props) {
  const params = {
    date_range: filters.date_range as "today" | "week" | "month" | "custom",
    from: filters.from,
    to: filters.to,
    vendedor: filters.vendedor || undefined,
    estado: filters.estado || undefined,
    cliente: filters.cliente || undefined,
  };

  const { data, isLoading } = useGetComercialCharts(params, {
    query: { queryKey: getGetComercialChartsQueryKey(params) },
  });

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        {["Tasa de Conversión","Oportunidades por Vendedor","Tiempo de Respuesta","Top Clientes"].map((t) => (
          <ChartCard key={t} title={t}><Skeleton className="h-52 rounded-lg" /></ChartCard>
        ))}
      </div>
    );
  }

  const porEstado = data?.porEstado ?? [];
  const porVendedor = data?.porVendedor ?? [];
  const tiempoVendedor = data?.tiempoVendedor ?? [];
  const topClientes = data?.topClientes ?? [];

  return (
    <div className="grid gap-6 md:grid-cols-2">

      {/* Chart 1 — Pie: tasa de conversión */}
      <ChartCard title="Tasa de Conversión">
        {porEstado.length === 0 ? <Empty /> : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={porEstado}
                  dataKey="value"
                  nameKey="estado"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  labelLine={false}
                  label={(props) => <PieLabel {...props} />}
                >
                  {porEstado.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend
                  formatter={(v) => <span style={{ color: "#ccc", fontSize: 11 }}>{v}</span>}
                  iconSize={10}
                  wrapperStyle={{ paddingTop: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      {/* Chart 2 — Bar: oportunidades por vendedor (stacked) */}
      <ChartCard title="Oportunidades por Vendedor">
        {porVendedor.length === 0 ? <Empty /> : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porVendedor} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <XAxis dataKey="nombre" stroke="#888" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#888" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.07)" }} />
                <Legend formatter={(v) => <span style={{ color: "#ccc", fontSize: 11 }}>{v}</span>} iconSize={10} />
                <Bar dataKey="enviadas" name="Enviadas" stackId="a" fill="#2E7D32" radius={[0,0,0,0]} />
                <Bar dataKey="no_enviadas" name="No enviadas" stackId="a" fill="#CC0000" radius={[0,0,0,0]} />
                <Bar dataKey="pendientes" name="Pendientes" stackId="a" fill="#F57F17" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      {/* Chart 3 — Bar: avg response time per vendedor */}
      <ChartCard title="Tiempo Promedio de Respuesta por Vendedor (horas)">
        {tiempoVendedor.length === 0 ? <Empty /> : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tiempoVendedor} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <XAxis dataKey="nombre" stroke="#888" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#888" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}h`} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.07)" }} formatter={(v: number) => [`${v}h`, "Tiempo prom."]} />
                <Bar dataKey="avg_horas" name="Horas" fill="#4A4A4A" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      {/* Chart 4 — Bar: top clients */}
      <ChartCard title="Top Clientes con Más Oportunidades">
        {topClientes.length === 0 ? <Empty /> : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topClientes} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 60 }}>
                <XAxis type="number" stroke="#888" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="cliente" stroke="#888" fontSize={10} tickLine={false} axisLine={false} width={60} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.07)" }} />
                <Bar dataKey="oportunidades" fill="#CC0000" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

    </div>
  );
}
