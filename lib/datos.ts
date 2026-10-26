import "server-only";
import { supabaseServer } from "./supabase/server";

export type FilaStock = {
  variante_id: string; variante_codigo: string; talle: string; color: string;
  producto_id: string; producto_codigo: string; producto: string; categoria: string | null; banda_id: string | null;
  precio: number; precio_online: number | null; foto_path: string | null;
  ubicacion_id: string; ubicacion: string; tipo_ubicacion: "showroom" | "deposito" | "feria";
  cantidad: number; reservada: number; disponible: number;
};
export type Ubicacion = { id: string; tipo: "showroom" | "deposito" | "feria"; nombre: string; fecha: string | null; direccion: string | null; activa: boolean };

export async function ubicaciones(soloActivas = true): Promise<Ubicacion[]> {
  const sb = await supabaseServer();
  let q = sb.from("ubicaciones").select("id,tipo,nombre,fecha,direccion,activa").order("tipo").order("fecha", { ascending: false });
  if (soloActivas) q = q.eq("activa", true);
  const { data } = await q;
  return (data ?? []) as Ubicacion[];
}

export async function bandasMapa(): Promise<Record<string, { nombre: string; color: string | null }>> {
  const sb = await supabaseServer();
  const { data } = await sb.from("bandas").select("id,nombre,color");
  return Object.fromEntries((data ?? []).map((b: any) => [b.id, { nombre: b.nombre, color: b.color }]));
}

// Las fotos están en un bucket privado: se firman por una hora.
export async function fotosFirmadas(paths: (string | null)[]): Promise<Record<string, string>> {
  const lista = [...new Set(paths.filter(Boolean) as string[])];
  if (!lista.length) return {};
  const sb = await supabaseServer();
  const { data } = await sb.storage.from("fotos").createSignedUrls(lista, 3600);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path!, d.signedUrl as string]));
}

export const COLORES = ["#8a3b12", "#2d6b5e", "#5b3a8c", "#7a1b52", "#1d4b7a", "#4c5e21", "#2a2a2a"];
export const colorDe = (id: string | null, bandas: Record<string, { color: string | null }>) =>
  id == null ? "#D51A1F" : bandas[id]?.color ?? COLORES[parseInt(id.replace(/\D/g, "").slice(0, 6) || "0") % COLORES.length];
