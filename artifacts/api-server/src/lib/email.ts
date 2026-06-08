import { sendEmail } from "./sendEmail";

const FROM = "TAS Reportes <onboarding@resend.dev>";

// Real commercial area recipient — Allen Rosales
const COMMERCIAL_EMAIL = "arosales@tas-seguridad.com";
const COMMERCIAL_NAME = "Área Comercial — Allen Rosales";

// ---------------------------------------------------------------------------
// Data shape the reports route passes in
// ---------------------------------------------------------------------------

// Customer experience team — fallback when client has no email on file
const CUSTOMER_EXPERIENCE_EMAIL = process.env["CUSTOMER_EXPERIENCE_EMAIL"] ?? "crodriguez@tas-seguridad.com";
const CUSTOMER_EXPERIENCE_NAME = "Experiencia al Cliente — Carol Rodríguez";

export interface EmailReportData {
  numero_reporte: string | number;
  cliente_nombre: string;
  /** Email from the clientes table (looked up by cliente_id) */
  correo_cliente?: string | null;
  /** Email manually typed by technician in the boleta form */
  correo_cliente_manual?: string | null;
  /** Human name of the client contact — shown in the test-mode banner */
  contacto_cliente?: string | null;
  tecnico_nombre?: string | null;
  numero_llamada?: string | null;
  numero_proyecto?: string | null;
  tipo_servicio?: string | null;
  trabajo_realizado?: string | null;
  hora_entrada?: string | null;
  hora_salida?: string | null;
  estado_servicio?: string | null;
  hay_cotizacion?: boolean | null;
  descripcion_cotizacion?: string | null;
  observaciones?: string | null;
  es_subcontrato?: boolean | null;
  tecnicos?: Array<{ nombre: string; es_subcontrato?: boolean }>;
  repuestos?: Array<{ cantidad?: string | null; descripcion: string }>;
}

// ---------------------------------------------------------------------------
// Shared HTML helpers
// ---------------------------------------------------------------------------

