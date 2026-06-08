-- ── 006: Dashboard users table + supervisor_id on reportes ─────────────────────
-- Run in Supabase Dashboard > SQL Editor

-- 1. Create dashboard_usuarios table for TAS internal staff
CREATE TABLE IF NOT EXISTS dashboard_usuarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  usuario VARCHAR(50) NOT NULL UNIQUE,
  correo VARCHAR(100),
  rol VARCHAR(30) NOT NULL CHECK (rol IN ('admin', 'gerente_operaciones', 'supervisor', 'gerente_comercial')),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add supervisor reference to reportes
ALTER TABLE reportes
  ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES dashboard_usuarios(id),
  ADD COLUMN IF NOT EXISTS supervisor_nombre VARCHAR(100);

-- 3. Seed initial users (password for all: TAS2026!)
INSERT INTO dashboard_usuarios (nombre, usuario, correo, rol) VALUES
  ('Hernan Pinaud',    'hernan.pinaud',  'hpinaud@tas-seguridad.com',  'admin'),
  ('Mario Chicas',     'mario.chicas',   'mchicas@tas-seguridad.com',  'gerente_operaciones'),
  ('Maribel Santos',   'maribel.santos', 'msantos@tas-seguridad.com',  'gerente_operaciones'),
  ('Allen Rosales',    'allen.rosales',  'arosales@tas-seguridad.com', 'gerente_comercial')
ON CONFLICT (usuario) DO NOTHING;

-- Add supervisor users as needed (example):
-- INSERT INTO dashboard_usuarios (nombre, usuario, correo, rol) VALUES
--   ('Nombre Supervisor', 'usuario.supervisor', 'correo@tas-seguridad.com', 'supervisor')
-- ON CONFLICT (usuario) DO NOTHING;
