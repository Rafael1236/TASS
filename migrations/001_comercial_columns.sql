-- Commercial dashboard columns migration
-- Run this in your Supabase Dashboard → SQL Editor

ALTER TABLE reportes
  ADD COLUMN IF NOT EXISTS cotizacion_estado       TEXT DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS cotizacion_enviada_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cotizacion_vendedor     TEXT,
  ADD COLUMN IF NOT EXISTS cotizacion_motivo_no_envio TEXT,
  ADD COLUMN IF NOT EXISTS correo_comercial_enviado_at TIMESTAMPTZ;
