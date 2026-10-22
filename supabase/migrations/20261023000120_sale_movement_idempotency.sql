-- =============================================================================
-- MON STOCK — migration 20261023000120 : idempotence des mouvements de vente garantie par la base
-- (audit 2026-10-22 : D-19).
--
-- Avant : « une seule déduction par ligne de commande » reposait uniquement sur le drapeau
-- order_items.inventory_applied, lu sous verrou par ingest_external_order et
-- apply_pending_sales_for_sku. Une future fonction qui l'oublierait créerait des doublons silencieux.
--
-- Pourquoi pas un simple index unique (reference_type, reference_id, type) : le cycle
-- vente → annulation → revente d'une MÊME ligne existe (commande annulée puis rétablie : la ligne est
-- recréditée, inventory_applied repasse à false, apply_pending_sales_for_sku peut la déduire de
-- nouveau). Les mouvements d'une ligne doivent ALTERNER : vente, annulation, vente, annulation…
-- On numérote donc chaque mouvement par « génération » :
--   - vente n°g      : g = nombre d'annulations déjà enregistrées pour la ligne ;
--   - annulation n°g : g = nombre de ventes déjà enregistrées − 1 (une annulation sans vente
--     préalable est refusée : elle recréditerait un stock jamais déduit).
-- L'index unique (reference_id, type, reference_generation) rend alors IMPOSSIBLE une deuxième vente
-- sans annulation intermédiaire (ou une deuxième annulation sans nouvelle vente), y compris entre
-- transactions concurrentes (la seconde attend la première puis échoue en 23505).
-- Ne concerne que reference_type = 'order_item' et les types sale / cancellation ; les autres
-- mouvements (retours, ajustements, réceptions…) sont inchangés.
--
-- Contrôle préalable : si l'historique contient déjà une séquence non alternée (deux ventes de suite
-- pour une même ligne, etc.), la migration ÉCHOUE en listant les lignes concernées, sans rien
-- modifier : à corriger à la main avant de relancer. À la date de l'audit : 0 doublon.
-- Idempotente, non destructive (colonne ajoutée, remplie pour l'historique).
-- Retour arrière : supabase/ops/rollback/20261023000120_sale_movement_idempotency_down.sql
-- =============================================================================

do $pre$
declare
  v_bad text;
  v_count integer;
begin
  select count(*), string_agg(reference_id::text, ', ')
    into v_count, v_bad
    from (
      select distinct reference_id
        from (
          select reference_id, type,
                 lag(type) over (partition by reference_id order by created_at, id) as prev_type,
                 row_number() over (partition by reference_id order by created_at, id) as rn
            from public.inventory_movements
           where reference_type = 'order_item' and reference_id is not null and type in ('sale', 'cancellation')
        ) s
       where (rn = 1 and type <> 'sale') or (prev_type is not null and prev_type = type)
       limit 50
    ) bad;
  if v_count > 0 then
    raise exception 'Contrôle préalable 20261023000120 : mouvements de vente / annulation non alternés pour % ligne(s) de commande (extrait : %). Corrigez-les avant de relancer la migration.', v_count, v_bad
      using errcode = '23505';
  end if;
end
$pre$;

alter table public.inventory_movements add column if not exists reference_generation integer;

comment on column public.inventory_movements.reference_generation is
  'Ventes/annulations d''une ligne de commande : numéro de cycle (vente g, annulation g). Unicité garantie par inventory_movements_order_item_cycle_uidx (D-19).';

-- Historique : numérotation dans l'ordre d'enregistrement (séquences vérifiées alternées ci-dessus).
update public.inventory_movements m
   set reference_generation = s.g
  from (
    select id, (row_number() over (partition by reference_id, type order by created_at, id) - 1)::integer as g
      from public.inventory_movements
     where reference_type = 'order_item' and reference_id is not null and type in ('sale', 'cancellation')
  ) s
 where m.id = s.id and m.reference_generation is null;

create or replace function public.inventory_movements_set_reference_generation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if new.reference_type = 'order_item' and new.reference_id is not null and new.type in ('sale', 'cancellation') then
    if new.type = 'sale' then
      select count(*) into v_count
        from public.inventory_movements m
       where m.reference_type = 'order_item' and m.reference_id = new.reference_id and m.type = 'cancellation';
      new.reference_generation := v_count;
    else
      select count(*) into v_count
        from public.inventory_movements m
       where m.reference_type = 'order_item' and m.reference_id = new.reference_id and m.type = 'sale';
      if v_count = 0 then
        raise exception 'ORDER_ITEM_CANCELLATION_WITHOUT_SALE' using errcode = '23514',
          detail = 'Annulation refusée : aucune vente enregistrée pour cette ligne de commande (aucun stock à recréditer).';
      end if;
      new.reference_generation := v_count - 1;
    end if;
  else
    new.reference_generation := null;
  end if;
  return new;
end;
$$;

revoke all on function public.inventory_movements_set_reference_generation() from public, anon, authenticated;

drop trigger if exists inventory_movements_reference_generation on public.inventory_movements;
create trigger inventory_movements_reference_generation
  before insert on public.inventory_movements
  for each row execute function public.inventory_movements_set_reference_generation();

create unique index if not exists inventory_movements_order_item_cycle_uidx
  on public.inventory_movements (reference_id, type, reference_generation)
  where reference_type = 'order_item' and reference_id is not null and type in ('sale', 'cancellation');
