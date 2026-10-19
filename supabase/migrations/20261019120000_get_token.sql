-- Step 3: the risk score reads a single token (for its creator).

create function public.get_token(token_mint text)
returns table (
  mint text, symbol text, name text, image_url text, decimals integer, supply numeric,
  creator text, launch_signature text, launch_source text,
  launched_at timestamptz, enriched_at timestamptz, first_seen_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select t.mint, t.symbol, t.name, t.image_url, t.decimals, t.supply,
         t.creator, t.launch_signature, t.launch_source,
         t.launched_at, t.enriched_at, t.first_seen_at
  from public.tokens t
  where t.mint = token_mint;
$$;

revoke execute on function public.get_token(text) from public, anon, authenticated;
grant execute on function public.get_token(text) to service_role;
