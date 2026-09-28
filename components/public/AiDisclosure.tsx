import Link from "next/link";
import { EDITORIAL_POLICY_PATH } from "@/lib/public/paths";

/**
 * Informacja o roli AI i akceptacji redaktora (docs/architecture.md §8.1).
 * Kazdy opublikowany artykul ma approved_by - wymusza to trigger publikacji.
 */
export function AiDisclosure({ aiGenerated }: { aiGenerated: boolean }) {
  return (
    <aside
      aria-labelledby="jak-powstal-tekst"
      className="mt-10 rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700"
    >
      <h2 id="jak-powstal-tekst" className="font-semibold text-neutral-900">
        Jak powstał ten tekst
      </h2>
      <p className="mt-2">
        {aiGenerated
          ? "Tekst przygotowano z pomocą sztucznej inteligencji wyłącznie na podstawie faktów potwierdzonych w źródłach. "
          : "Tekst napisała redakcja. "}
        Przed publikacją sprawdził go i zatwierdził redaktor.
      </p>
      <p className="mt-2">
        <Link href={EDITORIAL_POLICY_PATH} className="font-medium underline">
          Zasady redakcyjne
        </Link>
      </p>
    </aside>
  );
}
