/**
 * MetadataExplorerClient - Frontend HTTP client for metadata API
 * Thin wrapper around backend REST API calls
 * Handles authentication and error handling for UI consumption
 */

import type {
  LoadArtifactsResponse,
  LoadArtifactsRequest,
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
}
