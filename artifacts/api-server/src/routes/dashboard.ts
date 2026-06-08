import { Router, type IRouter, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../lib/supabase";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

interface DateRange {
  from: string; // ISO date string yyyy-mm-dd
  to: string;   // ISO date string yyyy-mm-dd
}

function getDateRange(
  date_range: string | undefined,
  from: string | undefined,
  to: string | undefined,
): DateRange {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (date_range === "custom" && from && to) {
    return { from, to };
  }

  const todayStr = fmt(now);

  if (date_range === "today") {
    return { from: todayStr, to: todayStr };
  }

  if (date_range === "month") {
    const start = new Date(now);
    start.setDate(now.getDate() - 29);
    return { from: fmt(start), to: todayStr };
  }

  // Default: week (last 7 days)
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  return { from: fmt(start), to: todayStr };
}

// Parse "HH:MM" or "H:MM" → hours as float; returns null on failure
function parseHoraToFloat(hora: string | null | undefined): number | null {
  if (!hora) return null;
  const m = hora.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1] ?? "0", 10);
  const min = parseInt(m[2] ?? "0", 10);
  return h + min / 60;
}

// Positive difference in hours between two HH:MM strings; null if invalid
function calcHours(
  entrada: string | null | undefined,
  salida: string | null | undefined,
): number | null {
  const e = parseHoraToFloat(entrada);
  const s = parseHoraToFloat(salida);
  if (e === null || s === null) return null;
  const diff = s - e;
  return diff > 0 ? Math.round(diff * 100) / 100 : null;
}

// ---------------------------------------------------------------------------
// GET /dashboard/kpis
// ---------------------------------------------------------------------------

