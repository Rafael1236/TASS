import { Router, type IRouter, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase, getSupabaseAdmin } from "../lib/supabase";
import { sendEmail } from "../lib/sendEmail";

const router: IRouter = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawClient {
  id: string;
  nombre_comercial: string;
  es_sucursal?: boolean | null;
  cliente_padre_id?: string | null;
  sucursal?: string | null;
}

interface ClientGroup {
  id: string;
  nombre_comercial: string;
  es_sucursal: boolean;
  sucursales: Array<{ id: string; nombre_comercial: string; display_name: string }>;
}

// ── Grouping helpers ──────────────────────────────────────────────────────────

/**
 * Score how "well-capitalized" a name is.
 * Higher = better (each word starts with uppercase letter).
 */
function capitalizationScore(name: string): number {
  return name.split(/\s+/).filter((w) => /^[A-ZÁÉÍÓÚÑÜÀÈÌÒÙa-z]/.test(w)).filter((w) => w[0] === w[0].toUpperCase()).length;
}

/**
 * Given a list of all raw clients, build grouped results for the search view.
 *
 * Priority order:
 *  1. Explicit parent link via cliente_padre_id
 *  2. Prefix match: if the candidate's full name (lower-case) is a true prefix
 *     of another name (lower-case) followed by a space, that other name is a child.
 *  3. Case-insensitive deduplication: two names that differ only in casing are
 *     the same client — we show only the better-capitalized one.
 */
function buildGroups(rows: RawClient[], query: string): ClientGroup[] {
  const q = query.toLowerCase().trim();

  // ── Step 1: Case-insensitive deduplication ───────────────────────────────
  // Group all rows by their lowercased name
  const byLower = new Map<string, RawClient[]>();
  for (const r of rows) {
    const key = r.nombre_comercial.toLowerCase().trim();
    const arr = byLower.get(key) ?? [];
    arr.push(r);
    byLower.set(key, arr);
  }

  // For each group pick the "canonical" representative (best capitalization, or first)
  const canonical = new Map<string, RawClient>();          // id → canonical row
  const aliasToCanonical = new Map<string, string>();      // alias id → canonical id

  for (const [, group] of byLower) {
    const sorted = [...group].sort((a, b) => capitalizationScore(b.nombre_comercial) - capitalizationScore(a.nombre_comercial));
    const winner = sorted[0]!;
    canonical.set(winner.id, winner);
    for (const r of group) {
      aliasToCanonical.set(r.id, winner.id);
    }
  }

  const allCanonical = [...canonical.values()];

  // ── Step 2: Resolve explicit parent links ────────────────────────────────
  const parentOf = new Map<string, string>(); // child canonical-id → parent canonical-id
  for (const r of allCanonical) {
    if (r.es_sucursal && r.cliente_padre_id) {
      const resolvedParent = aliasToCanonical.get(r.cliente_padre_id) ?? r.cliente_padre_id;
      if (canonical.has(resolvedParent)) {
        parentOf.set(r.id, resolvedParent);
      }
    }
  }

  // ── Step 3: Prefix-based implicit parent detection ───────────────────────
  // Sort by name length so shorter names come first (they're more likely parents)
  const byLength = [...allCanonical].sort((a, b) => a.nombre_comercial.length - b.nombre_comercial.length);

  for (const child of byLength) {
    if (parentOf.has(child.id)) continue;           // already assigned
    const childLower = child.nombre_comercial.toLowerCase().trim();

    for (const parent of byLength) {
      if (parent.id === child.id) continue;
      if (parentOf.has(parent.id)) continue;        // parent itself is already a child — skip
      const parentLower = parent.nombre_comercial.toLowerCase().trim();
      if (parentLower.length >= childLower.length) continue; // parent must be shorter

      // Child's name must start with parent's name followed by a space
      if (childLower.startsWith(parentLower + " ")) {
        parentOf.set(child.id, parent.id);
        break;  // take the longest matching parent (first one found since sorted by length)
      }
    }
  }

  // ── Step 4: Build output tree ────────────────────────────────────────────
  const groups = new Map<string, ClientGroup>();
  const childIds = new Set(parentOf.keys());

  // First pass: create group entries for all roots (non-children)
  for (const r of allCanonical) {
    if (!childIds.has(r.id)) {
      groups.set(r.id, {
        id: r.id,
        nombre_comercial: r.nombre_comercial,
        es_sucursal: !!(r.es_sucursal),
        sucursales: [],
      });
    }
  }

  // Second pass: attach children
  for (const [childId, parentId] of parentOf) {
    const child = canonical.get(childId);
    const parent = groups.get(parentId);
    if (!child || !parent) continue;

    // Display name = part after the parent's name
    const displayName = child.nombre_comercial.slice(parent.nombre_comercial.length).trim().replace(/^[,\-\s]+/, "").trim() || child.nombre_comercial;

    parent.sucursales.push({
      id: child.id,
      nombre_comercial: child.nombre_comercial,
      display_name: displayName,
    });
  }

  // ── Step 5: Filter by query ──────────────────────────────────────────────
  if (q.length === 0) {
    return [...groups.values()].sort((a, b) => a.nombre_comercial.localeCompare(b.nombre_comercial));
  }

  const filtered = [...groups.values()].filter((g) => {
    const nameMatch = g.nombre_comercial.toLowerCase().includes(q);
    const childMatch = g.sucursales.some((s) => s.nombre_comercial.toLowerCase().includes(q));
    return nameMatch || childMatch;
  });

  return filtered.sort((a, b) => a.nombre_comercial.localeCompare(b.nombre_comercial));
}

