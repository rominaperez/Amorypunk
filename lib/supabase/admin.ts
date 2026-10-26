import "server-only";
import { createClient } from "@supabase/supabase-js";

// Solo en el servidor. Usa la secret key: saltea los permisos, así que
// se usa únicamente para lo que Supabase no deja hacer de otra forma (crear usuarios).
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Falta SUPABASE_SECRET_KEY en el servidor");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
