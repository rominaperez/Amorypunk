"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { errorLegible, pesos } from "@/lib/formato";

type P = { tipo: "confirmar"; pagoId: string } | { tipo: "cobrar"; ventaId: string; saldo: number };

export default function AccionesVenta(props: P) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [medio, setMedio] = useState("efectivo");
  const [monto, setMonto] = useState(props.tipo === "cobrar" ? String(Math.round(props.saldo)) : "");

  async function correr() {
    setCargando(true); setError(null);
    const sb = supabaseBrowser();
    const { error } = props.tipo === "confirmar"
      ? await sb.rpc("confirmar_pago", { p_pago: props.pagoId })
      : await sb.rpc("cobrar_venta", { p_venta: props.ventaId, p_medio: medio, p_monto: Number(monto) || 0 });
    setCargando(false);
    if (error) return setError(errorLegible(error));
    router.refresh();
  }

  if (props.tipo === "confirmar")
    return <><button className="btn sm" onClick={correr} disabled={cargando}>Confirmar</button>{error && <span className="err">{error}</span>}</>;

  return (
    <div className="pcard" style={{ marginTop: 12 }}>
      <div className="fields">
        <div className="field"><label htmlFor="c-m">Cobrar saldo</label><input id="c-m" inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value)} /></div>
        <div className="field"><label htmlFor="c-me">Medio</label><select id="c-me" value={medio} onChange={(e) => setMedio(e.target.value)}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option></select></div>
      </div>
      {error && <p className="err" style={{ marginTop: 10 }}>{error}</p>}
      <button className="btn" style={{ marginTop: 10 }} onClick={correr} disabled={cargando}>Registrar cobro de {pesos(Number(monto) || 0)}</button>
    </div>
  );
}
