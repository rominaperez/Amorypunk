-- =====================================================================
-- Casos mínimos de aceptación del documento, de punta a punta.
-- Cada chequeo que falla corta la prueba con el detalle.
-- =====================================================================
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- ayudantes de prueba ----------
create schema test;
grant usage on schema test to authenticated;
create function test.put(k text, v text) returns void language sql as $$ select set_config('t.' || k, v, false) $$;
create function test.id(k text) returns uuid language sql stable as $$ select current_setting('t.' || k)::uuid $$;
create function test.eq(etiqueta text, obtenido numeric, esperado numeric) returns void language plpgsql as $$
begin
  if obtenido is distinct from esperado then
    raise exception 'FALLÓ %: obtuve %, esperaba %', etiqueta, obtenido, esperado;
  end if;
  raise notice '  ok  %  (%)', etiqueta, obtenido;
end $$;
create function test.como(usuario text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', case usuario
    when 'gero'  then '00000000-0000-0000-0000-000000000001'
    when 'romy'  then '00000000-0000-0000-0000-000000000002'
    when 'lucas' then '00000000-0000-0000-0000-000000000003'
    when 'facu'  then '00000000-0000-0000-0000-000000000004' end, false);
end $$;
grant execute on all functions in schema test to authenticated;

-- ---------- usuarios ----------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'gero@amorypunk.test'),
  ('00000000-0000-0000-0000-000000000002', 'romy@amorypunk.test'),
  ('00000000-0000-0000-0000-000000000003', 'lucas@amorypunk.test'),
  ('00000000-0000-0000-0000-000000000004', 'facu@amorypunk.test');
insert into perfiles (id, nombre, rol) values ('00000000-0000-0000-0000-000000000001', 'Gero', 'admin');

select test.put('showroom', (select id::text from ubicaciones where tipo = 'showroom'));
select test.put('deposito', (select id::text from ubicaciones where tipo = 'deposito'));
select test.put('nih', (select id::text from bandas where nombre = 'Nihilismo'));

-- ======================= como Gero (admin) =======================
select test.como('gero');
set role authenticated;

\echo '— Usuarios: Gero crea a Romy (admin), Lucas (vendedor) y Facu (Nihilismo)'
insert into perfiles (id, nombre, rol) values ('00000000-0000-0000-0000-000000000002', 'Romy', 'admin');
insert into perfiles (id, nombre, rol) values ('00000000-0000-0000-0000-000000000003', 'Lucas', 'vendedor');
insert into perfiles (id, nombre, rol, banda_id) values ('00000000-0000-0000-0000-000000000004', 'Facu', 'banda', test.id('nih'));

\echo '— Alta de productos y caja del día'
select test.put('caja', abrir_caja(test.id('showroom'), 20000)::text);
select test.put('p_ap', crear_producto(jsonb_build_object(
  'nombre','Remera logo recortado','categoria','Remeras','precio',25000,'precio_online',28000,
  'costo_unit',15000,'talles',jsonb_build_array('M'),'colores',jsonb_build_array('Negro'),
  'cantidad',5,'ubicacion_id',test.id('showroom')))::text);
select test.put('p_nih', crear_producto(jsonb_build_object(
  'nombre','Remera Nada','categoria','Remeras','banda_id',test.id('nih'),'precio',25000,'precio_online',30000,
  'costo_unit',15000,'pagado_por','banda','talles',jsonb_build_array('M','L'),'colores',jsonb_build_array('Negro'),
  'cantidad',5,'ubicacion_id',test.id('showroom')))::text);
select test.put('v_ap',    (select id::text from variantes where producto_id = test.id('p_ap')));
select test.put('v_nih_m', (select id::text from variantes where producto_id = test.id('p_nih') and talle = 'M'));
select test.put('v_nih_l', (select id::text from variantes where producto_id = test.id('p_nih') and talle = 'L'));
select test.eq('códigos generados', (select count(*) from variantes where codigo in ('AP-RECORTADO','AP-REMERA-M-NEG','NIH-REMERA-M-NEG','NIH-REMERA-L-NEG'))::numeric, 3);

