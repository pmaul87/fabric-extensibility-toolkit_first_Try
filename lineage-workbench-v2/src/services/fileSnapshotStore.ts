import { promises as fs } from "fs";
import path from "path";
import type { GraphSnapshot } from "../contracts/lineageSnapshot";
import type { SnapshotStore } from "./snapshotStore";

export class FileSnapshotStore implements SnapshotStore {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), "data", "snapshots");
  }

  private toFilePath(runId: string): string {
    return path.join(this.baseDir, `${runId}.json`);
  }

  async save(runId: string, snapshot: GraphSnapshot): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const filePath = this.toFilePath(runId);
    await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
  }

  async get(runId: string): Promise<GraphSnapshot | undefined> {
    try {
      const filePath = this.toFilePath(runId);
      const raw = await fs.readFile(filePath, "utf-8");
      return JSON.parse(raw) as GraphSnapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("ENOENT")) {
        return undefined;
      }
      throw error;
    }
  }
}
