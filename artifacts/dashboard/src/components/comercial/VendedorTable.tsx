import {
  useGetComercialVendedores,
  getGetComercialVendedoresQueryKey,
} from "@workspace/api-client-react";
import { ComercialFilters } from "@/hooks/use-comercial-filters";
import { Skeleton } from "@/components/ui/skeleton";

interface Props { filters: ComercialFilters }

function Badge({ v, color }: { v: number; color: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      {v}
    </span>
  );
}

export function VendedorTable({ filters }: Props) {
  const params = {
    date_range: filters.date_range as "today" | "week" | "month" | "custom",
    from: filters.from,
    to: filters.to,
    estado: filters.estado || undefined,
    cliente: filters.cliente || undefined,
  };

  const { data, isLoading } = useGetComercialVendedores(params, {
    query: { queryKey: getGetComercialVendedoresQueryKey(params) },
  });

  return (
    <div className="rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#2A2A2A] flex items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#9A9A9A]">Resumen por Vendedor</h2>
      </div>

      {isLoading ? (
        <div className="p-5 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
        </div>
      ) : (data?.vendedores ?? []).length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Sin datos</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-black/20">
                {["Vendedor","Total","Enviadas","No enviadas","Pendientes","Conversión","T. prom."].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs text-muted-foreground font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.vendedores ?? []).map((v) => (
                <tr key={v.nombre} className="border-b border-border hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 font-medium text-white">{v.nombre}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.total}</td>
                  <td className="px-4 py-3"><Badge v={v.enviadas} color="bg-green-900/40 text-green-400" /></td>
                  <td className="px-4 py-3"><Badge v={v.no_enviadas} color="bg-red-900/40 text-[#CC0000]" /></td>
                  <td className="px-4 py-3"><Badge v={v.pendientes} color="bg-amber-900/40 text-amber-400" /></td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${v.tasa >= 60 ? "text-green-400" : v.tasa >= 30 ? "text-amber-400" : "text-[#CC0000]"}`}>
                      {v.tasa}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{v.avg_horas != null ? `${v.avg_horas}h` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
