import { Router, type IRouter, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../lib/supabase";

const router: IRouter = Router();

// ── Date helpers ─────────────────────────────────────────────────────────────

interface DateRange { from: string; to: string }

function getDateRange(
  date_range: string | undefined,
  from: string | undefined,
  to: string | undefined,
): DateRange {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = fmt(now);

  if (date_range === "custom" && from && to) return { from, to };
  if (date_range === "today") return { from: today, to: today };
  if (date_range === "month") {
    const s = new Date(now); s.setDate(now.getDate() - 29);
    return { from: fmt(s), to: today };
  }
  const s = new Date(now); s.setDate(now.getDate() - 6);
  return { from: fmt(s), to: today };
}

function diffHours(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (isNaN(ta) || isNaN(tb) || tb <= ta) return null;
  return Math.round(((tb - ta) / 3600000) * 100) / 100;
}

// ── Shared query builder for opportunities ────────────────────────────────────

async function fetchOpportunities(
  supabase: ReturnType<typeof getSupabase>,
  range: DateRange,
  q: Record<string, string>,
) {
  // Use * so missing columns (not yet migrated) don't cause PGRST204 errors
  let query = supabase
    .from("reportes")
    .select("*, clientes(nombre_comercial)")
    .eq("hay_cotizacion", true)
    .gte("created_at", `${range.from}T00:00:00`)
    .lte("created_at", `${range.to}T23:59:59`);

  if (q["tecnico"])  query = query.ilike("tecnico_nombre", `%${q["tecnico"]}%`);
  // Only filter on cotizacion_estado if the column likely exists (skip if empty to avoid errors)
  if (q["estado"])   query = query.eq("cotizacion_estado", q["estado"]);
  if (q["vendedor"]) query = query.ilike("cotizacion_vendedor", `%${q["vendedor"]}%`);

  let data: Array<Record<string, unknown>> | null = null;
  let error: unknown = null;

  // First attempt — with all filters
  const result = await query.order("created_at", { ascending: false });
  data = result.data as Array<Record<string, unknown>> | null;
  error = result.error;

  // If the query failed because a column doesn't exist (PGRST204 / migration not run),
  // retry without the problematic filter columns but keep core filters
  if (error) {
    const errCode = (error as { code?: string }).code;
    if (errCode === "PGRST204" || errCode === "42703") {
      const retry = await supabase
        .from("reportes")
        .select("id, numero_reporte, created_at, tecnico_nombre, trabajo_realizado, hay_cotizacion, descripcion_cotizacion, clientes(nombre_comercial)")
        .eq("hay_cotizacion", true)
        .gte("created_at", `${range.from}T00:00:00`)
        .lte("created_at", `${range.to}T23:59:59`)
        .order("created_at", { ascending: false });
      data = retry.data as Array<Record<string, unknown>> | null;
      error = retry.error;
    }
    if (error) throw error;
  }

  let rows = (data ?? []) as Array<Record<string, unknown>>;

  if (q["cliente"]) {
    const s = q["cliente"].toLowerCase();
    rows = rows.filter((r) => {
      const c = r["clientes"] as { nombre_comercial?: string } | null;
      return (c?.nombre_comercial ?? "").toLowerCase().includes(s);
    });
  }

  return rows;
}

function cotizacionEstado(r: Record<string, unknown>): string {
  return (r["cotizacion_estado"] as string | null) ?? "pendiente";
}

// ── GET /comercial/kpis ───────────────────────────────────────────────────────

router.get("/comercial/kpis", async (req: Request, res: Response) => {
  const q = req.query as Record<string, string>;
  const range = getDateRange(q["date_range"], q["from"], q["to"]);

  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    const rows = await fetchOpportunities(supabase, range, q);
    const total = rows.length;

    let enviadas = 0, no_enviadas = 0, pendientes = 0;
    const vendedorTimes: Record<string, number[]> = {};

    for (const r of rows) {
      const estado = (r["cotizacion_estado"] as string | null) ?? "pendiente";
      if (estado === "enviada") enviadas++;
      else if (estado === "no_enviada") no_enviadas++;
      else pendientes++;

      const vendedor = (r["cotizacion_vendedor"] as string | null) ?? "Sin asignar";
      const hrs = diffHours(
        r["correo_comercial_enviado_at"] as string | null,
        r["cotizacion_enviada_at"] as string | null,
      );
      if (hrs !== null) {
        if (!vendedorTimes[vendedor]) vendedorTimes[vendedor] = [];
        vendedorTimes[vendedor]!.push(hrs);
      }
    }

    const conversion_rate = total > 0 ? Math.round((enviadas / total) * 1000) / 10 : 0;

    const avg_response_times: Array<{ vendedor: string; avg_hours: number }> = Object.entries(vendedorTimes).map(
      ([vendedor, times]) => ({
        vendedor,
        avg_hours: Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 100) / 100,
      }),
    );

    res.json({ total, enviadas, no_enviadas, pendientes, conversion_rate, avg_response_times });
  } catch (err) {
    req.log.error({ err }, "[comercial/kpis] failed");
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /comercial/reports ────────────────────────────────────────────────────

router.get("/comercial/reports", async (req: Request, res: Response) => {
  const q = req.query as Record<string, string>;
  const range = getDateRange(q["date_range"], q["from"], q["to"]);

  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    const rows = await fetchOpportunities(supabase, range, q);

    const reports = rows.map((r) => {
      const cliente = r["clientes"] as { nombre_comercial?: string } | null;
      const estado = (r["cotizacion_estado"] as string | null) ?? "pendiente";
      const enviada_at = r["cotizacion_enviada_at"] as string | null;
      const correo_at  = r["correo_comercial_enviado_at"] as string | null;
      const created_at = r["created_at"] as string | null;

      // Elapsed time from report creation to now, in human-readable form
      const now = Date.now();
      const created = new Date(created_at ?? "").getTime();
      const elapsedHrs = isNaN(created) ? null : Math.round(((now - created) / 3600000) * 10) / 10;

      return {
        id: r["id"],
        numero_reporte: r["numero_reporte"],
        created_at,
        tecnico_nombre: r["tecnico_nombre"] ?? null,
        cliente_nombre: cliente?.nombre_comercial ?? "",
        trabajo_realizado: r["trabajo_realizado"] ?? null,
        descripcion_cotizacion: r["descripcion_cotizacion"] ?? null,
        cotizacion_estado: estado,
        cotizacion_enviada_at: enviada_at,
        cotizacion_vendedor: r["cotizacion_vendedor"] ?? null,
        cotizacion_motivo_no_envio: r["cotizacion_motivo_no_envio"] ?? null,
        correo_comercial_enviado_at: correo_at,
        elapsed_hours: elapsedHrs,
        response_hours: diffHours(correo_at, enviada_at),
      };
    });

    res.json({ reports, total: reports.length });
  } catch (err) {
    req.log.error({ err }, "[comercial/reports] failed");
    res.status(500).json({ error: String(err) });
  }
});

// ── PATCH /comercial/report/:id ───────────────────────────────────────────────

router.patch("/comercial/report/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body as {
    cotizacion_estado: "enviada" | "no_enviada";
    cotizacion_vendedor?: string;
    cotizacion_motivo_no_envio?: string;
  };

  if (!body.cotizacion_estado) {
    res.status(400).json({ error: "cotizacion_estado is required" });
    return;
  }

  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    const updates: Record<string, unknown> = {
      cotizacion_estado: body.cotizacion_estado,
    };
    if (body.cotizacion_vendedor) updates["cotizacion_vendedor"] = body.cotizacion_vendedor;
    if (body.cotizacion_estado === "enviada") updates["cotizacion_enviada_at"] = new Date().toISOString();
    if (body.cotizacion_motivo_no_envio) updates["cotizacion_motivo_no_envio"] = body.cotizacion_motivo_no_envio;

    const { error } = await supabase.from("reportes").update(updates).eq("id", id);
    if (error) {
      const e = error as { code?: string; message?: string };
      const msg = e.message ?? JSON.stringify(error);
      req.log.error({ err: e }, "[comercial/report] patch failed");
      // Detect missing columns (migration not run)
      if (e.code === "PGRST204" || e.code === "42703" || msg.includes("does not exist")) {
        res.status(422).json({ error: "MIGRATION_NEEDED", message: "Las columnas comerciales no existen. Ejecuta la migración SQL en Supabase." });
      } else {
        res.status(500).json({ error: msg });
      }
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    req.log.error({ err }, "[comercial/report] patch failed");
    res.status(500).json({ error: msg });
  }
});

