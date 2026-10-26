import Link from "next/link";
import { exigir } from "@/lib/perfil";
import { supabaseServer } from "@/lib/supabase/server";
import { pesos, fecha, varianteNombre } from "@/lib/formato";
import Ransom from "@/components/Ransom";
import { CanalChip, CobroChip } from "@/components/Chips";

export default async function Inicio() {
  const p = await exigir("admin");
  const sb = await supabaseServer();
  const desde = new Date(Date.now() - 7 * 864e5).toISOString();
  const [{ data: ventas }, { data: semana }, { data: bandas }, { data: reponer }, { data: avisos }, { data: costos }] = await Promise.all([
    sb.from("v_ventas").select("*").order("fecha", { ascending: false }).limit(6),
    sb.from("v_lineas_venta").select("neto,ganancia_showroom").gte("fecha", desde),
    sb.from("v_cuenta_bandas").select("saldo"),
    sb.from("v_para_reponer").select("*").order("vendidas", { ascending: false }).limit(6),
    sb.from("notificaciones").select("id,texto,created_at").eq("leida", false).order("created_at", { ascending: false }),
    sb.from("producto_costos").select("producto_id").is("costo_unit", null),
  ]);
  const { data: todas } = await sb.from("v_ventas").select("total,cobrado,por_verificar,saldo,anulada").gte("fecha", desde);
  const s = (k: string) => (todas ?? []).filter((v: any) => !v.anulada).reduce((a: number, v: any) => a + Math.max(0, Number(v[k])), 0);
  const gan = (semana ?? []).reduce((a: number, l: any) => a + Number(l.ganancia_showroom ?? 0), 0);
  const aBandas = (bandas ?? []).reduce((a: number, b: any) => a + Number(b.saldo), 0);
  return (
    <>
      <Ransom texto={`HOLA ${p.nombre.toUpperCase()}`} />
      <p className="lede">Últimos 7 días. Todo se calcula desde las ventas y movimientos cargados.</p>
      {avisos?.map((a: any) => <p key={a.id} className="note"><b>{a.texto}</b> · {fecha(a.created_at)}</p>)}
      <div className="grid kpis">
        <div className="kpi hot"><small>Vendido</small><b>{pesos(s("total"))}</b><em>{todas?.length ?? 0} ventas</em></div>
        <div className="kpi"><small>Cobrado</small><b>{pesos(s("cobrado"))}</b><em>confirmado</em></div>
        <div className="kpi"><small>Por verificar</small><b>{pesos(s("por_verificar"))}</b><em><Link href="/ventas?filtro=verificar">ver</Link></em></div>
        <div className="kpi"><small>Falta cobrar</small><b>{pesos(s("saldo"))}</b><em><Link href="/ventas?filtro=saldo">ver</Link></em></div>
        <div className="kpi"><small>Ganancia showroom</small><b>{pesos(gan)}</b><em>después de costos y repartos</em></div>
        <div className="kpi"><small>A pagar a bandas</small><b>{pesos(aBandas)}</b><em><Link href="/bandas">ver</Link></em></div>
      </div>
      {!!costos?.length && <p className="note"><b>{costos.length} producto{costos.length > 1 ? "s" : ""} con costo pendiente.</b> Sus ventas no suman ganancia hasta que se cargue. <Link href="/stock">Ver en stock</Link></p>}
      {!!reponer?.length && <>
        <h3>Para reponer</h3>
        <div className="list">{reponer.map((r: any) => (
          <div className="row" key={r.variante_id}><div className="main"><b>{r.producto}</b><span>{varianteNombre(r)} · vendidas {r.vendidas}</span></div><span className={`chip ${r.disponible <= 0 ? "bad" : "warn"}`}>{r.disponible <= 0 ? "Sin stock" : `Quedan ${r.disponible}`}</span></div>
        ))}</div>
      </>}
      <h3>Últimas ventas</h3>
      {ventas?.length ? <div className="list">{ventas.map((v: any) => (
        <Link key={v.id} href={`/ventas/${v.id}`} className="row">
          <span className="mono" style={{ color: "var(--muted)" }}>V-{v.numero}<br />{fecha(v.fecha)}</span>
          <div className="main"><b><CanalChip canal={v.canal} ubicacion={v.ubicacion} pedido={v.tiendanube_pedido} /></b><span>{v.vendedor}</span></div>
          <CobroChip v={v} /><span className="amt">{pesos(v.total)}</span>
        </Link>
      ))}</div> : <div className="empty">Todavía no hay ventas. Empezá por cargar productos en Stock y abrir la caja.</div>}
    </>
  );
}
