const DEFAULT_NEXT_DIST_DIR = ".next";

/**
 * Launcher builds must use a local, basename-only directory so a test-owned
 * Next process cannot contend with another SafeAnes checkout's `.next` lock.
 * The normal unset value remains `.next` for the regular dev/build workflow.
 */
export const SAFE_ANES_DIST_DIR_PATTERN = /^\.next-safeanes-[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
export const SAFE_ANES_TSCONFIG_PATH_PATTERN = /^\.tsconfig-safeanes-launcher-[A-Za-z0-9][A-Za-z0-9_-]{0,31}\.json$/;

export function resolveSafeAnesDistDir(value: string | undefined): string {
  const configured = value?.trim();
  if (!configured) return DEFAULT_NEXT_DIST_DIR;
  if (!SAFE_ANES_DIST_DIR_PATTERN.test(configured)) {
    throw new Error(
      "SAFEANES_NEXT_DIST_DIR must match .next-safeanes-<suffix> using only local safe characters",
    );
  }
  return configured;
}

/**
 * Verification runs use a disposable tsconfig so Next can add generated route
 * types without mutating the developer's project tsconfig.json.
 */
export function resolveSafeAnesTsconfigPath(value: string | undefined): string {
  const configured = value?.trim();
  if (!configured) return "tsconfig.json";
  if (!SAFE_ANES_TSCONFIG_PATH_PATTERN.test(configured)) {
    throw new Error(
      "SAFEANES_TSCONFIG_PATH must be a launcher-owned project-root tsconfig filename",
    );
  }
  return configured;
}
