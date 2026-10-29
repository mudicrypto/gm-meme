-- Leaderboard: every trade shared in a window, from users who have sharing on (opt-in).
-- Same columns as trades_by; no wallet addresses leave the database.

create function public.shared_trades_since(since timestamptz, max_rows integer)
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
  from public.shared_trades t
  join public.profiles p on p.wallet = t.wallet
  where p.share_trades and t.traded_at >= since
  order by t.traded_at desc, t.signature
  limit max_rows;
$$;

revoke execute on function public.shared_trades_since(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.shared_trades_since(timestamptz, integer) to service_role;
