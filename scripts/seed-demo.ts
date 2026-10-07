/**
 * Crée une organisation DEMO (données fictives) pour un utilisateur existant.
 * Usage : npm run seed:demo -- --user <uuid auth.users> | --email <email>
 * Requiert .env.local avec NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { createAdminSupabaseClient } from "../src/lib/supabase/admin";
import { createDemoOrganizationForUser, seedDemoData } from "../src/features/demo/seed-data";

async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const admin = createAdminSupabaseClient();
  let userId = get("--user");
  const email = get("--email");
  if (!userId && email) {
    const { data } = await admin.from("user_profiles").select("user_id").eq("email", email.toLowerCase()).maybeSingle();
    userId = data?.user_id;
  }
  if (!userId) {
    console.error("Usage : npm run seed:demo -- --user <uuid> | --email <email>");
    process.exit(1);
  }
  const orgId = await createDemoOrganizationForUser(admin, userId);
  console.log(`[DEMO] organisation créée : ${orgId}`);
  await seedDemoData(orgId);
  console.log("[DEMO] données fictives générées ✓");
}

main().catch((e) => {
  console.error("[DEMO] échec :", e instanceof Error ? e.message : e);
  process.exit(1);
});
