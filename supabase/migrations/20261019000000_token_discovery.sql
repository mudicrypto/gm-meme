-- Step 2: token discovery.
-- Tokens seen on chain (launches, plus tokens first seen through swaps) and the swaps
-- used to rank trending tokens. Only the API's service role touches these: RLS is on
-- with no policies, and every function is revoked from the public roles.

create table public.tokens (
  mint text primary key,
  symbol text,
  name text,
  image_url text,
  decimals integer,
  supply numeric,
  -- Fee payer of the launch transaction: the dev wallet, used by the risk score.
  creator text,
  launch_signature text,
  launch_source text,
  -- Null when we never saw the launch (token first seen through a swap).
  launched_at timestamptz,
  -- Set once Helius DAS metadata was fetched; null means "retry enrichment".
  enriched_at timestamptz,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tokens_launched_at_idx on public.tokens (launched_at desc)
  where launched_at is not null;

create table public.token_swaps (
  signature text not null,
  mint text not null,
  trader text not null,
  volume_sol double precision,
  block_time timestamptz not null,
  primary key (signature, mint)
);

create index token_swaps_block_time_idx on public.token_swaps (block_time desc);

alter table public.tokens enable row level security;
alter table public.token_swaps enable row level security;

-- Insert or merge tokens. Never overwrites known values with nulls, and keeps the
-- earliest launch, so out-of-order or repeated webhook deliveries are safe.
-- Callers must not send the same mint twice in one call.
create function public.upsert_tokens(rows jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.tokens as t (
    mint, symbol, name, image_url, decimals, supply, creator,
    launch_signature, launch_source, launched_at, enriched_at
  )
  select r.mint, r.symbol, r.name, r.image_url, r.decimals, r.supply, r.creator,
         r.launch_signature, r.launch_source, r.launched_at, r.enriched_at
  from jsonb_to_recordset(rows) as r(
    mint text, symbol text, name text, image_url text, decimals integer, supply numeric,
    creator text, launch_signature text, launch_source text,
    launched_at timestamptz, enriched_at timestamptz
  )
  on conflict (mint) do update set
    symbol = coalesce(excluded.symbol, t.symbol),
    name = coalesce(excluded.name, t.name),
    image_url = coalesce(excluded.image_url, t.image_url),
    decimals = coalesce(excluded.decimals, t.decimals),
    supply = coalesce(excluded.supply, t.supply),
    creator = coalesce(t.creator, excluded.creator),
    launch_signature = coalesce(t.launch_signature, excluded.launch_signature),
    launch_source = coalesce(t.launch_source, excluded.launch_source),
    launched_at = least(t.launched_at, excluded.launched_at),
    enriched_at = coalesce(excluded.enriched_at, t.enriched_at),
    updated_at = now();
$$;

-- Record swaps; redelivered transactions are ignored.
create function public.record_swaps(rows jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.token_swaps (signature, mint, trader, volume_sol, block_time)
  select r.signature, r.mint, r.trader, r.volume_sol, r.block_time
  from jsonb_to_recordset(rows) as r(
    signature text, mint text, trader text, volume_sol double precision, block_time timestamptz
  )
  on conflict (signature, mint) do nothing;
$$;

-- Which of these mints already have metadata (so need no Helius lookup).
create function public.enriched_mints(mints text[])
returns table (mint text)
language sql
stable
set search_path = ''
as $$
  select t.mint from public.tokens t
  where t.mint = any(mints) and t.enriched_at is not null;
$$;

create function public.new_tokens(max_rows integer)
returns table (
  mint text, symbol text, name text, image_url text,
  launched_at timestamptz, first_seen_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select t.mint, t.symbol, t.name, t.image_url, t.launched_at, t.first_seen_at
  from public.tokens t
  where t.launched_at is not null
  order by t.launched_at desc
  limit max_rows;
$$;

-- Trending = most distinct traders since `since`. Ranking by traders rather than raw
-- volume makes wash trading from one wallet much less effective.
create function public.trending_tokens(since timestamptz, max_rows integer)
returns table (
  mint text, symbol text, name text, image_url text,
  launched_at timestamptz, first_seen_at timestamptz,
  swap_count integer, unique_traders integer, volume_sol double precision
)
language sql
stable
set search_path = ''
as $$
  select t.mint, t.symbol, t.name, t.image_url, t.launched_at, t.first_seen_at,
         count(*)::integer as swap_count,
         count(distinct s.trader)::integer as unique_traders,
         coalesce(sum(s.volume_sol), 0) as volume_sol
  from public.token_swaps s
  join public.tokens t on t.mint = s.mint
  where s.block_time >= since
  group by t.mint
  order by unique_traders desc, swap_count desc, volume_sol desc
  limit max_rows;
$$;

-- Supabase exposes public functions over its REST API; lock them to the server.
revoke execute on function
  public.upsert_tokens(jsonb), public.record_swaps(jsonb), public.enriched_mints(text[]),
  public.new_tokens(integer), public.trending_tokens(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function
  public.upsert_tokens(jsonb), public.record_swaps(jsonb), public.enriched_mints(text[]),
  public.new_tokens(integer), public.trending_tokens(timestamptz, integer)
  to service_role;
