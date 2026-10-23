-- Retour arrière MANUEL de 20261023000610_draft_purchase_order_rpc.sql (M-16). Idempotent.
-- L'application mobile qui appelle cette RPC affichera alors une erreur à la création d'un
-- brouillon : ne revenir en arrière qu'avec une version de l'application antérieure.
drop function if exists public.create_draft_purchase_order(uuid, uuid, text, uuid, uuid, integer, numeric, text);
