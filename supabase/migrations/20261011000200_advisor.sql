-- =============================================================================
-- Conseiller e-commerce IA : conversations, messages et actions à confirmer.
--
-- advisor_conversations : fils de discussion PERSONNELS (un utilisateur ne voit que les siens,
--                         même au sein de son organisation).
-- advisor_messages      : messages du fil (question de l'utilisateur, réponse du conseiller,
--                         cartes de résultats calculées par le serveur). Les résultats bruts des
--                         outils ne sont pas conservés.
-- advisor_actions       : actions PRÉPARÉES par le conseiller, en attente de confirmation
--                         explicite (bouton « Confirmer » dans l'application). Seul le serveur
--                         (service_role) change leur statut, après revérification des droits ;
--                         aucune politique UPDATE pour les utilisateurs.
--
-- Additive et réversible : aucune donnée existante modifiée. Retour arrière (manuel) :
--   supabase/ops/rollback/20261011000200_advisor_down.sql
-- =============================================================================

create table if not exists public.advisor_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Nouvelle conversation' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index if not exists advisor_conversations_user_idx on public.advisor_conversations (organization_id, user_id, last_message_at desc);

create trigger advisor_conversations_set_updated_at before update on public.advisor_conversations
  for each row execute function public.set_updated_at();

create table if not exists public.advisor_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null references public.advisor_conversations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'notice')),
  content text not null check (char_length(content) between 1 and 12000),
  -- cartes de résultats (ventes, marges, stock, commandes, devis, actions) produites par les outils
  cards jsonb not null default '[]'::jsonb check (jsonb_typeof(cards) = 'array' and jsonb_array_length(cards) <= 12),
  -- libellés des données consultées (« Synthèse des ventes », …)
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) <= 20),
  -- réponse interrompue (délai, erreur réseau) : affichée comme telle
  interrupted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists advisor_messages_conversation_idx on public.advisor_messages (conversation_id, created_at);

create table if not exists public.advisor_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversation_id uuid references public.advisor_conversations (id) on delete set null,
  kind text not null check (kind in ('adjust_stock', 'update_sku_price')),
  -- objet concerné (SKU) : revérifié au moment de l'exécution
  sku_id uuid references public.skus (id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  -- phrase de confirmation affichée telle quelle (action, objet, montant éventuel)
  summary text not null check (char_length(summary) between 1 and 400),
  amount numeric(12, 2),
  currency char(3) check (currency is null or currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending', 'executing', 'executed', 'cancelled', 'expired', 'failed')),
  expires_at timestamptz not null,
  decided_at timestamptz,
  result jsonb,
  error text check (error is null or char_length(error) <= 400),
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '30 minutes')
);

create index if not exists advisor_actions_user_idx on public.advisor_actions (organization_id, user_id, created_at desc);

alter table public.advisor_conversations enable row level security;
alter table public.advisor_messages enable row level security;
alter table public.advisor_actions enable row level security;

-- Conversations : propriétaire uniquement (et toujours membre de l'organisation).
create policy advisor_conversations_select on public.advisor_conversations
  for select to authenticated using (user_id = auth.uid() and public.is_org_member(organization_id));
create policy advisor_conversations_insert on public.advisor_conversations
  for insert to authenticated with check (user_id = auth.uid() and public.is_org_member(organization_id));
create policy advisor_conversations_update on public.advisor_conversations
  for update to authenticated using (user_id = auth.uid() and public.is_org_member(organization_id)) with check (user_id = auth.uid() and public.is_org_member(organization_id));
create policy advisor_conversations_delete on public.advisor_conversations
  for delete to authenticated using (user_id = auth.uid() and public.is_org_member(organization_id));

-- Messages : lecture / ajout dans ses propres conversations ; jamais modifiés (suppression avec la conversation).
create policy advisor_messages_select on public.advisor_messages
  for select to authenticated using (user_id = auth.uid() and public.is_org_member(organization_id));
create policy advisor_messages_insert on public.advisor_messages
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.is_org_member(organization_id)
    and exists (select 1 from public.advisor_conversations c where c.id = conversation_id and c.user_id = auth.uid() and c.organization_id = advisor_messages.organization_id)
  );
create policy advisor_messages_delete on public.advisor_messages
  for delete to authenticated using (user_id = auth.uid() and public.is_org_member(organization_id));

-- Actions : lecture des siennes ; création « en attente » uniquement (le serveur prépare sous la
-- session de l'utilisateur) ; AUCUNE mise à jour ni suppression côté utilisateur.
create policy advisor_actions_select on public.advisor_actions
  for select to authenticated using (user_id = auth.uid() and public.is_org_member(organization_id));
create policy advisor_actions_insert on public.advisor_actions
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.is_org_member(organization_id)
    and status = 'pending'
    and decided_at is null
    and result is null
    and created_at >= now() - interval '1 minute'
  );

grant select, insert, update, delete on public.advisor_conversations to authenticated;
grant select, insert, delete on public.advisor_messages to authenticated;
grant select, insert on public.advisor_actions to authenticated;

select public.install_same_org_guards('public.advisor_conversations'::regclass);
select public.install_same_org_guards('public.advisor_messages'::regclass);
select public.install_same_org_guards('public.advisor_actions'::regclass);
