-- Private cloud backups for completed FramePuzzle photo rolls.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photo-rolls',
  'photo-rolls',
  false,
  10485760,
  array['image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.photo_rolls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null unique check (storage_path like user_id::text || '/%'),
  file_name text not null,
  photo_count smallint not null check (photo_count between 1 and 3),
  size_bytes integer not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);

alter table public.photo_rolls enable row level security;

create index if not exists photo_rolls_user_created_at_idx
  on public.photo_rolls (user_id, created_at desc);

drop policy if exists "Users can view their photo-roll records" on public.photo_rolls;
create policy "Users can view their photo-roll records"
  on public.photo_rolls
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their photo-roll records" on public.photo_rolls;
create policy "Users can create their photo-roll records"
  on public.photo_rolls
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their photo-roll records" on public.photo_rolls;
create policy "Users can delete their photo-roll records"
  on public.photo_rolls
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can upload their photo-roll images" on storage.objects;
create policy "Users can upload their photo-roll images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'photo-rolls'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users can view their photo-roll images" on storage.objects;
create policy "Users can view their photo-roll images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'photo-rolls'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users can delete their photo-roll images" on storage.objects;
create policy "Users can delete their photo-roll images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'photo-rolls'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