router.get("/dashboard/kpis", async (req: Request, res: Response) => {
  const q = req.query as Record<string, string>;
  const todayRange = getDateRange("today", undefined, undefined);
  const weekRange = getDateRange("week", undefined, undefined);
  const range = getDateRange(q["date_range"], q["from"], q["to"]);

  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    res.status(500).json({ error: String(err) });
    return;
  }

  try {
    // Reports today
    const todayQ = await supabase
      .from("reportes")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${todayRange.from}T00:00:00`)
      .lte("created_at", `${todayRange.to}T23:59:59`);

    // Reports this week
    const weekQ = await supabase
      .from("reportes")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${weekRange.from}T00:00:00`)
      .lte("created_at", `${weekRange.to}T23:59:59`);

    // Pending quotations (in the selected range)
    const cotizQ = await supabase
      .from("reportes")
      .select("id", { count: "exact", head: true })
      .eq("hay_cotizacion", true)
      .gte("created_at", `${range.from}T00:00:00`)
      .lte("created_at", `${range.to}T23:59:59`);

    // Hours worked today — need hora_entrada / hora_salida
    const [horasHoyQ, horasSemQ] = await Promise.all([
      supabase
        .from("reportes")
        .select("hora_entrada, hora_salida")
        .gte("created_at", `${todayRange.from}T00:00:00`)
        .lte("created_at", `${todayRange.to}T23:59:59`),
      supabase
        .from("reportes")
        .select("hora_entrada, hora_salida")
        .gte("created_at", `${weekRange.from}T00:00:00`)
        .lte("created_at", `${weekRange.to}T23:59:59`),
    ]);

    const hoursToday = (horasHoyQ.data ?? []).reduce<number>((acc, r) => {
      const h = calcHours(r.hora_entrada as string | null, r.hora_salida as string | null);
      return h !== null ? acc + h : acc;
    }, 0);

    const hoursWeek = (horasSemQ.data ?? []).reduce<number>((acc, r) => {
      const h = calcHours(r.hora_entrada as string | null, r.hora_salida as string | null);
      return h !== null ? acc + h : acc;
    }, 0);

    res.json({
      reports_today: todayQ.count ?? 0,
      reports_week: weekQ.count ?? 0,
      hours_worked_today: Math.round(hoursToday * 100) / 100,
      hours_worked_week: Math.round(hoursWeek * 100) / 100,
      pending_quotations: cotizQ.count ?? 0,
      avg_nps: null, // NPS not yet in the data model
    });
  } catch (err) {
    req.log.error({ err }, "[dashboard/kpis] query failed");
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// GET /dashboard/reports
// ---------------------------------------------------------------------------

router.get("/dashboard/reports", async (req: Request, res: Response) => {
  const q = req.query as Record<string, string>;
  const range = getDateRange(q["date_range"], q["from"], q["to"]);
  const limit = Math.min(parseInt(q["limit"] ?? "100", 10), 500);
  const offset = parseInt(q["offset"] ?? "0", 10);

  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    res.status(500).json({ error: String(err) });
    return;
  }

  try {
    // Build the base query. If placa_vehiculo column doesn't exist yet we fall
    // back to a query without it (self-healing until migration 004 is run).
    const buildQuery = (includePlaca: boolean) => {
      const fields = includePlaca
        ? `id, numero_reporte, created_at, tecnico_nombre, numero_llamada, numero_proyecto,
           tipo_servicio, trabajo_realizado, hora_entrada, hora_salida,
           estado_servicio, hay_cotizacion, descripcion_cotizacion, observaciones,
           placa_vehiculo,
           clientes!inner(nombre_comercial)`
        : `id, numero_reporte, created_at, tecnico_nombre, numero_llamada, numero_proyecto,
           tipo_servicio, trabajo_realizado, hora_entrada, hora_salida,
           estado_servicio, hay_cotizacion, descripcion_cotizacion, observaciones,
           clientes!inner(nombre_comercial)`;
      let q2 = supabase
        .from("reportes")
        .select(fields, { count: "exact" })
        .gte("created_at", `${range.from}T00:00:00`)
        .lte("created_at", `${range.to}T23:59:59`)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (q["tecnico"]) q2 = q2.ilike("tecnico_nombre", `%${q["tecnico"]}%`);
      if (q["estado"]) q2 = q2.ilike("estado_servicio", `%${q["estado"]}%`);
      if (q["tipo_servicio"]) q2 = q2.contains("tipo_servicio", [q["tipo_servicio"]]);
      return q2;
    };

    let result = await buildQuery(true);
    // If placa_vehiculo column doesn't exist yet (migration 004 not run), retry without it
    if (result.error && (result.error as { code?: string }).code === "42703") {
      req.log.warn("[dashboard/reports] placa_vehiculo column missing, falling back");
      result = await buildQuery(false);
    }
    const { data, count, error } = result;
    if (error) throw error;

    // Filter by client name (post-filter since it's a join)
    let rows = (data ?? []) as Array<Record<string, unknown>>;
    if (q["cliente"]) {
      const search = q["cliente"].toLowerCase();
      rows = rows.filter((r) => {
        const c = r["clientes"] as { nombre_comercial?: string } | null;
        return (c?.nombre_comercial ?? "").toLowerCase().includes(search);
      });
    }

    const reports = rows.map((r) => {
      const cliente = r["clientes"] as { nombre_comercial?: string } | null;
      const horas = calcHours(
        r["hora_entrada"] as string | null,
        r["hora_salida"] as string | null,
      );
      const tipoServicio = Array.isArray(r["tipo_servicio"])
        ? (r["tipo_servicio"] as string[]).join(", ")
        : ((r["tipo_servicio"] as string | null) ?? null);
      return {
        id: r["id"],
        numero_reporte: r["numero_reporte"],
        created_at: r["created_at"],
        tecnico_nombre: r["tecnico_nombre"] ?? null,
        cliente_nombre: cliente?.nombre_comercial ?? "",
        tipo_servicio: tipoServicio,
        trabajo_realizado: r["trabajo_realizado"] ?? null,
        hora_entrada: r["hora_entrada"] ?? null,
        hora_salida: r["hora_salida"] ?? null,
        horas_trabajadas: horas,
        estado_servicio: r["estado_servicio"] ?? null,
        hay_cotizacion: r["hay_cotizacion"] ?? null,
        descripcion_cotizacion: r["descripcion_cotizacion"] ?? null,
        observaciones: r["observaciones"] ?? null,
        nps: null, // NPS not yet in data model
        placa_vehiculo: (r["placa_vehiculo"] as string | null) ?? null,
      };
    });

    res.json({ reports, total: count ?? reports.length });
  } catch (err) {
    req.log.error({ err }, "[dashboard/reports] query failed");
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// GET /dashboard/technicians
// ---------------------------------------------------------------------------

router.get("/dashboard/technicians", async (req: Request, res: Response) => {
  const q = req.query as Record<string, string>;
  const range = getDateRange(q["date_range"], q["from"], q["to"]);

  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    res.status(500).json({ error: String(err) });
    return;
  }

  try {
    const { data, error } = await supabase
      .from("reportes")
      .select("tecnico_nombre, hora_entrada, hora_salida, hay_cotizacion")
      .gte("created_at", `${range.from}T00:00:00`)
      .lte("created_at", `${range.to}T23:59:59`);

    if (error) throw error;

    const byTecnico = new Map<
      string,
      { visits: number; hours: number; pending: number }
    >();

    for (const r of data ?? []) {
      const name = (r.tecnico_nombre as string | null) ?? "Sin asignar";
      const entry = byTecnico.get(name) ?? { visits: 0, hours: 0, pending: 0 };
      entry.visits++;
      const h = calcHours(
        r.hora_entrada as string | null,
        r.hora_salida as string | null,
      );
      if (h !== null) entry.hours += h;
      if (r.hay_cotizacion === true) entry.pending++;
      byTecnico.set(name, entry);
    }

    const technicians = Array.from(byTecnico.entries())
      .map(([name, stats]) => ({
        tecnico_nombre: name,
        visits: stats.visits,
        hours_worked: Math.round(stats.hours * 100) / 100,
        avg_nps: null,
        pending_quotations: stats.pending,
      }))
      .sort((a, b) => b.visits - a.visits);

    res.json({ technicians });
  } catch (err) {
    req.log.error({ err }, "[dashboard/technicians] query failed");
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// GET /dashboard/chart
// ---------------------------------------------------------------------------

router.get("/dashboard/chart", async (req: Request, res: Response) => {
  const q = req.query as Record<string, string>;
  const range = getDateRange(q["date_range"], q["from"], q["to"]);

  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    res.status(500).json({ error: String(err) });
    return;
  }

  try {
    const { data, error } = await supabase
      .from("reportes")
      .select("tecnico_nombre, hora_entrada, hora_salida")
      .gte("created_at", `${range.from}T00:00:00`)
      .lte("created_at", `${range.to}T23:59:59`);

    if (error) throw error;

    const byTecnico = new Map<string, { hours: number; visits: number }>();

    for (const r of data ?? []) {
      const name = (r.tecnico_nombre as string | null) ?? "Sin asignar";
      const entry = byTecnico.get(name) ?? { hours: 0, visits: 0 };
      entry.visits++;
      const h = calcHours(
        r.hora_entrada as string | null,
        r.hora_salida as string | null,
      );
      if (h !== null) entry.hours += h;
      byTecnico.set(name, entry);
    }

    const entries = Array.from(byTecnico.entries())
      .map(([name, stats]) => ({
        tecnico_nombre: name,
        hours_worked: Math.round(stats.hours * 100) / 100,
        visits: stats.visits,
      }))
      .sort((a, b) => b.hours_worked - a.hours_worked);

    res.json({ entries });
  } catch (err) {
    req.log.error({ err }, "[dashboard/chart] query failed");
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// GET /dashboard/charts  — all 5 chart datasets in one request
// ---------------------------------------------------------------------------

router.get("/dashboard/charts", async (req: Request, res: Response) => {
  const q = req.query as Record<string, string>;
  const range = getDateRange(q["date_range"], q["from"], q["to"]);

  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    res.status(500).json({ error: String(err) });
    return;
  }

  try {
    // Fetch all reports in range with optional filters
    let query = supabase
      .from("reportes")
      .select(
        `id, tecnico_nombre, hora_entrada, hora_salida,
         tipo_servicio, estado_servicio, created_at,
         clientes(nombre_comercial)`,
      )
      .gte("created_at", `${range.from}T00:00:00`)
      .lte("created_at", `${range.to}T23:59:59`);

    if (q["tecnico"]) query = query.ilike("tecnico_nombre", `%${q["tecnico"]}%`);
    if (q["estado"])  query = query.ilike("estado_servicio", `%${q["estado"]}%`);
    if (q["tipo_servicio"]) query = query.contains("tipo_servicio", [q["tipo_servicio"]]);

    const { data, error } = await query;
    if (error) throw error;

    let rows = (data ?? []) as Array<Record<string, unknown>>;

    // Client filter (post-filter — join)
    if (q["cliente"]) {
      const search = q["cliente"].toLowerCase();
      rows = rows.filter((r) => {
        const c = r["clientes"] as { nombre_comercial?: string } | null;
        return (c?.nombre_comercial ?? "").toLowerCase().includes(search);
      });
    }

    // ── Chart 1: reportes por técnico ─────────────────────────────────────
    const countByTecnico = new Map<string, number>();
    const hoursByTecnico = new Map<string, number>();

    // ── Chart 3 & 4: by type and status ───────────────────────────────────
    const countByTipo = new Map<string, number>();
    const countByEstado = new Map<string, number>();

    // ── Chart 5: by day ───────────────────────────────────────────────────
    const countByDate = new Map<string, number>();

    const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

    for (const r of rows) {
      const tecnico = (r["tecnico_nombre"] as string | null) ?? "Sin asignar";
      countByTecnico.set(tecnico, (countByTecnico.get(tecnico) ?? 0) + 1);

      const h = calcHours(r["hora_entrada"] as string | null, r["hora_salida"] as string | null);
      if (h !== null) hoursByTecnico.set(tecnico, (hoursByTecnico.get(tecnico) ?? 0) + h);

      // tipo_servicio is an array
      const tipos = Array.isArray(r["tipo_servicio"])
        ? (r["tipo_servicio"] as string[])
        : r["tipo_servicio"] ? [(r["tipo_servicio"] as string)] : ["Sin tipo"];
      for (const t of tipos) {
        countByTipo.set(t, (countByTipo.get(t) ?? 0) + 1);
      }

      const estado = (r["estado_servicio"] as string | null) ?? "Sin estado";
      countByEstado.set(estado, (countByEstado.get(estado) ?? 0) + 1);

      const dateStr = (r["created_at"] as string | null)?.slice(0, 10) ?? "";
      if (dateStr) countByDate.set(dateStr, (countByDate.get(dateStr) ?? 0) + 1);
    }

    // Build date range for Chart 5 (all days from range.from to range.to)
    const porDia: Array<{ dia: string; fecha: string; reportes: number }> = [];
    const start = new Date(`${range.from}T12:00:00Z`);
    const end = new Date(`${range.to}T12:00:00Z`);
    const msPerDay = 86400000;
    const maxDays = 31;
    let cur = new Date(start);
    let dayCount = 0;
    while (cur <= end && dayCount < maxDays) {
      const fecha = cur.toISOString().slice(0, 10);
      const dayOfWeek = cur.getUTCDay();
      porDia.push({
        dia: DAY_NAMES[dayOfWeek] ?? fecha,
        fecha,
        reportes: countByDate.get(fecha) ?? 0,
      });
      cur = new Date(cur.getTime() + msPerDay);
      dayCount++;
    }

    const total = rows.length || 1; // avoid division by zero

    const reportesPorTecnico = [...countByTecnico.entries()]
      .map(([nombre, reportes]) => ({ nombre, reportes }))
      .sort((a, b) => b.reportes - a.reportes);

    const horasPorTecnico = [...hoursByTecnico.entries()]
      .map(([nombre, horas]) => ({ nombre, horas: Math.round(horas * 100) / 100 }))
      .sort((a, b) => b.horas - a.horas);

    const porTipoServicio = [...countByTipo.entries()]
      .map(([tipo, reportes]) => ({ tipo, reportes, pct: Math.round((reportes / total) * 1000) / 10 }))
      .sort((a, b) => b.reportes - a.reportes);

    const porEstado = [...countByEstado.entries()]
      .map(([estado, reportes]) => ({ estado, reportes, pct: Math.round((reportes / total) * 1000) / 10 }))
      .sort((a, b) => b.reportes - a.reportes);

    res.json({ reportesPorTecnico, horasPorTecnico, porTipoServicio, porEstado, porDia });
  } catch (err) {
    req.log.error({ err }, "[dashboard/charts] query failed");
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// GET /dashboard/filters
// ---------------------------------------------------------------------------

router.get("/dashboard/filters", async (req: Request, res: Response) => {
  const q = req.query as Record<string, string>;
  const range = getDateRange(q["date_range"], q["from"], q["to"]);

  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    res.status(500).json({ error: String(err) });
    return;
  }

  try {
    const [tecnicosQ, clientesQ, estadosQ, tiposQ] = await Promise.all([
      supabase
        .from("reportes")
        .select("tecnico_nombre")
        .gte("created_at", `${range.from}T00:00:00`)
        .lte("created_at", `${range.to}T23:59:59`)
        .not("tecnico_nombre", "is", null),
      supabase
        .from("reportes")
        .select("clientes!inner(nombre_comercial)")
        .gte("created_at", `${range.from}T00:00:00`)
        .lte("created_at", `${range.to}T23:59:59`),
      supabase
        .from("reportes")
        .select("estado_servicio")
        .gte("created_at", `${range.from}T00:00:00`)
        .lte("created_at", `${range.to}T23:59:59`)
        .not("estado_servicio", "is", null),
      supabase
        .from("reportes")
        .select("tipo_servicio")
        .gte("created_at", `${range.from}T00:00:00`)
        .lte("created_at", `${range.to}T23:59:59`)
        .not("tipo_servicio", "is", null),
    ]);

    // Filter out rows where tecnico_nombre is suspiciously long (data entry errors)
    const tecnicos = Array.from(
      new Set(
        (tecnicosQ.data ?? [])
          .map((r) => (r as { tecnico_nombre?: string }).tecnico_nombre)
          .filter((n): n is string => !!n && n.trim().length > 0 && n.length <= 80),
      ),
    ).sort();

    const clientes = Array.from(
      new Set(
        (clientesQ.data ?? [])
          .map((r) => {
            const c = (r as { clientes?: { nombre_comercial?: string } | null }).clientes;
            return c?.nombre_comercial;
          })
          .filter((n): n is string => !!n),
      ),
    ).sort();

    const estados = Array.from(
      new Set(
        (estadosQ.data ?? [])
          .map((r) => (r as { estado_servicio?: string }).estado_servicio)
          .filter((n): n is string => !!n),
      ),
    ).sort();

    const tiposSet = new Set<string>();
    for (const r of tiposQ.data ?? []) {
      const ts = (r as { tipo_servicio?: unknown }).tipo_servicio;
      if (Array.isArray(ts)) {
        for (const t of ts as string[]) { if (t) tiposSet.add(t); }
      } else if (typeof ts === "string" && ts) {
        tiposSet.add(ts);
      }
    }
    const tipos_servicio = Array.from(tiposSet).sort();

    res.json({ tecnicos, clientes, estados, tipos_servicio });
  } catch (err) {
    req.log.error({ err }, "[dashboard/filters] query failed");
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /dashboard/chat
// ---------------------------------------------------------------------------

router.post("/dashboard/chat", async (req: Request, res: Response) => {
  const { message, history = [] } = req.body as {
    message: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
    return;
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    res.status(500).json({ error: String(err) });
    return;
  }

  // ── Fetch full report data (reports + repuestos + tecnicos) ───────────────
  let contextBlock = "";
  try {
    const [reportesResult, repuestosResult, tecnicosResult] = await Promise.all([
      supabase
        .from("reportes")
        .select(
          `id, numero_reporte, created_at, tecnico_nombre, numero_llamada,
           numero_proyecto, trabajo_realizado, hora_entrada, hora_salida,
           estado_servicio, hay_cotizacion, descripcion_cotizacion,
           observaciones, tipo_servicio,
           clientes(nombre_comercial)`,
        )
        .order("created_at", { ascending: false })
        .limit(150),
      supabase
        .from("reportes_repuestos")
        .select("reporte_id, cantidad, descripcion")
        .limit(500),
      supabase
        .from("reportes_tecnicos")
        .select("reporte_id, nombre, es_subcontrato")
        .limit(500),
    ]);

    // Build lookup maps
    const repuestosByReporte = new Map<string, string[]>();
    for (const rp of repuestosResult.data ?? []) {
      const rid = String(rp.reporte_id);
      const list = repuestosByReporte.get(rid) ?? [];
      const desc = rp.cantidad ? `${rp.cantidad} x ${rp.descripcion}` : rp.descripcion;
      list.push(desc as string);
      repuestosByReporte.set(rid, list);
    }

    const tecnicosByReporte = new Map<string, string[]>();
    for (const t of tecnicosResult.data ?? []) {
      const rid = String(t.reporte_id);
      const list = tecnicosByReporte.get(rid) ?? [];
      const label = t.es_subcontrato ? `${t.nombre} (subcontrato)` : String(t.nombre);
      list.push(label);
      tecnicosByReporte.set(rid, list);
    }

    const rows = (reportesResult.data ?? []) as Array<Record<string, unknown>>;
    const lines = rows.map((r) => {
      const rid = String(r["id"]);
      const cliente = r["clientes"] as { nombre_comercial?: string } | null;
      const tipo = Array.isArray(r["tipo_servicio"])
        ? (r["tipo_servicio"] as string[]).join(", ")
        : ((r["tipo_servicio"] as string | null) ?? "N/A");
      const horas = calcHours(
        r["hora_entrada"] as string | null,
        r["hora_salida"] as string | null,
      );
      const horaStr = horas !== null
        ? `${horas}h (${r["hora_entrada"] ?? ""}–${r["hora_salida"] ?? ""})`
        : (r["hora_entrada"] ? `${r["hora_entrada"]}–${r["hora_salida"] ?? "?"}` : "N/A");
      const repuestos = repuestosByReporte.get(rid)?.join("; ") ?? "ninguno";
      const tecnicos = tecnicosByReporte.get(rid)?.join(", ") ?? "ninguno";
      const cotizacion = r["hay_cotizacion"] === true
        ? `Sí${r["descripcion_cotizacion"] ? ` (${r["descripcion_cotizacion"]})` : ""}`
        : "No";

      return [
        `--- Reporte #${r["numero_reporte"] ?? r["id"]} ---`,
        `Fecha: ${(r["created_at"] as string | null)?.slice(0, 10) ?? "?"}`,
        `Técnico principal: ${(r["tecnico_nombre"] as string | null) ?? "N/A"}`,
        `Técnicos adicionales: ${tecnicos}`,
        `Cliente: ${cliente?.nombre_comercial ?? "N/A"}`,
        `Llamada SAP: ${(r["numero_llamada"] as string | null) ?? "N/A"}`,
        `Proyecto: ${(r["numero_proyecto"] as string | null) ?? "N/A"}`,
        `Tipo de servicio: ${tipo}`,
        `Trabajo realizado: ${(r["trabajo_realizado"] as string | null) ?? "N/A"}`,
        `Estado: ${(r["estado_servicio"] as string | null) ?? "N/A"}`,
        `Horas trabajadas: ${horaStr}`,
        `Repuestos/materiales: ${repuestos}`,
        `Cotización pendiente: ${cotizacion}`,
        `Observaciones: ${(r["observaciones"] as string | null) ?? "ninguna"}`,
      ].join("\n");
    });

    contextBlock = lines.length > 0
      ? `BASE DE DATOS COMPLETA — ${lines.length} REPORTES:\n\n${lines.join("\n\n")}`
      : "No hay reportes en la base de datos aún.";
  } catch (err) {
    req.log.warn({ err }, "[dashboard/chat] failed to fetch context");
    contextBlock = "No se pudo cargar la base de datos de reportes.";
  }

  // ── Call Claude ───────────────────────────────────────────────────────────
  try {
    const client = new Anthropic({ apiKey });

    const systemPrompt = `Eres el asistente operativo de TAS El Salvador. Respondes al supervisor de operaciones como un analista inteligente y directo — no como una base de datos.

REGLAS DE ESTILO (obligatorias):
- Máximo 4-5 líneas por respuesta. Nunca más.
- Escribe en español natural, como si hablaras en persona con el supervisor.
- Nunca muestres datos crudos, tablas, JSON ni listas de campos. Narra.
- Si hay datos numéricos relevantes, inclúyelos en la oración de forma natural.
- Si algo no está disponible o no hay datos, dilo en una sola frase y ofrece lo que sí tienes.
- Cuando resumas un reporte, menciona: quién fue, a qué cliente, qué hizo, cuánto duró, y si hay algo pendiente — todo en prosa fluida.

Ejemplos de tono correcto:
"El reporte #7 es una visita de Hernán López a Banco Azul el 30 de abril. Realizó mantenimiento preventivo al sistema de alarmas, el servicio quedó terminado en 1 hora y no hay cotización pendiente."
"Hoy el técnico con más horas fue Hernán López, con 5 horas en La Constancia. Le sigue Mario Rodríguez con 2 horas en el mismo cliente."
"Hay 6 reportes con cotizaciones pendientes. Los más urgentes son de Banco Agrícola y La Constancia, que incluyen reemplazo de sensores y paneles."

${contextBlock}`;

    // Sanitize history: keep only alternating user/assistant turns with non-empty content.
    // The frontend initializes history with a greeting assistant message — strip it
    // and any messages with empty content before sending to Claude.
    const cleanHistory = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .filter((m) => typeof m.content === "string" && m.content.trim().length > 0);

    // Claude requires the first message to be from the user. Drop leading assistant messages.
    let startIdx = 0;
    while (startIdx < cleanHistory.length && cleanHistory[startIdx]?.role === "assistant") {
      startIdx++;
    }
    const trimmedHistory = cleanHistory.slice(startIdx);

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message.trim() },
    ];

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const answer =
      response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("") || "No pude generar una respuesta.";

    res.json({ answer });
  } catch (err) {
    req.log.error({ err }, "[dashboard/chat] Claude API failed");
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// GET /dashboard/horas-tecnico
// ---------------------------------------------------------------------------

router.get("/dashboard/horas-tecnico", async (req: Request, res: Response) => {
  const q = req.query as Record<string, string>;
  const todayStr = new Date().toISOString().slice(0, 10);
  const fechaDesde = q["fecha_desde"] ?? todayStr;
  const fechaHasta = q["fecha_hasta"] ?? todayStr;
  const supervisorId = q["supervisor_id"]?.trim() || null;

  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    let qRep = supabase
      .from("reportes")
      .select("id, tecnico_nombre, hora_entrada, hora_salida, reporte_tecnicos(nombre, total_horas, hora_entrada, hora_salida)")
      .gte("created_at", `${fechaDesde}T00:00:00`)
      .lte("created_at", `${fechaHasta}T23:59:59`);

    if (supervisorId) qRep = qRep.eq("supervisor_id", supervisorId);

    const { data, error } = await qRep;
    if (error) throw error;

    const byTecnico: Record<string, { total_horas: number; num_boletas: number }> = {};

    for (const reporte of (data ?? []) as Array<Record<string, unknown>>) {
      const tecnicos = reporte["reporte_tecnicos"] as Array<Record<string, unknown>> | null;
      if (tecnicos && tecnicos.length > 0) {
        for (const t of tecnicos) {
          const nombre = (t["nombre"] as string | null) ?? "Sin nombre";
          let horas = (t["total_horas"] as number | null) ?? null;
          if (horas === null) horas = calcHours(t["hora_entrada"] as string | null, t["hora_salida"] as string | null);
          if (!byTecnico[nombre]) byTecnico[nombre] = { total_horas: 0, num_boletas: 0 };
          byTecnico[nombre].total_horas += horas ?? 0;
          byTecnico[nombre].num_boletas++;
        }
      } else {
        const nombre = (reporte["tecnico_nombre"] as string | null) ?? "Sin nombre";
        const horas = calcHours(reporte["hora_entrada"] as string | null, reporte["hora_salida"] as string | null);
        if (!byTecnico[nombre]) byTecnico[nombre] = { total_horas: 0, num_boletas: 0 };
        byTecnico[nombre].total_horas += horas ?? 0;
        byTecnico[nombre].num_boletas++;
      }
    }

    const tecnicos = Object.entries(byTecnico)
      .map(([nombre, stats]) => ({
        nombre,
        total_horas: Math.round(stats.total_horas * 100) / 100,
        num_boletas: stats.num_boletas,
        avg_horas: stats.num_boletas > 0 ? Math.round((stats.total_horas / stats.num_boletas) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.total_horas - a.total_horas);

    res.json({ tecnicos });
  } catch (err) {
    req.log.error({ err }, "[dashboard/horas-tecnico] query failed");
    res.status(500).json({ error: String(err) });
  }
});

export default router;
