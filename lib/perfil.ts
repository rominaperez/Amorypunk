import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";

export type Rol = "admin" | "vendedor" | "banda";
export type Perfil = { id: string; nombre: string; rol: Rol; banda_id: string | null; activo: boolean; banda?: string | null };

export const getPerfil = cache(async (): Promise<Perfil> => {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await sb.from("perfiles").select("id,nombre,rol,banda_id,activo,bandas(nombre)").eq("id", user.id).maybeSingle();
  if (!data || !data.activo) redirect("/login?sin_acceso=1");
  const banda = (data as any).bandas?.nombre ?? null;
  return { id: data.id, nombre: data.nombre, rol: data.rol, banda_id: data.banda_id, activo: data.activo, banda };
});

export async function exigir(...roles: Rol[]) {
  const p = await getPerfil();
  if (!roles.includes(p.rol)) redirect("/");
  return p;
}
