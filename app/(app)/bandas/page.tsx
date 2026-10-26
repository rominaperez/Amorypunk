import Link from "next/link";
import { exigir } from "@/lib/perfil";
import { supabaseServer } from "@/lib/supabase/server";
import { pesos } from "@/lib/formato";
import Ransom from "@/components/Ransom";
import { NuevaBanda, EditarAcuerdo } from "./Formularios";

export default async function BandasPage() {
  await exigir("admin");
  const sb = await supabaseServer();
  const [{ data: cuentas }, { data: acuerdos }] = await Promise.all([
    sb.from("v_cuenta_bandas").select("*").order("nombre"),
    sb.from("acuerdos").select("banda_id,canal,pct_ganancia_banda,vigente_desde").order("vigente_desde", { ascending: false }),
  ]);
  const vig: Record<string, Record<string, number>> = {};
  (acuerdos ?? []).forEach((a: any) => { vig[a.banda_id] ??= {}; vig[a.banda_id][a.canal] ??= Number(a.pct_ganancia_banda); });
  return (
    <>
      <Ransom texto="BANDAS" />
      <p className="lede">Lo que le corresponde a cada banda: el costo que recupera más su parte de la ganancia, menos lo que ya se le entregó.</p>
      <NuevaBanda />
      <div className="tw" style={{ marginTop: 14 }}><table>
        <thead><tr><th>Banda</th><th className="r">Unid.</th><th className="r">Le corresponde</th><th className="r">Entregado</th><th className="r">Saldo</th><th /></tr></thead>
        <tbody>{(cuentas ?? []).map((c: any) => (
          <tr key={c.banda_id}><td><b>{c.nombre}</b></td><td className="r">{c.unidades_vendidas}</td><td className="r">{pesos(c.corresponde)}</td><td className="r">{pesos(c.entregado)}</td><td className="r"><b>{pesos(c.saldo)}</b></td>
            <td className="r"><Link className="btn sm" href={`/bandas/${c.banda_id}`}>Ver</Link></td></tr>
        ))}</tbody>
      </table></div>
      <h3>Acuerdos vigentes</h3>
      <div className="tw"><table>
        <thead><tr><th>Banda</th><th className="r">Showroom</th><th className="r">Ferias</th><th className="r">Tiendanube</th><th /></tr></thead>
        <tbody>{(cuentas ?? []).map((c: any) => {
          const a = vig[c.banda_id] ?? {};
          return (
            <tr key={c.banda_id}><td>{c.nombre}</td>
              {["showroom", "feria", "tiendanube"].map((k) => <td key={k} className="r">{a[k] == null ? "—" : `${a[k]}%`}</td>)}
              <td className="r"><EditarAcuerdo bandaId={c.banda_id} nombre={c.nombre} actual={a} /></td></tr>
          );
        })}</tbody>
      </table></div>
      <p className="note">Porcentaje de la ganancia que va a la banda. El costo siempre vuelve a quien lo pagó y se descuenta una sola vez. Las ventas ya hechas guardan el acuerdo de su momento.</p>
    </>
  );
}
