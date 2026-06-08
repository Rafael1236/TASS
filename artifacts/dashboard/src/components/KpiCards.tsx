import { useGetDashboardKpis, getGetDashboardKpisQueryKey } from "@workspace/api-client-react";
import { DashboardFilters } from "@/hooks/use-dashboard-filters";
import { FileText, Calendar, Clock, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface KpiCardsProps {
  filters: DashboardFilters;
}

export function KpiCards({ filters }: KpiCardsProps) {
  const { data: kpis, isLoading } = useGetDashboardKpis(
    {
      date_range: filters.date_range as any,
      from: filters.from,
      to: filters.to,
    },
    {
      query: {
        queryKey: getGetDashboardKpisQueryKey({
          date_range: filters.date_range as any,
          from: filters.from,
          to: filters.to,
        }),
      },
    }
  );

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <KpiCard
        title="Boletas hoy"
        value={kpis?.reports_today}
        icon={<FileText className="h-4 w-4" />}
        accent
        isLoading={isLoading}
      />
      <KpiCard
        title="Boletas esta semana"
        value={kpis?.reports_week}
        icon={<Calendar className="h-4 w-4" />}
        isLoading={isLoading}
      />
      <KpiCard
        title="Horas esta semana"
        value={kpis?.hours_worked_week ?? kpis?.hours_worked_today}
        icon={<Clock className="h-4 w-4" />}
        isLoading={isLoading}
      />
      <KpiCard
        title="NPS promedio"
        value={kpis?.avg_nps !== null && kpis?.avg_nps !== undefined ? kpis.avg_nps.toFixed(1) : "—"}
        icon={<Star className="h-4 w-4" />}
        isLoading={isLoading}
      />
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon,
  accent,
  warn,
  isLoading,
}: {
  title: string;
  value?: number | string | null;
  icon: React.ReactNode;
  accent?: boolean;
  warn?: boolean;
  isLoading: boolean;
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
        <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9A9A9A]">{title}</span>
        <span className={accent ? "text-[#CC0000]" : warn ? "text-amber-400" : "text-[#444]"}>{icon}</span>
      </div>
      {isLoading ? (
        <Skeleton className="h-9 w-20" />
      ) : (
        <span className={`text-4xl font-bold tracking-tight leading-none ${
          accent ? "text-[#CC0000]" : warn && value ? "text-amber-400" : "text-white"
        }`}>
          {value ?? 0}
        </span>
      )}
    </div>
  );
}
