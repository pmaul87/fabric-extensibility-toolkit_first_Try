import type { GraphSnapshot } from "../contracts/lineageSnapshot";

export interface SnapshotStore {
  save(runId: string, snapshot: GraphSnapshot): Promise<void>;
  get(runId: string): Promise<GraphSnapshot | undefined>;
}
