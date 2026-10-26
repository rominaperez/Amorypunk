import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

// Link de invitación o de "contraseña nueva" que genera un admin.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (token_hash && type) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.verifyOtp({ type, token_hash });
    if (!error) redirect("/cuenta/clave");
  }
  redirect(`/login?error=${encodeURIComponent("El link venció o ya se usó. Pedile uno nuevo a un admin.")}`);
}
