import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton } from "@/components/admin/SignOutButton";
import { getCurrentProfile } from "@/lib/auth/dal";
import { ADMIN_HOME, parseRequiredRole } from "@/lib/auth/redirects";
import { forbiddenReason, type ForbiddenReason } from "@/lib/auth/roles";

export const metadata: Metadata = {
  title: "Brak uprawnień",
  robots: { index: false, follow: false },
};

const HEADINGS: Record<ForbiddenReason, string> = {
  anonymous: "Brak uprawnień do panelu redakcji",
  inactive: "Brak uprawnień do panelu redakcji",
  admin_only: "Brak uprawnień do tej strony",
  no_editor_role: "Brak uprawnień do panelu redakcji",
  has_access: "Masz dostęp do panelu redakcji",
};

function message(reason: ForbiddenReason, email: string | null): string {
  switch (reason) {
    case "anonymous":
      return "Nie jesteś zalogowany.";
    case "inactive":
      return `Konto ${email} jest nieaktywne. Poproś administratora o przywrócenie dostępu.`;
    case "admin_only":
      return "Ta strona jest dostępna tylko dla administratora.";
    case "no_editor_role":
      return `Konto ${email} nie ma roli redaktora. Poproś administratora o dostęp.`;
    case "has_access":
      return `Konto ${email} ma już uprawnienia do tej części panelu.`;
  }
}

export default async function ForbiddenPage({
  searchParams,
}: {
  searchParams: Promise<{ rola?: string | string[] }>;
}) {
  const { rola } = await searchParams;
  const profile = await getCurrentProfile();
  const reason = forbiddenReason(profile, parseRequiredRole(rola));

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{HEADINGS[reason]}</h1>
      <p className="mt-3 text-sm text-neutral-600">{message(reason, profile?.email ?? null)}</p>
      <div className="mt-6 flex items-center gap-4">
        {reason === "admin_only" || reason === "has_access" ? (
          <Link href={ADMIN_HOME} className="text-sm underline">
            Wróć do panelu
          </Link>
        ) : null}
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
