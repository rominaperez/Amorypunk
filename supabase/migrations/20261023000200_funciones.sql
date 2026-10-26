-- =====================================================================
-- AMOR & PUNK · 02 · Ayudantes, triggers y cálculos
-- =====================================================================

-- ---------------------------------------------------------------------
-- Quién soy
-- ---------------------------------------------------------------------
create or replace function public.mi_rol() returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid() and activo
$$;

create or replace function public.mi_banda() returns uuid
language sql stable security definer set search_path = public as $$
  select banda_id from perfiles where id = auth.uid() and activo
$$;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'admin' from perfiles where id = auth.uid() and activo), false)
$$;

create or replace function public.exigir_rol(variadic roles rol_usuario[]) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_rol() is null or not (public.mi_rol() = any(roles)) then
    raise exception 'No tenés permiso para esta operación' using errcode = '42501';
  end if;
end $$;

create or replace function public.hoy_ar() returns date
language sql stable as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date
$$;

-- ---------------------------------------------------------------------
-- Acuerdo vigente de una banda en un canal
-- ---------------------------------------------------------------------
create or replace function public.acuerdo_vigente(p_banda uuid, p_canal canal_venta) returns numeric
language sql stable security definer set search_path = public as $$
  select pct_ganancia_banda from acuerdos
  where banda_id = p_banda and canal = p_canal and vigente_desde <= now()
  order by vigente_desde desc limit 1
$$;

-- ---------------------------------------------------------------------
-- Movimientos de stock: el único camino para cambiar el stock
-- ---------------------------------------------------------------------
create or replace function public.tg_aplicar_movimiento() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_disp int;
begin
  if new.desde_id is not null then
    select cantidad - reservada into v_disp from stock
      where variante_id = new.variante_id and ubicacion_id = new.desde_id for update;
    if coalesce(v_disp, 0) < new.cantidad then
      raise exception 'Stock insuficiente: hay % disponible(s) en ese lugar', coalesce(v_disp, 0)
        using errcode = 'P0001';
    end if;
    update stock set cantidad = cantidad - new.cantidad
      where variante_id = new.variante_id and ubicacion_id = new.desde_id;
  end if;
  if new.hacia_id is not null then
    insert into stock (variante_id, ubicacion_id, cantidad) values (new.variante_id, new.hacia_id, new.cantidad)
    on conflict (variante_id, ubicacion_id) do update set cantidad = stock.cantidad + excluded.cantidad;
  end if;
  return new;
end $$;

create trigger movimientos_aplicar after insert on movimientos_stock
  for each row execute function tg_aplicar_movimiento();

create or replace function public.tg_inmutable() returns trigger
language plpgsql as $$
begin
  raise exception 'Los registros de % no se modifican ni se borran: se corrigen con un movimiento nuevo', tg_table_name;
end $$;

create trigger movimientos_inmutables before update or delete on movimientos_stock
  for each row execute function tg_inmutable();
create trigger auditoria_inmutable before update or delete on auditoria
  for each row execute function tg_inmutable();

