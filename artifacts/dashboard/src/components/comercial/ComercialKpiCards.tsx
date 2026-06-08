import {
  useGetComercialKpis,
  getGetComercialKpisQueryKey,
} from "@workspace/api-client-react";
import { ComercialFilters } from "@/hooks/use-comercial-filters";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Send, XCircle, Clock, TrendingUp, Timer } from "lucide-react";

interface Props { filters: ComercialFilters }

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  warn,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className={`
      rounded-xl border bg-[#1C1C1C] p-5 flex flex-col gap-3 transition-colors
      ${accent
        ? "border-[#CC0000]/35 hover:border-[#CC0000]/55"
        : warn
          ? "border-amber-500/25 hover:border-amber-500/45"
          : "border-[#2A2A2A] hover:border-[#3A3A3A]"}
    `}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9A9A9A]">{label}</span>
        <Icon className={`h-4 w-4 ${accent ? "text-[#CC0000]" : warn ? "text-amber-400" : "text-[#444]"}`} />
      </div>
      <span className={`text-4xl font-bold tracking-tight leading-none ${
        accent ? "text-[#CC0000]" : warn ? "text-amber-400" : "text-white"
      }`}>{value}</span>
      {sub && <span className="text-[11px] text-[#555]">{sub}</span>}
    </div>
  );
}

export function ComercialKpiCards({ filters }: Props) {
  const params = {
    date_range: filters.date_range as "today" | "week" | "month" | "custom",
    from: filters.from,
    to: filters.to,
    vendedor: filters.vendedor || undefined,
    estado: filters.estado || undefined,
    cliente: filters.cliente || undefined,
  };

  const { data, isLoading } = useGetComercialKpis(params, {
    query: { queryKey: getGetComercialKpisQueryKey(params) },
  });

  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  const topVendedor = (data?.avg_response_times ?? [])[0];

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard icon={FileText} label="Total" value={data?.total ?? 0} />
      <KpiCard icon={Send} label="Enviadas" value={data?.enviadas ?? 0} />
      <KpiCard icon={XCircle} label="No enviadas" value={data?.no_enviadas ?? 0} />
      <KpiCard icon={Clock} label="Pendientes" value={data?.pendientes ?? 0} sub="Requieren acción" warn={!!(data?.pendientes)} />
      <KpiCard
        icon={TrendingUp}
        label="Conversión"
        value={`${data?.conversion_rate ?? 0}%`}
        sub="Enviadas / Total"
        accent={!!(data?.conversion_rate && data.conversion_rate > 0)}
      />
      <KpiCard
        icon={Timer}
        label="T. promedio"
        value={topVendedor ? `${topVendedor.avg_hours}h` : "—"}
        sub={topVendedor ? topVendedor.vendedor : "Sin datos"}
      />
    </div>
  );
}
