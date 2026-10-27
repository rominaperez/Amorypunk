"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { supabaseBrowser } from "@/lib/supabase/client";
import { pesos, varianteNombre, errorLegible } from "@/lib/formato";
import type { Ubicacion } from "@/lib/datos";
import type { Rol } from "@/lib/perfil";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";

type Var = { id: string; talle: string; color: string; codigo: string; stock: Record<string, { cantidad: number; reservada: number }> };
export type Prod = {
  id: string; codigo: string; nombre: string; categoria: string | null; descripcion: string | null; banda_id: string | null;
  precio: number; precio_online: number | null; foto: string | null;
  costo: number | null | undefined; pagado_por: "ap" | "banda" | null;
  dueno: string; color: string; variantes: Var[];
};
type Props = { rol: Rol; productos: Prod[]; ubicaciones: Ubicacion[]; bandas: { id: string; nombre: string }[]; minimo: number };
type Abierto =
  | { k: "nuevo" } | { k: "ingreso"; vid?: string } | { k: "traslado"; vid?: string }
  | { k: "qr"; p: Prod; v?: Var } | { k: "costo"; p: Prod } | { k: "editar"; p: Prod } | null;

const disp = (v: Var, u?: string) =>
  u ? (v.stock[u]?.cantidad ?? 0) - (v.stock[u]?.reservada ?? 0)
    : Object.values(v.stock).reduce((a, s) => a + s.cantidad - s.reservada, 0);
const iniciales = (n: string) => n.replace(/[^\p{L}\d ]/gu, "").split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

// Achica la foto en el celu antes de subirla (máx. 900 px, JPG).
async function achicar(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 900 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error("No pude procesar la foto"))), "image/jpeg", 0.85));
}
async function subirFoto(productoId: string, file: File) {
  const sb = supabaseBrowser();
  const path = `${productoId}/${Date.now()}.jpg`;
  const { error } = await sb.storage.from("fotos").upload(path, await achicar(file), { contentType: "image/jpeg" });
  if (error) throw error;
  const r = await sb.from("productos").update({ foto_path: path }).eq("id", productoId);
  if (r.error) throw r.error;
}

