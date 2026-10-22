-- =============================================================================
-- MON STOCK — migration 20261023000530 : conservation limitée des données du conseiller IA et purge
-- à la suppression d'un compte eBay (audit I-08, D-10 partie IA, D-11, Q-09).
--
-- 1. advisor_retention_policy (une seule ligne, serveur uniquement) : durées de conservation
--    CONFIGURABLES — conversations (sans nouveau message), cartes de résultats, actions terminées,
--    journal d'usage IA. Valeurs par défaut prudentes, à valider avec le titulaire / un juriste.
-- 2. advisor_purge_expired(p_now) : applique ces durées. N'EST PAS PLANIFIÉE ici : la planification
--    (pg_cron ou appel serveur) sera décidée avec le titulaire. Exécutable par service_role seulement.
-- 3. advisor_purge_ebay_account(p_username) : à la suppression d'un compte eBay (acheteur ou vendeur),
--    retire les cartes qui citent le pseudo et remplace le pseudo dans les textes (questions, réponses,
--    titres de conversation). Appelée automatiquement quand le serveur anonymise le pseudo d'une
--    commande (orders.buyer_username) ou d'une connexion (channel_connections.external_username) avec
--    le libellé « [compte eBay supprimé] » (src/services/sync/ebay-webhook.ts, DELETED_ACCOUNT_LABEL).
--
-- Non destructive à l'application : aucune donnée supprimée par la migration elle-même (seules les
-- fonctions, appelées plus tard, purgent). Retour arrière :
--   supabase/ops/rollback/20261023000530_advisor_retention_purge_down.sql
-- =============================================================================

create table if not exists public.advisor_retention_policy (
  id boolean primary key default true check (id),
  -- conversation supprimée (avec ses messages et cartes) après N jours sans nouveau message
  conversation_days integer not null default 180 check (conversation_days between 1 and 3650),
  -- cartes de résultats retirées des messages de plus de N jours (le texte de la réponse reste)
  card_days integer not null default 30 check (card_days between 0 and 3650),
  -- actions terminées (exécutées, annulées, expirées, en échec) supprimées après N jours
  action_days integer not null default 90 check (action_days between 1 and 3650),
  -- journal d'usage IA (quotas, jetons) : au moins 2 jours (fenêtre de quota de 24 h)
  usage_event_days integer not null default 180 check (usage_event_days between 2 and 3650),
  updated_at timestamptz not null default now()
);

insert into public.advisor_retention_policy (id) values (true) on conflict (id) do nothing;

alter table public.advisor_retention_policy enable row level security;
revoke all on public.advisor_retention_policy from public, anon, authenticated;
grant select, update on public.advisor_retention_policy to service_role;

create index if not exists advisor_conversations_last_message_idx on public.advisor_conversations (last_message_at);
create index if not exists advisor_messages_created_idx on public.advisor_messages (created_at);

-- -----------------------------------------------------------------------------
-- Purge selon les durées de conservation
-- -----------------------------------------------------------------------------
create or replace function public.advisor_purge_expired(p_now timestamptz default now())
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p public.advisor_retention_policy;
  v_conversations integer := 0;
  v_cards integer := 0;
  v_stuck integer := 0;
  v_expired integer := 0;
  v_actions integer := 0;
  v_usage integer := 0;
begin
  select * into p from public.advisor_retention_policy where id;
  if p.id is null then
    raise exception 'ADVISOR_RETENTION_POLICY_MISSING' using errcode = 'P0002';
  end if;

  delete from public.advisor_conversations where last_message_at < p_now - make_interval(days => p.conversation_days);
  get diagnostics v_conversations = row_count;

  update public.advisor_messages set cards = '[]'::jsonb
   where created_at < p_now - make_interval(days => p.card_days) and jsonb_array_length(cards) > 0;
  get diagnostics v_cards = row_count;

  v_stuck := public.advisor_recover_stuck_actions(interval '2 minutes');

  update public.advisor_actions
     set status = 'expired', decided_at = p_now, error = 'Demande expirée : rien n''a été modifié.'
   where status = 'pending' and expires_at < p_now;
  get diagnostics v_expired = row_count;

  delete from public.advisor_actions
   where status in ('executed', 'cancelled', 'expired', 'failed') and created_at < p_now - make_interval(days => p.action_days);
  get diagnostics v_actions = row_count;

  delete from public.ai_usage_events where created_at < p_now - make_interval(days => p.usage_event_days);
  get diagnostics v_usage = row_count;

  return jsonb_build_object(
    'conversationsDeleted', v_conversations,
    'messagesCardsCleared', v_cards,
    'stuckActionsRecovered', v_stuck,
    'pendingActionsExpired', v_expired,
    'actionsDeleted', v_actions,
    'usageEventsDeleted', v_usage
  );
