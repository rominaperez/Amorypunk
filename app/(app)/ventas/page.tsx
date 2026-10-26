import Link from "next/link";
import { exigir } from "@/lib/perfil";
import { supabaseServer } from "@/lib/supabase/server";
import { pesos, fecha } from "@/lib/formato";
import Ransom from "@/components/Ransom";
import { CanalChip, CobroChip } from "@/components/Chips";

export default async function VentasPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const p = await exigir("admin", "vendedor");
  const { filtro } = await searchParams;
  const sb = await supabaseServer();
  let q = sb.from("v_ventas").select("*").order("fecha", { ascending: false }).limit(200);
  if (filtro === "verificar") q = q.gt("por_verificar", 0);
  if (filtro === "saldo") q = q.gt("saldo", 0.5);
  const [{ data: ventas }, { data: items }] = await Promise.all([
    q,
    sb.from("v_items_venta").select("venta_id,producto,talle,color,cantidad,cantidad_devuelta"),
  ]);
  const det: Record<string, string> = {};
  (items ?? []).forEach((i: any) => {
    const u = i.cantidad - i.cantidad_devuelta;
    if (u > 0) det[i.venta_id] = (det[i.venta_id] ? det[i.venta_id] + ", " : "") + `${u}× ${i.producto}`;
  });
  const F = [["", "Todas"], ["verificar", "Por verificar"], ["saldo", "Con saldo"]];
  return (
    <>
      <Ransom texto={p.rol === "admin" ? "VENTAS" : "MIS VENTAS"} />
      <p className="lede">{p.rol === "admin" ? "Todas las ventas, de todos los canales. Tocá una para ver el reparto y el cobro." : "Las ventas que cargaste vos."}</p>
      <div className="filters"><div className="seg">
        {F.map(([k, l]) => <Link key={k} href={k ? `/ventas?filtro=${k}` : "/ventas"} className="btn sm ghost" style={(filtro ?? "") === k ? { background: "var(--ink)", color: "var(--bg)" } : {}}>{l}</Link>)}
      </div></div>
      {ventas?.length ? (
        <div className="list">
          {ventas.map((v: any) => (
            <Link key={v.id} href={`/ventas/${v.id}`} className="row">
              <span className="mono" style={{ color: "var(--muted)" }}>V-{v.numero}<br />{fecha(v.fecha)}</span>
              <div className="main"><b>{det[v.id] ?? "—"}</b><span><CanalChip canal={v.canal} ubicacion={v.ubicacion} pedido={v.tiendanube_pedido} /> · {v.vendedor}</span></div>
              <CobroChip v={v} />
              <span className="amt">{pesos(v.total)}</span>
            </Link>
          ))}
        </div>
      ) : <div className="empty">Todavía no hay ventas.</div>}
    </>
  );
}
