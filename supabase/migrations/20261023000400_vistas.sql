-- =====================================================================
-- AMOR & PUNK · 04 · Vistas para pantallas y reportes
-- Las vistas con plata filtran adentro según quién pregunta:
--   admin ve todo · banda ve solo lo suyo · vendedor no ve costos ni ganancias.
-- Las vistas de stock usan security_invoker, así respetan los permisos de las tablas.
-- =====================================================================

-- Stock disponible por variante y lugar
create view v_stock with (security_invoker = on) as
select s.variante_id, va.codigo as variante_codigo, va.talle, va.color,
       p.id as producto_id, p.codigo as producto_codigo, p.nombre as producto, p.categoria, p.banda_id, p.precio, p.precio_online, p.foto_path,
       s.ubicacion_id, u.nombre as ubicacion, u.tipo as tipo_ubicacion,
       s.cantidad, s.reservada, s.cantidad - s.reservada as disponible
from stock s
join variantes va on va.id = s.variante_id
join productos p on p.id = va.producto_id
join ubicaciones u on u.id = s.ubicacion_id;

-- Variantes con poco stock (umbral en configuracion.stock_minimo)
create view v_para_reponer with (security_invoker = on) as
select va.id as variante_id, p.nombre as producto, va.talle, va.color, p.banda_id,
       coalesce(sum(s.cantidad - s.reservada), 0) as disponible,
       (select coalesce(sum(i.cantidad - i.cantidad_devuelta), 0) from venta_items i where i.variante_id = va.id) as vendidas
from variantes va
join productos p on p.id = va.producto_id and p.activo
left join stock s on s.variante_id = va.id
where va.activa
group by va.id, p.nombre, va.talle, va.color, p.banda_id
having coalesce(sum(s.cantidad - s.reservada), 0) <= coalesce((select (valor)::int from configuracion where clave = 'stock_minimo'), 2);

-- Una fila por producto vendido, con todo el reparto. Base de reportes y liquidaciones.
create view v_lineas_venta as
select v.id as venta_id, v.numero, v.created_at as fecha, v.canal, v.ubicacion_id, u.nombre as ubicacion,
       v.vendedor_id, pf.nombre as vendedor, v.anulada,
       p.id as producto_id, p.nombre as producto, va.talle, va.color, l.*
from ventas v
join ubicaciones u on u.id = v.ubicacion_id
join perfiles pf on pf.id = v.vendedor_id
cross join lateral lineas_de_venta(v.id) l
join variantes va on va.id = l.variante_id
join productos p on p.id = va.producto_id
where es_admin() or (mi_rol() = 'banda' and l.banda_id = mi_banda());

-- Ventas con su estado de cobro. Admin: todas · vendedor: las suyas · banda: las que tienen algo suyo.
create view v_ventas as
select v.id, v.numero, v.created_at as fecha, v.canal, v.ubicacion_id, u.nombre as ubicacion, v.tiendanube_pedido,
       v.vendedor_id, pf.nombre as vendedor, v.anulada, v.envio,
       r.total, r.esperado, r.cobrado, r.por_verificar, r.saldo
from ventas v
join ubicaciones u on u.id = v.ubicacion_id
join perfiles pf on pf.id = v.vendedor_id
cross join lateral resumen_de_venta(v.id) r
where es_admin()
   or (mi_rol() = 'vendedor' and v.vendedor_id = auth.uid())
   or (mi_rol() = 'banda' and exists (select 1 from venta_items i where i.venta_id = v.id and i.banda_id = mi_banda()));

-- Ítems sin costos (lo que puede ver un vendedor de sus ventas)
create view v_items_venta as
select i.id, i.venta_id, i.variante_id, va.codigo, p.nombre as producto, va.talle, va.color,
       i.cantidad, i.cantidad_devuelta, i.precio_unit
from venta_items i
join ventas v on v.id = i.venta_id
join variantes va on va.id = i.variante_id
join productos p on p.id = va.producto_id
where es_admin()
   or (mi_rol() = 'vendedor' and v.vendedor_id = auth.uid())
   or (mi_rol() = 'banda' and i.banda_id = mi_banda());

-- Ajustes de la cuenta de una banda por fallas
--   absorbe A&P y el costo lo pagó la banda  -> A&P le reconoce el costo (+)
--   absorbe la banda y el costo lo pagó A&P  -> la banda le debe el costo a A&P (−)
create view v_ajustes_fallas as
select f.id, f.created_at as fecha, f.banda_id, f.variante_id, f.cantidad, f.motivo,
       case when f.absorbe = 'ap' and f.pagado_por = 'banda' then f.costo_unit * f.cantidad
            when f.absorbe = 'banda' and f.pagado_por = 'ap' then -f.costo_unit * f.cantidad
            else 0 end as monto
from fallas f
where f.banda_id is not null and f.costo_unit is not null
  and (es_admin() or f.banda_id = mi_banda());

-- Cuenta corriente de cada banda
create view v_cuenta_bandas as
select b.id as banda_id, b.nombre,
       coalesce(l.unidades, 0) as unidades_vendidas,
       coalesce(l.total, 0) as por_ventas,
       coalesce(a.total, 0) as por_ajustes,
       coalesce(l.total, 0) + coalesce(a.total, 0) as corresponde,
       coalesce(e.total, 0) as entregado,
       coalesce(l.total, 0) + coalesce(a.total, 0) - coalesce(e.total, 0) as saldo
