"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/data/users";
import { resolveCoaUserText } from "@/lib/data/account-standardization";

const ResolveSchema = z.object({
  rawText: z.string().min(1).max(500),
});

/**
 * For inline account fields: map user language to standard names and surface duplicate candidates.
 */
export async function resolveCoaUserTextAction(input: z.infer<typeof ResolveSchema>) {
  const { rawText } = ResolveSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }
  return resolveCoaUserText(user.tenant.id, rawText);
}