\echo ''
\echo 'CASO 1 · Venta de producto propio de A&P'
select test.put('v1', registrar_venta(jsonb_build_object('canal','showroom','ubicacion_id',test.id('showroom'),
  'items', jsonb_build_array(jsonb_build_object('variante_id',test.id('v_ap'),'cantidad',1)),
  'pagos', jsonb_build_array(jsonb_build_object('medio','efectivo','monto',25000))))::text);
select test.eq('ganancia showroom', ganancia_showroom, 10000) from v_lineas_venta where venta_id = test.id('v1');
select test.eq('A&P recupera su costo', recupera_ap, 15000) from v_lineas_venta where venta_id = test.id('v1');
select test.eq('nada para bandas', total_banda, 0) from v_lineas_venta where venta_id = test.id('v1');
select test.eq('saldo', saldo, 0) from v_ventas where id = test.id('v1');

\echo ''
\echo 'CASO 2 · Venta de banda en showroom con reparto 50/50'
select test.put('v2', registrar_venta(jsonb_build_object('canal','showroom','ubicacion_id',test.id('showroom'),
  'items', jsonb_build_array(jsonb_build_object('variante_id',test.id('v_nih_m'),'cantidad',1)),
  'pagos', jsonb_build_array(jsonb_build_object('medio','efectivo','monto',25000))))::text);
select test.eq('ganancia total', ganancia, 10000) from v_lineas_venta where venta_id = test.id('v2');
select test.eq('banda: recupera costo', recupera_banda, 15000) from v_lineas_venta where venta_id = test.id('v2');
select test.eq('banda: ganancia', ganancia_banda, 5000) from v_lineas_venta where venta_id = test.id('v2');
select test.eq('banda: total', total_banda, 20000) from v_lineas_venta where venta_id = test.id('v2');
select test.eq('showroom: ganancia', ganancia_showroom, 5000) from v_lineas_venta where venta_id = test.id('v2');

\echo ''
\echo 'CASO 6 (ida) · Traslado a feria'
insert into ubicaciones (tipo, nombre, fecha) values ('feria', 'Feria Plaza Dorrego', hoy_ar());
select test.put('feria', (select id::text from ubicaciones where tipo = 'feria'));
select trasladar(test.id('v_nih_l'), test.id('showroom'), test.id('feria'), 3, 'Para la feria');
select test.eq('en la feria', cantidad::numeric, 3) from stock where variante_id = test.id('v_nih_l') and ubicacion_id = test.id('feria');
select test.eq('ventas por trasladar', (select count(*) from ventas)::numeric, 2);

\echo ''
\echo 'CASO 3 · Venta de Nihilismo en feria (todo para la banda)'
select abrir_caja(test.id('feria'), 0);
select movimiento_caja((select id from cajas where ubicacion_id = test.id('feria')), 'gasto', 'Puesto', 25000);
select test.put('v3', registrar_venta(jsonb_build_object('canal','feria','ubicacion_id',test.id('feria'),
  'items', jsonb_build_array(jsonb_build_object('variante_id',test.id('v_nih_l'),'cantidad',2)),
  'pagos', jsonb_build_array(jsonb_build_object('medio','efectivo','monto',50000))))::text);
select test.eq('banda: total', total_banda, 50000) from v_lineas_venta where venta_id = test.id('v3');
select test.eq('showroom: ganancia', ganancia_showroom, 0) from v_lineas_venta where venta_id = test.id('v3');
select test.eq('resultado de la feria (puesto lo pagó el showroom)', resultado, -25000) from v_resultado_ferias where feria_id = test.id('feria');

\echo ''
\echo 'CASO 6 (vuelta) · Devolución del sobrante'
select trasladar(test.id('v_nih_l'), test.id('feria'), test.id('showroom'), 1, 'Vuelve de la feria');
select test.eq('feria vacía', cantidad::numeric, 0) from stock where variante_id = test.id('v_nih_l') and ubicacion_id = test.id('feria');
select test.eq('showroom L', cantidad::numeric, 3) from stock where variante_id = test.id('v_nih_l') and ubicacion_id = test.id('showroom');
select test.eq('ventas generadas por la feria', (select count(*) from ventas where canal = 'feria')::numeric, 1);

