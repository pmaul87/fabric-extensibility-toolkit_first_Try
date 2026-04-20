/**
 * LakehouseAnalyzerClient - Frontend HTTP client for the Lakehouse/Warehouse Analyzer API.
 *
 * Handles delegated token acquisition and dispatches REST calls to the dev-server backend.
 * Mirrors the structure of MetadataExplorerClient and SemanticAnalyzerClient.
 */

import type {
  AnalyzeLakehouseRequest,
  AnalyzeLakehouseResponse,
  LoadLakehouseArtifactsResponse,
} from "../services/LakehouseAnalyzerService";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { FABRIC_BASE_SCOPES } from "./FabricPlatformScopes";

function formatUnknownError(error: unknown): string {
  if (!error) return "unknown error";

  if (error instanceof Error) return error.message || "unknown error";

  if (typeof error === "object") {
    const maybeError = error as Record<string, unknown>;
    const status = maybeError.status ?? maybeError.statusCode;
    const message =
      (typeof maybeError.message === "string" && maybeError.message) ||
      (typeof maybeError.error === "string" && maybeError.error) ||
      (typeof maybeError.details === "string" && maybeError.details);

    if (status && message) return `${status}: ${message}`;
    if (message) return message;
    if (status) return String(status);
  }

  return String(error);
}

export class LakehouseAnalyzerClient {
  private readonly apiBaseUrl: string;
  private readonly workloadClient: WorkloadClientAPI;
  private authContextPromise: Promise<void> | null = null;

  constructor(workloadClient: WorkloadClientAPI, apiBaseUrl?: string) {
    this.workloadClient = workloadClient;
    this.apiBaseUrl = apiBaseUrl || `${window.location.protocol}//${window.location.host}`;
  }

  private log(message: string, details?: Record<string, unknown>): void {
    if (details) {
      console.log(`[LakehouseAnalyzerClient] ${message}`, details);
    } else {
      console.log(`[LakehouseAnalyzerClient] ${message}`);
    }
  }

  private logError(message: string, details?: Record<string, unknown>): void {
    if (details) {
      console.error(`[LakehouseAnalyzerClient] ${message}`, details);
    } else {
      console.error(`[LakehouseAnalyzerClient] ${message}`);
    }
  }

  private async ensureAuthContext(): Promise<void> {
    if (!this.authContextPromise) {
      this.authContextPromise = this.workloadClient.auth
        .acquireFrontendAccessToken({ scopes: [] })
        .then((): void => undefined)
        .catch((error: unknown): void => {
          this.logError("Auth context init failed", { error: formatUnknownError(error) });
        });
    }
    return this.authContextPromise;
  }

  /** Acquire a delegated Fabric token covering Lakehouse read access. */
  private async getFabricToken(): Promise<string> {
    const scopes = [
      FABRIC_BASE_SCOPES.WORKSPACE_READ,
      FABRIC_BASE_SCOPES.ITEM_READ,
      FABRIC_BASE_SCOPES.LAKEHOUSE_READ,
    ];

    await this.ensureAuthContext();

    const accessToken = await this.workloadClient.auth.acquireFrontendAccessToken({ scopes });
    if (!accessToken?.token) {
      throw new Error("Access token response did not include token value for Lakehouse scopes.");
    }

    return accessToken.token;
  }

  private async getSqlToken(): Promise<string> {
    await this.ensureAuthContext();

    const candidateScopeSets = [
      [FABRIC_BASE_SCOPES.SQL_DATABASE_USER],
      [FABRIC_BASE_SCOPES.SQL_DATABASE],
    ];

    const errors: string[] = [];

    for (const scopes of candidateScopeSets) {
      try {
        const accessToken = await this.workloadClient.auth.acquireFrontendAccessToken({ scopes });
        if (accessToken?.token) {
          this.log("Acquired Azure SQL token", { scope: scopes[0] });
          return accessToken.token;
        }
        errors.push(`scope ${scopes[0]} returned empty token`);
      } catch (error) {
        errors.push(`scope ${scopes[0]} failed: ${formatUnknownError(error)}`);
      }
    }

    throw new Error(`Unable to acquire Azure SQL access token. ${errors.join(" | ")}`);
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
        `${endpoint} returned non-JSON content. ` +
          `Restart the dev server and try again. Response preview: ${preview}`
      );
    }

    try {
      return JSON.parse(bodyText) as T;
    } catch (error) {
      const parseError = error instanceof Error ? error.message : String(error);
      throw new Error(`${endpoint} returned invalid JSON: ${parseError}`);
    }
  }

  /**
   * List all Lakehouse and Warehouse artifacts visible to the current user.
   */
  async loadArtifacts(): Promise<LoadLakehouseArtifactsResponse> {
    const endpoint = "/api/lakehouse/artifacts";

    let token: string;
    try {
      token = await this.getFabricToken();
    } catch (tokenError) {
      throw new Error(
        `Failed to acquire Fabric token for Lakehouse artifacts: ${formatUnknownError(tokenError)}`
      );
    }

    this.log("Fetching Lakehouse/Warehouse artifacts");

    const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    return this.readJsonResponse<LoadLakehouseArtifactsResponse>(response, endpoint);
  }

  /**
   * Analyze one Lakehouse or Warehouse artifact.
   * Returns entity inventory + cross-artifact usage mapping.
   */
  async analyzeArtifact(
    request: Omit<AnalyzeLakehouseRequest, "accessToken">
  ): Promise<AnalyzeLakehouseResponse> {
    const endpoint = "/api/lakehouse/analyze";

    let token: string;
    let sqlToken: string | undefined;
    try {
      token = await this.getFabricToken();
    } catch (tokenError) {
      throw new Error(
        `Failed to acquire Fabric token for Lakehouse analysis: ${formatUnknownError(tokenError)}`
      );
    }

    if (request.artifactType === "Warehouse") {
      try {
        sqlToken = await this.getSqlToken();
      } catch (tokenError) {
        this.logError("Azure SQL token acquisition failed; Warehouse analysis may be partial", {
          error: formatUnknownError(tokenError),
        });
      }
    }

    this.log("Analyzing artifact", {
      artifactId: request.artifactId,
      workspaceId: request.workspaceId,
      artifactType: request.artifactType,
      hasSqlToken: Boolean(sqlToken),
    });

    const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(sqlToken ? { "X-Sql-Authorization": `Bearer ${sqlToken}` } : {}),
      },
      body: JSON.stringify(request),
    });

    return this.readJsonResponse<AnalyzeLakehouseResponse>(response, endpoint);
  }
}
