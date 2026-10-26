# Amor & Punk · App

Next.js 16 + Supabase, para correr en Cloudflare Workers. Se instala en el celu como app (PWA).

## Qué incluye esta etapa

- **Entrar y usuarios:** login con mail y contraseña. Los admins crean usuarios y la app da un link para mandar por WhatsApp (no depende de mails). "Link nuevo" sirve si alguien se olvidó la contraseña.
- **Vender:** showroom, feria o Tiendanube (este último solo admins). Talle por talle o escaneando el QR con la cámara o un lector USB. Efectivo, transferencia o combinado, con saldo. Un doble toque no duplica la venta.
- **Stock:** por producto, talle y lugar. Nuevo producto con foto, ingreso, traslado, costo y etiquetas QR para imprimir.
- **Ferias:** alta y resultado de cada feria descontando sus gastos.
- **Ventas:** lista con filtros, detalle con reparto (solo admins), confirmar transferencias y cobrar saldos.
- **Caja:** abrir, gastos y retiros, y cierre contando. El vendedor cierra sin ver el esperado.
- **Bandas:** cuentas, acuerdos, entregas y resumen para WhatsApp. Cada banda ve su cuenta desde "Mi cuenta".
- **Inicio:** números de la semana, para reponer, costos pendientes y avisos.

Próxima etapa (la base ya lo soporta): reservas, devoluciones y anulaciones, fallas, personalizados con cotizador y reportes.

## Variables

| Variable | Dónde | Qué es |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.production` (ya está) | URL del proyecto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.production` (ya está) | Clave pública |
| `SUPABASE_SECRET_KEY` | **Secreto de Cloudflare**, y `.env.local` en tu compu | Clave secreta, solo para crear usuarios. Nunca en el código. |

## Probar en tu compu

```bash
npm install
echo "SUPABASE_SECRET_KEY=sb_secret_..." > .env.local
npm run dev        # http://localhost:3000
```

## Subir a Cloudflare

**Opción A, desde tu compu:**

```bash
npx wrangler login
npx wrangler secret put SUPABASE_SECRET_KEY   # pegá la secret key
npm run deploy
```

**Opción B, automático desde GitHub:** subí el repo y en Cloudflare → Workers & Pages → Create → Import a repository. Dejá los comandos que propone Cloudflare (deploy: `npx wrangler deploy`); el build lo dispara `wrangler.jsonc`. Después cargá `SUPABASE_SECRET_KEY` en Settings → Variables and Secrets, tipo Secret.

Queda una URL tipo `https://amorypunk.<tu-cuenta>.workers.dev`. Se puede poner un dominio propio desde Settings → Domains.

## Primer uso

1. Entrá con el usuario de Gero (el admin creado en Supabase).
2. **Caja → Abrir caja** del showroom.
3. **Stock → Nuevo producto** para cargar lo primero.
4. **Usuarios → Nuevo usuario** para Romy, los vendedores y las bandas. Mandales el link por WhatsApp.
5. En el celu, al entrar, el navegador ofrece "Instalar app" (en iPhone: Compartir → Agregar a inicio).
