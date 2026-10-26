-- =====================================================================
-- AMOR & PUNK · Datos iniciales
-- =====================================================================

insert into ubicaciones (tipo, nombre, direccion) values
  ('showroom', 'Showroom', 'Venezuela 458, San Telmo'),
  ('deposito', 'Depósito', null);

insert into configuracion (clave, valor) values
  ('stock_minimo', '2'),
  ('cuentas_destino', '["MP A&P", "Banco Galicia", "Cuenta de la banda"]');

-- Bandas con acuerdo especial en ferias (todo lo vendido es de la banda)
with b as (
  insert into bandas (nombre) values ('Nihilismo'), ('Las Vin Up') returning id
)
insert into acuerdos (banda_id, canal, pct_ganancia_banda)
select b.id, c.canal, c.pct from b
cross join (values ('showroom'::canal_venta, 50), ('feria', 100), ('tiendanube', 100)) as c(canal, pct);

-- Primer admin: crear el usuario en Supabase > Authentication y después correr
-- (reemplazando el mail):
--
-- insert into perfiles (id, nombre, rol)
-- select id, 'Gero', 'admin' from auth.users where email = 'gero@...';
--
-- A partir de ahí, los admins crean el resto de los usuarios desde la app.
