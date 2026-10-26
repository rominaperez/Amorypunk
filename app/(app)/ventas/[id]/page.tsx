import { notFound } from "next/navigation";
import { exigir } from "@/lib/perfil";
import { supabaseServer } from "@/lib/supabase/server";
import { pesos, fecha, MEDIO, varianteNombre } from "@/lib/formato";
import { bandasMapa } from "@/lib/datos";
import Ransom from "@/components/Ransom";
import { CanalChip, CobroChip } from "@/components/Chips";
import AccionesVenta from "./AccionesVenta";

export default async function VentaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nueva?: string }> }) {
  const p = await exigir("admin", "vendedor");
  const { id } = await params;
  const { nueva } = await searchParams;
  const sb = await supabaseServer();
  const { data: v } = await sb.from("v_ventas").select("*").eq("id", id).maybeSingle();
  if (!v) notFound();
  const admin = p.rol === "admin";
  const [{ data: items }, { data: lineas }, { data: pagos }, bandas] = await Promise.all([
    sb.from("v_items_venta").select("*").eq("venta_id", id),
    admin ? sb.from("v_lineas_venta").select("*").eq("venta_id", id) : Promise.resolve({ data: [] as any[] }),
    sb.from("pagos").select("id,medio,monto,estado,cuenta_destino,referencia,es_reintegro,created_at").eq("venta_id", id).order("created_at"),
    bandasMapa(),
  ]);
  const L = Object.fromEntries((lineas ?? []).map((l: any) => [l.venta_item_id, l]));
  const tot = (k: string) => (lineas ?? []).reduce((a: number, l: any) => a + Number(l[k] ?? 0), 0);

  return (
    <>
      <Ransom texto={`V-${v.numero}`} />
      {nueva && <p className="okmsg">Venta registrada. El stock ya se descontó.</p>}
      <div className="flex" style={{ margin: "10px 0" }}>
        <CanalChip canal={v.canal} ubicacion={v.ubicacion} pedido={v.tiendanube_pedido} />
        <span className="mono">{fecha(v.fecha)}</span>
        <span className="chip">Vendió {v.vendedor}</span>
        <CobroChip v={v} />
      </div>
      <div className="tw">
        <table>
          <thead><tr><th>Producto</th><th className="r">Cant.</th><th className="r">Precio</th>
            {admin && <><th className="r">Neto</th><th className="r">Costo</th><th className="r">Ganancia</th><th className="r">Banda</th><th className="r">Showroom</th></>}
          </tr></thead>
          <tbody>
            {(items ?? []).map((i: any) => {
              const l = L[i.id];
              return (
                <tr key={i.id}>
                  <td>{i.producto}<br /><small style={{ color: "var(--muted)" }}>{varianteNombre(i)}{l?.banda_id ? ` · ${bandas[l.banda_id]?.nombre} · ${Number(l.pct_ganancia_banda)}% gan.` : ""}{i.cantidad_devuelta ? ` · ${i.cantidad_devuelta} devuelta(s)` : ""}</small></td>
                  <td className="r">{i.cantidad - i.cantidad_devuelta}</td>
                  <td className="r">{pesos(i.precio_unit)}</td>
                  {admin && <>
                    <td className="r">{pesos(l?.neto)}</td>
                    <td className="r">{l?.costo_pendiente ? <span className="chip warn">pendiente</span> : pesos(l?.costo)}</td>
                    <td className="r">{pesos(l?.ganancia)}</td>
                    <td className="r">{l?.banda_id ? pesos(l.total_banda) : "—"}</td>
                    <td className="r">{pesos(l?.ganancia_showroom)}</td>
                  </>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {admin && !!lineas?.length && (
        <div className="split" style={{ marginTop: 12 }}>
          <h4>A dónde va la plata</h4>
          <div className="totals">
            <span className="l">Recupera A&amp;P (costos que pagó)</span><span>{pesos(tot("recupera_ap"))}</span>
            <span className="l">Corresponde a bandas</span><span>{pesos(tot("total_banda"))}</span>
            <span className="l">Ganancia showroom</span><span><b>{pesos(tot("ganancia_showroom"))}</b></span>
            {Number(v.envio) > 0 && <><span className="l">Envío (aparte)</span><span>{pesos(v.envio)}</span></>}
          </div>
        </div>
      )}
      <h3>Cobro</h3>
      <div className="list">
        {(pagos ?? []).map((pg: any) => (
          <div className="row" key={pg.id}>
            <div className="main"><b>{MEDIO[pg.medio]}{pg.es_reintegro ? " · reintegro" : ""}</b><span>{[pg.cuenta_destino, pg.referencia].filter(Boolean).join(" · ")}</span></div>
            {pg.estado === "confirmado" ? <span className="chip ok">Confirmado</span> : <span className="chip warn">Pendiente</span>}
            {admin && pg.estado === "pendiente" && <AccionesVenta tipo="confirmar" pagoId={pg.id} />}
            <span className="amt">{pesos(pg.monto)}</span>
          </div>
        ))}
        {!pagos?.length && <div className="row"><span style={{ color: "var(--muted)" }}>Sin pagos cargados.</span></div>}
      </div>
      <div className="totals" style={{ marginTop: 10 }}>
        <span className="l">Total venta</span><span>{pesos(v.total)}</span>
        {Number(v.esperado) !== Number(v.total) && <><span className="l">Esperado neto de cargos</span><span>{pesos(v.esperado)}</span></>}
        <span className="l">Cobrado confirmado</span><span>{pesos(v.cobrado)}</span>
        <span className="l">Por verificar</span><span>{pesos(v.por_verificar)}</span>
        <span className="l"><b>Saldo</b></span><span><b>{pesos(v.saldo)}</b></span>
      </div>
      {!v.anulada && Number(v.saldo) > 0.5 && <AccionesVenta tipo="cobrar" ventaId={id} saldo={Number(v.saldo)} />}
    </>
  );
}
