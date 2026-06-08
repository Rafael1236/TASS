import { Router, type IRouter, type Request, type Response } from "express";
import { getSupabase, getSupabaseAdmin } from "../lib/supabase";
import { sendCommercialEmail } from "../lib/email";
import { sendEmail } from "../lib/sendEmail";

const FROM = "TAS Reportes <onboarding@resend.dev>";
// Real commercial area recipient — Allen Rosales
const COMMERCIAL_EMAIL = "arosales@tas-seguridad.com";
const COMMERCIAL_NAME = "Área Comercial — Allen Rosales";

const router: IRouter = Router();

// ── GET /api/revision/pendientes ────────────────────────────────────────────────

router.get("/revision/pendientes", async (req: Request, res: Response) => {
  const supervisorId = (req.query["supervisor_id"] as string | undefined)?.trim() || null;
  const fechaDesde = (req.query["fecha_desde"] as string | undefined)?.trim() || null;
  const fechaHasta = (req.query["fecha_hasta"] as string | undefined)?.trim() || null;
  const includeLlamada = req.query["include_llamada"] === "true";

  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    const selectStr =
      "id, numero_reporte, created_at, tecnico_nombre, numero_llamada, " +
      "tipo_servicio, trabajo_realizado, estado_revision, falta_numero_llamada, " +
      "numero_llamada_solicitado_at, es_reproceso, revisado_por, revisado_at, " +
      "tiempo_revision_minutos, supervisor_id, hora_entrada, hora_salida, " +
      "estado_servicio, hay_cotizacion, descripcion_cotizacion, observaciones, " +
      "numero_proyecto, placa_vehiculo, equipos_instalados, total_horas_equipo, " +
      "clientes!inner(nombre_comercial), " +
      "reporte_tecnicos(id, nombre, es_subcontrato, es_principal, hora_entrada, hora_salida, total_horas)";

    const estadosFilter = includeLlamada
      ? ["pendiente_revision", "pendiente_llamada"]
      : ["pendiente_revision"];

    let q = supabase
      .from("reportes")
      .select(selectStr)
      .in("estado_revision", estadosFilter)
      .order("created_at", { ascending: true });

    if (supervisorId) q = q.eq("supervisor_id", supervisorId);
    if (fechaDesde) q = q.gte("created_at", `${fechaDesde}T00:00:00`);
    if (fechaHasta) q = q.lte("created_at", `${fechaHasta}T23:59:59`);

    const { data, error } = await q;
    if (error) throw error;

    // Resolve supervisor names in one extra query
    const rawData = (data ?? []) as Array<Record<string, unknown>>;
    const supIds = [...new Set(rawData.map((r) => r["supervisor_id"] as string | null).filter(Boolean))] as string[];
    let supervisorMap: Record<string, string> = {};
    if (supIds.length > 0) {
      const { data: sups } = await supabase.from("usuarios").select("id, nombre").in("id", supIds);
      supervisorMap = Object.fromEntries((sups ?? []).map((s) => [(s as { id: string; nombre: string }).id, (s as { id: string; nombre: string }).nombre]));
    }

    const reports = rawData.map((r) => {
      const rawTecnicos = Array.isArray(r["reporte_tecnicos"])
        ? (r["reporte_tecnicos"] as Array<Record<string, unknown>>)
        : [];
      const tecnicos = rawTecnicos.map((t) => ({
        id: String(t["id"] ?? ""),
        nombre: (t["nombre"] as string | null) ?? null,
        es_subcontrato: Boolean(t["es_subcontrato"]),
        es_principal: Boolean(t["es_principal"]),
        hora_entrada: (t["hora_entrada"] as string | null) ?? null,
        hora_salida: (t["hora_salida"] as string | null) ?? null,
        total_horas: (t["total_horas"] as number | null) ?? null,
      }));

      const supId = r["supervisor_id"] as string | null;

      return {
        id: r["id"],
        numero_reporte: r["numero_reporte"] ?? null,
        created_at: r["created_at"] ?? null,
        tecnico_nombre: r["tecnico_nombre"] ?? null,
        supervisor_id: supId ?? null,
        supervisor_nombre: supId ? (supervisorMap[supId] ?? null) : null,
        cliente_nombre: ((r["clientes"] as { nombre_comercial?: string } | null)?.nombre_comercial) ?? "",
        numero_llamada: r["numero_llamada"] ?? null,
        tipo_servicio: Array.isArray(r["tipo_servicio"])
          ? (r["tipo_servicio"] as string[]).join(", ")
          : ((r["tipo_servicio"] as string | null) ?? null),
        trabajo_realizado: r["trabajo_realizado"] ?? null,
        estado_revision: r["estado_revision"] ?? "pendiente_revision",
        falta_numero_llamada: r["falta_numero_llamada"] ?? false,
        numero_llamada_solicitado_at: r["numero_llamada_solicitado_at"] ?? null,
        es_reproceso: r["es_reproceso"] ?? false,
        revisado_por: r["revisado_por"] ?? null,
        revisado_at: r["revisado_at"] ?? null,
        tiempo_revision_minutos: r["tiempo_revision_minutos"] ?? null,
        hora_entrada: r["hora_entrada"] ?? null,
        hora_salida: r["hora_salida"] ?? null,
        estado_servicio: r["estado_servicio"] ?? null,
        hay_cotizacion: r["hay_cotizacion"] ?? null,
        descripcion_cotizacion: r["descripcion_cotizacion"] ?? null,
        observaciones: r["observaciones"] ?? null,
        numero_proyecto: r["numero_proyecto"] ?? null,
        placa_vehiculo: r["placa_vehiculo"] ?? null,
        equipos_instalados: r["equipos_instalados"] ?? null,
        total_horas_equipo: (r["total_horas_equipo"] as number | null) ?? null,
        tecnicos,
      };
    });

    res.json({ reports });
  } catch (err) {
    req.log.error({ err }, "[revision/pendientes] query failed");
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/revision/pendientes-llamada ────────────────────────────────────────

router.get("/revision/pendientes-llamada", async (req: Request, res: Response) => {
  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    const { data, error } = await supabase
      .from("reportes")
      .select(
        "id, numero_reporte, created_at, tecnico_nombre, numero_llamada, " +
        "tipo_servicio, trabajo_realizado, numero_llamada_solicitado_at, " +
        "numero_llamada_ingresado_at, numero_llamada_ingresado_por, " +
        "clientes!inner(nombre_comercial)"
      )
      .eq("estado_revision", "pendiente_llamada")
      .order("numero_llamada_solicitado_at", { ascending: true });

    if (error) throw error;

    const reports = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r["id"],
      numero_reporte: r["numero_reporte"] ?? null,
      created_at: r["created_at"] ?? null,
      tecnico_nombre: r["tecnico_nombre"] ?? null,
      cliente_nombre: ((r["clientes"] as { nombre_comercial?: string } | null)?.nombre_comercial) ?? "",
      numero_llamada: r["numero_llamada"] ?? null,
      tipo_servicio: Array.isArray(r["tipo_servicio"])
        ? (r["tipo_servicio"] as string[]).join(", ")
        : ((r["tipo_servicio"] as string | null) ?? null),
      trabajo_realizado: r["trabajo_realizado"] ?? null,
      numero_llamada_solicitado_at: r["numero_llamada_solicitado_at"] ?? null,
      numero_llamada_ingresado_at: r["numero_llamada_ingresado_at"] ?? null,
      numero_llamada_ingresado_por: r["numero_llamada_ingresado_por"] ?? null,
    }));

    res.json({ reports });
  } catch (err) {
    req.log.error({ err }, "[revision/pendientes-llamada] query failed");
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/revision/kpis ─────────────────────────────────────────────────────

router.get("/revision/kpis", async (req: Request, res: Response) => {
  const supervisorId = (req.query["supervisor_id"] as string | undefined)?.trim() || null;

  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    const today = new Date().toISOString().split("T")[0]!;
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    let qPend = supabase.from("reportes").select("id", { count: "exact", head: true }).eq("estado_revision", "pendiente_revision");
    let qLlam = supabase.from("reportes").select("id", { count: "exact", head: true }).eq("estado_revision", "pendiente_llamada");
    let qReproc = supabase.from("reportes").select("id", { count: "exact", head: true }).eq("es_reproceso", true).gte("revisado_at", `${today}T00:00:00`).lte("revisado_at", `${today}T23:59:59`);
    let qRevHoy = supabase.from("reportes").select("tiempo_revision_minutos").eq("estado_revision", "revisada").gte("revisado_at", `${today}T00:00:00`).lte("revisado_at", `${today}T23:59:59`).not("tiempo_revision_minutos", "is", null);
    let qTiempoSem = supabase.from("reportes").select("tiempo_revision_minutos").eq("estado_revision", "revisada").gte("revisado_at", weekAgo).not("tiempo_revision_minutos", "is", null);
    let qLlamTimes = supabase.from("reportes").select("numero_llamada_solicitado_at, numero_llamada_ingresado_at").eq("estado_revision", "revisada").not("numero_llamada_ingresado_at", "is", null).not("numero_llamada_solicitado_at", "is", null).gte("numero_llamada_ingresado_at", weekAgo);

    if (supervisorId) {
      qPend = qPend.eq("supervisor_id", supervisorId);
      qLlam = qLlam.eq("supervisor_id", supervisorId);
      qReproc = qReproc.eq("supervisor_id", supervisorId);
      qRevHoy = qRevHoy.eq("supervisor_id", supervisorId);
      qTiempoSem = qTiempoSem.eq("supervisor_id", supervisorId);
      qLlamTimes = qLlamTimes.eq("supervisor_id", supervisorId);
    }

    // Per-supervisor breakdown (for tooltip in ops dashboard)
    let qPorSup = supabase
      .from("reportes")
      .select("revisado_por, tiempo_revision_minutos")
      .eq("estado_revision", "revisada")
      .gte("revisado_at", weekAgo)
      .not("tiempo_revision_minutos", "is", null);
    // Not filtered by supervisorId — always show all supervisors in the breakdown

    const [pendQ, pendLlamQ, reprocQ, revHoyQ, tiempoSemQ, llamadaTimesQ, porSupQ] = await Promise.all([
      qPend, qLlam, qReproc, qRevHoy, qTiempoSem, qLlamTimes, qPorSup,
    ]);

    const revHoy = (revHoyQ.data ?? []) as Array<{ tiempo_revision_minutos: number | null }>;
    const avgRevisionHoy = revHoy.length > 0
      ? Math.round(revHoy.reduce((s, r) => s + (r.tiempo_revision_minutos ?? 0), 0) / revHoy.length)
      : null;

    const tiempoSem = (tiempoSemQ.data ?? []) as Array<{ tiempo_revision_minutos: number | null }>;
    const avgRevisionSemana = tiempoSem.length > 0
      ? Math.round(tiempoSem.reduce((s, r) => s + (r.tiempo_revision_minutos ?? 0), 0) / tiempoSem.length)
      : null;

    const llamadaTimes = (llamadaTimesQ.data ?? []) as Array<{
      numero_llamada_solicitado_at: string;
      numero_llamada_ingresado_at: string;
    }>;
    const avgLlamadaMinutos = llamadaTimes.length > 0
      ? Math.round(
          llamadaTimes.reduce((s, r) => {
            const diff = (new Date(r.numero_llamada_ingresado_at).getTime() - new Date(r.numero_llamada_solicitado_at).getTime()) / 60000;
            return s + diff;
          }, 0) / llamadaTimes.length
        )
      : null;

    // Build per-supervisor avg map
    const bySupMap: Record<string, { total: number; count: number }> = {};
    for (const row of ((porSupQ.data ?? []) as Array<{ revisado_por: string | null; tiempo_revision_minutos: number | null }>)) {
      const name = row.revisado_por ?? "Sin nombre";
      if (!bySupMap[name]) bySupMap[name] = { total: 0, count: 0 };
      bySupMap[name].total += row.tiempo_revision_minutos ?? 0;
      bySupMap[name].count++;
    }
    const por_supervisor = Object.entries(bySupMap)
      .map(([nombre, { total, count }]) => ({ nombre, avg_minutos: Math.round(total / count), total_revisadas: count }))
      .sort((a, b) => a.avg_minutos - b.avg_minutos);

    res.json({
      pendientes_revision: pendQ.count ?? 0,
      pendientes_llamada: pendLlamQ.count ?? 0,
      reprocesos_hoy: reprocQ.count ?? 0,
      revisadas_hoy: revHoy.length,
      avg_revision_minutos_hoy: avgRevisionHoy,
      avg_revision_minutos_semana: avgRevisionSemana,
      avg_llamada_minutos_semana: avgLlamadaMinutos,
      por_supervisor,
    });
  } catch (err) {
    req.log.error({ err }, "[revision/kpis] query failed");
    res.status(500).json({ error: String(err) });
  }
});

