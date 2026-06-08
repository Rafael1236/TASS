import { useState, useRef, useCallback } from "react";
import { useDashboardFilters } from "@/hooks/use-dashboard-filters";
import { KpiCards } from "@/components/KpiCards";
import { FilterBar } from "@/components/FilterBar";
import { ReportsTable } from "@/components/ReportsTable";
import { TechnicianTable } from "@/components/TechnicianTable";
import { ChartsSection } from "@/components/ChartsSection";
import { ChatWidget } from "@/components/ChatWidget";
import { GpsSection } from "@/components/GpsSection";
import { SapCallReport } from "@/components/SapCallReport";
import { RevisionSection } from "@/components/RevisionSection";
import { ReprocesosSection } from "@/components/ReprocesosSection";
import { HorasSection } from "@/components/HorasSection";
import { DashboardNav } from "@/components/DashboardNav";
import { SmartSearchBar } from "@/components/SmartSearchBar";
import { RotateCcw } from "lucide-react";
import { DashboardFooter } from "@/components/DashboardFooter";

function todayStr() { return new Date().toISOString().slice(0, 10); }
function weekAgoStr() {
  const d = new Date(); d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}
function monthAgoStr() {
  const d = new Date(); d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

export default function Dashboard() {
  const { filters, updateFilter, setDateRange } = useDashboardFilters();

  // Linked date range for revision/reprocesos/horas sections
  const [fechaDesde, setFechaDesde] = useState(todayStr);
  const [fechaHasta, setFechaHasta] = useState(todayStr);

  const [gpsPlate, setGpsPlate] = useState<string | null>(null);
  const [gpsDate, setGpsDate] = useState<string | null>(null);
  const gpsSectionRef = useRef<HTMLDivElement>(null);

  const [sapActive, setSapActive] = useState<string | null>(null);
  const [searchResetKey, setSearchResetKey] = useState(0);

  function handleShowGps(plate: string, date: string) {
    setGpsPlate(plate);
    setGpsDate(date);
    setTimeout(() => {
      gpsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  function handleClearGps() { setGpsPlate(null); setGpsDate(null); }

  function handleResetFilters() {
    setFechaDesde(todayStr());
    setFechaHasta(todayStr());
    setDateRange("today");
    setSapActive(null);
    setSearchResetKey((k) => k + 1);
  }

  const handleLinkedDateChange = useCallback((desde: string, hasta: string) => {
    setFechaDesde(desde);
    setFechaHasta(hasta);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardNav />

      <div className="mx-auto w-full max-w-[1280px] px-4 py-6 space-y-6">

        {/* SECTION 1 — Unified Smart Search */}
        <SmartSearchBar key={searchResetKey} onSapSelect={setSapActive} />

        {sapActive ? (
          <SapCallReport numeroChamada={sapActive} onBack={() => setSapActive(null)} />
        ) : (
          <>
            {/* SECTION 2 — KPI Cards */}
            <KpiCards filters={filters} />

            {/* Linked date filter bar + Restablecer */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-[#555] uppercase tracking-widest font-semibold">Período:</span>
              {[
                { label: "Hoy", fn: () => { setFechaDesde(todayStr()); setFechaHasta(todayStr()); setDateRange("today"); } },
                { label: "Esta semana", fn: () => { setFechaDesde(weekAgoStr()); setFechaHasta(todayStr()); setDateRange("week"); } },
                { label: "Este mes", fn: () => { setFechaDesde(monthAgoStr()); setFechaHasta(todayStr()); setDateRange("month"); } },
              ].map(({ label, fn }) => (
                <button
                  key={label}
                  onClick={fn}
                  className="rounded-full border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1 text-[10px] text-[#666] hover:border-[#CC0000]/40 hover:text-white transition-colors"
                >
                  {label}
                </button>
              ))}
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="h-7 rounded-lg border border-[#2A2A2A] bg-[#1C1C1C] px-2 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-[#CC0000]/40"
              />
              <span className="text-[#555] text-xs">→</span>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="h-7 rounded-lg border border-[#2A2A2A] bg-[#1C1C1C] px-2 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-[#CC0000]/40"
              />
              <button
                onClick={handleResetFilters}
                className="ml-auto flex items-center gap-1.5 rounded-full border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[10px] text-[#666] hover:border-[#CC0000]/40 hover:text-white transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Restablecer filtros
              </button>
            </div>

            {/* SECTION 3 — Revisión de boletas */}
            <RevisionSection
              fechaDesde={fechaDesde}
              fechaHasta={fechaHasta}
              onDateChange={handleLinkedDateChange}
              showSupervisorBreakdown={true}
            />

            {/* SECTION 4 — Reprocesos */}
            <ReprocesosSection
              fechaDesde={fechaDesde}
              fechaHasta={fechaHasta}
              onSapSelect={(num) => setSapActive(num)}
            />

            {/* SECTION 5 — Horas trabajadas */}
            <HorasSection fechaDesde={fechaDesde} fechaHasta={fechaHasta} />

            {/* Boletas table section with existing filters */}
            <FilterBar filters={filters} updateFilter={updateFilter} setDateRange={setDateRange} />
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <ReportsTable filters={filters} onShowGps={handleShowGps} />
              </div>
              <div>
                <TechnicianTable filters={filters} />
              </div>
            </div>
            <ChartsSection filters={filters} />

            {/* SECTION 6 — GPS */}
            <div ref={gpsSectionRef}>
              <GpsSection
                externalPlate={gpsPlate}
                externalDate={gpsDate}
                onClearFilter={handleClearGps}
              />
            </div>
          </>
        )}

        <div className="h-20" />
      </div>

      <DashboardFooter />
      <ChatWidget />
    </div>
  );
}
