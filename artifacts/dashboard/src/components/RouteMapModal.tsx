import { useEffect, useRef, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Clock, MapPin } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RoutePoint {
  lat: number;
  lng: number;
  timestamp: string;
  svTime: string;
  speed: number;
}

interface RouteStop {
  llegada: string;
  salida: string | null;
  duracion_minutos: number;
  direccion: string;
  lat: number;
  lng: number;
}

interface RouteData {
  points: RoutePoint[];
  stops: RouteStop[];
  vehicle: string;
  date: string;
  totalPoints: number;
}

export interface RouteMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  plate: string;
  date: string;
  horaEntrada?: string;
  horaSalida?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(mins: number) {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

async function fetchRoute(
  plate: string,
  date: string,
  horaEntrada?: string,
  horaSalida?: string,
): Promise<RouteData> {
  const res = await fetch("/api/geotab/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plate,
      date,
      hora_entrada: horaEntrada,
      hora_salida: horaSalida,
    }),
  });
  const json = (await res.json()) as RouteData & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

// ── Google Maps API key ────────────────────────────────────────────────────────
// Vite injects GOOGLE_MAPS_API_KEY (a Replit Secret) via `define` in vite.config.ts
// as `import.meta.env.VITE_GOOGLE_MAPS_API_KEY`. We access it via bracket notation
// on `import.meta.env` so that Vite's define replacement still applies.
function getApiKey(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return env["VITE_GOOGLE_MAPS_API_KEY"] ?? "";
}