// ── POST /api/clients/create ──────────────────────────────────────────────────
// Creates a new client and notifies gerente_operaciones + admin users by email.

function buildNuevoClienteEmail(d: { nombreCliente: string; creadoPor: string; fechaHora: string }): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);max-width:600px;width:100%;">
        <tr>
          <td style="background:#1A252F;padding:28px 32px;">
            <div style="display:inline-block;background:#1D9E75;color:#FFFFFF;font-size:11px;font-weight:700;letter-spacing:0.6px;padding:4px 10px;border-radius:4px;text-transform:uppercase;margin-bottom:12px;">🆕 Nuevo Cliente</div>
            <div style="color:#FFFFFF;font-size:22px;font-weight:700;margin:0;line-height:1.3;">${d.nombreCliente}</div>
            <div style="color:#8696A0;font-size:13px;margin-top:6px;">Registrado durante visita técnica</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.65;">
              Este cliente fue registrado durante una visita técnica. Por favor complete la información fiscal y comercial en el sistema.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
              <tr style="background:#F9FAFB;">
                <td style="padding:10px 16px;font-size:12px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;width:150px;">Cliente</td>
                <td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:700;">${d.nombreCliente}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;font-size:12px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;border-top:1px solid #E5E7EB;">Creado por</td>
                <td style="padding:10px 16px;font-size:14px;color:#111827;border-top:1px solid #E5E7EB;">${d.creadoPor}</td>
              </tr>
              <tr style="background:#F9FAFB;">
                <td style="padding:10px 16px;font-size:12px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;border-top:1px solid #E5E7EB;">Fecha y hora</td>
                <td style="padding:10px 16px;font-size:14px;color:#111827;border-top:1px solid #E5E7EB;">${d.fechaHora}</td>
              </tr>
            </table>
            <div style="margin:28px 0;text-align:center;">
              <a href="https://tech-report-bot.replit.app/dashboard/operaciones"
                 style="display:inline-block;background:#CC0000;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none;padding:13px 32px;border-radius:6px;letter-spacing:0.3px;">
                Ver cliente en el sistema →
              </a>
            </div>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8E1;border:1.5px solid #F59E0B;border-radius:8px;">
              <tr>
                <td style="padding:14px 18px;">
                  <div style="font-size:12px;font-weight:700;color:#92400E;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">⚠ Información pendiente</div>
                  <div style="font-size:13px;color:#78350F;line-height:1.65;">
                    El área comercial deberá completar: <strong>NIT, registro fiscal, correo electrónico, dirección y datos de facturación.</strong>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #E5E7EB;text-align:center;">
            <span style="font-size:11px;color:#9CA3AF;">TAS Seguridad · Sistema de Reportes Técnicos</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

