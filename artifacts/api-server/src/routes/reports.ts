import { Router, type IRouter } from "express";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import { sendReportEmails } from "../lib/email";
import { getSupabase, REPORTES_BUCKET } from "../lib/supabase";

const router: IRouter = Router();

interface IncomingPhoto {
  base64DataUrl: string;
}

interface ReporteTecnicoIn {
  nombre: string;
  es_subcontrato?: boolean;
  es_principal?: boolean;
  hora_entrada?: string;
  hora_salida?: string;
  total_horas?: number;
}

interface ReporteRepuestoIn {
  cantidad?: string;
  descripcion: string;
}

interface SaveReportBody {
  cliente_nombre: string;
  tecnico_nombre?: string;
  numero_llamada?: string;
  numero_proyecto?: string;
  tipo_servicio?: string;
  trabajo_realizado?: string;
  hora_entrada?: string;
  hora_salida?: string;
  estado_servicio?: string;
  hay_cotizacion?: boolean;
  descripcion_cotizacion?: string;
  observaciones?: string;
  es_subcontrato?: boolean;
  empresa_subcontrato?: string;
  cantidad_personas_subcontrato?: number | null;
  cantidad_subcontrato?: number | null;
  placa_vehiculo?: string;
  equipos_instalados?: string;
  total_horas_equipo?: number;
  supervisor_id?: string;
  supervisor_nombre?: string;
  tecnicos?: ReporteTecnicoIn[];
  repuestos?: ReporteRepuestoIn[];
  photos?: IncomingPhoto[];
  firma_data_url?: string;
}

function parseDataUrl(
  dataUrl: string,
): { mimeType: string; bytes: Buffer } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const mimeType = m[1] ?? "image/jpeg";
  const bytes = Buffer.from(m[2] ?? "", "base64");
  if (bytes.length === 0) return null;
  return { mimeType, bytes };
}

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("heic")) return "heic";
  return "jpg";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseHoraToFloat(hora: string | null | undefined): number | null {
  if (!hora) return null;
  const m = hora.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1] ?? "0", 10);
  const min = parseInt(m[2] ?? "0", 10);
  return h + min / 60;
}

function calcHours(entrada: string | null | undefined, salida: string | null | undefined): number | null {
  const e = parseHoraToFloat(entrada);
  const s = parseHoraToFloat(salida);
  if (e === null || s === null) return null;
  const diff = s - e;
  return diff > 0 ? Math.round(diff * 100) / 100 : null;
}

/**
 * Check if a newly-provided client name looks like a sucursal of an existing client.
 * Uses case-insensitive prefix matching: "FAO San Miguel" → parent "FAO".
 * Returns parentId + the differentiating suffix (sucursal name).
 */
async function detectParentClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  clienteNombre: string,
  log: { info: (o: unknown, m?: string) => void; warn: (o: unknown, m?: string) => void },
): Promise<{ parentId: string | number | null; sucursalPart: string | null }> {
  try {
    // Fetch all existing parent clients (not sucursales)
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nombre_comercial")
      .or("es_sucursal.is.null,es_sucursal.eq.false");

    if (error || !data) return { parentId: null, sucursalPart: null };

    const candidateLower = clienteNombre.toLowerCase().trim();

    // Sort descending by name length: match the longest parent name first
    // (avoids "FAO" matching when "FAO San Miguel" is also a parent)
    const sorted = (data as Array<{ id: string | number; nombre_comercial: string }>)
      .slice()
      .sort((a, b) => b.nombre_comercial.length - a.nombre_comercial.length);

    for (const c of sorted) {
      const existingLower = (c.nombre_comercial ?? "").toLowerCase().trim();
      // Must be strictly shorter and the candidate must start with it followed by a space
      if (
        existingLower.length < candidateLower.length &&
        existingLower.length >= 2 &&
        candidateLower.startsWith(existingLower + " ")
      ) {
        const sucursalPart = clienteNombre.slice(c.nombre_comercial.length).trim().replace(/^[,\-\s]+/, "").trim();
        log.info({ parent: c.nombre_comercial, sucursalPart }, "[reports] parent client detected");
        return { parentId: c.id, sucursalPart: sucursalPart || null };
      }
    }
  } catch (err) {
    log.warn({ err }, "[reports] detectParentClient failed, continuing");
  }
  return { parentId: null, sucursalPart: null };
}

