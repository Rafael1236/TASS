import { Router, type Request, type Response } from "express";
import { getSupabase, getSupabaseAdmin } from "../lib/supabase";
import { Buffer } from "node:buffer";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

// ── MODULE 1: Gestión de Subcontratos ────────────────────────────────────────

// GET /api/gestion/subcontratos/empresas
router.get("/gestion/subcontratos/empresas", async (req: Request, res: Response) => {
  const supabase = getSupabase();
  try {
    const [empresasRes, tecnicosRes] = await Promise.all([
      supabase.from("subcontratos_empresas").select("*").order("nombre"),
      supabase.from("subcontratos_tecnicos").select("empresa_id, activo, fecha_vencimiento_examenes"),
    ]);

    if (empresasRes.error) throw empresasRes.error;

    const hoy = new Date();
    const en30 = new Date(hoy); en30.setDate(hoy.getDate() + 30);
    const en60 = new Date(hoy); en60.setDate(hoy.getDate() + 60);

    const tecnicos = (tecnicosRes.data ?? []) as Array<{
      empresa_id: string | null;
      activo: boolean;
      fecha_vencimiento_examenes: string | null;
    }>;

    const countsByEmpresa = new Map<string, { critico: number; proximo: number; total: number }>();
    for (const t of tecnicos) {
      if (!t.empresa_id) continue;
      const entry = countsByEmpresa.get(t.empresa_id) ?? { critico: 0, proximo: 0, total: 0 };
      if (t.activo) {
        entry.total++;
        if (t.fecha_vencimiento_examenes) {
          const venc = new Date(t.fecha_vencimiento_examenes);
          if (venc <= en30) entry.critico++;
          else if (venc <= en60) entry.proximo++;
        }
      }
      countsByEmpresa.set(t.empresa_id, entry);
    }

    const empresas = (empresasRes.data ?? []).map((e: Record<string, unknown>) => ({
      ...e,
      // DB column is "lider"; expose as "lider_empresa" for frontend compatibility
      lider_empresa: e["lider"] ?? null,
      alertas: countsByEmpresa.get(e["id"] as string) ?? { critico: 0, proximo: 0, total: 0 },
    }));

    res.json({ success: true, empresas });
  } catch (err) {
    req.log.error({ err }, "[gestion/subcontratos/empresas] error");
    res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /api/gestion/subcontratos/empresas
router.post("/gestion/subcontratos/empresas", async (req: Request, res: Response) => {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { nombre, lider_empresa, telefono, correo, direccion } = req.body as Record<string, unknown>;
    if (!nombre || String(nombre).trim() === "") {
      res.status(400).json({ success: false, error: "Nombre de empresa requerido" });
      return;
    }
    const insert: Record<string, unknown> = {
      nombre: String(nombre).trim(),
      activo: true,
    };
    if (lider_empresa) insert["lider"] = String(lider_empresa).trim();
    if (telefono) insert["telefono"] = String(telefono).trim();
    if (correo) insert["correo"] = String(correo).trim();
    if (direccion) insert["direccion"] = String(direccion).trim();

    const { data, error } = await supabaseAdmin
      .from("subcontratos_empresas")
      .insert(insert)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, empresa: data });
  } catch (err) {
    req.log.error({ err }, "[gestion/subcontratos/empresas POST] error");
    res.status(500).json({ success: false, error: String(err) });
  }
});

