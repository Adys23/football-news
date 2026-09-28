import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { getCurrentProfile } from "@/lib/auth/dal";
import { safeNextPath } from "@/lib/auth/redirects";
import { resolveAccess } from "@/lib/auth/roles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Logowanie",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;

  if (resolveAccess(await getCurrentProfile(), "editor") === "ok") {
    redirect(safeNextPath(nextPath));
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 items-center px-6 py-16">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Panel redakcyjny</CardTitle>
          <CardDescription>Zaloguj się kontem redakcji.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={nextPath} />
        </CardContent>
      </Card>
    </main>
  );
}
