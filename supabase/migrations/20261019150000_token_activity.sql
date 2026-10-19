-- Step 4: trading activity for one token, fed to the AI summary.

create function public.token_activity(token_mint text, since timestamptz)
returns table (swap_count integer, unique_traders integer, volume_sol double precision)
language sql
stable
set search_path = ''
as $$
  select count(*)::integer,
         count(distinct s.trader)::integer,
         coalesce(sum(s.volume_sol), 0)
  from public.token_swaps s
  where s.mint = token_mint and s.block_time >= since;
$$;

revoke execute on function public.token_activity(text, timestamptz) from public, anon, authenticated;
grant execute on function public.token_activity(text, timestamptz) to service_role;
