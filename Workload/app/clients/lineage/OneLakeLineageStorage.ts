import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { OneLakeStorageClient } from "../OneLakeStorageClient";
import { OneLakeStorageClientItemWrapper } from "../OneLakeStorageClientItemWrapper";
import { FABRIC_BASE_SCOPES } from "../FabricPlatformScopes";

/**
 * Format unknown error for logging
 */
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

/**
 * OneLake storage wrapper for lineage data management
 * 
 * Storage structure in lakehouse:
 * - Files/lineage/raw/{artifactType}/{artifactId}.json - Raw extraction data
 * - Files/lineage/processed/graph_{workspaceId}.json - Processed lineage graphs
 * - Files/lineage/snapshots/snapshot_{timestamp}.json - Versioned snapshots
 * - Files/lineage/metadata/extraction_log.json - Extraction logs
 * - Files/lineage/metadata/config.json - Configuration
 */

export interface ExtractionResult {
  artifactId: string;
  artifactType: string;
  workspaceId: string;
  timestamp: string;
  data: any;
  metadata?: {
    extractionDuration?: number;
    status: "success" | "error";
    errorMessage?: string;
  };
}

export interface LineageSnapshot {
  snapshotId: string;
  timestamp: string;
  workspaceIds: string[];
  artifactCount: number;
  graphData: any;
}

export interface ExtractionLog {
  timestamp: string;
  workspaceIds: string[];
  artifactTypes: string[];
  totalArtifacts: number;
  successCount: number;
  errorCount: number;
  duration: number;
  errors?: Array<{
    artifactId: string;
    artifactType: string;
    error: string;
  }>;
}

/**
 * OneLake storage client for lineage data
 * Uses itemWrapper pattern for lakehouse-scoped operations
 */
export class OneLakeLineageStorage {
  private oneLakeClient: OneLakeStorageClient;
  private workloadClient: WorkloadClientAPI;
  private itemWrapper?: OneLakeStorageClientItemWrapper;
  private lakehouseId?: string;
  private workspaceId?: string;
  private authContextPromise: Promise<void> | null = null;
  private readonly apiBaseUrl: string;

  // Storage path constants
  private readonly BASE_PATH = "Files/lineage";
  private readonly RAW_PATH = `${this.BASE_PATH}/raw`;
  private readonly SNAPSHOTS_PATH = `${this.BASE_PATH}/snapshots`;
  private readonly METADATA_PATH = `${this.BASE_PATH}/metadata`;

  constructor(workloadClient: WorkloadClientAPI) {
    this.workloadClient = workloadClient;
    this.oneLakeClient = new OneLakeStorageClient(workloadClient);
    this.apiBaseUrl = `${window.location.protocol}//${window.location.host}`;
  }

  /**
   * Initialize storage for a specific lakehouse item
   * Creates itemWrapper for all subsequent operations
   */
  initializeForItem(lakehouseId: string, workspaceId: string): void {
    this.lakehouseId = lakehouseId;
    this.workspaceId = workspaceId;
    this.itemWrapper = this.oneLakeClient.createItemWrapper({
      id: lakehouseId,
      workspaceId: workspaceId,
    });
    console.log(`OneLakeLineageStorage initialized for lakehouse: ${lakehouseId}`);
  }

  /**
   * Save raw extraction result to lakehouse
   * Path: Files/lineage/raw/{artifactType}/{artifactId}.json
   */
  async saveExtractionResult(result: ExtractionResult): Promise<void> {
    this.ensureInitialized();
    
    const path = `${this.RAW_PATH}/${result.artifactType}/${result.artifactId}.json`;
    const content = JSON.stringify(result, null, 2);
    
    try {
      await this.itemWrapper!.writeFileAsText(path, content);
      console.log(`Saved extraction result: ${path}`);
    } catch (error) {
      console.error(`Failed to save extraction result: ${path}`, error);
      throw error;
    }
  }

  /**
   * Load raw extraction results with optional filtering
   * Returns array of extraction results
   */
  async loadExtractionResults(filter?: {
    artifactType?: string;
    workspaceId?: string;
  }): Promise<ExtractionResult[]> {
    this.ensureInitialized();
    
    // In Phase 1, we'll load all files and filter in memory
    // Phase 2 can optimize with directory listing
    const results: ExtractionResult[] = [];
    
    // For now, return empty array (notebooks will write, UI will read in Phase 1)
    console.log("loadExtractionResults: Reading from lakehouse", filter);
    return results;
  }

  /**
   * Legacy method retained for API compatibility.
   * Lineage graph persistence is Delta-table only.
   */
  async saveLineageGraph(workspaceId: string, graphData: any): Promise<void> {
    void workspaceId;
    void graphData;
    throw new Error(
      "saveLineageGraph is deprecated. Lineage data must be persisted and loaded from Delta tables only."
    );
  }

