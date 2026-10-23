-- Security review: prices that one crafted trade can't move.
-- Trades under 0.01 SOL (dust, or tiny buys padded with fees) no longer set prices, and the
-- "latest price" used by price alerts and the watchlist is the median of the last 7 trades.
-- Keep the 0.01 and 7 in step with MIN_PRICED_TRADE_SOL and PRICE_MEDIAN_TRADES in
-- apps/api/src/tokens/repository.ts. Same signatures, so existing grants stay in place.

create or replace function public.token_trades(token_mint text, since timestamptz, max_rows integer)
returns table (block_time timestamptz, side text, price_sol double precision, volume_sol double precision)
language sql
stable
set search_path = ''
as $$
  select s.block_time, s.side, s.volume_sol / s.token_amount, s.volume_sol
  from public.token_swaps s
  where s.mint = token_mint and s.block_time >= since
    and s.token_amount > 0 and s.volume_sol >= 0.01
  order by s.block_time
  limit max_rows;
$$;

create or replace function public.latest_prices(mints text[])
returns table (mint text, price_sol double precision, block_time timestamptz)
language sql
stable
set search_path = ''
as $$
  with recent as (
    select s.mint, s.volume_sol / s.token_amount as price, s.block_time,
      row_number() over (partition by s.mint order by s.block_time desc, s.signature) as n
    from public.token_swaps s
    where s.mint = any(mints) and s.token_amount > 0 and s.volume_sol >= 0.01
  )
  select r.mint, percentile_disc(0.5) within group (order by r.price), max(r.block_time)
  from recent r
  where r.n <= 7
  group by r.mint;
$$;