\echo ''
\echo 'CASO 4 · Venta online con cargos y ganancia para la banda'
select test.put('v4', registrar_venta(jsonb_build_object('canal','tiendanube','ubicacion_id',test.id('showroom'),
  'tiendanube_pedido','1043','cargos',3000,'envio',4500,
  'items', jsonb_build_array(jsonb_build_object('variante_id',test.id('v_nih_m'),'cantidad',1)),
  'pagos', jsonb_build_array(jsonb_build_object('medio','tiendanube','monto',27000))))::text);
select test.eq('neto recibido', neto, 27000) from v_lineas_venta where venta_id = test.id('v4');
select test.eq('ganancia', ganancia, 12000) from v_lineas_venta where venta_id = test.id('v4');
select test.eq('banda: total', total_banda, 27000) from v_lineas_venta where venta_id = test.id('v4');
select test.eq('showroom: ganancia', ganancia_showroom, 0) from v_lineas_venta where venta_id = test.id('v4');
select test.eq('pendiente de acreditación', por_verificar, 27000) from v_ventas where id = test.id('v4');
select test.eq('no entra a la caja', (select count(*) from pagos where venta_id = test.id('v4') and caja_id is not null)::numeric, 0);
do $$ begin
  perform registrar_venta(jsonb_build_object('canal','tiendanube','ubicacion_id',test.id('showroom'),'tiendanube_pedido','1043',
    'items', jsonb_build_array(jsonb_build_object('variante_id',test.id('v_nih_m'),'cantidad',1))));
  raise exception 'DEBIA_FALLAR';
exception when others then
  if sqlerrm = 'DEBIA_FALLAR' then raise exception 'FALLÓ: se duplicó el pedido 1043'; end if;
  raise notice '  ok  pedido duplicado rechazado (%)', sqlerrm;
end $$;

\echo ''
\echo 'CASO 7 · Liquidación a banda sin duplicar costos'
select test.eq('le corresponde a Nihilismo', corresponde, 97000) from v_cuenta_bandas where banda_id = test.id('nih');
select registrar_entrega(test.id('nih'), 20000, 'efectivo');
select test.eq('después de entregar: corresponde igual', corresponde, 97000) from v_cuenta_bandas where banda_id = test.id('nih');
select test.eq('saldo', saldo, 77000) from v_cuenta_bandas where banda_id = test.id('nih');

\echo ''
\echo 'CASO 5 · Personalizado con seña, saldo, producción y entrega'
insert into pedidos (cliente, detalle, cantidad, presupuesto, estado) values ('Doble Fuerza', '20 remeras negras serigrafía 1 color', 20, 300000, 'aprobado');
select test.put('ped', (select id::text from pedidos where cliente = 'Doble Fuerza'));
insert into pedido_costos (pedido_id, concepto, monto) values
  (test.id('ped'), 'Remeras base', 110000), (test.id('ped'), 'Serigrafía', 62000), (test.id('ped'), 'Diseño', null);
select test.put('sena', registrar_pago_pedido(test.id('ped'), 'transferencia', 150000, 'MP A&P', 'op 1')::text);
select confirmar_pago(test.id('sena'));
update pedidos set estado = 'produccion' where id = test.id('ped');
select test.eq('saldo después de la seña', saldo, 150000) from v_pedidos where id = test.id('ped');
select registrar_pago_pedido(test.id('ped'), 'efectivo', 150000);
update pedidos set estado = 'entregado', entregado_at = now() where id = test.id('ped');
select test.eq('total cobrado (la seña no se cuenta dos veces)', cobrado, 300000) from v_pedidos where id = test.id('ped');
select test.eq('saldo final', saldo, 0) from v_pedidos where id = test.id('ped');
select test.eq('ganancia A&P (parcial, falta diseño)', ganancia, 128000) from v_pedidos where id = test.id('ped');
select test.eq('costos pendientes marcados', costos_pendientes, 1) from v_pedidos where id = test.id('ped');

