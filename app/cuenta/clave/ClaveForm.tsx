"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function ClaveForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const a = String(f.get("a")), b = String(f.get("b"));
    if (a.length < 8) return setError("La contraseña tiene que tener al menos 8 caracteres.");
    if (a !== b) return setError("Las dos contraseñas no coinciden.");
    setCargando(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: a });
    setCargando(false);
    if (error) return setError(error.message);
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={guardar} className="pcard" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="field"><label htmlFor="a">Contraseña nueva</label><input id="a" name="a" type="password" autoComplete="new-password" required /></div>
      <div className="field"><label htmlFor="b">Repetila</label><input id="b" name="b" type="password" autoComplete="new-password" required /></div>
      {error && <p className="err" role="alert">{error}</p>}
      <button className="btn big" disabled={cargando}>{cargando ? "Guardando…" : "Guardar y entrar"}</button>
    </form>
  );
}
