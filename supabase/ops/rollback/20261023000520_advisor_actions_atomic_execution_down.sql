-- Retour arrière MANUEL de 20261023000520_advisor_actions_atomic_execution.sql.
-- À n'appliquer qu'avec le retour arrière de l'Edge Function (l'ancienne version exécute les actions
-- sans advisor_execute_action). Les actions en cours (« executing ») doivent être reprises avant.
drop function if exists public.advisor_recover_stuck_actions(interval, uuid);
drop function if exists public.advisor_execute_action(uuid);
drop index if exists public.advisor_actions_executing_idx;
alter table public.advisor_actions drop column if exists claimed_at;
