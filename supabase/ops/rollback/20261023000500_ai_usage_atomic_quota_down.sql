-- Retour arrière MANUEL de 20261023000500_ai_usage_atomic_quota.sql.
-- ATTENTION : à n'appliquer qu'avec le retour arrière de l'Edge Function (l'ancienne version insère
-- les événements sous la session de l'utilisateur). Les lignes 'model_call' / 'speech' doivent être
-- supprimées avant de restaurer l'ancienne contrainte (données de comptage uniquement).
drop function if exists public.ai_record_usage_tokens(uuid, integer, integer);
drop function if exists public.ai_reserve_usage(uuid, uuid, text, integer, integer, integer, integer, text[], bigint, integer, integer);
delete from public.ai_usage_events where kind in ('model_call', 'speech');
alter table public.ai_usage_events drop constraint if exists ai_usage_events_kind_check;
alter table public.ai_usage_events add constraint ai_usage_events_kind_check check (kind in ('assistant', 'product_draft'));
drop index if exists public.ai_usage_events_org_kind_idx;
drop index if exists public.ai_usage_events_user_kind_idx;
alter table public.ai_usage_events drop column if exists input_tokens;
alter table public.ai_usage_events drop column if exists output_tokens;
grant insert on public.ai_usage_events to authenticated;
drop policy if exists ai_usage_events_insert on public.ai_usage_events;
create policy ai_usage_events_insert on public.ai_usage_events
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_org_member(organization_id) and created_at >= now() - interval '1 minute');