// ── GET /comercial/charts ─────────────────────────────────────────────────────

router.get("/comercial/charts", async (req: Request, res: Response) => {
  const q = req.query as Record<string, string>;
  const range = getDateRange(q["date_range"], q["from"], q["to"]);

  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    const rows = await fetchOpportunities(supabase, range, q);

    // Chart 1 — pie by estado
    const countByEstado: Record<string, number> = { enviada: 0, no_enviada: 0, pendiente: 0 };
    // Chart 2 — bar: oportunidades por vendedor (enviadas vs no_enviadas stacked)
    const vendedorMap: Record<string, { enviadas: number; no_enviadas: number; pendientes: number }> = {};
    // Chart 3 — avg response time per vendedor
    const vendedorTimes: Record<string, number[]> = {};
    // Chart 4 — top clients
    const clientMap: Record<string, number> = {};

    for (const r of rows) {
      const estado = (r["cotizacion_estado"] as string | null) ?? "pendiente";
      countByEstado[estado] = (countByEstado[estado] ?? 0) + 1;

      const vendedor = (r["cotizacion_vendedor"] as string | null) ?? "Sin asignar";
      if (!vendedorMap[vendedor]) vendedorMap[vendedor] = { enviadas: 0, no_enviadas: 0, pendientes: 0 };
      if (estado === "enviada") vendedorMap[vendedor]!.enviadas++;
      else if (estado === "no_enviada") vendedorMap[vendedor]!.no_enviadas++;
      else vendedorMap[vendedor]!.pendientes++;

      const hrs = diffHours(
        r["correo_comercial_enviado_at"] as string | null,
        r["cotizacion_enviada_at"] as string | null,
      );
      if (hrs !== null) {
        if (!vendedorTimes[vendedor]) vendedorTimes[vendedor] = [];
        vendedorTimes[vendedor]!.push(hrs);
      }

      const cliente = r["clientes"] as { nombre_comercial?: string } | null;
      const clientName = cliente?.nombre_comercial ?? "Sin cliente";
      clientMap[clientName] = (clientMap[clientName] ?? 0) + 1;
    }

    const porEstado = [
      { estado: "Enviadas",     value: countByEstado["enviada"] ?? 0,    color: "#2E7D32" },
      { estado: "No enviadas",  value: countByEstado["no_enviada"] ?? 0, color: "#CC0000" },
      { estado: "Pendientes",   value: countByEstado["pendiente"] ?? 0,  color: "#F57F17" },
    ].filter((x) => x.value > 0);

    const porVendedor = Object.entries(vendedorMap)
      .map(([nombre, v]) => ({ nombre, ...v }))
      .sort((a, b) => (b.enviadas + b.no_enviadas + b.pendientes) - (a.enviadas + a.no_enviadas + a.pendientes));

    const tiempoVendedor = Object.entries(vendedorTimes)
      .map(([nombre, times]) => ({
        nombre,
        avg_horas: Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 100) / 100,
      }))
      .sort((a, b) => a.avg_horas - b.avg_horas);

    const topClientes = Object.entries(clientMap)
      .map(([cliente, oportunidades]) => ({ cliente, oportunidades }))
      .sort((a, b) => b.oportunidades - a.oportunidades)
      .slice(0, 8);

    res.json({ porEstado, porVendedor, tiempoVendedor, topClientes });
  } catch (err) {
    req.log.error({ err }, "[comercial/charts] failed");
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /comercial/vendedores ─────────────────────────────────────────────────

router.get("/comercial/vendedores", async (req: Request, res: Response) => {
  const q = req.query as Record<string, string>;
  const range = getDateRange(q["date_range"], q["from"], q["to"]);

  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    const rows = await fetchOpportunities(supabase, range, q);

    const map: Record<string, {
      total: number; enviadas: number; no_enviadas: number; pendientes: number;
      responseTimes: number[];
    }> = {};

    for (const r of rows) {
      const vendedor = (r["cotizacion_vendedor"] as string | null) ?? "Sin asignar";
      if (!map[vendedor]) map[vendedor] = { total: 0, enviadas: 0, no_enviadas: 0, pendientes: 0, responseTimes: [] };
      map[vendedor]!.total++;
      const estado = (r["cotizacion_estado"] as string | null) ?? "pendiente";
      if (estado === "enviada") map[vendedor]!.enviadas++;
      else if (estado === "no_enviada") map[vendedor]!.no_enviadas++;
      else map[vendedor]!.pendientes++;

      const hrs = diffHours(
        r["correo_comercial_enviado_at"] as string | null,
        r["cotizacion_enviada_at"] as string | null,
      );
      if (hrs !== null) map[vendedor]!.responseTimes.push(hrs);
    }

    const vendedores = Object.entries(map).map(([nombre, v]) => {
      const tasa = v.total > 0 ? Math.round((v.enviadas / v.total) * 1000) / 10 : 0;
      const avgHrs = v.responseTimes.length > 0
        ? Math.round((v.responseTimes.reduce((a, b) => a + b, 0) / v.responseTimes.length) * 100) / 100
        : null;
      return { nombre, total: v.total, enviadas: v.enviadas, no_enviadas: v.no_enviadas, pendientes: v.pendientes, tasa, avg_horas: avgHrs };
    }).sort((a, b) => b.total - a.total);

    res.json({ vendedores });
  } catch (err) {
    req.log.error({ err }, "[comercial/vendedores] failed");
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /comercial/chat ──────────────────────────────────────────────────────

router.post("/comercial/chat", async (req: Request, res: Response) => {
  const { message, history = [] } = req.body as {
    message: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) { res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" }); return; }

  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  let contextBlock = "";
  try {
    const { data } = await supabase
      .from("reportes")
      .select(
        `id, numero_reporte, created_at, tecnico_nombre, trabajo_realizado,
         descripcion_cotizacion, cotizacion_estado, cotizacion_enviada_at,
         cotizacion_vendedor, cotizacion_motivo_no_envio, correo_comercial_enviado_at,
         clientes(nombre_comercial)`,
      )
      .eq("hay_cotizacion", true)
      .order("created_at", { ascending: false })
      .limit(100);

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const lines = rows.map((r) => {
      const c = r["clientes"] as { nombre_comercial?: string } | null;
      const hrs = diffHours(
        r["correo_comercial_enviado_at"] as string | null,
        r["cotizacion_enviada_at"] as string | null,
      );
      return `Reporte #${r["numero_reporte"]} | Cliente: ${c?.nombre_comercial ?? "N/A"} | Técnico: ${r["tecnico_nombre"] ?? "N/A"} | Cotización: ${r["descripcion_cotizacion"] ?? "N/A"} | Estado: ${r["cotizacion_estado"] ?? "pendiente"} | Vendedor: ${r["cotizacion_vendedor"] ?? "sin asignar"} | Tiempo respuesta: ${hrs !== null ? `${hrs}h` : "N/A"} | Motivo no envío: ${r["cotizacion_motivo_no_envio"] ?? "N/A"}`;
    });

    contextBlock = lines.length > 0
      ? `OPORTUNIDADES COMERCIALES (${lines.length} total):\n${lines.join("\n")}`
      : "No hay oportunidades comerciales registradas aún.";
  } catch {
    contextBlock = "No se pudo cargar el contexto comercial.";
  }

  try {
    const client = new Anthropic({ apiKey });

    const systemPrompt = `Eres el asistente comercial de TAS El Salvador. Ayudas al equipo de ventas a gestionar las oportunidades de cotización generadas por los técnicos de campo. Respondes de forma ejecutiva y concisa — máximo 4-5 líneas, en español natural, nunca datos crudos ni listas largas.

Cuando te pregunten por un vendedor, cliente o estado de cotización, da un resumen fluido. Si algo no está disponible, dilo brevemente.

${contextBlock}`;

    const cleanHistory = history
      .filter((m) => typeof m.content === "string" && m.content.trim().length > 0);
    let startIdx = 0;
    while (startIdx < cleanHistory.length && cleanHistory[startIdx]?.role === "assistant") startIdx++;
    const trimmedHistory = cleanHistory.slice(startIdx);

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message.trim() },
    ];

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 512,
      system: systemPrompt,
      messages,
    });

    const answer = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("") || "No pude generar una respuesta.";

    res.json({ answer });
  } catch (err) {
    req.log.error({ err }, "[comercial/chat] Claude API failed");
    res.status(500).json({ error: String(err) });
  }
});

export { router as comercialRouter };
