import { createClient } from "@supabase/supabase-js";

function assertServerRuntime() {
  if (typeof window !== "undefined") {
    throw new Error("O cliente Supabase administrativo só pode ser usado no servidor.");
  }
}

export function createSupabaseAdminClient() {
  assertServerRuntime();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Configuração ausente: NEXT_PUBLIC_SUPABASE_URL.");
  if (!serviceRoleKey) throw new Error("Configuração ausente: SUPABASE_SERVICE_ROLE_KEY.");

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
