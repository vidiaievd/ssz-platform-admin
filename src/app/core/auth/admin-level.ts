/**
 * Platform administrator levels, lowest first. A copy of the rule in `ssz-platform`
 * (`packages/contracts`: `AdminLevel`, `adminLevelAtLeast()`); the services are the source of
 * truth — the panel only uses it to hide what the server would refuse anyway.
 */
export const ADMIN_LEVELS = ['support', 'admin', 'super'] as const;

export type AdminLevel = (typeof ADMIN_LEVELS)[number];

export function isAdminLevel(value: unknown): value is AdminLevel {
  return typeof value === 'string' && (ADMIN_LEVELS as readonly string[]).includes(value);
}

/** True when `level` is `required` or above (`support < admin < super`); no level → false. */
export function adminLevelAtLeast(
  level: AdminLevel | null | undefined,
  required: AdminLevel,
): boolean {
  if (!level) return false;
  return ADMIN_LEVELS.indexOf(level) >= ADMIN_LEVELS.indexOf(required);
}
