"use client";

import { useActionState } from "react";
import { toggleSource } from "@/app/admin/zrodla/actions";
import { Button } from "@/components/ui/button";

export function SourceHealthToggle({ sourceId, active }: { sourceId: string; active: boolean }) {
  const [state, action, pending] = useActionState(toggleSource, undefined);

  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="sourceId" value={sourceId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <Button type="submit" size="sm" variant={active ? "outline" : "default"} disabled={pending}>
        {pending ? "Zapisywanie…" : active ? "Wyłącz" : "Włącz"}
      </Button>
      {state ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
