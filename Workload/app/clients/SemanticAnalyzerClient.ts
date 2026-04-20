/**
 * SemanticAnalyzerClient - Frontend HTTP client for Semantic Analyzer API
 * Thin wrapper around backend REST API calls.
 * Handles authentication and error handling for UI consumption.
 */

import type {
  LoadSemanticModelsResponse,
  SemanticColumnStats,
  SemanticModel,
  SemanticModelData,
  SemanticTableStats,
} from "../services/SemanticAnalyzerService";
import type { EntityReportUsageSummary } from "../items/InsightWorkbenchItem/models/ReportUsageModel";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { FABRIC_BASE_SCOPES } from "./FabricPlatformScopes";

const POWER_BI_XMLA_SCOPE = "https://analysis.windows.net/powerbi/api/Dataset.Read.All";

export interface ModelReportUsageResult {
  entityUsageById: Record<string, EntityReportUsageSummary>;
  reportsUsingModel: unknown[];
  scanErrors: string[];
}

function formatUnknownError(error: unknown): string {
  if (!error) {
    return "unknown error";
  }

  if (error instanceof Error) {
    return error.message || "unknown error";
  }

  if (typeof error === "object") {
    const maybeError = error as Record<string, unknown>;
    const status = maybeError.status ?? maybeError.statusCode;
    const message =
      (typeof maybeError.message === "string" && maybeError.message) ||
      (typeof maybeError.error === "string" && maybeError.error) ||
      (typeof maybeError.details === "string" && maybeError.details);

    if (status && message) {
      return `${status}: ${message}`;
    }
    if (message) {
      return message;
    }
    if (status) {
      return String(status);
    }
  }

  return String(error);
}

/**
 * HTTP client for semantic model analysis.
 * All heavy XMLA lifting happens on the backend — this client just
 * acquires tokens and dispatches the REST calls.
 */
export class SemanticAnalyzerClient {
  private readonly apiBaseUrl: string;
  private readonly workloadClient: WorkloadClientAPI;
  private authContextPromise: Promise<void> | null = null;

  private logInfo(message: string, details?: Record<string, unknown>): void {
    if (details) {
      console.log(`[SemanticAnalyzerClient] ${message}`, details);
      return;
    }
    console.log(`[SemanticAnalyzerClient] ${message}`);
  }

  private logError(message: string, details?: Record<string, unknown>): void {
    if (details) {
      console.error(`[SemanticAnalyzerClient] ${message}`, details);
      return;
    }
    console.error(`[SemanticAnalyzerClient] ${message}`);
  }

  constructor(workloadClient: WorkloadClientAPI, apiBaseUrl?: string) {
    this.workloadClient = workloadClient;
    this.apiBaseUrl = apiBaseUrl || `${window.location.protocol}//${window.location.host}`;
  }

  private async ensureAuthContext(): Promise<void> {
    if (!this.authContextPromise) {
      this.logInfo("Initializing auth context");
      this.authContextPromise = this.workloadClient.auth
        .acquireFrontendAccessToken({ scopes: [] })
        .then((): void => {
          this.logInfo("Auth context initialized");
          return undefined;
        })
        .catch((error: unknown): void => {
          this.logError("Auth context init failed (continuing with scoped token flow)", {
            error: formatUnknownError(error),
          });
        });
    }

    return this.authContextPromise;
  }

  private async readJsonResponse<T>(response: Response, endpoint: string): Promise<T> {
    const contentType = response.headers.get("content-type") || "";
    const bodyText = await response.text();

    if (!response.ok) {
      throw new Error(`${endpoint} failed (${response.status}): ${bodyText}`);
    }

    if (!contentType.toLowerCase().includes("application/json")) {
      const preview = bodyText.slice(0, 180).replace(/\s+/g, " ").trim();
      throw new Error(
        `${endpoint} returned non-JSON content. This usually means the backend API route is not active yet. ` +
          `Restart the dev server/dev gateway and try again. Response preview: ${preview}`
      );
    }

    try {
      return JSON.parse(bodyText) as T;
    } catch (error) {
      const parseError = error instanceof Error ? error.message : String(error);
      throw new Error(`${endpoint} returned invalid JSON: ${parseError}`);
    }
  }

  /** Fabric Platform token for workspace/item read */
  private async getFabricToken(): Promise<string> {
    await this.ensureAuthContext();

    const scopes = [
      FABRIC_BASE_SCOPES.WORKSPACE_READ,
      FABRIC_BASE_SCOPES.ITEM_READ,
    ];

    const result = await this.workloadClient.auth.acquireFrontendAccessToken({ scopes });
    return result.token;
  }

  /** Power BI XMLA token for semantic model queries */
  private async getPowerBiToken(): Promise<string> {
    await this.ensureAuthContext();
    const result = await this.workloadClient.auth.acquireFrontendAccessToken({
      scopes: [POWER_BI_XMLA_SCOPE],
    });
    return result.token;
  }

