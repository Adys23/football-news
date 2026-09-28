import { describe, expect, it } from "vitest";
import { loginSchema } from "@/lib/auth/login-schema";

describe("loginSchema", () => {
  it("normalizuje e-mail i przyjmuje poprawne dane", () => {
    const result = loginSchema.safeParse({
      email: "  Edytor@Local.Test ",
      password: "haslo",
      next: "/admin",
    });

    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("edytor@local.test");
  });

  it.each([
    ["pusty e-mail", { email: " ", password: "haslo" }, "email", "Podaj adres e-mail."],
    [
      "zly format",
      { email: "nie-email", password: "haslo" },
      "email",
      "Nieprawidłowy adres e-mail.",
    ],
    ["puste haslo", { email: "a@b.pl", password: "" }, "password", "Podaj hasło."],
  ])("%s daje polski komunikat", (_label, input, field, message) => {
    const result = loginSchema.safeParse(input);

    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({ path: [field], message }),
    );
  });
});
