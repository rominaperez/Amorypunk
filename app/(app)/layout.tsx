import { getPerfil } from "@/lib/perfil";
import Nav from "@/components/Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const p = await getPerfil();
  const rol = { admin: "Admin", vendedor: "Vendedor", banda: p.banda ?? "Banda" }[p.rol];
  return (
    <>
      <div className="top">
        <div className="badge" aria-hidden="true"><span>A&amp;P</span></div>
        <div className="brand"><b>AMOR &amp; PUNK</b><small>Showroom San Telmo · Venezuela 458</small></div>
        <div className="who">
          <span style={{ fontSize: 13 }}>{p.nombre} · <span style={{ opacity: 0.7 }}>{rol}</span></span>
          <form action="/auth/salir" method="post"><button>Salir</button></form>
        </div>
      </div>
      <div className="shell">
        <Nav rol={p.rol} lugar="side" />
        <main>{children}</main>
      </div>
      <Nav rol={p.rol} lugar="bottom" />
    </>
  );
}
