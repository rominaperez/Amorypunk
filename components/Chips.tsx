import { pesos } from "@/lib/formato";

export function CanalChip({ canal, ubicacion, pedido }: { canal: string; ubicacion: string; pedido?: string | null }) {
  if (canal === "tiendanube") return <span className="chip ink">Tiendanube #{pedido}</span>;
  if (canal === "feria") return <span className="chip red">{ubicacion}</span>;
  return <span className="chip">{ubicacion}</span>;
}

export function CobroChip({ v }: { v: { anulada: boolean; saldo: number; por_verificar: number } }) {
  if (v.anulada) return <span className="chip">Anulada</span>;
  if (v.saldo < -0.5) return <span className="chip warn">A favor {pesos(-v.saldo)}</span>;
  if (v.saldo > 0.5) return <span className="chip bad">Saldo {pesos(v.saldo)}</span>;
  if (v.por_verificar > 0) return <span className="chip warn">Por verificar</span>;
  return <span className="chip ok">Cobrado</span>;
}
