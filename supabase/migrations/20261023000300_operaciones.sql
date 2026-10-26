-- =====================================================================
-- AMOR & PUNK · 03 · Operaciones (lo que llama la app)
-- Todas corren en una transacción: o se hace todo, o no se hace nada.
-- Cada una valida el rol de quien la llama.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------
create or replace function public.crear_producto(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
-- p: {nombre, categoria, banda_id|null, precio, precio_online, costo_unit|null, pagado_por,
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

  insert into productos (codigo, nombre, categoria, banda_id, precio, precio_online, foto_path, created_by)
  values (v_cod, trim(p->>'nombre'), p->>'categoria', v_banda, (p->>'precio')::numeric,
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

create or replace function public.cambiar_costo(p_producto uuid, p_costo numeric, p_pagado_por pagador) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_rol('admin');
  update producto_costos set costo_unit = p_costo, pagado_por = p_pagado_por, updated_at = now(), updated_by = auth.uid()
  where producto_id = p_producto;
end $$;

create or replace function public.cambiar_acuerdo(p_banda uuid, p_showroom numeric, p_feria numeric, p_tiendanube numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_rol('admin');
  insert into acuerdos (banda_id, canal, pct_ganancia_banda, created_by) values
    (p_banda, 'showroom', p_showroom, auth.uid()),
    (p_banda, 'feria', p_feria, auth.uid()),
    (p_banda, 'tiendanube', p_tiendanube, auth.uid());
end $$;

create or replace function public.crear_banda(p_nombre text, p_showroom numeric, p_feria numeric, p_tiendanube numeric, p_color text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform exigir_rol('admin');
  insert into bandas (nombre, color, created_by) values (trim(p_nombre), p_color, auth.uid()) returning id into v_id;
  perform cambiar_acuerdo(v_id, p_showroom, p_feria, p_tiendanube);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------
create or replace function public.ingresar_stock(p_variante uuid, p_ubicacion uuid, p_cantidad int, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform exigir_rol('admin');
  insert into movimientos_stock (tipo, variante_id, hacia_id, cantidad, motivo, created_by)
  values ('ingreso', p_variante, p_ubicacion, p_cantidad, p_motivo, auth.uid());
end $$;

create or replace function public.trasladar(p_variante uuid, p_desde uuid, p_hacia uuid, p_cantidad int, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform exigir_rol('admin');
  insert into movimientos_stock (tipo, variante_id, desde_id, hacia_id, cantidad, motivo, created_by)
  values ('traslado', p_variante, p_desde, p_hacia, p_cantidad, p_motivo, auth.uid());
end $$;

-- Ajuste por conteo: deja la cantidad en el número contado, con motivo
create or replace function public.ajustar_stock(p_variante uuid, p_ubicacion uuid, p_contado int, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_actual int; v_dif int;
begin
  perform exigir_rol('admin');
  if coalesce(trim(p_motivo), '') = '' then raise exception 'El ajuste necesita un motivo'; end if;
  select cantidad into v_actual from stock where variante_id = p_variante and ubicacion_id = p_ubicacion;
  v_dif := p_contado - coalesce(v_actual, 0);
  if v_dif > 0 then
    insert into movimientos_stock (tipo, variante_id, hacia_id, cantidad, motivo, created_by)
    values ('ajuste', p_variante, p_ubicacion, v_dif, p_motivo, auth.uid());
  elsif v_dif < 0 then
    insert into movimientos_stock (tipo, variante_id, desde_id, cantidad, motivo, created_by)
    values ('ajuste', p_variante, p_ubicacion, -v_dif, p_motivo, auth.uid());
  end if;
end $$;

create or replace function public.registrar_falla(p_variante uuid, p_ubicacion uuid, p_cantidad int, p_motivo text, p_absorbe pagador)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_prod productos; v_costo producto_costos;
begin
  perform exigir_rol('admin');
  select p.* into v_prod from productos p join variantes v on v.producto_id = p.id where v.id = p_variante;
  select * into v_costo from producto_costos where producto_id = v_prod.id;
  insert into fallas (variante_id, ubicacion_id, cantidad, motivo, absorbe, costo_unit, pagado_por, banda_id, created_by)
  values (p_variante, p_ubicacion, p_cantidad, p_motivo,
          case when v_prod.banda_id is null then 'ap' else p_absorbe end,
          v_costo.costo_unit, v_costo.pagado_por, v_prod.banda_id, auth.uid())
  returning id into v_id;
  insert into movimientos_stock (tipo, variante_id, desde_id, cantidad, motivo, falla_id, created_by)
  values ('falla', p_variante, p_ubicacion, p_cantidad, p_motivo, v_id, auth.uid());
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Cajas
-- ---------------------------------------------------------------------
create or replace function public.abrir_caja(p_ubicacion uuid, p_inicial numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform exigir_rol('admin', 'vendedor');
  if (select tipo from ubicaciones where id = p_ubicacion) = 'deposito' then
    raise exception 'El depósito no tiene caja propia: usa la del showroom';
  end if;
  insert into cajas (ubicacion_id, fecha, efectivo_inicial, abierta_por)
  values (p_ubicacion, hoy_ar(), p_inicial, auth.uid()) returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Ya hay una caja de hoy para ese lugar';
end $$;

create or replace function public.movimiento_caja(p_caja uuid, p_tipo tipo_mov_caja, p_concepto text, p_monto numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_tipo = 'retiro' then perform exigir_rol('admin'); else perform exigir_rol('admin', 'vendedor'); end if;
  if (select estado from cajas where id = p_caja) <> 'abierta' then raise exception 'La caja está cerrada'; end if;
  insert into caja_movimientos (caja_id, tipo, concepto, monto, created_by) values (p_caja, p_tipo, p_concepto, p_monto, auth.uid());
end $$;

-- El vendedor cierra contando, sin ver el esperado (cierre ciego). La diferencia la ven los admins.
create or replace function public.cerrar_caja(p_caja uuid, p_contado numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_rol('admin', 'vendedor');
  update cajas set estado = 'cerrada', efectivo_contado = p_contado, cerrada_por = auth.uid(), cerrada_at = now()
  where id = p_caja and estado = 'abierta';
  if not found then raise exception 'La caja no existe o ya está cerrada'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Reservas
-- ---------------------------------------------------------------------
create or replace function public.crear_reserva(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
-- p: {variante_id, ubicacion_id, cantidad, cliente, contacto, vence, sena:{medio, monto, cuenta_destino, referencia}}
declare v_id uuid; v_disp int; v_sena jsonb := p->'sena'; v_medio medio_pago;
begin
  perform exigir_rol('admin', 'vendedor');
  select cantidad - reservada into v_disp from stock
    where variante_id = (p->>'variante_id')::uuid and ubicacion_id = (p->>'ubicacion_id')::uuid for update;
  if coalesce(v_disp, 0) < (p->>'cantidad')::int then
    raise exception 'Solo hay % disponible(s) para reservar', coalesce(v_disp, 0);
  end if;
  update stock set reservada = reservada + (p->>'cantidad')::int
    where variante_id = (p->>'variante_id')::uuid and ubicacion_id = (p->>'ubicacion_id')::uuid;
  insert into reservas (variante_id, ubicacion_id, cantidad, cliente, contacto, vence, created_by)
  values ((p->>'variante_id')::uuid, (p->>'ubicacion_id')::uuid, (p->>'cantidad')::int, p->>'cliente', p->>'contacto',
          (p->>'vence')::date, auth.uid())
  returning id into v_id;
  if v_sena is not null and coalesce((v_sena->>'monto')::numeric, 0) > 0 then
    v_medio := (v_sena->>'medio')::medio_pago;
    insert into pagos (reserva_id, medio, monto, estado, cuenta_destino, referencia, caja_id, created_by)
    values (v_id, v_medio, (v_sena->>'monto')::numeric,
            case when v_medio = 'efectivo' then 'confirmado'::estado_pago else 'pendiente'::estado_pago end,
            v_sena->>'cuenta_destino', v_sena->>'referencia',
            case when v_medio = 'efectivo' then caja_abierta((p->>'ubicacion_id')::uuid) end, auth.uid());
  end if;
  return v_id;
end $$;

create or replace function public.cancelar_reserva(p_reserva uuid, p_devolver_sena boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r reservas; v_sena numeric; v_medio medio_pago;
begin
  perform exigir_rol('admin');
  select * into r from reservas where id = p_reserva for update;
  if r.estado <> 'activa' then raise exception 'La reserva no está activa'; end if;
  update stock set reservada = reservada - r.cantidad where variante_id = r.variante_id and ubicacion_id = r.ubicacion_id;
  update reservas set estado = 'cancelada', cerrada_at = now() where id = p_reserva;
  select sum(monto), min(medio::text)::medio_pago into v_sena, v_medio from pagos where reserva_id = p_reserva;
  if p_devolver_sena and coalesce(v_sena, 0) > 0 then
    insert into pagos (reserva_id, medio, monto, estado, caja_id, es_reintegro, created_by)
    values (p_reserva, v_medio, -v_sena, 'confirmado',
            case when v_medio = 'efectivo' then caja_abierta(r.ubicacion_id) end, true, auth.uid());
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Ventas
-- ---------------------------------------------------------------------
create or replace function public.registrar_venta(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
-- p: {clave_idempotencia, canal, ubicacion_id, tiendanube_pedido, descuento, cargos, envio, nota,
--     reserva_id, credito:{venta_id, monto},
--     items:[{variante_id, cantidad, precio_unit (solo admin puede cambiar el precio)}],
--     pagos:[{medio, monto, cuenta_destino, referencia}]}
declare
  v_rol rol_usuario := mi_rol();
  v_id uuid; v_canal canal_venta := (p->>'canal')::canal_venta; v_ubic uuid := (p->>'ubicacion_id')::uuid;
  v_tipo tipo_ubicacion; it jsonb; pg jsonb; v_prod productos; v_costo producto_costos;
  v_precio numeric; v_pct numeric; r reservas; v_medio medio_pago; v_res record; v_cred numeric; v_ant record;
begin
  perform exigir_rol('admin', 'vendedor');

  if p ? 'clave_idempotencia' then
    select id into v_id from ventas where clave_idempotencia = (p->>'clave_idempotencia')::uuid;
    if v_id is not null then return v_id; end if;   -- ya se cargó: no se duplica
  end if;

  if v_canal = 'tiendanube' and v_rol <> 'admin' then raise exception 'Las ventas de Tiendanube las cargan los admins'; end if;
  if v_canal = 'tiendanube' and exists (select 1 from ventas where tiendanube_pedido = p->>'tiendanube_pedido') then
    raise exception 'El pedido #% ya está cargado', p->>'tiendanube_pedido';
  end if;
  select tipo into v_tipo from ubicaciones where id = v_ubic and activa;
  if v_tipo is null then raise exception 'Ese lugar no existe o está inactivo'; end if;
  if v_canal = 'feria' and v_tipo <> 'feria' then raise exception 'Una venta de feria tiene que salir del stock de la feria'; end if;
  if v_canal <> 'feria' and v_tipo = 'feria' then raise exception 'El stock de una feria se vende como venta de feria'; end if;
  if jsonb_array_length(coalesce(p->'items', '[]')) = 0 then raise exception 'La venta no tiene productos'; end if;

  insert into ventas (canal, ubicacion_id, tiendanube_pedido, vendedor_id, descuento, cargos, envio, nota, clave_idempotencia)
  values (v_canal, v_ubic, nullif(p->>'tiendanube_pedido', ''), auth.uid(),
          coalesce((p->>'descuento')::numeric, 0),
          case when v_canal = 'tiendanube' then coalesce((p->>'cargos')::numeric, 0) else 0 end,
          coalesce((p->>'envio')::numeric, 0), p->>'nota', (p->>'clave_idempotencia')::uuid)
  returning id into v_id;

  -- reserva que se concreta: libera lo reservado para poder venderlo
  if nullif(p->>'reserva_id', '') is not null then
    select * into r from reservas where id = (p->>'reserva_id')::uuid for update;
    if r.estado <> 'activa' then raise exception 'La reserva no está activa'; end if;
    if r.ubicacion_id <> v_ubic then raise exception 'La reserva es de otro lugar'; end if;
    update stock set reservada = reservada - r.cantidad where variante_id = r.variante_id and ubicacion_id = r.ubicacion_id;
    update reservas set estado = 'concretada', venta_id = v_id, cerrada_at = now() where id = r.id;
  end if;

  for it in select * from jsonb_array_elements(p->'items') loop
    select pr.* into v_prod from productos pr join variantes va on va.producto_id = pr.id
      where va.id = (it->>'variante_id')::uuid;
    if v_prod.id is null then raise exception 'Producto inexistente'; end if;
    select * into v_costo from producto_costos where producto_id = v_prod.id;
    v_precio := case when v_canal = 'tiendanube' then coalesce(v_prod.precio_online, v_prod.precio) else v_prod.precio end;
    if v_rol = 'admin' and it ? 'precio_unit' then v_precio := (it->>'precio_unit')::numeric; end if;
    v_pct := 0;
    if v_prod.banda_id is not null then
      v_pct := acuerdo_vigente(v_prod.banda_id, v_canal);
      if v_pct is null then raise exception 'La banda del producto % no tiene acuerdo para %', v_prod.nombre, v_canal; end if;
    end if;
    insert into venta_items (venta_id, variante_id, cantidad, precio_unit, costo_unit, pagado_por, banda_id, pct_ganancia_banda)
    values (v_id, (it->>'variante_id')::uuid, (it->>'cantidad')::int, v_precio, v_costo.costo_unit,
            coalesce(v_costo.pagado_por, 'ap'), v_prod.banda_id, v_pct);
    insert into movimientos_stock (tipo, variante_id, desde_id, cantidad, venta_id, created_by)
    values ('venta', (it->>'variante_id')::uuid, v_ubic, (it->>'cantidad')::int, v_id, auth.uid());
  end loop;

  -- saldo a favor de una venta anterior (cambios)
  if p->'credito' is not null then
    v_cred := (p->'credito'->>'monto')::numeric;
    select * into v_ant from resumen_de_venta((p->'credito'->>'venta_id')::uuid);
    if v_ant.saldo is null or v_cred <= 0 or -v_ant.saldo < v_cred then raise exception 'La venta % no tiene ese saldo a favor', p->'credito'->>'venta_id'; end if;
    insert into pagos (venta_id, medio, monto, referencia, created_by) values
      (v_id, 'saldo_a_favor', v_cred, 'Saldo a favor de otra venta', auth.uid()),
      ((p->'credito'->>'venta_id')::uuid, 'saldo_a_favor', -v_cred, 'Aplicado a una venta nueva', auth.uid());
  end if;

  for pg in select * from jsonb_array_elements(coalesce(p->'pagos', '[]')) loop
    v_medio := (pg->>'medio')::medio_pago;
    if (pg->>'monto')::numeric <= 0 then continue; end if;
    if v_medio = 'saldo_a_favor' then raise exception 'El saldo a favor va en "credito"'; end if;
    insert into pagos (venta_id, medio, monto, estado, cuenta_destino, referencia, caja_id, created_by)
    values (v_id, v_medio, (pg->>'monto')::numeric,
            case when v_medio = 'efectivo' then 'confirmado'::estado_pago else 'pendiente'::estado_pago end,   -- transferencias se verifican a mano
            pg->>'cuenta_destino', pg->>'referencia',
            case when v_medio = 'efectivo' then caja_abierta(v_ubic) end, auth.uid());
  end loop;

  select * into v_res from resumen_de_venta(v_id);
  if v_res.saldo < -0.01 then raise exception 'Los pagos superan el total de la venta (el vuelto no se carga)'; end if;
  return v_id;
end $$;

create or replace function public.confirmar_pago(p_pago uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_rol('admin');
  update pagos set estado = 'confirmado', confirmado_por = auth.uid(), confirmado_at = now()
  where id = p_pago and estado = 'pendiente';
  if not found then raise exception 'Ese pago no existe o ya estaba confirmado'; end if;
end $$;

-- Cobrar el saldo de una venta (pago parcial o final)
create or replace function public.cobrar_venta(p_venta uuid, p_medio medio_pago, p_monto numeric, p_cuenta text default null, p_ref text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_res record; v_ubic uuid;
begin
  perform exigir_rol('admin', 'vendedor');
  if mi_rol() = 'vendedor' and not exists (select 1 from ventas where id = p_venta and vendedor_id = auth.uid()) then
    raise exception 'Solo podés cobrar ventas que cargaste vos';
  end if;
  select * into v_res from resumen_de_venta(p_venta);
  if p_monto <= 0 or p_monto > v_res.saldo + 0.01 then raise exception 'El monto supera el saldo de la venta'; end if;
  select ubicacion_id into v_ubic from ventas where id = p_venta;
  insert into pagos (venta_id, medio, monto, estado, cuenta_destino, referencia, caja_id, created_by)
  values (p_venta, p_medio, p_monto, case when p_medio = 'efectivo' then 'confirmado'::estado_pago else 'pendiente'::estado_pago end,
          p_cuenta, p_ref, case when p_medio = 'efectivo' then caja_abierta(v_ubic) end, auth.uid());
end $$;

-- Devoluciones, cambios y anulaciones. Corrige stock, dinero y cuenta de la banda.
create or replace function public.registrar_devolucion(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
-- p: {venta_id, motivo, destino:'stock'|'falla', items:[{venta_item_id, cantidad}],
--     reintegro:{medio, monto, cuenta_destino, referencia}}
declare
  v_venta ventas; v_dev uuid; it jsonb; vi venta_items; v_q int; v_res record; v_rein numeric; v_medio medio_pago; v_falla uuid;
begin
  perform exigir_rol('admin');
  if coalesce(trim(p->>'motivo'), '') = '' then raise exception 'La devolución necesita un motivo'; end if;
  select * into v_venta from ventas where id = (p->>'venta_id')::uuid for update;
  if v_venta.anulada then raise exception 'La venta ya está anulada'; end if;
  select * into v_res from resumen_de_venta(v_venta.id);

  insert into devoluciones (venta_id, motivo, destino, created_by)
  values (v_venta.id, p->>'motivo', coalesce(p->>'destino', 'stock'), auth.uid()) returning id into v_dev;

  for it in select * from jsonb_array_elements(p->'items') loop
    select * into vi from venta_items where id = (it->>'venta_item_id')::uuid and venta_id = v_venta.id for update;
    v_q := (it->>'cantidad')::int;
    if vi.id is null or v_q <= 0 or v_q > vi.cantidad - vi.cantidad_devuelta then
      raise exception 'Cantidad a devolver inválida';
    end if;
    update venta_items set cantidad_devuelta = cantidad_devuelta + v_q where id = vi.id;
    insert into devolucion_items (devolucion_id, venta_item_id, cantidad) values (v_dev, vi.id, v_q);
    if coalesce(p->>'destino', 'stock') = 'stock' then
      insert into movimientos_stock (tipo, variante_id, hacia_id, cantidad, motivo, venta_id, devolucion_id, created_by)
      values ('devolucion', vi.variante_id, v_venta.ubicacion_id, v_q, p->>'motivo', v_venta.id, v_dev, auth.uid());
    else
      -- vuelve fallada: nunca entra al stock vendible; queda registrada como falla que absorbe A&P
      insert into fallas (variante_id, ubicacion_id, cantidad, motivo, absorbe, costo_unit, pagado_por, banda_id, devolucion_id, created_by)
      values (vi.variante_id, v_venta.ubicacion_id, v_q, 'Devuelta con falla: ' || (p->>'motivo'), 'ap',
              vi.costo_unit, vi.pagado_por, vi.banda_id, v_dev, auth.uid());
    end if;
  end loop;

  v_rein := coalesce((p->'reintegro'->>'monto')::numeric, 0);
  if v_rein > 0 then
    if v_rein > v_res.cobrado + v_res.por_verificar + 0.01 then raise exception 'No se puede reintegrar más de lo cobrado'; end if;
    v_medio := (p->'reintegro'->>'medio')::medio_pago;
    insert into pagos (venta_id, medio, monto, estado, cuenta_destino, referencia, caja_id, es_reintegro, created_by)
    values (v_venta.id, v_medio, -v_rein, 'confirmado', p->'reintegro'->>'cuenta_destino', p->'reintegro'->>'referencia',
            case when v_medio = 'efectivo' then caja_abierta(v_venta.ubicacion_id) end, true, auth.uid());
  end if;

  if not exists (select 1 from venta_items where venta_id = v_venta.id and cantidad > cantidad_devuelta) then
    update ventas set anulada = true where id = v_venta.id;
  end if;
  return v_dev;
end $$;

-- Anular = devolver todo
create or replace function public.anular_venta(p_venta uuid, p_motivo text, p_reintegro_medio medio_pago default 'efectivo')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_res record; v_items jsonb;
begin
  perform exigir_rol('admin');
  select * into v_res from resumen_de_venta(p_venta);
  select jsonb_agg(jsonb_build_object('venta_item_id', id, 'cantidad', cantidad - cantidad_devuelta)) into v_items
    from venta_items where venta_id = p_venta and cantidad > cantidad_devuelta;
  return registrar_devolucion(jsonb_build_object(
    'venta_id', p_venta, 'motivo', p_motivo, 'destino', 'stock', 'items', v_items,
    'reintegro', jsonb_build_object('medio', p_reintegro_medio, 'monto', greatest(v_res.cobrado, 0))));
end $$;

-- ---------------------------------------------------------------------
-- Bandas: entregas de plata (liquidaciones)
-- ---------------------------------------------------------------------
create or replace function public.registrar_entrega(p_banda uuid, p_monto numeric, p_medio medio_pago, p_referencia text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_showroom uuid;
begin
  perform exigir_rol('admin');
  select id into v_showroom from ubicaciones where tipo = 'showroom' and activa order by created_at limit 1;
  insert into entregas_bandas (banda_id, monto, medio, caja_id, referencia, created_by)
  values (p_banda, p_monto, p_medio, case when p_medio = 'efectivo' then caja_abierta(v_showroom) end, p_referencia, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Personalizados: pagos (señas y saldo)
-- ---------------------------------------------------------------------
create or replace function public.registrar_pago_pedido(p_pedido uuid, p_medio medio_pago, p_monto numeric, p_cuenta text default null, p_ref text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_showroom uuid;
begin
  perform exigir_rol('admin');
  if p_monto <= 0 then raise exception 'El pago tiene que ser mayor a cero'; end if;
  select id into v_showroom from ubicaciones where tipo = 'showroom' and activa order by created_at limit 1;
  insert into pagos (pedido_id, medio, monto, estado, cuenta_destino, referencia, caja_id, created_by)
  values (p_pedido, p_medio, p_monto, case when p_medio = 'efectivo' then 'confirmado'::estado_pago else 'pendiente'::estado_pago end,
          p_cuenta, p_ref, case when p_medio = 'efectivo' then caja_abierta(v_showroom) end, auth.uid())
  returning id into v_id;
  return v_id;
end $$;