export default function StockCliente({ rol, productos, ubicaciones, bandas, minimo }: Props) {
  const router = useRouter();
  const { toast, nodo } = useToast();
  const admin = rol === "admin";
  const [dueno, setDueno] = useState("todos");
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<Abierto>(null);
  const cerrar = () => setAbierto(null);
  const listo = (m: string) => { cerrar(); toast(m); router.refresh(); };

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return productos.filter((p) =>
      (dueno === "todos" || (dueno === "ap" ? p.banda_id == null : p.banda_id === dueno)) &&
      (!t || `${p.nombre} ${p.dueno} ${p.codigo}`.toLowerCase().includes(t)));
  }, [productos, dueno, q]);

  return (
    <>
      <div className="filters">
        {rol !== "banda" && (
          <div className="field"><label>Propietario</label>
            <div className="seg">
              {[["todos", "Todos"], ["ap", "A&P"], ...bandas.map((b) => [b.id, b.nombre])].map(([k, l]) => (
                <button key={k} className={dueno === k ? "on" : ""} onClick={() => setDueno(k)}>{l}</button>
              ))}
            </div>
          </div>
        )}
        <div className="field" style={{ minWidth: 200 }}><label htmlFor="s-q">Buscar</label><input id="s-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o código" /></div>
        {admin && (
          <div className="flex" style={{ marginLeft: "auto" }}>
            <button className="btn" onClick={() => setAbierto({ k: "nuevo" })}>Nuevo producto</button>
            <button className="btn ghost" onClick={() => setAbierto({ k: "ingreso" })}>Ingreso</button>
            <button className="btn ghost" onClick={() => setAbierto({ k: "traslado" })}>Trasladar</button>
          </div>
        )}
      </div>

      <div className="stock">
        {lista.map((p) => {
          const tot = p.variantes.reduce((a, v) => a + disp(v), 0);
          const usados = ubicaciones.filter((u) => u.tipo !== "feria" || p.variantes.some((v) => v.stock[u.id]?.cantidad));
          return (
            <div className="pcard" key={p.id}>
              <div className="flex" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                {admin ? (
                  <label className="thumbbtn" aria-label={`Foto de ${p.nombre}`} style={{ cursor: "pointer" }}>
                    {p.foto ? <img className="thumb" src={p.foto} alt="" /> : <div className="thumb" style={{ background: p.color }}>{iniciales(p.nombre)}</div>}
                    <span>{p.foto ? "CAMBIAR" : "+ FOTO"}</span>
                    <input type="file" accept="image/*" hidden onChange={async (e) => {
                      const f = e.target.files?.[0]; if (!f) return;
                      toast("Subiendo foto…");
                      try { await subirFoto(p.id, f); toast("Foto cargada."); router.refresh(); } catch (err: any) { toast(errorLegible(err)); }
                    }} />
                  </label>
                ) : p.foto ? <img className="thumb" src={p.foto} alt="" /> : <div className="thumb" style={{ background: p.color }}>{iniciales(p.nombre)}</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{p.nombre}</b>
                  <div className="flex" style={{ gap: 6, marginTop: 4 }}>
                    <span className="chip" style={{ background: p.color, color: "#fff" }}>{p.dueno}</span>
                    {p.categoria && <span className="chip">{p.categoria}</span>}
                    <span className="mono" style={{ color: "var(--muted)" }}>{p.codigo}</span>
                  </div>
                  {p.descripcion && <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted)" }}>{p.descripcion}</p>}
                </div>
                <div style={{ textAlign: "right" }}><b className="num">{pesos(p.precio)}</b><br /><small style={{ color: "var(--muted)" }}>{tot} disp.</small></div>
              </div>
              {p.costo !== undefined && (
                <div className="flex" style={{ marginTop: 8, fontSize: 13, gap: 8 }}>
                  {p.costo == null ? <span className="chip warn">Costo pendiente</span>
                    : <><span>Costo <b className="num">{pesos(p.costo)}</b></span><span className="chip">Pagó {p.pagado_por === "banda" ? "la banda" : "A&P"}</span></>}
                  {p.precio_online != null && <span style={{ color: "var(--muted)" }}>Online {pesos(p.precio_online)}</span>}
                  {admin && <button className="btn sm ghost" onClick={() => setAbierto({ k: "costo", p })}>Editar costo</button>}
                </div>
              )}
              <div className="tw" style={{ marginTop: 10 }}>
                <table>
                  <thead><tr><th>Variante</th>{usados.map((u) => <th key={u.id} className="r">{u.nombre.replace("Feria ", "F. ")}</th>)}<th /></tr></thead>
                  <tbody>
                    {p.variantes.map((v) => {
                      const d = disp(v), res = Object.values(v.stock).reduce((a, s) => a + s.reservada, 0);
                      return (
                        <tr key={v.id}>
                          <td>{varianteNombre(v)}<br /><span className="mono" style={{ color: "var(--muted)" }}>{v.codigo}</span>
                            {res > 0 && <> <span className="chip warn">{res} res.</span></>}
                            {d <= minimo && <> <span className="chip bad">{d <= 0 ? "Sin stock" : "Bajo"}</span></>}
                          </td>
                          {usados.map((u) => <td key={u.id} className="r">{v.stock[u.id]?.cantidad || <span style={{ color: "var(--muted)" }}>0</span>}</td>)}
                          <td className="r"><div className="flex" style={{ justifyContent: "flex-end", gap: 4, flexWrap: "nowrap" }}>
                            {admin && <button className="btn sm ghost" onClick={() => setAbierto({ k: "traslado", vid: v.id })}>Mover</button>}
                            <button className="btn sm ghost" onClick={() => setAbierto({ k: "qr", p, v })}>QR</button>
                          </div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {rol !== "banda" && <div className="flex" style={{ marginTop: 10 }}>
                <button className="btn sm ghost" onClick={() => setAbierto({ k: "qr", p })}>Etiquetas</button>
                {admin && <button className="btn sm ghost" onClick={() => setAbierto({ k: "editar", p })}>Editar</button>}
              </div>}
            </div>
          );
        })}
        {!lista.length && <div className="empty">{productos.length ? "No hay productos con ese filtro." : admin ? "Todavía no hay productos. Tocá \"Nuevo producto\" para cargar el primero." : "Todavía no hay productos cargados."}</div>}
      </div>

      {abierto?.k === "nuevo" && <NuevoProducto bandas={bandas} ubicaciones={ubicaciones} onCerrar={cerrar} onListo={listo} />}
      {abierto?.k === "ingreso" && <Ingreso productos={productos} ubicaciones={ubicaciones} vid={abierto.vid} onCerrar={cerrar} onListo={listo} />}
      {abierto?.k === "traslado" && <Traslado productos={productos} ubicaciones={ubicaciones} vid={abierto.vid} onCerrar={cerrar} onListo={listo} />}
      {abierto?.k === "costo" && <Costo p={abierto.p} onCerrar={cerrar} onListo={listo} />}
      {abierto?.k === "editar" && <Editar p={abierto.p} onCerrar={cerrar} onListo={listo} />}
      {abierto?.k === "qr" && <Etiquetas p={abierto.p} v={abierto.v} onCerrar={cerrar} />}
      {nodo}
    </>
  );
}

// ---------- formularios ----------
const CATEGORIAS = ["Remeras", "Buzos", "Musculosas", "Gorras", "Muñecos", "Accesorios", "Discos", "Parches y pines", "Otros"];
type FormP = { onCerrar: () => void; onListo: (m: string) => void };

function useEnvio() {
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  async function enviar(fn: () => Promise<{ error: any } | void>, ok: () => void) {
    setCargando(true); setError(null);
    try {
      const r = await fn();
      if (r && r.error) throw r.error;
      ok();
    } catch (e: any) { setError(errorLegible(e)); } finally { setCargando(false); }
  }
  return { error, setError, cargando, enviar };
}

function NuevoProducto({ bandas, ubicaciones, onCerrar, onListo }: FormP & { bandas: { id: string; nombre: string }[]; ubicaciones: Ubicacion[] }) {
  const { error, setError, cargando, enviar } = useEnvio();
  const [dueno, setDueno] = useState("");
  const [cat, setCat] = useState("Remeras");
  const [talles, setTalles] = useState("S, M, L, XL");
  const [colores, setColores] = useState("Negro");
  function cambiarCat(c: string) {
    setCat(c);
    const conTalle = /remera|buzo|campera|musculosa|gorra/i.test(c);
    setTalles(conTalle ? "S, M, L, XL" : "");
    setColores(conTalle ? "Negro" : "");
  }
  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget), g = (k: string) => String(f.get(k) ?? "").trim();
    if (!g("nombre")) return setError("Poné el nombre del producto.");
    if (!Number(g("precio"))) return setError("Poné el precio.");
    const lista = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
    const foto = f.get("foto") as File | null;
    await enviar(async () => {
      const sb = supabaseBrowser();
      const { data, error } = await sb.rpc("crear_producto", {
        p: {
          nombre: g("nombre"), categoria: cat, descripcion: g("descripcion"), banda_id: dueno || null,
          precio: Number(g("precio")), precio_online: Number(g("precio_online")) || null,
          costo_unit: g("costo") === "" ? null : Number(g("costo")), pagado_por: dueno ? g("pagado_por") : "ap",
          talles: lista(g("talles")).map((t) => t.toUpperCase()), colores: lista(g("colores")),
          cantidad: Number(g("cantidad")) || 0, ubicacion_id: g("ubicacion"),
        },
      });
      if (error) return { error };
      if (foto && foto.size) await subirFoto(data as string, foto);
    }, () => onListo(`${g("nombre")} creado.`));
  }
  return (
    <Modal titulo="Nuevo producto" onCerrar={onCerrar}>
      <form onSubmit={guardar}>
        <div className="fields">
          <div className="field" style={{ gridColumn: "1/-1" }}><label htmlFor="np-n">Nombre</label><input id="np-n" name="nombre" placeholder="Ej: Remera tour 2026" /></div>
          <div className="field"><label htmlFor="np-o">Propietario</label>
            <select id="np-o" value={dueno} onChange={(e) => setDueno(e.target.value)}>
              <option value="">AMOR &amp; PUNK</option>{bandas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select></div>
          <div className="field"><label htmlFor="np-c">Categoría</label>
            <input id="np-c" list="categorias" value={cat} onChange={(e) => cambiarCat(e.target.value)} placeholder="Elegí o escribí una" /></div>
          <div className="field" style={{ gridColumn: "1/-1" }}><label htmlFor="np-d">Descripción (opcional)</label>
            <textarea id="np-d" name="descripcion" rows={2} placeholder="Ej: Muñeco de tela hecho a mano, 30 cm" /></div>
          <div className="field"><label htmlFor="np-p">Precio local</label><input id="np-p" name="precio" inputMode="numeric" placeholder="25000" /></div>
          <div className="field"><label htmlFor="np-po">Precio Tiendanube</label><input id="np-po" name="precio_online" inputMode="numeric" placeholder="Igual al local" /></div>
          <div className="field"><label htmlFor="np-k">Costo unitario</label><input id="np-k" name="costo" inputMode="numeric" placeholder="Vacío = pendiente" /></div>
          {dueno && <div className="field"><label htmlFor="np-pg">Lo pagó</label><select id="np-pg" name="pagado_por"><option value="banda">La banda</option><option value="ap">A&amp;P</option></select></div>}
          <div className="field"><label htmlFor="np-t">Talles</label><input id="np-t" name="talles" value={talles} onChange={(e) => setTalles(e.target.value)} placeholder="Vacío si no lleva" /></div>
          <div className="field"><label htmlFor="np-col">Colores</label><input id="np-col" name="colores" value={colores} onChange={(e) => setColores(e.target.value)} placeholder="Vacío si no lleva" /></div>
          <div className="field"><label htmlFor="np-q">{talles.trim() || colores.trim() ? "Cantidad por variante" : "Cantidad"}</label><input id="np-q" name="cantidad" inputMode="numeric" defaultValue="0" /></div>
          <div className="field"><label htmlFor="np-l">Ubicación</label>
            <select id="np-l" name="ubicacion">{ubicaciones.filter((u) => u.tipo !== "feria").map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></div>
          <div className="field" style={{ gridColumn: "1/-1" }}><label htmlFor="np-f">Foto (opcional)</label><input id="np-f" name="foto" type="file" accept="image/*" /></div>
        </div>
        <datalist id="categorias">{CATEGORIAS.map((c) => <option key={c} value={c} />)}</datalist>
        <p className="note">Para muñecos, discos o accesorios dejá talles y colores vacíos. Si no, se crea una variante por cada talle y color, con su código y su QR. Si una banda deja en consignación, elegí la banda y &quot;La banda&quot; en quién pagó.</p>
        {error && <p className="err">{error}</p>}
        <button className="btn big" disabled={cargando}>{cargando ? "Creando…" : "Crear producto"}</button>
      </form>
    </Modal>
  );
}

function selectorVariante(productos: Prod[], vid?: string) {
  return (
    <select id="mv-v" name="variante" defaultValue={vid}>
      {productos.flatMap((p) => p.variantes.map((v) => <option key={v.id} value={v.id}>{p.nombre} · {varianteNombre(v)} ({p.dueno})</option>))}
    </select>
  );
}

function Ingreso({ productos, ubicaciones, vid, onCerrar, onListo }: FormP & { productos: Prod[]; ubicaciones: Ubicacion[]; vid?: string }) {
  const { error, cargando, enviar } = useEnvio();
  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await enviar(() => supabaseBrowser().rpc("ingresar_stock", {
      p_variante: f.get("variante"), p_ubicacion: f.get("ubicacion"), p_cantidad: Number(f.get("cantidad")) || 0, p_motivo: f.get("motivo"),
    }), () => onListo("Ingreso registrado."));
  }
  return (
    <Modal titulo="Ingreso de stock" onCerrar={onCerrar}>
      <form onSubmit={guardar}>
        <p style={{ marginTop: 0, color: "var(--muted)" }}>Para sumar unidades a algo que ya existe: reposición, consignación o devolución de un cliente.</p>
        <div className="fields">
          <div className="field" style={{ gridColumn: "1/-1" }}><label htmlFor="mv-v">Producto</label>{selectorVariante(productos, vid)}</div>
          <div className="field"><label htmlFor="in-q">Cantidad</label><input id="in-q" name="cantidad" inputMode="numeric" defaultValue="5" /></div>
          <div className="field"><label htmlFor="in-l">Ubicación</label><select id="in-l" name="ubicacion">{ubicaciones.filter((u) => u.tipo !== "feria").map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></div>
          <div className="field"><label htmlFor="in-m">Motivo</label><select id="in-m" name="motivo"><option>Reposición</option><option>Consignación de la banda</option><option>Devolución de cliente</option></select></div>
        </div>
        {error && <p className="err" style={{ marginTop: 10 }}>{error}</p>}
        <button className="btn big" style={{ marginTop: 12 }} disabled={cargando}>Registrar ingreso</button>
      </form>
    </Modal>
  );
}

function Traslado({ productos, ubicaciones, vid, onCerrar, onListo }: FormP & { productos: Prod[]; ubicaciones: Ubicacion[]; vid?: string }) {
  const { error, setError, cargando, enviar } = useEnvio();
  const showroom = ubicaciones.find((u) => u.tipo === "showroom")?.id ?? "";
  const feria = ubicaciones.find((u) => u.tipo === "feria")?.id;
  const [v, setV] = useState(vid ?? productos[0]?.variantes[0]?.id ?? "");
  const [desde, setDesde] = useState(showroom);
  const [hacia, setHacia] = useState(feria ?? ubicaciones.find((u) => u.id !== showroom)?.id ?? "");
  const variante = productos.flatMap((p) => p.variantes).find((x) => x.id === v);
  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (desde === hacia) return setError("Elegí un destino distinto del origen.");
    const q = Number(new FormData(e.currentTarget).get("cantidad")) || 0;
    await enviar(() => supabaseBrowser().rpc("trasladar", { p_variante: v, p_desde: desde, p_hacia: hacia, p_cantidad: q, p_motivo: null }),
      () => onListo("Traslado registrado. No genera venta."));
  }
  const opts = ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>);
  return (
    <Modal titulo="Trasladar" onCerrar={onCerrar}>
      <form onSubmit={guardar}>
        <p style={{ marginTop: 0, color: "var(--muted)" }}>Llevar a una feria o devolver el sobrante son traslados: cambian dónde está, no generan venta.</p>
        <div className="fields">
          <div className="field" style={{ gridColumn: "1/-1" }}><label htmlFor="tr-v">Producto</label>
            <select id="tr-v" value={v} onChange={(e) => setV(e.target.value)}>
              {productos.flatMap((p) => p.variantes.map((x) => <option key={x.id} value={x.id}>{p.nombre} · {varianteNombre(x)}</option>))}
            </select></div>
          <div className="field"><label htmlFor="tr-d">Desde</label><select id="tr-d" value={desde} onChange={(e) => setDesde(e.target.value)}>{opts}</select></div>
          <div className="field"><label htmlFor="tr-h">Hacia</label><select id="tr-h" value={hacia} onChange={(e) => setHacia(e.target.value)}>{opts}</select></div>
          <div className="field"><label htmlFor="tr-q">Cantidad</label><input id="tr-q" name="cantidad" inputMode="numeric" defaultValue="1" /></div>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Hay {variante ? disp(variante, desde) : 0} disponibles en {ubicaciones.find((u) => u.id === desde)?.nombre}.</p>
        {error && <p className="err">{error}</p>}
        <button className="btn big" disabled={cargando}>Registrar traslado</button>
      </form>
    </Modal>
  );
}

function Costo({ p, onCerrar, onListo }: FormP & { p: Prod }) {
  const { error, cargando, enviar } = useEnvio();
  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget), c = String(f.get("costo") ?? "").trim();
    await enviar(() => supabaseBrowser().rpc("cambiar_costo", { p_producto: p.id, p_costo: c === "" ? null : Number(c), p_pagado_por: p.banda_id ? f.get("pagado_por") : "ap" }),
      () => onListo("Costo guardado."));
  }
  return (
    <Modal titulo={`Costo · ${p.nombre}`} onCerrar={onCerrar}>
      <form onSubmit={guardar}>
        <div className="fields">
          <div className="field"><label htmlFor="co-c">Costo unitario</label><input id="co-c" name="costo" inputMode="numeric" defaultValue={p.costo ?? ""} placeholder="Vacío = pendiente" /></div>
          {p.banda_id && <div className="field"><label htmlFor="co-p">Lo pagó</label><select id="co-p" name="pagado_por" defaultValue={p.pagado_por ?? "banda"}><option value="banda">La banda</option><option value="ap">A&amp;P</option></select></div>}
        </div>
        <p className="note">Vale para las ventas que se carguen desde ahora. Las anteriores conservan el costo que tenían.</p>
        {error && <p className="err">{error}</p>}
        <button className="btn big" disabled={cargando}>Guardar</button>
      </form>
    </Modal>
  );
}

