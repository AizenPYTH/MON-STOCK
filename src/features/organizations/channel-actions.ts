"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContextForAction } from "@/features/auth/dal";
import { fail, ok, type ActionResult } from "@/lib/result";
import { fromPostgrestError, toUserMessage } from "@/lib/errors";

const pct = z.union([z.literal(""), z.coerce.number().min(0).max(100)]);
const money = z.union([z.literal(""), z.coerce.number().min(0)]);

export async function updateChannelFeesAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContextForAction({ admin: true });
    const ids = formData.getAll("channel_id").map(String);
    for (const id of ids) {
      if (!z.string().uuid().safeParse(id).success) return fail("Identifiant de canal invalide.");
      const fee = pct.safeParse(formData.get(`fee_percent:${id}`) ?? "");
      const pay = pct.safeParse(formData.get(`payment_fee_percent:${id}`) ?? "");
      const fixed = money.safeParse(formData.get(`payment_fee_fixed:${id}`) ?? "");
      if (!fee.success || !pay.success || !fixed.success) return fail("Les frais doivent être des nombres positifs (pourcentages entre 0 et 100).");
      const { error } = await ctx.supabase
        .from("sales_channels")
        .update({
          fee_percent: fee.data === "" ? null : fee.data,
          payment_fee_percent: pay.data === "" ? null : pay.data,
          payment_fee_fixed: fixed.data === "" ? null : fixed.data,
        })
        .eq("id", id)
        .eq("organization_id", ctx.organization.id);
      if (error) return fail(toUserMessage(fromPostgrestError(error)));
    }
    revalidatePath("/settings/organization");
    revalidatePath("/margins");
    return ok(undefined);
  } catch (e) {
    return fail(toUserMessage(e));
  }
}
