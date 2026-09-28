"use server";

import { revalidatePath } from "next/cache";
import { requeueJobInputSchema, type RequeueState } from "@/lib/admin/ops";
import { requeueDeadJob } from "@/lib/admin/ops-data";
import { requireRole } from "@/lib/auth/dal";

export async function requeueJob(_prev: RequeueState, formData: FormData): Promise<RequeueState> {
  await requireRole("admin");

  const parsed = requeueJobInputSchema.safeParse({ jobId: formData.get("jobId") });
  if (!parsed.success) {
    return { error: "Nieprawidłowy identyfikator joba." };
  }

  try {
    // false znaczy, ze job przestal byc martwy (ponowil go ktos inny) - wystarczy odswiezyc liste.
    await requeueDeadJob(parsed.data.jobId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Nie udało się ponowić joba." };
  }

  revalidatePath("/admin/joby");
  return undefined;
}