// ── PATCH /api/revision/:id/revisar ────────────────────────────────────────────

interface RevisarBody { revisado_por?: string; es_reproceso?: boolean; }

router.patch("/revision/:id/revisar", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const body = req.body as RevisarBody;

  let supabase;
  try { supabase = getSupabaseAdmin(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    const { data: reporte, error: getErr } = await supabase
      .from("reportes")
      .select(
        "created_at, numero_reporte, tecnico_nombre, numero_llamada, numero_proyecto, " +
        "tipo_servicio, trabajo_realizado, hora_entrada, hora_salida, estado_servicio, " +
        "hay_cotizacion, descripcion_cotizacion, observaciones, clientes!inner(nombre_comercial)"
      )
      .eq("id", id)
      .single();

    if (getErr || !reporte) { res.status(404).json({ error: "Reporte no encontrado" }); return; }

    const r = reporte as Record<string, unknown>;
    const now = new Date();
    const tiempoMinutos = Math.round(
      (now.getTime() - new Date((r["created_at"] as string)).getTime()) / 60000
    );

    const { error } = await supabase.from("reportes").update({
      estado_revision: "revisada",
      revisado_por: body.revisado_por ?? "Supervisor TAS",
      revisado_at: now.toISOString(),
      tiempo_revision_minutos: tiempoMinutos,
      es_reproceso: body.es_reproceso ?? false,
    }).eq("id", id);

    if (error) throw error;

    res.json({ success: true, tiempo_revision_minutos: tiempoMinutos });

    // Fire-and-forget: send commercial email after responding to avoid timeout
    const clienteNombre = ((r["clientes"] as { nombre_comercial?: string } | null)?.nombre_comercial) ?? "";
    const tipoServicio = Array.isArray(r["tipo_servicio"])
      ? (r["tipo_servicio"] as string[]).join(", ")
      : ((r["tipo_servicio"] as string | null) ?? null);

    void sendCommercialEmail(
      {
        numero_reporte: (r["numero_reporte"] as string | number) ?? id,
        cliente_nombre: clienteNombre,
        tecnico_nombre: r["tecnico_nombre"] as string | null,
        numero_llamada: r["numero_llamada"] as string | null,
        numero_proyecto: r["numero_proyecto"] as string | null,
        tipo_servicio: tipoServicio,
        trabajo_realizado: r["trabajo_realizado"] as string | null,
        hora_entrada: r["hora_entrada"] as string | null,
        hora_salida: r["hora_salida"] as string | null,
        estado_servicio: r["estado_servicio"] as string | null,
        hay_cotizacion: r["hay_cotizacion"] as boolean | null,
        descripcion_cotizacion: r["descripcion_cotizacion"] as string | null,
        observaciones: r["observaciones"] as string | null,
      },
      {
        info: (msg: string) => req.log.info(msg),
        warn: (msg: string) => req.log.warn(msg),
        error: (msg: string) => req.log.error(msg),
      },
      { reporteId: id, supabase },
    );
  } catch (err) {
    req.log.error({ err }, "[revision/revisar] update failed");
    res.status(500).json({ error: String(err) });
  }
});

