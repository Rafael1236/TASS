import { Router } from "express";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { sendEmail } from "../lib/sendEmail";

import { getSupabase, getSupabaseAdmin, REPORTES_BUCKET } from "../lib/supabase";

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Buffer } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!m) return null;
  const mimeType = m[1] ?? "image/jpeg";
  const bytes = Buffer.from(m[2] ?? "", "base64");
  if (bytes.length === 0) return null;
  return { mimeType, bytes };
}

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

type EstadoCalculado = "por_iniciar" | "en_progreso" | "en_riesgo" | "vencido" | "completado";

interface ProyectoCalculado {
  estado_calculado: EstadoCalculado;
  dias_transcurridos: number;
  dias_restantes: number;
  dias_para_iniciar: number;
  dias_vencido: number;
  porcentaje_dias: number;
}

/** Count business days (Mon–Fri) between two timestamps (exclusive of end). */
function countBusinessDays(fromMs: number, toMs: number): number {
  if (toMs <= fromMs) return 0;
  let count = 0;
  let cur = fromMs;
  while (cur < toMs) {
    const day = new Date(cur).getDay(); // 0=Sun, 6=Sat
    if (day !== 0 && day !== 6) count++;
    cur += 86400000;
  }
  return count;
}

function calcEstado(
  fechaInicio: string | null,
  fechaFin: string | null,
  diasMaximos: number,
  estadoManual: string,
): ProyectoCalculado {
  if (estadoManual === "completado") {
    return { estado_calculado: "completado", dias_transcurridos: 0, dias_restantes: 0, dias_para_iniciar: 0, dias_vencido: 0, porcentaje_dias: 100 };
  }
  const todayMs = new Date().setHours(0, 0, 0, 0);
  if (!fechaInicio) {
    return { estado_calculado: "en_progreso", dias_transcurridos: 0, dias_restantes: diasMaximos, dias_para_iniciar: 0, dias_vencido: 0, porcentaje_dias: 0 };
  }
  const inicioMs = new Date(fechaInicio).setHours(0, 0, 0, 0);
  const finMs = fechaFin ? new Date(fechaFin).setHours(0, 0, 0, 0) : null;

  // Por iniciar: TODAY < fecha_inicio
  if (inicioMs > todayMs) {
    const dias_para_iniciar = countBusinessDays(todayMs, inicioMs);
    return { estado_calculado: "por_iniciar", dias_transcurridos: 0, dias_restantes: diasMaximos, dias_para_iniciar, dias_vencido: 0, porcentaje_dias: 0 };
  }

  // Vencido: TODAY > fecha_fin
  if (finMs !== null && todayMs > finMs) {
    const dias_vencido = countBusinessDays(finMs, todayMs);
    const dias_transcurridos = countBusinessDays(inicioMs, todayMs);
    const porcentaje_dias = diasMaximos > 0 ? Math.round((dias_transcurridos / diasMaximos) * 100) : 100;
    return { estado_calculado: "vencido", dias_transcurridos, dias_restantes: 0, dias_para_iniciar: 0, dias_vencido, porcentaje_dias };
  }

  // En progreso / en riesgo: fecha_inicio <= TODAY <= fecha_fin
  const dias_transcurridos = countBusinessDays(inicioMs, todayMs + 86400000); // include today
  const dias_restantes = finMs !== null
    ? Math.max(0, countBusinessDays(todayMs + 86400000, finMs + 86400000))
    : Math.max(0, diasMaximos - dias_transcurridos);
  const porcentaje_dias = diasMaximos > 0 ? Math.round((dias_transcurridos / diasMaximos) * 100) : 0;
  const estado_calculado: EstadoCalculado = dias_transcurridos >= diasMaximos * 0.8 ? "en_riesgo" : "en_progreso";
  return { estado_calculado, dias_transcurridos, dias_restantes, dias_para_iniciar: 0, dias_vencido: 0, porcentaje_dias };
}

