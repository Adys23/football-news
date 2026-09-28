"use client";

import { useActionState } from "react";
import { signIn } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <form action={action} className="grid gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="grid gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          // Base UI nie przyjmuje zmiany defaultValue po montazu, wiec po bledzie pole montujemy od nowa.
          key={state?.email ?? ""}
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={state?.email ?? ""}
          aria-invalid={Boolean(state?.fieldErrors?.email)}
          required
        />
        {state?.fieldErrors?.email ? (
          <p className="text-destructive text-sm">{state.fieldErrors.email[0]}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Hasło</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(state?.fieldErrors?.password)}
          required
        />
        {state?.fieldErrors?.password ? (
          <p className="text-destructive text-sm">{state.fieldErrors.password[0]}</p>
        ) : null}
      </div>

      {state?.message ? (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Logowanie…" : "Zaloguj"}
      </Button>
    </form>
  );
}