function Etiqueta({ p, v }: { p: Prod; v: Var }) {
  const [svg, setSvg] = useState("");
  useEffect(() => { QRCode.toString(v.codigo, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then(setSvg); }, [v.codigo]);
  return (
    <div className="label">
      <div dangerouslySetInnerHTML={{ __html: svg }} style={{ maxWidth: 140, margin: "0 auto" }} />
      <b>{p.nombre}</b>
      <span style={{ fontSize: 12 }}>{varianteNombre(v)} · {pesos(p.precio)}</span><br />
      <span className="mono">{v.codigo}</span>
    </div>
  );
}

function Etiquetas({ p, v, onCerrar }: { p: Prod; v?: Var; onCerrar: () => void }) {
  const vs = v ? [v] : p.variantes;
  return (
    <Modal titulo={v ? `QR ${v.codigo}` : "Etiquetas"} onCerrar={onCerrar}>
      <div className="qrs">{vs.map((x) => <Etiqueta key={x.id} p={p} v={x} />)}</div>
      <p className="note">Al escanearlo en Vender, la variante se suma directo a la venta.</p>
      <button className="btn big" onClick={() => window.print()}>Imprimir</button>
    </Modal>
  );
}

function Editar({ p, onCerrar, onListo }: FormP & { p: Prod }) {
  const { error, setError, cargando, enviar } = useEnvio();
  const [confirmar, setConfirmar] = useState(false);
  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget), g = (k: string) => String(f.get(k) ?? "").trim();
    if (!g("nombre")) return setError("Poné el nombre del producto.");
    if (!Number(g("precio"))) return setError("Poné el precio.");
    await enviar(() => supabaseBrowser().rpc("editar_producto", {
      p_producto: p.id,
      p: { nombre: g("nombre"), categoria: g("categoria"), descripcion: g("descripcion"), precio: Number(g("precio")), precio_online: g("precio_online") === "" ? null : Number(g("precio_online")) },
    }), () => onListo("Producto actualizado."));
  }
  async function eliminar() {
    await enviar(() => supabaseBrowser().rpc("eliminar_producto", { p_producto: p.id }), () => onListo(`${p.nombre} eliminado.`));
  }
  return (
    <Modal titulo={`Editar · ${p.nombre}`} onCerrar={onCerrar}>
      <form onSubmit={guardar}>
        <div className="fields">
          <div className="field" style={{ gridColumn: "1/-1" }}><label htmlFor="ed-n">Nombre</label><input id="ed-n" name="nombre" defaultValue={p.nombre} /></div>
          <div className="field"><label htmlFor="ed-c">Categoría</label><input id="ed-c" name="categoria" list="categorias-ed" defaultValue={p.categoria ?? ""} /></div>
          <div className="field"><label htmlFor="ed-p">Precio local</label><input id="ed-p" name="precio" inputMode="numeric" defaultValue={p.precio} /></div>
          <div className="field"><label htmlFor="ed-po">Precio Tiendanube</label><input id="ed-po" name="precio_online" inputMode="numeric" defaultValue={p.precio_online ?? ""} placeholder="Igual al local" /></div>
          <div className="field" style={{ gridColumn: "1/-1" }}><label htmlFor="ed-d">Descripción</label><textarea id="ed-d" name="descripcion" rows={3} defaultValue={p.descripcion ?? ""} /></div>
        </div>
        <datalist id="categorias-ed">{CATEGORIAS.map((c) => <option key={c} value={c} />)}</datalist>
        <p className="note">El precio nuevo vale para las ventas que vienen. Las anteriores guardan el precio con el que se vendieron.</p>
        {error && <p className="err">{error}</p>}
        <button className="btn big" disabled={cargando}>Guardar cambios</button>
      </form>
      <h3>Eliminar producto</h3>
      {!confirmar ? (
        <button className="btn ghost" onClick={() => setConfirmar(true)} disabled={cargando}>Eliminar {p.nombre}</button>
      ) : (
        <div className="pcard" style={{ borderColor: "var(--red)" }}>
          <p style={{ marginTop: 0 }}>Deja de aparecer en Stock y en Vender. Las ventas que ya tuvo siguen en el historial y en las cuentas de las bandas.</p>
          <div className="flex">
            <button className="btn" style={{ background: "var(--red)", borderColor: "var(--red)", color: "var(--on-red)" }} onClick={eliminar} disabled={cargando}>Sí, eliminar</button>
            <button className="btn ghost" onClick={() => setConfirmar(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
