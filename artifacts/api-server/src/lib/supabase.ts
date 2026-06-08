import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;
let cachedAdmin: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_ANON_KEY"];

  if (!url || !key) {
    throw new Error(
      "Supabase no está configurado: faltan SUPABASE_URL o SUPABASE_ANON_KEY",
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false },
  });
  return cached;
}

/**
 * Returns a Supabase client with the service role key (bypasses RLS).
 * Falls back to the anon key if SUPABASE_SERVICE_ROLE_KEY is not set.
 * Use for INSERT/UPDATE/DELETE operations that require elevated permissions.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;

  const url = process.env["SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const anonKey = process.env["SUPABASE_ANON_KEY"];
  const key = serviceKey ?? anonKey;

  if (!url || !key) {
    throw new Error(
      "Supabase no está configurado: faltan SUPABASE_URL o SUPABASE_ANON_KEY",
    );
  }

  cachedAdmin = createClient(url, key, {
    auth: { persistSession: false },
  });
  return cachedAdmin;
}

export const REPORTES_BUCKET = "fotos-reportes";
