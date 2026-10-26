"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Rol } from "@/lib/perfil";

const NAV: Record<Rol, [string, string][]> = {
  admin: [["/inicio", "Inicio"], ["/vender", "Vender"], ["/stock", "Stock"], ["/ferias", "Ferias"], ["/ventas", "Ventas"], ["/caja", "Caja"], ["/bandas", "Bandas"], ["/usuarios", "Usuarios"]],
  vendedor: [["/vender", "Vender"], ["/stock", "Stock"], ["/ventas", "Mis ventas"], ["/caja", "Caja"]],
  banda: [["/mi-cuenta", "Mi cuenta"], ["/stock", "Mi stock"]],
};

export default function Nav({ rol, lugar }: { rol: Rol; lugar: "side" | "bottom" }) {
  const path = usePathname();
  return (
    <nav className={lugar} aria-label="Secciones">
      {NAV[rol].map(([href, label]) => (
        <Link key={href} href={href} className={path.startsWith(href) ? "on" : ""}>{label}</Link>
      ))}
    </nav>
  );
}