  /**
   * Load available semantic models across all accessible workspaces.
   * Uses Fabric Platform token (workspace + item read scopes).
   */
  async loadModels(): Promise<SemanticModel[]> {
    this.logInfo("loadModels started");

    const token = await this.getFabricToken();
    const url = `${this.apiBaseUrl}/api/semantic/models`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const payload = await this.readJsonResponse<LoadSemanticModelsResponse>(response, "GET /api/semantic/models");
    this.logInfo("loadModels completed", { count: payload.models?.length ?? 0 });
    return Array.isArray(payload.models) ? payload.models : [];
  }

  /**
   * Load all entities and dependency graph for a specific semantic model.
   * Uses Power BI XMLA token — the backend will forward this to execute XMLA queries.
   */
  async loadModelEntities(
    workspaceId: string,
    datasetId: string,
    workspaceName?: string,
    datasetName?: string
  ): Promise<SemanticModelData> {
    this.logInfo("loadModelEntities started", { workspaceId, datasetId, workspaceName, datasetName });

    const token = await this.getPowerBiToken();
    const query = new URLSearchParams();
    if (workspaceName) {
      query.set("workspaceName", workspaceName);
    }
    if (datasetName) {
      query.set("datasetName", datasetName);
    }

    const url = `${this.apiBaseUrl}/api/semantic/models/${encodeURIComponent(workspaceId)}/${encodeURIComponent(datasetId)}/entities${query.size > 0 ? `?${query.toString()}` : ""}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const payload = await this.readJsonResponse<SemanticModelData>(
      response,
      `GET /api/semantic/models/${workspaceId}/${datasetId}/entities`
    );

    this.logInfo("loadModelEntities completed", {
      workspaceId,
      datasetId,
      entityCount: payload.entities?.length ?? 0,
      dependencyCount: payload.dependencies?.length ?? 0,
      cacheSource: payload.cacheSource,
      hasEntityCounts: !!payload.entityCounts,
      hasEntityRelationships: !!payload.entityRelationships,
    });

    return {
      entities: Array.isArray(payload.entities) ? payload.entities : [],
      dependencies: Array.isArray(payload.dependencies) ? payload.dependencies : [],

      // Pre-calculated data from backend
      entityCounts: payload.entityCounts,
      entityRelationships: payload.entityRelationships,
      relationshipContext: payload.relationshipContext,

      dependencyDiagnostics: payload.dependencyDiagnostics,
      cacheSource: payload.cacheSource,
      tmdlView: payload.tmdlView,
    };
  }

  async loadTableStats(
    workspaceId: string,
    datasetId: string,
    tableName: string
  ): Promise<SemanticTableStats> {
    const token = await this.getPowerBiToken();
    const query = new URLSearchParams({ tableName });
    const url = `${this.apiBaseUrl}/api/semantic/models/${encodeURIComponent(workspaceId)}/${encodeURIComponent(datasetId)}/table-stats?${query.toString()}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    return await this.readJsonResponse<SemanticTableStats>(
      response,
      `GET /api/semantic/models/${workspaceId}/${datasetId}/table-stats`
    );
  }

  async loadColumnStats(
    workspaceId: string,
    datasetId: string,
    tableName: string,
    columnName: string
  ): Promise<SemanticColumnStats> {
    const token = await this.getPowerBiToken();
    const query = new URLSearchParams({ tableName, columnName });
    const url = `${this.apiBaseUrl}/api/semantic/models/${encodeURIComponent(workspaceId)}/${encodeURIComponent(datasetId)}/column-stats?${query.toString()}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    return await this.readJsonResponse<SemanticColumnStats>(
      response,
      `GET /api/semantic/models/${workspaceId}/${datasetId}/column-stats`
    );
  }

  /**
   * Consolidated single-call report usage analysis for a semantic model.
   * Replaces the previous 3-step frontend flow (loadArtifacts → loadLineageLinks → loadSemanticModelReportUsage).
   *
   * Requires two tokens:
   *   - Fabric Platform token  (WORKSPACE_READ + ITEM_READWRITE) — for artifact discovery + report definitions
   *   - Power BI token         (Dataset.Read.All)                — for lineage link resolution
   */
  async loadModelReportUsage(workspaceId: string, datasetId: string): Promise<ModelReportUsageResult> {
    this.logInfo("loadModelReportUsage started", { workspaceId, datasetId });

    const [fabricToken, powerBiToken] = await Promise.all([
      this.getFabricToken(),
      this.getPowerBiToken(),
    ]);

    const url = `${this.apiBaseUrl}/api/semantic/models/${encodeURIComponent(workspaceId)}/${encodeURIComponent(datasetId)}/report-usage`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${fabricToken}`,
        "X-PowerBI-Token": `Bearer ${powerBiToken}`,
        "Content-Type": "application/json",
      },
    });

    const result = await this.readJsonResponse<ModelReportUsageResult>(
      response,
      `GET /api/semantic/models/${workspaceId}/${datasetId}/report-usage`
    );

    this.logInfo("loadModelReportUsage completed", {
      workspaceId,
      datasetId,
      entityCount: Object.keys(result.entityUsageById ?? {}).length,
      reportCount: result.reportsUsingModel?.length ?? 0,
      scanErrors: result.scanErrors?.length ?? 0,
    });

    return result;
  }
}