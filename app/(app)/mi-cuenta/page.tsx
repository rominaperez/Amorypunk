import { exigir } from "@/lib/perfil";
import Ransom from "@/components/Ransom";
import CuentaBanda from "@/components/CuentaBanda";

export default async function MiCuenta() {
  const p = await exigir("banda");
  return (
    <>
      <Ransom texto={(p.banda ?? "MI CUENTA").toUpperCase()} />
      <p className="lede">Hola {p.nombre}. Esto es lo que vendimos de ustedes, lo que les corresponde y lo que ya recibieron.</p>
      <CuentaBanda bandaId={p.banda_id!} />
    </>
  );
}
