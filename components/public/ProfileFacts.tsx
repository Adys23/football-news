import type { ReactNode } from "react";

export interface ProfileFact {
  label: string;
  value: ReactNode;
}

/** Podstawowe dane profilu (zawodnik, klub). Puste pola pomijamy, zamiast pisac "brak". */
export function ProfileFacts({ facts }: { facts: readonly ProfileFact[] }) {
  if (facts.length === 0) {
    return null;
  }

  return (
    <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {facts.map((fact) => (
        <div key={fact.label} className="contents">
          <dt className="text-neutral-500">{fact.label}</dt>
          <dd className="font-medium break-words text-neutral-900">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
