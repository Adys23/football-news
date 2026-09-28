import { describe, expect, it } from "vitest";
import { proxyRedirect, safeNextPath } from "@/lib/auth/redirects";

describe("safeNextPath", () => {
  it.each(["/admin", "/admin/historie", "/admin/artykuly/1?tab=fakty"])(
    "przepuszcza %s",
    (next) => {
      expect(safeNextPath(next)).toBe(next);
    },
  );

  it.each([
    ["//evil.com", "//evil.com"],
    ["adres absolutny", "https://evil.com/admin"],
    ["backslash", "/admin\..\evil"],
    ["inna sciezka", "/login"],
    ["prefiks bez ukosnika", "/administrator"],
    ["pusty", ""],
    ["undefined", undefined],
    ["liczba", 42],
  ])("%s wraca do /admin", (_label, next) => {
    expect(safeNextPath(next)).toBe("/admin");
  });
});

describe("proxyRedirect", () => {
  it("panel bez sesji kieruje do logowania z parametrem next", () => {
    expect(proxyRedirect("/admin", false)).toBe("/login?next=%2Fadmin");
    expect(proxyRedirect("/admin/historie", false)).toBe("/login?next=%2Fadmin%2Fhistorie");
  });

  it("panel z sesja nie przekierowuje", () => {
    expect(proxyRedirect("/admin/historie", true)).toBeNull();
  });

  it("logowanie nigdy nie przekierowuje, niezaleznie od sesji", () => {
    expect(proxyRedirect("/login", true)).toBeNull();
    expect(proxyRedirect("/login", false)).toBeNull();
  });
});
