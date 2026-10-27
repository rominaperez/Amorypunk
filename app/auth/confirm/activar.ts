"use server";
import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

export async function activar(f: FormData) {
  const token_hash = String(f.get("token_hash") ?? "");
  const type = String(f.get("type") ?? "") as EmailOtpType;
  const sb = await supabaseServer();
  const { error } = await sb.auth.verifyOtp({ type, token_hash });
  if (error) redirect(`/login?error=${encodeURIComponent("El link venció o ya se usó. Pedile uno nuevo a un admin.")}`);
  redirect("/cuenta/clave");
}
