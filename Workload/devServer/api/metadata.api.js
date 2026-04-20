/**
 * Metadata API Routes
 * REST endpoints for artifact discovery and exploration
 * 
 * Architecture:
 * - GET /api/metadata/artifacts - Load all discoverable artifacts
 * - POST /api/metadata/artifacts/refresh - Force refresh from Fabric platform
 * - GET /api/metadata/status - Get current sync status
 */

const express = require("express");
const MetadataService = require("../services/MetadataService");
const { createFabricPlatformClientForRequest } = require("../services/FabricPlatformApiClientFactory");

const router = express.Router();
let fallbackFabricPlatformApiClient = null;
let lastSyncResult = null;
let lastSyncTime = null;

function createRequestContext(req) {
  const correlationId =
    req.headers["x-ms-request-id"] ||
    req.headers["x-request-id"] ||
    `metadata-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    correlationId,
    method: req.method,
    path: req.path,
    hasAuthorizationHeader: Boolean(req.headers?.authorization),
    userAgent: req.headers["user-agent"] || "unknown",
  };
}

/**
 * Initialize metadata API with Fabric Platform API client
 * Call this once during server startup with the authenticated API client
 * @param {object} fabricPlatformApiClient The authenticated Fabric API client
 */
function initializeMetadataApi(fabricPlatformApiClient) {
  fallbackFabricPlatformApiClient = fabricPlatformApiClient;
  console.log("[Metadata API] Initialized with Fabric Platform API client");
}

/**
 * GET /api/metadata/artifacts
 * Load all discoverable artifacts across workspaces
 * 
 * Query Parameters:
 *   - includeTrace: boolean (default: true) - Include API call trace for debugging
 *   - maxArtifacts: number (default: 0) - Limit results (0 = no limit)
 * 
 * Response:
 *   {
 *     artifacts: ExplorerArtifact[],
 *     totalCount: number,
 *     trace: ApiCallTrace[],
 *     syncStartedAt: ISO8601Date,
 *     syncCompletedAt: ISO8601Date,
 *     hasErrors: boolean
 *   }
 */
router.get("/api/metadata/artifacts", async (req, res) => {
  const requestContext = createRequestContext(req);
  const startedAt = Date.now();

  try {
    if (!fallbackFabricPlatformApiClient) {
      console.error("[Metadata API] Service unavailable - fallback client not initialized", requestContext);
      return res.status(501).json({
        error: "Metadata service not initialized",
        message: "Server needs to be restarted or metadata API needs configuration",
      });
    }

    const includeTrace = req.query.includeTrace !== "false";
    const maxArtifacts = parseInt(req.query.maxArtifacts, 10) || 0;

    const { client, mode } = createFabricPlatformClientForRequest(req, fallbackFabricPlatformApiClient);
    const metadataService = new MetadataService(client);

    console.log("[Metadata API] GET /api/metadata/artifacts", {
      ...requestContext,
      includeTrace,
      maxArtifacts,
      authMode: mode,
    });

    const result = await metadataService.loadArtifacts({
      includeTrace,
      maxArtifacts,
    });

    // Cache the result for status endpoint
    lastSyncResult = result;
    lastSyncTime = new Date();

    console.log("[Metadata API] GET /api/metadata/artifacts completed", {
      ...requestContext,
      authMode: mode,
      artifactCount: result.totalCount,
      traceCount: result.trace?.length ?? 0,
      hasErrors: result.hasErrors,
      elapsedMs: Date.now() - startedAt,
    });

    res.status(200).json(result);
  } catch (error) {
    console.error("[Metadata API] Error loading artifacts", {
      ...requestContext,
      elapsedMs: Date.now() - startedAt,
      message: error?.message || "Unknown error",
      stack: error?.stack,
      error,
    });

    res.status(500).json({
      error: "Failed to load artifacts",
      message: error.message || "Unknown error",
      trace: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

/**
 * POST /api/metadata/artifacts/refresh
 * Force refresh artifacts from Fabric platform
 * Bypasses any caching and gets fresh data
 * 
 * Response: Same as GET /api/metadata/artifacts
 */
router.post("/api/metadata/artifacts/refresh", async (req, res) => {
  const requestContext = createRequestContext(req);
  const startedAt = Date.now();

  try {
    if (!fallbackFabricPlatformApiClient) {
      console.error("[Metadata API] Service unavailable on refresh - fallback client not initialized", requestContext);
      return res.status(501).json({
        error: "Metadata service not initialized",
        message: "Server needs to be restarted or metadata API needs configuration",
      });
    }

    const { client, mode } = createFabricPlatformClientForRequest(req, fallbackFabricPlatformApiClient);
    const metadataService = new MetadataService(client);

    console.log("[Metadata API] POST /api/metadata/artifacts/refresh", {
      ...requestContext,
      authMode: mode,
    });

    // Clear cache and force reload
    lastSyncResult = null;
    lastSyncTime = null;

    const result = await metadataService.loadArtifacts({
      includeTrace: true,
      maxArtifacts: 0, // No limit on refresh
    });

    lastSyncResult = result;
    lastSyncTime = new Date();

    console.log("[Metadata API] POST /api/metadata/artifacts/refresh completed", {
      ...requestContext,
      authMode: mode,
      artifactCount: result.totalCount,
      traceCount: result.trace?.length ?? 0,
      hasErrors: result.hasErrors,
      elapsedMs: Date.now() - startedAt,
    });

    res.status(200).json(result);
  } catch (error) {
    console.error("[Metadata API] Error refreshing artifacts", {
      ...requestContext,
      elapsedMs: Date.now() - startedAt,
      message: error?.message || "Unknown error",
      stack: error?.stack,
      error,
    });

    res.status(500).json({
      error: "Failed to refresh artifacts",
      message: error.message || "Unknown error",
      trace: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

/**
 * GET /api/metadata/status
 * Get metadata API status and last sync information
 * Useful for UI to determine staleness and cache behavior
 * 
 * Response:
 *   {
 *     lastSyncAt: ISO8601Date | null,
 *     isStale: boolean,
 *     artifactCount: number,
 *     isInitialized: boolean
 *   }
 */
router.get("/api/metadata/status", (req, res) => {
  const requestContext = createRequestContext(req);
  const isInitialized = fallbackFabricPlatformApiClient !== null;
  const now = new Date();
  const staleThresholdMs = 5 * 60 * 1000; // 5 minutes

  let isStale = true;
  let artifactCount = 0;

  if (lastSyncTime && lastSyncResult) {
    isStale = now - lastSyncTime > staleThresholdMs;
    artifactCount = lastSyncResult.totalCount;
  }

  console.log("[Metadata API] GET /api/metadata/status", {
    ...requestContext,
    isInitialized,
    isStale,
    artifactCount,
  });

  res.status(200).json({
    lastSyncAt: lastSyncTime ? lastSyncTime.toISOString() : null,
    isStale,
    artifactCount,
    isInitialized,
    staleThresholdMs,
  });
});

/**
 * Healthcheck for metadata API
 * GET /api/metadata/health
 */
router.get("/api/metadata/health", (req, res) => {
  const requestContext = createRequestContext(req);
  console.log("[Metadata API] GET /api/metadata/health", {
    ...requestContext,
    initialized: fallbackFabricPlatformApiClient !== null,
  });

  res.status(200).json({
    status: "ok",
    service: "metadata",
    initialized: fallbackFabricPlatformApiClient !== null,
  });
});

module.exports = {
  router,
  initializeMetadataApi,
};
