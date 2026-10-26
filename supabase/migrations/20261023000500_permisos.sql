-- =====================================================================
-- AMOR & PUNK · 05 · Permisos (RLS)
-- Los permisos se aplican en la base: aunque alguien arme una consulta
-- a mano con su usuario, la base no le devuelve lo que no le corresponde.
-- =====================================================================

-- Nadie anónimo ve nada
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Todo con RLS
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Tablas que solo se escriben con las funciones de 03_operaciones
revoke insert, update, delete on
  stock, movimientos_stock, ventas, venta_items, pagos, reservas, devoluciones, devolucion_items,
  fallas, entregas_bandas, cajas, caja_movimientos, auditoria, acuerdos, producto_costos
from authenticated;

-- Costos congelados en las ventas: los ítems se leen por v_items_venta / v_lineas_venta
revoke select on venta_items from authenticated;

-- ---------------------------------------------------------------------
-- Lectura
-- ---------------------------------------------------------------------
create policy bandas_ver on bandas for select to authenticated
  using (es_admin() or mi_rol() = 'vendedor' or id = mi_banda());
create policy bandas_admin on bandas for all to authenticated using (es_admin()) with check (es_admin());

create policy perfiles_ver on perfiles for select to authenticated using (id = auth.uid() or es_admin());
create policy perfiles_admin on perfiles for all to authenticated using (es_admin()) with check (es_admin());

create policy acuerdos_ver on acuerdos for select to authenticated using (es_admin() or banda_id = mi_banda());

create policy ubicaciones_ver on ubicaciones for select to authenticated using (mi_rol() is not null);
create policy ubicaciones_admin on ubicaciones for all to authenticated using (es_admin()) with check (es_admin());

create policy productos_ver on productos for select to authenticated
  using (es_admin() or mi_rol() = 'vendedor' or banda_id = mi_banda());
create policy productos_admin on productos for all to authenticated using (es_admin()) with check (es_admin());

create policy costos_ver on producto_costos for select to authenticated
  using (es_admin() or exists (select 1 from productos p where p.id = producto_id and p.banda_id = mi_banda()));

create policy variantes_ver on variantes for select to authenticated
  using (exists (select 1 from productos p where p.id = producto_id));   -- hereda la visibilidad del producto
create policy variantes_admin on variantes for all to authenticated using (es_admin()) with check (es_admin());

create policy stock_ver on stock for select to authenticated
  using (exists (select 1 from variantes v where v.id = variante_id));

create policy movimientos_ver on movimientos_stock for select to authenticated using (es_admin());

create or replace function public.venta_de_mi_banda(p_venta uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from venta_items where venta_id = p_venta and banda_id = mi_banda())
$$;

create policy ventas_ver on ventas for select to authenticated
  using (es_admin()
         or (mi_rol() = 'vendedor' and vendedor_id = auth.uid())
         or (mi_rol() = 'banda' and venta_de_mi_banda(id)));

create policy pagos_ver on pagos for select to authenticated
  using (es_admin() or (mi_rol() = 'vendedor' and exists (select 1 from ventas v where v.id = venta_id and v.vendedor_id = auth.uid())));

create policy reservas_ver on reservas for select to authenticated using (es_admin() or mi_rol() = 'vendedor');
create policy devoluciones_ver on devoluciones for select to authenticated using (es_admin());
create policy devolucion_items_ver on devolucion_items for select to authenticated using (es_admin());
create policy fallas_ver on fallas for select to authenticated using (es_admin());
create policy entregas_ver on entregas_bandas for select to authenticated using (es_admin() or banda_id = mi_banda());

-- Los vendedores ven qué caja está abierta, pero no el esperado (cierre ciego)
create policy cajas_ver on cajas for select to authenticated using (es_admin() or (mi_rol() = 'vendedor' and estado = 'abierta'));
revoke select on cajas from authenticated;
grant select (id, ubicacion_id, fecha, estado) on cajas to authenticated;
create policy caja_mov_ver on caja_movimientos for select to authenticated using (es_admin());

create policy pedidos_admin on pedidos for all to authenticated using (es_admin()) with check (es_admin());
create policy pedido_costos_admin on pedido_costos for all to authenticated using (es_admin()) with check (es_admin());

create policy auditoria_ver on auditoria for select to authenticated using (es_admin());

create policy notificaciones_mias on notificaciones for select to authenticated using (para = auth.uid());
create policy notificaciones_leer on notificaciones for update to authenticated using (para = auth.uid()) with check (para = auth.uid());

create policy configuracion_ver on configuracion for select to authenticated using (mi_rol() is not null);
create policy configuracion_admin on configuracion for all to authenticated using (es_admin()) with check (es_admin());

-- ---------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------
revoke all on v_stock, v_para_reponer, v_lineas_venta, v_ventas, v_items_venta, v_ajustes_fallas,
  v_cuenta_bandas, v_cajas, v_resultado_ferias, v_pedidos, v_resultado_general, v_historial from anon;
grant select on v_stock, v_para_reponer, v_lineas_venta, v_ventas, v_items_venta, v_ajustes_fallas,
  v_cuenta_bandas, v_cajas, v_resultado_ferias, v_pedidos, v_resultado_general, v_historial to authenticated;

-- ---------------------------------------------------------------------
-- Funciones: las de cálculo interno no se llaman desde afuera
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.proname in ('mi_rol','mi_banda','es_admin','hoy_ar','venta_de_mi_banda','lineas_de_venta','resumen_de_venta',
                     'crear_producto','cambiar_costo','cambiar_acuerdo','crear_banda',
                     'ingresar_stock','trasladar','ajustar_stock','registrar_falla',
                     'abrir_caja','movimiento_caja','cerrar_caja','crear_reserva','cancelar_reserva',
                     'registrar_venta','confirmar_pago','cobrar_venta','registrar_devolucion','anular_venta',
                     'registrar_entrega','registrar_pago_pedido') then
      execute format('grant execute on function %s to authenticated', f.sig);
    else
      execute format('revoke execute on function %s from authenticated', f.sig);
    end if;
  end loop;
end $$;