end;
$$;

revoke all on function public.advisor_purge_expired(timestamptz) from public, anon, authenticated;
grant execute on function public.advisor_purge_expired(timestamptz) to service_role;

-- -----------------------------------------------------------------------------
-- Suppression d'un compte eBay : données du conseiller
-- -----------------------------------------------------------------------------
create or replace function public.advisor_purge_ebay_account(p_username text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_username, ''));
  v_pattern text;
  v_label constant text := '[compte eBay supprimé]';
  v_cards integer := 0;
  v_messages integer := 0;
  v_titles integer := 0;
begin
  -- Pseudo trop court ou déjà anonymisé : rien à faire (évite d'effacer au hasard).
  if char_length(v_name) < 2 or v_name = v_label then
    return jsonb_build_object('cardsCleared', 0, 'messagesRewritten', 0, 'titlesRewritten', 0);
  end if;
  -- Pseudo isolé (ni lettre, chiffre, « _ », « * » ou « - » collé avant ou après), insensible à la
  -- casse ; un point final de phrase n'empêche pas la correspondance (purge plutôt trop que pas assez).
  v_pattern := '(?<![[:alnum:]_*-])' || regexp_replace(v_name, '([.^$|()\[\]{}*+?\\-])', '\\\1', 'g') || '(?![[:alnum:]_*-])';

  update public.advisor_messages set cards = '[]'::jsonb
   where jsonb_array_length(cards) > 0 and cards::text ~* v_pattern;
  get diagnostics v_cards = row_count;

  update public.advisor_messages
     set content = left(regexp_replace(content, v_pattern, v_label, 'gi'), 12000)
   where content ~* v_pattern;
  get diagnostics v_messages = row_count;

  update public.advisor_conversations
     set title = left(regexp_replace(title, v_pattern, v_label, 'gi'), 120)
   where title ~* v_pattern;
  get diagnostics v_titles = row_count;

  return jsonb_build_object('cardsCleared', v_cards, 'messagesRewritten', v_messages, 'titlesRewritten', v_titles);
end;
$$;

revoke all on function public.advisor_purge_ebay_account(text) from public, anon, authenticated;
grant execute on function public.advisor_purge_ebay_account(text) to service_role;

-- Déclencheurs : l'anonymisation existante (notification MARKETPLACE_ACCOUNT_DELETION) suffit à
-- purger aussi le conseiller. Ne se déclenchent QUE lorsque le pseudo devient « [compte eBay supprimé] ».
create or replace function public.advisor_purge_on_ebay_account_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'orders' then
    perform public.advisor_purge_ebay_account(old.buyer_username);
  else
    perform public.advisor_purge_ebay_account(old.external_username);
  end if;
  return null;
end;
$$;

revoke all on function public.advisor_purge_on_ebay_account_deleted() from public, anon, authenticated;

drop trigger if exists orders_advisor_purge_on_buyer_deleted on public.orders;
create trigger orders_advisor_purge_on_buyer_deleted
  after update of buyer_username on public.orders
  for each row
  when (new.buyer_username = '[compte eBay supprimé]' and old.buyer_username is distinct from new.buyer_username and old.buyer_username is not null)
  execute function public.advisor_purge_on_ebay_account_deleted();

drop trigger if exists channel_connections_advisor_purge_on_deleted on public.channel_connections;
create trigger channel_connections_advisor_purge_on_deleted
  after update of external_username on public.channel_connections
  for each row
  when (new.external_username = '[compte eBay supprimé]' and old.external_username is distinct from new.external_username and old.external_username is not null)
  execute function public.advisor_purge_on_ebay_account_deleted();
