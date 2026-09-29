import { describe, expect, it } from "vitest";
import { forbiddenReason, resolveAccess, type AuthProfile, type Role } from "@/lib/auth/roles";

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

describe("forbiddenReason", () => {
  it("bez profilu: niezalogowany", () => {
    expect(forbiddenReason(null, "admin")).toBe("anonymous");
  });

  it("nieaktywne konto wygrywa z kazda rola", () => {
    expect(forbiddenReason(profile("admin", false), "admin")).toBe("inactive");
    expect(forbiddenReason(profile("editor", false), null)).toBe("inactive");
  });

  it("redaktor na stronie admina dostaje komunikat o stronie tylko dla admina", () => {
    expect(forbiddenReason(profile("editor"), "admin")).toBe("admin_only");
  });

  it.each([
    ["admin", "admin"],
    ["admin", "editor"],
    ["admin", null],
    ["editor", "editor"],
    ["editor", null],
  ] as const)("%s przy roli %s: ma dostep, bez falszywego komunikatu", (role, required) => {
    expect(forbiddenReason(profile(role), required)).toBe("has_access");
  });

  it.each([
    ["viewer", "admin"],
    ["viewer", "editor"],
    ["viewer", null],
  ] as const)("%s przy roli %s: brak roli redaktora", (role, required) => {
    expect(forbiddenReason(profile(role), required)).toBe("no_editor_role");
  });
});