// PUT /api/gestion/subcontratos/empresas/:id
router.put("/gestion/subcontratos/empresas/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { nombre, contacto, telefono, correo, lider_empresa, lider_usuario_id, direccion } = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (nombre !== undefined) update["nombre"] = nombre;
    if (contacto !== undefined) update["contacto"] = contacto;
    if (telefono !== undefined) update["telefono"] = telefono;
    if (correo !== undefined) update["correo"] = correo;
    if (lider_empresa !== undefined) update["lider"] = lider_empresa;
    if (lider_usuario_id !== undefined) update["lider_usuario_id"] = lider_usuario_id || null;
    if (direccion !== undefined) update["direccion"] = direccion;

    const { data, error } = await supabaseAdmin
      .from("subcontratos_empresas")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, empresa: data });
  } catch (err) {
    req.log.error({ err }, "[gestion/subcontratos/empresas/:id] error");
    res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /api/gestion/subcontratos/usuarios?empresa_id=
router.get("/gestion/subcontratos/usuarios", async (req: Request, res: Response) => {
  const supabase = getSupabase();
  try {
    const empresaId = req.query["empresa_id"] as string | undefined;
    let query = supabase.from("subcontratos_usuarios").select("id, nombre, usuario, correo, empresa_id, activo").order("nombre");
    if (empresaId) query = query.eq("empresa_id", empresaId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, usuarios: data ?? [] });
  } catch (err) {
    req.log.error({ err }, "[gestion/subcontratos/usuarios] error");
    res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /api/gestion/subcontratos/usuarios
router.post("/gestion/subcontratos/usuarios", async (req: Request, res: Response) => {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { nombre, usuario, correo, empresa_id, password } = req.body as Record<string, unknown>;
    if (!nombre || !usuario || !empresa_id) {
      res.status(400).json({ success: false, error: "Nombre, usuario y empresa son requeridos" });
      return;
    }
    const { data, error } = await supabaseAdmin
      .from("subcontratos_usuarios")
      .insert({
        nombre: String(nombre).trim(),
        usuario: String(usuario).trim().toLowerCase(),
        correo: correo ? String(correo).trim() : null,
        empresa_id,
        password: password ? String(password) : "TAS2026!",
        activo: true,
      })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        res.status(409).json({ success: false, error: "El nombre de usuario ya existe" });
      } else {
        throw error;
      }
      return;
    }
    res.json({ success: true, usuario: data });
  } catch (err) {
    req.log.error({ err }, "[gestion/subcontratos/usuarios POST] error");
    res.status(500).json({ success: false, error: String(err) });
  }
});

// PUT /api/gestion/subcontratos/usuarios/:id
router.put("/gestion/subcontratos/usuarios/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { nombre, usuario, correo, activo } = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (nombre !== undefined) update["nombre"] = String(nombre).trim();
    if (usuario !== undefined) update["usuario"] = String(usuario).trim().toLowerCase();
    if (correo !== undefined) update["correo"] = correo ? String(correo).trim() : null;
    if (activo !== undefined) update["activo"] = activo;

    if (Object.keys(update).length === 0) {
      res.status(400).json({ success: false, error: "Nada que actualizar" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("subcontratos_usuarios")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        res.status(409).json({ success: false, error: "El nombre de usuario ya existe" });
        return;
      }
      throw error;
    }
    res.json({ success: true, usuario: data });
  } catch (err) {
    req.log.error({ err }, "[gestion/subcontratos/usuarios/:id] put error");
    res.status(500).json({ success: false, error: String(err) });
  }
});

// PUT /api/gestion/subcontratos/usuarios/:id/password
router.put("/gestion/subcontratos/usuarios/:id/password", async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { password } = req.body as Record<string, unknown>;
    if (!password || !String(password).trim()) {
      res.status(400).json({ success: false, error: "Contraseña requerida" });
      return;
    }
    req.log.info({ id }, "[gestion/subcontratos/usuarios/:id/password] updating password");
    const { error } = await supabaseAdmin
      .from("subcontratos_usuarios")
      .update({ password_hash: String(password) })
      .eq("id", id);
    if (error) {
      req.log.error({ id, error }, "[gestion/subcontratos/usuarios/:id/password] supabase error");
      throw error;
    }
    req.log.info({ id }, "[gestion/subcontratos/usuarios/:id/password] password updated OK");
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "[gestion/subcontratos/usuarios/:id/password] put error");
    res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /api/gestion/subcontratos/tecnicos?empresa_id=
