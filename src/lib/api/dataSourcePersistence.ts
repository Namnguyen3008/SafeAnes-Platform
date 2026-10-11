export type PersistedDataSourceMode = "SYNTHETIC_DEMO" | "VITALDB_REPLAY";

const DATA_SOURCE_MODE_KEY = "safeanes.data-source-mode";

export function readPersistedDataSourceMode(
  storage: Pick<Storage, "getItem">,
): PersistedDataSourceMode {
  try {
    return storage.getItem(DATA_SOURCE_MODE_KEY) === "VITALDB_REPLAY"
      ? "VITALDB_REPLAY"
      : "SYNTHETIC_DEMO";
  } catch {
    return "SYNTHETIC_DEMO";
  }
}

export function persistDataSourceMode(
  storage: Pick<Storage, "setItem">,
  mode: PersistedDataSourceMode,
): boolean {
  try {
    storage.setItem(DATA_SOURCE_MODE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}
