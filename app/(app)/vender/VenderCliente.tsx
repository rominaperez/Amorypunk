"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { pesos, varianteNombre, errorLegible } from "@/lib/formato";
import type { FilaStock, Ubicacion } from "@/lib/datos";
import type { Rol } from "@/lib/perfil";
import Escaner from "@/components/Escaner";
import { useToast } from "@/components/Toast";

type Canal = "showroom" | "feria" | "tiendanube";
type Props = {
  rol: Rol; ubicaciones: Ubicacion[]; stock: FilaStock[]; fotos: Record<string, string>;
  duenos: Record<string, { nombre: string; color: string }>; cajasAbiertas: string[]; cuentas: string[];
};

const nuevaClave = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
const num = (s: string) => Math.max(0, Number(s.replace(/\./g, "").replace(",", ".")) || 0);

export default function VenderCliente({ rol, ubicaciones, stock, fotos, duenos, cajasAbiertas, cuentas }: Props) {
  const router = useRouter();
  const { toast, nodo } = useToast();
  const showroom = ubicaciones.find((u) => u.tipo === "showroom");
  const ferias = ubicaciones.filter((u) => u.tipo === "feria");
  const locales = ubicaciones.filter((u) => u.tipo !== "feria");

  const [canal, setCanal] = useState<Canal>("showroom");
  const [origen, setOrigen] = useState(showroom?.id ?? "");
  const [feria, setFeria] = useState(ferias[0]?.id ?? "");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Record<string, number>>({});
  const [f, setF] = useState({ descuento: "", pedido: "", cargos: "", envio: "", efectivo: "", transf: "", cuenta: cuentas[0] ?? "", ref: "" });
  const [clave, setClave] = useState(nuevaClave);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [escanear, setEscanear] = useState(false);

  const ubic = canal === "feria" ? feria : origen;
  const tn = canal === "tiendanube";
  const filas = useMemo(() => stock.filter((s) => s.ubicacion_id === ubic), [stock, ubic]);
  const porVar = useMemo(() => Object.fromEntries(filas.map((s) => [s.variante_id, s])), [filas]);

  const productos = useMemo(() => {
    const t = q.trim().toLowerCase();
    const m = new Map<string, { p: FilaStock; vs: FilaStock[] }>();
    for (const s of filas) {
      const dueno = duenos[s.banda_id ?? "ap"]?.nombre ?? "";
      if (t && !`${s.producto} ${dueno} ${s.variante_codigo}`.toLowerCase().includes(t)) continue;
      if (!m.has(s.producto_id)) m.set(s.producto_id, { p: s, vs: [] });
      m.get(s.producto_id)!.vs.push(s);
    }
    return [...m.values()];
  }, [filas, q, duenos]);

  const precio = (s: FilaStock) => (tn ? s.precio_online ?? s.precio : s.precio);
  const lineas = Object.entries(items).filter(([vid]) => porVar[vid]).map(([vid, qty]) => ({ s: porVar[vid], qty }));
  const bruto = lineas.reduce((a, l) => a + precio(l.s) * l.qty, 0);
  const total = Math.max(0, bruto - num(f.descuento));
  const cargos = tn ? num(f.cargos) : 0;
  const cobrado = tn ? 0 : num(f.efectivo) + num(f.transf);
  const saldo = (tn ? total - cargos : total) - cobrado;
  const cajaLugar = ubicaciones.find((u) => u.id === ubic)?.tipo === "deposito" ? showroom?.id : ubic;
  const sinCaja = !tn && num(f.efectivo) > 0 && !cajasAbiertas.includes(cajaLugar ?? "");

  function cambiarLugar(fn: () => void) { fn(); setItems({}); setError(null); }
  function sumar(vid: string, d = 1) {
    const s = porVar[vid];
    if (!s) return;
    const actual = items[vid] ?? 0, nuevo = actual + d;
    if (nuevo > s.disponible) return toast(`No hay más ${s.producto} ${varianteNombre(s)} disponibles acá.`);
    setItems((it) => { const n = { ...it }; if (nuevo <= 0) delete n[vid]; else n[vid] = nuevo; return n; });
  }
  function leerCodigo(c: string) {
    const code = c.trim().toUpperCase();
    if (!code) return;
    const s = filas.find((x) => x.variante_codigo.toUpperCase() === code);
    if (!s) {
      const otro = stock.find((x) => x.variante_codigo.toUpperCase() === code);
      return toast(otro ? `${otro.producto} ${varianteNombre(otro)} no está en este lugar.` : `No encontré el código ${code}.`);
    }
    if ((items[s.variante_id] ?? 0) + 1 > s.disponible) return toast(`No hay más ${s.producto} ${varianteNombre(s)}.`);
    sumar(s.variante_id);
    toast(`${s.producto} · ${varianteNombre(s)}`);
  }

  async function confirmar() {
    setError(null);
    if (!lineas.length) return;
    if (tn && !f.pedido.trim()) return setError("Falta el número de pedido de Tiendanube.");
    if (num(f.efectivo) > total) return setError("El efectivo no puede superar el total. El vuelto no se carga.");
    if (sinCaja) return setError("No hay caja abierta en este lugar. Abrila desde Caja antes de cobrar en efectivo.");
    const pagos = tn
      ? [{ medio: "tiendanube", monto: total - cargos }]
      : [
          { medio: "efectivo", monto: num(f.efectivo) },
          { medio: "transferencia", monto: num(f.transf), cuenta_destino: f.cuenta, referencia: f.ref },
        ].filter((p) => p.monto > 0);
    setEnviando(true);
    const { data, error } = await supabaseBrowser().rpc("registrar_venta", {
      p: {
        clave_idempotencia: clave, canal, ubicacion_id: ubic,
        tiendanube_pedido: tn ? f.pedido.trim() : null,
        descuento: num(f.descuento), cargos, envio: tn ? num(f.envio) : 0,
        items: lineas.map((l) => ({ variante_id: l.s.variante_id, cantidad: l.qty })),
        pagos,
      },
    });
    setEnviando(false);
    if (error) return setError(errorLegible(error));
    setItems({});
    setF((x) => ({ ...x, descuento: "", pedido: "", cargos: "", envio: "", efectivo: "", transf: "", ref: "" }));
    setClave(nuevaClave());
    router.push(`/ventas/${data}?nueva=1`);
  }

  const campo = (k: keyof typeof f, label: string, ph = "0") => (
    <div className="field">
      <label htmlFor={`f-${k}`}>{label}</label>
      <input id={`f-${k}`} inputMode={k === "ref" ? "text" : "numeric"} placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );

  return (
    <div className="pos">
      <div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Canal de venta</label>
          <div className="seg">
            {(rol === "admin" ? ["showroom", "feria", "tiendanube"] : ["showroom", "feria"]).map((c) => (
              <button key={c} className={canal === c ? "on" : ""} onClick={() => cambiarLugar(() => setCanal(c as Canal))}>
                {{ showroom: "Showroom", feria: "Feria", tiendanube: "Tiendanube" }[c]}
              </button>
            ))}
          </div>
        </div>
        <div className="fields" style={{ marginBottom: 12 }}>
          {canal === "feria" ? (
            <div className="field">
              <label htmlFor="f-feria">Feria</label>
              {ferias.length ? (
                <select id="f-feria" value={feria} onChange={(e) => cambiarLugar(() => setFeria(e.target.value))}>
                  {ferias.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.fecha ? ` · ${x.fecha.split("-").reverse().slice(0, 2).join("/")}` : ""}</option>)}
                </select>
              ) : <span style={{ color: "var(--muted)", fontSize: 14 }}>No hay ferias cargadas.</span>}
            </div>
          ) : (
            <div className="field">
              <label htmlFor="f-origen">Sale de</label>
              <select id="f-origen" value={origen} onChange={(e) => cambiarLugar(() => setOrigen(e.target.value))}>
                {locales.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="f-q">Buscar</label>
            <input id="f-q" placeholder="Nombre, banda o código" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="f-scan">Código o lector USB</label>
            <div className="flex" style={{ flexWrap: "nowrap", gap: 6 }}>
              <input
                id="f-scan" placeholder="Escaneá + Enter" autoComplete="off" style={{ flex: 1, minWidth: 0 }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); leerCodigo(e.currentTarget.value); e.currentTarget.value = ""; } }}
              />
              <button className="btn sm" onClick={() => setEscanear(true)}>Cámara</button>
            </div>
          </div>
        </div>
        <div className="grid">
          {productos.map(({ p, vs }) => {
            const d = duenos[p.banda_id ?? "ap"];
            return (
              <div className="pcard" key={p.producto_id}>
                <div className="head">
                  {p.foto_path && fotos[p.foto_path]
                    ? <img className="thumb sm" src={fotos[p.foto_path]} alt="" />
                    : <div className="thumb sm" style={{ background: d?.color }}>{p.producto.replace(/[^\p{L}\d ]/gu, "").split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</div>}
                  <b>{p.producto}</b>
                  <span className="chip" style={{ background: d?.color, color: "#fff" }}>{d?.nombre}</span>
                  <span className="num" style={{ fontWeight: 800 }}>{pesos(precio(p))}</span>
                </div>
                <div className="vchips">
                  {vs.map((v) => {
                    const av = v.disponible - (items[v.variante_id] ?? 0);
                    return (
                      <button key={v.variante_id} className="vchip" disabled={av <= 0} onClick={() => sumar(v.variante_id)}>
                        {varianteNombre(v)} <small>{av} disp.</small>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!productos.length && <div className="empty">{q ? `No encontré nada con "${q}".` : "No hay stock en este lugar."}</div>}
        </div>
      </div>

      <div className="cartcol">
        <div className="cart">
          <div className="ttl">{tn ? "PEDIDO TIENDANUBE" : "VENTA"} · {(ubicaciones.find((u) => u.id === ubic)?.nombre ?? "").toUpperCase()}</div>
          <div className="body">
            {lineas.length ? lineas.map(({ s, qty }) => (
              <div className="cline" key={s.variante_id}>
                <div className="main"><b>{s.producto}</b><small>{varianteNombre(s)} · {pesos(precio(s))} c/u</small></div>
                <div className="qty">
                  <button onClick={() => sumar(s.variante_id, -1)} aria-label="Restar">−</button>
                  <span>{qty}</span>
                  <button onClick={() => sumar(s.variante_id, 1)} aria-label="Sumar">+</button>
                </div>
              </div>
            )) : <div className="empty">Tocá un talle o escaneá para sumarlo.</div>}

            <div className="fields">
              {tn && <>{campo("pedido", "N° de pedido", "1044")}{campo("cargos", "Cargos y comisiones")}{campo("envio", "Envío (aparte)")}</>}
              {campo("descuento", "Descuento $")}
            </div>
            {!tn && (
              <>
                <div className="fields">{campo("efectivo", "Efectivo")}{campo("transf", "Transferencia")}</div>
                {num(f.transf) > 0 && (
                  <div className="fields">
                    <div className="field">
                      <label htmlFor="f-cuenta">Cuenta destino</label>
                      <select id="f-cuenta" value={f.cuenta} onChange={(e) => setF({ ...f, cuenta: e.target.value })}>
                        {cuentas.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    {campo("ref", "Referencia", "N° de operación")}
                  </div>
                )}
              </>
            )}
            <div className="totals">
              <span className="l">Total</span><span className="big">{pesos(total)}</span>
              {tn ? <><span className="l">Neto a acreditar</span><span>{pesos(total - cargos)}</span></>
                : <><span className="l">Cobrado</span><span>{pesos(cobrado)}</span><span className="l">{saldo < 0 ? "Vuelto" : "Saldo"}</span><span><b>{pesos(Math.abs(saldo))}</b></span></>}
            </div>
            {num(f.transf) > 0 && !tn && <p style={{ margin: 0, fontSize: 12, color: "var(--warn)" }}>La transferencia queda pendiente hasta que un admin la confirme.</p>}
            {sinCaja && <p className="err">No hay caja abierta acá. <Link href="/caja">Abrir caja</Link></p>}
            {error && <p className="err" role="alert">{error}</p>}
            <button className="btn big" disabled={!lineas.length || enviando} onClick={confirmar}>{enviando ? "Guardando…" : "Confirmar venta"}</button>
          </div>
        </div>
      </div>
      {escanear && <Escaner onCodigo={leerCodigo} onCerrar={() => setEscanear(false)} />}
      {nodo}
    </div>
  );
}
