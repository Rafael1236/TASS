import { useState } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { useGetDashboardReports, getGetDashboardReportsQueryKey } from "@workspace/api-client-react";
import { DashboardFilters } from "@/hooks/use-dashboard-filters";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, ChevronDown, ChevronRight, MapPin, Navigation, Clock, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ── Geotab types (duplicated here to avoid cross-package coupling) ─────────────

interface GeotabStop {
  vehiculo: string;
  llegada: string;
  salida: string | null;
  duracion_minutos: number;
  direccion: string;
  latitud: number;
  longitud: number;
}

interface GeotabResponse {
  stops: GeotabStop[];
  date?: string;
  vehicles?: number;
  message?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function durationBadgeClass(mins: number) {
  if (mins >= 60) return "bg-red-500/15 text-red-400 border-red-500/30";
  if (mins >= 30) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-blue-500/15 text-blue-400 border-blue-500/30";
}

function formatDuration(mins: number) {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

function googleMapsUrl(lat: number, lng: number, address: string) {
  const q = address ? encodeURIComponent(address) : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

async function fetchStops(date: string): Promise<GeotabResponse> {
  const res = await fetch("/api/geotab/stops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date }),
  });
  const json = await res.json() as GeotabResponse & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

// ── Inline GPS stops panel ────────────────────────────────────────────────────

function ReportGpsStops({ plate, date }: { plate: string; date: string }) {
  const { data, isLoading, isError, error } = useQuery<GeotabResponse, Error>({
    // Same cache key as GpsSection — reuses data if already fetched
    queryKey: ["geotab-stops", date],
    queryFn: () => fetchStops(date),
    staleTime: 5 * 60 * 1000,
  });

  const stops = (data?.stops ?? []).filter((s) =>
    s.vehiculo.toLowerCase().includes(plate.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="space-y-2 mt-2">
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-3/4" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive mt-2">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span>{error?.message ?? "Error al consultar GPS"}</span>
      </div>
    );
  }

  if (stops.length === 0) {
    return (
      <p className="text-xs text-muted-foreground mt-2">
        Sin paradas registradas para la placa <span className="font-mono font-semibold">{plate}</span> el{" "}
        {format(new Date(date + "T12:00:00"), "dd/MM/yyyy")}.
      </p>
    );
  }

  return (
    <div className="mt-2 overflow-x-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Llegada</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Salida</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tiempo en sitio</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Dirección</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Mapa</th>
          </tr>
        </thead>
        <tbody>
          {stops.map((stop, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
              <td className="px-3 py-2 font-mono">{stop.llegada}</td>
              <td className="px-3 py-2 font-mono">
                {stop.salida ?? (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] px-1.5">
                    En sitio
                  </Badge>
                )}
              </td>
              <td className="px-3 py-2">
                <Badge
                  variant="outline"
                  className={`text-[10px] font-medium ${durationBadgeClass(stop.duracion_minutos)}`}
                >
                  {formatDuration(stop.duracion_minutos)}
                </Badge>
              </td>
              <td className="px-3 py-2 max-w-[260px]">
                <span className="block truncate text-muted-foreground" title={stop.direccion || undefined}>
                  {stop.direccion || (
                    <span className="font-mono">{stop.latitud.toFixed(5)}, {stop.longitud.toFixed(5)}</span>
                  )}
                </span>
              </td>
              <td className="px-3 py-2 text-right">
                <a
                  href={googleMapsUrl(stop.latitud, stop.longitud, stop.direccion)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Navigation className="h-3 w-3" />
                  Ver en mapa
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Table props ───────────────────────────────────────────────────────────────

interface ReportsTableProps {
  filters: DashboardFilters;
  onShowGps?: (plate: string, date: string) => void;
}

// ── Main table component ──────────────────────────────────────────────────────

export function ReportsTable({ filters, onShowGps }: ReportsTableProps) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useGetDashboardReports(
    {
      date_range: filters.date_range as any,
      from: filters.from,
      to: filters.to,
      tecnico: filters.tecnico,
      cliente: filters.cliente,
      estado: filters.estado,
      tipo_servicio: filters.tipo_servicio,
    },
    {
      query: {
        queryKey: getGetDashboardReportsQueryKey({
          date_range: filters.date_range as any,
          from: filters.from,
          to: filters.to,
          tecnico: filters.tecnico,
          cliente: filters.cliente,
          estado: filters.estado,
          tipo_servicio: filters.tipo_servicio,
        }),
      },
    }
  );

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleExportCsv = () => {
    if (!data?.reports) return;

    const headers = [
      "No. Reporte", "Fecha", "Técnico", "Cliente", "Tipo Servicio",
      "Trabajo Realizado", "Hora Entrada", "Hora Salida", "Horas",
      "Estado", "Cotización", "Placa", "NPS"
    ];

    const rows = data.reports.map((r) => [
      r.numero_reporte,
      r.created_at ? format(new Date(r.created_at), "dd/MM/yyyy") : "",
      r.tecnico_nombre,
      r.cliente_nombre,
      r.tipo_servicio,
      `"${(r.trabajo_realizado || "").replace(/"/g, '""')}"`,
      r.hora_entrada,
      r.hora_salida,
      r.horas_trabajadas,
      r.estado_servicio,
      r.hay_cotizacion ? "Sí" : "No",
      r.placa_vehiculo ?? "",
      r.nps ?? ""
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((e) => e.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `reportes_${format(new Date(), "yyyyMMdd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-medium">Boletas de Servicio</CardTitle>
        <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={isLoading || !data?.reports?.length}>
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>#Reporte</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Técnico</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Trabajo realizado</TableHead>
                <TableHead>Horas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Cotización</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>NPS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={12}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : data?.reports?.length ? (
                data.reports.map((report) => (
                  <ReportRow
                    key={report.id}
                    report={report}
                    isExpanded={!!expandedRows[report.id]}
                    onToggle={() => toggleRow(report.id)}
                    onShowGps={onShowGps}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={12} className="h-24 text-center">
                    No se encontraron reportes.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {data && (
          <div className="mt-4 text-sm text-muted-foreground text-right">
            Total: {data.total}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Individual report row ─────────────────────────────────────────────────────

function ReportRow({
  report,
  isExpanded,
  onToggle,
  onShowGps,
}: {
  report: DashboardReport;
  isExpanded: boolean;
  onToggle: () => void;
  onShowGps?: (plate: string, date: string) => void;
}) {
  const isCompleted = report.estado_servicio === "Terminado";
  const statusColor = isCompleted
    ? "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]"
    : "bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]";
  const truncatedWork =
    report.trabajo_realizado && report.trabajo_realizado.length > 60
      ? report.trabajo_realizado.substring(0, 60) + "..."
      : report.trabajo_realizado;

  const reportDate = report.created_at ? report.created_at.slice(0, 10) : null;

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={onToggle}>
        <TableCell>
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </TableCell>
        <TableCell className="font-medium">{report.numero_reporte}</TableCell>
        <TableCell>{report.created_at ? format(new Date(report.created_at), "dd/MMM/yyyy") : "-"}</TableCell>
        <TableCell>{report.tecnico_nombre}</TableCell>
        <TableCell>{report.cliente_nombre}</TableCell>
        <TableCell>{report.tipo_servicio}</TableCell>
        <TableCell className="max-w-[200px] truncate" title={report.trabajo_realizado || ""}>
          {truncatedWork || "-"}
        </TableCell>
        <TableCell className="whitespace-nowrap">
          {report.hora_entrada && report.hora_salida
            ? `${report.hora_entrada} → ${report.hora_salida} (${report.horas_trabajadas || 0}h)`
            : "-"}
        </TableCell>
        <TableCell>
          <Badge className={`border-0 ${statusColor}`}>{report.estado_servicio}</Badge>
        </TableCell>
        <TableCell>
          <Badge variant={report.hay_cotizacion ? "default" : "secondary"}>
            {report.hay_cotizacion ? "Sí" : "No"}
          </Badge>
        </TableCell>
        <TableCell>
          {report.placa_vehiculo ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onShowGps && reportDate) {
                  onShowGps(report.placa_vehiculo!, reportDate);
                }
              }}
              title="Ver ruta GPS en sección inferior"
              className="flex items-center gap-1 font-mono text-xs rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer"
            >
              <MapPin className="h-3 w-3 shrink-0" />
              {report.placa_vehiculo}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </TableCell>
        <TableCell>{report.nps ?? "-"}</TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={12} className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              {/* Left column: work details */}
              <div className="space-y-4">
                <div>
                  <p className="font-semibold mb-1">Trabajo Realizado Completo:</p>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {report.trabajo_realizado || "Sin detalles."}
                  </p>
                </div>
                {report.hay_cotizacion && (
                  <div>
                    <p className="font-semibold mb-1">Descripción de Cotización:</p>
                    <p className="text-muted-foreground">{report.descripcion_cotizacion || "Sin descripción."}</p>
                  </div>
                )}
                <div>
                  <p className="font-semibold mb-1">Observaciones:</p>
                  <p className="text-muted-foreground">{report.observaciones || "Ninguna."}</p>
                </div>
              </div>

              {/* Right column: GPS stops for this vehicle */}
              <div>
                {report.placa_vehiculo && reportDate ? (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-emerald-400 shrink-0" />
                      <p className="font-semibold">
                        GPS — Placa{" "}
                        <span className="font-mono text-emerald-400">{report.placa_vehiculo}</span>
                        {" "}el {format(new Date(reportDate + "T12:00:00"), "dd/MM/yyyy")}
                      </p>
                    </div>
                    <ReportGpsStops plate={report.placa_vehiculo} date={reportDate} />
                  </div>
                ) : (
                  <div className="flex flex-col items-start gap-1">
                    <p className="font-semibold">GPS</p>
                    <p className="text-xs text-muted-foreground">
                      Este reporte no tiene placa de vehículo registrada.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
