import { activar } from "./activar";

// El link no se usa al abrirlo: WhatsApp y otros abren los links para armar la vista previa,
// y eso gastaba el link antes de que la persona lo tocara. Se usa recién al apretar el botón.
export default async function Confirmar({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const { token_hash, type } = await searchParams;
  const valido = !!token_hash && (type === "invite" || type === "recovery" || type === "magiclink");
  return (
    <div className="auth">
      <div className="authbox">
        <div className="badge" aria-hidden="true"><span>A&amp;P</span></div>
        <h2 style={{ margin: 0, textAlign: "center", fontFamily: "var(--display)", fontWeight: 400, fontSize: 30 }}>
          {type === "recovery" ? "CONTRASEÑA NUEVA" : "BIENVENIDO/A"}
        </h2>
        {valido ? (
          <form action={activar} className="pcard" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ margin: 0 }}>Tocá el botón para {type === "recovery" ? "elegir una contraseña nueva" : "activar tu cuenta y elegir tu contraseña"}.</p>
            <input type="hidden" name="token_hash" value={token_hash} />
            <input type="hidden" name="type" value={type} />
            <button className="btn big">{type === "recovery" ? "Seguir" : "Activar mi cuenta"}</button>
          </form>
        ) : (
          <p className="err">Este link está incompleto. Pedile uno nuevo a un admin.</p>
        )}
      </div>
    </div>
  );
}
