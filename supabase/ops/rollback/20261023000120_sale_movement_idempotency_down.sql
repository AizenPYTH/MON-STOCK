-- Retour arrière MANUEL de 20261023000120_sale_movement_idempotency.sql (D-19).
-- À n'exécuter qu'après décision explicite. Effet : l'unicité des ventes / annulations par ligne de
-- commande ne repose de nouveau que sur le drapeau order_items.inventory_applied. Aucun mouvement
-- n'est supprimé ; seule la colonne de numérotation disparaît.
drop index if exists public.inventory_movements_order_item_cycle_uidx;
drop trigger if exists inventory_movements_reference_generation on public.inventory_movements;
drop function if exists public.inventory_movements_set_reference_generation();
alter table public.inventory_movements drop column if exists reference_generation;
