import LoginForm from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ sin_acceso?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="auth">
      <div className="authbox">
        <div className="badge" aria-hidden="true"><span>A&amp;P</span></div>
        <h1 className="ransom" style={{ justifyContent: "center" }} aria-label="Entrar">
          {["E", "N", "T", "R", "A", "R"].map((c, i) => (
            <i key={i} className={"abcab"[i % 5]} style={{ transform: `rotate(${((i * 37) % 7) - 3}deg)` }} aria-hidden="true">{c}</i>
          ))}
        </h1>
        {sp.sin_acceso && <p className="err">Tu usuario no está activo. Hablá con Gero o Romy.</p>}
        {sp.error && <p className="err">{sp.error}</p>}
        <LoginForm />
        <p style={{ color: "var(--muted)", fontSize: 13, textAlign: "center" }}>
          ¿No tenés usuario o te olvidaste la contraseña? Pedile a un admin un link nuevo.
        </p>
      </div>
    </div>
  );
}