async function uploadPhoto(
  supabase: ReturnType<typeof getSupabase>,
  dataUrl: string,
  prefix: string,
): Promise<string | null> {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  const { mimeType, bytes } = parsed;
  const ext = extFromMime(mimeType);
  const path = `subcontratos/${prefix}/${randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(REPORTES_BUCKET)
    .upload(path, bytes, { contentType: mimeType, upsert: true });
  if (error) return null;
  const { data } = supabase.storage.from(REPORTES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ── GET /api/subcontratos/proyectos ────────────────────────────────────────────

router.get("/subcontratos/proyectos", async (req, res) => {
  const usuario_id = req.query["usuario_id"] as string | undefined;
  const rol = req.query["rol"] as string | undefined;
  const empresa_id = req.query["empresa_id"] as string | undefined;
  const supabase = getSupabase();

  try {
    let query = supabase
      .from("subcontratos_proyectos")
      .select("*")
      .order("created_at", { ascending: false });

    // Subcontratistas see only their company's projects (filtered by empresa_id).
    // Admins / TAS technicians see all projects.
    if (rol === "subcontratista") {
      if (empresa_id) {
        query = query.eq("empresa_id", empresa_id);
      } else if (usuario_id) {
        // Fallback: try asignados array filter
        query = query.filter("asignados", "cs", JSON.stringify([usuario_id]));
      }
    }

    const { data: proyectos, error } = await query;
    if (error) {
      req.log.error({ error }, "[subcontratos] proyectos query error");
      res.status(500).json({ success: false, error: error.message });
      return;
    }
    res.json({
      success: true,
      proyectos: (proyectos ?? []).map((p) => {
        const raw = p as { fecha_inicio?: string | null; fecha_fin_estimada?: string | null; dias_maximos?: number; estado?: string };
        return { ...p, ...calcEstado(raw.fecha_inicio ?? null, raw.fecha_fin_estimada ?? null, raw.dias_maximos ?? 0, raw.estado ?? "activo") };
      }),
    });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] proyectos unexpected error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── GET /api/subcontratos/proyecto/:id ─────────────────────────────────────────

router.get("/subcontratos/proyecto/:id", async (req, res) => {
  const { id } = req.params;
  const supabase = getSupabase();

  try {
    const [proyectoRes, actividadesRes, reportesRes] = await Promise.all([
      supabase.from("subcontratos_proyectos").select("*").eq("id", id).single(),
      supabase
        .from("subcontratos_actividades")
        .select("*")
        .eq("proyecto_id", id)
        .order("orden"),
      supabase
        .from("subcontratos_reportes")
        .select("*, subcontratos_fotos(*)")
        .eq("proyecto_id", id)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

    if (proyectoRes.error) {
      res.status(404).json({ success: false, error: "Proyecto no encontrado" });
      return;
    }

    const pd = proyectoRes.data as { fecha_inicio?: string | null; fecha_fin_estimada?: string | null; dias_maximos?: number; estado?: string; [k: string]: unknown };
    res.json({
      success: true,
      proyecto: { ...pd, ...calcEstado(pd.fecha_inicio ?? null, pd.fecha_fin_estimada ?? null, pd.dias_maximos ?? 0, pd.estado ?? "activo") },
      actividades: actividadesRes.data ?? [],
      reportes: reportesRes.data ?? [],
    });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] proyecto detail error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── GET /api/subcontratos/tecnicos ─────────────────────────────────────────────

router.get("/subcontratos/tecnicos", async (req, res) => {
  const empresaId = req.query["empresa_id"] as string | undefined;
  const todos = req.query["todos"] === "true";
  const supabase = getSupabase();

  try {
    let query = supabase
      .from("subcontratos_tecnicos")
      .select("*")
      .order("nombre");

    if (!todos) {
      query = query.eq("activo", true);
    }
    if (empresaId) {
      query = query.eq("empresa_id", empresaId);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }
    res.json({ success: true, tecnicos: data ?? [] });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] tecnicos error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── POST /api/subcontratos/tecnico ─────────────────────────────────────────────

router.post("/subcontratos/tecnico", async (req, res) => {
  const { empresa_id, nombre } = req.body as {
    empresa_id?: string;
    nombre?: string;
  };

  if (!nombre?.trim()) {
    res.status(400).json({ success: false, error: "Nombre requerido" });
    return;
  }

  const supabase = getSupabase();
  try {
    const insertData: Record<string, unknown> = { nombre: nombre.trim(), activo: true };
    if (empresa_id) insertData["empresa_id"] = empresa_id;

    const { data, error } = await supabase
      .from("subcontratos_tecnicos")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }
    res.json({ success: true, tecnico: data });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] add tecnico error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── PATCH /api/subcontratos/tecnico/:id/toggle ─────────────────────────────────

router.patch("/subcontratos/tecnico/:id/toggle", async (req, res) => {
  const { id } = req.params;
  const supabase = getSupabase();
  try {
    const { data: current, error: fetchErr } = await supabase
      .from("subcontratos_tecnicos")
      .select("activo")
      .eq("id", id)
      .single();
    if (fetchErr || !current) {
      res.status(404).json({ success: false, error: "Técnico no encontrado" });
      return;
    }
    const nuevoActivo = !(current as { activo: boolean }).activo;
    const { data, error } = await supabase
      .from("subcontratos_tecnicos")
      .update({ activo: nuevoActivo })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }
    res.json({ success: true, tecnico: data });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] toggle tecnico error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── POST /api/subcontratos/reporte ─────────────────────────────────────────────

interface ActividadReporte {
  actividad_id: string;
  actividad_nombre: string;
  porcentaje_avance_hoy: number;
  porcentaje_acumulado_nuevo: number;
}

interface ReporteBody {
  proyecto_id: string;
  actividades?: ActividadReporte[];
  actividad_id?: string;
  actividad_nombre?: string;
  usuario_id: string;
  descripcion?: string;
  tecnicos_presentes?: Array<{ nombre: string }>;
  porcentaje_avance?: number;
  foto_checkin?: string;
  fotos_evidencia?: string[];
  foto_checkout?: string;
}

router.post("/subcontratos/reporte", async (req, res) => {
  const body = req.body as ReporteBody;

  if (!body.proyecto_id || !body.usuario_id) {
    res.status(400).json({ success: false, error: "proyecto_id y usuario_id requeridos" });
    return;
  }

  const supabase = getSupabaseAdmin();

  try {
    // 1. Upload photos
    const photoUploads: Array<{ url: string; tipo: string }> = [];

    if (body.foto_checkin) {
      const url = await uploadPhoto(supabase, body.foto_checkin, `${body.proyecto_id}/checkin`);
      if (url) photoUploads.push({ url, tipo: "checkin" });
    }

    for (const foto of body.fotos_evidencia ?? []) {
      const url = await uploadPhoto(supabase, foto, `${body.proyecto_id}/evidencia`);
      if (url) photoUploads.push({ url, tipo: "evidencia" });
    }

    if (body.foto_checkout) {
      const url = await uploadPhoto(supabase, body.foto_checkout, `${body.proyecto_id}/checkout`);
      if (url) photoUploads.push({ url, tipo: "checkout" });
    }

    // 2. Normalize activities (support both new multi-activity and legacy single-activity)
    const actividadesArr: ActividadReporte[] =
      body.actividades && body.actividades.length > 0
        ? body.actividades
        : body.actividad_nombre
          ? [{ actividad_id: body.actividad_id ?? "", actividad_nombre: body.actividad_nombre, porcentaje_avance_hoy: body.porcentaje_avance ?? 0, porcentaje_acumulado_nuevo: body.porcentaje_avance ?? 0 }]
          : [{ actividad_id: "", actividad_nombre: "—", porcentaje_avance_hoy: body.porcentaje_avance ?? 0, porcentaje_acumulado_nuevo: body.porcentaje_avance ?? 0 }];

    const actividadNombreSummary =
      actividadesArr.length === 1
        ? actividadesArr[0].actividad_nombre
        : actividadesArr.map((a) => `${a.actividad_nombre} (→${a.porcentaje_acumulado_nuevo}%)`).join(", ");

    const pctAvance =
      actividadesArr.length > 0
        ? Math.round(actividadesArr.reduce((s, a) => s + a.porcentaje_acumulado_nuevo, 0) / actividadesArr.length)
        : (body.porcentaje_avance ?? 0);

    // 3. Insert one report row per submission (activities summarized in actividad_nombre)
    // NOTE: actividad_id is intentionally null — the FK constraint in the DB points to the wrong
    // table (subcontratos_actividades_proyecto vs subcontratos_actividades). Progress is tracked
    // via the activity update loop below. Run migration 008 to fix the FK properly.
    const { data: reporte, error: reporteError } = await supabase
      .from("subcontratos_reportes")
      .insert({
        proyecto_id: body.proyecto_id,
        actividad_id: null,
        actividad_nombre: actividadNombreSummary,
        usuario_id: null,
        descripcion: body.descripcion ?? "",
        tecnicos_presentes: body.tecnicos_presentes ?? [],
        porcentaje_avance: pctAvance,
        estado: "pendiente",
        fecha: new Date().toISOString().split("T")[0],
      })
      .select()
      .single();

    if (reporteError || !reporte) {
      req.log.error({ reporteError }, "[subcontratos] reporte insert error");
      res.status(500).json({ success: false, error: reporteError?.message ?? "Error al guardar reporte" });
      return;
    }

    // 4. Insert photos (on the single report row)
    if (photoUploads.length > 0) {
      await supabase
        .from("subcontratos_fotos")
        .insert(photoUploads.map((p) => ({ reporte_id: (reporte as { id: string }).id, url: p.url, tipo: p.tipo })));
    }

    // 5. Update each activity's accumulated progress
    for (const act of actividadesArr) {
      if (act.actividad_id) {
        await supabase
          .from("subcontratos_actividades")
          .update({ porcentaje_avance: act.porcentaje_acumulado_nuevo })
          .eq("id", act.actividad_id);
      }
    }

    // 5. Update project metadata (dias_transcurridos is always calculated dynamically)
    const { data: proyecto } = await supabase
      .from("subcontratos_proyectos")
      .select("fecha_inicio, fecha_fin_estimada, dias_maximos, nombre, cliente_nombre, estado, supervisor_correo, supervisor_nombre")
      .eq("id", body.proyecto_id)
      .single();

    if (proyecto) {
      const p = proyecto as {
        fecha_inicio: string | null;
        fecha_fin_estimada: string | null;
        dias_maximos: number;
        nombre: string;
        cliente_nombre: string;
        estado: string;
        supervisor_correo?: string | null;
        supervisor_nombre?: string | null;
      };

      const { dias_transcurridos, porcentaje_dias } = calcEstado(p.fecha_inicio, p.fecha_fin_estimada ?? null, p.dias_maximos, p.estado ?? "activo");

      // Calculate yesterday's percentage to detect threshold crossings without duplicates
      const yesterdayMs = new Date().setHours(0, 0, 0, 0) - 86400000;
      const inicioMs = p.fecha_inicio ? new Date(p.fecha_inicio).setHours(0, 0, 0, 0) : 0;
      const diasYesterday = p.fecha_inicio ? Math.max(0, Math.floor((yesterdayMs - inicioMs) / 86400000)) : 0;
      const prevPct = p.dias_maximos > 0 ? (diasYesterday / p.dias_maximos) * 100 : 0;

      await supabase
        .from("subcontratos_proyectos")
        .update({
          ultima_actividad: new Date().toISOString().split("T")[0],
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.proyecto_id);

      // 6. Send emails (non-blocking)
      const fecha = new Date().toLocaleDateString("es-SV", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      const tecnicosStr =
        (body.tecnicos_presentes ?? []).map((t) => t.nombre).join(", ") || "—";

      // Progress report email — goes to supervisor
      const reportSupEmail = p.supervisor_correo ?? "hpinaud@tas-seguridad.com";
      const reportSupName = p.supervisor_nombre ?? "Supervisor TAS";
      try {
        await sendEmail({
          from: "TAS Subcontratos <onboarding@resend.dev>",
          to: reportSupEmail,
          testLabel: `Supervisor: ${reportSupName}\nCorreo: ${reportSupEmail}`,
          subject: `Nuevo reporte de avance — ${p.nombre} — ${fecha}`,
          html: buildReporteEmail({
            proyecto: p.nombre,
            cliente: p.cliente_nombre,
            fecha,
            tecnicosStr,
            actividades: actividadesArr.map((a) => ({
              nombre: a.actividad_nombre,
              avance_hoy: a.porcentaje_avance_hoy,
              acumulado: a.porcentaje_acumulado_nuevo,
            })),
            descripcion: body.descripcion ?? "—",
            diasUsados: dias_transcurridos,
            diasMaximos: p.dias_maximos,
            photoUrls: photoUploads.map((p2) => p2.url),
          }),
        });
        req.log.info("[subcontratos] report email sent");
      } catch (e) {
        req.log.warn({ e }, "[subcontratos] report email failed");
      }

      // 80% threshold alert (only when crossing today)
      if (porcentaje_dias >= 80 && porcentaje_dias < 100 && prevPct < 80) {
        try {
          await sendEmail({
            from: "TAS Subcontratos <onboarding@resend.dev>",
            to: reportSupEmail,
            testLabel: `Supervisor: ${reportSupName}\nCorreo: ${reportSupEmail}`,
            subject: `⚠️ AVISO: ${p.nombre} consumió el 80% de días disponibles`,
            html: buildAlertEmail(p.nombre, p.cliente_nombre, dias_transcurridos, p.dias_maximos, 80),
          });
        } catch {}
      }

      // 100% alert (only when crossing today)
      if (porcentaje_dias >= 100 && prevPct < 100) {
        try {
          await sendEmail({
            from: "TAS Subcontratos <onboarding@resend.dev>",
            to: reportSupEmail,
            testLabel: `Supervisor: ${reportSupName}\nCorreo: ${reportSupEmail}`,
            subject: `🚨 ALERTA: ${p.nombre} agotó sus días (${dias_transcurridos}/${p.dias_maximos})`,
            html: buildAlertEmail(p.nombre, p.cliente_nombre, dias_transcurridos, p.dias_maximos, 100),
          });
        } catch {}
      }
    }

    res.json({ success: true, reporte_id: (reporte as { id: string }).id });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] reporte unexpected error");
    res.status(500).json({ success: false, error: "Error interno del servidor" });
  }
});

// ── Email builders ─────────────────────────────────────────────────────────────

function buildReporteEmail(d: {
  proyecto: string;
  cliente: string;
  fecha: string;
  tecnicosStr: string;
  actividades: Array<{ nombre: string; avance_hoy: number; acumulado: number }>;
  descripcion: string;
  diasUsados: number;
  diasMaximos: number;
  photoUrls: string[];
}): string {
  const pct = Math.round((d.diasUsados / d.diasMaximos) * 100);
  const barColor = pct >= 90 ? "#CC0000" : pct >= 70 ? "#F59E0B" : "#1D9E75";

  const photosHtml =
    d.photoUrls.length > 0
      ? `<tr><td colspan="2" style="padding:16px 0 8px;">
           <div style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;">Fotos del reporte</div>
           <div>${d.photoUrls
             .map(
               (url) =>
                 `<a href="${url}" target="_blank"><img src="${url}" style="width:140px;height:90px;object-fit:cover;border-radius:6px;border:1px solid #E5E7EB;margin:0 6px 6px 0;" /></a>`,
             )
             .join("")}</div>
         </td></tr>`
      : "";

  return `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.12);">
        <tr><td style="background:#1A252F;padding:24px 32px;">
          <div style="display:inline-block;background:#CC0000;color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:4px;text-transform:uppercase;margin-bottom:8px;">Subcontratos</div>
          <div style="color:#fff;font-size:18px;font-weight:700;line-height:1.3;">Nuevo Reporte de Avance</div>
          <div style="color:#8696A0;font-size:13px;margin-top:4px;">${d.proyecto} · ${d.fecha}</div>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <!-- Days progress -->
            <tr><td style="padding:0 0 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border-radius:8px;padding:16px;">
                <tr>
                  <td><div style="font-size:12px;color:#6B7280;margin-bottom:4px;">Días utilizados</div>
                      <div style="font-size:26px;font-weight:700;color:#111827;">${d.diasUsados} <span style="font-size:14px;color:#9CA3AF;">/ ${d.diasMaximos} días</span></div></td>
                  <td align="right"><div style="font-size:22px;font-weight:700;color:${barColor};">${pct}%</div></td>
                </tr>
                <tr><td colspan="2" style="padding-top:10px;">
                  <div style="background:#E5E7EB;border-radius:4px;height:8px;overflow:hidden;">
                    <div style="background:${barColor};width:${Math.min(pct, 100)}%;height:8px;border-radius:4px;"></div>
                  </div>
                </td></tr>
              </table>
            </td></tr>
            <!-- Report detail -->
            <tr><td colspan="2" style="padding:4px 0 8px;font-size:11px;font-weight:700;color:#CC0000;text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid #E5E7EB;border-top:1px solid #E5E7EB;padding-top:16px;">Detalle del reporte</td></tr>
            <tr><td style="padding:8px 0 2px;font-size:13px;color:#6B7280;width:160px;">Cliente</td><td style="font-size:13px;color:#111827;padding:8px 0 2px;">${d.cliente}</td></tr>
            <tr><td style="font-size:13px;color:#6B7280;padding:2px 0;vertical-align:top;">Actividades</td><td style="font-size:13px;color:#111827;padding:2px 0;">${d.actividades.map((a) => `<div style="margin-bottom:5px;">• <strong>${a.nombre}</strong>: +${a.avance_hoy}% hoy <span style="color:#6B7280;">(Total acumulado: ${a.acumulado}%)</span></div>`).join("")}</td></tr>
            <tr><td style="font-size:13px;color:#6B7280;padding:2px 0;">Técnicos presentes</td><td style="font-size:13px;color:#111827;padding:2px 0;">${d.tecnicosStr}</td></tr>
            <tr><td colspan="2" style="padding:0 0 16px;">
              <div style="background:#F9FAFB;border-left:4px solid #CC0000;padding:12px 16px;border-radius:0 6px 6px 0;font-size:13px;color:#374151;line-height:1.65;">${d.descripcion}</div>
            </td></tr>
            ${photosHtml}
            <tr><td colspan="2" style="padding:20px 0 0;text-align:center;">
              <a href="https://tech-report-bot.replit.app/dashboard/" style="display:inline-block;background:#CC0000;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:6px;letter-spacing:0.3px;">Revisar y aprobar en el dashboard</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#F9FAFB;padding:14px 32px;border-top:1px solid #E5E7EB;text-align:center;font-size:11px;color:#9CA3AF;">TAS Seguridad · Módulo de Subcontratos</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function buildAlertEmail(
  proyecto: string,
  cliente: string,
  diasUsados: number,
  diasMaximos: number,
  threshold: number,
): string {
  const pct = Math.round((diasUsados / diasMaximos) * 100);
  const isUrgent = threshold >= 100;
  const color = isUrgent ? "#CC0000" : "#F59E0B";
  const emoji = isUrgent ? "🚨" : "⚠️";
  const headline = isUrgent
    ? "Proyecto agotó días disponibles"
    : "Alerta: 80% de días consumidos";

  return `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background:#F3F4F6;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.12);">
        <tr><td style="background:${color};padding:28px 32px;text-align:center;">
          <div style="font-size:48px;">${emoji}</div>
          <div style="color:#fff;font-size:20px;font-weight:700;margin-top:8px;">${headline}</div>
        </td></tr>
        <tr><td style="padding:32px;text-align:center;">
          <div style="font-size:15px;color:#374151;line-height:1.7;margin-bottom:8px;">
            El proyecto <strong>${proyecto}</strong> (Cliente: ${cliente}) ha consumido
            <strong>${diasUsados} de ${diasMaximos} días</strong> disponibles.
          </div>
          <div style="font-size:28px;font-weight:700;color:${color};margin:16px 0;">${pct}%</div>
          ${isUrgent ? '<div style="color:#CC0000;font-weight:600;font-size:15px;">Se requiere acción inmediata. El proyecto ha superado su plazo estimado.</div>' : ""}
          <a href="https://tech-report-bot.replit.app/dashboard/" style="display:inline-block;margin-top:24px;background:${color};color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:6px;">Ver en el dashboard</a>
        </td></tr>
        <tr><td style="background:#F9FAFB;padding:14px 32px;border-top:1px solid #E5E7EB;text-align:center;font-size:11px;color:#9CA3AF;">TAS Seguridad · Módulo de Subcontratos</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── GET /api/subcontratos/dashboard ────────────────────────────────────────────

router.get("/subcontratos/dashboard", async (req, res) => {
  const supabase = getSupabase();
  const supervisor_id = req.query["supervisor_id"] as string | undefined;
  const rol = req.query["rol"] as string | undefined;
  const isSupervisor = rol === "supervisor" && !!supervisor_id;

  try {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    let proyectosQuery = supabase.from("subcontratos_proyectos").select("*").order("created_at", { ascending: false });
    if (isSupervisor) {
      proyectosQuery = proyectosQuery.eq("supervisor_id", supervisor_id!);
    }

    const [proyectosRes, pendientesRes, aprobadosMesRes, fotosRes] = await Promise.all([
      proyectosQuery,
      supabase
        .from("subcontratos_reportes")
        .select("*")
        .eq("estado", "pendiente")
        .order("fecha", { ascending: false }),
      supabase
        .from("subcontratos_reportes")
        .select("id")
        .eq("estado", "aprobado")
        .gte("aprobado_at", firstOfMonth),
      supabase.from("subcontratos_fotos").select("*"),
    ]);

    const proyectosRaw = (proyectosRes.data ?? []) as Array<{
      id: string; nombre: string; cliente_nombre: string; dias_maximos: number;
      fecha_inicio?: string | null; fecha_fin_estimada?: string | null; estado: string; [k: string]: unknown;
    }>;
    const proyectos = proyectosRaw.map((p) => ({ ...p, ...calcEstado(p.fecha_inicio ?? null, p.fecha_fin_estimada ?? null, p.dias_maximos, p.estado) }));
    const fotos = (fotosRes.data ?? []) as Array<{ reporte_id: string; url: string; tipo: string }>;

    const activos = proyectos.filter((p) => p.estado_calculado !== "completado").length;
    const limiteDias = proyectos.filter(
      (p) => p.estado_calculado !== "completado" && p.dias_maximos > 0 && p.porcentaje_dias >= 90
    ).length;

    // Attach project info + fotos to each pending report
    const proyMap = new Map(proyectos.map((p) => [p.id, p]));
    const fotosMap = new Map<string, typeof fotos>();
    for (const f of fotos) {
      if (!fotosMap.has(f.reporte_id)) fotosMap.set(f.reporte_id, []);
      fotosMap.get(f.reporte_id)!.push(f);
    }

    // Enrich pendientes — filter to supervisor's projects when applicable
    const allPendientes = (pendientesRes.data ?? []).map((r) => ({
      ...r,
      proyecto: proyMap.get((r as { proyecto_id: string }).proyecto_id) ?? null,
      fotos: fotosMap.get((r as { id: string }).id) ?? [],
    }));
    const pendientesEnriquecidos = isSupervisor
      ? allPendientes.filter((r) => r.proyecto !== null)
      : allPendientes;

    // All-time reportes for timeline endpoint
    const { data: todosReportes } = await supabase
      .from("subcontratos_reportes")
      .select("*")
      .order("fecha", { ascending: false });

    const reportesPorProyecto = new Map<string, unknown[]>();
    for (const r of todosReportes ?? []) {
      const pid = (r as { proyecto_id: string }).proyecto_id;
      if (!proyMap.has(pid)) continue; // only include reports for visible projects
      if (!reportesPorProyecto.has(pid)) reportesPorProyecto.set(pid, []);
      reportesPorProyecto.get(pid)!.push({ ...r, fotos: fotosMap.get((r as { id: string }).id) ?? [] });
    }

    const proyectosConReportes = proyectos.map((p) => ({
      ...p,
      reportes: reportesPorProyecto.get(p.id) ?? [],
    }));

    res.json({
      success: true,
      kpis: {
        activos,
        pendientes: pendientesEnriquecidos.length,
        aprobados_mes: aprobadosMesRes.data?.length ?? 0,
        limite_dias: limiteDias,
      },
      pendientes: pendientesEnriquecidos,
      proyectos: proyectosConReportes,
    });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] dashboard error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── PATCH /api/subcontratos/reporte/:id/aprobar ────────────────────────────────

router.patch("/subcontratos/reporte/:id/aprobar", async (req, res) => {
  const { id } = req.params;
  const { aprobado_por } = (req.body ?? {}) as { aprobado_por?: string };
  const supabase = getSupabase();

  try {
    const { data: reporte, error } = await supabase
      .from("subcontratos_reportes")
      .update({
        estado: "aprobado",
        aprobado_por: aprobado_por ?? "Supervisor",
        aprobado_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    // Send notification email (non-blocking)
    if (reporte) {
      const r = reporte as { proyecto_id: string; actividad_nombre: string | null; fecha: string };
      const { data: proyecto } = await supabase
        .from("subcontratos_proyectos")
        .select("nombre, cliente_nombre")
        .eq("id", r.proyecto_id)
        .single();
      if (proyecto) {
        const p = proyecto as { nombre: string; cliente_nombre: string; supervisor_correo?: string | null; supervisor_nombre?: string | null };
        const supEmail = p.supervisor_correo ?? "hpinaud@tas-seguridad.com";
        const supName = p.supervisor_nombre ?? "Supervisor TAS";
        sendEmail({
          from: "TAS Subcontratos <onboarding@resend.dev>",
          to: supEmail,
          testLabel: `Supervisor: ${supName}\nCorreo: ${supEmail}`,
          subject: `✓ Reporte aprobado — ${p.nombre} — ${r.fecha}`,
          html: `<p>El reporte del <strong>${r.fecha}</strong> para el proyecto <strong>${p.nombre}</strong> (${p.cliente_nombre}) ha sido <strong style="color:#16a34a">aprobado</strong> por ${aprobado_por ?? "Supervisor"}.</p><p>Actividad: ${r.actividad_nombre ?? "—"}</p>`,
        }).catch(() => {});
      }
    }

    res.json({ success: true, reporte });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] aprobar error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── PATCH /api/subcontratos/reporte/:id/rechazar ───────────────────────────────

router.patch("/subcontratos/reporte/:id/rechazar", async (req, res) => {
  const { id } = req.params;
  const { comentario_rechazo } = (req.body ?? {}) as { comentario_rechazo?: string };

  if (!comentario_rechazo?.trim()) {
    res.status(400).json({ success: false, error: "Motivo de rechazo requerido" });
    return;
  }

  const supabase = getSupabase();
  try {
    const { data: reporte, error } = await supabase
      .from("subcontratos_reportes")
      .update({ estado: "rechazado", comentario_rechazo: comentario_rechazo.trim() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    // Send notification email (non-blocking)
    if (reporte) {
      const r = reporte as { proyecto_id: string; actividad_nombre: string | null; fecha: string };
      const { data: proyecto } = await supabase
        .from("subcontratos_proyectos")
        .select("nombre, cliente_nombre")
        .eq("id", r.proyecto_id)
        .single();
      if (proyecto) {
        const p = proyecto as { nombre: string; cliente_nombre: string; supervisor_correo?: string | null; supervisor_nombre?: string | null };
        const supEmail = p.supervisor_correo ?? "hpinaud@tas-seguridad.com";
        const supName = p.supervisor_nombre ?? "Supervisor TAS";
        sendEmail({
          from: "TAS Subcontratos <onboarding@resend.dev>",
          to: supEmail,
          testLabel: `Supervisor: ${supName}\nCorreo: ${supEmail}`,
          subject: `✗ Reporte rechazado — ${p.nombre} — ${r.fecha}`,
          html: `<p>El reporte del <strong>${r.fecha}</strong> para el proyecto <strong>${p.nombre}</strong> (${p.cliente_nombre}) ha sido <strong style="color:#dc2626">rechazado</strong>.</p><p>Motivo: <em>${comentario_rechazo}</em></p><p>El subcontratista debe corregir y reenviar el reporte.</p>`,
        }).catch(() => {});
      }
    }

    res.json({ success: true, reporte });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] rechazar error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── GET /api/subcontratos/empresas ─────────────────────────────────────────────

router.get("/subcontratos/empresas", async (req, res) => {
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from("subcontratos_empresas")
      .select("*")
      .order("nombre");
    if (error) { res.status(500).json({ success: false, error: error.message }); return; }
    res.json({ success: true, empresas: data ?? [] });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] empresas error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── GET /api/subcontratos/usuarios-empresa ─────────────────────────────────────

router.get("/subcontratos/usuarios-empresa", async (req, res) => {
  const empresa_id = req.query["empresa_id"] as string | undefined;
  const supabase = getSupabase();
  try {
    let query = supabase
      .from("subcontratos_usuarios")
      .select("id, nombre, usuario, correo, empresa_id, activo")
      .eq("activo", true)
      .order("nombre");
    if (empresa_id) query = query.eq("empresa_id", empresa_id);
    const { data, error } = await query;
    if (error) { res.status(500).json({ success: false, error: error.message }); return; }
    res.json({ success: true, usuarios: data ?? [] });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] usuarios-empresa error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── GET /api/subcontratos/actividades-catalogo ─────────────────────────────────

router.get("/subcontratos/actividades-catalogo", async (req, res) => {
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from("subcontratos_actividades_catalogo")
      .select("id, nombre, descripcion")
      .eq("activo", true)
      .order("nombre");
    if (error) { res.status(500).json({ success: false, error: error.message }); return; }
    res.json({ success: true, actividades: data ?? [] });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] actividades-catalogo error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── GET /api/subcontratos/clientes-lista ───────────────────────────────────────

router.get("/subcontratos/clientes-lista", async (req, res) => {
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nombre_comercial")
      .order("nombre_comercial");
    if (error) { res.status(500).json({ success: false, error: error.message }); return; }
    res.json({ success: true, clientes: data ?? [] });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] clientes-lista error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── POST /api/subcontratos/proyecto ────────────────────────────────────────────

interface NuevoProyectoBody {
  nombre: string;
  cliente_id?: string;
  cliente_nombre: string;
  numero_proyecto?: string;
  numero_llamada?: string;
  fecha_inicio: string;
  fecha_fin_estimada: string;
  dias_maximos: number;
  empresa_id: string;
  usuario_id: string;
  usuario_nombre: string;
  usuario_usuario: string;
  usuario_correo: string;
  supervisor_nombre: string;
  supervisor_correo: string;
  supervisor_id?: string;
  actividades: Array<{ id: string; nombre: string }>;
}

router.post("/subcontratos/proyecto", async (req, res) => {
  const body = req.body as NuevoProyectoBody;
  if (!body.nombre?.trim() || !body.cliente_nombre?.trim() || !body.empresa_id || !body.usuario_id || !body.supervisor_nombre?.trim() || !body.fecha_inicio || !body.fecha_fin_estimada || !body.dias_maximos) {
    res.status(400).json({ success: false, error: "Faltan campos requeridos" });
    return;
  }
  if (!body.actividades || body.actividades.length === 0) {
    res.status(400).json({ success: false, error: "Selecciona al menos una actividad" });
    return;
  }
  const supabase = getSupabase();
  try {
    // 1. Insert project
    const { data: proyecto, error: proyectoError } = await supabase
      .from("subcontratos_proyectos")
      .insert({
        nombre: body.nombre.trim(),
        cliente_nombre: body.cliente_nombre.trim(),
        numero_proyecto: body.numero_proyecto?.trim() || null,
        numero_llamada: body.numero_llamada?.trim() || null,
        empresa_id: body.empresa_id,
        usuario_id: body.usuario_id,
        supervisor_nombre: body.supervisor_nombre.trim(),
        supervisor_correo: body.supervisor_correo?.trim() ?? "",
        supervisor_id: body.supervisor_id || null,
        fecha_inicio: body.fecha_inicio,
        fecha_fin_estimada: body.fecha_fin_estimada,
        dias_maximos: body.dias_maximos,
        dias_utilizados: 0,
        estado: "activo",
        asignados: [body.usuario_usuario],
      })
      .select()
      .single();

    if (proyectoError || !proyecto) {
      req.log.error({ proyectoError }, "[subcontratos] proyecto insert error");
      res.status(500).json({ success: false, error: proyectoError?.message ?? "Error al crear proyecto" });
      return;
    }
    const p = proyecto as { id: string; nombre: string };

    // 2. Insert activities
    const actividadesInsert = body.actividades.map((a, i) => ({
      proyecto_id: p.id,
      nombre: a.nombre,
      porcentaje_avance: 0,
      orden: i + 1,
    }));
    await supabase.from("subcontratos_actividades").insert(actividadesInsert);

    // 3. Send email notification (non-blocking)
    // Fetch user's current email from DB — do not rely on the form value which may be stale
    {
      const fmtDate = (d: string) => new Date(d).toLocaleDateString("es-SV", { day: "2-digit", month: "long", year: "numeric" });
      const { data: usuarioData } = await supabase
        .from("subcontratos_usuarios")
        .select("correo")
        .eq("id", body.usuario_id)
        .single();
      const subEmail = ((usuarioData as { correo?: string | null } | null)?.correo ?? "")?.trim() || body.usuario_correo?.trim() || null;
      const supEmail = body.supervisor_correo?.trim() || null;
      const emailTo = subEmail || supEmail;
      if (emailTo) {
        const cc: string[] = [];
        if (subEmail && supEmail && emailTo === subEmail) cc.push(supEmail);
        const allRecipients: string[] = [emailTo, ...cc].filter(Boolean);
        const projectTestLabel = allRecipients
          .map((e) => e === subEmail ? `Subcontratista: ${body.usuario_nombre ?? emailTo}\nCorreo: ${e}` : `Supervisor: ${body.supervisor_nombre ?? e}\nCorreo: ${e}`)
          .join("\n\n");
        sendEmail({
          from: "TAS Subcontratos <onboarding@resend.dev>",
          to: emailTo,
          ...(cc.length > 0 ? { cc } : {}),
          testLabel: projectTestLabel,
          subject: `Nuevo proyecto asignado — ${body.nombre}`,
          html: buildNuevoProyectoEmail({
            nombre: body.nombre,
            cliente: body.cliente_nombre,
            numeroProy: body.numero_proyecto ?? "—",
            fechaInicio: fmtDate(body.fecha_inicio),
            fechaFin: fmtDate(body.fecha_fin_estimada),
            diasMaximos: body.dias_maximos,
            supervisorNombre: body.supervisor_nombre,
            supervisorCorreo: body.supervisor_correo,
            actividades: body.actividades.map((a) => a.nombre),
            usuarioNombre: body.usuario_nombre,
          }),
        }, req.log).catch(() => {});
      }
    }

    req.log.info({ proyecto_id: p.id }, "[subcontratos] proyecto created");
    res.json({ success: true, proyecto_id: p.id });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] crear proyecto error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

function buildNuevoProyectoEmail(d: {
  nombre: string; cliente: string; numeroProy: string;
  fechaInicio: string; fechaFin: string; diasMaximos: number;
  supervisorNombre: string; supervisorCorreo: string;
  actividades: string[]; usuarioNombre: string;
}): string {
  const actHtml = d.actividades.map((a) => `<li style="padding:3px 0;font-size:13px;color:#374151;">${a}</li>`).join("");
  return `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.12);">
      <tr><td style="background:#1A252F;padding:28px 32px;">
        <div style="display:inline-block;background:#CC0000;color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:4px;text-transform:uppercase;margin-bottom:10px;">Nuevo Proyecto Asignado</div>
        <div style="color:#fff;font-size:22px;font-weight:700;line-height:1.3;">${d.nombre}</div>
        <div style="color:#8696A0;font-size:13px;margin-top:6px;">Cliente: ${d.cliente}</div>
      </td></tr>
      <tr><td style="padding:28px 32px;">
        <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hola, <strong>${d.usuarioNombre}</strong>. Se te ha asignado un nuevo proyecto en el sistema de subcontratos de TAS.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border-radius:8px;padding:16px;margin-bottom:20px;">
          <tr><td style="font-size:12px;color:#6B7280;padding:4px 0;">N° Proyecto SAP</td><td style="font-size:13px;color:#111827;font-weight:600;padding:4px 0;">${d.numeroProy}</td></tr>
          <tr><td style="font-size:12px;color:#6B7280;padding:4px 0;">Fecha de inicio</td><td style="font-size:13px;color:#111827;font-weight:600;padding:4px 0;">${d.fechaInicio}</td></tr>
          <tr><td style="font-size:12px;color:#6B7280;padding:4px 0;">Fecha fin estimada</td><td style="font-size:13px;color:#111827;font-weight:600;padding:4px 0;">${d.fechaFin}</td></tr>
          <tr><td style="font-size:12px;color:#6B7280;padding:4px 0;">Días máximos</td><td style="font-size:13px;color:#CC0000;font-weight:700;padding:4px 0;">${d.diasMaximos} días</td></tr>
        </table>
        <div style="margin-bottom:20px;">
          <div style="font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;">Actividades del proyecto</div>
          <ul style="margin:0;padding-left:18px;">${actHtml}</ul>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#EFF6FF;border-radius:8px;padding:14px;margin-bottom:24px;border-left:4px solid #3B82F6;">
          <tr><td>
            <div style="font-size:12px;color:#1D4ED8;font-weight:700;margin-bottom:4px;">Supervisor a cargo</div>
            <div style="font-size:14px;color:#1E40AF;font-weight:600;">${d.supervisorNombre}</div>
            <div style="font-size:13px;color:#3B82F6;">${d.supervisorCorreo}</div>
          </td></tr>
        </table>
        <div style="text-align:center;">
          <a href="https://tech-report-bot.replit.app/" style="display:inline-block;background:#CC0000;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 32px;border-radius:6px;letter-spacing:0.3px;">Acceder al sistema</a>
        </div>
      </td></tr>
      <tr><td style="background:#F9FAFB;padding:14px 32px;border-top:1px solid #E5E7EB;text-align:center;font-size:11px;color:#9CA3AF;">TAS Seguridad · Módulo de Subcontratos · Usuario: utiliza tu usuario registrado con contraseña TAS2026!</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── GET /api/subcontratos/proyecto/:id/actividades ────────────────────────────

