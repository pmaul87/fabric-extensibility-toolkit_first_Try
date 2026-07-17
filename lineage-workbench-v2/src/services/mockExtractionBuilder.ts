import type { CreateExtractionRequest } from "../domain/extractionTypes";
import { ExtractionStore } from "../domain/extractionStore";
import type { LineageCollector } from "./collectors/LineageCollector";
import type { SnapshotStore } from "./snapshotStore";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeMockExtraction(
  store: ExtractionStore,
  runId: string,
  request: CreateExtractionRequest,
  collector: LineageCollector,
  snapshotStore: SnapshotStore
): Promise<void> {
  const run = store.getRun(runId);
  if (!run) {
    return;
  }

  store.updateRun(runId, {
    status: "running",
    startedAtUtc: new Date().toISOString(),
    progressPercent: 5,
  });

  await wait(600);
  if (store.getRun(runId)?.status === "cancelled") return;

  store.updateRun(runId, { progressPercent: 30 });
  await wait(500);
  if (store.getRun(runId)?.status === "cancelled") return;

  store.updateRun(runId, { progressPercent: 65 });
  await wait(500);
  if (store.getRun(runId)?.status === "cancelled") return;

  const snapshot = await collector.collect(run, request);

  const warnings = request.artifactTypes.length === 0
    ? ["No artifact types specified; mock run used default artifact scope."]
    : [];

  await snapshotStore.save(runId, snapshot);
  store.updateRun(runId, { warningMessages: warnings });
  store.setResult(runId, snapshot);
}
