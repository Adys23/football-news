import { describe, expect, it } from "vitest";
import { resolveAccess, type AuthProfile, type Role } from "@/lib/auth/roles";

function profile(role: Role, active = true): AuthProfile {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    email: "test@local.test",
    display_name: null,
    role,
    active,
  };
}

describe("resolveAccess", () => {
  it("bez profilu kieruje do logowania", () => {
    expect(resolveAccess(null, "editor")).toBe("login");
  });

  it.each([
    ["viewer", "editor", "forbidden"],
    ["editor", "editor", "ok"],
    ["admin", "editor", "ok"],
    ["viewer", "admin", "forbidden"],
    ["editor", "admin", "forbidden"],
    ["admin", "admin", "ok"],
  ] as const)("rola %s przy wymaganej %s daje %s", (role, min, expected) => {
    expect(resolveAccess(profile(role), min)).toBe(expected);
  });

  it("nieaktywne konto nie ma dostepu niezaleznie od roli", () => {
    expect(resolveAccess(profile("admin", false), "editor")).toBe("forbidden");
  });
});
