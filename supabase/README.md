# Amor & Punk · Base de datos (Supabase)

Esquema completo para la app de gestión: stock, ventas por canal, reparto con bandas, cobros, cajas, reservas, devoluciones, fallas, personalizados e historial. Los permisos por rol (admin, vendedor, banda) se aplican en la base, no solo en las pantallas.

## Qué hay

```
supabase/
  migrations/
    ..._tablas.sql        tablas y tipos
    ..._funciones.sql     ayudantes, triggers (stock, historial, avisos) y cálculo del reparto
    ..._operaciones.sql   funciones que llama la app (vender, devolver, trasladar, etc.)
    ..._vistas.sql        vistas para pantallas y reportes
    ..._permisos.sql      RLS y permisos por rol
    ..._fotos.sql         buckets de Storage para fotos y archivos
  seed.sql                showroom, depósito, Nihilismo y Las Vin Up con sus acuerdos
  tests/
  correr.sh               prueba local con Postgres
  10_casos_de_aceptacion.sql   los 8 casos del documento + extras
```

## Cómo aplicarlo

Con la CLI de Supabase:

```bash
supabase link --project-ref <ref-del-proyecto>
supabase db push
psql "$DATABASE_URL" -f supabase/seed.sql
```

O pegando cada archivo de `migrations/` en el SQL Editor, en orden, y después `seed.sql`.

**Primer admin:** crear el usuario en Authentication y correr

```sql
insert into perfiles (id, nombre, rol)
select id, 'Gero', 'admin' from auth.users where email = 'gero@...';
```

## Ideas que sostienen el modelo

- **El stock no se edita.** Cambia solo con `movimientos_stock` (ingreso, venta, traslado, devolución, falla, ajuste). Un trigger mantiene la tabla `stock` y no deja vender lo que no hay ni lo reservado. Los movimientos no se pueden modificar ni borrar.
- **La venta congela todo.** `venta_items` guarda precio, costo, quién lo pagó y el % del acuerdo del momento. Cambiar un precio o un acuerdo después no reescribe la historia. Los acuerdos tampoco se pisan: cada cambio es una fila nueva con `vigente_desde`.
- **Vendido, cobrado y liquidado van separados.** `ventas` + `venta_items` (vendido), `pagos` (cobrado; negativos = reintegros), `entregas_bandas` (liquidado).
- **Costo pendiente ≠ cero.** Si falta el costo queda `null` y la línea no suma ganancia hasta que se cargue.
- **Efectivo siempre en una caja.** Un cobro en efectivo exige caja abierta en ese lugar (el depósito usa la del showroom). Transferencias y Tiendanube no entran a la caja y quedan pendientes hasta que un admin las confirma.

## Reparto (igual que el prototipo)

Por cada producto vendido:

- `neto = precio × unidades − parte del descuento − parte de los cargos`
- `ganancia = neto − costo`
- la banda recibe su % de la ganancia según el acuerdo del canal
- el costo vuelve a quien lo pagó, una sola vez
- `total_banda = costo que recupera (si lo pagó ella) + su parte de la ganancia`

## Lo que llama la app

| Función | Quién |
|---|---|
| `registrar_venta(jsonb)` | admin, vendedor (Tiendanube solo admin) |
| `cobrar_venta`, `crear_reserva`, `abrir_caja`, `cerrar_caja`, `movimiento_caja` (gasto) | admin, vendedor |
| `confirmar_pago`, `registrar_devolucion`, `anular_venta` | admin |
| `crear_producto`, `cambiar_costo`, `ingresar_stock`, `trasladar`, `ajustar_stock`, `registrar_falla` | admin |
| `crear_banda`, `cambiar_acuerdo`, `registrar_entrega`, `cancelar_reserva`, `registrar_pago_pedido` | admin |

Lectura por vistas: `v_stock`, `v_para_reponer`, `v_ventas`, `v_items_venta`, `v_lineas_venta`, `v_cuenta_bandas`, `v_ajustes_fallas`, `v_cajas`, `v_resultado_ferias`, `v_pedidos`, `v_resultado_general`, `v_historial`. Cada una devuelve solo lo que le corresponde a quien pregunta.

`registrar_venta` acepta `clave_idempotencia` (un uuid que genera la app): si la misma venta llega dos veces por un doble toque o un reintento, no se duplica.

## Permisos

- **Admin:** todo.
- **Vendedor:** ve productos, talles, precios y stock; vende y cobra; ve solo sus ventas. No ve costos, ganancias, cuentas de bandas ni montos de caja (cierra la caja contando, sin ver el esperado).
- **Banda:** solo consulta. Sus productos y su stock, sus ventas por canal, sus costos, su cuenta y sus entregas.

Las vistas con plata filtran por rol adentro (no usan `security_invoker`), así un vendedor no puede llegar a los costos ni armando la consulta a mano. El linter de Supabase las va a marcar como "security definer view": es a propósito.

## Pendiente para la app (no es SQL)

- **Crear usuarios:** necesita la service role key, así que va en una ruta del servidor (Next.js en Cloudflare): `auth.admin.inviteUserByEmail(...)` y después el `insert` en `perfiles`. La key nunca va al navegador.
- **Cotizador:** el cálculo vive en la app; el resultado se guarda en `pedidos.presupuesto` y `pedido_costos` (monto `null` = pendiente).
- **Ferias sin señal:** fuera de esta etapa. Si se hace, la clave de idempotencia ya resuelve los reintentos al sincronizar.

## Para validar con el cliente

- **Gastos de feria con Nihilismo y Las Vin Up:** hoy el puesto y el flete los absorbe el showroom, y en esas ferias la ganancia es toda de la banda. En la prueba, una feria así da −$25.000 para el showroom.
- **Costo por producto o por tanda:** hoy hay un costo por producto. Si la misma remera entra en tandas con costos distintos, conviene pasar a costo por lote.

## Probar localmente

Necesita Postgres 15 o superior.

```bash
PGHOST=localhost PGUSER=postgres ./supabase/tests/correr.sh
```

Crea una base vacía, simula lo mínimo de Supabase, aplica todo y corre los casos de aceptación. Termina con `TODOS LOS CASOS PASARON`.
