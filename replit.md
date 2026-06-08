# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Pending Supabase Migrations

- `migrations/010_otros_actividad.sql` — **required** to enable "Otros" custom activity in the subcontract project wizard: `INSERT INTO subcontratos_actividades_catalogo (nombre, descripcion) VALUES ('Otros', 'Actividad personalizada') ON CONFLICT (nombre) DO NOTHING;`
- `migrations/011_lider_usuario_id.sql` — ✅ **already applied** — `lider_usuario_id` column already exists in `subcontratos_empresas`. The `lider_empresa` text field maps to DB column `lider` (handled in API). No action needed.
- `migrations/012_subcontratos_password_hash.sql` — **required** to enable password changes for subcontract access users. Adds `password_hash TEXT` to `subcontratos_usuarios`. Until run, login always uses default `TAS2026!` and the password change modal returns an error.

Run these in Supabase Dashboard > SQL Editor (in order):

- `migrations/003_dedup_clientes.sql` — merge duplicate client records (optional cleanup)
- `migrations/004_placa_vehiculo.sql` — **required** to enable vehicle plate field: `ALTER TABLE reportes ADD COLUMN IF NOT EXISTS placa_vehiculo VARCHAR(20);`
- `migrations/005_nueva_boleta_fields.sql` — ✅ **executed** — adds `equipos_instalados`, `total_horas_equipo` to `reportes`; adds `es_principal`, `hora_entrada`, `hora_salida`, `total_horas` to `reporte_tecnicos`.
- `migrations/006_dashboard_usuarios.sql` — superseded by 007. Skip if running fresh.
- `migrations/007_unified_usuarios.sql` — ✅ **executed** — creates unified `usuarios` table (replaces `tecnicos` + `dashboard_usuarios`); migrates all staff; fixes `supervisor_id` FK on `reportes` to point to `usuarios`. Default password for all: TAS2026!
- `migrations/008_fix_actividad_id_fk.sql` — **required** — fixes broken FK on `subcontratos_reportes.actividad_id` (was pointing to nonexistent `subcontratos_actividades_proyecto`, now points to `subcontratos_actividades`). Until run, `actividad_id` is stored as NULL (workaround active in code).
- `migrations/009_gestion_columns.sql` — ✅ **executed** (partially) — adds: `dui/telefono/fecha_ingreso/tiene_isss/fecha_vencimiento_examenes` to `subcontratos_tecnicos`; `lider_empresa/direccion` to `subcontratos_empresas`; CRM fields (`codigo_sn`, `segmento`, `cargo_contacto`, `sitio_web`, `fecha_ultimo_contacto`) to `clientes`; `dui/telefono/fecha_ingreso/ultimo_acceso` to `usuarios`. **Note:** `clientes` table already had pre-existing columns with different names than the migration assumed — real column names are: `correo` (not `correo_cliente`), `persona_contacto` (not `contacto`), `facturar_a_nombre_de` (not `facturar_a`), `vendedor_asignado` TEXT (not `vendedor_id` UUID), `notas_internas` (not `notas`). API and frontend use the real column names.

## Auth Architecture

All TAS staff (technicians, supervisors, managers, admins) live in a single **`usuarios`** table:

| Rol | Login via | Access |
|-----|-----------|--------|
| `tecnico` | Mobile app | Nueva boleta + consultar cliente |
| `supervisor` | Mobile app | Nueva boleta + consultar + subcontratos module |
| `admin` | Mobile app + Dashboard | All mobile modules + all dashboard tabs |
| `gerente_operaciones` | Dashboard only | Operaciones + Subcontratos + Supervisión tabs |
| `gerente_comercial` | Dashboard only | Comercial tab |

- Trying to log in from the wrong platform shows a clear redirect message.
- **Subcontratistas** are separate: they still use the `subcontratos_usuarios` table and only access the subcontracts module in the mobile app.

## Features

