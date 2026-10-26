"use client";
import { useEffect } from "react";

export default function Modal({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onCerrar]);
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="mh"><h2>{titulo}</h2><button className="x" onClick={onCerrar} aria-label="Cerrar">✕</button></div>
        {children}
      </div>
    </div>
  );
}
