import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Nie znaleziono strony",
  robots: { index: false, follow: true },
};

export default function SiteNotFound() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight">Nie znaleziono strony</h1>
      <p className="mt-3 text-neutral-600">
        Strona nie istnieje albo artykuł nie został jeszcze opublikowany.
      </p>
      <p className="mt-6">
        <Link href="/" className="font-medium underline">
          Przejdź do strony głównej
        </Link>
      </p>
    </div>
  );
}
