"use client";

import { useActionState, useState } from "react";
import { MAX_TITLE_LENGTH, MIN_TITLE_LENGTH } from "@shared/lib/title-guard.ts";
import { saveArticleMeta } from "@/app/admin/artykuly/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ArticleMetaForm({
  articleId,
  updatedAt,
  title: initialTitle,
  lead: initialLead,
}: {
  articleId: string;
  updatedAt: string;
  title: string;
  lead: string;
}) {
  const [state, action, pending] = useActionState(saveArticleMeta, undefined);
  const [title, setTitle] = useState(initialTitle);
  const [lead, setLead] = useState(initialLead);
  const titleLength = title.trim().length;
  const titleOutOfRange = titleLength < MIN_TITLE_LENGTH || titleLength > MAX_TITLE_LENGTH;

  return (
    <form action={action} className="mt-4 grid gap-4" noValidate>
      <input type="hidden" name="articleId" value={articleId} />
      <input type="hidden" name="expectedUpdatedAt" value={updatedAt} />

      <div className="grid gap-2">
        <Label htmlFor="title">Tytuł</Label>
        <Input
          id="title"
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-invalid={Boolean(state?.fieldErrors?.title)}
          aria-describedby="title-length"
        />
        <p
          id="title-length"
          className={`text-xs ${titleOutOfRange ? "font-medium text-red-700" : "text-neutral-500"}`}
        >
          {titleLength} znaków, wymagane {MIN_TITLE_LENGTH}-{MAX_TITLE_LENGTH}
        </p>
        {state?.fieldErrors?.title ? (
          <p className="text-destructive text-sm">{state.fieldErrors.title[0]}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="lead">Lead</Label>
        <textarea
          id="lead"
          name="lead"
          rows={4}
          value={lead}
          onChange={(event) => setLead(event.target.value)}
          aria-invalid={Boolean(state?.fieldErrors?.lead)}
          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive w-full rounded-lg border bg-transparent px-2.5 py-2 text-base outline-none focus-visible:ring-3 md:text-sm"
        />
        {state?.fieldErrors?.lead ? (
          <p className="text-destructive text-sm">{state.fieldErrors.lead[0]}</p>
        ) : null}
      </div>

      {state ? (
        <div
          role={state.status === "error" ? "alert" : "status"}
          className={`rounded-md border p-3 text-sm ${
            state.status === "error"
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-green-300 bg-green-50 text-green-800"
          }`}
        >
          <p className="font-medium">{state.message}</p>
          {state.issues ? (
            <ul className="mt-2 list-disc pl-5">
              {state.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Zapisywanie…" : "Zapisz tytuł i lead"}
        </Button>
      </div>
    </form>
  );
}
