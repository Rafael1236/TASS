-- Migration 005: add cantidad_subcontrato column to reportes
-- This is a separate integer column for the headcount of external subcontract
-- workers on site, distinct from the old cantidad_personas_subcontrato column.
ALTER TABLE reportes
  ADD COLUMN IF NOT EXISTS cantidad_subcontrato integer;
