-- Migration 004: Add placa_vehiculo column to reportes
-- Run in Supabase Dashboard > SQL Editor

ALTER TABLE reportes
  ADD COLUMN IF NOT EXISTS placa_vehiculo VARCHAR(20);
