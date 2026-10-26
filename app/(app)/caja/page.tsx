import { exigir } from "@/lib/perfil";
import { supabaseServer } from "@/lib/supabase/server";
import { ubicaciones } from "@/lib/datos";
import Ransom from "@/components/Ransom";
import CajaCliente from "./CajaCliente";

export default async function CajaPage() {
  const p = await exigir("admin", "vendedor");
  const sb = await supabaseServer();
  const ubis = await ubicaciones();
  const admin = p.rol === "admin";
  const [{ data: abiertas }, { data: resumen }, { data: movs }] = await Promise.all([
    sb.from("cajas").select("id,ubicacion_id,fecha,estado").eq("estado", "abierta"),
    admin ? sb.from("v_cajas").select("*").order("fecha", { ascending: false }).limit(30) : Promise.resolve({ data: [] as any[] }),
    admin ? sb.from("caja_movimientos").select("id,caja_id,tipo,concepto,monto,created_at").order("created_at", { ascending: false }).limit(300) : Promise.resolve({ data: [] as any[] }),
  ]);
  return (
    <>
      <Ransom texto="CAJA" />
      <p className="lede">Una caja por lugar y por día. Acá se cuenta solo el efectivo; las transferencias se controlan aparte.</p>
      <CajaCliente
        rol={p.rol}
        lugares={ubis.filter((u) => u.tipo !== "deposito")}
        abiertas={(abiertas ?? []) as any[]}
        resumen={(resumen ?? []) as any[]}
        movimientos={(movs ?? []) as any[]}
      />
    </>
  );
}
