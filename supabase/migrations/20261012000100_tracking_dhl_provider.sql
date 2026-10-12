-- Suivi de colis : ajoute l'API officielle gratuite DHL (« Shipment Tracking - Unified ») aux
-- sources autorisées de tracked_parcels.provider. Additif : aucune donnée n'est modifiée, la
-- contrainte est seulement élargie ('laposte', 'ship24' → 'laposte', 'ship24', 'dhl').
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'public.tracked_parcels'::regclass and con.contype = 'c' and att.attname = 'provider'
  loop
    execute format('alter table public.tracked_parcels %s constraint %I', 'drop', c.conname);
  end loop;
end
$$;

alter table public.tracked_parcels
  add constraint tracked_parcels_provider_check check (provider is null or provider in ('laposte', 'ship24', 'dhl'));
