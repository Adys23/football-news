"use server";

import { revalidatePath } from "next/cache";
import { toggleSourceInputSchema, type ToggleSourceState } from "@/lib/admin/ops";
import { setSourceActive } from "@/lib/admin/ops-data";
import { requireRole } from "@/lib/auth/dal";

export async function toggleSource(
  _prev: ToggleSourceState,
  formData: FormData,
): Promise<ToggleSourceState> {
  await requireRole("admin");

  const parsed = toggleSourceInputSchema.safeParse({
    sourceId: formData.get("sourceId"),
    active: formData.get("active"),
  });
  if (!parsed.success) {
    return { error: "Nieprawidłowe dane formularza." };
  }

  let changed: boolean;
  try {
    changed = await setSourceActive(parsed.data.sourceId, parsed.data.active);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Nie udało się zmienić źródła." };
  }

  revalidatePath("/admin/zrodla");
  return changed ? undefined : { error: "Źródło miało już ten stan - lista została odświeżona." };
}
