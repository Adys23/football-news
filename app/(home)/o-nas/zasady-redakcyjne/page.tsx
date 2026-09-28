import type { Metadata } from "next";
import Link from "next/link";
import { ABOUT_PATH, EDITORIAL_POLICY_PATH } from "@/lib/public/paths";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Zasady redakcyjne",
  description: `Jak powstają teksty w serwisie ${SITE.name}: rola sztucznej inteligencji, akceptacja redaktora, źródła, korekty i zasady tytułów.`,
  alternates: { canonical: EDITORIAL_POLICY_PATH },
};

// Tresc odpowiada zasadom z AGENTS.md §4 i docs/architecture.md; zmiana zasad wymaga zmiany tej strony.
const SECTIONS: readonly { id: string; title: string; paragraphs: readonly string[] }[] = [
  {
    id: "rola-ai",
    title: "Rola sztucznej inteligencji",
    paragraphs: [
      "Korzystamy z modeli językowych jako narzędzia pracy redakcji, nie jako autora. Model najpierw wyciąga z materiałów źródłowych pojedyncze fakty, potem fakty są oceniane pod kątem wiarygodności i zgodności między źródłami, a dopiero na końcu model pisze tekst wyłącznie z zatwierdzonych faktów. Model piszący tekst nie dostaje surowych materiałów źródłowych.",
      "Każdy tekst przygotowany z pomocą sztucznej inteligencji jest tak oznaczony pod artykułem. Nie generujemy zdjęć zawodników ani innych osób - używamy wyłącznie zdjęć z opisaną licencją.",
    ],
  },
  {
    id: "akceptacja-redaktora",
    title: "Akceptacja redaktora",
    paragraphs: [
      "Żaden tekst nie trafia na stronę bez akceptacji redaktora. Zasada jest wymuszona technicznie: system nie pozwala opublikować artykułu, którego nie zatwierdził człowiek z redakcji. Tekstu, w którym automatyczna kontrola wykryła twierdzenie niepotwierdzone zebranymi faktami, nie da się opublikować.",
      "Za publikację każdego artykułu odpowiada redaktor, który go zatwierdził. Gdy tekst ma autora z redakcji, jest on podpisany pod artykułem imieniem i nazwiskiem.",
    ],
  },
  {
    id: "zrodla",
    title: "Źródła",
    paragraphs: [
      "Korzystamy z kanałów RSS i feedów udostępnianych przez same źródła: kluby, ligi, federacje i media. Każde źródło ma ocenę wiarygodności, a oficjalne potwierdzenie klubu waży więcej niż doniesienie agregatora.",
      "Nie kopiujemy cudzych tekstów. Cytat pojawia się tylko jako krótki fragment z podaniem autora.",
    ],
  },
  {
    id: "korekty",
    title: "Aktualizacje i korekty",
    paragraphs: [
      "Jedna historia to jeden artykuł. Nowe informacje dopisujemy do istniejącego tekstu jako aktualizację z godziną, zamiast publikować kolejny tekst o tym samym.",
      "Błędów nie usuwamy po cichu. Jeśli nieprawdziwa informacja była widoczna na stronie, publikujemy przy artykule jawne sprostowanie. Błąd można zgłosić redakcji - dane kontaktowe są na stronie „O nas”.",
    ],
  },
  {
    id: "tytuly",
    title: "Bez clickbaitu",
    paragraphs: [
      "Tytuł mówi, co się stało. Nie używamy wykrzykników, pytań retorycznych, przesady ani ukrywania kluczowej informacji. Oprócz oceny jakości tytuły sprawdza automatycznie lista zakazanych sformułowań, a ostatnie słowo należy do redaktora.",
    ],
  },
];

export default function EditorialPolicyPage() {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Zasady redakcyjne</h1>
      <p className="mt-4 text-lg leading-relaxed text-neutral-700">
        {SITE.name} publikuje wiadomości piłkarskie oparte na faktach z wielu źródeł. Poniżej
        opisujemy, jak powstaje każdy tekst i jakich zasad pilnujemy.
      </p>

      {SECTIONS.map((section) => (
        <section key={section.id} aria-labelledby={section.id} className="mt-10">
          <h2 id={section.id} className="text-xl font-semibold tracking-tight">
            {section.title}
          </h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="mt-3 leading-relaxed text-neutral-700">
              {paragraph}
            </p>
          ))}
        </section>
      ))}

      <p className="mt-10 text-sm text-neutral-600">
        Informacje o wydawcy i kontakt z redakcją:{" "}
        <Link href={ABOUT_PATH} className="font-medium underline">
          O nas
        </Link>
        .
      </p>
    </article>
  );
}
