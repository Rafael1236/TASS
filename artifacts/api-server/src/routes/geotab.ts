/**
 * Geotab GPS integration
 * POST /geotab/stops  { date: "YYYY-MM-DD" }
 *
 * 1. Authenticates with MyGeotab JSON-RPC API
 * 2. Fetches all vehicles whose name contains "TAS El Salvador"
 * 3. For each vehicle, queries the Trip records for the requested day
 * 4. From each trip, extracts the stop at the end (vehicle parked)
 * 5. Filters stops shorter than 5 minutes
 * 6. Reverse-geocodes each stop location via Geotab's GetAddresses API
 * 7. Converts all times to El Salvador local time (UTC-6, no DST)
 */

import { Router, type IRouter } from "express";

const router: IRouter = Router();

// ── Constants ─────────────────────────────────────────────────────────────────

const GEOTAB_API = "https://my.geotab.com/apiv1";
const SV_OFFSET_HOURS = -6;   // El Salvador UTC-6, no DST
const MIN_STOP_MINUTES = 5;

// ── Types ─────────────────────────────────────────────────────────────────────

interface GeotabCreds {
  userName: string;
  sessionId: string;
  database: string;
  server?: string;
}

interface StopResult {
  vehiculo: string;
  llegada: string;
  salida: string | null;
  duracion_minutos: number;
  direccion: string;
  latitud: number;
  longitud: number;
}

// ── Session cache ─────────────────────────────────────────────────────────────
// Cache session for 55 minutes (Geotab sessions last ~1 h)

let sessionCache: { creds: GeotabCreds; expiresAt: number } | null = null;

function clearSession() {
  sessionCache = null;
}

// ── Core API helper ───────────────────────────────────────────────────────────

async function rpc(
  method: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, unknown>,
  server = GEOTAB_API,
): Promise<unknown> {
  const body = JSON.stringify({ method, params });
  const res = await fetch(server, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const json = (await res.json()) as { result?: unknown; error?: { message?: string; name?: string } };
  if (json.error) {
    const msg = json.error.message ?? json.error.name ?? "Geotab RPC error";
    throw new Error(msg);
  }
  return json.result;
}

// ── Authentication ────────────────────────────────────────────────────────────

async function getSession(): Promise<GeotabCreds> {
  const now = Date.now();
  if (sessionCache && sessionCache.expiresAt > now) {
    return sessionCache.creds;
  }

  const database = process.env["GEOTAB_DATABASE"] ?? "";
  const userName = process.env["GEOTAB_USERNAME"] ?? "";
  const password = process.env["GEOTAB_PASSWORD"] ?? "";

  if (!database || !userName || !password) {
    throw new Error("Faltan variables GEOTAB_DATABASE, GEOTAB_USERNAME o GEOTAB_PASSWORD");
  }

  const result = await rpc("Authenticate", { database, userName, password }) as {
    credentials: GeotabCreds;
    path?: string;
  };

  const creds = result.credentials;
  const apiServer = result.path && result.path !== "ThisServer"
    ? `https://${result.path}/apiv1`
    : GEOTAB_API;

  const fullCreds: GeotabCreds = { ...creds, server: apiServer };
  sessionCache = { creds: fullCreds, expiresAt: now + 55 * 60 * 1000 };
  return fullCreds;
}

// ── Authenticated RPC helper ──────────────────────────────────────────────────

async function authRpc(
  method: string,
  params: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  creds: GeotabCreds,
): Promise<unknown> {
  const { server, ...credFields } = creds;
  const apiServer = server ?? GEOTAB_API;
  try {
    return await rpc(method, { credentials: credFields, ...params }, apiServer);
  } catch (err) {
    // Session expired → clear cache and retry once with a fresh session
    const msg = String((err as Error).message ?? "");
    if (msg.includes("InvalidUserException") || msg.includes("NotAuthenticatedException")) {
      clearSession();
      const fresh = await getSession();
      const { server: freshServer, ...freshCredFields } = fresh;
      return await rpc(method, { credentials: freshCredFields, ...params }, freshServer ?? GEOTAB_API);
    }
    throw err;
  }
}

// ── Time helpers ──────────────────────────────────────────────────────────────

/** Convert a UTC ISO string to El Salvador local time (UTC-6) formatted as HH:MM */
function toSVTime(utcIso: string): string {
  const d = new Date(utcIso);
  const local = new Date(d.getTime() + SV_OFFSET_HOURS * 60 * 60 * 1000);
  const hh = String(local.getUTCHours()).padStart(2, "0");
  const mm = String(local.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Return UTC date range covering a full El Salvador calendar day */
function svDayUTCRange(svDate: string): { fromDate: string; toDate: string } {
  // El Salvador is UTC-6 → midnight SV = 06:00 UTC
  const fromDate = `${svDate}T06:00:00.000Z`;
  // Next day midnight SV = next day 06:00 UTC
  const dateParts = svDate.split("-").map(Number) as [number, number, number];
  const d = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2] + 1));
  const toDate = d.toISOString().replace(/\.\d{3}Z$/, ".000Z").replace(/T.*Z$/, "T06:00:00.000Z");
  return { fromDate, toDate };
}

