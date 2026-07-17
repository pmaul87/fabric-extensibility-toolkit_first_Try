import cors from "cors";
import express, { Request, Response } from "express";
import helmet from "helmet";
import { z } from "zod";
import { ExtractionStore } from "./domain/extractionStore";
import { CreateExtractionRequestSchema } from "./domain/extractionTypes";
import { executeMockExtraction } from "./services/mockExtractionBuilder";
import { MockLineageCollector } from "./services/collectors/MockLineageCollector";
import { createSnapshotStore } from "./services/snapshotStoreFactory";
import { InputTableSetStore } from "./services/inputTableSetStore";

const CreateInputTableSetRequestSchema = z.object({
  inputTables: z.record(z.array(z.record(z.unknown()))),
});

export function createApp() {
  const app = express();
  const store = new ExtractionStore();
  const collector = new MockLineageCollector();
  const snapshotStore = createSnapshotStore();
  const inputTableSetStore = new InputTableSetStore();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", service: "lineage-workbench-v2", timestamp: new Date().toISOString() });
  });

  app.post("/api/v2/lineage/input-tables", (req: Request, res: Response) => {
    const parseResult = CreateInputTableSetRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "invalid_request",
        message: "Invalid input table set payload.",
        details: parseResult.error.flatten(),
      });
    }

    const created = inputTableSetStore.create(parseResult.data.inputTables);
    return res.status(201).json({
      inputTableSetId: created.id,
      createdAtUtc: created.createdAtUtc,
      tableCount: Object.keys(created.tables).length,
    });
  });

  app.post("/api/v2/lineage/extractions", async (req: Request, res: Response) => {
    const parseResult = CreateExtractionRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "invalid_request",
        message: "Invalid extraction request payload.",
        details: parseResult.error.flatten(),
      });
    }

    const payload = parseResult.data;
    const stagedInputTableSetId = payload.options?.inputTableSetId;
    const stagedInputTables = stagedInputTableSetId ? inputTableSetStore.get(stagedInputTableSetId) : undefined;

    if (stagedInputTableSetId && !stagedInputTables) {
      return res.status(404).json({
        error: "input_table_set_not_found",
        message: "The referenced inputTableSetId was not found.",
        inputTableSetId: stagedInputTableSetId,
      });
    }

    const resolvedOptions = stagedInputTables
      ? {
          graphScope: payload.options?.graphScope ?? "focused",
          graphNodeLimit: payload.options?.graphNodeLimit ?? 500,
          inputTableSetId: payload.options?.inputTableSetId,
          inputTables: stagedInputTables.tables,
          nativeSeedTables: payload.options?.nativeSeedTables,
          nativeCollection: payload.options?.nativeCollection,
        }
      : payload.options;

    const resolvedPayload = stagedInputTables
      ? {
          ...payload,
          options: resolvedOptions,
        }
      : payload;

    const hasInlineInputTables = !!resolvedPayload.options?.inputTables && Object.keys(resolvedPayload.options.inputTables).length > 0;
    const hasStagedInputTables = !!stagedInputTables;
    const nativeCollectionEnabled = resolvedPayload.options?.nativeCollection?.enabled ?? false;
    const nativeCollectionToken = (
      resolvedPayload.options?.nativeCollection?.fabricAccessToken || process.env.FABRIC_ACCESS_TOKEN || ""
    ).trim();

    if (!hasInlineInputTables && !hasStagedInputTables && !nativeCollectionEnabled) {
      return res.status(400).json({
        error: "v2_input_required",
        message:
          "V2 extraction requires input tables via options.inputTables/inputTableSetId, or options.nativeCollection.enabled=true.",
      });
    }

    if (!hasInlineInputTables && !hasStagedInputTables && nativeCollectionEnabled && !nativeCollectionToken) {
      return res.status(400).json({
        error: "fabric_access_token_required",
        message:
          "nativeCollection is enabled but no Fabric access token was provided. Set options.nativeCollection.fabricAccessToken or FABRIC_ACCESS_TOKEN.",
      });
    }

    const run = store.createRun({
      workspaceIds: resolvedPayload.workspaceIds,
      artifactTypes: resolvedPayload.artifactTypes,
      lakehouseId: resolvedPayload.lakehouseId,
    });

    void executeMockExtraction(store, run.id, resolvedPayload, collector, snapshotStore).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      store.updateRun(run.id, {
        status: "failed",
        progressPercent: 100,
        completedAtUtc: new Date().toISOString(),
        errorMessage: message,
      });
    });

    return res.status(202).json({
      runId: run.id,
      status: run.status,
      createdAtUtc: run.createdAtUtc,
    });
  });

  app.get("/api/v2/lineage/extractions/:id", (req: Request, res: Response) => {
    const run = store.getRun(req.params.id);
    if (!run) {
      return res.status(404).json({ error: "not_found", message: "Extraction run not found." });
    }

    return res.status(200).json({
      runId: run.id,
      status: run.status,
      progressPercent: run.progressPercent,
      createdAtUtc: run.createdAtUtc,
      startedAtUtc: run.startedAtUtc,
      completedAtUtc: run.completedAtUtc,
      warningMessages: run.warningMessages,
      errorMessage: run.errorMessage,
    });
  });

  app.get("/api/v2/lineage/extractions/:id/result", async (req: Request, res: Response) => {
    const runId = req.params.id;
    const run = store.getRun(runId);
    if (!run) {
      return res.status(404).json({ error: "not_found", message: "Extraction run not found." });
    }

    if (run.status !== "succeeded") {
      return res.status(409).json({
        error: "result_not_ready",
        message: "Extraction result is not ready yet.",
        status: run.status,
      });
    }

    const result = run.result ?? (await snapshotStore.get(runId));
    if (!result) {
      return res.status(404).json({
        error: "result_not_found",
        message: "Extraction snapshot was not found in snapshot store.",
      });
    }

    return res.status(200).json({
      runId: run.id,
      status: run.status,
      graphSnapshot: result,
    });
  });

  app.post("/api/v2/lineage/extractions/:id/cancel", (req: Request, res: Response) => {
    const run = store.getRun(req.params.id);
    if (!run) {
      return res.status(404).json({ error: "not_found", message: "Extraction run not found." });
    }

    if (run.status === "succeeded" || run.status === "failed") {
      return res.status(409).json({
        error: "already_completed",
        message: "Cannot cancel a completed extraction run.",
        status: run.status,
      });
    }

    const cancelled = store.updateRun(run.id, {
      status: "cancelled",
      completedAtUtc: new Date().toISOString(),
    });

    return res.status(200).json({
      runId: cancelled?.id,
      status: cancelled?.status,
      completedAtUtc: cancelled?.completedAtUtc,
    });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "invalid_request", message: error.message });
    }

    const message = error instanceof Error ? error.message : "Unknown server error";
    return res.status(500).json({ error: "internal_error", message });
  });

  return app;
}
