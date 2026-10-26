import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Nombres (nunca valores) de las variables que ve el Worker, para diagnosticar.
function nombresDisponibles(): string {
  try {
    const env = getCloudflareContext().env as Record<string, unknown>;
    const n = Object.keys(env).filter((k) => k !== "ASSETS" && typeof env[k] === "string");
    return n.length ? n.join(", ") : "ninguna";
  } catch {
    return "no se pudo leer";
  }
}

function secretKey(): string | undefined {
  if (process.env.SUPABASE_SECRET_KEY) return process.env.SUPABASE_SECRET_KEY;
  try {
    return (getCloudflareContext().env as Record<string, string | undefined>).SUPABASE_SECRET_KEY;
  } catch {
    return undefined;
  }
}

// Solo en el servidor. Usa la secret key: saltea los permisos, así que
// se usa únicamente para lo que Supabase no deja hacer de otra forma (crear usuarios).
export function supabaseAdmin() {
  const key = secretKey();
  if (!key) {
    throw new Error(`Falta la clave secreta de Supabase. En Cloudflare: Worker → Settings → Variables and Secrets → agregá SUPABASE_SECRET_KEY como Secret. Variables que ve hoy el Worker: ${nombresDisponibles()}.`);
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
