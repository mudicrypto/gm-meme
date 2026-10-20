-- Step 7: profiles, follows, shared trades, watchlist, price alerts and push tokens.
-- Users are wallets: they sign in by signing a message (no passwords, no emails). As
-- before, only the API's service role touches any of this.

create table public.profiles (
  wallet text primary key,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  -- Opt-in: trades made in Sift show in followers' feeds only while this is on.
  share_trades boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.follows (
  follower text not null,
  followee text not null references public.profiles (wallet) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);

create index follows_followee_idx on public.follows (followee);

-- Sign-in sessions. Only a SHA-256 hash of the token is stored.
create table public.sessions (
  token_hash text primary key,
  wallet text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index sessions_wallet_idx on public.sessions (wallet);

-- Trades made in Sift by users who share them. Stored only while sharing is on.
create table public.shared_trades (
  signature text primary key,
  wallet text not null references public.profiles (wallet) on delete cascade,
  mint text not null,
  side text not null check (side in ('buy', 'sell')),
  sol_lamports bigint not null check (sol_lamports >= 0),
  token_amount numeric not null check (token_amount >= 0),
  token_decimals integer not null check (token_decimals between 0 and 18),
  traded_at timestamptz not null
);

create index shared_trades_wallet_time_idx on public.shared_trades (wallet, traded_at desc);

create table public.watchlist (
  wallet text not null,
  mint text not null,
  added_at timestamptz not null default now(),
  primary key (wallet, mint)
);

create table public.price_alerts (
  id uuid primary key,
  wallet text not null,
  mint text not null,
  direction text not null check (direction in ('above', 'below')),
  price_sol double precision not null check (price_sol > 0),
  created_at timestamptz not null default now(),
  triggered_at timestamptz,
  triggered_price_sol double precision
);

create index price_alerts_wallet_idx on public.price_alerts (wallet);
create index price_alerts_active_idx on public.price_alerts (mint) where triggered_at is null;

create table public.push_tokens (
  token text primary key,
  wallet text not null,
  updated_at timestamptz not null default now()
);

create index push_tokens_wallet_idx on public.push_tokens (wallet);

alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.sessions enable row level security;
alter table public.shared_trades enable row level security;
alter table public.watchlist enable row level security;
alter table public.price_alerts enable row level security;
alter table public.push_tokens enable row level security;

-- Sessions ------------------------------------------------------------------------

create function public.create_session(token_hash text, session_wallet text, expires_at timestamptz)
returns void
language sql
set search_path = ''
as $$
  delete from public.sessions s where s.wallet = session_wallet and s.expires_at <= now();
  insert into public.sessions (token_hash, wallet, expires_at)
  values (create_session.token_hash, session_wallet, create_session.expires_at);
$$;

create function public.session_wallet(token_hash text, at_time timestamptz)
returns table (wallet text)
language sql
stable
set search_path = ''
as $$
  select s.wallet from public.sessions s
  where s.token_hash = session_wallet.token_hash and s.expires_at > at_time;
$$;

create function public.delete_session(token_hash text)
returns void
language sql
set search_path = ''
as $$
  delete from public.sessions s where s.token_hash = delete_session.token_hash;
$$;

-- Profiles ------------------------------------------------------------------------

create function public.profile_rows(wallets text[], handles text[])
returns table (
  wallet text, handle text, display_name text, share_trades boolean,
  followers bigint, following bigint
)
language sql
stable
set search_path = ''
as $$
  select p.wallet, p.handle, p.display_name, p.share_trades,
    (select count(*) from public.follows f where f.followee = p.wallet),
    (select count(*) from public.follows f where f.follower = p.wallet)
  from public.profiles p
  where p.wallet = any(wallets) or p.handle = any(handles);
$$;

-- Create or update a profile. Returns 'handle_taken' if another wallet has the handle.
-- Turning sharing off deletes the trades shared so far.
create function public.save_profile(
  profile_wallet text, new_handle text, new_display_name text, new_share_trades boolean
)
returns text
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.profiles p where p.handle = new_handle and p.wallet <> profile_wallet
  ) then
    return 'handle_taken';
  end if;
  insert into public.profiles (wallet, handle, display_name, share_trades)
  values (profile_wallet, new_handle, new_display_name, new_share_trades)
  on conflict (wallet) do update
    set handle = excluded.handle, display_name = excluded.display_name,
        share_trades = excluded.share_trades, updated_at = now();
  if not new_share_trades then
    delete from public.shared_trades t where t.wallet = profile_wallet;
  end if;
  return 'ok';
exception when unique_violation then
  return 'handle_taken';
end;
$$;

create function public.search_profiles(prefix text, max_rows integer)
returns table (
  wallet text, handle text, display_name text, share_trades boolean,
  followers bigint, following bigint
)
language sql
stable
set search_path = ''
as $$
  select r.* from public.profile_rows(
    array[]::text[],
    array(
      select p.handle from public.profiles p
      where p.handle like replace(replace(replace(prefix, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      order by p.handle
      limit max_rows
    )
  ) r
  order by r.handle;
$$;

-- Follows -------------------------------------------------------------------------

create function public.follow(follower_wallet text, followee_wallet text)
returns void
language sql
set search_path = ''
as $$
  insert into public.follows (follower, followee) values (follower_wallet, followee_wallet)
  on conflict do nothing;
$$;

create function public.unfollow(follower_wallet text, followee_wallet text)
returns void
language sql
set search_path = ''
as $$
  delete from public.follows f where f.follower = follower_wallet and f.followee = followee_wallet;
$$;

create function public.is_following(follower_wallet text, followee_wallet text)
returns table (following boolean)
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.follows f where f.follower = follower_wallet and f.followee = followee_wallet
  );
$$;

-- Shared trades -------------------------------------------------------------------

-- Stores the trade only if its wallet has a profile with sharing on. True if stored.
create function public.record_shared_trade(
  trade_signature text, trade_wallet text, trade_mint text, trade_side text,
  trade_sol_lamports bigint, trade_token_amount numeric, trade_token_decimals integer,
  trade_at timestamptz
)
returns table (stored boolean)
language sql
set search_path = ''
as $$
  with inserted as (
    insert into public.shared_trades
      (signature, wallet, mint, side, sol_lamports, token_amount, token_decimals, traded_at)
    select trade_signature, trade_wallet, trade_mint, trade_side, trade_sol_lamports,
      trade_token_amount, trade_token_decimals, trade_at
    where exists (
      select 1 from public.profiles p where p.wallet = trade_wallet and p.share_trades
    )
    on conflict (signature) do nothing
    returning 1
  )
  select exists (select 1 from inserted);
$$;

create function public.friends_feed(viewer text, max_rows integer)
returns table (
  signature text, handle text, display_name text, mint text, side text,
  sol_lamports bigint, token_amount text, token_decimals integer, traded_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select t.signature, p.handle, p.display_name, t.mint, t.side, t.sol_lamports,
    t.token_amount::text, t.token_decimals, t.traded_at
  from public.follows f
  join public.profiles p on p.wallet = f.followee and p.share_trades
  join public.shared_trades t on t.wallet = f.followee
  where f.follower = viewer
  order by t.traded_at desc, t.signature
  limit max_rows;
$$;

create function public.trades_by(trader text, max_rows integer)
returns table (
  signature text, handle text, display_name text, mint text, side text,
  sol_lamports bigint, token_amount text, token_decimals integer, traded_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select t.signature, p.handle, p.display_name, t.mint, t.side, t.sol_lamports,
    t.token_amount::text, t.token_decimals, t.traded_at
  from public.profiles p
  join public.shared_trades t on t.wallet = p.wallet
  where p.wallet = trader and p.share_trades
  order by t.traded_at desc, t.signature
  limit max_rows;
$$;

-- Watchlist -----------------------------------------------------------------------

create function public.watch_token(watcher text, token_mint text, at_time timestamptz)
returns void
language sql
set search_path = ''
as $$
  insert into public.watchlist (wallet, mint, added_at) values (watcher, token_mint, at_time)
  on conflict do nothing;
$$;

create function public.unwatch_token(watcher text, token_mint text)
returns void
language sql
set search_path = ''
as $$
  delete from public.watchlist w where w.wallet = watcher and w.mint = token_mint;
$$;

create function public.watchlist_of(watcher text)
returns table (mint text, added_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select w.mint, w.added_at from public.watchlist w where w.wallet = watcher
  order by w.added_at desc, w.mint;
$$;

-- Price alerts --------------------------------------------------------------------

create function public.create_price_alert(
  alert_id uuid, alert_wallet text, alert_mint text, alert_direction text,
  alert_price_sol double precision, at_time timestamptz
)
returns void
language sql
set search_path = ''
as $$
  insert into public.price_alerts (id, wallet, mint, direction, price_sol, created_at)
  values (alert_id, alert_wallet, alert_mint, alert_direction, alert_price_sol, at_time);
$$;

create function public.price_alerts_of(alert_wallet text)
returns table (
  id uuid, wallet text, mint text, direction text, price_sol double precision,
  created_at timestamptz, triggered_at timestamptz, triggered_price_sol double precision
)
language sql
stable
set search_path = ''
as $$
  select a.id, a.wallet, a.mint, a.direction, a.price_sol, a.created_at, a.triggered_at,
    a.triggered_price_sol
  from public.price_alerts a where a.wallet = alert_wallet
  order by a.created_at desc, a.id;
$$;

create function public.delete_price_alert(alert_wallet text, alert_id uuid)
returns table (deleted boolean)
language sql
set search_path = ''
as $$
  with removed as (
    delete from public.price_alerts a where a.wallet = alert_wallet and a.id = alert_id
    returning 1
  )
  select exists (select 1 from removed);
$$;

create function public.active_price_alerts()
returns table (
  id uuid, wallet text, mint text, direction text, price_sol double precision,
  created_at timestamptz, triggered_at timestamptz, triggered_price_sol double precision
)
language sql
stable
set search_path = ''
as $$
  select a.id, a.wallet, a.mint, a.direction, a.price_sol, a.created_at, a.triggered_at,
    a.triggered_price_sol
  from public.price_alerts a where a.triggered_at is null
  order by a.created_at, a.id;
$$;

-- Marks an alert fired, once. True only for the call that fired it.
create function public.trigger_price_alert(alert_id uuid, at_time timestamptz, price double precision)
returns table (triggered boolean)
language sql
set search_path = ''
as $$
  with fired as (
    update public.price_alerts a set triggered_at = at_time, triggered_price_sol = price
    where a.id = alert_id and a.triggered_at is null
    returning 1
  )
  select exists (select 1 from fired);
$$;

-- Push tokens ---------------------------------------------------------------------

create function public.save_push_token(push_token text, owner text)
returns void
language sql
set search_path = ''
as $$
  insert into public.push_tokens (token, wallet) values (push_token, owner)
  on conflict (token) do update set wallet = excluded.wallet, updated_at = now();
$$;

create function public.delete_push_token(push_token text)
returns void
language sql
set search_path = ''
as $$
  delete from public.push_tokens t where t.token = push_token;
$$;

create function public.push_tokens_for(wallets text[])
returns table (wallet text, token text)
language sql
stable
set search_path = ''
as $$
  select t.wallet, t.token from public.push_tokens t where t.wallet = any(wallets)
  order by t.wallet, t.token;
$$;

-- Latest known price per token (SOL per whole token), for price alerts and the watchlist.
create function public.latest_prices(mints text[])
returns table (mint text, price_sol double precision, block_time timestamptz)
language sql
stable
set search_path = ''
as $$
  select distinct on (s.mint) s.mint, s.volume_sol / s.token_amount, s.block_time
  from public.token_swaps s
  where s.mint = any(mints) and s.token_amount > 0 and s.volume_sol > 0
  order by s.mint, s.block_time desc, s.signature;
$$;

-- Lock every function down to the API's service role.
do $$
declare fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'create_session', 'session_wallet', 'delete_session', 'profile_rows', 'save_profile',
      'search_profiles', 'follow', 'unfollow', 'is_following', 'record_shared_trade',
      'friends_feed', 'trades_by', 'watch_token', 'unwatch_token', 'watchlist_of',
      'create_price_alert', 'price_alerts_of', 'delete_price_alert', 'active_price_alerts',
      'trigger_price_alert', 'save_push_token', 'delete_push_token', 'push_tokens_for',
      'latest_prices'
    )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
