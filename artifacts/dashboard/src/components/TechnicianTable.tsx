import { useGetDashboardTechnicians, getGetDashboardTechniciansQueryKey } from "@workspace/api-client-react";
import { DashboardFilters } from "@/hooks/use-dashboard-filters";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";

interface TechnicianTableProps {
  filters: DashboardFilters;
}

export function TechnicianTable({ filters }: TechnicianTableProps) {
  const { data, isLoading } = useGetDashboardTechnicians(
    {
      date_range: filters.date_range as any,
      from: filters.from,
      to: filters.to,
    },
    {
      query: {
        queryKey: getGetDashboardTechniciansQueryKey({
          date_range: filters.date_range as any,
          from: filters.from,
          to: filters.to,
        }),
      },
    }
  );

  return (
    <div className="rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] overflow-hidden h-full flex flex-col">
      <div className="px-5 py-4 border-b border-[#2A2A2A] flex items-center gap-2 shrink-0">
        <Users className="h-3.5 w-3.5 text-[#444]" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#9A9A9A]">
          Resumen de Técnicos
        </h2>
      </div>

      {isLoading ? (
        <div className="p-5 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      ) : !data?.technicians?.length ? (
        <div className="flex-1 flex items-center justify-center py-12 text-sm text-[#444]">
          Sin técnicos
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2A2A2A]">
                {["Técnico", "Visitas", "Horas", "NPS", "Cotiz."].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-[#444]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data.technicians as any[]).map((tech, i) => (
                <tr
                  key={i}
                  className="border-b border-[#2A2A2A]/40 hover:bg-white/[0.022] transition-colors last:border-0"
                >
                  <td className="px-4 py-3 font-medium text-white text-xs">{tech.tecnico_nombre}</td>
                  <td className="px-4 py-3 text-[#9A9A9A] text-xs">{tech.visits}</td>
                  <td className="px-4 py-3 text-[#9A9A9A] text-xs">{tech.hours_worked}h</td>
                  <td className="px-4 py-3 text-xs">
                    <span className={`font-semibold ${
                      tech.avg_nps !== null && tech.avg_nps >= 8 ? "text-green-400" :
                      tech.avg_nps !== null && tech.avg_nps >= 6 ? "text-amber-400" :
                      tech.avg_nps !== null ? "text-[#CC0000]" : "text-[#444]"
                    }`}>
                      {tech.avg_nps !== null ? (tech.avg_nps as number)?.toFixed(1) : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {tech.pending_quotations > 0 ? (
                      <span className="inline-flex items-center justify-center rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5 text-[10px] font-semibold min-w-[20px]">
                        {tech.pending_quotations}
                      </span>
                    ) : (
                      <span className="text-[#444]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
