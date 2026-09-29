import type { Database } from "@contracts/index.ts";

export type Role = Database["public"]["Enums"]["user_role"];

export type AuthProfile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "email" | "display_name" | "role" | "active"
>;

export type Access = "ok" | "login" | "forbidden";

export const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
};

/** Powod odmowy dostepu pokazywany na /brak-dostepu. */
export type ForbiddenReason =
  "anonymous" | "inactive" | "admin_only" | "no_editor_role" | "has_access";

export function forbiddenReason(
  profile: AuthProfile | null,
  required: "editor" | "admin" | null,
): ForbiddenReason {
  if (!profile) {
    return "anonymous";
  }
  if (!profile.active) {
    return "inactive";
  }
  // Strona bywa otwierana z historii przegladarki albo po nadaniu roli.
  if (ROLE_RANK[profile.role] >= ROLE_RANK[required ?? "editor"]) {
    return "has_access";
  }
  if (required === "admin" && ROLE_RANK[profile.role] >= ROLE_RANK.editor) {
    return "admin_only";
  }

  return "no_editor_role";
}

export function resolveAccess(profile: AuthProfile | null, min: "editor" | "admin"): Access {
  if (!profile) {
    return "login";
  }

  if (!profile.active || ROLE_RANK[profile.role] < ROLE_RANK[min]) {
    return "forbidden";
  }

  return "ok";
}
