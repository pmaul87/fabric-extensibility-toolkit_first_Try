import type { SnapshotStore } from "./snapshotStore";
import { FileSnapshotStore } from "./fileSnapshotStore";
import { OneLakeSnapshotStoreStub } from "./oneLakeSnapshotStoreStub";

export function createSnapshotStore(): SnapshotStore {
  const provider = (process.env.SNAPSHOT_STORE_PROVIDER || "file").trim().toLowerCase();
  if (provider === "file") {
    return new FileSnapshotStore();
  }

  if (provider === "onelake") {
    return new OneLakeSnapshotStoreStub({
      workspaceId: process.env.ONELAKE_WORKSPACE_ID,
      itemId: process.env.ONELAKE_ITEM_ID,
      basePath: process.env.ONELAKE_BASE_PATH || "Files/lineage/snapshots",
    });
  }

  throw new Error(
    `Invalid SNAPSHOT_STORE_PROVIDER '${provider}'. Supported values are 'file' and 'onelake'.`
  );
}
