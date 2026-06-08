-- Migration 003: Merge case-insensitive duplicate clients
-- Run this in Supabase Dashboard → SQL Editor
--
-- Strategy:
--  1. Find groups of clients where LOWER(nombre_comercial) is the same
--  2. Keep the "best" one (best capitalization score = most words starting uppercase)
--  3. Reassign all reportes that point to a duplicate → point to the canonical one
--  4. Delete the duplicate clientes rows

DO $$
DECLARE
  canonical_id   UUID;
  dup_id         UUID;
  dup_name       TEXT;
  canon_name     TEXT;
  rows_updated   INT;
BEGIN
  -- Loop over every group of case-insensitive duplicates
  FOR dup_name IN
    SELECT LOWER(nombre_comercial) AS lname
    FROM   clientes
    GROUP  BY lname
    HAVING COUNT(*) > 1
  LOOP
    RAISE NOTICE 'Processing duplicates for: %', dup_name;

    -- Pick the canonical ID: prefer properly-capitalized names.
    -- Heuristic: count words that start with an uppercase letter.
    -- Ties broken by the oldest created_at (first inserted wins).
    SELECT id, nombre_comercial INTO canonical_id, canon_name
    FROM   clientes
    WHERE  LOWER(nombre_comercial) = dup_name
    ORDER BY (
      -- count uppercase-starting words
      array_length(
        ARRAY(
          SELECT w FROM unnest(string_to_array(nombre_comercial, ' ')) AS w
          WHERE w ~ '^[A-ZÁÉÍÓÚÑÜ]'
        ), 1
      )
    ) DESC NULLS LAST,
    created_at ASC
    LIMIT 1;

    RAISE NOTICE '  Canonical: % (%)', canon_name, canonical_id;

    -- For every other ID in this group, reassign reportes and delete
    FOR dup_id IN
      SELECT id FROM clientes
      WHERE  LOWER(nombre_comercial) = dup_name
        AND  id <> canonical_id
    LOOP
      RAISE NOTICE '  Merging duplicate % into %', dup_id, canonical_id;

      UPDATE reportes
      SET    cliente_id = canonical_id
      WHERE  cliente_id = dup_id;
      GET DIAGNOSTICS rows_updated = ROW_COUNT;
      RAISE NOTICE '    Updated % reportes', rows_updated;

      -- Also fix any clientes that point to the duplicate as their parent
      UPDATE clientes
      SET    cliente_padre_id = canonical_id
      WHERE  cliente_padre_id = dup_id;

      DELETE FROM clientes WHERE id = dup_id;
      RAISE NOTICE '    Deleted duplicate cliente %', dup_id;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Deduplication complete.';
END;
$$;
