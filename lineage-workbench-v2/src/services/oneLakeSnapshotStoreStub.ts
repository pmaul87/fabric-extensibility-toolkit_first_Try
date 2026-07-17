import type { GraphSnapshot } from "../contracts/lineageSnapshot";
import type { SnapshotStore } from "./snapshotStore";

export interface OneLakeSnapshotStoreStubOptions {
  workspaceId?: string;
  itemId?: string;
  basePath?: string;
}

export class OneLakeSnapshotStoreStub implements SnapshotStore {
  private readonly options: OneLakeSnapshotStoreStubOptions;

  constructor(options: OneLakeSnapshotStoreStubOptions) {
    this.options = options;
  }

  async save(_runId: string, _snapshot: GraphSnapshot): Promise<void> {
    throw this.notImplementedError();
  }

  async get(_runId: string): Promise<GraphSnapshot | undefined> {
    throw this.notImplementedError();
  }

  private notImplementedError(): Error {
    return new Error(
      "OneLake snapshot persistence is not implemented yet. " +
        "Use SNAPSHOT_STORE_PROVIDER=file or implement a concrete OneLake snapshot store. " +
        `workspaceId=${this.options.workspaceId || "<unset>"}, ` +
        `itemId=${this.options.itemId || "<unset>"}, ` +
        `basePath=${this.options.basePath || "<unset>"}.`
    );
  }
}
