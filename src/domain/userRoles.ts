export const USER_ROLES = ["engineer", "admin"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const DEFAULT_USER_ROLE: UserRole = "engineer";

export function isUserRole(value: unknown): value is UserRole {
  return value === "admin" || value === "engineer";
}

export function normalizeUserRole(value: unknown): UserRole {
  return isUserRole(value) ? value : DEFAULT_USER_ROLE;
}
