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

export function resolveAccess(profile: AuthProfile | null, min: "editor" | "admin"): Access {
  if (!profile) {
    return "login";
  }

  if (!profile.active || ROLE_RANK[profile.role] < ROLE_RANK[min]) {
    return "forbidden";
  }

  return "ok";
}
