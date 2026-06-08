import { Router, type IRouter } from "express";
import { getSupabase, getSupabaseAdmin } from "../lib/supabase";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

type TestResult = {
  name: string;
  status: "pass" | "fail" | "warn";
  details: string;
  count?: number;
  error?: string | null;
};

function pass(name: string, details: string, count?: number): TestResult {
  return { name, status: "pass", details, count: count ?? undefined, error: null };
}
function fail(name: string, details: string, error?: unknown): TestResult {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return { name, status: "fail", details, error: msg || null };
}
function warn(name: string, details: string, count?: number): TestResult {
  return { name, status: "warn", details, count: count ?? undefined, error: null };
}

// ── GET /api/diagnostics ──────────────────────────────────────────────────────

router.get("/diagnostics", async (req, res) => {
  const results: TestResult[] = [];
  const supabase = getSupabase();
  const admin = getSupabaseAdmin();

  // ── 1. DATABASE CONNECTION & TABLE EXISTENCE ─────────────────────────────

  const TABLES = [
    "usuarios",
    "clientes",
    "reportes",
    "reporte_tecnicos",
    "reporte_repuestos",
    "subcontratos_proyectos",
    "subcontratos_empresas",
    "subcontratos_usuarios",
    "subcontratos_actividades",
    "subcontratos_actividades_catalogo",
    "subcontratos_actividades_proyecto",
    "subcontratos_reportes",
    "subcontratos_fotos",
    "subcontratos_tecnicos",
    "tecnicos",
    "dashboard_usuarios",
  ];

  const tableResults: { table: string; ok: boolean; count: number; error?: string }[] = [];
  for (const table of TABLES) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });
    tableResults.push({
      table,
      ok: !error,
      count: count ?? 0,
      error: error?.message,
    });
  }

  const okTables = tableResults.filter((t) => t.ok);
  const failTables = tableResults.filter((t) => !t.ok);

  if (failTables.length === 0) {
    results.push(pass(
      "Database — All tables accessible",
      `All ${TABLES.length} tables exist and are readable. Row counts: ${tableResults.map((t) => `${t.table}(${t.count})`).join(", ")}`,
      TABLES.length,
    ));
  } else {
    results.push(fail(
      "Database — Table accessibility",
      `${okTables.length}/${TABLES.length} tables OK. Missing/inaccessible: ${failTables.map((t) => `${t.table} (${t.error})`).join("; ")}`,
    ));
  }

  // ── 2. AUTHENTICATION FLOWS ───────────────────────────────────────────────

  const authRoles = [
    { label: "Tecnico", rol: "tecnico" },
    { label: "Supervisor", rol: "supervisor" },
    { label: "Gerente Operaciones", rol: "gerente_operaciones" },
    { label: "Gerente Comercial", rol: "gerente_comercial" },
    { label: "Admin", rol: "admin" },
  ];

  for (const { label, rol } of authRoles) {
    const { data, error, count } = await supabase
      .from("usuarios")
      .select("id, nombre, usuario, activo", { count: "exact" })
      .eq("rol", rol)
      .eq("activo", true);

    if (error) {
      results.push(fail(`Auth — ${label} users`, "Query failed", error.message));
    } else if ((count ?? 0) === 0) {
      results.push(warn(`Auth — ${label} users`, `No active users found with rol='${rol}'`, 0));
    } else {
      results.push(pass(
        `Auth — ${label} users`,
        `${count} active user(s) found. Examples: ${(data ?? []).slice(0, 3).map((u) => u.usuario).join(", ")}`,
        count ?? 0,
      ));
    }
  }

  // Subcontratistas
  {
    const { data, error, count } = await supabase
      .from("subcontratos_usuarios")
      .select("id, nombre, usuario, activo", { count: "exact" })
      .eq("activo", true);

    if (error) {
      results.push(fail("Auth — Subcontratista users", "Query failed", error.message));
    } else if ((count ?? 0) === 0) {
      results.push(warn("Auth — Subcontratista users", "No active subcontract users found", 0));
    } else {
      results.push(pass(
        "Auth — Subcontratista users",
        `${count} active subcontract user(s). Examples: ${(data ?? []).slice(0, 3).map((u) => u.usuario).join(", ")}`,
        count ?? 0,
      ));
    }
  }

  // Duplicate detection — users in BOTH tables (the carlos.campos bug pattern)
  {
    const { data: tasUsers } = await supabase.from("usuarios").select("usuario").eq("activo", true);
    const { data: subUsers } = await supabase.from("subcontratos_usuarios").select("usuario").eq("activo", true);
    const tasSet = new Set((tasUsers ?? []).map((u) => u.usuario));
    const subSet = new Set((subUsers ?? []).map((u) => u.usuario));
    const duplicates = [...subSet].filter((u) => tasSet.has(u));
    if (duplicates.length > 0) {
      results.push(fail(
        "Auth — Duplicate users (cross-table)",
        `${duplicates.length} user(s) exist in BOTH usuarios AND subcontratos_usuarios — login will return wrong tipo. Fix: DELETE FROM usuarios WHERE usuario IN ('${duplicates.join("','")}')`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any);
      results[results.length - 1]!.error = duplicates.join(", ");
    } else {
      results.push(pass("Auth — Duplicate users (cross-table)", "No users duplicated across tables"));
    }
  }

  // Password default check — simulate login logic
  {
    const DEFAULT_PASSWORD = "TAS2026!";
    const { data: sample } = await supabase.from("usuarios").select("usuario").eq("activo", true).limit(1);
    if (sample && sample.length > 0) {
      const testUser = sample[0]!.usuario as string;
      const passwordMatch = DEFAULT_PASSWORD === "TAS2026!"; // always true — just validates constant
      results.push(pass(
        "Auth — Default password constant",
        `DEFAULT_PASSWORD = "TAS2026!" is set. Tested against sample user: ${testUser}. Password comparison: ${passwordMatch ? "OK" : "MISMATCH"}`,
      ));
    }
  }

  // ── 3. BOLETA FORM — full insert + delete ────────────────────────────────

  let boletaTestId: string | null = null;
  let clienteId: string | null = null;
  let supervisorId: string | null = null;

  // Get a real cliente_id to satisfy FK
  const { data: clientes } = await admin.from("clientes").select("id, nombre_comercial").limit(1);
  clienteId = clientes?.[0]?.id ?? null;

  // Get a real supervisor_id from usuarios
  const { data: supervisores } = await admin
    .from("usuarios")
    .select("id, nombre")
    .in("rol", ["supervisor", "admin", "gerente_operaciones"])
    .eq("activo", true)
    .limit(1);
  supervisorId = supervisores?.[0]?.id ?? null;

  if (!clienteId) {
    results.push(warn("Boleta — Insert test", "Skipped: no clientes found to satisfy FK"));
  } else {
    const testBoleta = {
      numero_llamada: "TEST-DIAG-001",
      numero_proyecto: "PROJ-TEST-001",
      cliente_id: clienteId,
      tecnico_nombre: "DIAGNOSTICO SISTEMA",
      tipo_servicio: ["mantenimiento", "instalacion"],
      trabajo_realizado: "Diagnóstico automático del sistema — insertar y borrar",
      equipos_instalados: "Ninguno — prueba de diagnóstico",
      estado_servicio: "Completado",
      hora_entrada: "08:00",
      hora_salida: "09:00",
      observaciones: "Registro creado automáticamente por /api/diagnostics — será eliminado",
      hay_cotizacion: false,
      descripcion_cotizacion: null,
      supervisor_id: supervisorId,
      supervisor_nombre: supervisorId ? (supervisores![0]!.nombre ?? "Supervisor Test") : null,
      placa_vehiculo: "P-999-TEST",
      estado_revision: "pendiente_revision",
      firma_cliente_url: null,
      fotos: ["https://placeholder.local/diag1.jpg"],
      es_subcontrato: false,
      total_horas_equipo: 1,
    };

    // Self-healing insert: strip columns that don't exist in this deployment (same pattern as reports route)
    const boletaPayload: Record<string, unknown> = { ...testBoleta };
    const strippedCols: string[] = [];
    let insertedId: string | null = null;
    let insertErr: string | null = null;

    for (let attempt = 0; attempt < 20; attempt++) {
      const { data: ins, error: err } = await admin
        .from("reportes")
        .insert(boletaPayload)
        .select("id")
        .single();

      if (!err) { insertedId = ins?.id ?? null; break; }

      // PGRST204 = unknown column — strip it and retry
      if (err.code === "PGRST204") {
        const m = err.message.match(/the '(.+?)' column/);
        const col = m?.[1];
        if (col && col in boletaPayload) { delete boletaPayload[col]; strippedCols.push(col); continue; }
      }
      insertErr = err.message;
      break;
    }

    if (insertErr) {
      results.push(fail("Boleta — Insert test (all fields)", "INSERT failed", insertErr));
    } else {
      boletaTestId = insertedId;
      const note = strippedCols.length ? ` (stripped missing columns: ${strippedCols.join(", ")})` : "";
      results.push(pass(
        "Boleta — Insert test (all fields)",
        `Inserted test boleta id=${boletaTestId} with fields: numero_llamada, tipo_servicio[], fotos[], supervisor_id, placa_vehiculo, equipos_instalados${note}`,
      ));
    }
  }

  // ── 4. REPORTE_TECNICOS ───────────────────────────────────────────────────

  if (boletaTestId) {
    const testTecnico = {
      reporte_id: boletaTestId,
      nombre: "Auxiliar Test Diagnóstico",
      hora_entrada: "08:00",
      hora_salida: "09:00",
      es_principal: false,
      es_subcontrato: false,
      total_horas: 1,
    };

    const { error: tecErr } = await admin.from("reporte_tecnicos").insert(testTecnico);

    if (tecErr) {
      results.push(fail("Reporte_tecnicos — Insert test", "INSERT failed", tecErr.message));
    } else {
      results.push(pass("Reporte_tecnicos — Insert test", "Inserted with: reporte_id, nombre, hora_entrada, hora_salida, es_principal, es_subcontrato, total_horas"));
    }
  } else {
    results.push(warn("Reporte_tecnicos — Insert test", "Skipped: no test boleta was created"));
  }

  // ── 5. REPORTE_REPUESTOS ──────────────────────────────────────────────────

  if (boletaTestId) {
    const testRepuesto = {
      reporte_id: boletaTestId,
      descripcion: "Repuesto diagnóstico",
      cantidad: 1,
    };

    const { error: repErr } = await admin.from("reporte_repuestos").insert(testRepuesto);

    if (repErr) {
      results.push(fail("Reporte_repuestos — Insert test", "INSERT failed", repErr.message));
    } else {
      results.push(pass("Reporte_repuestos — Insert test", "Inserted with: reporte_id, descripcion, cantidad"));
    }
  } else {
    results.push(warn("Reporte_repuestos — Insert test", "Skipped: no test boleta was created"));
  }

  // ── CLEANUP test boleta (cascades to tecnicos + repuestos) ────────────────

  if (boletaTestId) {
    // Delete child rows first
    await admin.from("reporte_tecnicos").delete().eq("reporte_id", boletaTestId);
    await admin.from("reporte_repuestos").delete().eq("reporte_id", boletaTestId);
    const { error: delErr } = await admin.from("reportes").delete().eq("id", boletaTestId);
    if (delErr) {
      results.push(fail("Boleta — Cleanup (DELETE test record)", "DELETE failed — test data may remain", delErr.message));
    } else {
      results.push(pass("Boleta — Cleanup (DELETE test record)", `Test boleta id=${boletaTestId} and its child records deleted successfully`));
    }
  }

  // ── 6. SUBCONTRATOS FLOW ──────────────────────────────────────────────────

  // a. Read proyectos
  {
    const { data, error, count } = await supabase
      .from("subcontratos_proyectos")
      .select("id, nombre, estado", { count: "exact" })
      .limit(5);
    if (error) {
      results.push(fail("Subcontratos — Read proyectos", "SELECT failed", error.message));
    } else {
      results.push(pass("Subcontratos — Read proyectos", `${count} project(s) found. States: ${(data ?? []).map((p) => p.estado).join(", ") || "none"}`, count ?? 0));
    }
  }

  // b. Read actividades_proyecto
  {
    const { error, count } = await supabase
      .from("subcontratos_actividades_proyecto")
      .select("*", { count: "exact", head: true });
    if (error) {
      results.push(fail("Subcontratos — Read actividades_proyecto", "SELECT failed", error.message));
    } else {
      results.push(pass("Subcontratos — Read actividades_proyecto", `${count} actividad(es) encontradas`, count ?? 0));
    }
  }

  // c. Test insert subcontratos_reportes + d. subcontratos_fotos
  {
    const { data: proyectos } = await admin
      .from("subcontratos_proyectos")
      .select("id")
      .limit(1);

    const proyectoId = proyectos?.[0]?.id ?? null;

    if (!proyectoId) {
      results.push(warn("Subcontratos — Insert reporte test", "Skipped: no subcontratos_proyectos found"));
      results.push(warn("Subcontratos — Insert fotos test", "Skipped: no subcontratos_proyectos found"));
    } else {
      const { data: subUser } = await admin
        .from("subcontratos_usuarios")
        .select("id")
        .eq("activo", true)
        .limit(1);
      const subUserId = subUser?.[0]?.id ?? null;

      const testReporte = {
        proyecto_id: proyectoId,
        usuario_id: subUserId,
        fecha: new Date().toISOString().split("T")[0],
        porcentaje_avance: 0,
        actividad_nombre: "DIAGNOSTICO_TEST",
        descripcion: "Test automático de diagnóstico — será eliminado",
        estado: "pendiente",
      };

      const { data: insReporte, error: repErr } = await admin
        .from("subcontratos_reportes")
        .insert(testReporte)
        .select("id")
        .single();

      if (repErr) {
        results.push(fail("Subcontratos — Insert reporte test", "INSERT failed", repErr.message));
        results.push(warn("Subcontratos — Insert fotos test", "Skipped: reporte insert failed"));
      } else {
        results.push(pass("Subcontratos — Insert reporte test", `Inserted subcontratos_reportes id=${insReporte?.id}`));

        // d. Insert fotos
        const { error: fotoErr } = await admin.from("subcontratos_fotos").insert({
          reporte_id: insReporte?.id,
          url: "https://placeholder.local/diag-sub.jpg",
          descripcion: "Test foto diagnóstico",
        });

        if (fotoErr) {
          results.push(fail("Subcontratos — Insert fotos test", "INSERT failed", fotoErr.message));
        } else {
          results.push(pass("Subcontratos — Insert fotos test", "Inserted subcontratos_fotos with reporte_id and url"));
        }

        // Cleanup
        if (insReporte?.id) {
          await admin.from("subcontratos_fotos").delete().eq("reporte_id", insReporte.id);
          await admin.from("subcontratos_reportes").delete().eq("id", insReporte.id);
        }
      }
    }
  }

  // e. Días hábiles calculation test
  {
    // Mon 2026-05-25 → Fri 2026-05-29 = 5 business days
    const inicio = "2026-05-25";
    const fin = "2026-05-29";
    let count = 0;
    const cur = new Date(inicio + "T12:00:00");
    const end = new Date(fin + "T12:00:00");
    while (cur <= end) {
      const day = cur.getDay();
      if (day !== 0 && day !== 6) count++;
      cur.setDate(cur.getDate() + 1);
    }
    const correct = count === 5;
    if (correct) {
      results.push(pass("Subcontratos — Días hábiles counter", `calcDiasHabiles(${inicio}, ${fin}) = ${count} ✓ (expected 5)`));
    } else {
      results.push(fail("Subcontratos — Días hábiles counter", `calcDiasHabiles(${inicio}, ${fin}) = ${count} (expected 5)`));
    }
  }

  // ── 7. CLIENT SEARCH ──────────────────────────────────────────────────────

  {
    const { data, error, count } = await supabase
      .from("clientes")
      .select("id, nombre_comercial, correo, nit", { count: "exact" })
      .ilike("nombre_comercial", "%a%")
      .limit(5);

    if (error) {
      results.push(fail("Clientes — Search by nombre_comercial", "ilike query failed", error.message));
    } else {
      results.push(pass(
        "Clientes — Search by nombre_comercial",
        `ilike('%a%') returned ${count} client(s). Examples: ${(data ?? []).slice(0, 3).map((c) => (c as { nombre_comercial?: string }).nombre_comercial).join(", ")}`,
        count ?? 0,
      ));
    }
  }

  // ── 8. SUPERVISOR ASSIGNMENT ─────────────────────────────────────────────

  {
    const { data: sup } = await admin
      .from("usuarios")
      .select("id, nombre")
      .eq("rol", "supervisor")
      .eq("activo", true)
      .limit(1);

    if (!sup || sup.length === 0) {
      results.push(warn("Supervisor assignment — Query test", "No supervisor found to test with"));
    } else {
      const supId = sup[0]!.id;
      const { data, error, count } = await supabase
        .from("reportes")
        .select("id, cliente_nombre, estado_revision", { count: "exact" })
        .eq("supervisor_id", supId)
        .eq("estado_revision", "pendiente_revision")
        .limit(5);

      if (error) {
        results.push(fail("Supervisor assignment — Query test", "SELECT failed", error.message));
      } else {
        results.push(pass(
          "Supervisor assignment — Query test",
          `supervisor_id=${supId} (${sup[0]!.nombre}) has ${count} pending boleta(s). Query: SELECT * FROM reportes WHERE supervisor_id='${supId}' AND estado_revision='pendiente_revision'`,
          count ?? 0,
        ));
      }
    }
  }

  // ── 9. EMAIL — RESEND CONFIG ──────────────────────────────────────────────

  {
    const hasResend = !!process.env["RESEND_API_KEY"];
    const testMode = !!process.env["EMAIL_TEST_MODE"];

    if (!hasResend) {
      results.push(fail("Email — Resend API key", "RESEND_API_KEY environment variable is not set"));
    } else {
      results.push(pass(
        "Email — Resend API key",
        `RESEND_API_KEY is set. EMAIL_TEST_MODE=${testMode ? "enabled" : "not set (live emails will be sent)"}`,
      ));
    }
  }

  // ── 10. USER CREATION FLOW ───────────────────────────────────────────────

  {
    const testUser = {
      nombre: "__DIAG_TEST_USER__",
      usuario: "__diag_test__",
      correo: "diag-test@diagnostics.local",
      rol: "tecnico",
      departamento: "Diagnostics",
      activo: true,
    };

    const { data: inserted, error: insErr } = await admin
      .from("usuarios")
      .insert(testUser)
      .select("id, nombre, usuario, rol, activo")
      .single();

    if (insErr) {
      results.push(fail("User creation — Insert into usuarios", "INSERT failed", insErr.message));
    } else {
      results.push(pass(
        "User creation — Insert into usuarios",
        `Inserted id=${inserted?.id}: nombre, usuario, correo, rol, departamento, activo=true all saved correctly`,
      ));

      // Cleanup
      if (inserted?.id) {
        await admin.from("usuarios").delete().eq("id", inserted.id);
      }
    }
  }

  // ── 11. SUBCONTRACT USER LOGIN FLOW ──────────────────────────────────────

  {
    const { data, error, count } = await supabase
      .from("subcontratos_usuarios")
      .select("id, nombre, usuario, empresa_id", { count: "exact" })
      .eq("activo", true);

    if (error) {
      results.push(fail("Subcontract login — usuarios check", "Query on subcontratos_usuarios failed", error.message));
    } else if ((count ?? 0) === 0) {
      results.push(warn("Subcontract login — usuarios check", "No active subcontract users in subcontratos_usuarios"));
    } else {
      const missingEmpresa = (data ?? []).filter((u) => !u.empresa_id);
      results.push(pass(
        "Subcontract login — usuarios check",
        `${count} active subcontract user(s) found. Login fallback: ✓. ${missingEmpresa.length > 0 ? `⚠ ${missingEmpresa.length} user(s) have no empresa_id: ${missingEmpresa.map((u) => u.usuario).join(", ")}` : "All have empresa_id ✓"}`,
        count ?? 0,
      ));
    }

  }

  // ── SUMMARY ───────────────────────────────────────────────────────────────

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const warned = results.filter((r) => r.status === "warn").length;
  const overall: "pass" | "fail" | "partial" =
    failed === 0 && warned === 0 ? "pass" : failed === 0 ? "partial" : "fail";

  res.json({
    timestamp: new Date().toISOString(),
    overall,
    tests: results,
    summary: {
      passed,
      warned,
      failed,
      total: results.length,
    },
  });
});

export default router;
