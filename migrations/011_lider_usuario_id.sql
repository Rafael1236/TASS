-- Migration 011: Add lider_usuario_id to subcontratos_empresas
-- Required for CHANGE 4: Company leader selected from access users dropdown
ALTER TABLE subcontratos_empresas
  ADD COLUMN IF NOT EXISTS lider_usuario_id uuid REFERENCES subcontratos_usuarios(id) ON DELETE SET NULL;

-- Optional: RLS policy to allow anon updates on subcontratos_usuarios (for password change)
-- Run this if password change returns RLS errors:
-- CREATE POLICY "anon can update subcontratos_usuarios password"
--   ON subcontratos_usuarios
--   FOR UPDATE TO anon USING (true);