router.get("/gestion/subcontratos/tecnicos", async (req: Request, res: Response) => {
  const empresaId = req.query["empresa_id"] as string | undefined;
  const supabase = getSupabase();
  try {
    let query = supabase
      .from("subcontratos_tecnicos")
      .select("*")
      .order("nombre");
    if (empresaId) query = query.eq("empresa_id", empresaId);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, tecnicos: data ?? [] });
  } catch (err) {
    req.log.error({ err }, "[gestion/subcontratos/tecnicos] error");
    res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /api/gestion/subcontratos/tecnicos
router.post("/gestion/subcontratos/tecnicos", async (req: Request, res: Response) => {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { empresa_id, nombre, dui, telefono, fecha_ingreso, tiene_isss, fecha_vencimiento_examenes, activo } = req.body as Record<string, unknown>;
    if (!nombre || !(nombre as string).trim()) {
      res.status(400).json({ success: false, error: "Nombre requerido" });
      return;
    }
    const insert: Record<string, unknown> = {
      nombre: (nombre as string).trim(),
      activo: activo ?? true,
    };
    if (empresa_id) insert["empresa_id"] = empresa_id;
    if (dui) insert["dui"] = dui;
    if (telefono) insert["telefono"] = telefono;
    if (fecha_ingreso) insert["fecha_ingreso"] = fecha_ingreso;
    if (tiene_isss !== undefined) insert["tiene_isss"] = tiene_isss;
    if (fecha_vencimiento_examenes) insert["fecha_vencimiento_examenes"] = fecha_vencimiento_examenes;

    const { data, error } = await supabaseAdmin
      .from("subcontratos_tecnicos")
      .insert(insert)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, tecnico: data });
  } catch (err) {
    req.log.error({ err }, "[gestion/subcontratos/tecnicos] post error");
    res.status(500).json({ success: false, error: String(err) });
  }
});

