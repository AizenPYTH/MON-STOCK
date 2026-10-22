-- =============================================================================
-- MON STOCK — migration 20261023000520 : exécution atomique des actions du conseiller (audit S-19).
--
-- Avant : le serveur réservait l'action (pending → executing), relisait le stock, appelait
-- apply_inventory_movement puis enregistrait le résultat, en requêtes séparées :
--   - contrôle « stock attendu » puis mouvement NON atomiques (un mouvement concurrent passait entre
--     les deux) ;
--   - instance arrêtée entre la réservation et l'enregistrement : action bloquée en « executing »
--     pour toujours, sans savoir si le mouvement avait eu lieu.
-- Après :
--   1. claimed_at : date de la réservation (pending → executing) posée par le serveur.
--   2. advisor_execute_action(p_action_id) : sous la session de l'utilisateur (auth.uid()), en UNE
--      transaction : verrou de l'action, contrôle propriétaire + rôle rédacteur + statut « executing »,
--      verrou de la ligne de stock (ou du SKU), contrôle de la valeur attendue, mouvement / prix,
--      statut « executed ». Toute erreur annule tout : l'action reste « executing » SANS effet.
--      Une action non réservée par le serveur (« pending ») est refusée : la confirmation explicite
--      (route /advisor/actions/confirm) reste le seul chemin d'exécution.
--   3. advisor_recover_stuck_actions(p_older_than) : « executing » depuis trop longtemps → « failed »
--      (rien n'a été modifié, puisque l'exécution est atomique). Les anciennes lignes sans claimed_at
--      (avant cette migration) sont marquées « état inconnu : vérifiez ».
--
-- Non destructive : une colonne nullable, deux fonctions. Retour arrière :
--   supabase/ops/rollback/20261023000520_advisor_actions_atomic_execution_down.sql
-- =============================================================================

alter table public.advisor_actions add column if not exists claimed_at timestamptz;

create index if not exists advisor_actions_executing_idx on public.advisor_actions (claimed_at) where status = 'executing';

create or replace function public.advisor_execute_action(p_action_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.advisor_actions;
  v_inv public.inventory;
  v_mv public.inventory_movements;
  v_change integer;
  v_expected integer;
  v_reason text;
  v_note text;
  v_code text;
  v_new numeric(12, 2);
  v_expected_price numeric;
  v_current numeric;
  v_result jsonb;
begin
  select * into a from public.advisor_actions where id = p_action_id for update;
  if a.id is null or a.user_id is distinct from auth.uid() then
    raise exception 'ADVISOR_ACTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.can_write_org(a.organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if a.status <> 'executing' then
    raise exception 'ADVISOR_ACTION_NOT_CLAIMED' using errcode = '55000', detail = a.status;
  end if;
  if a.sku_id is null then
    raise exception 'SKU_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_code := coalesce(a.payload ->> 'code', '');

  if a.kind = 'adjust_stock' then
    v_change := (a.payload ->> 'change')::integer;
    v_expected := (a.payload ->> 'expectedAvailable')::integer;
    v_reason := a.payload ->> 'reason';
    v_note := nullif(a.payload ->> 'note', '');
    if v_change is null or v_change = 0 or v_expected is null or v_reason not in ('receipt', 'adjustment', 'return', 'correction') then
      raise exception 'ADVISOR_ACTION_INVALID' using errcode = '22023';
    end if;
    -- Verrou de la ligne de stock : le contrôle et le mouvement voient la même valeur.
    select * into v_inv from public.inventory i where i.sku_id = a.sku_id and i.organization_id = a.organization_id for update;
    if v_inv.sku_id is null then
      raise exception 'SKU_NOT_FOUND' using errcode = 'P0002';
    end if;
    if coalesce(v_inv.quantity_available, 0) <> v_expected then
      raise exception 'ADVISOR_STOCK_CHANGED' using detail = coalesce(v_inv.quantity_available, 0)::text;
    end if;
    v_mv := public.apply_inventory_movement(
      a.organization_id, a.sku_id, v_reason::public.movement_type, v_change,
      'advisor_action', a.id, 'manual',
      case when v_note is null then 'Conseiller IA (confirmé par l''utilisateur)' else 'Conseiller IA : ' || v_note end,
      now()
    );
    v_result := jsonb_build_object('kind', 'adjust_stock', 'code', v_code, 'quantityAfter', v_mv.quantity_after - coalesce(v_inv.quantity_reserved, 0));
  elsif a.kind = 'update_sku_price' then
    if (a.payload ->> 'newPrice') is null or (a.payload ->> 'newPrice') !~ '^\d+(\.\d{1,2})?$' then
      raise exception 'ADVISOR_ACTION_INVALID' using errcode = '22023';
    end if;
    v_new := (a.payload ->> 'newPrice')::numeric(12, 2);
    v_expected_price := case when jsonb_typeof(a.payload -> 'expectedPrice') = 'number' then (a.payload ->> 'expectedPrice')::numeric else null end;
    select s.sale_price into v_current from public.skus s where s.id = a.sku_id and s.organization_id = a.organization_id for update;
    if not found then
      raise exception 'SKU_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_current is distinct from v_expected_price then
      raise exception 'ADVISOR_PRICE_CHANGED';
    end if;
    update public.skus set sale_price = v_new where id = a.sku_id and organization_id = a.organization_id;
    v_result := jsonb_build_object('kind', 'update_sku_price', 'code', v_code, 'salePrice', v_new);
  else
    raise exception 'ADVISOR_ACTION_INVALID' using errcode = '22023';
  end if;

  update public.advisor_actions
     set status = 'executed', decided_at = now(), result = v_result, error = null
   where id = a.id;
  return v_result;
end;
$$;

revoke all on function public.advisor_execute_action(uuid) from public, anon;
grant execute on function public.advisor_execute_action(uuid) to authenticated, service_role;

-- Reprise des actions restées « executing » (instance arrêtée entre la réservation et l'exécution).
create or replace function public.advisor_recover_stuck_actions(p_older_than interval default interval '2 minutes', p_action_id uuid default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.advisor_actions
     set status = 'failed',
         decided_at = now(),
         error = case when claimed_at is null
                      then 'Exécution interrompue avant la mise à jour de MON STOCK : état inconnu, vérifiez le stock ou le prix avant de redemander.'
                      else 'Exécution interrompue (serveur) : rien n''a été modifié. Redemandez l''action au conseiller.' end
   where status = 'executing'
     and (p_action_id is null or id = p_action_id)
     and coalesce(claimed_at, expires_at) < now() - p_older_than;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.advisor_recover_stuck_actions(interval, uuid) from public, anon, authenticated;
grant execute on function public.advisor_recover_stuck_actions(interval, uuid) to service_role;
