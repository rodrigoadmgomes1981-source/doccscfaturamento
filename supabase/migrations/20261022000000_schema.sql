-- =====================================================================
-- Faturamento de Serviços Médicos — esquema do banco (Supabase/Postgres)
-- Rode uma vez no SQL Editor do Supabase (ou `supabase db push`).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Administradores gerais (acesso total, inclusive Administração)
--    Cadastre aqui os e-mails; veja supabase/seed.sql.
-- ---------------------------------------------------------------------
create table if not exists public.app_admins (
  email text primary key check (email = lower(email))
);
alter table public.app_admins enable row level security;
-- nenhuma política: só o SQL Editor / service role altera esta tabela.

-- ---------------------------------------------------------------------
-- 2. Perfis (nome e e-mail visíveis para quem está logado)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "perfis visiveis para usuarios logados" on public.profiles;
create policy "perfis visiveis para usuarios logados" on public.profiles
  for select to authenticated using (true);

drop policy if exists "usuario edita o proprio nome" on public.profiles;
create policy "usuario edita o proprio nome" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, lower(new.email),
          coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- perfis de usuários que já existiam antes deste script
insert into public.profiles (id, email, name)
select u.id, lower(u.email), coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3. Documentos do sistema
--    path = "colecao/id" (ex.: contratos/PAP_98687, fechamentos/PAP_98687_202607)
--    Coleções: config, contratos, fechamentos, congelados, folhas,
--              plantoes, medicos, usuarios
-- ---------------------------------------------------------------------
create table if not exists public.docs (
  path        text primary key,
  collection  text not null,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  constraint docs_path_ok check (path ~ '^[A-Za-z0-9_\-.~:@+]+(/[A-Za-z0-9_\-.~:@+]+)*$'),
  constraint docs_collection_ok check (collection = regexp_replace(path, '/[^/]+$', ''))
);
create index if not exists docs_collection_idx on public.docs (collection);

create or replace function public.docs_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs
  for each row execute function public.docs_touch();

-- ---------------------------------------------------------------------
-- 4. Funções de permissão
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_admins a
    join auth.users u on lower(u.email) = a.email
    where u.id = auth.uid()
  );
$$;

-- usuário ativo cadastrado em Administração › Usuários
create or replace function public.has_access()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.docs d
    where d.path = 'usuarios/' || auth.uid()::text
      and coalesce((d.data ->> 'ativo')::boolean, true)
  );
$$;

-- pode administrar usuários (admin geral ou permissão "admin" no perfil)
create or replace function public.can_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.docs d
    where d.path = 'usuarios/' || auth.uid()::text
      and coalesce((d.data ->> 'ativo')::boolean, true)
      and coalesce((d.data -> 'perms' ->> 'admin')::boolean, false)
  );
$$;

grant execute on function public.is_admin(), public.has_access(), public.can_admin() to authenticated;

-- ---------------------------------------------------------------------
-- 5. Regras de acesso (RLS)
--    • Só usuários liberados leem/gravam.
--    • Usuários e parâmetros (config) só por quem administra.
-- ---------------------------------------------------------------------
alter table public.docs enable row level security;

drop policy if exists "ler documentos" on public.docs;
create policy "ler documentos" on public.docs
  for select to authenticated
  using (public.has_access() or path = 'usuarios/' || auth.uid()::text);

drop policy if exists "criar documentos" on public.docs;
create policy "criar documentos" on public.docs
  for insert to authenticated
  with check (public.has_access() and (collection not in ('usuarios', 'config') or public.can_admin()));

drop policy if exists "alterar documentos" on public.docs;
create policy "alterar documentos" on public.docs
  for update to authenticated
  using (public.has_access() and (collection not in ('usuarios', 'config') or public.can_admin()))
  with check (public.has_access() and (collection not in ('usuarios', 'config') or public.can_admin()));

drop policy if exists "excluir documentos" on public.docs;
create policy "excluir documentos" on public.docs
  for delete to authenticated
  using (public.has_access() and (collection not in ('usuarios', 'config') or public.can_admin()));

grant select, insert, update, delete on public.docs to authenticated;
grant select, update on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- 6. Atualização parcial (merge profundo de JSON), como o app espera:
--    objetos se mesclam recursivamente; listas e valores são substituídos.
-- ---------------------------------------------------------------------
create or replace function public.jsonb_deep_merge(a jsonb, b jsonb)
returns jsonb language plpgsql immutable as $$
declare
  k text;
  r jsonb;
begin
  if a is null or jsonb_typeof(a) <> 'object' or b is null or jsonb_typeof(b) <> 'object' then
    return b;
  end if;
  r := a;
  for k in select jsonb_object_keys(b) loop
    if r ? k and jsonb_typeof(r -> k) = 'object' and jsonb_typeof(b -> k) = 'object' then
      r := jsonb_set(r, array[k], public.jsonb_deep_merge(r -> k, b -> k));
    else
      r := jsonb_set(r, array[k], b -> k, true);
    end if;
  end loop;
  return r;
end $$;

create or replace function public.doc_update(p_path text, p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v jsonb;
begin
  update public.docs
     set data = public.jsonb_deep_merge(data, p_patch)
   where path = p_path
  returning data into v;
  if not found then
    raise exception 'not_found: %', p_path using errcode = 'P0002';
  end if;
  return v;
end $$;
grant execute on function public.doc_update(text, jsonb), public.jsonb_deep_merge(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Tempo real (outros usuários veem as mudanças na hora)
-- ---------------------------------------------------------------------
alter table public.docs replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;
