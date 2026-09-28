-- Saber Espiritual — estrutura inicial do Supabase
-- Execute todo este arquivo no SQL Editor de um projeto novo.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Cliente',
  role text not null default 'client' check (role in ('client','reader','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  credits integer not null default 0 check (credits >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.consultants (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  public_name text not null,
  slug text not null unique,
  specialty text not null,
  bio text not null,
  status text not null default 'offline' check (status in ('online','offline','busy')),
  minute_rate_credits integer not null default 1 check (minute_rate_credits > 0),
  commission_percent numeric(5,2) not null default 60 check (commission_percent between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_packages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  credits integer not null check (credits > 0),
  price_cents integer not null check (price_cents > 0),
  first_purchase_only boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key,
  user_id uuid not null references public.profiles(id),
  package_id uuid not null references public.credit_packages(id),
  provider_preference_id text,
  provider_payment_id text unique,
  amount_cents integer not null check (amount_cents > 0),
  credits integer not null check (credits > 0),
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('purchase','usage','refund','bonus','adjustment')),
  credits integer not null,
  amount_cents integer,
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id),
  consultant_id uuid not null references public.consultants(id),
  status text not null default 'waiting' check (status in ('waiting','active','paused','ended','cancelled')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  last_billed_at timestamptz,
  client_last_seen timestamptz,
  consultant_last_seen timestamptz,
  total_minutes integer not null default 0
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists idx_sessions_client on public.chat_sessions(client_id, status);
create index if not exists idx_sessions_consultant on public.chat_sessions(consultant_id, status);
create index if not exists idx_messages_session on public.messages(session_id, created_at);
create index if not exists idx_transactions_user on public.wallet_transactions(user_id, created_at desc);
create index if not exists idx_payments_user on public.payments(user_id, created_at desc);

insert into public.credit_packages (slug,name,credits,price_cents,first_purchase_only,sort_order) values
  ('first','Primeira consulta',7,1990,true,1),
  ('guidance','Orientação',15,4990,false,2),
  ('complete','Leitura completa',30,8990,false,3),
  ('deep','Consulta profunda',60,15990,false,4)
on conflict (slug) do update set name=excluded.name, credits=excluded.credits, price_cents=excluded.price_cents, first_purchase_only=excluded.first_purchase_only, sort_order=excluded.sort_order, active=true;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id,display_name) values (new.id,coalesce(nullif(new.raw_user_meta_data->>'name',''),'Cliente')) on conflict do nothing;
  insert into public.wallets (user_id) values (new.id) on conflict do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.consultants enable row level security;
alter table public.credit_packages enable row level security;
alter table public.payments enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.messages enable row level security;

drop policy if exists profiles_own_select on public.profiles;
create policy profiles_own_select on public.profiles for select using (id = auth.uid());
drop policy if exists profiles_own_update on public.profiles;
drop policy if exists wallets_own_select on public.wallets;
create policy wallets_own_select on public.wallets for select using (user_id = auth.uid());
drop policy if exists consultants_public_select on public.consultants;
create policy consultants_public_select on public.consultants for select using (active = true or profile_id = auth.uid());
drop policy if exists packages_public_select on public.credit_packages;
create policy packages_public_select on public.credit_packages for select using (active = true);
drop policy if exists payments_own_select on public.payments;
create policy payments_own_select on public.payments for select using (user_id = auth.uid());
drop policy if exists transactions_own_select on public.wallet_transactions;
create policy transactions_own_select on public.wallet_transactions for select using (user_id = auth.uid());

drop policy if exists sessions_participants_select on public.chat_sessions;
create policy sessions_participants_select on public.chat_sessions for select using (
  client_id = auth.uid() or exists (select 1 from public.consultants c where c.id=consultant_id and c.profile_id=auth.uid())
);

drop policy if exists messages_participants_select on public.messages;
create policy messages_participants_select on public.messages for select using (
  exists (select 1 from public.chat_sessions s join public.consultants c on c.id=s.consultant_id where s.id=session_id and (s.client_id=auth.uid() or c.profile_id=auth.uid()))
);
drop policy if exists messages_participants_insert on public.messages;
create policy messages_participants_insert on public.messages for insert with check (
  sender_id=auth.uid() and exists (select 1 from public.chat_sessions s join public.consultants c on c.id=s.consultant_id where s.id=session_id and s.status in ('waiting','active','paused') and (s.client_id=auth.uid() or c.profile_id=auth.uid()))
);

create or replace function public.create_chat_session(p_consultant_id uuid, p_client_id uuid)
returns public.chat_sessions language plpgsql security definer set search_path=public as $$
declare v_row public.chat_sessions; v_status text; v_credits integer;
begin
  select status into v_status from public.consultants where id=p_consultant_id and active=true for update;
  if v_status is null then raise exception 'Especialista não encontrado.'; end if;
  if v_status <> 'online' then raise exception 'Especialista indisponível neste momento.'; end if;
  select credits into v_credits from public.wallets where user_id=p_client_id for update;
  if coalesce(v_credits,0) < 1 then raise exception 'Saldo insuficiente.'; end if;
  if exists (select 1 from public.chat_sessions where client_id=p_client_id and status in ('waiting','active','paused')) then raise exception 'Você já possui uma consulta aberta.'; end if;
  insert into public.chat_sessions(client_id,consultant_id,client_last_seen) values(p_client_id,p_consultant_id,now()) returning * into v_row;
  return v_row;
end; $$;

create or replace function public.accept_chat_session(p_session_id uuid, p_reader_id uuid)
returns public.chat_sessions language plpgsql security definer set search_path=public as $$
declare v_row public.chat_sessions; v_consultant uuid; changed integer;
begin
  select s.consultant_id into v_consultant from public.chat_sessions s join public.consultants c on c.id=s.consultant_id
    where s.id=p_session_id and c.profile_id=p_reader_id and s.status='waiting' for update of s;
  if v_consultant is null then raise exception 'Consulta não encontrada ou já iniciada.'; end if;
  update public.consultants set status='busy',updated_at=now() where id=v_consultant and status='online';
  get diagnostics changed = row_count;
  if changed=0 then raise exception 'Você já está em outra consulta ou está offline.'; end if;
  update public.chat_sessions set status='active',accepted_at=now(),started_at=now(),last_billed_at=now(),client_last_seen=now(),consultant_last_seen=now()
    where id=p_session_id returning * into v_row;
  return v_row;
end; $$;

create or replace function public.heartbeat_session(p_session_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_session public.chat_sessions; v_reader uuid; v_wallet public.wallets;
begin
  select * into v_session from public.chat_sessions where id=p_session_id;
  if v_session.id is null then raise exception 'Consulta não encontrada.'; end if;
  select profile_id into v_reader from public.consultants where id=v_session.consultant_id;
  if p_user_id=v_session.client_id then update public.chat_sessions set client_last_seen=now() where id=p_session_id;
  elsif p_user_id=v_reader then update public.chat_sessions set consultant_last_seen=now() where id=p_session_id;
  else raise exception 'Acesso negado.'; end if;
  update public.chat_sessions s set status='active'
    where s.id=p_session_id and s.status='paused'
      and exists (select 1 from public.wallets w where w.user_id=s.client_id and w.credits > 0)
      and s.client_last_seen >= now()-interval '90 seconds'
      and s.consultant_last_seen >= now()-interval '90 seconds';
  select * into v_session from public.chat_sessions where id=p_session_id;
  if v_session.status='active' then update public.consultants set status='busy',updated_at=now() where id=v_session.consultant_id; end if;
  select * into v_wallet from public.wallets where user_id=v_session.client_id;
  return jsonb_build_object('session',to_jsonb(v_session),'wallet',to_jsonb(v_wallet));
end; $$;

create or replace function public.end_chat_session(p_session_id uuid, p_user_id uuid)
returns public.chat_sessions language plpgsql security definer set search_path=public as $$
declare v_row public.chat_sessions; v_reader uuid;
begin
  select c.profile_id into v_reader from public.chat_sessions s join public.consultants c on c.id=s.consultant_id where s.id=p_session_id;
  update public.chat_sessions set status='ended',ended_at=now() where id=p_session_id and status in ('waiting','active','paused') and (client_id=p_user_id or v_reader=p_user_id) returning * into v_row;
  if v_row.id is null then raise exception 'Não foi possível encerrar a consulta.'; end if;
  update public.consultants set status='online',updated_at=now() where id=v_row.consultant_id;
  return v_row;
end; $$;

create or replace function public.bill_active_sessions()
returns integer language plpgsql security definer set search_path=public as $$
declare rec record; elapsed_minutes integer; charge integer; billed integer := 0; remaining integer;
begin
  for rec in
    select s.*,w.credits,c.minute_rate_credits from public.chat_sessions s join public.wallets w on w.user_id=s.client_id join public.consultants c on c.id=s.consultant_id
    where s.status='active' for update of s,w skip locked
  loop
    if rec.client_last_seen is null or rec.consultant_last_seen is null or rec.client_last_seen < now()-interval '90 seconds' or rec.consultant_last_seen < now()-interval '90 seconds' then
      update public.chat_sessions set status='paused' where id=rec.id;
      continue;
    end if;
    elapsed_minutes := floor(extract(epoch from (now()-coalesce(rec.last_billed_at,rec.started_at)))/60);
    if elapsed_minutes < 1 then continue; end if;
    charge := least(rec.credits,elapsed_minutes*rec.minute_rate_credits);
    if charge > 0 then
      update public.wallets set credits=credits-charge,updated_at=now() where user_id=rec.client_id returning credits into remaining;
      insert into public.wallet_transactions(user_id,type,credits,reference_type,reference_id) values(rec.client_id,'usage',-charge,'chat_session',rec.id);
      update public.chat_sessions set total_minutes=total_minutes+greatest(1,charge/rec.minute_rate_credits),last_billed_at=coalesce(last_billed_at,started_at)+make_interval(mins=>greatest(1,charge/rec.minute_rate_credits)),status=case when remaining=0 then 'paused' else 'active' end where id=rec.id;
      billed := billed+1;
    else
      update public.chat_sessions set status='paused' where id=rec.id;
    end if;
  end loop;
  return billed;
end; $$;

create or replace function public.confirm_payment(p_internal_payment_id uuid,p_provider_payment_id text,p_user_id uuid,p_amount_cents integer,p_credits integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare changed integer; new_balance integer;
begin
  update public.payments set provider_payment_id=p_provider_payment_id,status='approved',updated_at=now()
    where id=p_internal_payment_id and user_id=p_user_id and amount_cents=p_amount_cents and credits=p_credits and status<>'approved';
  get diagnostics changed = row_count;
  if changed=0 then return jsonb_build_object('processed',false); end if;
  update public.wallets set credits=credits+p_credits,updated_at=now() where user_id=p_user_id returning credits into new_balance;
  insert into public.wallet_transactions(user_id,type,credits,amount_cents,reference_type,reference_id) values(p_user_id,'purchase',p_credits,p_amount_cents,'payment',p_internal_payment_id);
  return jsonb_build_object('processed',true,'balance',new_balance);
end; $$;

create or replace function public.bootstrap_consultant(p_email text,p_public_name text,p_specialty text,p_bio text,p_make_admin boolean default false)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid; v_slug text;
begin
  select id into v_user from auth.users where lower(email)=lower(p_email);
  if v_user is null then raise exception 'Crie primeiro a conta com este e-mail.'; end if;
  update public.profiles set display_name=p_public_name,role=case when p_make_admin then 'admin' else 'reader' end,updated_at=now() where id=v_user;
  v_slug := trim(both '-' from lower(regexp_replace(translate(p_public_name,'ÁÀÃÂÉÊÍÓÔÕÚÇáàãâéêíóôõúç','AAAAEEIOOOUCaaaaeeiooouc'),'[^a-zA-Z0-9]+','-','g')));
  insert into public.consultants(profile_id,public_name,slug,specialty,bio,status) values(v_user,p_public_name,v_slug,p_specialty,p_bio,'offline')
  on conflict(profile_id) do update set public_name=excluded.public_name,specialty=excluded.specialty,bio=excluded.bio,active=true;
  return v_user;
end; $$;

revoke all on function public.create_chat_session(uuid,uuid) from public,anon,authenticated;
revoke all on function public.accept_chat_session(uuid,uuid) from public,anon,authenticated;
revoke all on function public.heartbeat_session(uuid,uuid) from public,anon,authenticated;
revoke all on function public.end_chat_session(uuid,uuid) from public,anon,authenticated;
revoke all on function public.bill_active_sessions() from public,anon,authenticated;
revoke all on function public.confirm_payment(uuid,text,uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.bootstrap_consultant(text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.create_chat_session(uuid,uuid) to service_role;
grant execute on function public.accept_chat_session(uuid,uuid) to service_role;
grant execute on function public.heartbeat_session(uuid,uuid) to service_role;
grant execute on function public.end_chat_session(uuid,uuid) to service_role;
grant execute on function public.bill_active_sessions() to service_role;
grant execute on function public.confirm_payment(uuid,text,uuid,integer,integer) to service_role;
grant execute on function public.bootstrap_consultant(text,text,text,text,boolean) to service_role;

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.chat_sessions;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.wallets;
exception when duplicate_object then null; end $$;
