import { notFound } from "next/navigation";
import { exigir } from "@/lib/perfil";
import { supabaseServer } from "@/lib/supabase/server";
import Ransom from "@/components/Ransom";
import CuentaBanda from "@/components/CuentaBanda";
import { Entrega, ResumenWhatsApp } from "../Formularios";

export default async function BandaPage({ params }: { params: Promise<{ id: string }> }) {
  await exigir("admin");
  const { id } = await params;
  const sb = await supabaseServer();
  const [{ data: c }, { data: lineas }] = await Promise.all([
    sb.from("v_cuenta_bandas").select("*").eq("banda_id", id).maybeSingle(),
    sb.from("v_lineas_venta").select("numero,fecha,canal,ubicacion,producto,talle,color,unidades,total_banda").eq("banda_id", id).order("fecha"),
  ]);
  if (!c) notFound();
  const hoy = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  const $ = (n: number) => "$" + Math.round(Number(n)).toLocaleString("es-AR");
  const texto = [
    `AMOR & PUNK · Liquidación ${c.nombre} · ${hoy}`, "",
    ...(lineas ?? []).map((l: any) => `${new Date(l.fecha).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit" })} ${l.canal === "feria" ? l.ubicacion : l.canal === "tiendanube" ? "Tiendanube" : "Showroom"}: ${l.unidades}× ${l.producto} ${[l.talle, l.color].filter(Boolean).join(" ")} → ${$(l.total_banda)}`),
    "", `Les corresponde: ${$(c.corresponde)}`, `Ya recibieron: ${$(c.entregado)}`, `Saldo a cobrar: ${$(c.saldo)}`,
  ].join("\n");
  return (
    <>
      <Ransom texto={c.nombre.toUpperCase()} />
      <div className="pos" style={{ marginTop: 14 }}>
        <div><CuentaBanda bandaId={id} /></div>
        <div className="cartcol">
          <Entrega bandaId={id} saldo={Number(c.saldo)} />
          <ResumenWhatsApp texto={texto} />
        </div>
      </div>
    </>
  );
}
