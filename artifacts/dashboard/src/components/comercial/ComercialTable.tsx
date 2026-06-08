import { useState, useCallback } from "react";
import {
  useGetComercialReports,
  usePatchComercialReport,
  getGetComercialReportsQueryKey,
  ComercialReport,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ComercialFilters } from "@/hooks/use-comercial-filters";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle, XCircle, ChevronRight, ChevronDown,
  AlertTriangle, Clock, History,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReportState = "pendiente" | "enviada" | "no_enviada";

// ── Colour helpers ────────────────────────────────────────────────────────────

function estadoBadge(estado: ReportState) {
  if (estado === "enviada") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-900/40 text-green-400 text-xs font-semibold px-2.5 py-1">
        <CheckCircle className="h-3 w-3" /> Enviada
      </span>
    );
  }
  if (estado === "no_enviada") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-900/40 text-[#CC0000] text-xs font-semibold px-2.5 py-1">
        <XCircle className="h-3 w-3" /> No enviada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-900/40 text-amber-400 text-xs font-semibold px-2.5 py-1">
      <Clock className="h-3 w-3" /> Pendiente
    </span>
  );
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("es-SV", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtHours(h: number | null | undefined) {
  if (h == null) return "—";
  return `${h}h`;
}

// ── Rejection modal ───────────────────────────────────────────────────────────

const REJECTION_CHIPS = [
  "Cliente no interesado",
  "Precio fuera de presupuesto",
  "Ya tiene proveedor",
  "No hubo respuesta del cliente",
  "Otro motivo",
];

function RejectionModal({
  reportId,
  vendedor,
  onClose,
  onConfirm,
}: {
  reportId: string;
  vendedor: string;
  onClose: () => void;
  onConfirm: (reason: string, vendedor: string) => void;
}) {
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [localVendedor, setLocalVendedor] = useState(vendedor);

  const reason = selectedReason === "Otro motivo" && customReason.trim()
    ? customReason.trim()
    : selectedReason;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#2D2D2D] border border-border rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-white font-semibold text-base mb-1">¿Por qué no se enviará la cotización?</h3>
        <p className="text-muted-foreground text-xs mb-4">Boleta #{reportId}</p>

        {!vendedor && (
          <div className="mb-4">
            <label className="text-xs text-muted-foreground mb-1 block">Tu nombre (vendedor)</label>
            <Input
              value={localVendedor}
              onChange={(e) => setLocalVendedor(e.target.value)}
              placeholder="Ingresa tu nombre"
              className="bg-background border-border text-sm"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-3">
          {REJECTION_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => setSelectedReason(chip)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                selectedReason === chip
                  ? "bg-[#CC0000] border-[#CC0000] text-white"
                  : "bg-background border-border text-muted-foreground hover:border-[#CC0000] hover:text-white"
              }`}
            >
              {chip}
            </button>
          ))}
        </div>

        {selectedReason === "Otro motivo" && (
          <Input
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder="Describe el motivo..."
            className="bg-background border-border text-sm mb-3"
          />
        )}

        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!reason || (!vendedor && !localVendedor.trim())}
            onClick={() => onConfirm(reason, localVendedor || vendedor)}
          >
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Vendedor name modal ───────────────────────────────────────────────────────

function VendedorModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#2D2D2D] border border-border rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-white font-semibold text-base mb-3">¿Cuál es tu nombre?</h3>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del vendedor"
          className="bg-background border-border text-sm mb-4"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onConfirm(name.trim()); }}
        />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            className="bg-green-700 hover:bg-green-600 text-white"
            disabled={!name.trim()}
            onClick={() => onConfirm(name.trim())}
          >
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function Row({
  report,
  optimisticState,
  pendingIds,
  tab,
  onEnviada,
  onNoEnviada,
}: {
  report: ComercialReport;
  optimisticState: ReportState | undefined;
  pendingIds: Set<string>;
  tab: "pendientes" | "historial";
  onEnviada: (id: string, vendedor: string) => void;
  onNoEnviada: (id: string, reason: string, vendedor: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [vendedorModal, setVendedorModal] = useState(false);
  const [rejectionModal, setRejectionModal] = useState(false);

  const id = String(report.id);
  const estado: ReportState = (optimisticState ?? (report.cotizacion_estado as ReportState | null) ?? "pendiente") as ReportState;
  const isPending = estado === "pendiente";
  const isSaving = pendingIds.has(id);

  return (
    <>
      <tr className={`border-b border-border transition-colors ${isSaving ? "opacity-60" : "hover:bg-white/5"}`}>
        <td className="px-3 py-3">
          <button onClick={() => setExpanded((v) => !v)} className="text-muted-foreground hover:text-white">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
        <td className="px-3 py-3 text-sm text-muted-foreground font-mono">#{String(report.numero_reporte ?? "")}</td>
        <td className="px-3 py-3 text-sm">{fmtDate(report.created_at)}</td>
        <td className="px-3 py-3 text-sm">{report.tecnico_nombre ?? "—"}</td>
        <td className="px-3 py-3 text-sm font-medium">{report.cliente_nombre}</td>
        <td className="px-3 py-3 text-sm text-muted-foreground max-w-[180px] truncate">{report.trabajo_realizado ?? "—"}</td>
        <td className="px-3 py-3 text-sm text-muted-foreground max-w-[180px] truncate">{report.descripcion_cotizacion ?? "—"}</td>
        <td className="px-3 py-3 text-sm">{report.cotizacion_vendedor ?? "—"}</td>
        <td className="px-3 py-3 text-sm text-muted-foreground">{fmtHours(report.elapsed_hours)}</td>
        <td className="px-3 py-3">{estadoBadge(estado)}</td>
        <td className="px-3 py-3 min-w-[220px]">
          {isPending && !isSaving ? (
            <div className="flex gap-1.5 flex-nowrap">
              <Button
                size="sm"
                className="bg-green-800 hover:bg-green-700 text-white text-xs h-7 px-2"
                onClick={() => {
                  if (!report.cotizacion_vendedor) setVendedorModal(true);
                  else onEnviada(id, report.cotizacion_vendedor);
                }}
              >
                <CheckCircle className="h-3 w-3 mr-1" /> Enviada
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="text-xs h-7 px-2"
                onClick={() => setRejectionModal(true)}
              >
                <XCircle className="h-3 w-3 mr-1" /> No se enviará
              </Button>
            </div>
          ) : isSaving ? (
            <span className="text-xs text-muted-foreground italic animate-pulse">Guardando…</span>
          ) : estado === "enviada" ? (
            <span className="text-xs text-muted-foreground">{fmtDate(report.cotizacion_enviada_at)}</span>
          ) : (
            <span className="text-xs text-muted-foreground italic max-w-[200px] block truncate" title={report.cotizacion_motivo_no_envio ?? ""}>
              {report.cotizacion_motivo_no_envio ?? "—"}
            </span>
          )}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-black/20 border-b border-border">
          <td colSpan={11} className="px-6 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-muted-foreground text-xs block">Correo comercial enviado</span><p className="text-white">{fmtDate(report.correo_comercial_enviado_at)}</p></div>
              <div><span className="text-muted-foreground text-xs block">Cotización enviada</span><p className="text-white">{fmtDate(report.cotizacion_enviada_at)}</p></div>
              <div><span className="text-muted-foreground text-xs block">Tiempo de respuesta</span><p className="text-white">{fmtHours(report.response_hours)}</p></div>
              <div><span className="text-muted-foreground text-xs block">Motivo no envío</span><p className="text-white">{report.cotizacion_motivo_no_envio ?? "—"}</p></div>
            </div>
          </td>
        </tr>
      )}

      {vendedorModal && (
        <VendedorModal
          onClose={() => setVendedorModal(false)}
          onConfirm={(name) => { setVendedorModal(false); onEnviada(id, name); }}
        />
      )}
      {rejectionModal && (
        <RejectionModal
          reportId={id}
          vendedor={report.cotizacion_vendedor ?? ""}
          onClose={() => setRejectionModal(false)}
          onConfirm={(reason, vendedor) => { setRejectionModal(false); onNoEnviada(id, reason, vendedor); }}
        />
      )}
    </>
  );
}

// ── Main table ────────────────────────────────────────────────────────────────

interface Props { filters: ComercialFilters }

export function ComercialTable({ filters }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"pendientes" | "historial">("pendientes");

  // Optimistic state: id → resolved estado
  const [optimisticStates, setOptimisticStates] = useState<Record<string, ReportState>>({});
  // Track in-flight mutations
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  // Migration warning
  const [migrationNeeded, setMigrationNeeded] = useState(false);

  const params = {
    date_range: filters.date_range as "today" | "week" | "month" | "custom",
    from: filters.from,
    to: filters.to,
    vendedor: filters.vendedor || undefined,
    cliente: filters.cliente || undefined,
    // Don't pass estado param to server — filter locally by tab
  };

  const queryKey = getGetComercialReportsQueryKey(params);
  const { data, isLoading } = useGetComercialReports(params, { query: { queryKey } });
  const patchMutation = usePatchComercialReport();

  // Split rows by effective estado
  const allRows = data?.reports ?? [];
  const visibleRows = allRows.filter((r) => {
    const effectiveEstado: ReportState = (optimisticStates[String(r.id)] ?? (r.cotizacion_estado as ReportState | null) ?? "pendiente") as ReportState;
    return tab === "pendientes" ? effectiveEstado === "pendiente" : effectiveEstado !== "pendiente";
  });

  const pendingCount = allRows.filter((r) => {
    const s = (optimisticStates[String(r.id)] ?? (r.cotizacion_estado as ReportState | null) ?? "pendiente") as ReportState;
    return s === "pendiente";
  }).length;

  const historialCount = allRows.length - pendingCount;

  const handleAction = useCallback(
    (
      id: string,
      optimisticEstado: ReportState,
      body: { cotizacion_estado: "enviada" | "no_enviada"; cotizacion_vendedor?: string; cotizacion_motivo_no_envio?: string },
    ) => {
      // 1. Immediately apply optimistic state
      setOptimisticStates((prev) => ({ ...prev, [id]: optimisticEstado }));
      setPendingIds((prev) => new Set(prev).add(id));

      patchMutation.mutate(
        { id, data: { cotizacion_estado: body.cotizacion_estado, cotizacion_vendedor: body.cotizacion_vendedor, cotizacion_motivo_no_envio: body.cotizacion_motivo_no_envio } },
        {
          onSuccess: () => {
            setPendingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
            qc.invalidateQueries({ queryKey });
            toast({ description: optimisticEstado === "enviada" ? "Cotización marcada como enviada." : "Oportunidad registrada como no enviada." });
          },
          onError: (err: unknown) => {
            // Roll back optimistic state
            setOptimisticStates((prev) => { const n = { ...prev }; delete n[id]; return n; });
            setPendingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });

            const body = err as { response?: { data?: { error?: string } } };
            if (body?.response?.data?.error === "MIGRATION_NEEDED") {
              setMigrationNeeded(true);
              toast({ variant: "destructive", description: "Columnas de base de datos pendientes. Ejecuta la migración SQL." });
            } else {
              toast({ variant: "destructive", description: "Error al guardar. Intenta de nuevo." });
            }
          },
        },
      );
    },
    [patchMutation, qc, queryKey, toast],
  );

  const handleEnviada = (id: string, vendedor: string) =>
    handleAction(id, "enviada", { cotizacion_estado: "enviada", cotizacion_vendedor: vendedor });

  const handleNoEnviada = (id: string, reason: string, vendedor: string) =>
    handleAction(id, "no_enviada", { cotizacion_estado: "no_enviada", cotizacion_motivo_no_envio: reason, cotizacion_vendedor: vendedor });

  return (
    <div className="rounded-xl border border-border bg-[#2D2D2D] overflow-hidden">
      {/* Migration notice */}
      {migrationNeeded && (
        <div className="flex items-start gap-3 px-5 py-3 bg-amber-950/50 border-b border-amber-800/50">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-300">
            <strong>Migración pendiente:</strong> Para guardar cambios, ejecuta el archivo{" "}
            <code className="bg-black/30 px-1 py-0.5 rounded">migrations/001_comercial_columns.sql</code>{" "}
            en Supabase Dashboard → SQL Editor.
          </div>
          <button onClick={() => setMigrationNeeded(false)} className="ml-auto text-amber-500 hover:text-amber-300 text-xs shrink-0">✕</button>
        </div>
      )}

      {/* Header + tabs */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-white font-semibold text-sm">Oportunidades de Cotización</h2>
          <p className="text-muted-foreground text-xs mt-0.5">
            {isLoading ? "Cargando..." : `${data?.total ?? 0} oportunidades en el período`}
          </p>
        </div>

        {/* Tab toggle */}
        <div className="flex rounded-lg overflow-hidden border border-border">
          <button
            onClick={() => setTab("pendientes")}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors ${tab === "pendientes" ? "bg-amber-900/50 text-amber-300" : "bg-background text-muted-foreground hover:text-white"}`}
          >
            <Clock className="h-3.5 w-3.5" />
            Pendientes
            {pendingCount > 0 && <span className="ml-1 bg-amber-600 text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">{pendingCount}</span>}
          </button>
          <button
            onClick={() => setTab("historial")}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-l border-border ${tab === "historial" ? "bg-[#3D3D3D] text-white" : "bg-background text-muted-foreground hover:text-white"}`}
          >
            <History className="h-3.5 w-3.5" />
            Historial
            {historialCount > 0 && <span className="ml-1 bg-[#555] text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">{historialCount}</span>}
          </button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="p-5 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          {tab === "pendientes"
            ? "No hay oportunidades pendientes. Cambia los filtros o revisa el historial."
            : "Sin oportunidades procesadas en este período."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-black/20">
                <th className="w-8 px-3 py-2.5" />
                {["#Reporte","Fecha","Técnico","Cliente","Trabajo realizado","Oportunidad","Vendedor","Tiempo","Estado","Acción"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <Row
                  key={String(r.id)}
                  report={r}
                  optimisticState={optimisticStates[String(r.id)]}
                  pendingIds={pendingIds}
                  tab={tab}
                  onEnviada={handleEnviada}
                  onNoEnviada={handleNoEnviada}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