router.post("/reports", async (req, res) => {
  req.log.info("[SAVE REPORT CALLED]");

  // ── Env check ──────────────────────────────────────────────────────────────
  const supabaseUrl = process.env["SUPABASE_URL"] ?? "";
  const supabaseKey = process.env["SUPABASE_ANON_KEY"] ?? "";
  req.log.info(
    {
      SUPABASE_URL_prefix: supabaseUrl.slice(0, 12) || "(empty)",
      SUPABASE_ANON_KEY_prefix: supabaseKey.slice(0, 12) || "(empty)",
    },
    "[reports] env check",
  );

  // ── Body ───────────────────────────────────────────────────────────────────
  const body = (req.body ?? {}) as Partial<SaveReportBody>;
  req.log.info(
    {
      cliente_nombre: body.cliente_nombre,
      tecnico_nombre: body.tecnico_nombre,
      numero_llamada: body.numero_llamada,
      numero_proyecto: body.numero_proyecto,
      tipo_servicio: body.tipo_servicio,
      trabajo_realizado: (body.trabajo_realizado ?? "").slice(0, 80),
      hora_entrada: body.hora_entrada,
      hora_salida: body.hora_salida,
      estado_servicio: body.estado_servicio,
      hay_cotizacion: body.hay_cotizacion,
      es_subcontrato: body.es_subcontrato,
      tecnicosCount: (body.tecnicos ?? []).length,
      repuestosCount: (body.repuestos ?? []).length,
      photosCount: (body.photos ?? []).length,
    },
    "[reports] body received",
  );

  const clienteNombre = (body.cliente_nombre ?? "").trim();
  if (!clienteNombre) {
    res.status(400).json({ error: "cliente_nombre is required" });
    return;
  }

  // ── Supabase client ────────────────────────────────────────────────────────
  let supabase;
  try {
    supabase = getSupabase();
    req.log.info("[reports] Supabase client obtained OK");
  } catch (err) {
    req.log.error({ err }, "[reports] Supabase not configured");
    res.status(500).json({ error: "Supabase no está configurado" });
    return;
  }

  // ── 1) Find or create cliente (with auto parent/branch detection) ──────────
  let clienteId: string | number | null = null;
  try {
    req.log.info({ clienteNombre }, "[reports] looking up cliente");
    // Case-insensitive lookup so "Banco azul" finds "Banco Azul" and doesn't create a duplicate
    const existing = await supabase
      .from("clientes")
      .select("id")
      .ilike("nombre_comercial", clienteNombre.trim())
      .maybeSingle();

    req.log.info(
      { data: existing.data, error: existing.error },
      "[reports] cliente lookup result",
    );

    if (existing.error) throw existing.error;

    if (existing.data?.id !== undefined && existing.data?.id !== null) {
      clienteId = existing.data.id as string | number;
      req.log.info({ clienteId }, "[reports] found existing cliente");
    } else {
      // Auto-detect if this new client should be a sucursal of an existing one
      req.log.info("[reports] cliente not found, checking for parent match");
      const { parentId, sucursalPart } = await detectParentClient(supabase, clienteNombre, req.log);

      const insertPayload: Record<string, unknown> = { nombre_comercial: clienteNombre };
      if (parentId) {
        insertPayload["es_sucursal"] = true;
        insertPayload["cliente_padre_id"] = parentId;
        if (sucursalPart) insertPayload["sucursal"] = sucursalPart;
        req.log.info({ parentId, sucursalPart }, "[reports] linking as sucursal");
      }

      const created = await supabase
        .from("clientes")
        .insert(insertPayload)
        .select("id")
        .single();

      req.log.info(
        { data: created.data, error: created.error },
        "[reports] cliente insert result",
      );

      if (created.error) throw created.error;
      clienteId = created.data.id as string | number;
      req.log.info({ clienteId }, "[reports] new cliente created");
    }
  } catch (err) {
    req.log.error({ err }, "[reports] FAILED find/create cliente");
    res
      .status(500)
      .json({ error: `No se pudo registrar el cliente: ${String(err)}` });
    return;
  }

  // ── 2) Upload photos (best-effort, never blocks save) ─────────────────────
  const fotoUrls: string[] = [];
  const photos = Array.isArray(body.photos) ? body.photos : [];
  req.log.info({ count: photos.length }, "[reports] uploading photos");
  for (const p of photos) {
    const parsed = parseDataUrl(p.base64DataUrl);
    if (!parsed) {
      req.log.warn("[reports] photo skipped — could not parse data URL");
      continue;
    }
    const ext = extFromMime(parsed.mimeType);
    const path = `${new Date().getFullYear()}/${randomUUID()}.${ext}`;
    try {
      const upload = await supabase.storage
        .from(REPORTES_BUCKET)
        .upload(path, parsed.bytes, {
          contentType: parsed.mimeType,
          upsert: false,
        });
      req.log.info(
        { path, uploadError: upload.error },
        "[reports] photo upload result",
      );
      if (upload.error) continue;
      const pub = supabase.storage.from(REPORTES_BUCKET).getPublicUrl(path);
      if (pub.data?.publicUrl) fotoUrls.push(pub.data.publicUrl);
    } catch (err) {
      req.log.warn({ err }, "[reports] photo upload threw");
    }
  }

  // ── 2b) Upload signature SVG (best-effort) ────────────────────────────────
  let firmaClienteUrl: string | null = null;
  if (body.firma_data_url) {
    const parsed = parseDataUrl(body.firma_data_url);
    if (parsed) {
      const path = `firmas/${new Date().getFullYear()}/${randomUUID()}.svg`;
      try {
        const upload = await supabase.storage
          .from(REPORTES_BUCKET)
          .upload(path, parsed.bytes, {
            contentType: parsed.mimeType,
            upsert: false,
          });
        req.log.info(
          { path, uploadError: upload.error },
          "[reports] firma upload result",
        );
        if (!upload.error) {
          const pub = supabase.storage.from(REPORTES_BUCKET).getPublicUrl(path);
          if (pub.data?.publicUrl) firmaClienteUrl = pub.data.publicUrl;
        }
      } catch (err) {
        req.log.warn({ err }, "[reports] firma upload threw");
      }
    } else {
      req.log.warn("[reports] firma skipped — could not parse data URL");
    }
  }

  // ── 3) Insert reporte ──────────────────────────────────────────────────────

  // tipo_servicio arrives as a comma-separated string from the app;
  // the DB column is a Postgres text[] array.
  const tipoServicioArr: string[] | null = (() => {
    const raw = body.tipo_servicio;
    if (!raw) return null;
    if (Array.isArray(raw)) return (raw as string[]).filter(Boolean);
    const parts = String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : null;
  })();

  const reportePayload = {
    cliente_id: clienteId,
    tecnico_nombre: body.tecnico_nombre || null,
    numero_llamada: body.numero_llamada || null,
    numero_proyecto: body.numero_proyecto || null,
    tipo_servicio: tipoServicioArr,
    trabajo_realizado: body.trabajo_realizado || null,
    hora_entrada: body.hora_entrada || null,
    hora_salida: body.hora_salida || null,
    estado_servicio: body.estado_servicio || null,
    hay_cotizacion: body.hay_cotizacion ?? null,
    descripcion_cotizacion: body.descripcion_cotizacion || null,
    observaciones: body.observaciones || null,
    es_subcontrato: body.es_subcontrato ?? null,
    empresa_subcontrato: body.empresa_subcontrato || null,
    cantidad_personas_subcontrato: body.cantidad_personas_subcontrato ?? null,
    cantidad_subcontrato: body.cantidad_subcontrato ?? null,
    placa_vehiculo: body.placa_vehiculo?.trim().toUpperCase() || null,
    equipos_instalados: body.equipos_instalados || null,
    total_horas_equipo: body.total_horas_equipo ?? null,
    supervisor_id: body.supervisor_id || null,
    supervisor_nombre: body.supervisor_nombre || null,
    fotos: fotoUrls,
    firma_cliente_url: firmaClienteUrl,
    estado_revision: "pendiente_revision",
  };
  req.log.info({ reportePayload }, "[reports] inserting reporte");

  let reporteId: string | number | null = null;
  let numeroReporte: string | number | null = null;

  // Self-healing insert: if Supabase says a column doesn't exist (PGRST204),
  // strip it and retry — so the server adapts to the actual DB schema without
  // needing a migration here.
  const currentPayload: Record<string, unknown> = { ...reportePayload };
  const strippedCols: string[] = [];
  let insertOk = false;

  for (let attempt = 0; attempt < 20; attempt++) {
    const insert = await supabase
      .from("reportes")
      .insert(currentPayload)
      .select("id, numero_reporte")
      .single();

    req.log.info(
      {
        attempt,
        data: insert.data,
        error: insert.error,
        keys: Object.keys(currentPayload),
      },
      "[reports] reporte insert attempt",
    );

    if (!insert.error) {
      reporteId = insert.data.id as string | number;
      numeroReporte = (insert.data.numero_reporte ?? insert.data.id) as
        | string
        | number;
      insertOk = true;
      break;
    }

    // PGRST204 = column not found in schema cache → strip it and retry
    if (insert.error.code === "PGRST204") {
      const match = insert.error.message.match(
        /Could not find the '([^']+)' column/,
      );
      const badCol = match?.[1];
      if (badCol && badCol in currentPayload) {
        req.log.warn(
          { badCol },
          "[reports] column not in schema, stripping and retrying",
        );
        delete currentPayload[badCol];
        strippedCols.push(badCol);
        continue;
      }
    }

    // Any other error — fail immediately
    req.log.error({ err: insert.error }, "[reports] FAILED insert reporte");
    res.status(500).json({
      error: `No se pudo guardar el reporte: ${insert.error.message}`,
    });
    return;
  }

  if (!insertOk) {
    req.log.error(
      { strippedCols },
      "[reports] exhausted retries inserting reporte",
    );
    res
      .status(500)
      .json({ error: "No se pudo guardar el reporte: demasiados campos inválidos" });
    return;
  }

  if (strippedCols.length > 0) {
    req.log.warn(
      { strippedCols },
      "[reports] saved with these columns stripped (not in DB schema)",
    );
  }

  // ── 4) Insert tecnicos (best-effort, self-healing) ─────────────────────────
  const tecnicos = Array.isArray(body.tecnicos) ? body.tecnicos : [];
  if (tecnicos.length > 0 && reporteId !== null) {
    const fullRows = tecnicos
      .filter((t) => (t.nombre ?? "").trim().length > 0)
      .map((t) => ({
        reporte_id: reporteId,
        nombre: t.nombre.trim(),
        es_subcontrato: !!t.es_subcontrato,
        es_principal: t.es_principal ?? false,
        hora_entrada: t.hora_entrada || null,
        hora_salida: t.hora_salida || null,
        total_horas: t.total_horas ?? null,
      }));
    if (fullRows.length > 0) {
      const r1 = await supabase.from("reporte_tecnicos").insert(fullRows);
      if (r1.error) {
        req.log.warn({ error: r1.error }, "[reports] reporte_tecnicos full insert failed, retrying minimal");
        const minRows = fullRows.map(({ reporte_id, nombre, es_subcontrato }) => ({ reporte_id, nombre, es_subcontrato }));
        const r2 = await supabase.from("reporte_tecnicos").insert(minRows);
        req.log.info({ error: r2.error }, "[reports] reporte_tecnicos minimal insert result");
      } else {
        req.log.info("[reports] reporte_tecnicos insert ok");
      }
    }
  }

  // ── 5) Insert repuestos (best-effort) ──────────────────────────────────────
  const repuestos = Array.isArray(body.repuestos) ? body.repuestos : [];
  if (repuestos.length > 0 && reporteId !== null) {
    const rows = repuestos
      .filter((r) => (r.descripcion ?? "").trim().length > 0)
      .map((r) => ({
        reporte_id: reporteId,
        cantidad: r.cantidad ?? null,
        descripcion: r.descripcion.trim(),
      }));
    if (rows.length > 0) {
      const r = await supabase.from("reporte_repuestos").insert(rows);
      req.log.info(
        { error: r.error },
        "[reports] reporte_repuestos insert result",
      );
    }
  }

  req.log.info({ reporteId, numeroReporte }, "[reports] SUCCESS");

  // ── 6) Fire-and-forget email notifications ──────────────────────────────────
  // Fetch the client's email and contact name from the DB for the email notification
  let correo_cliente: string | null = null;
  let contacto_cliente: string | null = null;
  if (clienteId) {
    const { data: clienteRow } = await supabase
      .from("clientes")
      .select("correo, persona_contacto")
      .eq("id", clienteId)
      .single();
    if (clienteRow) {
      const cr = clienteRow as { correo?: string | null; persona_contacto?: string | null };
      correo_cliente = cr.correo?.trim() || null;
      contacto_cliente = cr.persona_contacto?.trim() || null;
    }
  }
  // Manual email typed by technician in the boleta form (kept separate for routing logic)
  const correoClienteManual = (body as { correo_cliente?: string }).correo_cliente?.trim() || null;

  void sendReportEmails(
    {
      numero_reporte: numeroReporte!,
      cliente_nombre: clienteNombre,
      correo_cliente,           // from clientes table
      correo_cliente_manual: correoClienteManual,  // typed by technician
      contacto_cliente,
      tecnico_nombre: body.tecnico_nombre,
      numero_llamada: body.numero_llamada,
      numero_proyecto: body.numero_proyecto,
      tipo_servicio: body.tipo_servicio,
      trabajo_realizado: body.trabajo_realizado,
      hora_entrada: body.hora_entrada,
      hora_salida: body.hora_salida,
      estado_servicio: body.estado_servicio,
      hay_cotizacion: body.hay_cotizacion,
      descripcion_cotizacion: body.descripcion_cotizacion,
      observaciones: body.observaciones,
      es_subcontrato: body.es_subcontrato,
      tecnicos: body.tecnicos,
      repuestos: body.repuestos,
    },
    {
      info: (msg: string) => req.log.info(msg),
      warn: (msg: string) => req.log.warn(msg),
      error: (msg: string) => req.log.error(msg),
    },
    { reporteId, supabase },
  );

  res.json({
    ok: true,
    reporte_id: reporteId,
    numero_reporte: numeroReporte,
    cliente_id: clienteId,
    fotos: fotoUrls,
  });
});