\echo ''
\echo 'EXTRA · Reserva con seña que después se vende'
select test.put('res', crear_reserva(jsonb_build_object('variante_id',test.id('v_nih_m'),'ubicacion_id',test.id('showroom'),
  'cantidad',1,'cliente','Martina','sena',jsonb_build_object('medio','efectivo','monto',5000)))::text);
select test.eq('disponible baja con la reserva', disponible::numeric, 2) from v_stock where variante_id = test.id('v_nih_m') and ubicacion_id = test.id('showroom');
select test.put('v5', registrar_venta(jsonb_build_object('canal','showroom','ubicacion_id',test.id('showroom'),'reserva_id',test.id('res'),
  'items', jsonb_build_array(jsonb_build_object('variante_id',test.id('v_nih_m'),'cantidad',1)),
  'pagos', jsonb_build_array(jsonb_build_object('medio','efectivo','monto',20000))))::text);
select test.eq('la seña cuenta como pago', saldo, 0) from v_ventas where id = test.id('v5');

\echo ''
\echo 'EXTRA · Anulación: corrige stock, caja y cuenta'
select anular_venta(test.id('v1'), 'Cargada dos veces');
select test.eq('stock A&P vuelve', cantidad::numeric, 5) from stock where variante_id = test.id('v_ap') and ubicacion_id = test.id('showroom');
select test.eq('venta anulada sin saldo', saldo, 0) from v_ventas where id = test.id('v1');
select test.eq('sale de reportes', (select count(*) from v_lineas_venta where venta_id = test.id('v1'))::numeric, 0);

\echo ''
\echo 'EXTRA · Falla de banda absorbida por A&P'
select registrar_falla(test.id('v_nih_l'), test.id('showroom'), 1, 'Costura abierta', 'ap');
select test.eq('A&P le reconoce el costo a la banda', corresponde, 132000) from v_cuenta_bandas where banda_id = test.id('nih');

\echo ''
\echo 'EXTRA · Caja del showroom'
-- 20000 inicial + 25000 + 25000 + 150000 personalizado + 5000 seña + 20000 − 25000 reintegro − 20000 entrega
select test.eq('efectivo esperado', esperado, 200000) from v_cajas where id = test.id('caja');

\echo ''
\echo 'EXTRA · Controles'
do $$ declare k uuid := gen_random_uuid(); a uuid; b uuid; begin
  a := registrar_venta(jsonb_build_object('clave_idempotencia',k,'canal','showroom','ubicacion_id',test.id('showroom'),
        'items', jsonb_build_array(jsonb_build_object('variante_id',test.id('v_ap'),'cantidad',1))));
  b := registrar_venta(jsonb_build_object('clave_idempotencia',k,'canal','showroom','ubicacion_id',test.id('showroom'),
        'items', jsonb_build_array(jsonb_build_object('variante_id',test.id('v_ap'),'cantidad',1))));
  if a <> b then raise exception 'FALLÓ: el reintento duplicó la venta'; end if;
  raise notice '  ok  doble toque no duplica la venta';
end $$;
do $$ begin
  perform registrar_venta(jsonb_build_object('canal','showroom','ubicacion_id',test.id('showroom'),
    'items', jsonb_build_array(jsonb_build_object('variante_id',test.id('v_ap'),'cantidad',99))));
  raise exception 'DEBIA_FALLAR';
exception when others then
  if sqlerrm = 'DEBIA_FALLAR' then raise exception 'FALLÓ: vendió más de lo que hay'; end if;
  raise notice '  ok  no deja vender sin stock (%)', sqlerrm;
end $$;
select test.eq('historial registra cambios', (select count(*) from auditoria where tabla = 'productos')::numeric, 2);

-- ======================= CASO 8 · como Lucas (vendedor) =======================
reset role;
select test.como('lucas');
set role authenticated;
\echo ''
\echo 'CASO 8a · Vendedor sin acceso a información restringida'
select test.eq('ve productos', (select count(*) from productos)::numeric, 2);
select test.eq('no ve costos', (select count(*) from producto_costos)::numeric, 0);
select test.eq('no ve reparto', (select count(*) from v_lineas_venta)::numeric, 0);
select test.eq('no ve ventas ajenas', (select count(*) from v_ventas)::numeric, 0);
select test.eq('no ve cuentas de bandas', (select count(*) from v_cuenta_bandas)::numeric, 0);
select test.eq('no ve cajas ni resultados', (select count(*) from v_cajas)::numeric + (select count(*) from v_resultado_general), 0);
select test.put('v6', registrar_venta(jsonb_build_object('canal','showroom','ubicacion_id',test.id('showroom'),
  'items', jsonb_build_array(jsonb_build_object('variante_id',test.id('v_ap'),'cantidad',1,'precio_unit',1)),
  'pagos', jsonb_build_array(jsonb_build_object('medio','efectivo','monto',25000))))::text);
