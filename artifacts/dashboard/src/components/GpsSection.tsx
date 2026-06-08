import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MapPin,
  Clock,
  RefreshCw,
  Navigation,
  AlertCircle,
  Car,
  Route,
} from "lucide-react";
import { RouteMapModal } from "@/components/RouteMapModal";

// ── Known plates ──────────────────────────────────────────────────────────────

const KNOWN_PLATES = [
  "P3897A",
  "P389AA",
  "P62FA0",
  "P62FFA",
  "P62FF2",
  "P62FAF",
  "P5176A",
  "P963771",
];

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface GpsSectionProps {
  externalPlate?: string | null;
  externalDate?: string | null;
  onClearFilter?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Today's date in El Salvador timezone (UTC-6) as YYYY-MM-DD */
function todayInSV(): string {
  const now = new Date();
  const svMs = now.getTime() - 6 * 60 * 60 * 1000;
  const sv = new Date(svMs);
  const y = sv.getUTCFullYear();
  const m = String(sv.getUTCMonth() + 1).padStart(2, "0");
  const d = String(sv.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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

/** Shorten vehicle name to just the meaningful part after "TAS El Salvador - " */
function shortVehicleName(full: string) {
  const m = full.match(/TAS\s+El\s+Salvador\s*[-–]\s*(.+)/i);
  return m?.[1] ?? full;
}

/** Build Google Maps URL for coordinates */
function googleMapsUrl(lat: number, lng: number, address: string) {
  const q = address
    ? encodeURIComponent(address)
    : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=`;
}

/** Check if a stop belongs to a vehicle with the given plate */
function stopMatchesPlate(stop: GeotabStop, plate: string): boolean {
  return stop.vehiculo.toLowerCase().includes(plate.toLowerCase());
}

// ── Fetch function ────────────────────────────────────────────────────────────

const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

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

// ── Component ─────────────────────────────────────────────────────────────────

export function GpsSection({ externalPlate, externalDate, onClearFilter }: GpsSectionProps) {
  const [date, setDate] = useState(todayInSV);
  const [selectedPlate, setSelectedPlate] = useState<string>("");
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // ── Ruta del Día panel state ───────────────────────────────────────────────
  const [showRutaPanel, setShowRutaPanel] = useState(false);
  const [rutaPlate, setRutaPlate] = useState("");
  const [rutaDate, setRutaDate] = useState(todayInSV);
  const [routeModal, setRouteModal] = useState<{ plate: string; date: string } | null>(null);

  // Sync external plate/date coming from a report row click
  useEffect(() => {
    if (externalPlate) {
      setSelectedPlate(externalPlate);
    }
    if (externalDate) {
      setDate(externalDate);
    }
  }, [externalPlate, externalDate]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<GeotabResponse, Error>({
    queryKey: ["geotab-stops", date],
    queryFn: () => fetchStops(date),
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS,
  });

  useEffect(() => {
    if (data) setLastRefresh(new Date());
  }, [data]);

  const allStops = data?.stops ?? [];

  const stops = selectedPlate
    ? allStops.filter((s) => stopMatchesPlate(s, selectedPlate))
    : allStops;

  const isFiltered = !!selectedPlate;

  function handlePlateChange(plate: string) {
    setSelectedPlate(plate);
    if (!plate && onClearFilter) onClearFilter();
  }

  function handleDateChange(newDate: string) {
    setDate(newDate);
    setSelectedPlate("");
    onClearFilter?.();
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15">
              <Car className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <CardTitle className="text-base">GPS — Actividad del día</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Paradas de más de 5 min · Vehículos TAS El Salvador
                {data?.vehicles != null && ` · ${data.vehicles} vehículo${data.vehicles !== 1 ? "s" : ""} encontrado${data.vehicles !== 1 ? "s" : ""}`}
                {isFiltered && ` · mostrando placa ${selectedPlate}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Plate filter dropdown */}
            <select
              value={selectedPlate}
              onChange={(e) => handlePlateChange(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Todos los vehículos</option>
              {KNOWN_PLATES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            {/* Date picker */}
            <input
              type="date"
              value={date}
              max={todayInSV()}
              onChange={(e) => handleDateChange(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />

            {/* Ruta del Día button */}
            <Button
              variant={showRutaPanel ? "default" : "outline"}
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setShowRutaPanel((v) => !v)}
            >
              <Route className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ruta del Día</span>
            </Button>

            {/* Manual refresh */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Actualizar</span>
            </Button>
          </div>
        </div>

        {/* Last refresh indicator */}
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>
            Última actualización: {lastRefresh.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" })}
            {" · "}Se actualiza automáticamente cada 5 minutos
          </span>
        </div>

        {/* Ruta del Día expandable panel */}
        {showRutaPanel && (
          <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="text-xs font-semibold text-emerald-400 mb-3 flex items-center gap-1.5">
              <Route className="h-3.5 w-3.5" />
              Ruta del Día — selecciona vehículo y fecha
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground">Vehículo</label>
                <select
                  value={rutaPlate}
                  onChange={(e) => setRutaPlate(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring min-w-[160px]"
                >
                  <option value="">Seleccionar vehículo...</option>
                  {KNOWN_PLATES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground">Fecha</label>
                <input
                  type="date"
                  value={rutaDate}
                  max={todayInSV()}
                  onChange={(e) => setRutaDate(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <Button
                size="sm"
                className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
                disabled={!rutaPlate || !rutaDate}
                onClick={() => setRouteModal({ plate: rutaPlate, date: rutaDate })}
              >
                <MapPin className="h-3.5 w-3.5" />
                Ver Ruta
              </Button>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="px-0 pb-0">
        {/* Error state */}
        {isError && (
          <div className="mx-6 mb-4 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error?.message ?? "Error al consultar Geotab"}</span>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading ? (
          <div className="space-y-2 px-6 pb-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : stops.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <MapPin className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {isFiltered
                  ? `Sin paradas registradas para placa ${selectedPlate}`
                  : (data?.message ?? "Sin paradas registradas")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isFiltered
                  ? "El vehículo no registró paradas de más de 5 minutos en la fecha seleccionada."
                  : "No se encontraron paradas de más de 5 minutos para la fecha seleccionada."}
              </p>
              {isFiltered && (
                <button
                  onClick={() => handlePlateChange("")}
                  className="mt-3 text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                >
                  Ver todos los vehículos
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Stops table */
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6 min-w-[140px]">Vehículo</TableHead>
                  <TableHead className="w-24">Hora llegada</TableHead>
                  <TableHead className="w-24">Hora salida</TableHead>
                  <TableHead className="w-28">Tiempo en sitio</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead className="w-24 pr-6 text-right">Mapa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stops.map((stop, i) => (
                  <TableRow key={i} className="group">
                    <TableCell className="pl-6 font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                        <span className="text-sm leading-tight">
                          {shortVehicleName(stop.vehiculo)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{stop.llegada}</span>
                    </TableCell>
                    <TableCell>
                      {stop.salida ? (
                        <span className="font-mono text-sm">{stop.salida}</span>
                      ) : (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px]">
                          En sitio
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[11px] font-medium ${durationBadgeClass(stop.duracion_minutos)}`}
                      >
                        {formatDuration(stop.duracion_minutos)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <p className="truncate text-sm text-muted-foreground group-hover:text-foreground transition-colors" title={stop.direccion || undefined}>
                        {stop.direccion || (
                          <span className="font-mono text-xs">
                            {stop.latitud.toFixed(5)}, {stop.longitud.toFixed(5)}
                          </span>
                        )}
                      </p>
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                        asChild
                      >
                        <a
                          href={googleMapsUrl(stop.latitud, stop.longitud, stop.direccion)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Navigation className="h-3 w-3" />
                          Ver mapa
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Route map modal */}
      {routeModal && (
        <RouteMapModal
          isOpen={!!routeModal}
          onClose={() => setRouteModal(null)}
          plate={routeModal.plate}
          date={routeModal.date}
        />
      )}
    </Card>
  );
}
