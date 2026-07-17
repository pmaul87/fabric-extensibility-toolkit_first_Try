import type { GraphSnapshot } from "../../contracts/lineageSnapshot";
import type { CreateExtractionRequest, ExtractionRun } from "../../domain/extractionTypes";
import type { LineageCollector } from "./LineageCollector";
import { buildSnapshotFromNotebookPipeline } from "../notebookPorted/buildSnapshotFromNotebookPipeline";
import type { NotebookInputTables } from "../notebookPorted/types";
import { ensureAllNotebookTables } from "../notebookPorted/tableContracts";
import { collectLiveFabricRawTables } from "./liveFabricRawTableCollector";

export class MockLineageCollector implements LineageCollector {
  async collect(run: ExtractionRun, request: CreateExtractionRequest): Promise<GraphSnapshot> {
    const notebookInputTables = request.options?.inputTables as NotebookInputTables | undefined;
    const stagedTables = notebookInputTables && Object.keys(notebookInputTables).length > 0
      ? ensureAllNotebookTables(notebookInputTables)
      : undefined;

    if (!stagedTables) {
      const liveTables = await collectLiveFabricRawTables(run, request);
      if (!liveTables) {
        throw new Error(
          "V2 extraction requires staged input tables (options.inputTables/inputTableSetId) or live native collection with token."
        );
      }

      const snapshot = buildSnapshotFromNotebookPipeline(ensureAllNotebookTables(liveTables), run.workspaceIds[0]);
      return snapshot;
    }

    const snapshot = buildSnapshotFromNotebookPipeline(stagedTables, run.workspaceIds[0]);
    return snapshot;
  }
}