// PUT /api/gestion/subcontratos/tecnicos/:id
router.put("/gestion/subcontratos/tecnicos/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { nombre, dui, telefono, fecha_ingreso, tiene_isss, fecha_vencimiento_examenes, activo } = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (nombre !== undefined) update["nombre"] = nombre;
    if (dui !== undefined) update["dui"] = dui;
    if (telefono !== undefined) update["telefono"] = telefono;
    if (fecha_ingreso !== undefined) update["fecha_ingreso"] = fecha_ingreso || null;
    if (tiene_isss !== undefined) update["tiene_isss"] = tiene_isss;
    if (fecha_vencimiento_examenes !== undefined) update["fecha_vencimiento_examenes"] = fecha_vencimiento_examenes || null;
    if (activo !== undefined) update["activo"] = activo;

    const { data, error } = await supabaseAdmin
      .from("subcontratos_tecnicos")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, tecnico: data });
  } catch (err) {
    req.log.error({ err }, "[gestion/subcontratos/tecnicos/:id] put error");
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ── File upload ───────────────────────────────────────────────────────────────

// POST /api/gestion/upload
router.post("/gestion/upload", async (req: Request, res: Response) => {
  const { dataUrl, path, bucket = "documentos-personal" } = req.body as {
    dataUrl?: string; path?: string; bucket?: string;
  };
  if (!dataUrl || !path) {
    res.status(400).json({ success: false, error: "dataUrl y path requeridos" });
    return;
  }
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    res.status(400).json({ success: false, error: "dataUrl inválido" });
    return;
  }
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const ext = extFromMime(parsed.mimeType);
    const fullPath = path.endsWith(`.${ext}`) ? path : `${path}.${ext}`;
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(fullPath, parsed.bytes, { contentType: parsed.mimeType, upsert: true });
    if (error) throw error;
    const { data: urlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(data.path);
    res.json({ success: true, path: data.path, url: urlData.publicUrl });
  } catch (err) {
    req.log.error({ err }, "[gestion/upload] error");
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ── MODULE 2: Gestión de Técnicos TAS ────────────────────────────────────────

// GET /api/gestion/tecnicos-tas?q=&departamento=&rol=
router.get("/gestion/tecnicos-tas", async (req: Request, res: Response) => {
  const q = ((req.query["q"] as string) ?? "").trim();
  const departamento = req.query["departamento"] as string | undefined;
  const rol = req.query["rol"] as string | undefined;
  const supabase = getSupabase();
  try {
    let query = supabase
      .from("usuarios")
      .select("id, nombre, usuario, correo, departamento, rol, activo, dui, telefono, fecha_ingreso, created_at")
      .in("rol", ["tecnico", "supervisor"])
      .order("nombre");
    if (q) query = query.ilike("nombre", `%${q}%`);
    if (departamento) query = query.eq("departamento", departamento);
    if (rol) query = query.eq("rol", rol);

    const { data, error } = await query;
    if (error) {
      // Fallback if extended columns don't exist yet
      const { data: fallback, error: err2 } = await supabase
        .from("usuarios")
        .select("id, nombre, usuario, correo, departamento, rol, activo, created_at")
        .in("rol", ["tecnico", "supervisor"])
        .order("nombre");
      if (err2) throw err2;
      res.json({ success: true, tecnicos: fallback ?? [] });
      return;
    }
    res.json({ success: true, tecnicos: data ?? [] });
  } catch (err) {
    req.log.error({ err }, "[gestion/tecnicos-tas] error");
    res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /api/gestion/tecnicos-tas
router.post("/gestion/tecnicos-tas", async (req: Request, res: Response) => {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { nombre, usuario, correo, password, departamento, rol, dui, telefono, fecha_ingreso, activo } = req.body as Record<string, unknown>;
    if (!nombre || !usuario) {
      res.status(400).json({ success: false, error: "Nombre y usuario requeridos" });
      return;
    }
    const insert: Record<string, unknown> = {
      nombre: (nombre as string).trim(),
      usuario: (usuario as string).trim().toLowerCase(),
      rol: rol ?? "tecnico",
      activo: activo ?? true,
      password_hash: (password as string | undefined) ?? "TAS2026!",
    };
    if (correo) insert["correo"] = correo;
    if (departamento) insert["departamento"] = departamento;
    if (dui) insert["dui"] = dui;
    if (telefono) insert["telefono"] = telefono;
    if (fecha_ingreso) insert["fecha_ingreso"] = fecha_ingreso;

    const { data, error } = await supabaseAdmin
      .from("usuarios")
      .insert(insert)
      .select("id, nombre, usuario, correo, departamento, rol, activo, created_at")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        res.status(409).json({ success: false, error: "El usuario ya existe" });
        return;
      }
      throw error;
    }
    res.json({ success: true, tecnico: data });
  } catch (err) {
    req.log.error({ err }, "[gestion/tecnicos-tas] post error");
    res.status(500).json({ success: false, error: String(err) });
  }
});

// PUT /api/gestion/tecnicos-tas/:id
router.put("/gestion/tecnicos-tas/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { nombre, usuario, correo, password, departamento, rol, dui, telefono, fecha_ingreso, activo } = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (nombre !== undefined) update["nombre"] = nombre;
    if (usuario !== undefined) update["usuario"] = (usuario as string).toLowerCase();
    if (correo !== undefined) update["correo"] = correo;
    if (password) update["password_hash"] = password;
    if (departamento !== undefined) update["departamento"] = departamento;
    if (rol !== undefined) update["rol"] = rol;
    if (dui !== undefined) update["dui"] = dui;
    if (telefono !== undefined) update["telefono"] = telefono;
    if (fecha_ingreso !== undefined) update["fecha_ingreso"] = fecha_ingreso || null;
    if (activo !== undefined) update["activo"] = activo;

    req.log.info(
      { id, fields: Object.keys(update), passwordChanged: !!password },
      "[gestion/tecnicos-tas/:id] updating usuario",
    );

    const { data, error } = await supabaseAdmin
      .from("usuarios")
      .update(update)
      .eq("id", id)
      .select("id, nombre, usuario, correo, departamento, rol, activo, dui, telefono, fecha_ingreso, created_at")
      .single();

    if (error) {
      req.log.error({ id, error }, "[gestion/tecnicos-tas/:id] supabase update error");
      throw error;
    }

    req.log.info({ id, nombre: (data as Record<string, unknown>)?.nombre }, "[gestion/tecnicos-tas/:id] update OK");
    res.json({ success: true, tecnico: data });
  } catch (err) {
    req.log.error({ err }, "[gestion/tecnicos-tas/:id] put error");
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ── MODULE 3: Organizador de Clientes (CRM) ──────────────────────────────────

// GET /api/gestion/clientes?q=
router.get("/gestion/clientes", async (req: Request, res: Response) => {
  const q = ((req.query["q"] as string) ?? "").trim();
  const supabase = getSupabase();

  // Real column names as they exist in Supabase
  const CRM_FIELDS = "id, nombre_comercial, codigo_sn, correo, nit, telefono, direccion, persona_contacto, cargo_contacto, facturar_a_nombre_de, vendedor_asignado, segmento, sitio_web, notas_internas, fecha_ultimo_contacto, registro_fiscal";
  const NULL_CRM: Record<string, null> = {
    codigo_sn: null, correo: null, nit: null, persona_contacto: null,
    cargo_contacto: null, vendedor_asignado: null, segmento: null, telefono: null,
    direccion: null, registro_fiscal: null, facturar_a_nombre_de: null, sitio_web: null,
    notas_internas: null, fecha_ultimo_contacto: null, ultima_visita: null,
  };

  try {
    // ── Tier 1: Full CRM query ────────────────────────────────────────────────
    let mainData: Record<string, unknown>[] | null = null;
    {
      let q1 = supabase.from("clientes").select(CRM_FIELDS).order("nombre_comercial").limit(500);
      if (q) q1 = q1.or(`nombre_comercial.ilike.%${q}%,nit.ilike.%${q}%,correo.ilike.%${q}%,codigo_sn.ilike.%${q}%`);
      const { data: d1, error: e1 } = await q1;
      if (!e1) {
        mainData = (d1 ?? []) as Record<string, unknown>[];
      } else {
        req.log.warn({ msg: e1.message, hint: e1.hint }, "[gestion/clientes] full query failed, using fallback");
      }
    }

    // ── Tier 2: Minimal fallback — only nombre_comercial is guaranteed ────────
    if (!mainData) {
      const { data: fb, error: e2 } = await supabase
        .from("clientes")
        .select("id, nombre_comercial")
        .order("nombre_comercial")
        .limit(500);
      if (e2) throw e2;
      let rows = ((fb ?? []) as Record<string, unknown>[]).map((c) => ({ ...NULL_CRM, ...c }));
      if (q) rows = rows.filter((c) => String(c["nombre_comercial"] ?? "").toLowerCase().includes(q.toLowerCase()));
      res.json({ success: true, clientes: rows, _partial: true });
      return;
    }

    // ── Enrich: ultima_visita from reportes ───────────────────────────────────
    const clienteIds = mainData.map((c) => c["id"] as string);
    const ultimaVisitaMap = new Map<string, string>();
    if (clienteIds.length > 0) {
      const { data: visitas } = await supabase
        .from("reportes")
        .select("cliente_id, created_at")
        .in("cliente_id", clienteIds)
        .order("created_at", { ascending: false })
        .limit(1000);
      for (const v of visitas ?? []) {
        const vid = (v as Record<string, string>)["cliente_id"];
        if (vid && !ultimaVisitaMap.has(vid)) {
          ultimaVisitaMap.set(vid, (v as Record<string, string>)["created_at"]);
        }
      }
    }

    const clientes = mainData.map((c) => ({
      ...c,
      ultima_visita: ultimaVisitaMap.get(c["id"] as string) ?? null,
    }));

    req.log.info({ count: clientes.length }, "[gestion/clientes] fetched OK");
    res.json({ success: true, clientes });
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    req.log.error({ err, msg }, "[gestion/clientes] error");
    res.status(500).json({ success: false, error: msg });
  }
});

// POST /api/gestion/clientes
router.post("/gestion/clientes", async (req: Request, res: Response) => {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const body = req.body as Record<string, unknown>;
    if (!body["nombre_comercial"]) {
      res.status(400).json({ success: false, error: "Nombre comercial requerido" });
      return;
    }
    const fields = ["nombre_comercial", "codigo_sn", "nit", "registro_fiscal", "correo", "telefono", "direccion", "persona_contacto", "cargo_contacto", "facturar_a_nombre_de", "vendedor_asignado", "segmento", "sitio_web", "notas_internas", "fecha_ultimo_contacto"];
    const insert: Record<string, unknown> = {};
    for (const f of fields) {
      if (body[f] !== undefined && body[f] !== "") insert[f] = body[f];
    }
    if (insert["fecha_ultimo_contacto"] === "") insert["fecha_ultimo_contacto"] = null;

    const { data, error } = await supabaseAdmin
      .from("clientes")
      .insert(insert)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, cliente: data });
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    req.log.error({ err, msg }, "[gestion/clientes] post error");
    res.status(500).json({ success: false, error: msg });
  }
});

// PUT /api/gestion/clientes/:id
router.put("/gestion/clientes/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const body = req.body as Record<string, unknown>;
    const fields = ["nombre_comercial", "codigo_sn", "nit", "registro_fiscal", "correo", "telefono", "direccion", "persona_contacto", "cargo_contacto", "facturar_a_nombre_de", "vendedor_asignado", "segmento", "sitio_web", "notas_internas", "fecha_ultimo_contacto"];
    const update: Record<string, unknown> = {};
    for (const f of fields) {
      if (body[f] !== undefined) update[f] = body[f] === "" ? null : body[f];
    }

    const { data, error } = await supabaseAdmin
      .from("clientes")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, cliente: data });
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    req.log.error({ err, msg }, "[gestion/clientes/:id] put error");
    res.status(500).json({ success: false, error: msg });
  }
});

