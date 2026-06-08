-- Migration 012: Add password_hash to subcontratos_usuarios
-- Required for CHANGE 2: Fix password change for subcontract access users
-- Without this migration, password changes return an error and login always uses TAS2026!

ALTER TABLE subcontratos_usuarios
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Set default password for all existing users (plain text for now, consistent with system)
UPDATE subcontratos_usuarios
  SET password_hash = 'TAS2026!'
  WHERE password_hash IS NULL;
