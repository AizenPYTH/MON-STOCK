"use server";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/features/auth/dal";
import { fail, type ActionResult } from "@/lib/result";
import { fromPostgrestError, toUserMessage } from "@/lib/errors";
import { seedDemoOrganization } from "@/features/demo/seed";
import { createLogger } from "@/lib/logger";

const log = createLogger("DEMO");

/** Crée une organisation DEMO séparée (is_demo = true) et la remplit de données fictives. */
export async function createDemoOrganizationAction(_prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Connexion requise.");
  const supabase = await createServerSupabaseClient();
  const slug = `demo-${Math.random().toString(36).slice(2, 8)}`;
  const { data: orgId, error } = await supabase.rpc("create_organization_with_owner", { p_name: "Démonstration (données fictives)", p_slug: slug, p_is_demo: true });
  if (error || !orgId) return fail(toUserMessage(fromPostgrestError(error ?? { message: "Création impossible" })));
  try {
    await seedDemoOrganization(orgId);
  } catch (e) {
    log.error("demo seed failed", { orgId, error: toUserMessage(e) });
    return fail(`L'organisation de démonstration a été créée mais le remplissage a échoué : ${toUserMessage(e)}`);
  }
  redirect("/dashboard");
}
