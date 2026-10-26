import { exigir } from "@/lib/perfil";
import { supabaseServer } from "@/lib/supabase/server";
import { pesos } from "@/lib/formato";
import Ransom from "@/components/Ransom";
import NuevaFeria from "./NuevaFeria";

export default async function FeriasPage() {
  await exigir("admin");
  const sb = await supabaseServer();
  const [{ data: ferias }, { data: res }, { data: stock }] = await Promise.all([
    sb.from("ubicaciones").select("id,nombre,fecha,direccion,activa").eq("tipo", "feria").order("fecha", { ascending: false }),
    sb.from("v_resultado_ferias").select("*"),
    sb.from("v_stock").select("ubicacion_id,cantidad").eq("tipo_ubicacion", "feria"),
  ]);
  const R = Object.fromEntries((res ?? []).map((r: any) => [r.feria_id, r]));
  const U: Record<string, number> = {};
  (stock ?? []).forEach((s: any) => (U[s.ubicacion_id] = (U[s.ubicacion_id] ?? 0) + s.cantidad));
  return (
    <>
      <Ransom texto="FERIAS" />
      <p className="lede">Cada feria es un lugar más: se le lleva stock desde Stock → Trasladar, se vende ahí y tiene su caja y su resultado.</p>
      <NuevaFeria />
      <div className="grid" style={{ marginTop: 14 }}>
        {(ferias ?? []).map((f: any) => {
          const r = R[f.id];
          return (
            <div className="pcard" key={f.id}>
              <div className="head"><b>{f.nombre}</b><span className="chip red">{f.fecha?.split("-").reverse().join("/")}</span>{f.direccion && <span style={{ color: "var(--muted)", fontSize: 13 }}>{f.direccion}</span>}</div>
              <div className="totals" style={{ marginTop: 10 }}>
                <span className="l">Unidades en la feria ahora</span><span>{U[f.id] ?? 0}</span>
                <span className="l">Vendido neto</span><span>{pesos(r?.vendido_neto)}</span>
                <span className="l">Ganancia showroom</span><span>{pesos(r?.ganancia_showroom)}</span>
                <span className="l">Puesto, flete y gastos</span><span>{pesos(-(r?.gastos ?? 0))}</span>
                <span className="l"><b>Resultado</b></span><span><span className={`chip ${Number(r?.resultado) < 0 ? "bad" : "ok"}`}>{pesos(r?.resultado ?? 0)}</span></span>
              </div>
            </div>
          );
        })}
        {!ferias?.length && <div className="empty">Todavía no hay ferias. Creá la primera.</div>}
      </div>
    </>
  );
}