// GET /api/gestion/clientes/:id/boletas
router.get("/gestion/clientes/:id/boletas", async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from("reportes")
      .select("id, numero_reporte, created_at, tecnico_nombre, estado_servicio")
      .eq("cliente_id", id)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw error;
    res.json({ success: true, boletas: data ?? [] });
  } catch (err) {
    req.log.error({ err }, "[gestion/clientes/:id/boletas] error");
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ── MODULE 4: Gestión de Usuarios y Roles ────────────────────────────────────

// GET /api/gestion/usuarios
router.get("/gestion/usuarios", async (req: Request, res: Response) => {
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from("usuarios")
      .select("id, nombre, usuario, correo, rol, departamento, activo, created_at, ultimo_acceso")
      .order("nombre");
    if (error) {
      const { data: fb, error: err2 } = await supabase
        .from("usuarios")
        .select("id, nombre, usuario, correo, rol, departamento, activo, created_at")
        .order("nombre");
      if (err2) throw err2;
      res.json({ success: true, usuarios: fb ?? [] });
      return;
    }
    res.json({ success: true, usuarios: data ?? [] });
  } catch (err) {
    req.log.error({ err }, "[gestion/usuarios] error");
    res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /api/gestion/usuarios
router.post("/gestion/usuarios", async (req: Request, res: Response) => {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { nombre, usuario, correo, rol, departamento, password, activo } = req.body as Record<string, unknown>;
    if (!nombre || !usuario) {
      res.status(400).json({ success: false, error: "Nombre y usuario requeridos" });
      return;
    }
    const insert: Record<string, unknown> = {
      nombre: (nombre as string).trim(),
      usuario: (usuario as string).trim().toLowerCase(),
      rol: rol ?? "tecnico",
      activo: activo ?? true,
      password_hash: (password as string | undefined) ?? "TAS2026!",
    };
    if (correo) insert["correo"] = correo;
    if (departamento) insert["departamento"] = departamento;

    const { data, error } = await supabaseAdmin
      .from("usuarios")
      .insert(insert)
      .select("id, nombre, usuario, correo, rol, departamento, activo, created_at")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        res.status(409).json({ success: false, error: "El usuario ya existe" });
        return;
      }
      throw error;
    }
    res.json({ success: true, usuario: data });
  } catch (err) {
    req.log.error({ err }, "[gestion/usuarios] post error");
    res.status(500).json({ success: false, error: String(err) });
  }
});

// PUT /api/gestion/usuarios/:id
router.put("/gestion/usuarios/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { nombre, usuario, correo, rol, departamento, password, activo } = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (nombre !== undefined) update["nombre"] = nombre;
    if (usuario !== undefined) update["usuario"] = (usuario as string).toLowerCase();
    if (correo !== undefined) update["correo"] = correo;
    if (password) update["password_hash"] = password;
    if (rol !== undefined) update["rol"] = rol;
    if (departamento !== undefined) update["departamento"] = departamento;
    if (activo !== undefined) update["activo"] = activo;

    const { data, error } = await supabaseAdmin
      .from("usuarios")
      .update(update)
      .eq("id", id)
      .select("id, nombre, usuario, correo, rol, departamento, activo, created_at")
      .single();
    if (error) throw error;
    res.json({ success: true, usuario: data });
  } catch (err) {
    req.log.error({ err }, "[gestion/usuarios/:id] put error");
    res.status(500).json({ success: false, error: String(err) });
  }
});

// DELETE /api/gestion/usuarios/:id
router.delete("/gestion/usuarios/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { error } = await supabaseAdmin.from("usuarios").delete().eq("id", id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "[gestion/usuarios/:id] delete error");
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
