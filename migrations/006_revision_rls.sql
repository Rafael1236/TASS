-- Migration 006: Allow anon key to UPDATE reportes (for boleta review workflow)
-- Run in Supabase Dashboard > SQL Editor
--
-- This is required for the boleta review buttons to work when using the anon key.
-- Alternatively, set SUPABASE_SERVICE_ROLE_KEY env var in the API server
-- (preferred — service role key bypasses RLS without needing this policy).

-- Enable RLS on reportes if not already enabled (safe to run if already enabled)
ALTER TABLE reportes ENABLE ROW LEVEL SECURITY;

-- Allow anon to UPDATE any row in reportes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'reportes'
      AND policyname = 'anon can update reportes'
  ) THEN
    CREATE POLICY "anon can update reportes"
    ON reportes FOR UPDATE TO anon
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;
