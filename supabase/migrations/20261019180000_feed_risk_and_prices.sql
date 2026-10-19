-- Step 5: risk badges in the feeds, and trade prices for charts.

alter table public.tokens
  add column risk_level text check (risk_level in ('green', 'amber', 'red')),
  add column risk_checked_at timestamptz;

alter table public.token_swaps
  add column side text check (side in ('buy', 'sell')),
  -- Tokens bought or sold, in whole-token units; with volume_sol this gives the price.
  add column token_amount double precision;

create index token_swaps_mint_time_idx on public.token_swaps (mint, block_time);

-- Record a risk score; an older result never overwrites a newer one.
create function public.set_token_risk(token_mint text, level text, checked_at timestamptz)
returns void
language sql
set search_path = ''
as $$
  update public.tokens
  set risk_level = level, risk_checked_at = checked_at, updated_at = now()
  where mint = token_mint
    and (risk_checked_at is null or risk_checked_at < checked_at);
$$;

-- Same contract as before, now storing side and token amount too.
create or replace function public.record_swaps(rows jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.token_swaps (signature, mint, trader, volume_sol, block_time, side, token_amount)
  select r.signature, r.mint, r.trader, r.volume_sol, r.block_time, r.side, r.token_amount
  from jsonb_to_recordset(rows) as r(
    signature text, mint text, trader text, volume_sol double precision, block_time timestamptz,
    side text, token_amount double precision
  )
  on conflict (signature, mint) do nothing;
$$;

-- Trades with a known price (SOL per token), oldest first, for charts.
create function public.token_trades(token_mint text, since timestamptz, max_rows integer)
returns table (block_time timestamptz, side text, price_sol double precision, volume_sol double precision)
language sql
stable
set search_path = ''
as $$
  select s.block_time, s.side, s.volume_sol / s.token_amount, s.volume_sol
  from public.token_swaps s
  where s.mint = token_mint and s.block_time >= since
    and s.token_amount > 0 and s.volume_sol > 0
  order by s.block_time
  limit max_rows;
$$;

-- Stored risk levels for many mints at once: merged into the feeds and the portfolio.
-- (Additive on purpose: changing new_tokens/trending_tokens' return types would mean
-- dropping and recreating them.)
create function public.risk_levels(mints text[])
returns table (mint text, risk_level text, risk_checked_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select t.mint, t.risk_level, t.risk_checked_at from public.tokens t
  where t.mint = any(mints) and t.risk_level is not null;
$$;

-- Supabase grants new functions to its public roles by default: lock them all down.
revoke execute on function
  public.set_token_risk(text, text, timestamptz), public.record_swaps(jsonb),
  public.token_trades(text, timestamptz, integer), public.risk_levels(text[])
  from public, anon, authenticated;
grant execute on function
  public.set_token_risk(text, text, timestamptz), public.record_swaps(jsonb),
  public.token_trades(text, timestamptz, integer), public.risk_levels(text[])
  to service_role;
