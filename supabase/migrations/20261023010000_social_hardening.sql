-- Security review: push tokens can only be removed by their owner, and nothing per wallet
-- grows without bound (at most 10 devices and 10 sign-in sessions; expired sessions go).

drop function public.delete_push_token(text);

create function public.delete_push_token(push_token text, owner text)
returns void
language sql
set search_path = ''
as $$
  delete from public.push_tokens t where t.token = push_token and t.wallet = owner;
$$;

create or replace function public.save_push_token(push_token text, owner text)
returns void
language sql
set search_path = ''
as $$
  insert into public.push_tokens (token, wallet) values (push_token, owner)
  on conflict (token) do update set wallet = excluded.wallet, updated_at = now();
  -- Keep the 10 most recently registered devices.
  delete from public.push_tokens t
  where t.wallet = owner and t.token not in (
    select k.token from public.push_tokens k where k.wallet = owner
    order by k.updated_at desc, k.token limit 10
  );
$$;

create index sessions_expires_at_idx on public.sessions (expires_at);

create or replace function public.create_session(token_hash text, session_wallet text, expires_at timestamptz)
returns void
language sql
set search_path = ''
as $$
  delete from public.sessions s where s.expires_at <= now();
  insert into public.sessions (token_hash, wallet, expires_at)
  values (create_session.token_hash, session_wallet, create_session.expires_at);
  -- Keep the 10 newest sessions per wallet.
  delete from public.sessions s
  where s.wallet = session_wallet and s.token_hash not in (
    select k.token_hash from public.sessions k where k.wallet = session_wallet
    order by k.created_at desc, k.expires_at desc, k.token_hash limit 10
  );
$$;

revoke execute on function public.delete_push_token(text, text) from public, anon, authenticated;
grant execute on function public.delete_push_token(text, text) to service_role;