// ── PATCH /api/revision/:id/solicitar-llamada ──────────────────────────────────

router.patch("/revision/:id/solicitar-llamada", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };

  let supabase;
  try { supabase = getSupabaseAdmin(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    const { data: reporte, error: getErr } = await supabase
      .from("reportes")
      .select("id, numero_reporte, tecnico_nombre, trabajo_realizado, tipo_servicio, clientes!inner(nombre_comercial)")
      .eq("id", id).single();

    if (getErr || !reporte) { res.status(404).json({ error: "Reporte no encontrado" }); return; }

    const now = new Date().toISOString();
    const { error } = await supabase.from("reportes").update({
      estado_revision: "pendiente_llamada",
      falta_numero_llamada: true,
      numero_llamada_solicitado_at: now,
    }).eq("id", id);

    if (error) throw error;

    res.json({ success: true });

    // Fire-and-forget: notify commercial team that this boleta needs an SAP call number
    const r = reporte as Record<string, unknown>;
    const clienteNombre = ((r["clientes"] as { nombre_comercial?: string } | null)?.nombre_comercial) ?? "";
    const numeroReporte = r["numero_reporte"] ?? id;
    const tecnicoNombre = (r["tecnico_nombre"] as string | null) ?? "—";
    const trabajoRealizado = (r["trabajo_realizado"] as string | null) ?? "—";
    const tipoServicio = Array.isArray(r["tipo_servicio"])
      ? (r["tipo_servicio"] as string[]).join(", ")
      : ((r["tipo_servicio"] as string | null) ?? "—");

    void sendEmail(
      {
        from: FROM,
        to: COMMERCIAL_EMAIL,
        testLabel: `${COMMERCIAL_NAME}\nCorreo: ${COMMERCIAL_EMAIL}`,
        subject: `⚠️ Boleta sin # llamada SAP — ${clienteNombre} — Reporte #${numeroReporte}`,
        html: `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.12);">
<tr><td style="background:#1A252F;padding:24px 32px;">
  <div style="display:inline-block;background:#F59E0B;color:#000;font-size:11px;font-weight:700;padding:4px 10px;border-radius:4px;text-transform:uppercase;margin-bottom:10px;">⚠️ Falta # Llamada SAP</div>
  <div style="color:#fff;font-size:20px;font-weight:700;">Reporte #${numeroReporte}</div>
  <div style="color:#8696A0;font-size:13px;margin-top:4px;">${clienteNombre}</div>
</td></tr>
<tr><td style="padding:28px 32px;">
  <p style="font-size:14px;color:#374151;margin:0 0 20px;">El supervisor solicitó el número de llamada SAP para la siguiente boleta. Por favor ingresar en el sistema.</p>
  <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:6px 12px 6px 0;font-size:13px;color:#6B7280;font-weight:600;width:160px;">Técnico</td><td style="padding:6px 0;font-size:13px;color:#111827;">${tecnicoNombre}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;font-size:13px;color:#6B7280;font-weight:600;">Tipo de servicio</td><td style="padding:6px 0;font-size:13px;color:#111827;">${tipoServicio}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;font-size:13px;color:#6B7280;font-weight:600;vertical-align:top;">Trabajo realizado</td><td style="padding:6px 0;font-size:13px;color:#111827;">${trabajoRealizado}</td></tr>
  </table>
</td></tr>
</table></td></tr></table>
</body></html>`,
      },
      { info: (m) => req.log.info(m), warn: (m) => req.log.warn(m), error: (m) => req.log.error(m) },
    );
  } catch (err) {
    req.log.error({ err }, "[revision/solicitar-llamada] update failed");
    res.status(500).json({ error: String(err) });
  }
});

