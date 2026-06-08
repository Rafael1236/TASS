-- ============================================================
-- TAS Bot — Subcontratos Module Migration
-- Run this in your Supabase SQL editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Add rol column to tecnicos table
ALTER TABLE tecnicos ADD COLUMN IF NOT EXISTS rol TEXT NOT NULL DEFAULT 'tecnico';

-- 2. Set hernan.pinaud as admin
UPDATE tecnicos SET rol = 'admin' WHERE usuario = 'hernan.pinaud';

-- 3. subcontratos_proyectos
CREATE TABLE IF NOT EXISTS subcontratos_proyectos (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           TEXT        NOT NULL,
  cliente_nombre   TEXT        NOT NULL,
  empresa_id       TEXT        NOT NULL DEFAULT 'TAS',
  asignados        TEXT[]      NOT NULL DEFAULT '{}',
  dias_maximos     INTEGER     NOT NULL DEFAULT 30,
  dias_utilizados  INTEGER     NOT NULL DEFAULT 0,
  estado           TEXT        NOT NULL DEFAULT 'activo',
  ultima_actividad DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. subcontratos_actividades
CREATE TABLE IF NOT EXISTS subcontratos_actividades (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id      UUID        NOT NULL REFERENCES subcontratos_proyectos(id) ON DELETE CASCADE,
  nombre           TEXT        NOT NULL,
  porcentaje_avance INTEGER    NOT NULL DEFAULT 0,
  orden            INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. subcontratos_tecnicos (workers per company)
CREATE TABLE IF NOT EXISTS subcontratos_tecnicos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  TEXT        NOT NULL,
  nombre      TEXT        NOT NULL,
  activo      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. subcontratos_reportes (daily reports)
CREATE TABLE IF NOT EXISTS subcontratos_reportes (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id           UUID        NOT NULL REFERENCES subcontratos_proyectos(id) ON DELETE CASCADE,
  actividad_id          UUID        REFERENCES subcontratos_actividades(id),
  actividad_nombre      TEXT,
  usuario_id            TEXT        NOT NULL,
  fecha                 DATE        NOT NULL DEFAULT CURRENT_DATE,
  descripcion           TEXT,
  tecnicos_presentes    JSONB       NOT NULL DEFAULT '[]',
  porcentaje_avance     INTEGER     NOT NULL DEFAULT 0,
  estado                TEXT        NOT NULL DEFAULT 'pendiente',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. subcontratos_fotos
CREATE TABLE IF NOT EXISTS subcontratos_fotos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id  UUID        NOT NULL REFERENCES subcontratos_reportes(id) ON DELETE CASCADE,
  url         TEXT        NOT NULL,
  tipo        TEXT        NOT NULL DEFAULT 'evidencia',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Enable RLS
ALTER TABLE subcontratos_proyectos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontratos_actividades  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontratos_tecnicos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontratos_reportes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontratos_fotos        ENABLE ROW LEVEL SECURITY;

-- 9. Permissive policies (same pattern as existing tables in this project)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subcontratos_proyectos' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON subcontratos_proyectos FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subcontratos_actividades' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON subcontratos_actividades FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subcontratos_tecnicos' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON subcontratos_tecnicos FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subcontratos_reportes' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON subcontratos_reportes FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subcontratos_fotos' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON subcontratos_fotos FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 10. Sample test project (remove in production)
INSERT INTO subcontratos_proyectos (nombre, cliente_nombre, empresa_id, asignados, dias_maximos, dias_utilizados, estado)
VALUES (
  'Instalación CCTV Planta Norte',
  'La Constancia',
  'TAS',
  ARRAY['hernan.pinaud'],
  30,
  18,
  'activo'
) ON CONFLICT DO NOTHING;

-- Get the project ID to insert activities
DO $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM subcontratos_proyectos WHERE nombre = 'Instalación CCTV Planta Norte' LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO subcontratos_actividades (proyecto_id, nombre, porcentaje_avance, orden)
    VALUES
      (v_id, 'Instalación de cámaras perimetrales', 60, 1),
      (v_id, 'Cableado estructurado',               80, 2),
      (v_id, 'Configuración NVR y software',         20, 3)
    ON CONFLICT DO NOTHING;

    INSERT INTO subcontratos_tecnicos (empresa_id, nombre)
    VALUES ('TAS', 'Carlos Mejía'), ('TAS', 'Roberto Flores'), ('TAS', 'Ana López')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