from bandas b
left join (select banda_id, sum(unidades) as unidades, sum(total_banda) as total from v_lineas_venta group by banda_id) l on l.banda_id = b.id
left join (select banda_id, sum(monto) as total from v_ajustes_fallas group by banda_id) a on a.banda_id = b.id
left join (select banda_id, sum(monto) as total from entregas_bandas group by banda_id) e on e.banda_id = b.id
where es_admin() or b.id = mi_banda();

-- Caja: efectivo inicial + cobros − gastos − retiros y entregas = esperado (solo admins)
create view v_cajas as
select c.id, c.ubicacion_id, u.nombre as ubicacion, c.fecha, c.estado, c.efectivo_inicial,
       coalesce(p.cobros, 0) as cobros_efectivo,
       coalesce(m.gastos, 0) as gastos,
       coalesce(m.retiros, 0) + coalesce(e.entregas, 0) as retiros_y_entregas,
       c.efectivo_inicial + coalesce(p.cobros, 0) - coalesce(m.gastos, 0) - coalesce(m.retiros, 0) - coalesce(e.entregas, 0) as esperado,
       c.efectivo_contado,
       c.efectivo_contado - (c.efectivo_inicial + coalesce(p.cobros, 0) - coalesce(m.gastos, 0) - coalesce(m.retiros, 0) - coalesce(e.entregas, 0)) as diferencia
from cajas c
join ubicaciones u on u.id = c.ubicacion_id
left join (select caja_id, sum(monto) as cobros from pagos where medio = 'efectivo' group by caja_id) p on p.caja_id = c.id
left join (select caja_id, sum(monto) filter (where tipo = 'gasto') as gastos, sum(monto) filter (where tipo = 'retiro') as retiros
           from caja_movimientos group by caja_id) m on m.caja_id = c.id
left join (select caja_id, sum(monto) as entregas from entregas_bandas where medio = 'efectivo' group by caja_id) e on e.caja_id = c.id
where es_admin();

-- Resultado de cada feria, descontando puesto, traslado y otros gastos de su caja
create view v_resultado_ferias as
select u.id as feria_id, u.nombre, u.fecha,
       coalesce(l.neto, 0) as vendido_neto,
       coalesce(l.gan, 0) as ganancia_showroom,
       coalesce(g.gastos, 0) as gastos,
       coalesce(l.gan, 0) - coalesce(g.gastos, 0) as resultado
from ubicaciones u
left join (select ubicacion_id, sum(neto) as neto, sum(ganancia_showroom) as gan from v_lineas_venta where canal = 'feria' group by ubicacion_id) l on l.ubicacion_id = u.id
left join (select c.ubicacion_id, sum(m.monto) as gastos from caja_movimientos m join cajas c on c.id = m.caja_id where m.tipo = 'gasto' group by c.ubicacion_id) g on g.ubicacion_id = u.id
where u.tipo = 'feria' and es_admin();

-- Personalizados: presupuesto, cobrado, saldo y ganancia (marcada como parcial si faltan costos)
create view v_pedidos as
select pe.id, pe.numero, pe.cliente, pe.contacto, pe.detalle, pe.cantidad, pe.estado, pe.fecha_prometida, pe.presupuesto,
       coalesce(pg.cobrado, 0) as cobrado,
       pe.presupuesto - coalesce(pg.cobrado, 0) as saldo,
       case when pe.presupuesto is null then 'sin_presupuesto'
            when pe.presupuesto - coalesce(pg.cobrado, 0) <= 0 then 'pagado'
            when coalesce(pg.cobrado, 0) > 0 then 'senado' else 'sin_pagos' end as estado_pago,
       coalesce(c.conocidos, 0) as costos_conocidos,
       coalesce(c.pendientes, 0) as costos_pendientes,
       pe.presupuesto - coalesce(c.conocidos, 0) as ganancia
from pedidos pe
left join (select pedido_id, sum(monto) filter (where estado = 'confirmado') as cobrado from pagos where pedido_id is not null group by pedido_id) pg on pg.pedido_id = pe.id
left join (select pedido_id, sum(monto) as conocidos, count(*) filter (where monto is null) as pendientes from pedido_costos group by pedido_id) c on c.pedido_id = pe.id
where es_admin();

-- Resultado general del showroom
create view v_resultado_general as
select
  (select coalesce(sum(ganancia_showroom), 0) from v_lineas_venta) as ganancia_ventas,
  (select coalesce(sum(ganancia), 0) from v_pedidos where estado = 'entregado') as ganancia_personalizados,
  (select coalesce(sum(monto), 0) from caja_movimientos where tipo = 'gasto') as gastos,
  (select coalesce(sum(costo_unit * cantidad), 0) from fallas where absorbe = 'ap' and costo_unit is not null) as perdidas_fallas,
  (select coalesce(sum(ganancia_showroom), 0) from v_lineas_venta)
  + (select coalesce(sum(ganancia), 0) from v_pedidos where estado = 'entregado')
  - (select coalesce(sum(monto), 0) from caja_movimientos where tipo = 'gasto')
  - (select coalesce(sum(costo_unit * cantidad), 0) from fallas where absorbe = 'ap' and costo_unit is not null) as resultado
where es_admin();

-- Historial de un registro (para "quién tocó esto")
create view v_historial as
select a.id, a.tabla, a.registro_id, a.accion, a.created_at, pf.nombre as usuario, a.antes, a.despues
from auditoria a left join perfiles pf on pf.id = a.usuario_id
where es_admin();