function diffMinutes(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

/**
 * Parse Geotab's duration string "HH:MM:SS.fffffff" to total minutes.
 * Falls back to null if format is unrecognised.
 */
function parseDuration(s: string): number | null {
  if (!s) return null;
  const parts = s.split(":");
  if (parts.length < 2) return null;
  const hours = parseInt(parts[0] ?? "0", 10);
  const minutes = parseInt(parts[1] ?? "0", 10);
  const secs = parseFloat(parts[2] ?? "0");
  const total = hours * 60 + minutes + secs / 60;
  return isNaN(total) ? null : Math.round(total);
}

// ── Reverse geocoding ─────────────────────────────────────────────────────────

async function reverseGeocode(
  creds: GeotabCreds,
  points: Array<{ x: number; y: number }>,
): Promise<string[]> {
  if (points.length === 0) return [];
  try {
    const result = await authRpc("GetAddresses", { coordinates: points }, creds) as Array<{ formattedAddress?: string } | string | null>;
    return result.map((r) => {
      if (!r) return "";
      if (typeof r === "string") return r;
      return r.formattedAddress ?? "";
    });
  } catch {
    return points.map(() => "");
  }
}

// ── Main route ────────────────────────────────────────────────────────────────

router.post("/geotab/stops", async (req, res) => {
  const body = (req.body ?? {}) as { date?: string };
  const date = (body.date ?? "").trim();

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'Parámetro "date" requerido en formato YYYY-MM-DD' });
    return;
  }

  let creds: GeotabCreds;
  try {
    creds = await getSession();
  } catch (err) {
    req.log.error({ err }, "[geotab] auth failed");
    res.status(502).json({ error: `Error de autenticación Geotab: ${String(err)}` });
    return;
  }

  try {
    // ── 1) Get TAS El Salvador vehicles ──────────────────────────────────────
    // Fetch all active devices and filter client-side — Geotab's server-side
    // 'name' search does an exact match rather than a LIKE, so we fetch all.
    const allDevices = await authRpc(
      "Get",
      { typeName: "Device" },
      creds,
    ) as Array<{ id: string; name: string; deviceType?: string }>;

    req.log.info({ total: allDevices.length }, "[geotab] all devices");

    const filtered = allDevices.filter((d) =>
      (d.name ?? "").toLowerCase().includes("tas el salvador"),
    );

    req.log.info({ count: filtered.length }, "[geotab] TAS El Salvador devices found");

    if (filtered.length === 0) {
      res.json({ stops: [], message: "No se encontraron vehículos TAS El Salvador" });
      return;
    }

    // ── 2) Get trips for each vehicle ─────────────────────────────────────────
    const { fromDate, toDate } = svDayUTCRange(date);
    req.log.info({ fromDate, toDate, vehicles: filtered.length }, "[geotab] querying trips");

    const allStops: StopResult[] = [];
    const geocodeQueue: Array<{ idx: number; x: number; y: number }> = [];

    for (const device of filtered) {
      // Actual Geotab Trip fields (verified):
      //   start, stop, nextTripStart, stopPoint: {x: lng, y: lat}, stopDuration: "HH:MM:SS.fff"
      let trips: Array<{
        start?: string;
        stop?: string;
        nextTripStart?: string | null;
        stopPoint?: { x: number; y: number } | null;
        stopDuration?: string | null;
      }>;

      try {
        trips = await authRpc(
          "Get",
          {
            typeName: "Trip",
            search: {
              deviceSearch: { id: device.id },
              fromDate,
              toDate,
            },
          },
          creds,
        ) as typeof trips;
      } catch (err) {
        req.log.warn({ err, device: device.name }, "[geotab] failed to get trips for device, skipping");
        continue;
      }

      req.log.info({ device: device.name, trips: trips.length }, "[geotab] trips for device");

      for (const trip of trips) {
        const stopStart = trip.stop;
        const stopEnd = trip.nextTripStart ?? null;
        const point = trip.stopPoint;

        if (!stopStart || !point) continue;

        // Prefer the stopDuration field (most accurate); fallback to diff of timestamps
        const durationMins =
          trip.stopDuration
            ? (parseDuration(trip.stopDuration) ?? 0)
            : stopEnd
              ? diffMinutes(stopStart, stopEnd)
              : 0;

        if (durationMins < MIN_STOP_MINUTES) continue;

        const idx = allStops.length;
        allStops.push({
          vehiculo: device.name,
          llegada: toSVTime(stopStart),
          salida: stopEnd ? toSVTime(stopEnd) : null,
          duracion_minutos: durationMins,
          direccion: "",   // filled in after geocoding
          latitud: point.y,
          longitud: point.x,
        });
        geocodeQueue.push({ idx, x: point.x, y: point.y });
      }
    }

    // ── 3) Batch reverse-geocode ──────────────────────────────────────────────
    if (geocodeQueue.length > 0) {
      // Split into batches of 20 to avoid timeouts
      const batchSize = 20;
      for (let i = 0; i < geocodeQueue.length; i += batchSize) {
        const batch = geocodeQueue.slice(i, i + batchSize);
        const addresses = await reverseGeocode(
          creds,
          batch.map((b) => ({ x: b.x, y: b.y })),
        );
        batch.forEach((b, j) => {
          const stop = allStops[b.idx];
          if (stop) stop.direccion = addresses[j] ?? "";
        });
      }
    }

    // Sort by vehicle name, then arrival time
    allStops.sort((a, b) => {
      const nameComp = a.vehiculo.localeCompare(b.vehiculo);
      return nameComp !== 0 ? nameComp : a.llegada.localeCompare(b.llegada);
    });

    req.log.info({ total: allStops.length }, "[geotab] stops computed");
    res.json({ stops: allStops, date, vehicles: filtered.length });
  } catch (err) {
    req.log.error({ err }, "[geotab] stops query failed");
    res.status(500).json({ error: `Error al consultar Geotab: ${String(err)}` });
  }
});

