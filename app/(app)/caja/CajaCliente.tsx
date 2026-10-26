"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { pesos, errorLegible } from "@/lib/formato";
import type { Ubicacion } from "@/lib/datos";
import type { Rol } from "@/lib/perfil";
import { useToast } from "@/components/Toast";

type Abierta = { id: string; ubicacion_id: string; fecha: string; estado: string };
type Resumen = { id: string; ubicacion: string; fecha: string; estado: string; efectivo_inicial: number; cobros_efectivo: number; gastos: number; retiros_y_entregas: number; esperado: number; efectivo_contado: number | null; diferencia: number | null };
type Mov = { id: string; caja_id: string; tipo: string; concepto: string; monto: number };

const dmy = (d: string) => d.split("-").reverse().slice(0, 2).join("/");

export default function CajaCliente({ rol, lugares, abiertas, resumen, movimientos }: { rol: Rol; lugares: Ubicacion[]; abiertas: Abierta[]; resumen: Resumen[]; movimientos: Mov[] }) {
  const router = useRouter();
  const { toast, nodo } = useToast();
  const admin = rol === "admin";
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [sel, setSel] = useState(abiertas[0]?.id ?? resumen[0]?.id ?? "");
  const nombre = (uid: string) => lugares.find((l) => l.id === uid)?.nombre ?? "Lugar";

  async function correr(fn: () => PromiseLike<{ error: any }>, ok: string) {
    setCargando(true); setError(null);
    const { error } = await fn();
    setCargando(false);
    if (error) return setError(errorLegible(error));
    toast(ok); router.refresh();
  }
  const sb = () => supabaseBrowser();
  const libres = lugares.filter((l) => !abiertas.some((a) => a.ubicacion_id === l.id));
  const actual = abiertas.find((a) => a.id === sel);
  const r = resumen.find((x) => x.id === sel);

  return (
    <>
      <div className="filters">
        <div className="field"><label>Caja</label>
          <div className="seg">
            {abiertas.map((a) => <button key={a.id} className={sel === a.id ? "on" : ""} onClick={() => setSel(a.id)}>{nombre(a.ubicacion_id)} · abierta</button>)}
            {admin && resumen.filter((x) => x.estado === "cerrada").slice(0, 6).map((x) => <button key={x.id} className={sel === x.id ? "on" : ""} onClick={() => setSel(x.id)}>{x.ubicacion} · {dmy(x.fecha)}</button>)}
          </div>
        </div>
      </div>

      {error && <p className="err" role="alert">{error}</p>}

      <div className="pos">
        <div>
          {r && (
            <div className="cart">
              <div className="ttl">{r.ubicacion.toUpperCase()} · {dmy(r.fecha)} · {r.estado === "abierta" ? "ABIERTA" : "CERRADA"}</div>
              <div className="body">
                <div className="totals">
                  <span className="l">Efectivo inicial</span><span>{pesos(r.efectivo_inicial)}</span>
                  <span className="l">+ Cobros en efectivo</span><span>{pesos(r.cobros_efectivo)}</span>
                  <span className="l">− Gastos</span><span>{pesos(-r.gastos)}</span>
                  <span className="l">− Retiros y entregas</span><span>{pesos(-r.retiros_y_entregas)}</span>
                  <span className="l"><b>= Efectivo esperado</b></span><span className="big">{pesos(r.esperado)}</span>
                  {r.efectivo_contado != null && <>
                    <span className="l">Contado</span><span>{pesos(r.efectivo_contado)}</span>
                    <span className="l"><b>Diferencia</b></span>
                    <span>{Math.abs(Number(r.diferencia)) < 1 ? <span className="chip ok">Cierra justo</span> : <span className={`chip ${Number(r.diferencia) < 0 ? "bad" : "warn"}`}>{Number(r.diferencia) < 0 ? "Falta" : "Sobra"} {pesos(Math.abs(Number(r.diferencia)))}</span>}</span>
                  </>}
                </div>
                {movimientos.filter((m) => m.caja_id === r.id).length > 0 && (
                  <div className="list">{movimientos.filter((m) => m.caja_id === r.id).map((m) => (
                    <div className="row" key={m.id}><span className="chip">{m.tipo === "gasto" ? "Gasto" : "Retiro"}</span><div className="main"><b style={{ fontWeight: 600 }}>{m.concepto}</b></div><span className="amt">{pesos(m.monto)}</span></div>
                  ))}</div>
                )}
              </div>
            </div>
          )}
          {!admin && actual && <p className="note">Caja de {nombre(actual.ubicacion_id)} abierta. Al cerrar contás el efectivo; la diferencia la revisa un admin.</p>}
          {!abiertas.length && !r && <div className="empty">No hay cajas abiertas. Abrí una para empezar a cobrar en efectivo.</div>}

          {actual && (
            <>
              <h3>Cargar gasto{admin ? " o retiro" : ""}</h3>
              <form className="pcard" onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget), form = e.currentTarget;
                correr(() => sb().rpc("movimiento_caja", { p_caja: actual.id, p_tipo: f.get("tipo") ?? "gasto", p_concepto: String(f.get("concepto")).trim(), p_monto: Number(f.get("monto")) || 0 }), "Cargado.")
                  .then(() => form.reset());
              }}>
                <div className="fields">
                  {admin && <div className="field"><label htmlFor="k-t">Tipo</label><select id="k-t" name="tipo"><option value="gasto">Gasto</option><option value="retiro">Retiro</option></select></div>}
                  <div className="field"><label htmlFor="k-c">Concepto</label><input id="k-c" name="concepto" placeholder="Ej: Bolsas, puesto, flete" required /></div>
                  <div className="field"><label htmlFor="k-m">Monto</label><input id="k-m" name="monto" inputMode="numeric" required /></div>
                </div>
                <button className="btn" style={{ marginTop: 10 }} disabled={cargando}>Agregar</button>
              </form>
              <h3>Cerrar caja</h3>
              <form className="pcard" onSubmit={(e) => {
                e.preventDefault();
                const v = new FormData(e.currentTarget).get("contado");
                if (v === "") return setError("Anotá el efectivo contado para cerrar.");
                correr(() => sb().rpc("cerrar_caja", { p_caja: actual.id, p_contado: Number(v) || 0 }), "Caja cerrada.");
              }}>
                <div className="field"><label htmlFor="k-cont">Efectivo contado</label><input id="k-cont" name="contado" inputMode="numeric" placeholder="Contá la plata y anotala" /></div>
                <button className="btn big" style={{ marginTop: 10 }} disabled={cargando}>Cerrar caja</button>
              </form>
            </>
          )}
        </div>

        <div>
          <h3 style={{ marginTop: 0 }}>Abrir caja de hoy</h3>
          {libres.length ? (
            <form className="pcard" onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              correr(() => sb().rpc("abrir_caja", { p_ubicacion: f.get("lugar"), p_inicial: Number(f.get("inicial")) || 0 }), "Caja abierta.");
            }}>
              <div className="fields">
                <div className="field"><label htmlFor="o-l">Lugar</label><select id="o-l" name="lugar">{libres.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select></div>
                <div className="field"><label htmlFor="o-i">Efectivo inicial</label><input id="o-i" name="inicial" inputMode="numeric" defaultValue="0" /></div>
              </div>
              <button className="btn" style={{ marginTop: 10 }} disabled={cargando}>Abrir caja</button>
            </form>
          ) : <div className="empty">Todos los lugares tienen la caja abierta.</div>}
          <p className="note">El depósito cobra en la caja del showroom.</p>
        </div>
      </div>
      {nodo}
    </>
  );
}