- **TAS Bot Tecnico** (`/`) — Expo mobile app for technicians. WhatsApp dark theme, single pipeline: text/voice/chips → Claude AI extraction → fills fields → asks next missing field. Reports save to Supabase. Voice via OpenAI Whisper. Email via Resend. Fields include: tecnico, cliente, llamada SAP, tipo servicio, trabajo, estado, horario, proyecto, repuestos, técnicos aux, subcontrato, cotización, placa vehículo, observaciones. Subcontract daily reports support **multiple activities per submission** — each activity has its own `PercentControl` (avance de hoy + total acumulado). One report row is inserted per submission; `actividad_nombre` stores a comma-separated summary when multiple activities selected.
- **Login + Auth** (`/dashboard/`) — Role-based login for TAS internal staff. All roles stored in `usuarios` table. Roles: `admin`, `gerente_operaciones`, `supervisor`, `gerente_comercial`. Default password: TAS2026!. Session stored in localStorage. Each role sees only its tabs via `DashboardNav`. Trying to log in as `tecnico` from the dashboard shows "Accede desde la app móvil". Auth endpoints: `POST /api/dashboard/auth/login`, `GET /api/dashboard/supervisores`.
- **TAS Dashboard Operativo** (`/dashboard/operaciones`) — Operations supervisor dashboard. KPIs, report table, technician summary, charts, GPS section (Geotab). Report rows with a vehicle plate show a "Ver GPS" button that filters the GPS section to that vehicle on that date.
- **TAS Dashboard Supervisor** (`/dashboard/supervisor`) — Filtered view showing only boletas assigned to the logged-in supervisor (`supervisor_id`). Includes revision section with supervisor-specific KPIs. Supervisor name auto-filled as `revisado_por`.
- **TAS Dashboard Comercial** (`/dashboard/comercial`) — Sales team dashboard.
- **TAS Dashboard Subcontratos** (`/dashboard/subcontratos`) — Full subcontract management dashboard. Two tabs: Dashboard (KPIs, pending approvals, projects table, timeline) and Empresas (company + user management). Features: "Nuevo Proyecto" 4-step wizard (info → subcontractor → activities → review+email), edit project modal (dates/days/supervisor), complete/deactivate project, filters by estado/date range. Sends email to subcontractor on project creation. Projects table has inline edit + deactivate buttons. "Empresas y usuarios" section: add company, add user (default password TAS2026!), view users per company. Wizard Step 1 includes optional "N° Llamada SAP" field (saved to `subcontratos_proyectos.numero_llamada`) linking projects to service calls. **5-state dynamic lifecycle**: `por_iniciar` (blue, before fecha_inicio), `en_progreso` (green, ≤80% días), `en_riesgo` (amber, ≥80%), `vencido` (red pulsing, past fecha_fin), `completado` (gray, manual). `calcEstado()` derives state dynamically on every API response — DB `estado` only changes on manual complete. "Por iniciar" blue card section above table. Filter dropdown uses calculated states. `GET /api/subcontratos/check-notifications` — stateless daily cron: sends 6 email types (3d/1d before start, day-of, 3d before deadline, 80% consumed, overdue).
- **SAP Call Report** (`/dashboard/` search by SAP call#) — Unified report combining TAS service boletas AND subcontract project reports for the same call number. Section 1: TAS visits with blue badge. Section 2: Subcontract activities per project (progress bars, daily reports expandable, photos). Section 3: Executive summary with combined technician list, activity completion, and chronological unified timeline. PDF export includes all 3 sections. API: `GET /api/reports/by-call?numero=X` now returns `subcontrato_proyectos[]` alongside `boletas[]`.
- **GPS Section** — Geotab integration: fetches TAS El Salvador vehicle stops > 5 min, reverse-geocodes via Geotab GetAddresses, shows arrival/departure/duration/address. Can be filtered by plate from report rows.
- **TAS Dashboard Gestión** (`/dashboard/gestion/`) — User & Data Management panel with purple accent theme. Access: `admin` (all 4 modules), `gerente_operaciones` (modules 1+2 only). Visible as "Gestión" tab in navbar for those roles. **Module 1 — Subcontratos** (`/gestion/subcontratos`): company list sidebar with expiry alert badges (critico=red ≤30 days, proximo=amber ≤60 days), company detail edit, technician table (DUI, ISSS ✓/✗, exam expiry status), add/edit technician modal. **Module 2 — Técnicos TAS** (`/gestion/tecnicos`): filterable table of `usuarios` with rol∈(tecnico,supervisor), add/edit modal with departamento, DUI, telefono. **Module 3 — Clientes CRM** (`/gestion/clientes`): search table with Nombre, Código SAP, Correo, NIT, Contacto, Segmento, Última visita; full CRM add/edit modal with boletas history. **Module 4 — Usuarios y Roles** (`/gestion/usuarios`): table of ALL usuarios with colored role badges (admin=purple, gerente_ops=blue, gerente_comercial=green, supervisor=amber, tecnico=gray), inline role change (click badge → dropdown), toggle active, password change modal, delete with confirm. Note for mario.chicas + maribel.santos: "Módulos 1 y 2". DashboardNav: gear icon mini-modal for admin/gerente_operaciones with quick links to Gestión. API routes: `GET/PUT /api/gestion/subcontratos/empresas`, `GET/POST/PUT /api/gestion/subcontratos/tecnicos`, `GET/POST/PUT /api/gestion/tecnicos-tas`, `GET/POST/PUT /api/gestion/clientes`, `GET /api/gestion/clientes/:id/boletas`, `GET/POST/PUT/DELETE /api/gestion/usuarios`, `POST /api/gestion/upload`.

## Geotab Notes

- Database: arrendleasing, user: hpinaud@tas-seguridad.com
- Devices fetched all and filtered client-side (server-side name filter does exact match only)
- Trip fields: `start`, `stop`, `nextTripStart`, `stopPoint: {x: lng, y: lat}`, `stopDuration: "HH:MM:SS.fff"`
- Session cached 55 min in-memory
