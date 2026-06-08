-- ── 008: Add missing columns to usuarios table ────────────────────────────────
-- Run in Supabase Dashboard > SQL Editor
-- Adds password_hash and departamento if they were not present in the initial
-- usuarios table creation (e.g. if the table was created via an earlier version
-- of migration 007).

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS departamento  VARCHAR(100);