router.get("/subcontratos/proyecto/:id/actividades", async (req, res) => {
  const { id } = req.params;
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from("subcontratos_actividades")
      .select("*")
      .eq("proyecto_id", id)
      .order("orden");
    if (error) { res.status(500).json({ success: false, error: error.message }); return; }
    res.json({ success: true, actividades: data ?? [] });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] get actividades error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── PUT /api/subcontratos/proyecto/:id/actividades ────────────────────────────
// Replace all activities for a project (add new ones, keep existing with progress, remove deleted)

router.put("/subcontratos/proyecto/:id/actividades", async (req, res) => {
  const { id } = req.params;
  const { actividades } = req.body as { actividades: Array<{ id?: string; nombre: string }> };
  if (!Array.isArray(actividades) || actividades.length === 0) {
    res.status(400).json({ success: false, error: "Se requiere al menos una actividad" });
    return;
  }
  const supabase = getSupabase();
  try {
    // Fetch existing actividades
    const { data: existentes } = await supabase
      .from("subcontratos_actividades")
      .select("id, nombre, porcentaje_avance")
      .eq("proyecto_id", id);
    const existentesMap = new Map((existentes ?? []).map((a: { id: string; nombre: string; porcentaje_avance: number }) => [a.id, a]));

    // Determine which to keep (existing ids provided), which to delete, which to insert
    const keepIds = new Set(actividades.filter((a) => a.id).map((a) => a.id!));
    const toDelete = [...existentesMap.keys()].filter((eid) => !keepIds.has(eid));
    const toInsert = actividades.filter((a) => !a.id).map((a, i) => ({
      proyecto_id: id,
      nombre: a.nombre,
      porcentaje_avance: 0,
      orden: (existentesMap.size - toDelete.length) + i + 1,
    }));

    // Update orden for kept actividades
    const keptInOrder = actividades.filter((a) => a.id);
    for (let i = 0; i < keptInOrder.length; i++) {
      await supabase.from("subcontratos_actividades").update({ orden: i + 1 }).eq("id", keptInOrder[i].id!);
    }

    // Delete removed ones
    if (toDelete.length > 0) {
      await supabase.from("subcontratos_actividades").delete().in("id", toDelete);
    }

    // Insert new ones
    if (toInsert.length > 0) {
      await supabase.from("subcontratos_actividades").insert(toInsert);
    }

    // Return updated list
    const { data: updated } = await supabase
      .from("subcontratos_actividades")
      .select("*")
      .eq("proyecto_id", id)
      .order("orden");

    res.json({ success: true, actividades: updated ?? [] });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] put actividades error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── PATCH /api/subcontratos/proyecto/:id ───────────────────────────────────────

router.patch("/subcontratos/proyecto/:id", async (req, res) => {
  const { id } = req.params;
  const { fecha_inicio, fecha_fin_estimada, dias_maximos, supervisor_nombre, supervisor_correo, supervisor_id } = req.body as {
    fecha_inicio?: string; fecha_fin_estimada?: string; dias_maximos?: number;
    supervisor_nombre?: string; supervisor_correo?: string; supervisor_id?: string;
  };
  const supabase = getSupabase();
  try {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (fecha_inicio) updates["fecha_inicio"] = fecha_inicio;
    if (fecha_fin_estimada) updates["fecha_fin_estimada"] = fecha_fin_estimada;
    if (dias_maximos != null) updates["dias_maximos"] = dias_maximos;
    if (supervisor_nombre) updates["supervisor_nombre"] = supervisor_nombre;
    if (supervisor_correo) updates["supervisor_correo"] = supervisor_correo;
    if (supervisor_id) updates["supervisor_id"] = supervisor_id;
    const { data, error } = await supabase
      .from("subcontratos_proyectos")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) { res.status(500).json({ success: false, error: error.message }); return; }
    res.json({ success: true, proyecto: data });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] editar proyecto error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── PATCH /api/subcontratos/proyecto/:id/desactivar ───────────────────────────

router.patch("/subcontratos/proyecto/:id/desactivar", async (req, res) => {
  const { id } = req.params;
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from("subcontratos_proyectos")
      .update({ estado: "completado", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) { res.status(500).json({ success: false, error: error.message }); return; }
    res.json({ success: true, proyecto: data });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] desactivar proyecto error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── POST /api/subcontratos/empresa ─────────────────────────────────────────────

router.post("/subcontratos/empresa", async (req, res) => {
  const { nombre, contacto, telefono, correo } = req.body as {
    nombre?: string; contacto?: string; telefono?: string; correo?: string;
  };
  if (!nombre?.trim()) {
    res.status(400).json({ success: false, error: "Nombre de empresa requerido" });
    return;
  }
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from("subcontratos_empresas")
      .insert({ nombre: nombre.trim(), contacto: contacto?.trim() || null, telefono: telefono?.trim() || null, correo: correo?.trim() || null, activo: true })
      .select()
      .single();
    if (error) { res.status(500).json({ success: false, error: error.message }); return; }
    res.json({ success: true, empresa: data });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] crear empresa error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── POST /api/subcontratos/usuario ─────────────────────────────────────────────

router.post("/subcontratos/usuario", async (req, res) => {
  const { nombre, usuario, correo, empresa_id } = req.body as {
    nombre?: string; usuario?: string; correo?: string; empresa_id?: string;
  };
  if (!nombre?.trim() || !usuario?.trim() || !empresa_id) {
    res.status(400).json({ success: false, error: "Nombre, usuario y empresa son requeridos" });
    return;
  }
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from("subcontratos_usuarios")
      .insert({
        nombre: nombre.trim(),
        usuario: usuario.trim().toLowerCase(),
        correo: correo?.trim() || null,
        empresa_id,
        activo: true,
      })
      .select()
      .single();
    if (error) {
      if (error.message?.includes("unique") || error.code === "23505") {
        res.status(409).json({ success: false, error: "El nombre de usuario ya existe" });
      } else {
        res.status(500).json({ success: false, error: error.message });
      }
      return;
    }
    res.json({ success: true, usuario: data });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] crear usuario error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── GET /api/subcontratos/check-notifications ──────────────────────────────────
// Stateless daily notification check. Call once per day via external cron.
// Sends scheduled lifecycle emails for upcoming starts, deadlines, and overdue projects.

router.get("/subcontratos/check-notifications", async (req, res) => {
  const supabase = getSupabase();
  if (!process.env["RESEND_API_KEY"]) {
    res.status(503).json({ success: false, error: "RESEND_API_KEY not configured" });
    return;
  }

  try {
    // Fetch all non-completed projects with user info
    const { data: proyectos, error } = await supabase
      .from("subcontratos_proyectos")
      .select("*, subcontratos_usuarios(correo, nombre)")
      .neq("estado", "completado");

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    const sent: string[] = [];

    for (const p of proyectos ?? []) {
      const raw = p as {
        nombre: string; fecha_inicio?: string | null; fecha_fin_estimada?: string | null;
        dias_maximos: number; estado: string; supervisor_correo?: string | null;
        subcontratos_usuarios?: { correo: string | null; nombre?: string | null } | null;
      supervisor_nombre?: string | null;
      };
      const calc = calcEstado(raw.fecha_inicio ?? null, raw.fecha_fin_estimada ?? null, raw.dias_maximos, raw.estado);
      const subEmail = raw.subcontratos_usuarios?.correo ?? null;
      const subName = raw.subcontratos_usuarios?.nombre ?? null;
      const supEmail = raw.supervisor_correo ?? null;
      const nombre = raw.nombre;
      const inicioLabel = raw.fecha_inicio
        ? new Date(raw.fecha_inicio).toLocaleDateString("es-SV", { weekday: "long", day: "numeric", month: "long" })
        : "—";
      const finLabel = raw.fecha_fin_estimada
        ? new Date(raw.fecha_fin_estimada).toLocaleDateString("es-SV", { weekday: "long", day: "numeric", month: "long" })
        : "—";

      const supName = raw.supervisor_nombre ?? "Supervisor TAS";
      const subLabel = (e: string) => `Subcontratista: ${subName ?? "—"}\nCorreo: ${e}`;
      const supLabel = (e: string) => `Supervisor: ${supName}\nCorreo: ${e}`;

      const emails: Array<{ to: string; testLabel: string; subject: string; html: string }> = [];

      // 3 days before start
      if (calc.dias_para_iniciar === 3 && subEmail) {
        emails.push({ to: subEmail, testLabel: subLabel(subEmail), subject: `Tu proyecto "${nombre}" inicia en 3 días`, html: `<p>Hola,</p><p>Tu proyecto <strong>${nombre}</strong> inicia el <strong>${inicioLabel}</strong> (en 3 días). Prepara tu equipo y materiales a tiempo.</p>` });
      }
      // 1 day before start
      if (calc.dias_para_iniciar === 1 && subEmail) {
        emails.push({ to: subEmail, testLabel: subLabel(subEmail), subject: `Tu proyecto "${nombre}" inicia mañana`, html: `<p>Hola,</p><p>Tu proyecto <strong>${nombre}</strong> inicia mañana (<strong>${inicioLabel}</strong>). ¡Prepárate!</p>` });
      }
      // Day of start
      if (calc.estado_calculado === "en_progreso" && calc.dias_transcurridos === 0 && subEmail) {
        emails.push({ to: subEmail, testLabel: subLabel(subEmail), subject: `Tu proyecto "${nombre}" comienza hoy`, html: `<p>Hola,</p><p>Hoy comienza tu proyecto <strong>${nombre}</strong>. Tienes <strong>${raw.dias_maximos} días</strong> para completarlo. ¡Éxito!</p>` });
      }
      // 3 days before deadline (supervisor)
      if ((calc.estado_calculado === "en_progreso" || calc.estado_calculado === "en_riesgo") && calc.dias_restantes === 3 && supEmail) {
        emails.push({ to: supEmail, testLabel: supLabel(supEmail), subject: `El proyecto "${nombre}" vence en 3 días`, html: `<p>Supervisor,</p><p>El proyecto <strong>${nombre}</strong> vence el <strong>${finLabel}</strong> (en 3 días). Estado actual: ${calc.porcentaje_dias}% del tiempo utilizado.</p>` });
      }
      // 80% days consumed
      if (calc.porcentaje_dias >= 80 && calc.porcentaje_dias < 90) {
        if (subEmail) emails.push({ to: subEmail, testLabel: subLabel(subEmail), subject: `Alerta: 80% del tiempo usado en "${nombre}"`, html: `<p>Hola,</p><p>Has utilizado el <strong>80%</strong> del tiempo asignado para el proyecto <strong>${nombre}</strong>. Quedan <strong>${calc.dias_restantes} días</strong> hasta el <strong>${finLabel}</strong>.</p>` });
        if (supEmail) emails.push({ to: supEmail, testLabel: supLabel(supEmail), subject: `Alerta 80% — "${nombre}"`, html: `<p>Supervisor,</p><p>El proyecto <strong>${nombre}</strong> ha consumido el 80% del tiempo asignado. Quedan ${calc.dias_restantes} días.</p>` });
      }
      // Overdue
      if (calc.estado_calculado === "vencido") {
        if (subEmail) emails.push({ to: subEmail, testLabel: subLabel(subEmail), subject: `⚠️ Tu proyecto "${nombre}" ha vencido`, html: `<p>Hola,</p><p>Tu proyecto <strong>${nombre}</strong> venció hace <strong>${calc.dias_vencido} día(s)</strong>. Comunícate con tu supervisor para regularizar la situación.</p>` });
        if (supEmail) emails.push({ to: supEmail, testLabel: supLabel(supEmail), subject: `⚠️ Proyecto vencido — "${nombre}"`, html: `<p>Supervisor,</p><p>El proyecto <strong>${nombre}</strong> venció hace <strong>${calc.dias_vencido} día(s)</strong> (${calc.porcentaje_dias}% del tiempo utilizado).</p>` });
      }

      for (const email of emails) {
        try {
          await sendEmail({ from: "TAS Subcontratos <onboarding@resend.dev>", to: email.to, testLabel: email.testLabel, subject: email.subject, html: email.html });
          sent.push(`${email.to}: ${email.subject}`);
        } catch (e) {
          req.log.warn({ e, to: email.to }, "[check-notifications] email send failed");
        }
      }
    }

    res.json({ success: true, checked: (proyectos ?? []).length, sent_count: sent.length, sent });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] check-notifications error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── GET /api/subcontratos/supervisor-panel?supervisor_id= ──────────────────────
// Comprehensive supervisor subcontract panel: projects enriched with activity
// progress, grouped by company, plus KPIs and pending approvals.

router.get("/subcontratos/supervisor-panel", async (req, res) => {
  const supervisorId = (req.query["supervisor_id"] as string | undefined)?.trim();
  if (!supervisorId) { res.status(400).json({ error: "supervisor_id requerido" }); return; }

  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // ── Parallel data fetch ──────────────────────────────────────────────────
    const [proyectosRes, actividadesRes, reportesRes, empresasRes] = await Promise.all([
      supabase.from("subcontratos_proyectos").select("*").eq("supervisor_id", supervisorId).order("created_at", { ascending: false }),
      supabase.from("subcontratos_actividades").select("*").order("orden"),
      supabase.from("subcontratos_reportes").select("*, subcontratos_fotos(*)").order("fecha", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("subcontratos_empresas").select("*"),
    ]);

    type ProyectoRaw = { id: string; nombre: string; cliente_nombre: string; empresa_id: string; dias_maximos: number; fecha_inicio: string | null; fecha_fin_estimada: string | null; estado: string; updated_at?: string | null; [k: string]: unknown };
    type ActividadRow = { id: string; proyecto_id: string; nombre: string; orden: number };
    type ReporteRow = { id: string; proyecto_id: string; actividad_id: string | null; actividad_nombre: string | null; porcentaje_avance: number; estado: string; created_at: string; fecha: string; hora_checkin: string | null; hora_checkout: string | null; cantidad_tecnicos: number | null; tecnicos_presentes: string | null; descripcion_trabajo: string | null; aprobado_at: string | null; subcontratos_fotos: Array<{ url: string; tipo: string }> };
    type EmpresaRow = { id: string; nombre: string; contacto: string | null; telefono: string | null; correo: string | null };

    const proyectosRaw = (proyectosRes.data ?? []) as ProyectoRaw[];
    const proyectos = proyectosRaw.map((p) => ({ ...p, ...calcEstado(p.fecha_inicio, p.fecha_fin_estimada, p.dias_maximos, p.estado) }));
    const proyectoIds = new Set(proyectos.map((p) => p.id));

    const allActividades = (actividadesRes.data ?? []) as ActividadRow[];
    const allReportes = ((reportesRes.data ?? []) as ReporteRow[]).filter((r) => proyectoIds.has(r.proyecto_id));
    const empresas = (empresasRes.data ?? []) as EmpresaRow[];
    const empresaMap = new Map(empresas.map((e) => [e.id, e]));

    // Group actividades and reportes by proyecto_id
    const actsByProj = new Map<string, ActividadRow[]>();
    for (const a of allActividades) {
      if (!proyectoIds.has(a.proyecto_id)) continue;
      if (!actsByProj.has(a.proyecto_id)) actsByProj.set(a.proyecto_id, []);
      actsByProj.get(a.proyecto_id)!.push(a);
    }
    const repsByProj = new Map<string, ReporteRow[]>();
    for (const r of allReportes) {
      if (!repsByProj.has(r.proyecto_id)) repsByProj.set(r.proyecto_id, []);
      repsByProj.get(r.proyecto_id)!.push(r);
    }

    // ── Enrich each project ──────────────────────────────────────────────────
    const proyectosEnriquecidos = proyectos.map((p) => {
      const reps = repsByProj.get(p.id) ?? [];
      const acts = actsByProj.get(p.id) ?? [];
      const empresa = empresaMap.get(p.empresa_id);

      // Activity progress: max approved porcentaje_avance per actividad_nombre
      const avanceMap: Record<string, number> = {};
      for (const r of reps) {
        const nombre = r.actividad_nombre ?? "Sin nombre";
        if (r.estado === "aprobado") {
          avanceMap[nombre] = Math.max(avanceMap[nombre] ?? 0, r.porcentaje_avance ?? 0);
        }
      }
      // Fallback to all states for activities with no approved reports
      for (const r of reps) {
        const nombre = r.actividad_nombre ?? "Sin nombre";
        if (!(nombre in avanceMap)) {
          avanceMap[nombre] = Math.max(avanceMap[nombre] ?? 0, r.porcentaje_avance ?? 0);
        }
      }

      // Build actividades list (catalog activities + any from reportes not in catalog)
      const actividades: Array<{ nombre: string; avance: number }> = acts.length > 0
        ? acts.map((a) => ({ nombre: a.nombre, avance: avanceMap[a.nombre] ?? 0 }))
        : Object.keys(avanceMap).map((nombre) => ({ nombre, avance: avanceMap[nombre] }));

      const avance_total = actividades.length > 0
        ? Math.round(actividades.reduce((s, a) => s + a.avance, 0) / actividades.length)
        : 0;

      const pendientes = reps.filter((r) => r.estado === "pendiente");
      const ultimoReporte = reps[0] ?? null;

      return {
        ...p,
        empresa_nombre: empresa?.nombre ?? p.empresa_id,
        actividades,
        avance_total,
        pendientes_count: pendientes.length,
        ultimo_reporte_fecha: ultimoReporte?.fecha ?? null,
        reportes_recientes: reps.slice(0, 10).map((r) => ({
          id: r.id,
          fecha: r.fecha,
          estado: r.estado,
          actividad_nombre: r.actividad_nombre,
          porcentaje_avance: r.porcentaje_avance,
          tecnicos_presentes: r.tecnicos_presentes,
          descripcion_trabajo: r.descripcion_trabajo,
          hora_checkin: r.hora_checkin,
          hora_checkout: r.hora_checkout,
          created_at: r.created_at,
          fotos: r.subcontratos_fotos ?? [],
        })),
      };
    });

    // ── Enriched pending approvals (all companies, oldest first) ────────────
    const pendientes = allReportes
      .filter((r) => r.estado === "pendiente")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((r) => {
        const proy = proyectos.find((p) => p.id === r.proyecto_id);
        const empresa = proy ? empresaMap.get(proy.empresa_id) : undefined;
        return {
          ...r,
          proyecto_nombre: proy?.nombre ?? "—",
          empresa_nombre: empresa?.nombre ?? "—",
          proyecto_estado_calculado: proy?.["estado_calculado"] ?? "",
          dias_transcurridos: proy?.["dias_transcurridos"] ?? 0,
          dias_maximos: proy?.dias_maximos ?? 0,
        };
      });

    // ── Overall KPIs ─────────────────────────────────────────────────────────
    const activos = proyectosEnriquecidos.filter((p) => !["completado"].includes(p.estado_calculado as string));
    const enRiesgo = activos.filter((p) => p.estado_calculado === "en_riesgo" || p.estado_calculado === "vencido");
    const proximosVencer = activos.filter((p) => {
      const dr = p["dias_restantes"] as number;
      return (p.estado_calculado === "en_progreso" || p.estado_calculado === "en_riesgo") && dr >= 0 && dr <= 3;
    });
    const porIniciar7d = proyectosEnriquecidos.filter((p) => {
      const di = p["dias_para_iniciar"] as number;
      return p.estado_calculado === "por_iniciar" && di >= 0 && di <= 7;
    });
    const completadosMes = proyectosEnriquecidos.filter((p) => {
      const upd = String(p["updated_at"] ?? "");
      return p.estado_calculado === "completado" && upd >= firstOfMonth;
    });

    const avgAvance = activos.length > 0
      ? Math.round(activos.reduce((s, p) => s + p.avance_total, 0) / activos.length)
      : 0;
    const avgDiasRestantes = activos.length > 0
      ? Math.round(activos.reduce((s, p) => s + ((p["dias_restantes"] as number) ?? 0), 0) / activos.length)
      : 0;

    // Supervisor avg approval time (hours) from their approved reports
    const aprobados = allReportes.filter((r) => r.estado === "aprobado" && r.aprobado_at);
    const avgAprobacionHoras = aprobados.length > 0
      ? Math.round(
          aprobados.reduce((s, r) => {
            const diff = (new Date(r.aprobado_at!).getTime() - new Date(r.created_at).getTime()) / 3600000;
            return s + Math.max(0, diff);
          }, 0) / aprobados.length * 10
        ) / 10
      : null;

    // ── Group by empresa ─────────────────────────────────────────────────────
    const empresaGrupos = new Map<string, typeof proyectosEnriquecidos>();
    for (const p of proyectosEnriquecidos) {
      const eid = p.empresa_id;
      if (!empresaGrupos.has(eid)) empresaGrupos.set(eid, []);
      empresaGrupos.get(eid)!.push(p);
    }

    const empresasConProyectos = [...empresaGrupos.entries()].map(([eid, projs]) => {
      const empresa = empresaMap.get(eid);
      const activosEmpresa = projs.filter((p) => p.estado_calculado !== "completado");
      const completadosEmpresa = projs.filter((p) => p.estado_calculado === "completado");
      const avgAvanceEmpresa = activosEmpresa.length > 0
        ? Math.round(activosEmpresa.reduce((s, p) => s + p.avance_total, 0) / activosEmpresa.length)
        : 0;
      const pendientesEmpresa = projs.reduce((s, p) => s + p.pendientes_count, 0);

      // Company approval avg hours
      const repAprobadosEmpresa = allReportes.filter((r) => {
        const p = proyectosEnriquecidos.find((pr) => pr.id === r.proyecto_id);
        return r.estado === "aprobado" && r.aprobado_at && p?.empresa_id === eid;
      });
      const avgAprobEmpresa = repAprobadosEmpresa.length > 0
        ? Math.round(repAprobadosEmpresa.reduce((s, r) => {
            return s + Math.max(0, (new Date(r.aprobado_at!).getTime() - new Date(r.created_at).getTime()) / 3600000);
          }, 0) / repAprobadosEmpresa.length * 10) / 10
        : null;

      // pct_a_tiempo: completed projects delivered on time
      const completadosConDias = completadosEmpresa.filter((p) => (p["dias_transcurridos"] as number) > 0);
      const aTiempo = completadosConDias.filter((p) => (p["dias_transcurridos"] as number) <= p.dias_maximos);
      const pctATiempo = completadosConDias.length > 0 ? Math.round((aTiempo.length / completadosConDias.length) * 100) : null;
      const avgDiasVsEstimado = completadosConDias.length > 0
        ? Math.round(completadosConDias.reduce((s, p) => s + ((p["dias_transcurridos"] as number) - p.dias_maximos), 0) / completadosConDias.length * 10) / 10
        : null;

      return {
        id: eid,
        nombre: empresa?.nombre ?? eid,
        contacto: empresa?.contacto ?? null,
        telefono: empresa?.telefono ?? null,
        correo: empresa?.correo ?? null,
        proyectos: projs,
        total_activos: activosEmpresa.length,
        avg_avance: avgAvanceEmpresa,
        pendientes: pendientesEmpresa,
        completados_total: completadosEmpresa.length,
        avg_aprobacion_horas: avgAprobEmpresa,
        pct_a_tiempo: pctATiempo,
        avg_dias_vs_estimado: avgDiasVsEstimado,
      };
    });

    res.json({
      success: true,
      kpis: {
        total_activos: activos.length,
        avg_avance: avgAvance,
        dias_promedio_restantes: avgDiasRestantes,
        pendientes_aprobacion: pendientes.length,
        avg_aprobacion_horas: avgAprobacionHoras,
        en_riesgo: enRiesgo.length,
        proximos_a_vencer: proximosVencer.length,
        por_iniciar_7d: porIniciar7d.length,
        completados_este_mes: completadosMes.length,
      },
      empresas: empresasConProyectos,
      pendientes,
      completados_mes: completadosMes,
      proyectos: proyectosEnriquecidos,
    });
  } catch (err) {
    req.log.error({ err }, "[subcontratos] supervisor-panel error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

export default router;


