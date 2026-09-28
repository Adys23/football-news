import type { Metadata } from "next";
import Link from "next/link";
import { ABOUT_PATH, EDITORIAL_POLICY_PATH } from "@/lib/public/paths";
import { PUBLISHER, isPublisherPlaceholder } from "@/lib/public/publisher";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "O nas",
  description: `Wydawca serwisu ${SITE.name}, redakcja i kontakt, w tym zgłaszanie korekt.`,
  alternates: { canonical: ABOUT_PATH },
};

function EmailValue({ value }: { value: string }) {
  if (isPublisherPlaceholder(value)) {
    return <>{value}</>;
  }
  return (
    <a href={`mailto:${value}`} className="underline">
      {value}
    </a>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">O nas</h1>
      <p className="mt-4 text-lg leading-relaxed text-neutral-700">{SITE.description}</p>
      <p className="mt-4 leading-relaxed text-neutral-700">
        Jak pracujemy i jak korzystamy ze sztucznej inteligencji, opisujemy w{" "}
        <Link href={EDITORIAL_POLICY_PATH} className="font-medium underline">
          zasadach redakcyjnych
        </Link>
        .
      </p>

      <section aria-labelledby="wydawca" className="mt-10">
        <h2 id="wydawca" className="text-xl font-semibold tracking-tight">
          Wydawca
        </h2>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-neutral-500">Nazwa</dt>
          <dd className="break-words text-neutral-900">{PUBLISHER.legalName}</dd>
          <dt className="text-neutral-500">Adres</dt>
          <dd className="break-words text-neutral-900">{PUBLISHER.address}</dd>
          <dt className="text-neutral-500">Rejestr</dt>
          <dd className="break-words text-neutral-900">{PUBLISHER.registry}</dd>
          <dt className="text-neutral-500">Redaktor naczelny</dt>
          <dd className="break-words text-neutral-900">{PUBLISHER.editorInChief}</dd>
        </dl>
      </section>

      <section aria-labelledby="kontakt" className="mt-10">
        <h2 id="kontakt" className="text-xl font-semibold tracking-tight">
          Kontakt
        </h2>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-neutral-500">Redakcja</dt>
          <dd className="break-words text-neutral-900">
            <EmailValue value={PUBLISHER.contactEmail} />
          </dd>
          <dt className="text-neutral-500">Zgłoszenia korekt</dt>
          <dd className="break-words text-neutral-900">
            <EmailValue value={PUBLISHER.correctionsEmail} />
          </dd>
        </dl>
      </section>
    </div>
  );
}
