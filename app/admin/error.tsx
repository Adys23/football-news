"use client";

import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Nie udało się wczytać panelu</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Spróbuj ponownie za chwilę. Jeśli błąd się powtarza, zgłoś go administratorowi.
        {error.digest ? ` Identyfikator błędu: ${error.digest}.` : ""}
      </p>
      <Button className="mt-6" onClick={() => retry()}>
        Spróbuj ponownie
      </Button>
    </main>
  );
}
