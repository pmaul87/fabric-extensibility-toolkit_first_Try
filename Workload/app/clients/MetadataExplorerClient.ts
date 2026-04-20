/**
 * MetadataExplorerClient - Frontend HTTP client for metadata API
 * Thin wrapper around backend REST API calls
 * Handles authentication and error handling for UI consumption
 */

import type {
  LoadArtifactsResponse,
  LoadArtifactsRequest,
  LoadLineageLinksRequest,
  LoadLineageLinksResponse,
  LoadLineageLinksWithPermissionsResponse,
  LoadSemanticModelReportUsageRequest,
  LoadSemanticModelReportUsageResponse,
  LoadReportDefinitionRequest,
  LoadReportDefinitionResponse,
} from "../services/MetadataService";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { FABRIC_BASE_SCOPES } from "./FabricPlatformScopes";

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
 * HTTP client for metadata exploration
 * All calls go through the backend API for consistency and future persistence
 */
export class MetadataExplorerClient {
  private readonly apiBaseUrl: string;
  private readonly workloadClient: WorkloadClientAPI;
  private authContextPromise: Promise<void> | null = null;

  private logInfo(message: string, details?: Record<string, unknown>): void {
    if (details) {
      console.log(`[MetadataExplorerClient] ${message}`, details);
      return;
    }

    console.log(`[MetadataExplorerClient] ${message}`);
  }

  private logError(message: string, details?: Record<string, unknown>): void {
    if (details) {
      console.error(`[MetadataExplorerClient] ${message}`, details);
      return;
    }

    console.error(`[MetadataExplorerClient] ${message}`);
  }

  /**
   * Create new metadata explorer client
   * @param apiBaseUrl Base URL for backend API (defaults to current protocol/host)
   */
  constructor(workloadClient: WorkloadClientAPI, apiBaseUrl?: string) {
    this.workloadClient = workloadClient;
    this.apiBaseUrl = apiBaseUrl || `${window.location.protocol}//${window.location.host}`;
  }

  private async ensureAuthContext(): Promise<void> {
    if (!this.authContextPromise) {
      this.logInfo("Initializing auth context with empty scope token request");
      this.authContextPromise = this.workloadClient.auth
        .acquireFrontendAccessToken({ scopes: [] })
        .then((): void => {
          this.logInfo("Auth context initialized successfully");
          return undefined;
        })
        .catch((error: unknown): void => {
          this.logError("Auth context initialization failed (continuing with scoped token flow)", {
            error: formatUnknownError(error),
          });
        });
    }

    return this.authContextPromise;
  }

  private async getUserAccessToken(): Promise<string> {
    const scopes = [
      FABRIC_BASE_SCOPES.WORKSPACE_READ,
      FABRIC_BASE_SCOPES.ITEM_READ,
    ];

    try {
      await this.ensureAuthContext();

      this.logInfo("Requesting delegated Fabric token", {
        scopes,
      });

      const accessToken = await this.workloadClient.auth.acquireFrontendAccessToken({ scopes });
      if (!accessToken?.token) {
        this.logError("Delegated token response missing token value", {
          scopes,
        });
        throw new Error("Access token response did not include token value");
      }

      this.logInfo("Delegated Fabric token acquired", {
        tokenLength: accessToken.token.length,
        scopes,
      });

      return accessToken.token;
    } catch (error) {
      const detail = formatUnknownError(error);
      const detailsLower = detail.toLowerCase();
      const isConsentError =
        detailsLower.includes("consent") ||
        detailsLower.includes("aadsts65004") ||
        detailsLower.includes("consent_required");
      const isScopeError = detailsLower.includes("invalid scope") || detailsLower.includes("aadsts70011");

      const remediation = isConsentError
        ? "User or admin consent is required for Workspace.Read.All and Item.Read.All."
        : isScopeError
          ? "Requested Fabric scopes are not configured in the Entra app registration."
          : "Verify Entra app permissions include Fabric.Extend and delegated Workspace.Read.All + Item.Read.All.";

      this.logError("Delegated token acquisition failed", {
        scopes,
        error: detail,
        isConsentError,
        isScopeError,
      });

      throw new Error(
        `Unable to acquire delegated Fabric token (${detail}). ${remediation}`
      );
    }
  }

