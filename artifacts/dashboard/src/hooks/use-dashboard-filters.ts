import { useState } from "react";

export type DateRangeType = "today" | "week" | "month" | "custom";

export interface DashboardFilters {
  date_range: DateRangeType;
  from?: string;
  to?: string;
  tecnico?: string;
  cliente?: string;
  estado?: string;
  tipo_servicio?: string;
}

export function useDashboardFilters() {
  const [filters, setFilters] = useState<DashboardFilters>({
    date_range: "today",
  });

  const updateFilter = <K extends keyof DashboardFilters>(
    key: K,
    value: DashboardFilters[K]
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const setDateRange = (range: DateRangeType, from?: string, to?: string) => {
    setFilters((prev) => ({
      ...prev,
      date_range: range,
      from: range === "custom" ? from : undefined,
      to: range === "custom" ? to : undefined,
    }));
  };

  return {
    filters,
    updateFilter,
    setDateRange,
  };
}