select test.eq('ve su venta', (select count(*) from v_ventas)::numeric, 1);
select test.eq('no puede cambiar el precio', total, 25000) from v_ventas where id = test.id('v6');
do $$ begin
  perform 1 from venta_items limit 1;
  raise exception 'DEBIA_FALLAR';
exception when others then
  if sqlerrm = 'DEBIA_FALLAR' then raise exception 'FALLÓ: el vendedor leyó venta_items con costos'; end if;
  raise notice '  ok  tabla con costos bloqueada (%)', sqlerrm;
end $$;
do $$ begin
  perform efectivo_inicial from cajas limit 1;
  raise exception 'DEBIA_FALLAR';
exception when others then
  if sqlerrm = 'DEBIA_FALLAR' then raise exception 'FALLÓ: el vendedor vio el efectivo de la caja'; end if;
  raise notice '  ok  cierre ciego: no ve montos de caja (%)', sqlerrm;
end $$;
do $$ begin
  perform registrar_venta(jsonb_build_object('canal','tiendanube','ubicacion_id',test.id('showroom'),'tiendanube_pedido','2000',
    'items', jsonb_build_array(jsonb_build_object('variante_id',test.id('v_ap'),'cantidad',1))));
  raise exception 'DEBIA_FALLAR';
exception when others then
  if sqlerrm = 'DEBIA_FALLAR' then raise exception 'FALLÓ: vendedor cargó Tiendanube'; end if;
  raise notice '  ok  no gestiona Tiendanube (%)', sqlerrm;
end $$;
do $$ begin
  perform trasladar(test.id('v_ap'), test.id('showroom'), test.id('deposito'), 1);
  raise exception 'DEBIA_FALLAR';
exception when others then
  if sqlerrm = 'DEBIA_FALLAR' then raise exception 'FALLÓ: vendedor modificó stock'; end if;
  raise notice '  ok  no modifica stock (%)', sqlerrm;
end $$;

-- ======================= CASO 8 · como Facu (Nihilismo) =======================
reset role;
select test.como('facu');
set role authenticated;
\echo ''
\echo 'CASO 8b · Banda ve solo lo suyo'
select test.eq('solo sus productos', (select count(*) from productos where banda_id is distinct from test.id('nih'))::numeric, 0);
select test.eq('ve sus costos', (select count(*) from producto_costos)::numeric, 1);
select test.eq('solo su reparto', (select count(*) from v_lineas_venta where banda_id is distinct from test.id('nih'))::numeric, 0);
select test.eq('ve sus ventas', (select count(*) from v_lineas_venta)::numeric, 4);
select test.eq('solo su cuenta', (select count(*) from v_cuenta_bandas)::numeric, 1);
select test.eq('su saldo', saldo, 112000) from v_cuenta_bandas;
select test.eq('ve sus entregas', (select count(*) from entregas_bandas)::numeric, 1);
select test.eq('no ve cajas', (select count(*) from v_cajas)::numeric, 0);
do $$ begin
  perform registrar_venta(jsonb_build_object('canal','showroom','ubicacion_id',test.id('showroom'),
    'items', jsonb_build_array(jsonb_build_object('variante_id',test.id('v_nih_m'),'cantidad',1))));
  raise exception 'DEBIA_FALLAR';
exception when others then
  if sqlerrm = 'DEBIA_FALLAR' then raise exception 'FALLÓ: la banda pudo vender'; end if;
  raise notice '  ok  la banda solo consulta (%)', sqlerrm;
end $$;

reset role;
\echo ''
\echo 'TODOS LOS CASOS PASARON'
