-- Security hardening: stock_register_entry is an authenticated application RPC.
-- The original migration granted authenticated but did not revoke PostgreSQL's
-- default PUBLIC EXECUTE privilege, which also made it callable by anon.
revoke execute on function public.stock_register_entry(uuid, uuid, text, numeric, text, text) from public, anon;
grant execute on function public.stock_register_entry(uuid, uuid, text, numeric, text, text) to authenticated;