// ---------------------------------------------------------------------------
// GET /reports/by-call?numero=XXXX
// ---------------------------------------------------------------------------

router.get("/reports/by-call", async (req, res) => {
  const numero = ((req.query["numero"] as string) ?? "").trim();
  if (!numero) {
    res.status(400).json({ error: "numero is required" });
    return;
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    res.status(500).json({ error: String(err) });
    return;
  }

  try {
    // Fetch all reportes with this numero_llamada.
    // Self-healing: strip columns that don't exist yet (code 42703) and retry.
    const OPTIONAL_COLS = ["placa_vehiculo", "es_subcontrato", "empresa_subcontrato", "cantidad_personas_subcontrato", "cantidad_subcontrato", "firma_cliente_url"];
    let activeOptional = [...OPTIONAL_COLS];

    const buildQ = () => {
      const fields = [
        "id", "numero_reporte", "created_at", "tecnico_nombre",
        "numero_proyecto", "tipo_servicio", "trabajo_realizado",
        "hora_entrada", "hora_salida", "estado_servicio",
        "hay_cotizacion", "descripcion_cotizacion", "observaciones",
        "fotos", "clientes!inner(nombre_comercial)",
        ...activeOptional,
      ].join(", ");
      return supabase
        .from("reportes")
        .select(fields)
        .eq("numero_llamada", numero)
        .order("created_at", { ascending: true });
    };

    let queryResult = await buildQ();
    for (let attempt = 0; attempt < 10 && queryResult.error; attempt++) {
      const code = (queryResult.error as { code?: string }).code;
      if (code !== "42703") break;
      const match = queryResult.error.message.match(/column (?:reportes\.)?(\w+) does not exist/);
      const badCol = match?.[1];
      if (badCol && activeOptional.includes(badCol)) {
        activeOptional = activeOptional.filter((c) => c !== badCol);
        queryResult = await buildQ();
      } else {
        break;
      }
    }
    const { data, error } = queryResult;
    if (error) throw error;

    // Also query subcontract projects with this numero_llamada (run in parallel with boleta processing)
    const subProyectosPromise = supabase
      .from("subcontratos_proyectos")
      .select("id, nombre, cliente_nombre, empresa_id, supervisor_nombre, fecha_inicio, fecha_fin_estimada, dias_maximos, dias_utilizados, estado, numero_llamada")
      .eq("numero_llamada", numero);

    if (!data || data.length === 0) {
      // Check if there are any subcontract projects before returning 404
      const { data: subCheck } = await subProyectosPromise;
      if (!subCheck || subCheck.length === 0) {
        res.status(404).json({ error: `No se encontraron reportes para la llamada SAP ${numero}` });
        return;
      }
    }

    // Fetch tecnicos and repuestos for these reportes
    const reporteIds = (data as Array<{ id: unknown }>).map((r) => r.id);
    const [tecnicosQ, repuestosQ] = await Promise.all([
      supabase
        .from("reporte_tecnicos")
        .select("reporte_id, nombre, es_subcontrato")
        .in("reporte_id", reporteIds),
      supabase
        .from("reporte_repuestos")
        .select("reporte_id, cantidad, descripcion")
        .in("reporte_id", reporteIds),
    ]);

    const tecnicosByReporte = new Map<string, Array<{ nombre: string; es_subcontrato: boolean }>>();
    for (const t of tecnicosQ.data ?? []) {
      const rid = String((t as { reporte_id: unknown }).reporte_id);
      const list = tecnicosByReporte.get(rid) ?? [];
      list.push({ nombre: String((t as { nombre: unknown }).nombre), es_subcontrato: !!(t as { es_subcontrato: unknown }).es_subcontrato });
      tecnicosByReporte.set(rid, list);
    }

    const repuestosByReporte = new Map<string, Array<{ cantidad: string | null; descripcion: string }>>();
    for (const r of repuestosQ.data ?? []) {
      const rid = String((r as { reporte_id: unknown }).reporte_id);
      const list = repuestosByReporte.get(rid) ?? [];
      list.push({
        cantidad: ((r as { cantidad?: string | null }).cantidad) ?? null,
        descripcion: String((r as { descripcion: unknown }).descripcion),
      });
      repuestosByReporte.set(rid, list);
    }

    // Build boletas
    const rows = data as Array<Record<string, unknown>>;
    const boletas = rows.map((r) => {
      const rid = String(r["id"]);
      const cliente = (r["clientes"] as { nombre_comercial?: string } | null);
      const tipo = Array.isArray(r["tipo_servicio"])
        ? (r["tipo_servicio"] as string[]).join(", ")
        : ((r["tipo_servicio"] as string | null) ?? null);
      const horas = calcHours(r["hora_entrada"] as string | null, r["hora_salida"] as string | null);
      return {
        id: rid,
        numero_reporte: r["numero_reporte"] ?? null,
        created_at: r["created_at"] ?? null,
        tecnico_nombre: r["tecnico_nombre"] ?? null,
        cliente_nombre: cliente?.nombre_comercial ?? "",
        numero_proyecto: r["numero_proyecto"] ?? null,
        tipo_servicio: tipo,
        trabajo_realizado: r["trabajo_realizado"] ?? null,
        hora_entrada: r["hora_entrada"] ?? null,
        hora_salida: r["hora_salida"] ?? null,
        horas_trabajadas: horas,
        estado_servicio: r["estado_servicio"] ?? null,
        hay_cotizacion: r["hay_cotizacion"] ?? null,
        descripcion_cotizacion: r["descripcion_cotizacion"] ?? null,
        observaciones: r["observaciones"] ?? null,
        placa_vehiculo: (r["placa_vehiculo"] as string | null) ?? null,
        es_subcontrato: r["es_subcontrato"] ?? null,
        empresa_subcontrato: r["empresa_subcontrato"] ?? null,
        cantidad_personas_subcontrato: r["cantidad_personas_subcontrato"] ?? null,
        fotos: Array.isArray(r["fotos"]) ? r["fotos"] as string[] : [],
        firma_cliente_url: (r["firma_cliente_url"] as string | null) ?? null,
        tecnicos: tecnicosByReporte.get(rid) ?? [],
        repuestos: repuestosByReporte.get(rid) ?? [],
      };
    });

    // ── Fetch subcontract projects for this call number ──────────────────────
    const { data: subProyectosRaw } = await subProyectosPromise;
    const subProyectosBase = (subProyectosRaw ?? []) as Array<Record<string, unknown>>;

    let subcontrato_proyectos: unknown[] = [];
    if (subProyectosBase.length > 0) {
      const subIds = subProyectosBase.map((p) => String(p["id"]));

      // Fetch all empresas for the found projects
      const empresaIds = [...new Set(subProyectosBase.map((p) => p["empresa_id"]).filter(Boolean) as string[])];
      const [empresasRes, subActividadesRes, subReportesRes, subFotosRes] = await Promise.all([
        empresaIds.length > 0
          ? supabase.from("subcontratos_empresas").select("id, nombre").in("id", empresaIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from("subcontratos_actividades").select("*").in("proyecto_id", subIds).order("orden"),
        supabase
          .from("subcontratos_reportes")
          .select("id, proyecto_id, fecha, actividad_id, actividad_nombre, descripcion, descripcion_trabajo, porcentaje_avance, estado, tecnicos_presentes, cantidad_tecnicos, foto_checkin_url, foto_checkout_url, created_at")
          .in("proyecto_id", subIds)
          .order("fecha", { ascending: true }),
        supabase.from("subcontratos_fotos").select("id, reporte_id, url, tipo"),
      ]);

      const empresaMap = new Map<string, string>();
      for (const e of (empresasRes.data ?? []) as Array<{ id: string; nombre: string }>) {
        empresaMap.set(e.id, e.nombre);
      }

      const actividadesByProject = new Map<string, unknown[]>();
      for (const a of (subActividadesRes.data ?? [])) {
        const pid = String((a as Record<string, unknown>)["proyecto_id"]);
        if (!actividadesByProject.has(pid)) actividadesByProject.set(pid, []);
        actividadesByProject.get(pid)!.push(a);
      }

      const reportesByProject = new Map<string, unknown[]>();
      for (const r of (subReportesRes.data ?? [])) {
        const pid = String((r as Record<string, unknown>)["proyecto_id"]);
        if (!reportesByProject.has(pid)) reportesByProject.set(pid, []);
        reportesByProject.get(pid)!.push(r);
      }

      const fotosByReporte = new Map<string, unknown[]>();
      for (const f of (subFotosRes.data ?? [])) {
        const rid = String((f as Record<string, unknown>)["reporte_id"]);
        if (!fotosByReporte.has(rid)) fotosByReporte.set(rid, []);
        fotosByReporte.get(rid)!.push(f);
      }

      subcontrato_proyectos = subProyectosBase.map((p) => {
        const pid = String(p["id"]);
        const reportes = (reportesByProject.get(pid) ?? []) as Array<Record<string, unknown>>;
        return {
          id: pid,
          nombre: p["nombre"] ?? null,
          cliente_nombre: p["cliente_nombre"] ?? null,
          empresa_nombre: empresaMap.get(String(p["empresa_id"] ?? "")) ?? "—",
          supervisor_nombre: p["supervisor_nombre"] ?? null,
          fecha_inicio: p["fecha_inicio"] ?? null,
          fecha_fin_estimada: p["fecha_fin_estimada"] ?? null,
          dias_maximos: p["dias_maximos"] ?? 0,
          dias_utilizados: p["dias_utilizados"] ?? 0,
          estado: p["estado"] ?? null,
          actividades: actividadesByProject.get(pid) ?? [],
          reportes: reportes.map((r) => ({
            ...r,
            fotos: fotosByReporte.get(String(r["id"])) ?? [],
          })),
        };
      });
    }

    // ── Summary ────────────────────────────────────────────────────────────────
    const fechas = boletas.map((b) => b.created_at?.slice(0, 10)).filter(Boolean) as string[];
    const totalHoras = boletas.reduce((acc, b) => acc + (b.horas_trabajadas ?? 0), 0);
    const tecnicosSet = new Set<string>();
    for (const b of boletas) {
      if (b.tecnico_nombre) tecnicosSet.add(b.tecnico_nombre);
      for (const t of b.tecnicos) tecnicosSet.add(t.nombre);
    }
    const todosRepuestosSet = new Set<string>();
    for (const b of boletas) {
      for (const rp of b.repuestos) {
        const label = rp.cantidad ? `${rp.cantidad} x ${rp.descripcion}` : rp.descripcion;
        todosRepuestosSet.add(label);
      }
    }

    res.json({
      numero_llamada: numero,
      boletas,
      total_boletas: boletas.length,
      fecha_primera: fechas.length > 0 ? fechas[0] : null,
      fecha_ultima: fechas.length > 0 ? fechas[fechas.length - 1] : null,
      total_horas: Math.round(totalHoras * 100) / 100,
      tecnicos_involucrados: Array.from(tecnicosSet).sort(),
      todos_repuestos: Array.from(todosRepuestosSet),
      subcontrato_proyectos,
    });
  } catch (err) {
    req.log.error({ err }, "[reports/by-call] query failed");
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
