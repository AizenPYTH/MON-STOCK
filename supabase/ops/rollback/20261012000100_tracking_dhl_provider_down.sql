-- Retour arrière MANUEL de 20261012000100_tracking_dhl_provider.sql.
-- Échoue volontairement si des colis ont déjà été suivis via DHL : les repasser d'abord sur une
-- autre source (update public.tracked_parcels set provider = null where provider = 'dhl';).
alter table public.tracked_parcels drop constraint if exists tracked_parcels_provider_check;
alter table public.tracked_parcels
  add constraint tracked_parcels_provider_check check (provider is null or provider in ('laposte', 'ship24'));