-- ---------------------------------------------------------------------
-- Historial: quién tocó qué y cuándo
-- ---------------------------------------------------------------------
create or replace function public.tg_auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  v_id := coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id',
                   to_jsonb(new) ->> 'producto_id', to_jsonb(old) ->> 'producto_id');
  insert into auditoria (tabla, registro_id, accion, usuario_id, antes, despues)
  values (tg_table_name, v_id, lower(tg_op), auth.uid(),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['bandas','perfiles','acuerdos','ubicaciones','productos','producto_costos','variantes',
                           'ventas','pagos','reservas','devoluciones','fallas','entregas_bandas','cajas',
                           'caja_movimientos','pedidos','pedido_costos','configuracion']
  loop
    execute format('create trigger auditar after insert or update or delete on %I for each row execute function tg_auditar()', t);
  end loop;
end $$;

-- Aviso a los otros admins cuando aparece un admin nuevo
create or replace function public.tg_aviso_admin_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_autor text;
begin
  if new.rol = 'admin' and (tg_op = 'INSERT' or old.rol is distinct from 'admin') then
    select nombre into v_autor from perfiles where id = auth.uid();
    insert into notificaciones (para, texto)
    select id, coalesce(v_autor, 'Alguien') || ' creó un nuevo usuario admin: ' || new.nombre
    from perfiles where rol = 'admin' and activo and id <> new.id and id is distinct from auth.uid();
  end if;
  return new;
end $$;

create trigger aviso_admin_nuevo after insert or update of rol on perfiles
  for each row execute function tg_aviso_admin_nuevo();

-- ---------------------------------------------------------------------
-- Cálculo de una venta (misma lógica que el prototipo)
--   bruto     = precio × unidades efectivas (vendidas − devueltas)
--   descuento y cargos se reparten en proporción al bruto original
--   ganancia  = neto − costo ; la banda recibe su % de la ganancia
--   el costo vuelve a quien lo pagó y se descuenta una sola vez
-- ---------------------------------------------------------------------
create or replace function public.lineas_de_venta(p_venta uuid)
returns table (
  venta_item_id uuid, variante_id uuid, banda_id uuid, unidades int, precio_unit numeric,
  bruto numeric, descuento numeric, cargos numeric, neto numeric, costo numeric,
  ganancia numeric, ganancia_banda numeric, ganancia_showroom numeric,
  recupera_banda numeric, recupera_ap numeric, total_banda numeric, costo_pendiente boolean, pct_ganancia_banda numeric
)
language sql stable security definer set search_path = public as $$
  with v as (select * from ventas where id = p_venta),
  og as (select nullif(sum(precio_unit * cantidad), 0) as bruto_original from venta_items where venta_id = p_venta),
  l as (
    select i.*, (i.cantidad - i.cantidad_devuelta) as u,
           i.precio_unit * (i.cantidad - i.cantidad_devuelta) as b,
           (i.precio_unit * (i.cantidad - i.cantidad_devuelta)) / og.bruto_original as sh
    from venta_items i, og where i.venta_id = p_venta and i.cantidad > i.cantidad_devuelta
  ),
  c as (
    select l.*, v.descuento * l.sh as d, v.cargos * l.sh as cg,
           l.b - v.descuento * l.sh - v.cargos * l.sh as n,
           l.costo_unit * l.u as k
    from l, v
  )
  select c.id, c.variante_id, c.banda_id, c.u, c.precio_unit,
         round(c.b, 2), round(c.d, 2), round(c.cg, 2), round(c.n, 2), round(c.k, 2),
         round(c.n - c.k, 2),
         round((c.n - c.k) * c.pct_ganancia_banda / 100, 2),
         round((c.n - c.k) - (c.n - c.k) * c.pct_ganancia_banda / 100, 2),
         case when c.banda_id is not null and c.pagado_por = 'banda' and c.k is not null then round(c.k, 2) else 0 end,
         case when c.k is not null and (c.banda_id is null or c.pagado_por = 'ap') then round(c.k, 2) else 0 end,
         case when c.banda_id is null then 0
              else (case when c.pagado_por = 'banda' and c.k is not null then round(c.k, 2) else 0 end)
                   + coalesce(round((c.n - c.k) * c.pct_ganancia_banda / 100, 2), 0) end,
         c.k is null, c.pct_ganancia_banda
  from c
  -- se puede llamar directo, así que filtra igual que las vistas
  where es_admin() or (mi_rol() = 'banda' and c.banda_id = mi_banda())
$$;

create or replace function public.resumen_de_venta(p_venta uuid)
returns table (total numeric, esperado numeric, cobrado numeric, por_verificar numeric, saldo numeric)
language sql stable security definer set search_path = public as $$
  with i as (
    select coalesce(sum(precio_unit * cantidad), 0) as og,
           coalesce(sum(precio_unit * (cantidad - cantidad_devuelta)), 0) as g
    from venta_items where venta_id = p_venta
  ),
  v as (select descuento, cargos from ventas where id = p_venta),
  t as (
    select round(i.g - v.descuento * (i.g / nullif(i.og, 0)), 2) as total,
           round(i.g - (v.descuento + v.cargos) * (i.g / nullif(i.og, 0)), 2) as esperado
    from i, v
  ),
  p as (
    select coalesce(sum(monto) filter (where estado = 'confirmado'), 0) as conf,
           coalesce(sum(monto) filter (where estado = 'pendiente'), 0) as pend
    from pagos
    where venta_id = p_venta
       or reserva_id in (select id from reservas where venta_id = p_venta)
  )
  select coalesce(t.total, 0), coalesce(t.esperado, 0), p.conf, p.pend,
         coalesce(t.esperado, 0) - p.conf - p.pend
  from t, p
  where es_admin()
     or exists (select 1 from ventas where id = p_venta and vendedor_id = auth.uid())
     or exists (select 1 from venta_items where venta_id = p_venta and banda_id = mi_banda())
$$;

-- Caja abierta del lugar (el depósito cobra en la caja del showroom)
create or replace function public.caja_abierta(p_ubicacion uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_tipo tipo_ubicacion; v_lugar uuid; v_caja uuid;
begin
  select tipo into v_tipo from ubicaciones where id = p_ubicacion;
  v_lugar := p_ubicacion;
  if v_tipo = 'deposito' then
    select id into v_lugar from ubicaciones where tipo = 'showroom' and activa order by created_at limit 1;
  end if;
  select id into v_caja from cajas where ubicacion_id = v_lugar and estado = 'abierta' order by fecha desc limit 1;
  if v_caja is null then
    raise exception 'No hay una caja abierta en %. Abrila antes de cobrar en efectivo.',
      (select nombre from ubicaciones where id = v_lugar) using errcode = 'P0001';
  end if;
  return v_caja;
end $$;
