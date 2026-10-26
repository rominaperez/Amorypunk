"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { errorLegible, pesos } from "@/lib/formato";
import Modal from "@/components/Modal";

function useAccion() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  async function correr(fn: () => PromiseLike<{ error: any }>, ok?: () => void) {
    setCargando(true); setError(null);
    const { error } = await fn();
    setCargando(false);
    if (error) return setError(errorLegible(error));
    ok?.(); router.refresh();
  }
  return { error, setError, cargando, correr };
}
const pct = (v: FormDataEntryValue | null) => { const n = Number(v); return v === "" || isNaN(n) || n < 0 || n > 100 ? null : n; };

export function NuevaBanda() {
  const [abierto, setAbierto] = useState(false);
  const { error, setError, cargando, correr } = useAccion();
  return (
    <>
      <button className="btn" onClick={() => setAbierto(true)}>Nueva banda</button>
      {abierto && (
        <Modal titulo="Nueva banda" onCerrar={() => setAbierto(false)}>
          <form onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget), n = String(f.get("nombre")).trim();
            const s = pct(f.get("s")), fe = pct(f.get("f")), t = pct(f.get("t"));
            if (!n) return setError("Poné el nombre de la banda.");
            if (s == null || fe == null || t == null) return setError("Los porcentajes van de 0 a 100.");
            correr(() => supabaseBrowser().rpc("crear_banda", { p_nombre: n, p_showroom: s, p_feria: fe, p_tiendanube: t }), () => setAbierto(false));
          }}>
            <div className="fields">
              <div className="field" style={{ gridColumn: "1/-1" }}><label htmlFor="b-n">Nombre</label><input id="b-n" name="nombre" /></div>
              <div className="field"><label htmlFor="b-s">% ganancia showroom</label><input id="b-s" name="s" inputMode="numeric" defaultValue="50" /></div>
              <div className="field"><label htmlFor="b-f">% ganancia ferias</label><input id="b-f" name="f" inputMode="numeric" defaultValue="50" /></div>
              <div className="field"><label htmlFor="b-t">% ganancia Tiendanube</label><input id="b-t" name="t" inputMode="numeric" defaultValue="100" /></div>
            </div>
            <p className="note">Después le creás un usuario desde Usuarios para que vea su stock y sus ventas.</p>
            {error && <p className="err">{error}</p>}
            <button className="btn big" disabled={cargando}>Crear banda</button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function EditarAcuerdo({ bandaId, nombre, actual }: { bandaId: string; nombre: string; actual: Record<string, number> }) {
  const [abierto, setAbierto] = useState(false);
  const { error, setError, cargando, correr } = useAccion();
  return (
    <>
      <button className="btn sm ghost" onClick={() => setAbierto(true)}>Editar</button>
      {abierto && (
        <Modal titulo={`Acuerdo ${nombre}`} onCerrar={() => setAbierto(false)}>
          <form style={{ textAlign: "left" }} onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget), s = pct(f.get("s")), fe = pct(f.get("f")), t = pct(f.get("t"));
            if (s == null || fe == null || t == null) return setError("Los porcentajes van de 0 a 100.");
            correr(() => supabaseBrowser().rpc("cambiar_acuerdo", { p_banda: bandaId, p_showroom: s, p_feria: fe, p_tiendanube: t }), () => setAbierto(false));
          }}>
            <div className="fields">
              <div className="field"><label htmlFor="a-s">% showroom</label><input id="a-s" name="s" inputMode="numeric" defaultValue={actual.showroom ?? 50} /></div>
              <div className="field"><label htmlFor="a-f">% ferias</label><input id="a-f" name="f" inputMode="numeric" defaultValue={actual.feria ?? 50} /></div>
              <div className="field"><label htmlFor="a-t">% Tiendanube</label><input id="a-t" name="t" inputMode="numeric" defaultValue={actual.tiendanube ?? 100} /></div>
            </div>
            <p className="note">Vale para las ventas que se carguen desde ahora. Las anteriores conservan el acuerdo que tenían.</p>
            {error && <p className="err">{error}</p>}
            <button className="btn big" disabled={cargando}>Guardar acuerdo</button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function Entrega({ bandaId, saldo }: { bandaId: string; saldo: number }) {
  const { error, cargando, correr } = useAccion();
  const [ok, setOk] = useState(false);
  return (
    <form className="pcard" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      correr(() => supabaseBrowser().rpc("registrar_entrega", { p_banda: bandaId, p_monto: Number(f.get("monto")) || 0, p_medio: f.get("medio"), p_referencia: String(f.get("ref") || "") || null }), () => setOk(true));
    }}>
      <h3 style={{ marginTop: 0 }}>Registrar entrega</h3>
      <div className="fields">
        <div className="field"><label htmlFor="e-m">Monto</label><input id="e-m" name="monto" inputMode="numeric" defaultValue={Math.max(0, Math.round(saldo))} /></div>
        <div className="field"><label htmlFor="e-me">Medio</label><select id="e-me" name="medio"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option></select></div>
        <div className="field" style={{ gridColumn: "1/-1" }}><label htmlFor="e-r">Referencia (opcional)</label><input id="e-r" name="ref" /></div>
      </div>
      {error && <p className="err" style={{ marginTop: 10 }}>{error}</p>}
      {ok && !error && <p className="okmsg" style={{ marginTop: 10 }}>Entrega registrada.</p>}
      <button className="btn big" style={{ marginTop: 10 }} disabled={cargando}>Registrar entrega</button>
      <p className="note">Entregar plata cancela saldo. No vuelve a descontar costos. En efectivo sale de la caja abierta del showroom. Saldo actual: {pesos(saldo)}.</p>
    </form>
  );
}

export function ResumenWhatsApp({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="pcard" style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>Resumen para mandar</h3>
      <pre className="mono" style={{ whiteSpace: "pre-wrap", background: "var(--sunk)", padding: 12, borderRadius: 4, fontSize: 12, margin: 0, maxHeight: 260, overflow: "auto" }}>{texto}</pre>
      <div className="flex" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => navigator.clipboard.writeText(texto).then(() => setCopiado(true), () => setCopiado(false))}>{copiado ? "Copiado" : "Copiar"}</button>
        <a className="btn ghost" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">Abrir WhatsApp</a>
      </div>
    </div>
  );
}
