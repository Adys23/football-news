import { describe, expect, it } from "vitest";
import {
  forbiddenPath,
  parseRequiredRole,
  proxyRedirect,
  safeNextPath,
} from "@/lib/auth/redirects";

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

describe("forbiddenPath", () => {
  it("dopisuje wymagana role do /brak-dostepu", () => {
    expect(forbiddenPath("admin")).toBe("/brak-dostepu?rola=admin");
    expect(forbiddenPath("editor")).toBe("/brak-dostepu?rola=editor");
  });

  it("proxy nie przekierowuje strony braku uprawnien", () => {
    expect(proxyRedirect("/brak-dostepu", false)).toBeNull();
  });
});

describe("parseRequiredRole", () => {
  it.each(["editor", "admin"] as const)("przyjmuje %s", (role) => {
    expect(parseRequiredRole(role)).toBe(role);
  });

  it.each([
    ["inna rola", "viewer"],
    ["wielkie litery", "ADMIN"],
    ["spacje", " admin "],
    ["html", "<script>alert(1)</script>"],
    ["tablica", ["admin", "editor"]],
    ["pusty", ""],
    ["undefined", undefined],
    ["null", null],
  ])("odrzuca: %s", (_name, value) => {
    expect(parseRequiredRole(value)).toBeNull();
  });
});
