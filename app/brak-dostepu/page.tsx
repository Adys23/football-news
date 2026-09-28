import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton } from "@/components/admin/SignOutButton";
import { getCurrentProfile } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Brak uprawnień",
  robots: { index: false, follow: false },
};

export default async function ForbiddenPage() {
  const profile = await getCurrentProfile();

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Brak uprawnień do panelu redakcji</h1>
      <p className="mt-3 text-sm text-neutral-600">
        {profile
          ? `Konto ${profile.email} nie ma roli redaktora albo jest nieaktywne. Poproś administratora o dostęp.`
          : "Nie jesteś zalogowany."}
      </p>
      <div className="mt-6">
        {profile ? (
          <SignOutButton />
        ) : (
          <Link href="/login" className="text-sm underline">
            Przejdź do logowania
          </Link>
        )}
      </div>
    </main>
  );
}
