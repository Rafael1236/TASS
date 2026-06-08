/**
 * Centralized email sender with TEST_MODE support.
 *
 * When EMAIL_TEST_MODE=true (env/secret), ALL outbound emails are redirected
 * to TEST_EMAIL regardless of the real recipient. A banner is prepended to
 * every HTML body showing the original intended recipient.
 *
 * Set EMAIL_TEST_MODE=false (or remove it) to send to real recipients.
 */

import { Resend } from "resend";

const TEST_MODE = (process.env["EMAIL_TEST_MODE"] ?? "true").toLowerCase() === "true";
const TEST_EMAIL = "hpinaud@tas-seguridad.com";

export interface SendEmailParams {
  from: string;
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
  /**
   * Optional rich label for the test-mode banner describing the real recipient(s).
   * Use "\n" for line breaks between name and email.
   * Examples:
   *   "Contacto: Carlos Reyes\nCorreo: carlos@cliente.com"
   *   "Área Comercial — Allen Rosales\nCorreo: arosales@tas-seguridad.com"
   *   "Supervisor: Alexander Menjivar\nCorreo: amenjivar@tas-seguridad.com"
   *   "Subcontratista: Roberto Flores\nCorreo: roberto@empresa.com"
   */
  testLabel?: string;
}

function testBanner(originalTo: string[], testLabel?: string): string {
  const recipientHtml = testLabel
    ? testLabel.replace(/\n/g, "<br>")
    : originalTo.join(", ");

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:0;">
  <tr>
    <td style="background:#FFF8E1;border:2px solid #F59E0B;border-radius:8px;padding:14px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="font-size:14px;font-weight:700;color:#78350F;margin-bottom:6px;">🧪 MODO PRUEBA</div>
      <div style="font-size:12px;color:#92400E;margin-bottom:4px;">Este correo estaba dirigido originalmente a:</div>
      <div style="font-size:13px;color:#78350F;font-weight:600;line-height:1.7;">${recipientHtml}</div>
    </td>
  </tr>
</table>
<div style="height:16px;"></div>
`;
}

function injectBanner(html: string, originalTo: string[], testLabel?: string): string {
  const banner = testBanner(originalTo, testLabel);
  // Inject after <body ...> tag, or prepend if no body tag
  const bodyMatch = html.match(/<body[^>]*>/i);
  if (bodyMatch) {
    return html.replace(bodyMatch[0], `${bodyMatch[0]}${banner}`);
  }
  return banner + html;
}

/**
 * Send an email via Resend, respecting TEST_MODE.
 * Returns the Resend response data (or null if skipped / failed silently).
 */
export async function sendEmail(
  params: SendEmailParams,
  log?: { info: (msg: string) => void; warn: (msg: string) => void },
): Promise<{ id?: string } | null> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    log?.warn("[sendEmail] RESEND_API_KEY not set — skipping");
    return null;
  }

  const resend = new Resend(apiKey);

  const originalTo = Array.isArray(params.to) ? params.to : [params.to];
  const originalCc = params.cc ? (Array.isArray(params.cc) ? params.cc : [params.cc]) : undefined;

  let effectiveTo: string[];
  let effectiveCc: string[] | undefined;
  let effectiveHtml: string;
  let effectiveSubject: string;

  if (TEST_MODE) {
    effectiveTo = [TEST_EMAIL];
    effectiveCc = undefined; // suppress CC in test mode — they also go to TEST_EMAIL via "to"
    effectiveHtml = injectBanner(params.html, [...originalTo, ...(originalCc ?? [])].filter(Boolean), params.testLabel);
    effectiveSubject = params.subject; // subject unchanged so we can still verify content
    log?.info(`[sendEmail] TEST_MODE — redirecting to ${TEST_EMAIL} (original: ${originalTo.join(", ")})`);
  } else {
    effectiveTo = originalTo;
    effectiveCc = originalCc;
    effectiveHtml = params.html;
    effectiveSubject = params.subject;
  }

  const payload: Parameters<typeof resend.emails.send>[0] = {
    from: params.from,
    to: effectiveTo,
    subject: effectiveSubject,
    html: effectiveHtml,
  };
  if (effectiveCc) payload.cc = effectiveCc;

  const result = await resend.emails.send(payload);
  log?.info(`[sendEmail] sent — id: ${result.data?.id ?? "?"} — to: ${effectiveTo.join(", ")}`);
  return result.data ?? null;
}
