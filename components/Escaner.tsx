"use client";
import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";

// Lee QR con la cámara del celu. Llama a onCodigo con cada lectura (con una pausa para no repetir).
export default function Escaner({ onCodigo, onCerrar }: { onCodigo: (c: string) => void; onCerrar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const ultimo = useRef<{ c: string; t: number }>({ c: "", t: 0 });
  const cb = useRef(onCodigo);
  cb.current = onCodigo;

  useEffect(() => {
    let scanner: { start: () => Promise<void>; destroy: () => void } | null = null;
    let vivo = true;
    import("qr-scanner").then(({ default: QrScanner }) => {
      if (!vivo || !video.current) return;
      const s = new QrScanner(
        video.current,
        (r) => {
          const now = Date.now();
          if (r.data === ultimo.current.c && now - ultimo.current.t < 2500) return;
          ultimo.current = { c: r.data, t: now };
          navigator.vibrate?.(60);
          cb.current(r.data);
        },
        { preferredCamera: "environment", highlightScanRegion: true, maxScansPerSecond: 6, returnDetailedScanResult: true },
      );
      scanner = s;
      s.start().catch(() => setError("No pude abrir la cámara. Revisá que el navegador tenga permiso."));
    });
    return () => { vivo = false; scanner?.destroy(); };
  }, []);

  return (
    <Modal titulo="Escanear" onCerrar={onCerrar}>
      {error ? <p className="err">{error}</p> : <video ref={video} className="scan" muted playsInline />}
      <p className="note">Apuntá a la etiqueta. Cada lectura suma una unidad. Cerrá cuando termines.</p>
    </Modal>
  );
}
