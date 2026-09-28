"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/auth/login-schema";
import { LOGIN_PATH, safeNextPath } from "@/lib/auth/redirects";

export type LoginState = {
  fieldErrors?: { email?: string[]; password?: string[] };
  message?: string;
  email?: string;
};

function formString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

export async function signIn(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formString(formData, "email") ?? "",
    password: formString(formData, "password") ?? "",
    next: formString(formData, "next"),
  });

  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      fieldErrors: { email: fieldErrors.email, password: fieldErrors.password },
      email: formString(formData, "email"),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error?.code === "invalid_credentials") {
    return { message: "Nieprawidłowy e-mail lub hasło.", email: parsed.data.email };
  }
  // Awarie Auth nie moga udawac zlego hasla, bo ukrylyby problem z usluga.
  if (error) {
    throw new Error(`Logowanie nie powiodlo sie: ${error.message}`);
  }

  redirect(safeNextPath(parsed.data.next));
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(LOGIN_PATH);
}
