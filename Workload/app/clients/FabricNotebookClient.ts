/**
 * FabricNotebookClient - Triggers and monitors Fabric Notebook execution via the Jobs API.
 *
 * Used by LineageWorkbenchItemExtractionView to run the extraction notebooks
 * (01_extract_semantic_models, 02_extract_reports, 03_extract_notebooks, etc.)
 * on-demand from the Workbench UI.
 *
 * API Reference:
 *  POST /v1/workspaces/{workspaceId}/items/{itemId}/jobs/instances
 *  GET  /v1/workspaces/{workspaceId}/items/{itemId}/jobs/instances/{jobInstanceId}
 *  GET  /v1/workspaces/{workspaceId}/items?type=Notebook
 */

import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { FabricPlatformClient } from "./FabricPlatformClient";
import { SCOPE_PAIRS } from "./FabricPlatformScopes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotebookJobStatus =
  | "NotStarted"
  | "InProgress"
  | "Completed"
  | "Failed"
  | "Cancelled"
  | "Deduped"
  | "Unknown";

export interface NotebookJobInstance {
  id: string;
  itemId: string;
  jobType: string;
  invokeType: string;
  status: NotebookJobStatus;
  failureReason?: { errorCode: string; message: string } | null;
  startTimeUtc?: string;
  endTimeUtc?: string;
}

export interface FabricNotebookItem {
  id: string;
  displayName: string;
  type: "Notebook";
  workspaceId: string;
}

export interface TriggerNotebookResult {
  jobInstanceId: string;
  /** Location header returned by the API — poll this to get status */
  pollUrl: string;
}

/** Parameters forwarded to the notebook as job execution data */
export interface ExtractionJobParameters {
  /** Target workspace IDs to extract from */
  targetWorkspaces?: string[];
  /** Lakehouse ID where results will be written */
  targetLakehouseId?: string;
  /** Artifact types to extract, e.g. ["semantic_model", "report"] */
  artifactTypes?: string[];
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * Wraps Fabric Jobs API to trigger and poll Notebook execution.
 *
 * Usage:
 *   const client = new FabricNotebookClient(workloadClient);
 *   const notebooks = await client.listNotebooks(workspaceId);
 *   const { jobInstanceId } = await client.triggerNotebook(workspaceId, notebookId, params);
 *   const status = await client.pollJobStatus(workspaceId, notebookId, jobInstanceId);
 */
export class FabricNotebookClient extends FabricPlatformClient {
  constructor(workloadClient: WorkloadClientAPI) {
    super(workloadClient, SCOPE_PAIRS.ITEM_READWRITE);
  }

  // -------------------------------------------------------------------------
  // Discovery
  // -------------------------------------------------------------------------

  /**
   * List all Notebook items in a workspace.
   * Use this to map display names (e.g. "01_extract_semantic_models") to item IDs
   * so the extraction view can present a selection UI.
   */
  async listNotebooks(workspaceId: string): Promise<FabricNotebookItem[]> {
    const response = await this.get<{ value: FabricNotebookItem[] }>(
      `/workspaces/${workspaceId}/items?type=Notebook`
    );
    return response.value ?? [];
  }

