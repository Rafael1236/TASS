import { useState } from "react";
import { useComercialFilters } from "@/hooks/use-comercial-filters";
import { ComercialKpiCards } from "@/components/comercial/ComercialKpiCards";
import { ComercialFilterBar } from "@/components/comercial/ComercialFilterBar";
import { ComercialTable } from "@/components/comercial/ComercialTable";
import { ComercialCharts } from "@/components/comercial/ComercialCharts";
import { VendedorTable } from "@/components/comercial/VendedorTable";
import { ComercialChatWidget } from "@/components/comercial/ComercialChatWidget";
import { BoltasPendientesLlamada } from "@/components/BoltasPendientesLlamada";
import { DashboardNav } from "@/components/DashboardNav";
import { DashboardFooter } from "@/components/DashboardFooter";
import { SapCallReport } from "@/components/SapCallReport";
import { SmartSearchBar } from "@/components/SmartSearchBar";

export default function ComercialDashboard() {
  const { filters, updateFilter, setDateRange } = useComercialFilters();

  const [sapActive, setSapActive] = useState<string | null>(null);
  const [searchResetKey, setSearchResetKey] = useState(0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardNav />

      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 space-y-6">
        <BoltasPendientesLlamada />

        {/* Unified Smart Search */}
        <SmartSearchBar key={searchResetKey} onSapSelect={setSapActive} />

        {sapActive ? (
          <SapCallReport numeroChamada={sapActive} onBack={() => setSapActive(null)} />
        ) : (
          <>
            <ComercialKpiCards filters={filters} />
            <ComercialFilterBar filters={filters} updateFilter={updateFilter} setDateRange={setDateRange} />
            <ComercialTable filters={filters} />

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#555] mb-4">
                Análisis de Oportunidades
              </p>
              <ComercialCharts filters={filters} />
            </div>

            <VendedorTable filters={filters} />
          </>
        )}

        <div className="h-20" />
      </div>

      <DashboardFooter />

      <ComercialChatWidget />
    </div>
  );
}
