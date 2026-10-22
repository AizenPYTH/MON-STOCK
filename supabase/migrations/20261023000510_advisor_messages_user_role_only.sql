-- =============================================================================
-- MON STOCK — migration 20261023000510 : un client n'insère que ses QUESTIONS (audit S-10, S-09).
--
-- Avant : la politique advisor_messages_insert laissait un membre insérer des messages de rôle
-- « assistant » ou « notice » dans ses conversations (texte arbitraire ensuite lu par la synthèse
-- vocale, hors quota ; fausses « notes de l'application » renvoyées au modèle).
-- Après : role = 'user' obligatoire pour une insertion sous la session de l'utilisateur ; les réponses
-- du conseiller et les notes de l'application sont écrites par le serveur (service_role), après
-- vérification de la propriété de la conversation.
--
-- Contrôle avant production (fait) : ni le web (src/features/advisor/**) ni l'application mobile
-- (apps/mobile/src/data/advisor.ts) n'insèrent dans advisor_messages ; seule l'Edge Function écrit.
-- L'Edge Function contenant ce changement (réponses via service_role) doit être déployée AVANT ou
-- EN MÊME TEMPS que cette migration, sinon les réponses ne seraient plus enregistrées.
-- auth.uid() est écrit (select auth.uid()) : évalué une fois par requête (D-15, cf. 20261023000310).
-- Retour arrière : supabase/ops/rollback/20261023000510_advisor_messages_user_role_only_down.sql
-- =============================================================================

drop policy if exists advisor_messages_insert on public.advisor_messages;
create policy advisor_messages_insert on public.advisor_messages
  for insert to authenticated with check (
    role = 'user'
    and jsonb_array_length(cards) = 0
    and user_id = (select auth.uid())
    and public.is_org_member(organization_id)
    and exists (select 1 from public.advisor_conversations c where c.id = conversation_id and c.user_id = (select auth.uid()) and c.organization_id = advisor_messages.organization_id)
  );