  private async getPowerBiLineageToken(): Promise<string> {
    const scopes = [
      "https://analysis.windows.net/powerbi/api/Report.Read.All",
      "https://analysis.windows.net/powerbi/api/Dataset.Read.All",
    ];

    await this.ensureAuthContext();
    const accessToken = await this.workloadClient.auth.acquireFrontendAccessToken({ scopes });
    if (!accessToken?.token) {
      throw new Error("Access token response did not include token value for Power BI lineage scopes.");
    }

    return accessToken.token;
  }

  private async getReportDefinitionToken(): Promise<string> {
    const scopes = [
      FABRIC_BASE_SCOPES.WORKSPACE_READ,
      FABRIC_BASE_SCOPES.ITEM_READWRITE,
    ];

    await this.ensureAuthContext();
    const accessToken = await this.workloadClient.auth.acquireFrontendAccessToken({ scopes });
    if (!accessToken?.token) {
      throw new Error("Access token response did not include token value for report definition scopes.");
    }

    return accessToken.token;
  }

  private async createHttpError(response: Response, operation: string): Promise<Error> {
    let detail = "";

    try {
      const payload = await response.json();
      if (typeof payload?.message === "string" && payload.message.length > 0) {
        detail = payload.message;
      } else if (typeof payload?.error === "string" && payload.error.length > 0) {
        detail = payload.error;
      } else if (typeof payload?.error?.message === "string" && payload.error.message.length > 0) {
        detail = payload.error.message;
      }
    } catch {
      // Ignore JSON parse failures and fall back to status text.
    }

    const suffix = detail ? ` - ${detail}` : "";
    this.logError("Metadata API HTTP failure", {
      operation,
      status: response.status,
      statusText: response.statusText,
      detail,
    });
    return new Error(`${operation} failed: ${response.status} ${response.statusText}${suffix}`);
  }

  private async readResponseBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private getErrorMessage(payload: unknown): string {
    if (payload === null || payload === undefined) {
      return "No response body.";
    }

    if (typeof payload === "string") {
      return payload;
    }

    if (typeof payload === "object") {
      const message =
        (payload as Record<string, unknown>)?.message ||
        ((payload as Record<string, unknown>)?.error as Record<string, unknown>)?.message ||
        (payload as Record<string, unknown>)?.error;

      if (typeof message === "string" && message.length > 0) {
        return message;
      }

      return JSON.stringify(payload);
    }

    return String(payload);
  }

