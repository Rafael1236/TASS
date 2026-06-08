import { useGetDashboardFilters } from "@workspace/api-client-react";
import { DashboardFilters } from "@/hooks/use-dashboard-filters";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, SlidersHorizontal } from "lucide-react";

interface FilterBarProps {
  filters: DashboardFilters;
  updateFilter: <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => void;
  setDateRange: (range: "today" | "week" | "month" | "custom", from?: string, to?: string) => void;
}

export function FilterBar({ filters, updateFilter, setDateRange }: FilterBarProps) {
  const { data: opts, isLoading } = useGetDashboardFilters({
    date_range: filters.date_range as any,
    from: filters.from,
    to: filters.to,
  });

  return (
    <div className="rounded-2xl border border-[#2A2A2A] bg-[#141414] p-4">
      <div className="flex items-center gap-2 mb-3">
        <SlidersHorizontal className="h-3 w-3 text-[#444]" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#444]">Filtros</span>
      </div>
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 space-y-1.5">
          <label className="text-[10px] text-[#9A9A9A] font-medium uppercase tracking-wide">Rango</label>
          <Select value={filters.date_range} onValueChange={(val: any) => setDateRange(val)}>
            <SelectTrigger className="w-full h-9 rounded-lg border-[#2A2A2A] bg-[#1C1C1C] text-sm">
              <SelectValue placeholder="Rango" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoy</SelectItem>
              <SelectItem value="week">Esta Semana</SelectItem>
              <SelectItem value="month">Este Mes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 space-y-1.5">
          <label className="text-[10px] text-[#9A9A9A] font-medium uppercase tracking-wide flex items-center gap-1">
            Técnico {isLoading && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
          </label>
          <Select
            value={filters.tecnico || "__all__"}
            onValueChange={(val) => updateFilter("tecnico", val === "__all__" ? undefined : val)}
          >
            <SelectTrigger className="w-full h-9 rounded-lg border-[#2A2A2A] bg-[#1C1C1C] text-sm">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {(opts?.tecnicos ?? []).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 space-y-1.5">
          <label className="text-[10px] text-[#9A9A9A] font-medium uppercase tracking-wide flex items-center gap-1">
            Cliente {isLoading && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
          </label>
          <Select
            value={filters.cliente || "__all__"}
            onValueChange={(val) => updateFilter("cliente", val === "__all__" ? undefined : val)}
          >
            <SelectTrigger className="w-full h-9 rounded-lg border-[#2A2A2A] bg-[#1C1C1C] text-sm">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {(opts?.clientes ?? []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 space-y-1.5">
          <label className="text-[10px] text-[#9A9A9A] font-medium uppercase tracking-wide flex items-center gap-1">
            Estado {isLoading && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
          </label>
          <Select
            value={filters.estado || "__all__"}
            onValueChange={(val) => updateFilter("estado", val === "__all__" ? undefined : val)}
          >
            <SelectTrigger className="w-full h-9 rounded-lg border-[#2A2A2A] bg-[#1C1C1C] text-sm">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {(opts?.estados ?? []).map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 space-y-1.5">
          <label className="text-[10px] text-[#9A9A9A] font-medium uppercase tracking-wide flex items-center gap-1">
            Tipo {isLoading && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
          </label>
          <Select
            value={filters.tipo_servicio || "__all__"}
            onValueChange={(val) => updateFilter("tipo_servicio", val === "__all__" ? undefined : val)}
          >
            <SelectTrigger className="w-full h-9 rounded-lg border-[#2A2A2A] bg-[#1C1C1C] text-sm">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {(opts?.tipos_servicio ?? []).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
