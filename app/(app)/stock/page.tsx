import { getPerfil } from "@/lib/perfil";
import { supabaseServer } from "@/lib/supabase/server";
import { ubicaciones, bandasMapa, fotosFirmadas, colorDe } from "@/lib/datos";
import Ransom from "@/components/Ransom";
import StockCliente, { type Prod } from "./StockCliente";

export default async function StockPage() {
  const p = await getPerfil();
  const sb = await supabaseServer();
  const [ubis, bandas, prodR, minR] = await Promise.all([
    ubicaciones(),
    bandasMapa(),
    sb.from("productos")
      .select("id,codigo,nombre,categoria,banda_id,precio,precio_online,foto_path,producto_costos(costo_unit,pagado_por),variantes(id,talle,color,codigo,activa,stock(ubicacion_id,cantidad,reservada))")
      .eq("activo", true).order("nombre"),
    sb.from("configuracion").select("valor").eq("clave", "stock_minimo").maybeSingle(),
  ]);
  const prods = (prodR.data ?? []) as any[];
  const fotos = await fotosFirmadas(prods.map((x) => x.foto_path));
  const lista: Prod[] = prods.map((x) => {
    const c = Array.isArray(x.producto_costos) ? x.producto_costos[0] : x.producto_costos;
    return {
      id: x.id, codigo: x.codigo, nombre: x.nombre, categoria: x.categoria, banda_id: x.banda_id,
      precio: Number(x.precio), precio_online: x.precio_online == null ? null : Number(x.precio_online),
      foto: x.foto_path ? fotos[x.foto_path] ?? null : null,
      costo: c ? (c.costo_unit == null ? null : Number(c.costo_unit)) : undefined, pagado_por: c?.pagado_por ?? null,
      dueno: x.banda_id ? bandas[x.banda_id]?.nombre ?? "Banda" : "AMOR & PUNK", color: colorDe(x.banda_id, bandas),
      variantes: (x.variantes ?? []).filter((v: any) => v.activa)
        .sort((a: any, b: any) => (a.color + a.talle).localeCompare(b.color + b.talle))
        .map((v: any) => ({ id: v.id, talle: v.talle, color: v.color, codigo: v.codigo,
          stock: Object.fromEntries((v.stock ?? []).map((s: any) => [s.ubicacion_id, { cantidad: s.cantidad, reservada: s.reservada }])) })),
    };
  });
  const lede = { admin: "Por producto, talle y lugar. Cada variante tiene su código y su QR.", vendedor: "Lo que hay para vender, por talle y lugar.", banda: "Tus productos en A&P: dónde está cada unidad." }[p.rol];
  return (
    <>
      <Ransom texto={p.rol === "banda" ? "MI STOCK" : "STOCK"} />
      <p className="lede">{lede}</p>
      <StockCliente
        rol={p.rol}
        productos={lista}
        ubicaciones={ubis}
        bandas={Object.entries(bandas).map(([id, b]) => ({ id, nombre: b.nombre }))}
        minimo={Number(minR.data?.valor ?? 2)}
      />
    </>
  );
}