// ── /geotab/route ─────────────────────────────────────────────────────────────
// POST /geotab/route
// Body: { date: "YYYY-MM-DD", plate: "P3897A", hora_entrada?: "09:00", hora_salida?: "11:30" }
// Returns: { points, stops, vehicle, date, totalPoints }

interface RoutePoint {
  lat: number;
  lng: number;
  timestamp: string;  // UTC ISO
  svTime: string;     // HH:MM El Salvador local
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

router.post("/geotab/route", async (req, res) => {
  const body = (req.body ?? {}) as {
    date?: string;
    plate?: string;
    hora_entrada?: string;
    hora_salida?: string;
  };

  const date = (body.date ?? "").trim();
  const plate = (body.plate ?? "").trim();

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'Parámetro "date" requerido en formato YYYY-MM-DD' });
    return;
  }
  if (!plate) {
    res.status(400).json({ error: 'Parámetro "plate" requerido' });
    return;
  }

  let creds: GeotabCreds;
  try {
    creds = await getSession();
  } catch (err) {
    req.log.error({ err }, "[geotab/route] auth failed");
    res.status(502).json({ error: `Error de autenticación Geotab: ${String(err)}` });
    return;
  }

  try {
    // 1. Find device by plate (name contains plate string)
    const allDevices = await authRpc(
      "Get",
      { typeName: "Device" },
      creds,
    ) as Array<{ id: string; name: string }>;

    const device = allDevices.find((d) =>
      (d.name ?? "").toUpperCase().includes(plate.toUpperCase()),
    );

    if (!device) {
      res.status(404).json({ error: `No se encontró vehículo con placa ${plate}` });
      return;
    }

    const { fromDate, toDate } = svDayUTCRange(date);
    req.log.info({ device: device.name, date, fromDate, toDate }, "[geotab/route] querying");

    // 2. Query LogRecords (raw GPS track points)
    const logRecords = await authRpc(
      "Get",
      {
        typeName: "LogRecord",
        search: {
          deviceSearch: { id: device.id },
          fromDate,
          toDate,
        },
      },
      creds,
    ) as Array<{ dateTime: string; latitude: number; longitude: number; speed: number }>;

    req.log.info({ count: logRecords.length }, "[geotab/route] log records fetched");

    // Sort chronologically
    logRecords.sort(
      (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime(),
    );

    // Downsample to max 1200 points to keep response size manageable
    const totalPoints = logRecords.length;
    let sampled = logRecords;
    if (logRecords.length > 1200) {
      const step = Math.ceil(logRecords.length / 1000);
      sampled = logRecords.filter((_, i) => i % step === 0 || i === logRecords.length - 1);
    }

    const points: RoutePoint[] = sampled.map((r) => ({
      lat: r.latitude,
      lng: r.longitude,
      timestamp: r.dateTime,
      svTime: toSVTime(r.dateTime),
      speed: Math.round(r.speed ?? 0),
    }));

    // 3. Query Trips for stops >5 min (same logic as /geotab/stops)
    const trips = await authRpc(
      "Get",
      {
        typeName: "Trip",
        search: {
          deviceSearch: { id: device.id },
          fromDate,
          toDate,
        },
      },
      creds,
    ) as Array<{
      start?: string;
      stop?: string;
      nextTripStart?: string | null;
      stopPoint?: { x: number; y: number } | null;
      stopDuration?: string | null;
    }>;

    const stopsRaw: StopResult[] = [];
    const geocodeQueue: Array<{ idx: number; x: number; y: number }> = [];

    for (const trip of trips) {
      const stopStart = trip.stop;
      const stopEnd = trip.nextTripStart ?? null;
      const point = trip.stopPoint;
      if (!stopStart || !point) continue;

      const durationMins =
        trip.stopDuration
          ? (parseDuration(trip.stopDuration) ?? 0)
          : stopEnd
            ? diffMinutes(stopStart, stopEnd)
            : 0;

      if (durationMins < MIN_STOP_MINUTES) continue;

      const idx = stopsRaw.length;
      stopsRaw.push({
        vehiculo: device.name,
        llegada: toSVTime(stopStart),
        salida: stopEnd ? toSVTime(stopEnd) : null,
        duracion_minutos: durationMins,
        direccion: "",
        latitud: point.y,
        longitud: point.x,
      });
      geocodeQueue.push({ idx, x: point.x, y: point.y });
    }

    // Batch reverse-geocode stops
    if (geocodeQueue.length > 0) {
      const batchSize = 20;
      for (let i = 0; i < geocodeQueue.length; i += batchSize) {
        const batch = geocodeQueue.slice(i, i + batchSize);
        const addresses = await reverseGeocode(
          creds,
          batch.map((b) => ({ x: b.x, y: b.y })),
        );
        batch.forEach((b, j) => {
          const stop = stopsRaw[b.idx];
          if (stop) stop.direccion = addresses[j] ?? "";
        });
      }
    }

    stopsRaw.sort((a, b) => a.llegada.localeCompare(b.llegada));

    const stops: RouteStop[] = stopsRaw.map((s) => ({
      llegada: s.llegada,
      salida: s.salida,
      duracion_minutos: s.duracion_minutos,
      direccion: s.direccion,
      lat: s.latitud,
      lng: s.longitud,
    }));

    req.log.info(
      { points: points.length, stops: stops.length, totalPoints },
      "[geotab/route] done",
    );

    res.json({ points, stops, vehicle: device.name, date, totalPoints });
  } catch (err) {
    req.log.error({ err }, "[geotab/route] failed");
    res.status(500).json({ error: `Error al consultar Geotab: ${String(err)}` });
  }
});

export default router;