// ── PATCH /api/revision/:id/ingresar-llamada ───────────────────────────────────

interface IngresarLlamadaBody { numero_llamada: string; ingresado_por?: string; }

router.patch("/revision/:id/ingresar-llamada", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const body = req.body as IngresarLlamadaBody;

  if (!body.numero_llamada?.trim()) { res.status(400).json({ error: "numero_llamada es requerido" }); return; }

  let supabase;
  try { supabase = getSupabaseAdmin(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    const { data: reporte, error: getErr } = await supabase
      .from("reportes").select("created_at").eq("id", id).single();

    if (getErr || !reporte) { res.status(404).json({ error: "Reporte no encontrado" }); return; }

    const now = new Date();
    const tiempoMinutos = Math.round(
      (now.getTime() - new Date((reporte as { created_at: string }).created_at).getTime()) / 60000
    );

    const { error } = await supabase.from("reportes").update({
      numero_llamada: body.numero_llamada.trim(),
      numero_llamada_ingresado_at: now.toISOString(),
      numero_llamada_ingresado_por: body.ingresado_por ?? "Área Comercial",
      estado_revision: "revisada",
      revisado_at: now.toISOString(),
      tiempo_revision_minutos: tiempoMinutos,
      falta_numero_llamada: false,
    }).eq("id", id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "[revision/ingresar-llamada] update failed");
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/revision/reprocesos ───────────────────────────────────────────────

router.get("/revision/reprocesos", async (req: Request, res: Response) => {
  const supervisorId = (req.query["supervisor_id"] as string | undefined)?.trim() || null;
  const fechaDesde = (req.query["fecha_desde"] as string | undefined)?.trim() || null;
  const fechaHasta = (req.query["fecha_hasta"] as string | undefined)?.trim() || null;

  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const desde = fechaDesde ?? today;
    const hasta = fechaHasta ?? today;

    let q = supabase
      .from("reportes")
      .select(
        "id, numero_reporte, created_at, revisado_at, tecnico_nombre, numero_llamada, " +
        "tipo_servicio, trabajo_realizado, observaciones, supervisor_id, " +
        "clientes!inner(nombre_comercial)"
      )
      .eq("es_reproceso", true)
      .gte("revisado_at", `${desde}T00:00:00`)
      .lte("revisado_at", `${hasta}T23:59:59`)
      .order("revisado_at", { ascending: false });

    if (supervisorId) {
      q = q.eq("supervisor_id", supervisorId);
    }

    const { data, error } = await q;
    if (error) throw error;

    const reprocesos = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r["id"],
      numero_reporte: r["numero_reporte"] ?? null,
      created_at: r["created_at"] ?? null,
      revisado_at: r["revisado_at"] ?? null,
      tecnico_nombre: r["tecnico_nombre"] ?? null,
      cliente_nombre: ((r["clientes"] as { nombre_comercial?: string } | null)?.nombre_comercial) ?? "",
      numero_llamada: r["numero_llamada"] ?? null,
      tipo_servicio: Array.isArray(r["tipo_servicio"])
        ? (r["tipo_servicio"] as string[]).join(", ")
        : ((r["tipo_servicio"] as string | null) ?? null),
      trabajo_realizado: r["trabajo_realizado"] ?? null,
      observaciones: r["observaciones"] ?? null,
    }));

    res.json({ reprocesos });
  } catch (err) {
    req.log.error({ err }, "[revision/reprocesos] query failed");
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/revision/supervisor-stats ─────────────────────────────────────────

router.get("/revision/supervisor-stats", async (req: Request, res: Response) => {
  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    const [supsQ, reportesQ, proyectosQ, subPendQ] = await Promise.all([
      supabase.from("usuarios").select("id, nombre").in("rol", ["supervisor", "admin"]),
      supabase.from("reportes").select("supervisor_id, estado_revision, tiempo_revision_minutos").not("supervisor_id", "is", null),
      supabase.from("subcontratos_proyectos").select("id, supervisor_id, estado").not("supervisor_id", "is", null),
      supabase.from("subcontratos_reportes").select("proyecto_id, estado").eq("estado", "pendiente"),
    ]);

    const sups = (supsQ.data ?? []) as Array<{ id: string; nombre: string }>;
    const reportes = (reportesQ.data ?? []) as Array<{ supervisor_id: string; estado_revision: string; tiempo_revision_minutos: number | null }>;
    const proyectos = (proyectosQ.data ?? []) as Array<{ id: string; supervisor_id: string; estado: string }>;
    const pendReportes = (subPendQ.data ?? []) as Array<{ proyecto_id: string }>;

    // Build project→supervisor map for pending approvals
    const projSupMap = Object.fromEntries(proyectos.map((p) => [p.id, p.supervisor_id]));

    type Stat = { boletas: number; pendientes: number; totalTiempo: number; countTiempo: number; subcontratos: number; pendAprobacion: number };
    const statsMap: Record<string, Stat> = {};
    const mkStat = (): Stat => ({ boletas: 0, pendientes: 0, totalTiempo: 0, countTiempo: 0, subcontratos: 0, pendAprobacion: 0 });

    for (const r of reportes) {
      const id = r.supervisor_id;
      if (!statsMap[id]) statsMap[id] = mkStat();
      statsMap[id].boletas++;
      if (r.estado_revision === "pendiente_revision" || r.estado_revision === "pendiente_llamada") statsMap[id].pendientes++;
      if (r.tiempo_revision_minutos !== null) { statsMap[id].totalTiempo += r.tiempo_revision_minutos; statsMap[id].countTiempo++; }
    }

    for (const p of proyectos) {
      const id = p.supervisor_id;
      if (!statsMap[id]) statsMap[id] = mkStat();
      if (p.estado !== "completado") statsMap[id].subcontratos++;
    }

    for (const r of pendReportes) {
      const supId = projSupMap[r.proyecto_id];
      if (!supId) continue;
      if (!statsMap[supId]) statsMap[supId] = mkStat();
      statsMap[supId].pendAprobacion++;
    }

    const supervisores = sups.map((s) => {
      const st = statsMap[s.id] ?? mkStat();
      return {
        id: s.id,
        nombre: s.nombre,
        boletas_asignadas: st.boletas,
        boletas_pendientes: st.pendientes,
        avg_revision_minutos: st.countTiempo > 0 ? Math.round(st.totalTiempo / st.countTiempo) : null,
        subcontratos_activos: st.subcontratos,
        pendientes_aprobacion: st.pendAprobacion,
      };
    }).sort((a, b) => b.boletas_asignadas - a.boletas_asignadas);

    res.json({ supervisores });
  } catch (err) {
    req.log.error({ err }, "[revision/supervisor-stats] query failed");
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/revision/supervisor-dashboard ─────────────────────────────────────
// Combined KPIs for supervisor sections 1 + 8

router.get("/revision/supervisor-dashboard", async (req: Request, res: Response) => {
  const supervisorId = (req.query["supervisor_id"] as string | undefined)?.trim() || null;
  const fechaDesde = (req.query["fecha_desde"] as string | undefined)?.trim() || null;
  const fechaHasta = (req.query["fecha_hasta"] as string | undefined)?.trim() || null;

  if (!supervisorId) { res.status(400).json({ error: "supervisor_id required" }); return; }

  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    // Week: Mon of current week
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - dayOfWeek); weekStart.setHours(0,0,0,0);
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    // Month: first day of current month
    const monthStart = `${today.slice(0, 7)}-01`;

    // Determine custom date range if provided (for section 8)
    const desde = fechaDesde ?? monthStart;
    const hasta = fechaHasta ?? today;
    // Previous period: same length before desde
    const periodMs = new Date(`${hasta}T23:59:59`).getTime() - new Date(`${desde}T00:00:00`).getTime();
    const prevHasta = new Date(new Date(`${desde}T00:00:00`).getTime() - 1);
    const prevDesde = new Date(prevHasta.getTime() - periodMs);
    const prevDesdeStr = prevDesde.toISOString().slice(0, 10);
    const prevHastaStr = prevHasta.toISOString().slice(0, 10);

    const base = supabase.from("reportes");
    const sup = supervisorId;

    const [hoyQ, semQ, mesQ, pendRevQ, pendLlamQ, avgQ, reprocMesQ,
      prevBoletasQ, prevAvgQ, subActQ, subPendQ] = await Promise.all([
      // Boletas hoy (total count, not just revisadas)
      base.select("id", { count: "exact", head: true }).eq("supervisor_id", sup).gte("created_at", `${today}T00:00:00`).lte("created_at", `${today}T23:59:59`),
      // Boletas esta semana
      base.select("id", { count: "exact", head: true }).eq("supervisor_id", sup).gte("created_at", `${weekStartStr}T00:00:00`).lte("created_at", `${today}T23:59:59`),
      // Boletas este mes (custom period)
      base.select("id", { count: "exact", head: true }).eq("supervisor_id", sup).gte("created_at", `${desde}T00:00:00`).lte("created_at", `${hasta}T23:59:59`),
      // Pendientes revisión
      base.select("id", { count: "exact", head: true }).eq("supervisor_id", sup).eq("estado_revision", "pendiente_revision"),
      // Pendientes llamada
      base.select("id", { count: "exact", head: true }).eq("supervisor_id", sup).eq("estado_revision", "pendiente_llamada"),
      // Avg revision time (periodo actual revisadas)
      base.select("tiempo_revision_minutos").eq("supervisor_id", sup).eq("estado_revision", "revisada").not("tiempo_revision_minutos", "is", null).gte("revisado_at", `${desde}T00:00:00`).lte("revisado_at", `${hasta}T23:59:59`),
      // Reprocesos este mes
      base.select("id", { count: "exact", head: true }).eq("supervisor_id", sup).eq("es_reproceso", true).gte("revisado_at", `${monthStart}T00:00:00`).lte("revisado_at", `${today}T23:59:59`),
      // Periodo anterior: boletas count
      base.select("id", { count: "exact", head: true }).eq("supervisor_id", sup).gte("created_at", `${prevDesdeStr}T00:00:00`).lte("created_at", `${prevHastaStr}T23:59:59`),
      // Periodo anterior: avg revision
      base.select("tiempo_revision_minutos").eq("supervisor_id", sup).eq("estado_revision", "revisada").not("tiempo_revision_minutos", "is", null).gte("revisado_at", `${prevDesdeStr}T00:00:00`).lte("revisado_at", `${prevHastaStr}T23:59:59`),
      // Subcontratos activos
      supabase.from("subcontratos_proyectos").select("id", { count: "exact", head: true }).eq("supervisor_id", sup).not("estado", "eq", "completado"),
      // Aprobaciones subcontrato pendientes
      supabase.from("subcontratos_reportes").select("proyecto_id").eq("estado", "pendiente"),
    ]);

    const revData = (avgQ.data ?? []) as Array<{ tiempo_revision_minutos: number }>;
    const avgMinutos = revData.length > 0
      ? Math.round(revData.reduce((s, r) => s + r.tiempo_revision_minutos, 0) / revData.length)
      : null;

    const prevRevData = (prevAvgQ.data ?? []) as Array<{ tiempo_revision_minutos: number }>;
    const prevAvgMinutos = prevRevData.length > 0
      ? Math.round(prevRevData.reduce((s, r) => s + r.tiempo_revision_minutos, 0) / prevRevData.length)
      : null;

    // Filter pending subcontract approvals by supervisor's projects
    const supProyectosQ = await supabase.from("subcontratos_proyectos").select("id").eq("supervisor_id", sup);
    const supProjIds = new Set((supProyectosQ.data ?? []).map((p: { id: string }) => p.id));
    const allSubPend = (subPendQ.data ?? []) as Array<{ proyecto_id: string }>;
    const aprobacionesPendientes = allSubPend.filter((r) => supProjIds.has(r.proyecto_id)).length;

    // Horas equipo this period
    const horasQ = await base.select("hora_entrada, hora_salida, reporte_tecnicos(hora_entrada, hora_salida, total_horas, es_subcontrato)")
      .eq("supervisor_id", sup).gte("created_at", `${desde}T00:00:00`).lte("created_at", `${hasta}T23:59:59`);
    let totalHorasEquipo = 0;
    for (const r of ((horasQ.data ?? []) as Array<Record<string, unknown>>)) {
      const tecs = Array.isArray(r["reporte_tecnicos"]) ? (r["reporte_tecnicos"] as Array<Record<string, unknown>>) : [];
      if (tecs.length > 0) {
        for (const t of tecs) { totalHorasEquipo += Number(t["total_horas"] ?? 0); }
      } else {
        const hE = r["hora_entrada"] as string | null;
        const hS = r["hora_salida"] as string | null;
        if (hE && hS) {
          const diff = (new Date(`1970-01-01T${hS}`).getTime() - new Date(`1970-01-01T${hE}`).getTime()) / 3600000;
          if (diff > 0) totalHorasEquipo += diff;
        }
      }
    }
    totalHorasEquipo = Math.round(totalHorasEquipo * 10) / 10;

    res.json({
      boletas_hoy: hoyQ.count ?? 0,
      boletas_semana: semQ.count ?? 0,
      boletas_mes: mesQ.count ?? 0,
      pendientes_revision: pendRevQ.count ?? 0,
      pendientes_llamada: pendLlamQ.count ?? 0,
      avg_revision_minutos: avgMinutos,
      reprocesos_mes: reprocMesQ.count ?? 0,
      subcontratos_activos: subActQ.count ?? 0,
      aprobaciones_pendientes: aprobacionesPendientes,
      resumen: {
        boletas_periodo: mesQ.count ?? 0,
        prev_boletas: prevBoletasQ.count ?? 0,
        avg_revision_minutos: avgMinutos,
        prev_avg_revision_minutos: prevAvgMinutos,
        reprocesos_periodo: revData.filter((_, i) => i >= 0).length > 0
          ? (reprocMesQ.count ?? 0) : 0,
        pct_reproceso: (mesQ.count ?? 0) > 0
          ? Math.round(((reprocMesQ.count ?? 0) / (mesQ.count ?? 1)) * 100) : 0,
        horas_equipo: totalHorasEquipo,
      },
    });
  } catch (err) {
    req.log.error({ err }, "[revision/supervisor-dashboard] error");
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/revision/supervisor-rendimiento ───────────────────────────────────
// Per-day chart data for current week

router.get("/revision/supervisor-rendimiento", async (req: Request, res: Response) => {
  const supervisorId = (req.query["supervisor_id"] as string | undefined)?.trim() || null;
  if (!supervisorId) { res.status(400).json({ error: "supervisor_id required" }); return; }

  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    const now = new Date();
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - dayOfWeek); weekStart.setHours(0,0,0,0);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23,59,59,999);

    const { data, error } = await supabase
      .from("reportes")
      .select("revisado_at, tiempo_revision_minutos")
      .eq("supervisor_id", supervisorId)
      .eq("estado_revision", "revisada")
      .gte("revisado_at", weekStart.toISOString())
      .lte("revisado_at", weekEnd.toISOString());

    if (error) throw error;

    const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const byDay: Record<string, { count: number; totalTiempo: number; countTiempo: number }> = {};

    // Initialize all 7 days
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      byDay[key] = { count: 0, totalTiempo: 0, countTiempo: 0 };
    }

    for (const r of ((data ?? []) as Array<{ revisado_at: string; tiempo_revision_minutos: number | null }>)) {
      const key = r.revisado_at.slice(0, 10);
      if (byDay[key]) {
        byDay[key].count++;
        if (r.tiempo_revision_minutos !== null) {
          byDay[key].totalTiempo += r.tiempo_revision_minutos;
          byDay[key].countTiempo++;
        }
      }
    }

    const por_dia = Object.entries(byDay).map(([fecha, v], i) => ({
      dia: days[i] ?? fecha,
      fecha,
      revisadas: v.count,
      avg_minutos: v.countTiempo > 0 ? Math.round(v.totalTiempo / v.countTiempo) : null,
    }));

    res.json({ por_dia });
  } catch (err) {
    req.log.error({ err }, "[revision/supervisor-rendimiento] error");
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/revision/supervisor-tecnicos ──────────────────────────────────────
// Technician activity table for a supervisor

router.get("/revision/supervisor-tecnicos", async (req: Request, res: Response) => {
  const supervisorId = (req.query["supervisor_id"] as string | undefined)?.trim() || null;
  const fechaDesde = (req.query["fecha_desde"] as string | undefined)?.trim() || null;
  const fechaHasta = (req.query["fecha_hasta"] as string | undefined)?.trim() || null;
  if (!supervisorId) { res.status(400).json({ error: "supervisor_id required" }); return; }

  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;
    const desde = fechaDesde ?? monthStart;
    const hasta = fechaHasta ?? today;

    const { data, error } = await supabase
      .from("reportes")
      .select("id, numero_reporte, tecnico_nombre, created_at, estado_revision, es_reproceso, hora_entrada, hora_salida, reporte_tecnicos(hora_entrada, hora_salida, total_horas, es_subcontrato), clientes!inner(nombre_comercial)")
      .eq("supervisor_id", supervisorId)
      .gte("created_at", `${desde}T00:00:00`)
      .lte("created_at", `${hasta}T23:59:59`)
      .order("created_at", { ascending: false });

    if (error) throw error;

    type LastBoleta = { id: string; numero_reporte: number | null; created_at: string; estado_revision: string; cliente_nombre: string };
    type TecStat = { boletas: number; horas: number; reprocesos: number; ultima_fecha: string | null; ultimo_estado: string | null; last_boletas: LastBoleta[] };
    const byTec: Record<string, TecStat> = {};

    for (const r of ((data ?? []) as Array<Record<string, unknown>>)) {
      const nombre = (r["tecnico_nombre"] as string | null) ?? "Sin asignar";
      if (!byTec[nombre]) byTec[nombre] = { boletas: 0, horas: 0, reprocesos: 0, ultima_fecha: null, ultimo_estado: null, last_boletas: [] };
      byTec[nombre].boletas++;
      if (r["es_reproceso"]) byTec[nombre].reprocesos++;
      if (!byTec[nombre].ultima_fecha) {
        byTec[nombre].ultima_fecha = (r["created_at"] as string | null) ?? null;
        byTec[nombre].ultimo_estado = (r["estado_revision"] as string | null) ?? null;
      }
      if (byTec[nombre].last_boletas.length < 5) {
        byTec[nombre].last_boletas.push({
          id: String(r["id"] ?? ""),
          numero_reporte: (r["numero_reporte"] as number | null) ?? null,
          created_at: (r["created_at"] as string | null) ?? "",
          estado_revision: (r["estado_revision"] as string | null) ?? "",
          cliente_nombre: ((r["clientes"] as { nombre_comercial?: string } | null)?.nombre_comercial) ?? "",
        });
      }
      const tecs = Array.isArray(r["reporte_tecnicos"]) ? (r["reporte_tecnicos"] as Array<Record<string, unknown>>) : [];
      if (tecs.length > 0) {
        for (const t of tecs) {
          if (!(t["es_subcontrato"] as boolean)) byTec[nombre].horas += Number(t["total_horas"] ?? 0);
        }
      } else {
        const hE = r["hora_entrada"] as string | null;
        const hS = r["hora_salida"] as string | null;
        if (hE && hS) {
          const diff = (new Date(`1970-01-01T${hS}`).getTime() - new Date(`1970-01-01T${hE}`).getTime()) / 3600000;
          if (diff > 0 && diff < 24) byTec[nombre].horas += diff;
        }
      }
    }

    const tecnicos = Object.entries(byTec)
      .map(([nombre, s]) => ({
        nombre,
        boletas: s.boletas,
        horas: Math.round(s.horas * 10) / 10,
        reprocesos: s.reprocesos,
        ultima_fecha: s.ultima_fecha,
        ultimo_estado: s.ultimo_estado,
        last_boletas: s.last_boletas,
      }))
      .sort((a, b) => b.boletas - a.boletas);

    res.json({ tecnicos });
  } catch (err) {
    req.log.error({ err }, "[revision/supervisor-tecnicos] error");
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/dashboard/notification-counts ─────────────────────────────────────

router.get("/dashboard/notification-counts", async (req: Request, res: Response) => {
  const supervisorId = (req.query["supervisor_id"] as string | undefined)?.trim() || null;

  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    let qRevPend = supabase.from("reportes").select("id", { count: "exact", head: true }).eq("estado_revision", "pendiente_revision");
    let qSinLlam = supabase.from("reportes").select("id", { count: "exact", head: true }).eq("estado_revision", "pendiente_llamada");
    const qSubcPend = supabase.from("subcontratos_reportes").select("id", { count: "exact", head: true }).eq("estado", "pendiente");
    const qCotPend = supabase.from("reportes").select("id", { count: "exact", head: true }).eq("hay_cotizacion", true).is("cotizacion_estado", null);

    if (supervisorId) {
      qRevPend = qRevPend.eq("supervisor_id", supervisorId);
      qSinLlam = qSinLlam.eq("supervisor_id", supervisorId);
    }

    const [revPend, sinLlam, subcPend, cotPend] = await Promise.all([qRevPend, qSinLlam, qSubcPend, qCotPend]);

    res.json({
      revision_pendientes: revPend.count ?? 0,
      sin_llamada: sinLlam.count ?? 0,
      subcontratos_pendientes: subcPend.count ?? 0,
      cotizaciones_pendientes: cotPend.count ?? 0,
    });
  } catch (err) {
    req.log.error({ err }, "[dashboard/notification-counts] error");
    res.status(500).json({ error: String(err) });
  }
});

export default router;
