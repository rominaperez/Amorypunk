-- =====================================================================
-- AMOR & PUNK · 06 · Fotos de productos (Supabase Storage)
-- Bucket privado "fotos": todos los usuarios activos ven, solo admins suben o borran.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy fotos_ver on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.mi_rol() is not null);

create policy fotos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.es_admin());

create policy fotos_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and public.es_admin());

create policy fotos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.es_admin());

-- Bucket privado "archivos": archivos aprobados de personalizados, solo admins.
insert into storage.buckets (id, name, public, file_size_limit)
values ('archivos', 'archivos', false, 26214400)
on conflict (id) do nothing;

create policy archivos_admin on storage.objects for all to authenticated
  using (bucket_id = 'archivos' and public.es_admin())
  with check (bucket_id = 'archivos' and public.es_admin());
