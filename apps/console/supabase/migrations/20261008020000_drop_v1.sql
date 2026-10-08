-- Every console now uses the *_v2 functions (site passed explicitly; console token scoped '*').
drop function if exists public.observe_put_batch(text, text, bigint, jsonb, jsonb);
drop function if exists public.observe_batches(text, bigint, bigint, int);
drop function if exists public.observe_put_jev(text, text, jsonb, text, bigint);
drop function if exists public.observe_jev(text, bigint);
