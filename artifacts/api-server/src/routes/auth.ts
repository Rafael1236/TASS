import { Router } from "express";
import { getSupabase } from "../lib/supabase";

const router = Router();

const DEFAULT_PASSWORD = "TAS2026!";

// ── POST /api/dashboard/auth/login ───────────────────────────────────────────
// Dashboard login for TAS internal staff — queries unified "usuarios" table.
// Blocks "tecnico" role: must use the mobile app.

router.post("/dashboard/auth/login", async (req, res) => {
  const { usuario, password } = req.body as { usuario?: string; password?: string };

  if (!usuario || !password) {
    res.status(400).json({ success: false, message: "Usuario y contraseña requeridos" });
    return;
  }

  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from("usuarios")
      .select("id, nombre, usuario, correo, departamento, rol, password_hash")
      .eq("usuario", usuario.trim().toLowerCase())
      .eq("activo", true)
      .single();

    if (error || !data) {
      res.status(401).json({ success: false, message: "Usuario no encontrado o inactivo" });
      return;
    }

    const u = data as {
      id: string;
      nombre: string;
      usuario: string;
      correo: string | null;
      departamento: string | null;
      rol: string;
      password_hash?: string | null;
    };

    // Technicians must use the mobile app
    if (u.rol === "tecnico") {
      res.status(403).json({
        success: false,
        message: "Este usuario accede desde la app móvil TAS Bot",
        mobile_only: true,
      });
      return;
    }

    // Use per-user password if set; otherwise fall back to the default
    const expectedPassword = u.password_hash ?? DEFAULT_PASSWORD;
    if (password !== expectedPassword) {
      res.status(401).json({ success: false, message: "Contraseña incorrecta" });
      return;
    }

    req.log.info({ usuario: u.usuario, rol: u.rol }, "[dashboard/auth/login] login OK");
    res.json({
      success: true,
      usuario: {
        id: u.id,
        nombre: u.nombre,
        usuario: u.usuario,
        correo: u.correo ?? null,
        rol: u.rol,
      },
    });
  } catch (err) {
    req.log.error({ err }, "[dashboard/auth/login] error");
    res.status(500).json({ success: false, message: "Error interno del servidor" });
  }
});

// ── GET /api/dashboard/supervisores ──────────────────────────────────────────
// Returns TAS staff with supervisor/gerente/admin roles — used for dropdowns.
// Queries unified "usuarios" table.

