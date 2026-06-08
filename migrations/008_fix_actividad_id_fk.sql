-- Migration 008: Fix actividad_id FK on subcontratos_reportes
-- The original FK pointed to subcontratos_actividades_proyecto (wrong/nonexistent table).
-- Activities are stored in subcontratos_actividades. This migration fixes the constraint.

-- Drop the broken FK constraint
ALTER TABLE subcontratos_reportes
  DROP CONSTRAINT IF EXISTS subcontratos_reportes_actividad_id_fkey;

-- Recreate it pointing to the correct table
ALTER TABLE subcontratos_reportes
  ADD CONSTRAINT subcontratos_reportes_actividad_id_fkey
  FOREIGN KEY (actividad_id)
  REFERENCES subcontratos_actividades(id)
  ON DELETE SET NULL;
