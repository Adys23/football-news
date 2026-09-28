import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { SignOutButton } from "@/components/admin/SignOutButton";
import { requireRole } from "@/lib/auth/dal";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("editor");

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-6 px-6 py-3 text-sm">
          <nav className="flex gap-4">
            <Link href="/admin" className="font-medium">
              Panel
            </Link>
            <Link href="/admin/historie">Historie</Link>
            {profile.role === "admin" ? <Link href="/admin/joby">Joby</Link> : null}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-neutral-600">
              {profile.email} · {profile.role}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
