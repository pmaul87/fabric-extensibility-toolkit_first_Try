import { randomUUID } from "crypto";
import type { ExtractionRun, ExtractionRunStatus } from "./extractionTypes";
import type { GraphSnapshot } from "../contracts/lineageSnapshot";

export class ExtractionStore {
  private readonly runs = new Map<string, ExtractionRun>();

  createRun(input: {
    workspaceIds: string[];
    artifactTypes: string[];
    lakehouseId?: string;
  }): ExtractionRun {
    const run: ExtractionRun = {
      id: randomUUID(),
      createdAtUtc: new Date().toISOString(),
      status: "queued",
      progressPercent: 0,
      workspaceIds: input.workspaceIds,
      artifactTypes: input.artifactTypes,
      lakehouseId: input.lakehouseId,
      warningMessages: [],
    };

    this.runs.set(run.id, run);
    return run;
  }

  getRun(runId: string): ExtractionRun | undefined {
    return this.runs.get(runId);
  }

  updateRun(runId: string, patch: Partial<ExtractionRun>): ExtractionRun | undefined {
    const current = this.runs.get(runId);
    if (!current) {
      return undefined;
    }

    const next: ExtractionRun = { ...current, ...patch };
    this.runs.set(runId, next);
    return next;
  }

  setStatus(runId: string, status: ExtractionRunStatus): ExtractionRun | undefined {
    return this.updateRun(runId, { status });
  }

  setResult(runId: string, result: GraphSnapshot): ExtractionRun | undefined {
    return this.updateRun(runId, {
      result,
      status: "succeeded",
      progressPercent: 100,
      completedAtUtc: new Date().toISOString(),
    });
  }
}
