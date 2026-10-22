-- Retour arrière MANUEL de 20261023000360_inventory_movements_sku_restrict.sql (D-21).
-- Rétablit ON DELETE CASCADE (supprimer un SKU efface de nouveau son journal de mouvements).
alter table public.inventory_movements
  drop constraint if exists inventory_movements_sku_id_fkey,
  add constraint inventory_movements_sku_id_fkey
    foreign key (sku_id) references public.skus (id) on delete cascade;