// ── Static-map fallback ───────────────────────────────────────────────────────
function buildStaticMapUrl(points: RoutePoint[], apiKey: string): string {
  const MAX_POINTS = 100;
  const step = Math.max(1, Math.floor(points.length / MAX_POINTS));
  const sampled = points.filter((_, i) => i % step === 0);
  const path = sampled.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
  return (
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?size=800x400&maptype=roadmap` +
    `&path=color:0x22c55eff|weight:3|${path}` +
    `&markers=color:green|label:S|${points[0]!.lat},${points[0]!.lng}` +
    `&markers=color:red|label:E|${points[points.length - 1]!.lat},${points[points.length - 1]!.lng}` +
    `&key=${apiKey}`
  );
}

// ── Google Maps renderer ───────────────────────────────────────────────────────

async function renderMap(
  container: HTMLDivElement,
  data: RouteData,
  horaEntrada?: string,
  horaSalida?: string,
) {
  const apiKey = getApiKey();

  if (!apiKey) {
    container.innerHTML =
      `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#f87171;font-size:13px;padding:24px;text-align:center">` +
      `⚠️ Falta la clave <strong style="margin:0 4px">GOOGLE_MAPS_API_KEY</strong> en los Secrets del proyecto.` +
      `</div>`;
    return;
  }

  const pts = data.points;
  if (pts.length === 0) {
    container.innerHTML =
      `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:13px;padding:24px">` +
      `Sin puntos GPS registrados para esta fecha y vehículo.` +
      `</div>`;
    return;
  }

  try {
    const { Loader } = await import("@googlemaps/js-api-loader");
    const loader = new Loader({ apiKey, version: "weekly" });
    await loader.load();
  } catch (err) {
    // Google Maps JS API failed to load — fall back to Static Maps image
    console.warn("[RouteMapModal] JS API load failed, using static fallback:", err);
    const imgUrl = buildStaticMapUrl(pts, apiKey);
    container.innerHTML =
      `<img src="${imgUrl}" alt="Ruta del día" ` +
      `style="width:100%;height:100%;object-fit:cover;display:block" ` +
      `onerror="this.parentElement.innerHTML='<div style=\\'display:flex;align-items:center;justify-content:center;height:100%;color:#f87171;font-size:13px;padding:24px\\'>No se pudo cargar el mapa. Verifica las restricciones de la API key.</div>'" />`;
    return;
  }

  // Clear previous content
  container.innerHTML = "";
  container.style.background = "";

  const midIdx = Math.floor(pts.length / 2);
  const map = new google.maps.Map(container, {
    zoom: 13,
    center: { lat: pts[midIdx]!.lat, lng: pts[midIdx]!.lng },
    mapTypeId: "roadmap",
    gestureHandling: "cooperative",
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
  });

  // Fit bounds to all track points
  const bounds = new google.maps.LatLngBounds();
  pts.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
  map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });

  // Force resize after layout settles (fixes blank map inside dialogs/modals)
  requestAnimationFrame(() => {
    google.maps.event.trigger(map, "resize");
    map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
  });

  // ── Polylines ──────────────────────────────────────────────────────────────
  if (horaEntrada && horaSalida) {
    const before = pts.filter((p) => p.svTime < horaEntrada);
    const during = pts.filter(
      (p) => p.svTime >= horaEntrada! && p.svTime <= horaSalida!,
    );
    const after = pts.filter((p) => p.svTime > horaSalida);

    const makeLine = (
      points: RoutePoint[],
      color: string,
      weight: number,
      opacity: number,
    ) => {
      if (points.length < 2) return;
      new google.maps.Polyline({
        path: points.map((p) => ({ lat: p.lat, lng: p.lng })),
        geodesic: true,
        strokeColor: color,
        strokeWeight: weight,
        strokeOpacity: opacity,
        map,
      });
    };

    makeLine(before, "#9ca3af", 3, 0.7);
    makeLine(during, "#22c55e", 4, 1.0);
    makeLine(after, "#9ca3af", 3, 0.7);
  } else {
    new google.maps.Polyline({
      path: pts.map((p) => ({ lat: p.lat, lng: p.lng })),
      geodesic: true,
      strokeColor: "#22c55e",
      strokeWeight: 3,
      strokeOpacity: 1.0,
      map,
    });
  }

  // ── Start marker (green) ───────────────────────────────────────────────────
  new google.maps.Marker({
    position: { lat: pts[0]!.lat, lng: pts[0]!.lng },
    map,
    title: `Inicio del día: ${pts[0]!.svTime}`,
    icon: "http://maps.google.com/mapfiles/ms/icons/green-dot.png",
    zIndex: 10,
  });

  // ── End marker (red) ──────────────────────────────────────────────────────
  const last = pts[pts.length - 1]!;
  new google.maps.Marker({
    position: { lat: last.lat, lng: last.lng },
    map,
    title: `Fin del día: ${last.svTime}`,
    icon: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
    zIndex: 10,
  });

  // ── Stop markers (blue) with click info window ────────────────────────────
  const infoWindow = new google.maps.InfoWindow();
  data.stops.forEach((stop) => {
    const marker = new google.maps.Marker({
      position: { lat: stop.lat, lng: stop.lng },
      map,
      title: stop.direccion || `Parada ${stop.llegada}`,
      icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
      zIndex: 5,
    });
    marker.addListener("click", () => {
      infoWindow.setContent(
        `<div style="font-size:13px;padding:2px 4px;max-width:280px">` +
          `<strong>${stop.llegada}${stop.salida ? ` – ${stop.salida}` : ""}</strong>` +
          `&nbsp;·&nbsp;<span style="color:#6b7280">${formatDuration(stop.duracion_minutos)}</span><br>` +
          `<span style="color:#374151">${stop.direccion || "Dirección no disponible"}</span>` +
          `</div>`,
      );
      infoWindow.open(map, marker);
    });
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RouteMapModal({
  isOpen,
  onClose,
  plate,
  date,
  horaEntrada,
  horaSalida,
}: RouteMapModalProps) {
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const renderScheduledRef = useRef(false);

  // Fetch route data whenever the modal opens
  useEffect(() => {
    if (!isOpen || !plate || !date) return;
    setIsLoading(true);
    setError(null);
    setRouteData(null);
    renderScheduledRef.current = false;
    fetchRoute(plate, date, horaEntrada, horaSalida)
      .then((data) => {
        setRouteData(data);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [isOpen, plate, date, horaEntrada, horaSalida]);

  // Clear map when modal closes
  useEffect(() => {
    if (!isOpen) {
      renderScheduledRef.current = false;
      if (mapContainerRef.current) {
        mapContainerRef.current.innerHTML = "";
      }
    }
  }, [isOpen]);

  // Callback ref — fires whenever the map div mounts or unmounts
  const scheduleRender = useCallback(
    (node: HTMLDivElement | null) => {
      mapContainerRef.current = node;
      if (!node || !routeData || renderScheduledRef.current) return;
      renderScheduledRef.current = true;
      // Small delay so the dialog's open animation has committed
      setTimeout(() => {
        if (!mapContainerRef.current) return;
        renderMap(mapContainerRef.current, routeData, horaEntrada, horaSalida).catch(
          (err: Error) => {
            if (mapContainerRef.current) {
              mapContainerRef.current.innerHTML =
                `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#f87171;font-size:13px;padding:24px;text-align:center">` +
                `⚠️ ${err.message}` +
                `</div>`;
            }
          },
        );
      }, 150);
    },
    [routeData, horaEntrada, horaSalida],
  );

  // Re-render if routeData arrives after the div is already mounted
  useEffect(() => {
    if (!isOpen || !routeData || !mapContainerRef.current || renderScheduledRef.current) return;
    renderScheduledRef.current = true;
    setTimeout(() => {
      if (!mapContainerRef.current) return;
      renderMap(mapContainerRef.current, routeData, horaEntrada, horaSalida).catch(
        (err: Error) => {
          if (mapContainerRef.current) {
            mapContainerRef.current.innerHTML =
              `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#f87171;font-size:13px;padding:24px;text-align:center">` +
              `⚠️ ${err.message}` +
              `</div>`;
          }
        },
      );
    }, 150);
  }, [isOpen, routeData, horaEntrada, horaSalida]);

  const title = plate ? `Ruta del Día — ${plate} · ${date}` : "Ruta del Día";
  const showMap = !isLoading && !error && !!routeData;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-full p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-emerald-400" />
            {title}
          </DialogTitle>
          {horaEntrada && horaSalida && (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="inline-block w-4 h-1.5 rounded-full bg-emerald-500" />
                Verde = servicio ({horaEntrada} – {horaSalida})
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-4 h-1.5 rounded-full bg-gray-400" />
                Gris = antes / después
              </span>
            </p>
          )}
        </DialogHeader>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {isLoading && (
            <div className="p-5 space-y-3">
              <Skeleton className="h-[420px] w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          )}

          {!isLoading && error && (
            <div className="m-5 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {showMap && (
            <>
              {/* Map canvas — Google Maps renders into this div via callback ref */}
              <div
                ref={scheduleRender}
                className="w-full bg-muted"
                style={{ height: 420, minHeight: 420 }}
              />

              {/* Stops timeline */}
              {routeData!.stops.length > 0 ? (
                <div className="px-5 py-4 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Paradas registradas ({routeData!.stops.length})
                    {routeData!.totalPoints > 0 && (
                      <span className="ml-auto font-normal">
                        {routeData!.totalPoints.toLocaleString()} puntos GPS
                      </span>
                    )}
                  </p>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Llegada
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Salida
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Tiempo
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Dirección
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {routeData!.stops.map((stop, i) => (
                          <tr
                            key={i}
                            className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                          >
                            <td className="px-3 py-2 font-mono">{stop.llegada}</td>
                            <td className="px-3 py-2 font-mono">
                              {stop.salida ?? (
                                <span className="text-emerald-400">En sitio</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Badge
                                variant="outline"
                                className="text-[10px] py-0 border-blue-500/30 bg-blue-500/10 text-blue-400"
                              >
                                {formatDuration(stop.duracion_minutos)}
                              </Badge>
                            </td>
                            <td
                              className="px-3 py-2 max-w-[320px] text-muted-foreground truncate"
                              title={stop.direccion || undefined}
                            >
                              {stop.direccion || (
                                <span className="font-mono">
                                  {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="px-5 py-4 border-t border-border text-center text-xs text-muted-foreground">
                  Sin paradas de más de 5 minutos registradas
                  {routeData!.totalPoints > 0 &&
                    ` · ${routeData!.totalPoints.toLocaleString()} puntos GPS`}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
