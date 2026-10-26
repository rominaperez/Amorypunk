import { getPerfil } from "@/lib/perfil";
import ClaveForm from "./ClaveForm";

export default async function ClavePage() {
  const p = await getPerfil();
  return (
    <div className="auth">
      <div className="authbox">
        <div className="badge" aria-hidden="true"><span>A&amp;P</span></div>
        <h2 style={{ margin: 0, textAlign: "center", fontFamily: "var(--display)", fontWeight: 400, fontSize: 30 }}>HOLA {p.nombre.toUpperCase()}</h2>
        <p style={{ margin: 0, textAlign: "center", color: "var(--muted)" }}>Elegí tu contraseña para entrar a la app.</p>
        <ClaveForm />
        <p style={{ color: "var(--muted)", fontSize: 13, textAlign: "center" }}>
          En el celu, el navegador te va a ofrecer instalar la app (o buscá &quot;Agregar a pantalla de inicio&quot; en el menú).
        </p>
      </div>
    </div>
  );
}
