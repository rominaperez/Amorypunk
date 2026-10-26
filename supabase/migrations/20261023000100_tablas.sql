-- =====================================================================
-- AMOR & PUNK · 01 · Tablas
-- Principios:
--   * El stock nunca se edita a mano: se calcula desde movimientos_stock.
--   * Cada venta congela precio, costo, quién lo pagó y el acuerdo vigente.
--   * Vendido, cobrado y liquidado son cosas distintas y viven en tablas distintas.
--   * Las escrituras sensibles se hacen solo con funciones (ver 02_funciones).
-- =====================================================================

create type rol_usuario       as enum ('admin','vendedor','banda');
create type canal_venta       as enum ('showroom','feria','tiendanube');
create type tipo_ubicacion    as enum ('showroom','deposito','feria');
create type pagador           as enum ('ap','banda');
create type medio_pago        as enum ('efectivo','transferencia','tiendanube','saldo_a_favor');
create type estado_pago       as enum ('pendiente','confirmado');
create type tipo_movimiento   as enum ('ingreso','venta','traslado','devolucion','falla','ajuste');
create type estado_reserva    as enum ('activa','concretada','cancelada');
create type estado_caja       as enum ('abierta','cerrada');
create type tipo_mov_caja     as enum ('gasto','retiro');
create type estado_produccion as enum ('consulta','presupuesto','aprobado','pago_requerido','produccion','listo','entregado','cancelado');

-- ---------------------------------------------------------------------
-- Personas y bandas
-- ---------------------------------------------------------------------
create table bandas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  color       text,
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid
);

create table perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null,
  contacto    text,
  rol         rol_usuario not null,
  banda_id    uuid references bandas(id),
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  constraint perfiles_banda_segun_rol check ((rol = 'banda') = (banda_id is not null))
);

-- Acuerdos con historia: nunca se pisan, se agrega uno nuevo con vigente_desde.
create table acuerdos (
  id                  uuid primary key default gen_random_uuid(),
  banda_id            uuid not null references bandas(id),
  canal               canal_venta not null,
  pct_ganancia_banda  numeric(5,2) not null check (pct_ganancia_banda between 0 and 100),
  vigente_desde       timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  created_by          uuid
);
create index acuerdos_vigencia on acuerdos (banda_id, canal, vigente_desde desc);

-- ---------------------------------------------------------------------
-- Lugares (las ferias son un lugar más, con fecha)
-- ---------------------------------------------------------------------
create table ubicaciones (
  id          uuid primary key default gen_random_uuid(),
  tipo        tipo_ubicacion not null,
  nombre      text not null,
  fecha       date,
  direccion   text,
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  constraint ubicaciones_feria_con_fecha check (tipo <> 'feria' or fecha is not null)
);

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------
create table productos (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique,
  nombre         text not null,
  categoria      text,
  banda_id       uuid references bandas(id),          -- null = AMOR & PUNK
  precio         numeric(12,2) not null check (precio >= 0),
  precio_online  numeric(12,2) check (precio_online >= 0),
  foto_path      text,                                 -- Supabase Storage, bucket "fotos"
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  created_by     uuid
);
create index productos_banda on productos (banda_id);

-- Separado de productos para que los vendedores no puedan leer costos.
create table producto_costos (
  producto_id  uuid primary key references productos(id) on delete cascade,
  costo_unit   numeric(12,2) check (costo_unit >= 0),  -- null = pendiente, nunca se asume cero
  pagado_por   pagador not null default 'ap',
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);

create table variantes (
  id           uuid primary key default gen_random_uuid(),
  producto_id  uuid not null references productos(id) on delete cascade,
  talle        text not null default '',
  color        text not null default '',
  codigo       text not null unique,                  -- es lo que va en el QR
  activa       boolean not null default true,
  unique (producto_id, talle, color)
);

-- ---------------------------------------------------------------------
-- Stock: saldo por variante y lugar, mantenido por trigger desde movimientos
-- ---------------------------------------------------------------------
create table stock (
  variante_id   uuid not null references variantes(id) on delete cascade,
  ubicacion_id  uuid not null references ubicaciones(id),
  cantidad      int  not null default 0 check (cantidad >= 0),
  reservada     int  not null default 0 check (reservada >= 0),
  primary key (variante_id, ubicacion_id),
  constraint stock_reservada_no_supera check (reservada <= cantidad)
);

