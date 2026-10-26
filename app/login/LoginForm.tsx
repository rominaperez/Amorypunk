"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setCargando(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({
      email: String(f.get("email")).trim(),
      password: String(f.get("password")),
    });
    setCargando(false);
    if (error) return setError(error.message.includes("Invalid") ? "Mail o contraseña incorrectos." : error.message);
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={entrar} className="pcard" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="field"><label htmlFor="email">Mail</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
      <div className="field"><label htmlFor="password">Contraseña</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
      {error && <p className="err" role="alert">{error}</p>}
      <button className="btn big" disabled={cargando}>{cargando ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
