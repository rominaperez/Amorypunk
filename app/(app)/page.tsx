import { redirect } from "next/navigation";
import { getPerfil } from "@/lib/perfil";

export default async function Home() {
  const p = await getPerfil();
  redirect(p.rol === "admin" ? "/inicio" : p.rol === "vendedor" ? "/vender" : "/mi-cuenta");
}