create table movimientos_stock (
  id             bigint generated always as identity primary key,
  tipo           tipo_movimiento not null,
  variante_id    uuid not null references variantes(id),
  desde_id       uuid references ubicaciones(id),
  hacia_id       uuid references ubicaciones(id),
  cantidad       int  not null check (cantidad > 0),
  motivo         text,
  venta_id       uuid,
  devolucion_id  uuid,
  falla_id       uuid,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  constraint movimientos_con_lugar check (desde_id is not null or hacia_id is not null),
  constraint movimientos_lugares_distintos check (desde_id is distinct from hacia_id)
);
create index movimientos_variante on movimientos_stock (variante_id, created_at desc);

-- ---------------------------------------------------------------------
-- Ventas
-- ---------------------------------------------------------------------
create table ventas (
  id                  uuid primary key default gen_random_uuid(),
  numero              bigint generated always as identity unique,
  canal               canal_venta not null,
  ubicacion_id        uuid not null references ubicaciones(id),  -- de dónde salió la mercadería
  tiendanube_pedido   text unique,                               -- evita cargar dos veces el mismo pedido
  vendedor_id         uuid not null references perfiles(id),
  descuento           numeric(12,2) not null default 0 check (descuento >= 0),
  cargos              numeric(12,2) not null default 0 check (cargos >= 0),  -- comisiones y retenciones
  envio               numeric(12,2) not null default 0 check (envio >= 0),   -- se registra aparte del producto
  anulada             boolean not null default false,
  clave_idempotencia  uuid unique,                               -- evita duplicados por doble toque o reintento
  nota                text,
  created_at          timestamptz not null default now(),
  constraint ventas_tiendanube_con_pedido check (canal <> 'tiendanube' or tiendanube_pedido is not null)
);
create index ventas_fecha on ventas (created_at desc);
create index ventas_vendedor on ventas (vendedor_id);

create table venta_items (
  id                  uuid primary key default gen_random_uuid(),
  venta_id            uuid not null references ventas(id) on delete cascade,
  variante_id         uuid not null references variantes(id),
  cantidad            int not null check (cantidad > 0),
  cantidad_devuelta   int not null default 0,
  precio_unit         numeric(12,2) not null check (precio_unit >= 0),
  -- foto del momento de la venta: cambios posteriores no reescriben la historia
  costo_unit          numeric(12,2),
  pagado_por          pagador not null,
  banda_id            uuid references bandas(id),
  pct_ganancia_banda  numeric(5,2) not null default 0,
  constraint venta_items_devuelta_valida check (cantidad_devuelta between 0 and cantidad)
);
create index venta_items_venta on venta_items (venta_id);
create index venta_items_banda on venta_items (banda_id);

-- ---------------------------------------------------------------------
-- Cajas
-- ---------------------------------------------------------------------
create table cajas (
  id                uuid primary key default gen_random_uuid(),
  ubicacion_id      uuid not null references ubicaciones(id),
  fecha             date not null,
  efectivo_inicial  numeric(12,2) not null default 0 check (efectivo_inicial >= 0),
  estado            estado_caja not null default 'abierta',
  efectivo_contado  numeric(12,2),
  abierta_por       uuid,
  abierta_at        timestamptz not null default now(),
  cerrada_por       uuid,
  cerrada_at        timestamptz,
  unique (ubicacion_id, fecha)
);

