import { useState } from "react";

export type DateRangeType = "today" | "week" | "month" | "custom";

export interface ComercialFilters {
  date_range: DateRangeType;
  from?: string;
  to?: string;
  vendedor?: string;
  cliente?: string;
  estado?: string;
}

export function useComercialFilters() {
  const [filters, setFilters] = useState<ComercialFilters>({ date_range: "month" });

  const updateFilter = <K extends keyof ComercialFilters>(key: K, value: ComercialFilters[K]) => {
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

  return { filters, updateFilter, setDateRange };
}
