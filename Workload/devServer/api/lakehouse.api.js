/**
 * Lakehouse / Warehouse Analyzer API Routes
 *
 * POST /api/lakehouse/analyze
 *   – Return entity inventory + cross-artifact usage for one Lakehouse or Warehouse.
 *   – Requires Authorization: Bearer <user-delegated-Fabric-token>
 *
 * GET  /api/lakehouse/artifacts
 *   – Return all Lakehouse and Warehouse artifacts visible to the requesting user.
 *   – Uses the same MetadataService discovery used by metadata-explorer.
 *
 * Implements Phase 3 – Req 2.1–2.4.
 */

"use strict";

const express = require("express");
const MetadataService = require("../services/MetadataService");
const LakehouseAnalyzerService = require("../services/LakehouseAnalyzerService");
const { createFabricPlatformClientForRequest } = require("../services/FabricPlatformApiClientFactory");

const router = express.Router();
let fallbackFabricPlatformApiClient = null;

const lakehouseService = new LakehouseAnalyzerService();

const LAKEHOUSE_TYPES = new Set(["Lakehouse", "Warehouse"]);

function createRequestContext(req) {
  const correlationId =
    req.headers["x-ms-request-id"] ||
    req.headers["x-request-id"] ||
    `lh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    correlationId,
    method: req.method,
    path: req.path,
    hasAuthorizationHeader: Boolean(req.headers?.authorization),
    userAgent: req.headers["user-agent"] || "unknown",
  };
}

/**
 * Initialize with the Fabric Platform API client created on server startup.
 * @param {object} fabricPlatformApiClient
 */
function initializeLakehouseApi(fabricPlatformApiClient) {
  fallbackFabricPlatformApiClient = fabricPlatformApiClient;
  console.log("[Lakehouse API] Initialized with Fabric Platform API client");
}

// ---------------------------------------------------------------------------
// GET /api/lakehouse/artifacts
// ---------------------------------------------------------------------------
/**
 * Returns all Lakehouse and Warehouse artifacts visible to the current user.
 * Filters the full artifact set from MetadataService to the relevant types.
 *
 * Response: { artifacts: Array<{ id, displayName, type, workspaceId, workspaceName }> }
 */
router.get("/api/lakehouse/artifacts", async (req, res) => {
  const requestContext = createRequestContext(req);
  const startedAt = Date.now();

  try {
    if (!fallbackFabricPlatformApiClient) {
      return res.status(501).json({
        error: "Lakehouse API not initialized",
        message: "Server needs to be restarted or the Lakehouse API needs configuration.",
      });
    }

    const { client, mode } = createFabricPlatformClientForRequest(req, fallbackFabricPlatformApiClient);
    const metadataService = new MetadataService(client);

    const result = await metadataService.loadArtifacts({ includeTrace: false });

    const filtered = result.artifacts.filter((a) => LAKEHOUSE_TYPES.has(a.type));

    console.log("[Lakehouse API] GET /api/lakehouse/artifacts completed", {
      ...requestContext,
      authMode: mode,
      total: result.artifacts.length,
      filtered: filtered.length,
      elapsedMs: Date.now() - startedAt,
    });

    return res.status(200).json({ artifacts: filtered });
  } catch (error) {
    console.error("[Lakehouse API] Error listing artifacts", {
      ...requestContext,
      elapsedMs: Date.now() - startedAt,
      message: error?.message || "Unknown error",
    });

    return res.status(500).json({
      error: "Failed to list Lakehouse/Warehouse artifacts",
      message: error?.message || "Unknown error",
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/lakehouse/analyze
// ---------------------------------------------------------------------------
/**
 * Analyze one Lakehouse or Warehouse artifact and return the entity inventory
 * together with cross-artifact usage derived from lineage data.
 *
 * Request body:
 * {
 *   workspaceId: string,
 *   artifactId: string,
 *   artifactType: 'Lakehouse' | 'Warehouse',
 *   artifactDisplayName: string,
 *   workspaceName?: string,
 *   includeColumns?: boolean,
 *   artifacts?: ExplorerArtifact[],   // pre-loaded; avoids a second discovery call
 *   lineageLinks?: LineageLink[]       // pre-loaded; avoids a second lineage call
 * }
 *
 * Response: { result: LakehouseInventoryResult }
 */
router.post("/api/lakehouse/analyze", async (req, res) => {
  const requestContext = createRequestContext(req);
  const startedAt = Date.now();

  try {
    const authHeader = req.headers?.authorization;
    if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing delegated token",
        message: "Authorization header with Bearer token is required.",
      });
    }

    const accessToken = authHeader.substring("Bearer ".length).trim();
    const sqlAuthHeader = req.headers?.["x-sql-authorization"];
    const sqlAccessToken =
      typeof sqlAuthHeader === "string" && sqlAuthHeader.startsWith("Bearer ")
        ? sqlAuthHeader.substring("Bearer ".length).trim()
        : undefined;

    const {
      workspaceId,
      artifactId,
      artifactType,
      artifactDisplayName,
      workspaceName,
      includeColumns = false,
      artifacts: preloadedArtifacts,
      lineageLinks: preloadedLinks,
    } = req.body || {};

    if (!workspaceId || !artifactId || !artifactType) {
      return res.status(400).json({
        error: "Invalid payload",
        message: "workspaceId, artifactId, and artifactType are required.",
      });
    }

    // If lineage context was not passed, do a lightweight discovery to derive usage.
    // This adds a second Fabric API round-trip only when the caller does not pre-supply data.
    let allArtifacts = Array.isArray(preloadedArtifacts) ? preloadedArtifacts : [];
    let lineageLinks = Array.isArray(preloadedLinks) ? preloadedLinks : [];

    // If no artifacts pre-supplied and we have a fallback client, try a quick discovery
    if (allArtifacts.length === 0 && fallbackFabricPlatformApiClient) {
      try {
        const { client } = createFabricPlatformClientForRequest(req, fallbackFabricPlatformApiClient);
        const metadataService = new MetadataService(client);
        const discoveryResult = await metadataService.loadArtifacts({ includeTrace: false });
        allArtifacts = discoveryResult.artifacts;
      } catch (discoveryError) {
        // Non-fatal — cross-artifact usage just won't be populated
        console.warn("[Lakehouse API] Artifact discovery for usage mapping skipped:", discoveryError?.message);
      }
    }

    const result = await lakehouseService.analyze({
      workspaceId,
      artifactId,
      artifactType,
      artifactDisplayName: artifactDisplayName || artifactId,
      workspaceName,
      accessToken,
      sqlAccessToken,
      includeColumns,
      lineageLinks,
      allArtifacts,
    });

    console.log("[Lakehouse API] POST /api/lakehouse/analyze completed", {
      ...requestContext,
      artifactId,
      artifactType,
      entityCount: result.entities.length,
      usageCount: result.usages.length,
      isPartial: result.isPartial,
      elapsedMs: Date.now() - startedAt,
    });

    return res.status(200).json({ result });
  } catch (error) {
    console.error("[Lakehouse API] Analysis failed", {
      ...requestContext,
      elapsedMs: Date.now() - startedAt,
      message: error?.message || "Unknown error",
      stack: error?.stack,
      error,
    });

    return res.status(500).json({
      error: "Lakehouse/Warehouse analysis failed",
      message: error?.message || "Unknown error",
    });
  }
});

module.exports = { router, initializeLakehouseApi };