create table caja_movimientos (
  id          uuid primary key default gen_random_uuid(),
  caja_id     uuid not null references cajas(id),
  tipo        tipo_mov_caja not null,
  concepto    text not null,
  monto       numeric(12,2) not null check (monto > 0),
  created_by  uuid,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Personalizados
-- ---------------------------------------------------------------------
create table pedidos (
  id                 uuid primary key default gen_random_uuid(),
  numero             bigint generated always as identity unique,
  cliente            text not null,
  contacto           text,
  detalle            text not null,
  cantidad           int check (cantidad > 0),
  tecnica            text,
  medidas            text,
  archivos           text[] not null default '{}',   -- rutas en Storage de los archivos aprobados
  fecha_prometida    date,
  estado             estado_produccion not null default 'consulta',
  presupuesto        numeric(12,2) check (presupuesto >= 0),
  presupuesto_vence  date,
  entregado_at       timestamptz,
  created_at         timestamptz not null default now(),
  created_by         uuid
);

create table pedido_costos (
  id         uuid primary key default gen_random_uuid(),
  pedido_id  uuid not null references pedidos(id) on delete cascade,
  concepto   text not null,
  monto      numeric(12,2) check (monto >= 0),   -- null = pendiente
  orden      int not null default 0
);

-- ---------------------------------------------------------------------
-- Reservas
-- ---------------------------------------------------------------------
create table reservas (
  id            uuid primary key default gen_random_uuid(),
  numero        bigint generated always as identity unique,
  variante_id   uuid not null references variantes(id),
  ubicacion_id  uuid not null references ubicaciones(id),
  cantidad      int not null check (cantidad > 0),
  cliente       text not null,
  contacto      text,
  vence         date,
  estado        estado_reserva not null default 'activa',
  venta_id      uuid references ventas(id),
  created_by    uuid,
  created_at    timestamptz not null default now(),
  cerrada_at    timestamptz
);

-- ---------------------------------------------------------------------
-- Plata que entra y sale
-- ---------------------------------------------------------------------
create table pagos (
  id              uuid primary key default gen_random_uuid(),
  venta_id        uuid references ventas(id),
  pedido_id       uuid references pedidos(id),
  reserva_id      uuid references reservas(id),     -- seña de reserva; al concretarse cuenta para la venta
  medio           medio_pago not null,
  monto           numeric(12,2) not null check (monto <> 0),  -- negativo = reintegro
  estado          estado_pago not null default 'confirmado',
  cuenta_destino  text,
  referencia      text,
  caja_id         uuid references cajas(id),
  es_reintegro    boolean not null default false,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  confirmado_por  uuid,
  confirmado_at   timestamptz,
  constraint pagos_un_solo_origen check (num_nonnulls(venta_id, pedido_id, reserva_id) = 1),
  constraint pagos_efectivo_en_caja check (medio <> 'efectivo' or caja_id is not null)
);
create index pagos_venta on pagos (venta_id);
create index pagos_caja on pagos (caja_id);

create table devoluciones (
  id          uuid primary key default gen_random_uuid(),
  venta_id    uuid not null references ventas(id),
  motivo      text not null,
  destino     text not null check (destino in ('stock','falla')),
  created_by  uuid,
  created_at  timestamptz not null default now()
);

create table devolucion_items (
  devolucion_id  uuid not null references devoluciones(id) on delete cascade,
  venta_item_id  uuid not null references venta_items(id),
  cantidad       int not null check (cantidad > 0),
  primary key (devolucion_id, venta_item_id)
);

create table fallas (
  id             uuid primary key default gen_random_uuid(),
  variante_id    uuid not null references variantes(id),
  ubicacion_id   uuid not null references ubicaciones(id),
  cantidad       int not null check (cantidad > 0),
  motivo         text not null,
  absorbe        pagador not null,
  -- foto del costo al momento de la baja
  costo_unit     numeric(12,2),
  pagado_por     pagador not null,
  banda_id       uuid references bandas(id),
  devolucion_id  uuid references devoluciones(id),
  created_by     uuid,
  created_at     timestamptz not null default now()
);

create table entregas_bandas (
  id          uuid primary key default gen_random_uuid(),
  banda_id    uuid not null references bandas(id),
  monto       numeric(12,2) not null check (monto > 0),
  medio       medio_pago not null check (medio in ('efectivo','transferencia')),
  caja_id     uuid references cajas(id),
  referencia  text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  constraint entregas_efectivo_en_caja check (medio <> 'efectivo' or caja_id is not null)
);

-- ---------------------------------------------------------------------
-- Historial, avisos y configuración
-- ---------------------------------------------------------------------
create table auditoria (
  id           bigint generated always as identity primary key,
  tabla        text not null,
  registro_id  text,
  accion       text not null,
  usuario_id   uuid,
  antes        jsonb,
  despues      jsonb,
  created_at   timestamptz not null default now()
);
create index auditoria_registro on auditoria (tabla, registro_id, created_at desc);

create table notificaciones (
  id          uuid primary key default gen_random_uuid(),
  para        uuid not null references perfiles(id) on delete cascade,
  texto       text not null,
  leida       boolean not null default false,
  created_at  timestamptz not null default now()
);

create table configuracion (
  clave  text primary key,
  valor  jsonb not null
);
