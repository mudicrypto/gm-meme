-- The Sift wallet: one per account, with its key held only by the signing provider (this
-- table stores the provider's wallet id and the public address, never a key), plus the
-- user's limits, withdrawal protection and automatic orders. Service role only, as before.

create table public.sift_wallets (
  owner text primary key,
  provider_id text not null unique,
  address text not null unique,
  frozen boolean not null default false,
  per_order_lamports bigint not null check (per_order_lamports > 0),
  daily_lamports bigint not null check (daily_lamports > 0),
  withdraw_address text,
  withdraw_ready_at timestamptz,
  -- A 2FA code seed (TOTP), not a wallet key.
  totp_secret text,
  totp_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.sift_spend (
  owner text not null references public.sift_wallets (owner) on delete cascade,
  lamports bigint not null check (lamports > 0),
  spent_at timestamptz not null
);

create index sift_spend_owner_time_idx on public.sift_spend (owner, spent_at);

create table public.sift_orders (
  id uuid primary key,
  owner text not null references public.sift_wallets (owner) on delete cascade,
  mint text not null,
  kind text not null check (kind in ('limit_buy', 'stop_loss', 'take_profit')),
  trigger_price_sol double precision not null check (trigger_price_sol > 0),
  buy_lamports bigint check (buy_lamports > 0),
  sell_percent integer check (sell_percent between 1 and 100),
  trailing_pct double precision check (trailing_pct > 0 and trailing_pct < 100),
  peak_price_sol double precision,
  slippage_bps integer not null check (slippage_bps between 1 and 10000),
  status text not null
    check (status in ('open', 'executing', 'filled', 'failed', 'cancelled', 'expired')),
  order_group text,
  attempts integer not null default 0,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  filled_at timestamptz,
  signature text,
  message text
);

create index sift_orders_owner_idx on public.sift_orders (owner, created_at desc);
create index sift_orders_open_idx on public.sift_orders (mint) where status = 'open';

alter table public.sift_wallets enable row level security;
alter table public.sift_spend enable row level security;
alter table public.sift_orders enable row level security;

-- Wallets -------------------------------------------------------------------------

create function public.sift_wallet_of(wallet_owner text)
returns setof public.sift_wallets
language sql
stable
set search_path = ''
as $$
  select * from public.sift_wallets w where w.owner = wallet_owner;
$$;

create function public.insert_sift_wallet(
  wallet_owner text, wallet_provider_id text, wallet_address text,
  wallet_per_order_lamports bigint, wallet_daily_lamports bigint, wallet_created_at timestamptz
)
returns setof public.sift_wallets
language sql
set search_path = ''
as $$
  insert into public.sift_wallets
    (owner, provider_id, address, per_order_lamports, daily_lamports, created_at)
  values (wallet_owner, wallet_provider_id, wallet_address,
    wallet_per_order_lamports, wallet_daily_lamports, wallet_created_at)
  on conflict (owner) do nothing;
  select * from public.sift_wallets w where w.owner = wallet_owner;
$$;

create function public.update_sift_wallet(
  wallet_owner text, new_frozen boolean, new_per_order_lamports bigint,
  new_daily_lamports bigint, new_withdraw_address text, new_withdraw_ready_at timestamptz,
  new_totp_secret text, new_totp_enabled boolean
)
returns void
language sql
set search_path = ''
as $$
  update public.sift_wallets w set
    frozen = new_frozen, per_order_lamports = new_per_order_lamports,
    daily_lamports = new_daily_lamports, withdraw_address = new_withdraw_address,
    withdraw_ready_at = new_withdraw_ready_at, totp_secret = new_totp_secret,
    totp_enabled = new_totp_enabled
  where w.owner = wallet_owner;
$$;

create function public.record_sift_spend(spend_owner text, spend_lamports bigint, spend_at timestamptz)
returns void
language sql
set search_path = ''
as $$
  insert into public.sift_spend (owner, lamports, spent_at)
  values (spend_owner, spend_lamports, spend_at);
$$;

create function public.sift_spent_since(spend_owner text, since timestamptz)
returns table (lamports bigint)
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(s.lamports), 0)::bigint from public.sift_spend s
  where s.owner = spend_owner and s.spent_at >= since;
$$;

-- Orders --------------------------------------------------------------------------

create function public.insert_sift_order(
  order_id uuid, order_owner text, order_mint text, order_kind text,
  order_trigger_price_sol double precision, order_buy_lamports bigint,
  order_sell_percent integer, order_trailing_pct double precision,
  order_peak_price_sol double precision, order_slippage_bps integer, order_group text,
  order_created_at timestamptz, order_expires_at timestamptz
)
returns void
language sql
set search_path = ''
as $$
  insert into public.sift_orders (id, owner, mint, kind, trigger_price_sol, buy_lamports,
    sell_percent, trailing_pct, peak_price_sol, slippage_bps, status, order_group,
    created_at, expires_at)
  values (order_id, order_owner, order_mint, order_kind, order_trigger_price_sol,
    order_buy_lamports, order_sell_percent, order_trailing_pct, order_peak_price_sol,
    order_slippage_bps, 'open', order_group, order_created_at, order_expires_at);
$$;

create function public.sift_orders_of(order_owner text, max_rows integer)
returns setof public.sift_orders
language sql
stable
set search_path = ''
as $$
  select * from public.sift_orders o where o.owner = order_owner
  order by o.created_at desc limit max_rows;
$$;

create function public.open_sift_orders()
returns setof public.sift_orders
language sql
stable
set search_path = ''
as $$
  select * from public.sift_orders o where o.status = 'open';
$$;

create function public.count_open_sift_orders(order_owner text)
returns table (open_count bigint)
language sql
stable
set search_path = ''
as $$
  select count(*) from public.sift_orders o where o.owner = order_owner and o.status = 'open';
$$;

create function public.cancel_sift_order(order_owner text, order_id uuid)
returns table (cancelled boolean)
language sql
set search_path = ''
as $$
  with done as (
    update public.sift_orders o set status = 'cancelled'
    where o.id = order_id and o.owner = order_owner and o.status = 'open'
    returning 1
  )
  select exists (select 1 from done);
$$;

-- Only one caller can move an order from open to executing.
create function public.claim_sift_order(order_id uuid)
returns table (claimed boolean)
language sql
set search_path = ''
as $$
  with done as (
    update public.sift_orders o set status = 'executing', attempts = o.attempts + 1
    where o.id = order_id and o.status = 'open'
    returning 1
  )
  select exists (select 1 from done);
$$;

create function public.settle_sift_order(
  order_id uuid, new_status text, new_signature text, new_message text, new_filled_at timestamptz
)
returns void
language sql
set search_path = ''
as $$
  update public.sift_orders o set
    status = new_status,
    signature = coalesce(new_signature, o.signature),
    message = coalesce(new_message, o.message),
    filled_at = coalesce(new_filled_at, o.filled_at)
  where o.id = order_id and o.status = 'executing'
    and new_status in ('open', 'filled', 'failed');
$$;

create function public.touch_sift_order(
  order_id uuid, new_peak_price_sol double precision, new_message text, clear_message boolean
)
returns void
language sql
set search_path = ''
as $$
  update public.sift_orders o set
    peak_price_sol = coalesce(new_peak_price_sol, o.peak_price_sol),
    message = case when clear_message then null else coalesce(new_message, o.message) end
  where o.id = order_id and o.status = 'open';
$$;

create function public.expire_sift_orders(at_time timestamptz)
returns setof public.sift_orders
language sql
set search_path = ''
as $$
  update public.sift_orders o set status = 'expired'
  where o.status = 'open' and o.expires_at <= at_time
  returning o.*;
$$;

do $$
declare fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'sift_wallet_of', 'insert_sift_wallet', 'update_sift_wallet', 'record_sift_spend',
      'sift_spent_since', 'insert_sift_order', 'sift_orders_of', 'open_sift_orders',
      'count_open_sift_orders', 'cancel_sift_order', 'claim_sift_order', 'settle_sift_order',
      'touch_sift_order', 'expire_sift_orders'
    )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
