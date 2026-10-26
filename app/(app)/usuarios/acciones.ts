"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getPerfil } from "@/lib/perfil";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type Resultado = { error?: string; link?: string; nombre?: string };

async function origen() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
async function soloAdmin() {
  const p = await getPerfil();
  if (p.rol !== "admin") throw new Error("Solo los admins administran usuarios");
  return p;
}
const linkPropio = async (hashed: string, tipo: "invite" | "recovery") =>
  `${await origen()}/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=${tipo}`;

// Crea el usuario sin mandar mail: devuelve un link para pasarle por WhatsApp.
export async function crearUsuario(_: Resultado, f: FormData): Promise<Resultado> {
  try {
    await soloAdmin();
    const nombre = String(f.get("nombre") ?? "").trim();
    const email = String(f.get("email") ?? "").trim().toLowerCase();
    const telefono = String(f.get("telefono") ?? "").trim();
    const rol = String(f.get("rol")) as "admin" | "vendedor" | "banda";
    const banda_id = rol === "banda" ? String(f.get("banda") || "") : null;
    if (!nombre || !email) return { error: "Completá nombre y mail." };
    if (rol === "banda" && !banda_id) return { error: "Elegí a qué banda pertenece." };

    const admin = supabaseAdmin();
    const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { data: { nombre } } });
    if (error) return { error: error.message.includes("already") ? "Ya hay un usuario con ese mail." : error.message };

    // El perfil lo crea el admin con su propia sesión: queda en el historial quién lo creó.
    const sb = await supabaseServer();
    const { error: e2 } = await sb.from("perfiles").insert({ id: data.user.id, nombre, rol, banda_id, contacto: [email, telefono].filter(Boolean).join(" · ") });
    if (e2) {
      await admin.auth.admin.deleteUser(data.user.id);
      return { error: e2.message };
    }
    revalidatePath("/usuarios");
    return { link: await linkPropio(data.properties.hashed_token, "invite"), nombre };
  } catch (e: any) {
    return { error: e.message ?? "No se pudo crear el usuario." };
  }
}

// Para quien perdió la invitación o se olvidó la contraseña.
export async function linkNuevo(userId: string): Promise<Resultado> {
  try {
    await soloAdmin();
    const admin = supabaseAdmin();
    const { data: u, error } = await admin.auth.admin.getUserById(userId);
    if (error || !u.user?.email) return { error: "No encontré ese usuario." };
    const { data, error: e2 } = await admin.auth.admin.generateLink({ type: "recovery", email: u.user.email });
    if (e2) return { error: e2.message };
    return { link: await linkPropio(data.properties.hashed_token, "recovery"), nombre: String(u.user.user_metadata?.nombre ?? "") };
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function cambiarActivo(userId: string, activo: boolean): Promise<Resultado> {
  const p = await soloAdmin();
  if (p.id === userId) return { error: "No podés desactivarte a vos mismo." };
  const sb = await supabaseServer();
  const { error } = await sb.from("perfiles").update({ activo }).eq("id", userId);
  if (error) return { error: error.message };
  revalidatePath("/usuarios");
  return {};
}
