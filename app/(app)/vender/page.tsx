import { exigir } from "@/lib/perfil";
import { supabaseServer } from "@/lib/supabase/server";
import { ubicaciones, bandasMapa, fotosFirmadas, colorDe, type FilaStock } from "@/lib/datos";
import Ransom from "@/components/Ransom";
import VenderCliente from "./VenderCliente";

export default async function VenderPage() {
  const p = await exigir("admin", "vendedor");
  const sb = await supabaseServer();
  const [ubis, bandas, stockR, cajasR, cfgR] = await Promise.all([
    ubicaciones(),
    bandasMapa(),
    sb.from("v_stock").select("*").order("producto"),
    sb.from("cajas").select("id,ubicacion_id,fecha,estado").eq("estado", "abierta"),
    sb.from("configuracion").select("valor").eq("clave", "cuentas_destino").maybeSingle(),
  ]);
  const stock = (stockR.data ?? []) as FilaStock[];
  const fotos = await fotosFirmadas(stock.map((s) => s.foto_path));
  const duenos = Object.fromEntries(
    [...new Set(stock.map((s) => s.banda_id))].map((b) => [b ?? "ap", { nombre: b ? bandas[b]?.nombre ?? "Banda" : "AMOR & PUNK", color: colorDe(b, bandas) }]),
  );
  return (
    <>
      <Ransom texto="VENDER" />
      <p className="lede">Elegí el canal, tocá talle y color o escaneá el QR, y cargá cómo pagó.</p>
      <VenderCliente
        rol={p.rol}
        ubicaciones={ubis}
        stock={stock}
        fotos={fotos}
        duenos={duenos}
        cajasAbiertas={(cajasR.data ?? []).map((c: any) => c.ubicacion_id)}
        cuentas={(cfgR.data?.valor as string[]) ?? ["MP A&P"]}
      />
    </>
  );
}
