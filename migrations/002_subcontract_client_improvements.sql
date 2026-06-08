-- Migration 002: subcontract improvements + client parent/branch structure
-- Run this in Supabase Dashboard → SQL Editor

-- New columns on reportes for the 3-step subcontract flow
ALTER TABLE reportes
  ADD COLUMN IF NOT EXISTS empresa_subcontrato        TEXT,
  ADD COLUMN IF NOT EXISTS cantidad_personas_subcontrato INT;

-- New columns on clientes for parent/branch detection
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS es_sucursal        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cliente_padre_id   UUID REFERENCES clientes(id),
  ADD COLUMN IF NOT EXISTS sucursal           TEXT;