router.get("/dashboard/supervisores", async (req, res) => {
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from("usuarios")
      .select("id, nombre, usuario, correo, rol")
      .in("rol", ["supervisor", "gerente_operaciones", "admin"])
      .eq("activo", true)
      .order("nombre", { ascending: true });

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.json({ success: true, supervisores: data ?? [] });
  } catch (err) {
    req.log.error({ err }, "[dashboard/supervisores] error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── GET /api/tecnicos/search?q=texto ──────────────────────────────────────────
// Search active TAS staff by name (ILIKE). Used for auxiliary technician modal.
// Queries unified "usuarios" table — roles: tecnico, supervisor, admin.

router.get("/tecnicos/search", async (req, res) => {
  const q = ((req.query["q"] as string) ?? "").trim();
  const supabase = getSupabase();

  try {
    let query = supabase
      .from("usuarios")
      .select("id, nombre, departamento")
      .in("rol", ["tecnico", "supervisor", "admin"])
      .eq("activo", true)
      .order("nombre", { ascending: true })
      .limit(30);

    if (q.length > 0) {
      query = query.ilike("nombre", `%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.json({ success: true, tecnicos: data ?? [] });
  } catch (err) {
    req.log.error({ err }, "[tecnicos/search] error");
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
// Mobile app login. Checks unified "usuarios" table first, then subcontratos_usuarios.
// Blocks gerente_operaciones / gerente_comercial: must use dashboard web.

router.post("/auth/login", async (req, res) => {
  const { usuario, password } = req.body as { usuario?: string; password?: string };

  if (!usuario || !password) {
    res.status(400).json({ success: false, message: "Usuario y contraseña requeridos" });
    return;
  }

  const supabase = getSupabase();
  const inputUser = usuario.trim().toLowerCase();

  try {
    // ── 1. Check unified usuarios table ────────────────────────────────────────
    // Note: password_hash and departamento may not exist on all deployments.
    // We select only the guaranteed columns and handle optional ones separately.
    const { data: usuariosRows, error: usuariosError } = await supabase
      .from("usuarios")
      .select("id, nombre, usuario, correo, rol, password_hash")
      .eq("usuario", inputUser)
      .eq("activo", true)
      .limit(1);

    if (usuariosError) {
      req.log.error({ error: usuariosError }, "[auth/login] usuarios query error");
      res.status(500).json({ success: false, message: "Error interno del servidor" });
      return;
    }

    if (usuariosRows && usuariosRows.length > 0) {
      const u = usuariosRows[0] as {
        id: string;
        nombre: string;
        usuario: string;
        correo?: string | null;
        rol?: string | null;
        password_hash?: string | null;
      };

      // Web-only roles cannot log in from the mobile app
      if (u.rol === "gerente_operaciones" || u.rol === "gerente_comercial") {
        res.status(403).json({
          success: false,
          message: "Este usuario accede desde el dashboard web",
          web_only: true,
        });
        return;
      }

      // Use per-user password if set; otherwise fall back to the default
      const expectedPassword = u.password_hash ?? DEFAULT_PASSWORD;
      if (password !== expectedPassword) {
        res.status(401).json({ success: false, message: "Usuario o contraseña incorrectos" });
        return;
      }

      req.log.info({ usuario: u.usuario, rol: u.rol }, "[auth/login] usuarios login OK");
      res.json({
        success: true,
        tipo: "tecnico",
        usuario: {
          id: u.id,
          nombre: u.nombre,
          usuario: u.usuario,
          departamento: "",
          rol: u.rol ?? "tecnico",
        },
        // Legacy field kept for backward compat
        tecnico: {
          id: u.id,
          nombre: u.nombre,
          usuario: u.usuario,
          departamento: "",
          rol: u.rol ?? "tecnico",
        },
      });
      return;
    }

    // ── 2. Check subcontratos_usuarios table ──────────────────────────────────
    // Try with password_hash first (works after migration 012 is applied)
    let { data: subRows, error: subError } = await supabase
      .from("subcontratos_usuarios")
      .select("id, nombre, usuario, correo, empresa_id, activo, password_hash")
      .eq("usuario", inputUser)
      .eq("activo", true)
      .limit(1);

    if (subError) {
      // Migration 012 pending: password_hash column doesn't exist yet — retry without it
      const errCode = (subError as Record<string, unknown>).code as string;
      if (errCode === "42703" || errCode === "PGRST204") {
        req.log.warn("[auth/login] password_hash missing — run migration 012, falling back to DEFAULT_PASSWORD");
        const fallback = await supabase
          .from("subcontratos_usuarios")
          .select("id, nombre, usuario, correo, empresa_id, activo")
          .eq("usuario", inputUser)
          .eq("activo", true)
          .limit(1);
        if (fallback.error) {
          req.log.error({ error: fallback.error }, "[auth/login] subcontratos_usuarios query error");
          res.status(500).json({ success: false, message: "Error interno del servidor" });
          return;
        }
        subRows = fallback.data;
        subError = null;
      } else {
        req.log.error({ error: subError }, "[auth/login] subcontratos_usuarios query error");
        res.status(500).json({ success: false, message: "Error interno del servidor" });
        return;
      }
    }

    if (subRows && subRows.length > 0) {
      const s = subRows[0] as {
        id: string;
        nombre: string;
        usuario: string;
        correo?: string | null;
        empresa_id?: string | null;
        password_hash?: string | null;
      };

      const expectedPassword = s.password_hash ?? DEFAULT_PASSWORD;
      if (password !== expectedPassword) {
        res.status(401).json({ success: false, message: "Usuario o contraseña incorrectos" });
        return;
      }

      req.log.info({ usuario: s.usuario }, "[auth/login] subcontratista login OK");
      res.json({
        success: true,
        tipo: "subcontratista",
        usuario: {
          id: s.id,
          nombre: s.nombre,
          usuario: s.usuario,
          departamento: "",
          rol: "subcontratista",
          empresa_id: s.empresa_id ?? null,
        },
        // Legacy field for backward compat
        tecnico: {
          id: s.id,
          nombre: s.nombre,
          usuario: s.usuario,
          departamento: "",
          rol: "subcontratista",
        },
      });
      return;
    }

    // ── 3. Not found in either table ──────────────────────────────────────────
    res.status(401).json({ success: false, message: "Usuario o contraseña incorrectos" });
  } catch (err) {
    req.log.error({ err }, "[auth/login] unexpected error");
    res.status(500).json({ success: false, message: "Error interno del servidor" });
  }
});

export default router;