router.post("/clients/create", async (req: Request, res: Response) => {
  const { nombre_comercial, creado_por } = req.body as { nombre_comercial?: string; creado_por?: string };

  if (!nombre_comercial?.trim()) {
    res.status(400).json({ error: "nombre_comercial requerido" });
    return;
  }

  let supabase;
  let supabaseAdmin;
  try {
    supabase = getSupabase();
    supabaseAdmin = getSupabaseAdmin();
  } catch (err) {
    res.status(500).json({ error: String(err) });
    return;
  }

  try {
    const insertData: Record<string, unknown> = { nombre_comercial: nombre_comercial.trim() };
    if (creado_por?.trim()) insertData["creado_por"] = creado_por.trim();

    const { data, error } = await supabase
      .from("clientes")
      .insert(insertData)
      .select("id, nombre_comercial")
      .single();

    if (error) throw error;

    const cliente = data as { id: string; nombre_comercial: string };

    res.json({ success: true, cliente });

    try {
      const { data: recipients } = await supabaseAdmin
        .from("usuarios")
        .select("nombre, correo")
        .in("rol", ["gerente_operaciones", "admin"])
        .not("correo", "is", null)
        .neq("correo", "");

      const users = (recipients ?? []) as Array<{ nombre: string; correo: string }>;
      const emails = users.map((u) => u.correo).filter(Boolean);

      if (emails.length > 0) {
        const fechaHora = new Date().toLocaleString("es-SV", {
          day: "2-digit", month: "long", year: "numeric",
          hour: "2-digit", minute: "2-digit",
          timeZone: "America/El_Salvador",
        });

        const testLabel = users.map((u) => `${u.nombre}\nCorreo: ${u.correo}`).join("\n\n");

        const html = buildNuevoClienteEmail({
          nombreCliente: cliente.nombre_comercial,
          creadoPor: creado_por?.trim() || "Técnico",
          fechaHora,
        });

        await sendEmail({
          from: "TAS Reportes <onboarding@resend.dev>",
          to: emails,
          subject: `🆕 Nuevo cliente registrado — ${cliente.nombre_comercial}`,
          html,
          testLabel,
        }, req.log);
      }
    } catch (emailErr) {
      req.log.warn({ emailErr }, "[clients/create] email notification failed (non-fatal)");
    }
  } catch (err) {
    req.log.error({ err }, "[clients/create] failed");
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /clients/search?q=texto ───────────────────────────────────────────────
// When a query is provided, filters server-side via ILIKE so large client
// databases are fully searchable (not limited to the first 200 alphabetically).
// For empty query, returns the first 60 clients as a quick-browse list.

router.get("/clients/search", async (req: Request, res: Response) => {
  const q = ((req.query["q"] as string) ?? "").trim();

  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    let query = supabase
      .from("clientes")
      .select("id, nombre_comercial, es_sucursal, cliente_padre_id, sucursal")
      .order("nombre_comercial", { ascending: true });

    if (q.length > 0) {
      // Server-side filter: match name OR sucursal field
      query = query.ilike("nombre_comercial", `%${q}%`).limit(100);
    } else {
      // Empty query: return first 60 as a quick-browse list
      query = query.limit(60);
    }

    const { data, error } = await query;
    if (error) throw error;

    // For queries with results, also fetch potential parent clients that weren't
    // matched but are needed to correctly build the hierarchy.
    let rows = (data ?? []) as RawClient[];

    if (q.length > 0 && rows.length > 0) {
      const parentIds = rows
        .filter((r) => r.es_sucursal && r.cliente_padre_id)
        .map((r) => r.cliente_padre_id as string)
        .filter((id) => !rows.some((r) => r.id === id));

      if (parentIds.length > 0) {
        const { data: parents } = await supabase
          .from("clientes")
          .select("id, nombre_comercial, es_sucursal, cliente_padre_id, sucursal")
          .in("id", parentIds);
        if (parents) rows = [...rows, ...(parents as RawClient[])];
      }
    }

    const result = buildGroups(rows, q);
    res.json({ clients: result });
  } catch (err) {
    req.log.error({ err }, "[clients/search] failed");
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /client-history ──────────────────────────────────────────────────────

router.post("/client-history", async (req: Request, res: Response) => {
  const body = req.body as { cliente_id?: string; cliente_padre_id?: string };
  const clienteId = body.cliente_id ?? body.cliente_padre_id;

  if (!clienteId) {
    res.status(400).json({ error: "cliente_id or cliente_padre_id is required" });
    return;
  }

  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    // Also include any known sucursales
    let targetIds: string[] = [clienteId];
    const { data: sucursales } = await supabase
      .from("clientes")
      .select("id")
      .eq("cliente_padre_id", clienteId);

    if (sucursales && sucursales.length > 0) {
      targetIds = [clienteId, ...sucursales.map((s: { id: string }) => s.id)];
    }

    const { data: reports, error } = await supabase
      .from("reportes")
      .select("id, created_at, tecnico_nombre, trabajo_realizado, observaciones, clientes(nombre_comercial)")
      .in("cliente_id", targetIds)
      .order("created_at", { ascending: false })
      .limit(3);

    if (error) throw error;

    const { data: clientData } = await supabase
      .from("clientes")
      .select("nombre_comercial")
      .eq("id", clienteId)
      .single();

    const clienteName = (clientData as { nombre_comercial?: string } | null)?.nombre_comercial ?? "Cliente";

    if (!reports || reports.length === 0) {
      res.json({ summary: `No se encontraron visitas anteriores para ${clienteName}.` });
      return;
    }

    const anthropic = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] });

    const reportLines = (reports as Array<{
      created_at: string;
      tecnico_nombre?: string | null;
      trabajo_realizado?: string | null;
      observaciones?: string | null;
    }>).map((r) => {
      const fecha = new Date(r.created_at).toLocaleDateString("es-SV", {
        day: "2-digit", month: "long", year: "numeric",
      });
      const tecnico = r.tecnico_nombre ?? "Técnico desconocido";
      const trabajo = r.trabajo_realizado ?? "Sin descripción";
      const obs = r.observaciones && r.observaciones.trim().toLowerCase() !== "ninguno" ? ` ${r.observaciones}` : "";
      return `${fecha} — ${tecnico}\n${trabajo}.${obs}`;
    }).join("\n\n");

    const prompt = `Eres el asistente de TAS Seguridad. Genera un resumen de historial de visitas para el técnico de campo. Usa exactamente este formato:

"📋 ${clienteName} — Historial de servicios

${reportLines}"

No agregues texto adicional, no cambies el formato, solo devuelve el texto tal como aparece arriba con los datos reales del cliente.`;

    const aiRes = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const summary = (aiRes.content[0] as { type: string; text?: string }).text?.trim() ?? reportLines;
    res.json({ summary });
  } catch (err) {
    req.log.error({ err }, "[client-history] failed");
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/clientes/llamadas?cliente_id=xxx ──────────────────────────────────
// Returns unique SAP call numbers for a client (including sucursales).

router.get("/clientes/llamadas", async (req: Request, res: Response) => {
  const clienteId = (req.query["cliente_id"] as string | undefined)?.trim();
  if (!clienteId) { res.status(400).json({ error: "cliente_id requerido" }); return; }

  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    const { data: sucursales } = await supabase
      .from("clientes").select("id").eq("cliente_padre_id", clienteId);
    const targetIds = [clienteId, ...(sucursales ?? []).map((s: { id: string }) => s.id)];

    const { data, error } = await supabase
      .from("reportes")
      .select("numero_llamada")
      .in("cliente_id", targetIds)
      .not("numero_llamada", "is", null)
      .neq("numero_llamada", "")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    const all = (data ?? []).map((r: { numero_llamada: string | null }) => r.numero_llamada).filter(Boolean) as string[];
    const filtered = all.filter((n) => n.trim() !== "" && n.trim().toLowerCase() !== "sin número" && n.trim().toLowerCase() !== "sin numero");
    const unique = [...new Set(filtered)].slice(0, 30);
    res.json({ llamadas: unique });
  } catch (err) {
    req.log.error({ err }, "[clientes/llamadas] failed");
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/search?q=&tipo=auto|llamada|boleta|cliente&supervisor_id= ──────────

router.get("/search", async (req: Request, res: Response) => {
  const q = ((req.query["q"] as string) ?? "").trim();
  const tipo = ((req.query["tipo"] as string) ?? "auto") as "auto" | "llamada" | "boleta" | "cliente";
  const supervisorId = ((req.query["supervisor_id"] as string) ?? "").trim() || null;

  if (q.length < 1 || (q.length < 2 && !/^\d+$/.test(q))) {
    res.json({ tipo_detectado: "texto", clientes: [], llamadas: [], boletas: [] });
    return;
  }

  let supabase;
  try { supabase = getSupabase(); } catch (err) { res.status(500).json({ error: String(err) }); return; }

  try {
    const isNumeric = /^\d+$/.test(q);
    const tipoDetectado: "numero" | "texto" = isNumeric ? "numero" : "texto";

    const fetchClientes = tipo === "auto" ? !isNumeric : tipo === "cliente";
    const fetchLlamadas = tipo === "auto" ? isNumeric : tipo === "llamada";
    const fetchBoletas  = tipo === "auto" ? isNumeric : tipo === "boleta";

    // ── Parallel queries ───────────────────────────────────────────────────────
    const [clientesRes, llamadasRes, boletasRes] = await Promise.all([

      fetchClientes
        ? supabase.from("clientes").select("id, nombre_comercial").ilike("nombre_comercial", `%${q}%`).limit(8)
        : Promise.resolve({ data: null as unknown, error: null }),

      fetchLlamadas
        ? (() => {
            let qry = supabase
              .from("reportes")
              .select("numero_llamada, clientes!inner(nombre_comercial)")
              .ilike("numero_llamada", `%${q}%`)
              .not("numero_llamada", "is", null)
              .limit(60);
            if (supervisorId) qry = qry.eq("supervisor_id", supervisorId);
            return qry;
          })()
        : Promise.resolve({ data: null as unknown, error: null }),

      fetchBoletas && !Number.isNaN(parseInt(q, 10))
        ? (() => {
            let qry = supabase
              .from("reportes")
              .select("id, numero_reporte, created_at, estado_revision, tecnico_nombre, tipo_servicio, trabajo_realizado, numero_llamada, hora_entrada, hora_salida, estado_servicio, observaciones, placa_vehiculo, equipos_instalados, clientes!inner(nombre_comercial)")
              .eq("numero_reporte", parseInt(q, 10))
              .limit(5);
            if (supervisorId) qry = qry.eq("supervisor_id", supervisorId);
            return qry;
          })()
        : Promise.resolve({ data: null as unknown, error: null }),
    ]);

    // ── Process clientes ────────────────────────────────────────────────────────
    const clientes = fetchClientes
      ? ((clientesRes.data ?? []) as Array<{ id: string; nombre_comercial: string }>)
          .map((c) => ({ id: c.id, nombre_comercial: c.nombre_comercial }))
      : [];

    // ── Process llamadas (group by numero_llamada) ─────────────────────────────
    const llamadasMap: Record<string, { count: number; clientes: Set<string> }> = {};
    if (fetchLlamadas && llamadasRes.data) {
      for (const r of llamadasRes.data as Array<{ numero_llamada: string; clientes: { nombre_comercial: string } }>) {
        const n = r.numero_llamada?.trim();
        if (!n) continue;
        if (!llamadasMap[n]) llamadasMap[n] = { count: 0, clientes: new Set() };
        llamadasMap[n].count++;
        if (r.clientes?.nombre_comercial) llamadasMap[n].clientes.add(r.clientes.nombre_comercial);
      }
    }
    const llamadas = Object.entries(llamadasMap)
      .map(([numero, v]) => ({ numero, boletas_count: v.count, clientes: [...v.clientes].slice(0, 3) }))
      .sort((a, b) => b.boletas_count - a.boletas_count)
      .slice(0, 8);

    // ── Process boletas ────────────────────────────────────────────────────────
    const boletas = fetchBoletas
      ? ((boletasRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
          id: String(r["id"] ?? ""),
          numero_reporte: (r["numero_reporte"] as number | null) ?? null,
          cliente_nombre: ((r["clientes"] as { nombre_comercial?: string } | null)?.nombre_comercial) ?? "",
          tecnico_nombre: (r["tecnico_nombre"] as string | null) ?? null,
          created_at: (r["created_at"] as string) ?? "",
          estado_revision: (r["estado_revision"] as string) ?? "",
          tipo_servicio: Array.isArray(r["tipo_servicio"])
            ? (r["tipo_servicio"] as string[]).join(", ")
            : ((r["tipo_servicio"] as string | null) ?? null),
          trabajo_realizado: (r["trabajo_realizado"] as string | null) ?? null,
          numero_llamada: (r["numero_llamada"] as string | null) ?? null,
          hora_entrada: (r["hora_entrada"] as string | null) ?? null,
          hora_salida: (r["hora_salida"] as string | null) ?? null,
          estado_servicio: (r["estado_servicio"] as string | null) ?? null,
          observaciones: (r["observaciones"] as string | null) ?? null,
          placa_vehiculo: (r["placa_vehiculo"] as string | null) ?? null,
          equipos_instalados: (r["equipos_instalados"] as string | null) ?? null,
        }))
      : [];

    res.json({ tipo_detectado: tipoDetectado, clientes, llamadas, boletas });
  } catch (err) {
    req.log.error({ err }, "[search] failed");
    res.status(500).json({ error: String(err) });
  }
});

export default router;
