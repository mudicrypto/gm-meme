-- Account deletion (both app stores require it). Removes everything Sift keeps about a
-- wallet: profile (with its shared trades and followers), the people it follows,
-- sessions, watchlist, price alerts and push tokens. The Sift wallet record is deleted
-- separately, and only after the API has checked on chain that the wallet is empty.

create function public.delete_account(account_wallet text)
returns void
language sql
set search_path = ''
as $$
  delete from public.follows f where f.follower = account_wallet;
  delete from public.profiles p where p.wallet = account_wallet;
  delete from public.sessions s where s.wallet = account_wallet;
  delete from public.watchlist w where w.wallet = account_wallet;
  delete from public.price_alerts a where a.wallet = account_wallet;
  delete from public.push_tokens t where t.wallet = account_wallet;
$$;

-- Spend records and orders go with the wallet (on delete cascade).
create function public.delete_sift_wallet(wallet_owner text)
returns void
language sql
set search_path = ''
as $$
  delete from public.sift_wallets w where w.owner = wallet_owner;
$$;

revoke execute on function public.delete_account(text) from public, anon, authenticated;
grant execute on function public.delete_account(text) to service_role;
revoke execute on function public.delete_sift_wallet(text) from public, anon, authenticated;
grant execute on function public.delete_sift_wallet(text) to service_role;