  private async loadReportDefinitionDirect(
    request: LoadReportDefinitionRequest,
    accessToken: string
  ): Promise<LoadReportDefinitionResponse> {
    const endpoint = `https://api.fabric.microsoft.com/v1/workspaces/${request.workspaceId}/reports/${request.reportId}/getDefinition`;
    const startedAt = Date.now();

    const initialResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (initialResponse.status === 200) {
      const body = (await this.readResponseBody(initialResponse)) as Record<string, unknown> | null;
      const definition = (body?.definition ?? null) as LoadReportDefinitionResponse["definition"] | null;
      if (!definition) {
        throw new Error("Direct getDefinition response did not include definition payload.");
      }

      this.logInfo("Direct Fabric getDefinition completed", {
        operation: "loadReportDefinitionDirect",
        status: initialResponse.status,
        elapsedMs: Date.now() - startedAt,
        workspaceId: request.workspaceId,
        reportId: request.reportId,
      });

      return {
        definition,
        source: "direct-fabric",
        fetchedAt: new Date().toISOString(),
        rawResponse: body,
      };
    }

    if (initialResponse.status === 202) {
      const locationUrl = initialResponse.headers.get("Location");
      if (!locationUrl) {
        throw new Error("Direct getDefinition returned 202 but no Location header was provided.");
      }

      const maxAttempts = 8;
      let attempts = 0;

      while (attempts < maxAttempts) {
        attempts += 1;
        const operationResponse = await fetch(locationUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const body = (await this.readResponseBody(operationResponse)) as Record<string, unknown> | string | null;
        const operationRecord = (body && typeof body === "object" ? body : null) as Record<string, unknown> | null;
        const operationStatus = String((operationRecord?.status as string | undefined) || "").toLowerCase();

        // Fabric LRO polling: 200 with "Running"/"NotStarted" means still in progress
        if (operationResponse.status === 200 && (operationStatus === "running" || operationStatus === "notstarted")) {
          const retryAfter = Number.parseInt(operationResponse.headers.get("Retry-After") || "", 10);
          const retryMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000;
          await new Promise((resolve) => window.setTimeout(resolve, Math.min(retryMs, 5000)));
          continue;
        }

        // 202 also means still in progress
        if (operationResponse.status === 202) {
          const retryAfter = Number.parseInt(operationResponse.headers.get("Retry-After") || "", 10);
          const retryMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000;
          await new Promise((resolve) => window.setTimeout(resolve, Math.min(retryMs, 5000)));
          continue;
        }

        if (operationResponse.status === 200) {
          if (operationStatus === "failed") {
            throw new Error(`Report definition long-running operation failed: ${this.getErrorMessage(body)}`);
          }

          // "Succeeded" — try inline result first, then fall back to GET {operationUrl}/result
          const inlineDefinition =
            (operationRecord?.definition as LoadReportDefinitionResponse["definition"] | undefined) ||
            ((operationRecord?.result as Record<string, unknown> | undefined)?.definition as
              | LoadReportDefinitionResponse["definition"]
              | undefined);

          if (inlineDefinition) {
            this.logInfo("Direct Fabric getDefinition completed via LRO", {
              operation: "loadReportDefinitionDirect",
              elapsedMs: Date.now() - startedAt,
              attempts,
              workspaceId: request.workspaceId,
              reportId: request.reportId,
            });

            return {
              definition: inlineDefinition,
              source: "direct-fabric-lro",
              operationStatus: "Succeeded",
              attempts,
              fetchedAt: new Date().toISOString(),
              rawResponse: body,
            };
          }

          // Fabric pattern: definition is at a separate /result endpoint
          const resultUrl = locationUrl.replace(/\/$/u, "") + "/result";
          const resultResponse = await fetch(resultUrl, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
          });
          const resultBody = (await this.readResponseBody(resultResponse)) as Record<string, unknown> | null;
          if (resultResponse.status !== 200) {
            throw new Error(`Failed to fetch LRO result: ${this.getErrorMessage(resultBody)}`);
          }
          const resultDefinition = resultBody?.definition as LoadReportDefinitionResponse["definition"] | undefined;
          if (!resultDefinition) {
            throw new Error(`LRO result endpoint returned no definition: ${JSON.stringify(resultBody)}`);
          }

          this.logInfo("Direct Fabric getDefinition completed via LRO result endpoint", {
            operation: "loadReportDefinitionDirect",
            elapsedMs: Date.now() - startedAt,
            attempts,
            workspaceId: request.workspaceId,
            reportId: request.reportId,
          });

          return {
            definition: resultDefinition,
            source: "direct-fabric-lro-result",
            operationStatus: "Succeeded",
            attempts,
            fetchedAt: new Date().toISOString(),
            rawResponse: resultBody,
          };
        }

        throw new Error(
          `Unexpected long-running operation status ${operationResponse.status}: ${this.getErrorMessage(body)}`
        );
      }

      throw new Error("Report definition long-running operation did not complete in time.");
    }

    const failureBody = await this.readResponseBody(initialResponse);
    throw new Error(
      `Direct getDefinition failed (${initialResponse.status} ${initialResponse.statusText}): ${this.getErrorMessage(failureBody)}`
    );
  }

