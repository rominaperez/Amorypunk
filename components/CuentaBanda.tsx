import { supabaseServer } from "@/lib/supabase/server";
import { pesos, fecha, CANAL, varianteNombre } from "@/lib/formato";

// Detalle de la cuenta de una banda. Lo usan el admin y la propia banda; la base filtra lo que cada uno puede ver.
export default async function CuentaBanda({ bandaId }: { bandaId: string }) {
  const sb = await supabaseServer();
  const [{ data: cuenta }, { data: lineas }, { data: entregas }, { data: ajustes }] = await Promise.all([
    sb.from("v_cuenta_bandas").select("*").eq("banda_id", bandaId).maybeSingle(),
    sb.from("v_lineas_venta").select("*").eq("banda_id", bandaId).order("fecha", { ascending: false }),
    sb.from("entregas_bandas").select("id,monto,medio,referencia,created_at").eq("banda_id", bandaId).order("created_at", { ascending: false }),
    sb.from("v_ajustes_fallas").select("*").eq("banda_id", bandaId),
  ]);
  if (!cuenta) return <div className="empty">No encontré la cuenta.</div>;
  const porCanal: Record<string, { u: number; v: number; c: number }> = {};
  (lineas ?? []).forEach((l: any) => {
    const k = l.canal === "feria" ? l.ubicacion : CANAL[l.canal];
    porCanal[k] ??= { u: 0, v: 0, c: 0 };
    porCanal[k].u += l.unidades; porCanal[k].v += Number(l.neto); porCanal[k].c += Number(l.total_banda);
  });
  return (
    <>
      <div className="grid kpis">
        <div className="kpi"><small>Le corresponde</small><b>{pesos(cuenta.corresponde)}</b><em>{cuenta.unidades_vendidas} unidades vendidas</em></div>
        <div className="kpi"><small>Entregado</small><b>{pesos(cuenta.entregado)}</b></div>
        <div className="kpi hot"><small>Saldo</small><b>{pesos(cuenta.saldo)}</b></div>
      </div>
      {!!Object.keys(porCanal).length && <>
        <h3>Por canal</h3>
        <div className="tw"><table>
          <thead><tr><th>Canal</th><th className="r">Unid.</th><th className="r">Vendido neto</th><th className="r">Corresponde</th></tr></thead>
          <tbody>{Object.entries(porCanal).map(([k, o]) => <tr key={k}><td>{k}</td><td className="r">{o.u}</td><td className="r">{pesos(o.v)}</td><td className="r"><b>{pesos(o.c)}</b></td></tr>)}</tbody>
        </table></div>
      </>}
      <h3>Operaciones</h3>
      {lineas?.length ? (
        <div className="tw"><table>
          <thead><tr><th>Venta</th><th>Canal</th><th>Producto</th><th className="r">Neto</th><th className="r">Recupera costo</th><th className="r">Ganancia</th><th className="r">Total</th></tr></thead>
          <tbody>{lineas.map((l: any) => (
            <tr key={l.venta_item_id}>
              <td className="mono">V-{l.numero}<br />{fecha(l.fecha)}</td>
              <td>{l.canal === "feria" ? l.ubicacion : CANAL[l.canal]}</td>
              <td>{l.unidades}× {l.producto}<br /><small style={{ color: "var(--muted)" }}>{varianteNombre(l)} · {Number(l.pct_ganancia_banda)}% de la ganancia</small></td>
              <td className="r">{pesos(l.neto)}</td>
              <td className="r">{pesos(l.recupera_banda)}</td>
              <td className="r">{l.costo_pendiente ? <span className="chip warn">costo pend.</span> : pesos(l.ganancia_banda)}</td>
              <td className="r"><b>{pesos(l.total_banda)}</b></td>
            </tr>
          ))}</tbody>
          <tfoot><tr><td colSpan={6}>Total ventas</td><td className="r">{pesos(cuenta.por_ventas)}</td></tr></tfoot>
        </table></div>
      ) : <div className="empty">Todavía no hay ventas.</div>}
      {!!ajustes?.filter((a: any) => Number(a.monto)).length && <>
        <h3>Ajustes por fallas</h3>
        <div className="list">{ajustes.filter((a: any) => Number(a.monto)).map((a: any) => (
          <div className="row" key={a.id}><span className="mono">{fecha(a.fecha)}</span><div className="main"><b style={{ fontWeight: 600 }}>{a.cantidad}× · {a.motivo}</b></div><span className="amt">{pesos(a.monto)}</span></div>
        ))}</div>
      </>}
      <h3>Entregas</h3>
      {entregas?.length ? (
        <div className="list">{entregas.map((e: any) => (
          <div className="row" key={e.id}><span className="mono">{fecha(e.created_at)}</span><div className="main"><b>{e.medio === "efectivo" ? "Efectivo" : "Transferencia"}</b><span>{e.referencia}</span></div><span className="amt">{pesos(e.monto)}</span></div>
        ))}</div>
      ) : <div className="empty">Todavía no hubo entregas.</div>}
    </>
  );
}
