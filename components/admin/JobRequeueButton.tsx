"use client";

import { useActionState } from "react";
import { requeueJob } from "@/app/admin/joby/actions";
import { Button } from "@/components/ui/button";

export function JobRequeueButton({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState(requeueJob, undefined);

  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Ponawianie…" : "Ponów"}
      </Button>
      {state ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
