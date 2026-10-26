"use client";
import { useActionState, useState, useTransition } from "react";
import { crearUsuario, linkNuevo, cambiarActivo, type Resultado } from "./acciones";
import Modal from "@/components/Modal";

type U = { id: string; nombre: string; rol: "admin" | "vendedor" | "banda"; banda_id: string | null; contacto: string | null; activo: boolean };
const ROL = { admin: "Admin", vendedor: "Vendedor", banda: "Banda" };

function LinkListo({ r, onCerrar }: { r: Resultado; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const msg = `Hola${r.nombre ? " " + r.nombre : ""}! Entrá acá para elegir tu contraseña de la app de Amor & Punk: ${r.link}`;
  return (
    <Modal titulo="Link listo" onCerrar={onCerrar}>
      <p style={{ marginTop: 0 }}>Mandale este link{r.nombre ? <> a <b>{r.nombre}</b></> : ""} por WhatsApp. Sirve una sola vez y vence en 24 horas.</p>
      <p className="mono" style={{ background: "var(--sunk)", padding: 10, borderRadius: 4, wordBreak: "break-all" }}>{r.link}</p>
      <div className="flex">
        <button className="btn" onClick={() => navigator.clipboard.writeText(r.link!).then(() => setCopiado(true))}>{copiado ? "Copiado" : "Copiar link"}</button>
        <a className="btn ghost" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">Abrir WhatsApp</a>
      </div>
    </Modal>
  );
}

export default function UsuariosCliente({ yo, usuarios, bandas }: { yo: string; usuarios: U[]; bandas: { id: string; nombre: string }[] }) {
  const [estado, accion, creando] = useActionState(crearUsuario, {});
  const [rol, setRol] = useState("vendedor");
  const [link, setLink] = useState<Resultado | null>(null);
  const [visto, setVisto] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pend, start] = useTransition();
  const nb = (id: string | null) => bandas.find((b) => b.id === id)?.nombre;
  const mostrar = estado.link && visto !== estado.link ? estado : link;

  return (
    <>
      <div className="list">
        {usuarios.map((u) => (
          <div className="row" key={u.id}>
            <div className="main"><b>{u.nombre}</b><span>{u.contacto}{u.banda_id ? ` · ${nb(u.banda_id)}` : ""}</span></div>
            <span className={`chip ${u.rol === "admin" ? "ink" : u.rol === "banda" ? "red" : ""}`}>{ROL[u.rol]}</span>
            {u.activo ? <span className="chip ok">Activo</span> : <span className="chip">Desactivado</span>}
            {u.id === yo ? <span className="chip">Sos vos</span> : (
              <div className="flex" style={{ gap: 6 }}>
                <button className="btn sm ghost" disabled={pend} onClick={() => start(async () => { const r = await linkNuevo(u.id); r.error ? setErr(r.error) : setLink(r); })}>Link nuevo</button>
                <button className="btn sm ghost" disabled={pend} onClick={() => start(async () => { const r = await cambiarActivo(u.id, !u.activo); if (r.error) setErr(r.error); })}>{u.activo ? "Desactivar" : "Reactivar"}</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}

      <h3>Nuevo usuario</h3>
      <form className="pcard" action={accion}>
        <div className="fields">
          <div className="field"><label htmlFor="n-name">Nombre</label><input id="n-name" name="nombre" placeholder="Ej: Rama" required /></div>
          <div className="field"><label htmlFor="n-mail">Mail (para entrar)</label><input id="n-mail" name="email" type="email" required /></div>
          <div className="field"><label htmlFor="n-tel">WhatsApp (opcional)</label><input id="n-tel" name="telefono" inputMode="tel" /></div>
          <div className="field"><label htmlFor="n-role">Rol</label>
            <select id="n-role" name="rol" value={rol} onChange={(e) => setRol(e.target.value)}>
              <option value="vendedor">Vendedor</option><option value="banda">Banda</option><option value="admin">Admin</option>
            </select></div>
          {rol === "banda" && (
            <div className="field"><label htmlFor="n-band">Banda</label>
              <select id="n-band" name="banda">{bandas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
          )}
        </div>
        {estado.error && <p className="err" style={{ marginTop: 10 }}>{estado.error}</p>}
        <button className="btn" style={{ marginTop: 12 }} disabled={creando}>{creando ? "Creando…" : "Crear y generar link"}</button>
      </form>
      <p className="note">No se manda ningún mail: la app te da un link para pasarle por WhatsApp. Desactivar no borra: sus ventas siguen figurando con su nombre. Si creás un admin, a los otros admins les llega un aviso.</p>
      {mostrar?.link && <LinkListo r={mostrar} onCerrar={() => { if (estado.link) setVisto(estado.link); setLink(null); }} />}
    </>
  );
}
