-- Retour arrière MANUEL de 20261023000510_advisor_messages_user_role_only.sql.
-- Rétablit la politique d'insertion d'origine (tout rôle de message, dont « assistant » et « notice ») :
-- ROUVRE le constat S-10 (texte arbitraire lisible par la synthèse vocale). À éviter.
drop policy if exists advisor_messages_insert on public.advisor_messages;
create policy advisor_messages_insert on public.advisor_messages
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and public.is_org_member(organization_id)
    and exists (select 1 from public.advisor_conversations c where c.id = conversation_id and c.user_id = (select auth.uid()) and c.organization_id = advisor_messages.organization_id)
  );
