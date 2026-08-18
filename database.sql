-- Ejecuta este archivo en Supabase: SQL Editor > New query > Run.
-- No se usa ni se debe publicar una service_role key.

create table if not exists public.clients (
  id text primary key check (id ~ '^CL-[A-Z0-9]{10}$'),
  name text not null check (char_length(name) between 1 and 90),
  registered_at timestamptz not null default now(),
  checkin_key uuid not null unique default gen_random_uuid(),
  promotions_redeemed integer not null default 0 check (promotions_redeemed >= 0)
);

create table if not exists public.visits (
  id bigint generated always as identity primary key,
  client_id text not null references public.clients(id) on delete cascade,
  registered_at timestamptz not null default now()
);
create index if not exists visits_client_id_idx on public.visits(client_id);

alter table public.clients enable row level security;
alter table public.visits enable row level security;
revoke all on public.clients, public.visits from anon, authenticated;

create or replace function public.create_client(p_name text, p_client_id text)
returns table (id text, name text, registered_at timestamptz, checkin_key uuid)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  insert into clients (id, name) values (p_client_id, trim(p_name))
  returning clients.id, clients.name, clients.registered_at, clients.checkin_key into id, name, registered_at, checkin_key;
  return next;
end; $$;

create or replace function public.get_public_card(p_client_id text)
returns table (client_id text, name text, visits bigint, checkin_key uuid)
language sql security definer set search_path = public as $$
  select c.id, c.name, count(v.id), c.checkin_key
  from clients c left join visits v on v.client_id = c.id
  where c.id = p_client_id group by c.id;
$$;

create or replace function public.validate_checkin(p_client_id text, p_checkin_key uuid)
returns table (client_id text, name text, visits bigint)
language sql security definer set search_path = public as $$
  select c.id, c.name, count(v.id)
  from clients c left join visits v on v.client_id = c.id
  where auth.uid() is not null and c.id = p_client_id and c.checkin_key = p_checkin_key
  group by c.id;
$$;

create or replace function public.register_visit(p_client_id text, p_checkin_key uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  if not exists (select 1 from clients where id = p_client_id and checkin_key = p_checkin_key) then raise exception 'Código inválido'; end if;
  insert into visits (client_id) values (p_client_id);
end; $$;

create or replace function public.list_client_records()
returns table (client_id text, name text, visits_registered bigint, promotions_redeemed integer)
language sql security definer set search_path = public as $$
  select c.id, c.name, count(v.id), c.promotions_redeemed
  from clients c left join visits v on v.client_id = c.id
  where auth.uid() is not null group by c.id order by c.registered_at desc;
$$;

revoke all on function public.create_client(text, text), public.validate_checkin(text, uuid), public.register_visit(text, uuid), public.list_client_records() from public;
revoke all on function public.get_public_card(text) from public;
grant execute on function public.get_public_card(text) to anon, authenticated;
grant execute on function public.create_client(text, text), public.validate_checkin(text, uuid), public.register_visit(text, uuid), public.list_client_records() to authenticated;
