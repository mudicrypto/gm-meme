-- Security review: remove the old delete_push_token(text), which deleted any wallet's push
-- token. The API now calls delete_push_token(text, text), scoped to the owner.

drop function if exists public.delete_push_token(text);
