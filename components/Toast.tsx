"use client";
import { useCallback, useRef, useState } from "react";

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => {
    setMsg(m);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 3200);
  }, []);
  const nodo = msg ? <div className="toast" role="status">{msg}</div> : null;
  return { toast, nodo };
}