  /**
   * Find a specific notebook by display name in a workspace.
   * Returns undefined if not found.
   */
  async findNotebookByName(
    workspaceId: string,
    displayName: string
  ): Promise<FabricNotebookItem | undefined> {
    const notebooks = await this.listNotebooks(workspaceId);
    return notebooks.find(
      (n) => n.displayName.toLowerCase() === displayName.toLowerCase()
    );
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  /**
   * Trigger an on-demand notebook run via the Fabric Jobs API.
   *
   * The Jobs API returns 202 Accepted. The base class 202 handler extracts
   * the operationId from the `x-ms-operation-id` response header; we use
   * that as the jobInstanceId (it matches the instance ID in the Location URL).
   *
   * @returns jobInstanceId for subsequent status polling
   */
  async triggerNotebook(
    workspaceId: string,
    notebookId: string,
    parameters?: ExtractionJobParameters
  ): Promise<TriggerNotebookResult> {
    const body: Record<string, unknown> = {
      jobType: "RunNotebook",
    };

    if (parameters) {
      body.executionData = {
        parameters: {
          targetWorkspaces: {
            value: parameters.targetWorkspaces ?? [],
            type: "list",
          },
          targetLakehouseId: {
            value: parameters.targetLakehouseId ?? "",
            type: "string",
          },
          artifactTypes: {
            value: parameters.artifactTypes ?? [],
            type: "list",
          },
        },
      };
    }

    // The base class makeRequest handles 202 → returns AsyncOperationIndicator
    // with operationId taken from x-ms-operation-id header.
    const indicator = await this.post<{ operationId: string }>(
      `/workspaces/${workspaceId}/items/${notebookId}/jobs/instances`,
      body
    );

    const jobInstanceId = indicator.operationId;
    const pollUrl = `${this.baseUrl}/v1/workspaces/${workspaceId}/items/${notebookId}/jobs/instances/${jobInstanceId}`;

    return { jobInstanceId, pollUrl };
  }

  // -------------------------------------------------------------------------
  // Status polling
  // -------------------------------------------------------------------------

  /**
   * Poll the current status of a running notebook job instance.
   */
  async pollJobStatus(
    workspaceId: string,
    notebookId: string,
    jobInstanceId: string
  ): Promise<NotebookJobInstance> {
    return this.get<NotebookJobInstance>(
      `/workspaces/${workspaceId}/items/${notebookId}/jobs/instances/${jobInstanceId}`
    );
  }

  /**
   * Wait for a job to reach a terminal state by polling at a fixed interval.
   * Rejects if the job fails or is cancelled.
   *
   * @param workspaceId Workspace ID
   * @param notebookId Notebook item ID
   * @param jobInstanceId Job instance ID from triggerNotebook()
   * @param onProgress Optional callback invoked on each poll with current status
   * @param pollIntervalMs Polling interval in milliseconds (default: 5000)
   * @param timeoutMs Maximum wait time in milliseconds (default: 30 minutes)
   */
  async waitForCompletion(
    workspaceId: string,
    notebookId: string,
    jobInstanceId: string,
    onProgress?: (status: NotebookJobStatus) => void,
    pollIntervalMs = 5_000,
    timeoutMs = 30 * 60 * 1_000
  ): Promise<NotebookJobInstance> {
    const terminalStates: NotebookJobStatus[] = [
      "Completed",
      "Failed",
      "Cancelled",
      "Deduped",
    ];

    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const instance = await this.pollJobStatus(workspaceId, notebookId, jobInstanceId);
      onProgress?.(instance.status);

      if (terminalStates.includes(instance.status)) {
        if (instance.status !== "Completed") {
          const reason = instance.failureReason?.message ?? instance.status;
          throw new Error(`Notebook job ended with status "${instance.status}": ${reason}`);
        }
        return instance;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Notebook job timed out after ${timeoutMs / 1000}s`);
  }

  // -------------------------------------------------------------------------
  // Convenience: run all extraction notebooks in sequence
  // -------------------------------------------------------------------------

  /** Display names of the extraction notebooks (must be uploaded to Fabric first) */
  static readonly EXTRACTION_NOTEBOOKS = [
    "01_extract_semantic_models",
    "02_extract_reports",
    "03_extract_notebooks",
  ] as const;

  /**
   * Run all configured extraction notebooks in sequence.
   * Resolves when all succeed; rejects on first failure.
   *
   * @param workspaceId Workspace that contains the notebooks AND is being extracted from
   * @param parameters Shared extraction parameters forwarded to every notebook
   * @param onNotebookStart Called when each notebook starts
   * @param onNotebookDone Called when each notebook completes
   */
  async runAllExtractionNotebooks(
    workspaceId: string,
    parameters: ExtractionJobParameters,
    onNotebookStart?: (name: string) => void,
    onNotebookDone?: (name: string) => void
  ): Promise<void> {
    for (const name of FabricNotebookClient.EXTRACTION_NOTEBOOKS) {
      const notebook = await this.findNotebookByName(workspaceId, name);
      if (!notebook) {
        throw new Error(
          `Extraction notebook "${name}" not found in workspace ${workspaceId}. ` +
            `Upload the notebooks from Workload/notebooks/extraction/ first.`
        );
      }

      onNotebookStart?.(name);
      const { jobInstanceId } = await this.triggerNotebook(
        workspaceId,
        notebook.id,
        parameters
      );
      await this.waitForCompletion(workspaceId, notebook.id, jobInstanceId);
      onNotebookDone?.(name);
    }
  }
}
