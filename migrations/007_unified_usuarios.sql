-- ── 007: Unified usuarios table (replaces tecnicos + dashboard_usuarios) ────────
-- Run in Supabase Dashboard > SQL Editor
-- Works whether migration 006 was executed or not.

-- ── 1. Create the unified usuarios table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id            UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre        VARCHAR(100) NOT NULL,
  usuario       VARCHAR(50)  NOT NULL UNIQUE,
  correo        VARCHAR(100),
  departamento  VARCHAR(100),
  rol           VARCHAR(30)  NOT NULL DEFAULT 'tecnico'
                CHECK (rol IN ('tecnico', 'supervisor', 'admin', 'gerente_operaciones', 'gerente_comercial')),
  activo        BOOLEAN      DEFAULT true,
  password_hash VARCHAR(255),
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 2. Migrate all rows from tecnicos → usuarios ────────────────────────────────
-- Preserves ids, names, passwords and active status.
-- Normalises rol: any value not in the allowed set defaults to 'tecnico'.
INSERT INTO usuarios (id, nombre, usuario, departamento, rol, activo, password_hash, created_at)
SELECT
  id,
  nombre,
  usuario,
  COALESCE(departamento, ''),
  CASE
    WHEN rol IN ('admin', 'supervisor', 'gerente_operaciones', 'gerente_comercial') THEN rol
    ELSE 'tecnico'
  END,
  COALESCE(activo, true),
  password_hash,
  COALESCE(created_at, NOW())
FROM tecnicos
ON CONFLICT (usuario) DO NOTHING;

-- ── 3. Seed / upsert known TAS staff ───────────────────────────────────────────
-- Covers both cases: migration 006 was run or not.
-- ON CONFLICT updates role and email in case they changed.
INSERT INTO usuarios (nombre, usuario, correo, rol, activo) VALUES
  ('Hernan Pinaud',  'hernan.pinaud',  'hpinaud@tas-seguridad.com',  'admin',               true),
  ('Mario Chicas',   'mario.chicas',   'mchicas@tas-seguridad.com',  'gerente_operaciones',  true),
  ('Maribel Santos', 'maribel.santos', 'msantos@tas-seguridad.com',  'gerente_operaciones',  true),
  ('Allen Rosales',  'allen.rosales',  'arosales@tas-seguridad.com', 'gerente_comercial',    true)
ON CONFLICT (usuario) DO UPDATE SET
  rol    = EXCLUDED.rol,
  correo = EXCLUDED.correo,
  activo = EXCLUDED.activo;

-- ── 4. Ensure supervisor columns exist on reportes ──────────────────────────────
-- Safe to run even if 006 already added them.
ALTER TABLE reportes ADD COLUMN IF NOT EXISTS supervisor_id     UUID;
ALTER TABLE reportes ADD COLUMN IF NOT EXISTS supervisor_nombre VARCHAR(100);

-- ── 5. Fix supervisor_id FK: drop old (→ dashboard_usuarios) then re-add ────────
-- Drop whichever FK constraint currently references supervisor_id (if any).
DO $$
DECLARE v_constraint TEXT;
BEGIN
  SELECT tc.constraint_name
    INTO v_constraint
    FROM information_schema.table_constraints  tc
    JOIN information_schema.key_column_usage   kcu
      ON tc.constraint_name = kcu.constraint_name
   WHERE tc.table_name      = 'reportes'
     AND tc.constraint_type = 'FOREIGN KEY'
     AND kcu.column_name    = 'supervisor_id'
   LIMIT 1;
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE reportes DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

-- Add FK pointing to the new unified usuarios table.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.table_constraints
     WHERE table_name      = 'reportes'
       AND constraint_name = 'reportes_supervisor_id_fkey'
  ) THEN
    ALTER TABLE reportes
      ADD CONSTRAINT reportes_supervisor_id_fkey
      FOREIGN KEY (supervisor_id) REFERENCES usuarios(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 6. Add supervisor users as needed (example — uncomment and adapt) ───────────
-- INSERT INTO usuarios (nombre, usuario, correo, rol) VALUES
--   ('Nombre Supervisor', 'usuario.supervisor', 'correo@tas-seguridad.com', 'supervisor')
-- ON CONFLICT (usuario) DO NOTHING;
