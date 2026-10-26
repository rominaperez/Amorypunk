"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { errorLegible } from "@/lib/formato";

export default function NuevaFeria() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  return (
    <form className="pcard" onSubmit={async (e) => {
      e.preventDefault();
      const form = e.currentTarget, f = new FormData(form);
      const nombre = String(f.get("nombre")).trim(), fecha = String(f.get("fecha"));
      if (!nombre || !fecha) return setError("Completá nombre y fecha.");
      setCargando(true); setError(null);
      const { error } = await supabaseBrowser().from("ubicaciones").insert({ tipo: "feria", nombre, fecha, direccion: String(f.get("direccion")).trim() || null });
      setCargando(false);
      if (error) return setError(errorLegible(error));
      form.reset(); router.refresh();
    }}>
      <div className="fields">
        <div className="field"><label htmlFor="nf-n">Nombre</label><input id="nf-n" name="nombre" placeholder="Ej: Feria Parque Centenario" /></div>
        <div className="field"><label htmlFor="nf-f">Fecha</label><input id="nf-f" name="fecha" type="date" /></div>
        <div className="field"><label htmlFor="nf-d">Dirección (opcional)</label><input id="nf-d" name="direccion" /></div>
      </div>
      {error && <p className="err" style={{ marginTop: 10 }}>{error}</p>}
      <button className="btn" style={{ marginTop: 12 }} disabled={cargando}>Crear feria</button>
    </form>
  );
}