  /**
   * Load all discoverable artifacts across workspaces
   * @param request Load parameters (optional)
   * @returns Response with artifacts, trace, and metadata
   */
  async loadArtifacts(request?: LoadArtifactsRequest): Promise<LoadArtifactsResponse> {
    const url = new URL("/api/metadata/artifacts", this.apiBaseUrl);
    const startedAt = Date.now();
    const accessToken = await this.getUserAccessToken();

    // Add query parameters
    if (request?.includeTrace) {
      url.searchParams.set("includeTrace", "true");
    }
    if (request?.maxArtifacts) {
      url.searchParams.set("maxArtifacts", String(request.maxArtifacts));
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include", // Include cookies for session
    });

    this.logInfo("Metadata artifacts request completed", {
      operation: "loadArtifacts",
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      includeTrace: request?.includeTrace ?? true,
      maxArtifacts: request?.maxArtifacts ?? 0,
    });

    if (!response.ok) {
      throw await this.createHttpError(response, "Load artifacts");
    }

    return response.json() as Promise<LoadArtifactsResponse>;
  }

  /**
   * Refresh artifacts (force sync with Fabric platform)
   * Useful when user knows data is stale or needs immediate refresh
   * @returns Response with refreshed artifacts
   */
  async refreshArtifacts(): Promise<LoadArtifactsResponse> {
    const url = new URL("/api/metadata/artifacts/refresh", this.apiBaseUrl);
    const startedAt = Date.now();
    const accessToken = await this.getUserAccessToken();

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
    });

    this.logInfo("Metadata refresh request completed", {
      operation: "refreshArtifacts",
      status: response.status,
      elapsedMs: Date.now() - startedAt,
    });

    if (!response.ok) {
      throw await this.createHttpError(response, "Refresh artifacts");
    }

    return response.json() as Promise<LoadArtifactsResponse>;
  }

  /**
   * Get sync status (for future caching/offline support)
   * @returns Last sync timestamp and status
   */
  async getSyncStatus(): Promise<{
    lastSyncAt: Date | null;
    isStale: boolean;
    artifactCount: number;
  }> {
    const url = new URL("/api/metadata/status", this.apiBaseUrl);
    const startedAt = Date.now();
    const accessToken = await this.getUserAccessToken();

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
    });

    this.logInfo("Metadata status request completed", {
      operation: "getSyncStatus",
      status: response.status,
      elapsedMs: Date.now() - startedAt,
    });

    if (!response.ok) {
      throw await this.createHttpError(response, "Get sync status");
    }

    const data = await response.json();
    return {
      ...data,
      lastSyncAt: data.lastSyncAt ? new Date(data.lastSyncAt) : null,
    };
  }

  async loadLineageLinks(request: LoadLineageLinksRequest): Promise<LoadLineageLinksResponse> {
    const url = new URL("/api/metadata/lineage-links", this.apiBaseUrl);
    const startedAt = Date.now();
    const accessToken = await this.getPowerBiLineageToken();

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify({ artifacts: request.artifacts }),
    });

    this.logInfo("Metadata lineage-links request completed", {
      operation: "loadLineageLinks",
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      artifacts: request.artifacts.length,
    });

    if (!response.ok) {
      throw await this.createHttpError(response, "Load lineage links");
    }

    return response.json() as Promise<LoadLineageLinksResponse>;
  }

  async loadLineageLinksWithPermissions(
    request: LoadLineageLinksRequest
  ): Promise<LoadLineageLinksWithPermissionsResponse> {
    const url = new URL("/api/metadata/lineage-links-with-permissions", this.apiBaseUrl);
    const startedAt = Date.now();
    const accessToken = await this.getPowerBiLineageToken();

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify({ artifacts: request.artifacts }),
    });

    this.logInfo("Metadata lineage-links-with-permissions request completed", {
      operation: "loadLineageLinksWithPermissions",
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      artifacts: request.artifacts.length,
    });

    if (!response.ok) {
      throw await this.createHttpError(response, "Load lineage links with permissions");
    }

    return response.json() as Promise<LoadLineageLinksWithPermissionsResponse>;
  }

  async loadSemanticModelReportUsage(
    request: LoadSemanticModelReportUsageRequest
  ): Promise<LoadSemanticModelReportUsageResponse> {
    const url = new URL("/api/metadata/semantic-model-report-usage", this.apiBaseUrl);
    const startedAt = Date.now();
    const accessToken = await this.getReportDefinitionToken();

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify(request),
    });

    this.logInfo("Metadata semantic-model-report-usage request completed", {
      operation: "loadSemanticModelReportUsage",
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      workspaceId: request.model.workspaceId,
      modelId: request.model.id,
      entities: request.entities.length,
      dependencies: request.dependencies.length,
      artifacts: request.artifacts.length,
      lineageLinks: request.lineageLinks.length,
    });

    if (!response.ok) {
      throw await this.createHttpError(response, "Load semantic model report usage");
    }

    return response.json() as Promise<LoadSemanticModelReportUsageResponse>;
  }

  async loadReportDefinition(
    request: LoadReportDefinitionRequest
  ): Promise<LoadReportDefinitionResponse> {
    const url = new URL("/api/metadata/report-definition", this.apiBaseUrl);
    const startedAt = Date.now();
    const accessToken = await this.getReportDefinitionToken();

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify({
        workspaceId: request.workspaceId,
        reportId: request.reportId,
      }),
    });

    this.logInfo("Metadata report-definition request completed", {
      operation: "loadReportDefinition",
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      workspaceId: request.workspaceId,
      reportId: request.reportId,
    });

    if (response.status === 404) {
      this.logError("Backend report-definition endpoint returned 404; falling back to direct Fabric call", {
        operation: "loadReportDefinition",
        workspaceId: request.workspaceId,
        reportId: request.reportId,
      });

      return this.loadReportDefinitionDirect(request, accessToken);
    }

    if (!response.ok) {
      throw await this.createHttpError(response, "Load report definition");
    }

    return response.json() as Promise<LoadReportDefinitionResponse>;
  }

  /**
   * Store report scan results in database
   * @param scanData Report scan data to persist
   * @returns Report UID
   */
  async persistReportScan(scanData: {
    reportId: string;
    workspaceId: string;
    reportName: string;
    datasetName?: string;
    datasetId?: string;
    scannedByUser?: string;
    definitionFormat?: string;
    definitionSource?: string;
    definitionAttempts?: number;
    pages?: Array<{
      id?: string;
      name: string;
      visuals?: Array<{
        id?: string;
        title?: string;
        name?: string;
        type: string;
        elements?: Array<{
          key?: string;
          kind?: string;
          type?: string;
          tableName?: string;
          fieldName?: string;
          name?: string;
          sourcePath?: string;
          queryRef?: string;
        }>;
      }>;
    }>;
    filters?: Array<{
      name?: string;
      tableName?: string;
      fieldName: string;
      expression?: string;
      pageId?: string;
    }>;
    success?: boolean;
    errorMessage?: string;
    durationMs?: number;
  }): Promise<{ reportUID: string; success: boolean }> {
    const url = new URL("/api/metadata/report-scanner/persist", this.apiBaseUrl);
    const startedAt = Date.now();
    const accessToken = await this.getUserAccessToken();

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify({ scanData }),
    });

    this.logInfo("Report scanner persist request completed", {
      operation: "persistReportScan",
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      reportId: scanData.reportId,
      workspaceId: scanData.workspaceId,
    });

    if (!response.ok) {
      throw await this.createHttpError(response, "Persist report scan");
    }

    return response.json() as Promise<{ reportUID: string; success: boolean }>;
  }

  /**
   * Get scan history for a specific report
   * @param workspaceId Workspace ID
   * @param reportId Report ID
   * @returns Scan history records
   */
  async getReportScanHistory(
    workspaceId: string,
    reportId: string
  ): Promise<{
    history: Array<{
      UID: string;
      Name: string;
      DatasetName: string;
      ScannedAtUtc: string;
      ScannedByUser: string;
      Success: boolean;
      ErrorMessage: string;
      DurationMs: number;
      PageCount: number;
      VisualCount: number;
    }>;
  }> {
    const url = new URL(`/api/metadata/report-scanner/history/${workspaceId}/${reportId}`, this.apiBaseUrl);
    const startedAt = Date.now();
    const accessToken = await this.getUserAccessToken();

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
    });

    this.logInfo("Report scanner history request completed", {
      operation: "getReportScanHistory",
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      workspaceId,
      reportId,
    });

    if (!response.ok) {
      throw await this.createHttpError(response, "Get report scan history");
    }

    return response.json();
  }

  /**
   * Get field usage across all scanned reports
   * @param tableName Optional table name filter
   * @param fieldName Optional field name filter
   * @returns Field usage records
   */
  async getFieldUsage(
    tableName?: string,
    fieldName?: string
  ): Promise<{
    usage: Array<{
      SourceTable: string;
      SourceField: string;
      ReportCount: number;
      VisualCount: number;
      Reports: string;
    }>;
  }> {
    const url = new URL("/api/metadata/report-scanner/field-usage", this.apiBaseUrl);
    if (tableName) url.searchParams.set("tableName", tableName);
    if (fieldName) url.searchParams.set("fieldName", fieldName);

    const startedAt = Date.now();
    const accessToken = await this.getUserAccessToken();

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
    });

    this.logInfo("Field usage request completed", {
      operation: "getFieldUsage",
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      tableName,
      fieldName,
    });

    if (!response.ok) {
      throw await this.createHttpError(response, "Get field usage");
    }

    return response.json();
  }

  /**
   * Get dataset usage summary
   * @returns Dataset usage statistics
   */
  async getDatasetUsageSummary(): Promise<{
    usage: Array<{
      DatasetName: string;
      DatasetId: string;
      ReportCount: number;
      PageCount: number;
      VisualCount: number;
      LastScannedAtUtc: string;
    }>;
  }> {
    const url = new URL("/api/metadata/report-scanner/dataset-usage", this.apiBaseUrl);
    const startedAt = Date.now();
    const accessToken = await this.getUserAccessToken();

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
    });

    this.logInfo("Dataset usage request completed", {
      operation: "getDatasetUsageSummary",
      status: response.status,
      elapsedMs: Date.now() - startedAt,
    });

    if (!response.ok) {
      throw await this.createHttpError(response, "Get dataset usage summary");
    }

    return response.json();
  }

  async getReportScannerPersistenceStatus(): Promise<{
    configured: boolean;
    backendIdentityConfigured: boolean;
    server?: string;
    database?: string;
    schema?: string;
    persistReportScanner?: boolean;
    persistSnapshots?: boolean;
    validationSucceeded?: boolean;
    message?: string;
  }> {
    const url = new URL("/api/metadata/report-scanner/persistence-status", this.apiBaseUrl);
    const startedAt = Date.now();
    const accessToken = await this.getUserAccessToken();

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
    });

    this.logInfo("Report scanner persistence status request completed", {
      operation: "getReportScannerPersistenceStatus",
      status: response.status,
      elapsedMs: Date.now() - startedAt,
    });

    if (!response.ok) {
      throw await this.createHttpError(response, "Get report scanner persistence status");
    }

    return response.json();
  }

  async configureReportScannerPersistence(config: {
    enabled: boolean;
    server?: string;
    database?: string;
    schema?: string;
    persistReportScanner?: boolean;
    persistSnapshots?: boolean;
  }): Promise<{
    configured: boolean;
    backendIdentityConfigured: boolean;
    server?: string;
    database?: string;
    schema?: string;
    persistReportScanner?: boolean;
    persistSnapshots?: boolean;
    validationSucceeded?: boolean;
    message?: string;
  }> {
    const url = new URL("/api/metadata/report-scanner/persistence-configure", this.apiBaseUrl);
    const startedAt = Date.now();
    const accessToken = await this.getUserAccessToken();

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify(config),
    });

    this.logInfo("Report scanner persistence configure request completed", {
      operation: "configureReportScannerPersistence",
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      enabled: config.enabled,
      server: config.server,
      database: config.database,
    });

    if (!response.ok) {
      throw await this.createHttpError(response, "Configure report scanner persistence");
    }

    return response.json();
  }

  async testSqlPersistenceConnection(): Promise<{
    configured: boolean;
    backendIdentityConfigured: boolean;
    server?: string;
    database?: string;
    schema?: string;
    persistReportScanner?: boolean;
    persistSnapshots?: boolean;
    validationSucceeded?: boolean;
    message?: string;
  }> {
    const url = new URL("/api/metadata/sql-persistence/test-connection", this.apiBaseUrl);
    const startedAt = Date.now();
    const accessToken = await this.getUserAccessToken();

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
    });

    this.logInfo("SQL persistence test request completed", {
      operation: "testSqlPersistenceConnection",
      status: response.status,
      elapsedMs: Date.now() - startedAt,
    });

    if (!response.ok) {
      throw await this.createHttpError(response, "Test SQL persistence connection");
    }

    return response.json();
  }

  async setupSqlPersistenceSchema(schema?: string): Promise<{
    configured: boolean;
    backendIdentityConfigured: boolean;
    server?: string;
    database?: string;
    schema?: string;
    persistReportScanner?: boolean;
    persistSnapshots?: boolean;
    validationSucceeded?: boolean;
    message?: string;
  }> {
    const url = new URL("/api/metadata/sql-persistence/setup-schema", this.apiBaseUrl);
    const startedAt = Date.now();
    const accessToken = await this.getUserAccessToken();

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify({ schema }),
    });

    this.logInfo("SQL persistence setup request completed", {
      operation: "setupSqlPersistenceSchema",
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      schema,
    });

    if (!response.ok) {
      throw await this.createHttpError(response, "Set up SQL persistence schema");
    }

    return response.json();
  }

  async getSqlPersistenceSchemaScript(schema?: string): Promise<{
    schema: string;
    script: string;
    tables: string[];
  }> {
    const url = new URL("/api/metadata/sql-persistence/schema-script", this.apiBaseUrl);
    if (schema) {
      url.searchParams.set("schema", schema);
    }

    const startedAt = Date.now();
    const accessToken = await this.getUserAccessToken();

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
    });

    this.logInfo("SQL schema script request completed", {
      operation: "getSqlPersistenceSchemaScript",
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      schema,
    });

    if (!response.ok) {
      throw await this.createHttpError(response, "Get SQL persistence schema script");
    }

    return response.json();
  }

  async persistInsightWorkbenchSnapshot(snapshot: {
    snapshotId: string;
    snapshotKind: "Section" | "Entity";
    sectionName?: string;
    entityType?: string;
    entityId?: string;
    workspaceId?: string;
    displayName?: string;
    label?: string;
    savedAtUtc: string;
    oneLakeFilePath: string;
    contentFormat: "json" | "tmdl";
    payload: string;
    source?: string;
  }): Promise<{ persisted: boolean; message?: string }> {
    const url = new URL("/api/metadata/sql-persistence/mirror-snapshot", this.apiBaseUrl);
    const startedAt = Date.now();
    const accessToken = await this.getUserAccessToken();

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify({ snapshot }),
    });

    this.logInfo("Insight Workbench snapshot mirror request completed", {
      operation: "persistInsightWorkbenchSnapshot",
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      snapshotId: snapshot.snapshotId,
      snapshotKind: snapshot.snapshotKind,
    });

    if (!response.ok) {
      throw await this.createHttpError(response, "Mirror Insight Workbench snapshot to SQL");
    }

    return response.json();
  }
}
