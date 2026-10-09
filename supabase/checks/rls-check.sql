-- Vérification RLS de bout en bout sur un projet Supabase (TEST) : 2 utilisateurs, 2 organisations,
-- lecture seule, anonyme. Se termine TOUJOURS par une exception : tout est annulé, rien ne reste.
-- Résultat attendu : « RLS_CHECK ok=14 ko=0 ». À exécuter dans l'éditeur SQL du projet (jamais en production).
do $$
declare
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  oa uuid; ob uuid; sku_a uuid; n int; res jsonb;
  out text := '';
  procedure_ok boolean;
  ok int := 0; ko int := 0;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (ua, 'rls-check-a-' || substr(ua::text, 1, 8) || '@example.invalid', '{"full_name":"RLS A"}'),
    (ub, 'rls-check-b-' || substr(ub::text, 1, 8) || '@example.invalid', '{"full_name":"RLS B"}');
  select count(*) into n from public.user_profiles where user_id in (ua, ub);
  if n = 2 then ok := ok + 1; out := out || ' [OK] profils créés par le trigger auth'; else ko := ko + 1; out := out || ' [KO] profils auth=' || n; end if;

  -- Utilisateur A : son organisation et un SKU (stock 5)
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  execute 'set local role authenticated';
  oa := public.create_organization_with_owner('RLS A', 'rls-a-' || substr(ua::text, 1, 8), false);
  res := public.create_sku(p_organization_id => oa, p_variant => '{"name":"Standard","condition":"new","attributes":{}}'::jsonb, p_sku => '{"code":"RLS-A-1","currency":"EUR","cost_price":100,"sale_price":150}'::jsonb, p_product => '{"name":"Produit RLS A"}'::jsonb, p_initial_quantity => 5);
  sku_a := (res->>'sku_id')::uuid;
  select count(*) into n from public.v_stock_overview where organization_id = oa;
  if n = 1 then ok := ok + 1; out := out || ' [OK] A lit son stock'; else ko := ko + 1; out := out || ' [KO] A lit son stock=' || n; end if;
  begin
    perform public.apply_inventory_movement(p_organization_id => oa, p_sku_id => sku_a, p_type => 'adjustment', p_quantity => -10, p_reference_type => 'manual', p_channel => 'manual');
    ko := ko + 1; out := out || ' [KO] stock négatif accepté';
  exception when others then ok := ok + 1; out := out || ' [OK] stock négatif refusé (' || left(sqlerrm, 40) || ')'; end;
  perform public.apply_inventory_movement(p_organization_id => oa, p_sku_id => sku_a, p_type => 'adjustment', p_quantity => 2, p_reference_type => 'manual', p_channel => 'manual');
  select quantity_on_hand into n from public.v_stock_overview where sku_id = sku_a;
  if n = 7 then ok := ok + 1; out := out || ' [OK] mouvement +2 → 7'; else ko := ko + 1; out := out || ' [KO] stock après +2=' || n; end if;
  execute 'reset role';

  -- Utilisateur B (autre organisation)
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ub::text, true);
  execute 'set local role authenticated';
  ob := public.create_organization_with_owner('RLS B', 'rls-b-' || substr(ub::text, 1, 8), false);
  select count(*) into n from public.organizations where id = oa;
  if n = 0 then ok := ok + 1; out := out || ' [OK] B ne voit pas l''organisation A'; else ko := ko + 1; out := out || ' [KO] B voit org A'; end if;
  select (select count(*) from public.products where organization_id = oa) + (select count(*) from public.skus where organization_id = oa) + (select count(*) from public.inventory_movements where organization_id = oa) + (select count(*) from public.v_stock_overview where organization_id = oa) + (select count(*) from public.organization_members where organization_id = oa) into n;
  if n = 0 then ok := ok + 1; out := out || ' [OK] B ne lit aucune donnée de A (produits, SKU, mouvements, vue stock, membres)'; else ko := ko + 1; out := out || ' [KO] B lit ' || n || ' lignes de A'; end if;
  begin
    perform public.apply_inventory_movement(p_organization_id => oa, p_sku_id => sku_a, p_type => 'adjustment', p_quantity => -1, p_reference_type => 'manual', p_channel => 'manual');
    ko := ko + 1; out := out || ' [KO] B modifie le stock de A';
  exception when others then ok := ok + 1; out := out || ' [OK] B ne peut pas modifier le stock de A'; end;
  begin
    insert into public.products (organization_id, name) values (oa, 'Intrusion');
    ko := ko + 1; out := out || ' [KO] B insère dans A';
  exception when others then ok := ok + 1; out := out || ' [OK] B ne peut pas insérer dans A'; end;
  update public.skus set cost_price = 1 where id = sku_a;
  get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; out := out || ' [OK] B ne peut pas modifier un SKU de A'; else ko := ko + 1; out := out || ' [KO] B a modifié ' || n || ' SKU de A'; end if;
  begin
    insert into public.purchase_orders (organization_id, supplier_id, currency, status) select oa, id, 'EUR', 'draft' from public.suppliers limit 1;
    insert into public.orders (organization_id, provider, external_order_id, status) values (ob, 'manual', 'FAKE-1', 'paid');
    ko := ko + 1; out := out || ' [KO] B a inventé une commande';
  exception when others then ok := ok + 1; out := out || ' [OK] commandes de vente réservées au serveur'; end;
  execute 'reset role';

  -- B devient « lecture seule » dans A : lecture oui, écriture non
  insert into public.organization_members (organization_id, user_id, role) values (oa, ub, 'viewer');
  execute 'set local role authenticated';
  select count(*) into n from public.v_stock_overview where organization_id = oa;
  if n = 1 then ok := ok + 1; out := out || ' [OK] lecture seule : lit le stock de A'; else ko := ko + 1; out := out || ' [KO] viewer lit=' || n; end if;
  begin
    perform public.apply_inventory_movement(p_organization_id => oa, p_sku_id => sku_a, p_type => 'adjustment', p_quantity => 1, p_reference_type => 'manual', p_channel => 'manual');
    ko := ko + 1; out := out || ' [KO] lecture seule écrit';
  exception when others then ok := ok + 1; out := out || ' [OK] lecture seule : écriture refusée'; end;
  execute 'reset role';

  -- Anonyme : rien
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  begin
    select count(*) into n from public.organizations;
    if n = 0 then ok := ok + 1; out := out || ' [OK] anonyme : 0 ligne'; else ko := ko + 1; out := out || ' [KO] anonyme lit ' || n; end if;
  exception when others then ok := ok + 1; out := out || ' [OK] anonyme : accès refusé'; end;
  begin
    perform public.create_organization_with_owner('Anon', 'anon-x', false);
    ko := ko + 1; out := out || ' [KO] anonyme crée une organisation';
  exception when others then ok := ok + 1; out := out || ' [OK] anonyme : fonctions refusées'; end;
  execute 'reset role';

  -- Toujours annulé : rien ne reste en base.
  raise exception 'RLS_CHECK ok=% ko=% |%', ok, ko, out;
end $$;
