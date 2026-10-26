export const pesos = (n: number | null | undefined) =>
  n == null || isNaN(Number(n)) ? "—" : (Number(n) < 0 ? "−" : "") + "$" + Math.round(Math.abs(Number(n))).toLocaleString("es-AR");

export const fecha = (iso: string, conHora = true) => {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit", month: "2-digit",
    ...(conHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
};

export const varianteNombre = (v: { talle?: string | null; color?: string | null }) =>
  [v.talle, v.color].filter(Boolean).join(" · ") || "Único";

export const CANAL: Record<string, string> = { showroom: "Showroom", feria: "Feria", tiendanube: "Tiendanube" };
export const MEDIO: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", tiendanube: "Tiendanube", saldo_a_favor: "Saldo a favor" };

export function errorLegible(e: { message?: string } | null | undefined) {
  if (!e?.message) return "No se pudo completar. Probá de nuevo.";
  const m = e.message;
  if (m.includes("permission denied") || m.includes("No tenés permiso")) return "No tenés permiso para esta operación.";
  if (m.includes("Failed to fetch")) return "Sin conexión. Revisá internet y probá de nuevo.";
  return m;
}
