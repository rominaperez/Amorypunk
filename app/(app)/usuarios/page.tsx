import { exigir } from "@/lib/perfil";
import { supabaseServer } from "@/lib/supabase/server";
import { bandasMapa } from "@/lib/datos";
import Ransom from "@/components/Ransom";
import UsuariosCliente from "./UsuariosCliente";

export default async function UsuariosPage() {
  const p = await exigir("admin");
  const sb = await supabaseServer();
  const [{ data: usuarios }, bandas] = await Promise.all([
    sb.from("perfiles").select("id,nombre,rol,banda_id,contacto,activo").order("rol").order("nombre"),
    bandasMapa(),
  ]);
  return (
    <>
      <Ransom texto="USUARIOS" />
      <p className="lede">Solo los admins crean usuarios. Nadie se registra solo.</p>
      <UsuariosCliente yo={p.id} usuarios={(usuarios ?? []) as any[]} bandas={Object.entries(bandas).map(([id, b]) => ({ id, nombre: b.nombre }))} />
    </>
  );
}