function esc(v: string | null | undefined): string {
  return (v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function val(v: string | null | undefined, fallback = "—"): string {
  const s = (v ?? "").trim();
  return s.length > 0 ? esc(s) : fallback;
}

function todayStr(): string {
  return new Date().toLocaleDateString("es-SV", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function row(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:6px 12px 6px 0;font-size:13px;color:#6B7280;font-weight:600;width:180px;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;vertical-align:top;">${value}</td>
    </tr>`;
}

function sectionTitle(title: string): string {
  return `
    <tr>
      <td colspan="2" style="padding:20px 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#1D9E75;border-bottom:1px solid #E5E7EB;">${title}</td>
    </tr>
    <tr><td colspan="2" style="padding:0 0 4px;"></td></tr>`;
}

function estadoBadge(estado: string | null | undefined): string {
  const e = (estado ?? "").trim();
  if (!e) return "—";
  const isTerminado = e === "Terminado";
  const bg = isTerminado ? "#D1FAE5" : "#FEF3C7";
  const color = isTerminado ? "#065F46" : "#92400E";
  return `<span style="background:${bg};color:${color};font-size:12px;font-weight:600;padding:3px 10px;border-radius:12px;">${esc(e)}</span>`;
}

function wrap(headerBadge: string, headerTitle: string, headerSub: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

        <!-- HEADER -->
        <tr>
          <td style="background:#1A252F;padding:28px 32px;">
            <div style="display:inline-block;background:#1D9E75;color:#FFFFFF;font-size:11px;font-weight:700;letter-spacing:0.6px;padding:4px 10px;border-radius:4px;text-transform:uppercase;margin-bottom:10px;">${headerBadge}</div>
            <div style="color:#FFFFFF;font-size:20px;font-weight:700;margin:0;line-height:1.3;">${headerTitle}</div>
            <div style="color:#8696A0;font-size:13px;margin-top:6px;">${headerSub}</div>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${body}
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #E5E7EB;text-align:center;">
            <span style="font-size:11px;color:#9CA3AF;">TAS Seguridad · Sistema de Reportes Técnicos · ${todayStr()}</span>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// EMAIL — Commercial area (sent on "Boleta revisada")
// Includes prominent SAP alert when numero_llamada is missing.
// ---------------------------------------------------------------------------

function buildCommercialEmail(d: EmailReportData, sinNumeroLlamada: boolean): { subject: string; html: string } {
  const hasOpportunity = d.hay_cotizacion === true;

  const subject = hasOpportunity
    ? `⚡ Oportunidad de cotización — ${d.cliente_nombre} — Reporte #${d.numero_reporte}`
    : `Reporte de visita — ${d.cliente_nombre} — Reporte #${d.numero_reporte}`;

  // Red alert box for missing SAP call number
  const sapAlertBlock = sinNumeroLlamada
    ? `
    <tr>
      <td colspan="2" style="padding:0 0 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#FEF2F2;border:2px solid #DC2626;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:#DC2626;padding:12px 20px;">
              <span style="color:#FFFFFF;font-size:14px;font-weight:700;letter-spacing:0.4px;">⚠️ BOLETA SIN NÚMERO DE LLAMADA SAP</span>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 20px;font-size:14px;color:#7F1D1D;line-height:1.65;">
              Esta boleta no tiene número de llamada asignado. Por favor ingrese el número de llamada en el dashboard comercial para completar el registro.
            </td>
          </tr>
          <tr>
            <td style="padding:0 20px 18px;text-align:left;">
              <a href="https://tech-report-bot.replit.app/dashboard/comercial"
                 style="display:inline-block;background:#DC2626;color:#FFFFFF;font-size:13px;font-weight:700;text-decoration:none;padding:10px 22px;border-radius:6px;letter-spacing:0.3px;">
                Ingresar # llamada →
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
    : "";

  const opportunityBlock = hasOpportunity
    ? `
    <tr>
      <td colspan="2" style="padding:0 0 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF9;border:1.5px solid #1D9E75;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:#1D9E75;padding:10px 18px;">
              <span style="color:#FFFFFF;font-size:13px;font-weight:700;letter-spacing:0.4px;">⚡ OPORTUNIDAD DE COTIZACIÓN</span>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 18px;font-size:14px;color:#111827;line-height:1.65;">
              ${val(d.descripcion_cotizacion)}
            </td>
          </tr>
        </table>
      </td>
    </tr>`
    : "";

  const body = `
    ${sapAlertBlock}
    ${opportunityBlock}

    ${sectionTitle("Información del cliente")}
    ${row("Cliente", `<strong>${val(d.cliente_nombre)}</strong>`)}
    ${row("Técnico que visitó", val(d.tecnico_nombre))}
    ${row("Fecha de la visita", todayStr())}
    ${row("Llamada SAP (referencia)", val(d.numero_llamada))}

    ${sectionTitle("Resumen del trabajo realizado")}
    <tr>
      <td colspan="2" style="padding:8px 0 16px;font-size:13px;color:#374151;line-height:1.65;">
        ${val(d.trabajo_realizado)}
      </td>
    </tr>
    ${row("Tipo de servicio", val(d.tipo_servicio))}
    ${row("Estado del servicio", estadoBadge(d.estado_servicio))}
  `;

  const headerBadge = hasOpportunity ? "⚡ Área Comercial" : "Área Comercial";
  const headerTitle = hasOpportunity
    ? `Oportunidad en ${val(d.cliente_nombre)}`
    : `Visita de servicio — ${val(d.cliente_nombre)}`;

  return {
    subject,
    html: wrap(
      headerBadge,
      headerTitle,
      `Reporte #${d.numero_reporte} · ${todayStr()}`,
      body,
    ),
  };
}

// ---------------------------------------------------------------------------
// EMAIL — Client notification (sent on technician confirmation)
// ---------------------------------------------------------------------------

function buildClientEmail(d: EmailReportData, opts?: { forExperience?: boolean }): { subject: string; html: string } {
  const subject = opts?.forExperience
    ? `[Sin correo registrado] Reporte de servicio — ${d.cliente_nombre}`
    : `Resumen de servicio técnico realizado — ${d.cliente_nombre} — Reporte #${d.numero_reporte}`;

  const noCorreoBlock = opts?.forExperience
    ? `
    <tr>
      <td colspan="2" style="padding:0 0 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8E1;border:2px solid #F59E0B;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:#F59E0B;padding:12px 20px;">
              <span style="color:#FFFFFF;font-size:14px;font-weight:700;letter-spacing:0.4px;">⚠️ Sin correo registrado</span>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 20px;font-size:14px;color:#78350F;line-height:1.65;">
              Este cliente no tiene correo registrado en el sistema. Por favor contactar al cliente directamente y actualizar su correo en la base de datos.
            </td>
          </tr>
        </table>
      </td>
    </tr>`
    : "";

  const surveyBase = "https://tally.so/r/EkWQbX";
  const surveyParams = new URLSearchParams({
    personal: (d.tecnico_nombre ?? "").trim(),
    servicio: (d.tipo_servicio ?? "").trim(),
    empresa: d.cliente_nombre.trim(),
  });
  const surveyUrl = `${surveyBase}?${surveyParams.toString()}`;

  const cotizacionNotice = d.hay_cotizacion === true
    ? `
    <tr>
      <td colspan="2" style="padding:16px 0 4px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF9;border-left:4px solid #1D9E75;border-radius:0 6px 6px 0;">
          <tr>
            <td style="padding:14px 18px;font-size:14px;color:#111827;line-height:1.65;">
              Su vendedor asignado ya fue notificado sobre lo que se le debe cotizar, y estará contactándole próximamente.
            </td>
          </tr>
        </table>
      </td>
    </tr>`
    : "";

  const body = `
    ${noCorreoBlock}

    <!-- Greeting -->
    <tr>
      <td colspan="2" style="padding:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
        Estimado cliente, le informamos que el día <strong>${todayStr()}</strong> nuestro equipo técnico realizó una visita de servicio en sus instalaciones.
      </td>
    </tr>

    ${sectionTitle("Resumen del servicio")}
    ${row("Técnico", val(d.tecnico_nombre))}
    ${row("Tipo de servicio", val(d.tipo_servicio))}
    ${row("Hora de entrada", val(d.hora_entrada))}
    ${row("Hora de salida", val(d.hora_salida))}
    ${row("Estado del servicio", estadoBadge(d.estado_servicio))}

    ${sectionTitle("Trabajo realizado")}
    <tr>
      <td colspan="2" style="padding:8px 0 16px;font-size:14px;color:#374151;line-height:1.7;">
        ${val(d.trabajo_realizado)}
      </td>
    </tr>

    ${cotizacionNotice}

    <!-- Survey button -->
    <tr>
      <td colspan="2" style="padding:28px 0 8px;text-align:center;">
        <a href="${surveyUrl}"
           style="display:inline-block;background:#1D9E75;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:6px;letter-spacing:0.3px;">
          Calificar el servicio recibido
        </a>
        <div style="margin-top:10px;font-size:12px;color:#9CA3AF;">Su opinión nos ayuda a mejorar.</div>
      </td>
    </tr>

    <!-- Closing -->
    <tr>
      <td colspan="2" style="padding:24px 0 0;border-top:1px solid #E5E7EB;margin-top:24px;font-size:14px;color:#374151;line-height:1.6;">
        Gracias por confiar en TAS El Salvador.
      </td>
    </tr>
  `;

  return {
    subject,
    html: wrap(
      "Aviso de Servicio",
      `Resumen de visita técnica — Reporte #${d.numero_reporte}`,
      `Servicio realizado el ${todayStr()}`,
      body,
    ),
  };
}

// ---------------------------------------------------------------------------
// TRIGGER 1 — Technician confirms boleta
// EMAIL ROUTING LOGIC:
//   dbEmail     = correo_cliente (from clientes table)
//   manualEmail = correo_cliente_manual (typed by technician in form)
//
//   • dbEmail + manualEmail  → send to BOTH
//   • manualEmail only       → send to manual only (no CX fallback)
//   • dbEmail only           → send to dbEmail
//   • neither                → send to CUSTOMER_EXPERIENCE_EMAIL with warning note
// ---------------------------------------------------------------------------

export async function sendReportEmails(
  d: EmailReportData,
  log: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void },
  _opts?: {
    reporteId?: string | number | null;
    supabase?: unknown;
  },
): Promise<void> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    log.warn("[email] RESEND_API_KEY not set — skipping emails");
    return;
  }

  const dbEmail = d.correo_cliente?.trim() || null;
  const manualEmail = d.correo_cliente_manual?.trim() || null;

  try {
    // ── Case: no email at all → route to customer experience team ──────────
    if (!dbEmail && !manualEmail) {
      const cxEmail = process.env["CUSTOMER_EXPERIENCE_EMAIL"] ?? CUSTOMER_EXPERIENCE_EMAIL;
      const cli = buildClientEmail(d, { forExperience: true });
      const testLabel = `Dirigido a: ${cxEmail}\nMotivo: sin correo → experiencia al cliente`;
      await sendEmail({ from: FROM, to: cxEmail, subject: cli.subject, html: cli.html, testLabel }, log);
      log.info("[email] no client email found — routed to customer experience");
      return;
    }

    // ── Build recipient list ─────────────────────────────────────────────────
    const recipients: string[] = [];
    if (manualEmail) recipients.push(manualEmail);
    if (dbEmail && dbEmail !== manualEmail) recipients.push(dbEmail);

    const cli = buildClientEmail(d);

    // Build test-mode label describing real recipients and reason
    const contactName = d.contacto_cliente?.trim() || null;
    const recipientLine = contactName
      ? `Contacto: ${contactName} — ${recipients.join(", ")}`
      : `Dirigido a: ${recipients.join(", ")}`;
    const testLabel = `${recipientLine}\nMotivo: cliente con correo registrado`;

    await sendEmail({ from: FROM, to: recipients, subject: cli.subject, html: cli.html, testLabel }, log);
    log.info(`[email] client email queued — to: ${recipients.join(", ")}`);
  } catch (err) {
    log.error(`[email] client email failed: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// TRIGGER 2 — Supervisor marks boleta as "Revisada"
// Sends the commercial area email. Includes SAP alert when numero_llamada
// is missing. Records correo_comercial_enviado_at on the report row.
// ---------------------------------------------------------------------------

export async function sendCommercialEmail(
  d: EmailReportData,
  log: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void },
  opts?: {
    reporteId?: string | number | null;
    supabase?: { from: (table: string) => { update: (data: Record<string, unknown>) => { eq: (col: string, val: unknown) => Promise<unknown> } } } | null;
  },
): Promise<void> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    log.warn("[email] RESEND_API_KEY not set — skipping commercial email");
    return;
  }

  const sinNumeroLlamada = !d.numero_llamada?.trim();
  const com = buildCommercialEmail(d, sinNumeroLlamada);

  try {
    const testLabel = `${COMMERCIAL_NAME}\nCorreo: ${COMMERCIAL_EMAIL}`;
    await sendEmail({ from: FROM, to: COMMERCIAL_EMAIL, subject: com.subject, html: com.html, testLabel }, log);
    log.info(`[email] commercial email queued (revisada) — sinLlamada: ${sinNumeroLlamada}`);

    // Record timestamp so the commercial dashboard can measure response time
    if (opts?.supabase && opts.reporteId != null) {
      try {
        await opts.supabase
          .from("reportes")
          .update({ correo_comercial_enviado_at: new Date().toISOString() })
          .eq("id", opts.reporteId);
        log.info("[email] correo_comercial_enviado_at recorded");
      } catch (e) {
        log.warn(`[email] could not record correo_comercial_enviado_at: ${String(e)}`);
      }
    }
  } catch (err) {
    log.error(`[email] commercial email (revisada) failed: ${String(err)}`);
  }
}