  /**
   * Load processed lineage graph for a workspace
   * @param workspaceId Optional workspace ID (backend will resolve from lakehouse if not provided)
   * @param sqlEndpoint Optional manual SQL endpoint override (if auto-detection fails)
   */
  async loadLineageGraph(workspaceId?: string, sqlEndpoint?: string): Promise<any> {
    this.ensureInitialized();

    if (!this.lakehouseId) {
      throw new Error("Lakehouse ID is missing. Call initializeForItem() before loading lineage graph.");
    }

    const [fabricToken, sqlToken] = await Promise.all([
      this.getFabricToken(),
      this.getSqlToken(),
    ]);

    const requestBody: any = {
      lakehouseId: this.lakehouseId,
      includeDimensions: true,
    };
    
    // Only include workspaceId if provided (backend can resolve it from lakehouse)
    if (workspaceId) {
      requestBody.workspaceId = workspaceId;
    }
    
    // Include manual SQL endpoint override if provided
    if (sqlEndpoint) {
      requestBody.sqlEndpoint = sqlEndpoint;
    }

    const response = await fetch(`${this.apiBaseUrl}/api/lakehouse/lineage-graph`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${fabricToken}`,
        "X-Sql-Authorization": `Bearer ${sqlToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    const payload = await this.readJsonResponse<{ graph?: any }>(response, "/api/lakehouse/lineage-graph");
    if (!payload?.graph) {
      throw new Error("Lineage graph API returned an empty payload.");
    }

    return payload.graph;
  }

  /**
   * Create a versioned snapshot of current lineage data
   * Path: Files/lineage/snapshots/snapshot_{timestamp}.json
   */
  async createSnapshot(snapshotName?: string): Promise<string> {
    this.ensureInitialized();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const snapshotId = snapshotName || `snapshot_${timestamp}`;
    const path = `${this.SNAPSHOTS_PATH}/${snapshotId}.json`;
    
    // Load all current data (simplified for Phase 1)
    const snapshot: LineageSnapshot = {
      snapshotId,
      timestamp: new Date().toISOString(),
      workspaceIds: [], // Will be populated from actual data
      artifactCount: 0,
      graphData: {}, // Will contain all graph data
    };
    
    const content = JSON.stringify(snapshot, null, 2);
    
    try {
      await this.itemWrapper!.writeFileAsText(path, content);
      console.log(`Created snapshot: ${path}`);
      return snapshotId;
    } catch (error) {
      console.error(`Failed to create snapshot: ${path}`, error);
      throw error;
    }
  }

  /**
   * Save extraction log
   * Path: Files/lineage/metadata/extraction_log.json
   */
  async saveExtractionLog(log: ExtractionLog): Promise<void> {
    this.ensureInitialized();
    
    const path = `${this.METADATA_PATH}/extraction_log_${log.timestamp.replace(/[:.]/g, "-")}.json`;
    const content = JSON.stringify(log, null, 2);
    
    try {
      await this.itemWrapper!.writeFileAsText(path, content);
      console.log(`Saved extraction log: ${path}`);
    } catch (error) {
      console.error(`Failed to save extraction log: ${path}`, error);
      throw error;
    }
  }

  /**
   * Save extraction configuration
   * Path: Files/lineage/metadata/config.json
   */
  async saveConfig(config: any): Promise<void> {
    this.ensureInitialized();
    
    const path = `${this.METADATA_PATH}/config.json`;
    const content = JSON.stringify(config, null, 2);
    
    try {
      await this.itemWrapper!.writeFileAsText(path, content);
      console.log(`Saved config: ${path}`);
    } catch (error) {
      console.error(`Failed to save config: ${path}`, error);
      throw error;
    }
  }

  /**
   * Load extraction configuration
   */
  async loadConfig(): Promise<any> {
    this.ensureInitialized();
    
    const path = `${this.METADATA_PATH}/config.json`;
    
    try {
      const content = await this.itemWrapper!.readFileAsText(path);
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Config not found, returning defaults: ${path}`);
      return null;
    }
  }

  /**
   * Get storage info (lakehouse details)
   */
  getStorageInfo(): { lakehouseId?: string; workspaceId?: string } {
    return {
      lakehouseId: this.lakehouseId,
      workspaceId: this.workspaceId,
    };
  }

  /**
   * Ensure storage is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.itemWrapper) {
      throw new Error(
        "OneLakeLineageStorage not initialized. Call initializeForItem() first."
      );
    }
  }

  private async ensureAuthContext(): Promise<void> {
    if (!this.authContextPromise) {
      this.authContextPromise = this.workloadClient.auth
        .acquireFrontendAccessToken({ scopes: [] })
        .then((): void => undefined)
        .catch((error: unknown): void => {
          console.warn("Failed to initialize auth context for lineage storage:", formatUnknownError(error));
        });
    }
    return this.authContextPromise;
  }

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
          return accessToken.token;
        }
        errors.push(`scope ${scopes[0]} returned empty token`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`scope ${scopes[0]} failed: ${message}`);
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
      throw new Error(`${endpoint} returned non-JSON content. Response preview: ${preview}`);
    }

    try {
      return JSON.parse(bodyText) as T;
    } catch (error) {
      const parseError = error instanceof Error ? error.message : String(error);
      throw new Error(`${endpoint} returned invalid JSON: ${parseError}`);
    }
  }
}
