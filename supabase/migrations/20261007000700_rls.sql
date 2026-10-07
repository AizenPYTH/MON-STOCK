-- =============================================================================
-- MON STOCK — migration 0007 : Row Level Security (multi-tenant strict)
-- Règle : un utilisateur ne voit que les données des organisations dont il est
-- membre. Les rôles 'viewer' lisent seulement. Les tables de secrets n'ont
-- AUCUNE policy : seul service_role (serveur) y accède.
-- =============================================================================

create or replace function public.__apply_org_policies(p_table text)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security', p_table);
  execute format(
    'create policy %I on public.%I for select to authenticated using (public.is_org_member(organization_id))',
    p_table || '_select', p_table);
  execute format(
    'create policy %I on public.%I for insert to authenticated with check (public.can_write_org(organization_id))',
    p_table || '_insert', p_table);
  execute format(
    'create policy %I on public.%I for update to authenticated using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id))',
    p_table || '_update', p_table);
  execute format(
    'create policy %I on public.%I for delete to authenticated using (public.can_write_org(organization_id))',
    p_table || '_delete', p_table);
end;
$$;

select public.__apply_org_policies(t) from unnest(array[
  'products', 'product_variants', 'skus', 'inventory', 'inventory_movements', 'price_history',
  'sales_channels', 'channel_connections', 'channel_listings', 'mapping_suggestions',
  'orders', 'order_items', 'sync_runs', 'sync_errors',
  'suppliers', 'supplier_sources', 'supplier_feeds', 'supplier_connections',
  'sourcing_products', 'sourcing_offers', 'supplier_price_history', 'supplier_stock_history',
  'product_matches', 'sourcing_searches', 'sourcing_alerts', 'sourcing_alert_events',
  'purchase_orders', 'purchase_order_items', 'alerts', 'replenishment_recommendations'
]) as t;

drop function public.__apply_org_policies(text);

-- Journal de stock immuable : aucune modification/suppression côté client.
drop policy inventory_movements_update on public.inventory_movements;
drop policy inventory_movements_delete on public.inventory_movements;
drop policy inventory_movements_insert on public.inventory_movements;   -- via apply_inventory_movement
-- Le stock ne se modifie que via apply_inventory_movement / adjust_reserved_quantity.
drop policy inventory_insert on public.inventory;
drop policy inventory_update on public.inventory;
drop policy inventory_delete on public.inventory;
-- Les commandes marketplace proviennent de ingest_external_order (jamais supprimées côté client).
drop policy orders_delete on public.orders;
drop policy order_items_delete on public.order_items;
-- Historiques immuables.
drop policy price_history_update on public.price_history;
drop policy price_history_delete on public.price_history;
drop policy supplier_price_history_update on public.supplier_price_history;
drop policy supplier_price_history_delete on public.supplier_price_history;
drop policy supplier_stock_history_update on public.supplier_stock_history;
drop policy supplier_stock_history_delete on public.supplier_stock_history;
-- Connexions de canaux : création/suppression uniquement côté serveur (OAuth),
-- modification des préférences (auto_sync, intervalle) réservée aux admins.
drop policy channel_connections_insert on public.channel_connections;
drop policy channel_connections_delete on public.channel_connections;
drop policy channel_connections_update on public.channel_connections;
create policy channel_connections_update on public.channel_connections
  for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
-- Les runs de synchronisation sont écrits par le serveur.
drop policy sync_runs_insert on public.sync_runs;
drop policy sync_runs_update on public.sync_runs;
drop policy sync_runs_delete on public.sync_runs;
drop policy sync_errors_insert on public.sync_errors;
drop policy sync_errors_update on public.sync_errors;
drop policy sync_errors_delete on public.sync_errors;
-- Connexions fournisseurs : création côté serveur uniquement.
drop policy supplier_connections_insert on public.supplier_connections;

-- -----------------------------------------------------------------------------
-- Tables sans organization_id ou à règles spécifiques
-- -----------------------------------------------------------------------------
alter table public.user_profiles enable row level security;
create policy user_profiles_select_own on public.user_profiles
  for select to authenticated using (user_id = auth.uid());
create policy user_profiles_update_own on public.user_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Les membres d'une même organisation voient le profil (nom/email) des autres membres.
create policy user_profiles_select_org_members on public.user_profiles
  for select to authenticated using (
    exists (
      select 1 from public.organization_members me
      join public.organization_members them on them.organization_id = me.organization_id
      where me.user_id = auth.uid() and them.user_id = user_profiles.user_id
    )
  );

alter table public.organizations enable row level security;
create policy organizations_select on public.organizations
  for select to authenticated using (public.is_org_member(id));
create policy organizations_update on public.organizations
  for update to authenticated using (public.is_org_admin(id)) with check (public.is_org_admin(id));
-- insert uniquement via create_organization_with_owner (security definer)

alter table public.organization_members enable row level security;
create policy organization_members_select on public.organization_members
  for select to authenticated using (public.is_org_member(organization_id));
create policy organization_members_update on public.organization_members
  for update to authenticated using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
create policy organization_members_delete on public.organization_members
  for delete to authenticated using (public.is_org_admin(organization_id) or user_id = auth.uid());

alter table public.organization_invitations enable row level security;
create policy organization_invitations_select on public.organization_invitations
  for select to authenticated using (public.is_org_admin(organization_id));
create policy organization_invitations_insert on public.organization_invitations
  for insert to authenticated with check (public.is_org_admin(organization_id));
create policy organization_invitations_delete on public.organization_invitations
  for delete to authenticated using (public.is_org_admin(organization_id));

-- Secrets et états OAuth : RLS activée, aucune policy → service_role uniquement.
alter table public.channel_connection_secrets enable row level security;
alter table public.supplier_connection_secrets enable row level security;
alter table public.oauth_states enable row level security;
revoke all on table public.channel_connection_secrets from anon, authenticated;
revoke all on table public.supplier_connection_secrets from anon, authenticated;
revoke all on table public.oauth_states from anon, authenticated;

-- Webhooks : lecture par les membres de l'organisation concernée, écriture serveur.
alter table public.webhook_events enable row level security;
create policy webhook_events_select on public.webhook_events
  for select to authenticated using (organization_id is not null and public.is_org_member(organization_id));

-- Taux de change : lecture publique authentifiée, écriture serveur.
alter table public.fx_rates enable row level security;
create policy fx_rates_select on public.fx_rates for select to authenticated using (true);

-- Les fonctions sensibles ne sont pas exposées à anon.
revoke execute on function public.create_organization_with_owner(text, text, boolean) from anon;
revoke execute on function public.accept_invitation(text) from anon;
revoke execute on function public.apply_inventory_movement(uuid, uuid, public.movement_type, integer, text, uuid, text, text, timestamptz) from anon;
revoke execute on function public.adjust_reserved_quantity(uuid, uuid, integer) from anon;
revoke execute on function public.ingest_external_order(uuid, uuid, uuid, public.channel_provider, jsonb, jsonb) from anon;
revoke execute on function public.map_listing_to_sku(uuid, uuid, text) from anon;
revoke execute on function public.apply_pending_sales_for_sku(uuid) from anon;
revoke execute on function public.receive_purchase_order_items(uuid, jsonb) from anon;
