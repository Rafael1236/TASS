import { ComercialFilters, DateRangeType } from "@/hooks/use-comercial-filters";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SlidersHorizontal } from "lucide-react";

interface Props {
  filters: ComercialFilters;
  updateFilter: <K extends keyof ComercialFilters>(key: K, value: ComercialFilters[K]) => void;
  setDateRange: (range: DateRangeType, from?: string, to?: string) => void;
}

const DATE_RANGE_LABELS: Record<string, string> = {
  today: "Hoy",
  week: "Esta semana",
  month: "Este mes",
  custom: "Personalizado",
};

const ALL_SENTINEL = "__all__";

const ESTADO_OPTIONS = [
  { value: ALL_SENTINEL, label: "Todos los estados" },
  { value: "pendiente", label: "Pendiente" },
  { value: "enviada", label: "Enviada" },
  { value: "no_enviada", label: "No enviada" },
];

export function ComercialFilterBar({ filters, updateFilter, setDateRange }: Props) {
  return (
    <div className="rounded-2xl border border-[#2A2A2A] bg-[#141414] p-4">
      <div className="flex items-center gap-2 mb-3">
        <SlidersHorizontal className="h-3 w-3 text-[#444]" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#444]">Filtros</span>
      </div>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-[#9A9A9A] font-medium uppercase tracking-wide">Rango de Fechas</label>
          <Select
            value={filters.date_range}
            onValueChange={(v) => setDateRange(v as DateRangeType)}
          >
            <SelectTrigger className="h-9 rounded-lg border-[#2A2A2A] bg-[#1C1C1C] text-sm">
              <SelectValue>{DATE_RANGE_LABELS[filters.date_range] ?? filters.date_range}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DATE_RANGE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-[#9A9A9A] font-medium uppercase tracking-wide">Vendedor</label>
          <Input
            placeholder="Filtrar por vendedor"
            value={filters.vendedor ?? ""}
            onChange={(e) => updateFilter("vendedor", e.target.value || undefined)}
            className="h-9 rounded-lg border-[#2A2A2A] bg-[#1C1C1C] text-sm placeholder:text-[#444]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-[#9A9A9A] font-medium uppercase tracking-wide">Estado</label>
          <Select
            value={filters.estado ?? ALL_SENTINEL}
            onValueChange={(v) => updateFilter("estado", v === ALL_SENTINEL ? undefined : v)}
          >
            <SelectTrigger className="h-9 rounded-lg border-[#2A2A2A] bg-[#1C1C1C] text-sm">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              {ESTADO_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-[#9A9A9A] font-medium uppercase tracking-wide">Cliente</label>
          <Input
            placeholder="Filtrar por cliente"
            value={filters.cliente ?? ""}
            onChange={(e) => updateFilter("cliente", e.target.value || undefined)}
            className="h-9 rounded-lg border-[#2A2A2A] bg-[#1C1C1C] text-sm placeholder:text-[#444]"
          />
        </div>
      </div>
    </div>
  );
}
