-- =====================================================================
-- AMOR & PUNK · 07 · Descripción de productos y baja de productos
-- Se puede correr más de una vez sin problema.
-- =====================================================================

alter table productos add column if not exists descripcion text;

-- Alta de producto con descripción (muñecos, accesorios y todo lo que no es remera)
create or replace function public.crear_producto(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
-- p: {nombre, categoria, descripcion, banda_id|null, precio, precio_online, costo_unit|null, pagado_por,
--     talles:["S","M"], colores:["Negro"], cantidad, ubicacion_id, foto_path}
declare
  v_id uuid; v_pre text; v_pal text; v_cod text; v_n int := 1;
  v_talle text; v_color text; v_var uuid; v_cant int := coalesce((p->>'cantidad')::int, 0);
  v_banda uuid := nullif(p->>'banda_id', '')::uuid;
begin
  perform exigir_rol('admin');
  if coalesce(trim(p->>'nombre'), '') = '' then raise exception 'Falta el nombre del producto'; end if;

  v_pre := case when v_banda is null then 'AP'
                else upper(left(regexp_replace((select nombre from bandas where id = v_banda), '[^A-Za-z]', '', 'g'), 3)) end;
  select upper(left(regexp_replace(w, '[^A-Za-z0-9]', '', 'g'), 6)) into v_pal
    from regexp_split_to_table(p->>'nombre', '\s+') w where length(regexp_replace(w, '[^A-Za-z0-9]', '', 'g')) > 3 limit 1;
  v_cod := v_pre || '-' || coalesce(v_pal, upper(left(regexp_replace(p->>'nombre', '[^A-Za-z0-9]', '', 'g'), 6)));
  while exists (select 1 from productos where codigo = v_cod || case when v_n > 1 then v_n::text else '' end) loop
    v_n := v_n + 1;
  end loop;
  if v_n > 1 then v_cod := v_cod || v_n; end if;

  insert into productos (codigo, nombre, categoria, descripcion, banda_id, precio, precio_online, foto_path, created_by)
  values (v_cod, trim(p->>'nombre'), nullif(trim(p->>'categoria'), ''), nullif(trim(p->>'descripcion'), ''), v_banda, (p->>'precio')::numeric,
          coalesce((p->>'precio_online')::numeric, (p->>'precio')::numeric), p->>'foto_path', auth.uid())
  returning id into v_id;

  insert into producto_costos (producto_id, costo_unit, pagado_por, updated_by)
  values (v_id, nullif(p->>'costo_unit', '')::numeric,
          case when v_banda is null then 'ap' else coalesce((p->>'pagado_por')::pagador, 'ap') end, auth.uid());

  for v_talle in select trim(x) from jsonb_array_elements_text(
      case when jsonb_array_length(coalesce(p->'talles', '[]')) = 0 then '[""]'::jsonb else p->'talles' end) x loop
    for v_color in select trim(x) from jsonb_array_elements_text(
        case when jsonb_array_length(coalesce(p->'colores', '[]')) = 0 then '[""]'::jsonb else p->'colores' end) x loop
      insert into variantes (producto_id, talle, color, codigo)
      values (v_id, upper(v_talle), v_color,
              v_cod || case when v_talle <> '' then '-' || upper(v_talle) else '' end
                    || case when v_color <> '' then '-' || upper(left(v_color, 3)) else '' end)
      returning id into v_var;
      if v_cant > 0 then
        insert into movimientos_stock (tipo, variante_id, hacia_id, cantidad, motivo, created_by)
        values ('ingreso', v_var, (p->>'ubicacion_id')::uuid, v_cant, 'Alta de producto', auth.uid());
      end if;
    end loop;
  end loop;
  return v_id;
end $$;


-- Editar los datos de un producto. El precio nuevo vale para las ventas que vienen:
-- las anteriores guardan el precio con el que se vendieron.
create or replace function public.editar_producto(p_producto uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_rol('admin');
  if coalesce(trim(p->>'nombre'), '') = '' then raise exception 'Falta el nombre del producto'; end if;
  update productos set
    nombre        = trim(p->>'nombre'),
    categoria     = nullif(trim(p->>'categoria'), ''),
    descripcion   = nullif(trim(p->>'descripcion'), ''),
    precio        = (p->>'precio')::numeric,
    precio_online = coalesce(nullif(p->>'precio_online', '')::numeric, (p->>'precio')::numeric)
  where id = p_producto;
  if not found then raise exception 'Ese producto no existe'; end if;
end $$;

-- Eliminar un producto: deja de aparecer en stock, ventas y reportes nuevos.
-- No se borra de la base para no romper el historial de ventas y movimientos.
create or replace function public.eliminar_producto(p_producto uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_rol('admin');
  if exists (select 1 from reservas r join variantes v on v.id = r.variante_id
             where v.producto_id = p_producto and r.estado = 'activa') then
    raise exception 'Tiene reservas activas. Cancelalas o vendelas antes de eliminarlo.';
  end if;
  update productos set activo = false where id = p_producto;
  if not found then raise exception 'Ese producto no existe'; end if;
  update variantes set activa = false where producto_id = p_producto;
end $$;

-- El stock y la venta muestran solo productos activos
create or replace view v_stock with (security_invoker = on) as
select s.variante_id, va.codigo as variante_codigo, va.talle, va.color,
       p.id as producto_id, p.codigo as producto_codigo, p.nombre as producto, p.categoria, p.banda_id, p.precio, p.precio_online, p.foto_path,
       s.ubicacion_id, u.nombre as ubicacion, u.tipo as tipo_ubicacion,
       s.cantidad, s.reservada, s.cantidad - s.reservada as disponible
from stock s
join variantes va on va.id = s.variante_id and va.activa
join productos p on p.id = va.producto_id and p.activo
join ubicaciones u on u.id = s.ubicacion_id;

-- Un usuario se puede borrar solo si no tiene ventas cargadas (si tiene, se desactiva)
create or replace function public.usuario_borrable(p_usuario uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_admin() and not exists (select 1 from ventas where vendedor_id = p_usuario)
$$;

revoke execute on function public.editar_producto(uuid, jsonb), public.eliminar_producto(uuid),
  public.usuario_borrable(uuid), public.crear_producto(jsonb) from public, anon;
grant execute on function public.editar_producto(uuid, jsonb), public.eliminar_producto(uuid),
  public.usuario_borrable(uuid), public.crear_producto(jsonb) to authenticated;
grant select on v_stock to authenticated;
