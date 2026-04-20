/**
 * LakehouseAnalyzerService (Backend)
 *
 * Fetches entity metadata for Lakehouse and Warehouse artifacts from the Fabric REST API:
 *   - Lakehouses  → GET /v1/workspaces/{wsId}/lakehouses/{id}/tables  (Delta / Managed tables)
 *   - Warehouses  → GET /v1/workspaces/{wsId}/warehouses/{id}         (SQL endpoint info)
 *
 * Cross-artifact usage is derived from the lineage data already available through
 * MetadataService (relationship types that reference Lakehouse/Warehouse targets).
 *
 * Implements Req 2.1–2.4 (Phase 3 – Lakehouse/Warehouse Analyzer).
 */

"use strict";

const sql = require("mssql");

const FABRIC_API_BASE_URL = "https://api.fabric.microsoft.com/v1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Perform a Fabric REST GET with authorization.
 *
 * @param {string} token  Bearer token
 * @param {string} path   Relative path (starts with /)
 * @returns {Promise<object>} Parsed response body
 */
async function fabricGet(token, path) {
  const url = `${FABRIC_API_BASE_URL}${path}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Fabric GET ${path} failed (${response.status}): ${body}`);
  }

  return response.json();
}

/**
 * Collect all pages of a Fabric paginated endpoint.
 * Follows `continuationToken` / `continuationUri` pattern.
 *
 * @param {string} token  Bearer token
 * @param {string} initialPath  Starting path
 * @returns {Promise<Array>} All collected value items
 */
async function fabricGetAllPages(token, initialPath) {
  const allItems = [];
  let nextUri = `${FABRIC_API_BASE_URL}${initialPath}`;

  while (nextUri) {
    const response = await fetch(nextUri, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Fabric paginated GET ${nextUri} failed (${response.status}): ${body}`);
    }

    const payload = await response.json();

    const items = Array.isArray(payload?.value)
      ? payload.value
      : Array.isArray(payload?.data)
      ? payload.data
      : [];

    allItems.push(...items);

    // Follow continuation URI or stop
    nextUri = payload?.continuationUri || null;
  }

  return allItems;
}

function makeEntityId(artifactId, entityType, schema, name) {
  const s = (schema || "default").toLowerCase();
  const n = (name || "").toLowerCase();
  return `${artifactId}|${entityType}|${s}.${n}`;
}

function toIsoOrNull(value) {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

async function fetchLakehouseMetadata(token, workspaceId, lakehouseId) {
  const diagnostics = [];
  let sqlEndpoint;
  let defaultSchema;

  try {
    const lakehouses = await fabricGetAllPages(token, `/workspaces/${workspaceId}/lakehouses`);
    const lakehouse = lakehouses.find((item) => item.id === lakehouseId);

    if (!lakehouse) {
      diagnostics.push(
        "Could not find the selected Lakehouse in workspace metadata while handling a schema-enabled fallback."
      );
      return { sqlEndpoint, defaultSchema, diagnostics };
    }

    sqlEndpoint =
      lakehouse?.properties?.sqlEndpointProperties?.connectionString ||
      lakehouse?.properties?.connectionString ||
      undefined;
    defaultSchema = lakehouse?.properties?.defaultSchema || undefined;
  } catch (error) {
    const msg = `Could not fetch Lakehouse metadata: ${error?.message || error}`;
    diagnostics.push(msg);
    console.warn(`[LakehouseAnalyzerService] ${msg}`);
  }

  return { sqlEndpoint, defaultSchema, diagnostics };
}

// ---------------------------------------------------------------------------
// Lakehouse entity extraction
// ---------------------------------------------------------------------------

/**
 * Fetch Delta/Managed/External tables for a single Lakehouse artifact.
 *
 * API: GET /v1/workspaces/{workspaceId}/lakehouses/{lakehouseId}/tables
 * Docs: https://learn.microsoft.com/en-us/rest/api/fabric/lakehouse/tables/list-tables
 *
 * @param {string} token         Fabric bearer token
 * @param {string} workspaceId
 * @param {string} lakehouseId
 * @returns {{ entities: Array, diagnostics: string[] }}
 */
async function fetchLakehouseTables(token, workspaceId, lakehouseId) {
  const entities = [];
  const diagnostics = [];

  try {
    const tables = await fabricGetAllPages(
      token,
      `/workspaces/${workspaceId}/lakehouses/${lakehouseId}/tables`
    );

    for (const table of tables) {
      const name = table.name || table.tableName || table.displayName || "unknown";
      const schema = table.schema || "default";
      const format = table.format || (table.type === "Managed" ? "Delta" : "Unknown");

      // Derive entity type from format + managedType flags
      let entityType = "DeltaTable";
      if (format && String(format).toLowerCase() !== "delta") {
        entityType = "ManagedTable";
      }
      if (table.location && !table.isManaged) {
        entityType = "ExternalTable";
      }

      entities.push({
        id: makeEntityId(lakehouseId, entityType, schema, name),
        displayName: name,
        type: entityType,
        artifactId: lakehouseId,
        schema,
        format,
        location: table.location || undefined,
        createdAt: toIsoOrNull(table.createdDateTime),
        modifiedAt: toIsoOrNull(table.lastModifiedDateTime),
        rowCount: table.rowCount !== undefined ? table.rowCount : null,
      });
    }
  } catch (error) {
    // Schema-enabled Lakehouses do not support the flat /tables endpoint.
    // Detect the specific error code and fall back to supported item metadata.
    if (
      error?.message &&
      error.message.includes("UnsupportedOperationForSchemasEnabledLakehouse")
    ) {
      const metadataResult = await fetchLakehouseMetadata(token, workspaceId, lakehouseId);
      const fallbackDiagnostics = [
        "This Lakehouse has schemas enabled. The current Fabric Lakehouse tables preview API does not support table enumeration for schema-enabled Lakehouses.",
        metadataResult.defaultSchema
          ? `Default schema: ${metadataResult.defaultSchema}. Use the SQL endpoint to query INFORMATION_SCHEMA.TABLES or sys views.`
          : "Use the SQL endpoint to query INFORMATION_SCHEMA.TABLES or sys views.",
        ...metadataResult.diagnostics,
      ];

      return {
        entities: [],
        sqlEndpoint: metadataResult.sqlEndpoint,
        diagnostics: fallbackDiagnostics,
      };
    }

    const msg = `Could not fetch Lakehouse tables: ${error?.message || error}`;
    diagnostics.push(msg);
    console.warn(`[LakehouseAnalyzerService] ${msg}`);
  }

  return { entities, diagnostics };
}

// ---------------------------------------------------------------------------
// Warehouse entity extraction
// ---------------------------------------------------------------------------

function parseSqlConnectionInfo(connectionString, fallbackDatabaseName) {
  if (!connectionString) {
    return { server: undefined, database: fallbackDatabaseName };
  }

  let server = String(connectionString).trim();
  let database = fallbackDatabaseName;
  const segments = server.split(";").map((segment) => segment.trim()).filter(Boolean);

  if (segments.length > 1) {
    const serverSegment = segments.find(
      (segment) =>
        /^server=/i.test(segment) ||
        /^data source=/i.test(segment) ||
        /^addr=/i.test(segment) ||
        /^network address=/i.test(segment)
    );
    const databaseSegment = segments.find(
      (segment) => /^initial catalog=/i.test(segment) || /^database=/i.test(segment)
    );

    if (serverSegment) {
      server = serverSegment.substring(serverSegment.indexOf("=") + 1).trim();
    }

    if (databaseSegment) {
      database = databaseSegment.substring(databaseSegment.indexOf("=") + 1).trim();
    }
  }

  server = server.replace(/^tcp:/i, "").replace(/,1433$/, "").trim();

  return { server, database };
}

async function queryWarehouseEntities(sqlEndpoint, databaseName, sqlAccessToken, warehouseId) {
  const { server, database } = parseSqlConnectionInfo(sqlEndpoint, databaseName);
  if (!server || !database) {
    throw new Error("Warehouse SQL connection info is incomplete. Server or Initial Catalog is missing.");
  }

  const pool = new sql.ConnectionPool({
    server,
    database,
    port: 1433,
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
    authentication: {
      type: "azure-active-directory-access-token",
      options: {
        token: sqlAccessToken,
      },
    },
    pool: {
      max: 1,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    connectionTimeout: 30000,
    requestTimeout: 30000,
  });

  try {
    await pool.connect();

    const tablesResult = await pool.request().query(`
      SELECT
        TABLE_SCHEMA AS schemaName,
        TABLE_NAME AS entityName,
        TABLE_TYPE AS tableType
      FROM INFORMATION_SCHEMA.TABLES
      ORDER BY TABLE_SCHEMA, TABLE_NAME;
    `);

    const proceduresResult = await pool.request().query(`
      SELECT
        SPECIFIC_SCHEMA AS schemaName,
        SPECIFIC_NAME AS procedureName
      FROM INFORMATION_SCHEMA.ROUTINES
      WHERE ROUTINE_TYPE = 'PROCEDURE'
      ORDER BY SPECIFIC_SCHEMA, SPECIFIC_NAME;
    `);

    const columnsResult = await pool.request().query(`
      SELECT
        TABLE_SCHEMA AS schemaName,
        TABLE_NAME AS tableName,
        COLUMN_NAME AS columnName,
        DATA_TYPE AS dataType,
        IS_NULLABLE AS isNullable,
        ORDINAL_POSITION AS ordinalPosition
      FROM INFORMATION_SCHEMA.COLUMNS
      ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION;
    `);

    const entities = [];
    const parentIds = new Map();

    for (const row of tablesResult.recordset || []) {
      const entityType = row.tableType === "VIEW" ? "View" : "ManagedTable";
      const entityId = makeEntityId(warehouseId, entityType, row.schemaName, row.entityName);
      parentIds.set(`${row.schemaName}.${row.entityName}`, entityId);
      entities.push({
        id: entityId,
        displayName: row.entityName,
        type: entityType,
        artifactId: warehouseId,
        schema: row.schemaName,
      });
    }

    for (const row of proceduresResult.recordset || []) {
      entities.push({
        id: makeEntityId(warehouseId, "StoredProcedure", row.schemaName, row.procedureName),
        displayName: row.procedureName,
        type: "StoredProcedure",
        artifactId: warehouseId,
        schema: row.schemaName,
      });
    }

    for (const row of columnsResult.recordset || []) {
      const parentKey = `${row.schemaName}.${row.tableName}`;
      const parentId = parentIds.get(parentKey) || makeEntityId(warehouseId, "ManagedTable", row.schemaName, row.tableName);
      entities.push({
        id: makeEntityId(warehouseId, "Column", row.schemaName, `${row.tableName}.${row.columnName}`),
        displayName: row.columnName,
        type: "Column",
        artifactId: warehouseId,
        schema: row.schemaName,
        parentId,
        dataType: row.dataType,
        nullable: String(row.isNullable).toUpperCase() === "YES",
        ordinalPosition: row.ordinalPosition,
      });
    }

    return entities;
  } finally {
    await pool.close();
  }
}

/**
 * Retrieve Warehouse metadata including SQL Analytics Endpoint connection and,
 * when possible, query entity metadata from the Warehouse SQL endpoint.
 *
 * API: GET /v1/workspaces/{workspaceId}/warehouses/{warehouseId}
 *
 * @param {string} token
 * @param {string} workspaceId
 * @param {string} warehouseId
 * @param {string} warehouseDisplayName
 * @param {string} sqlAccessToken
 * @returns {{ entities: Array, sqlEndpoint: string|undefined, diagnostics: string[] }}
 */
async function fetchWarehouseMetadata(token, workspaceId, warehouseId, warehouseDisplayName, sqlAccessToken) {
  const diagnostics = [];
  let sqlEndpoint;
  let resolvedWarehouseName = warehouseDisplayName;
  let entities = [];

  try {
    const item = await fabricGet(
      token,
      `/workspaces/${workspaceId}/warehouses/${warehouseId}`
    );

    sqlEndpoint =
      item?.properties?.connectionString ||
      item?.connectionString ||
      item?.properties?.sqlEndpointConnectionString ||
      undefined;
    resolvedWarehouseName = resolvedWarehouseName || item?.displayName;

    if (!sqlEndpoint) {
      diagnostics.push(
        "Warehouse SQL Analytics Endpoint connection string not available in API response."
      );
      return { entities, sqlEndpoint, diagnostics };
    }

    if (!sqlAccessToken) {
      diagnostics.push(
        "Warehouse SQL access token was not available. Grant or consent to Azure SQL access for the frontend app to enable INFORMATION_SCHEMA queries."
      );
      return { entities, sqlEndpoint, diagnostics };
    }

    if (!resolvedWarehouseName) {
      diagnostics.push(
        "Warehouse display name was not available, so the SQL Initial Catalog could not be determined."
      );
      return { entities, sqlEndpoint, diagnostics };
    }

    entities = await queryWarehouseEntities(
      sqlEndpoint,
      resolvedWarehouseName,
      sqlAccessToken,
      warehouseId
    );
  } catch (error) {
    const msg = `Could not fetch Warehouse metadata: ${error?.message || error}`;
    diagnostics.push(msg);
    console.warn(`[LakehouseAnalyzerService] ${msg}`);
  }

  return { entities, sqlEndpoint, diagnostics };
}

// ---------------------------------------------------------------------------
// Cross-artifact usage (from existing lineage links)
// ---------------------------------------------------------------------------

/**
 * Derive cross-artifact usage for the requested artifact by inspecting
 * all lineage links where it appears as a target (i.e., something uses it).
 *
 * This is a best-effort approach using already-discovered lineage data.
 *
 * @param {string} artifactId
 * @param {Array}  lineageLinks  Full lineage link array from MetadataService
 * @param {Array}  allArtifacts  All known ExplorerArtifact entries
 * @returns {Array<LakehouseArtifactUsage>}
 */
function deriveUsages(artifactId, lineageLinks, allArtifacts) {
  const artifactMap = new Map(allArtifacts.map((a) => [a.id, a]));

  return lineageLinks
    .filter((link) => link.targetArtifactId === artifactId)
    .map((link) => {
      const consumer = artifactMap.get(link.sourceArtifactId);
      return {
        consumerArtifactId: link.sourceArtifactId,
        consumerDisplayName: consumer?.displayName || link.sourceArtifactId,
        consumerType: consumer?.type || "Unknown",
        consumerWorkspaceId: link.sourceWorkspaceId,
        consumerWorkspaceName: consumer?.workspaceName,
        relationshipType: link.relationshipType || "dependency",
        confidence: link.confidence || "exact",
        confidenceNote: link.confidenceNote,
      };
    });
}

// ---------------------------------------------------------------------------
// Main analyzer
// ---------------------------------------------------------------------------

class LakehouseAnalyzerService {
  /**
   * Analyze a single Lakehouse or Warehouse artifact.
   *
   * @param {object} params
   * @param {string} params.workspaceId
   * @param {string} params.artifactId
   * @param {string} params.artifactType   'Lakehouse' | 'Warehouse'
   * @param {string} params.artifactDisplayName
   * @param {string} params.workspaceName
   * @param {string} params.accessToken     User-delegated bearer token (forwarded from frontend)
   * @param {boolean} params.includeColumns  Not yet implemented for Lakehouse (always false)
   * @param {Array}  params.lineageLinks     Pre-loaded lineage links (may be empty)
   * @param {Array}  params.allArtifacts     All discovered artifacts for usage mapping
   * @returns {Promise<object>}  LakehouseInventoryResult
   */
  async analyze({
    workspaceId,
    artifactId,
    artifactType,
    artifactDisplayName,
    workspaceName,
    accessToken,
      sqlAccessToken,
    lineageLinks = [],
    allArtifacts = [],
  }) {
    const analyzedAt = new Date().toISOString();
    const allDiagnostics = [];
    let entities = [];
    let sqlEndpoint;
    let isPartial = false;

    if (!accessToken) {
      allDiagnostics.push(
        "No user access token was forwarded. Entity inventory requires a delegated Fabric token. " +
        "Ensure the frontend passes the token header."
      );
      isPartial = true;
    } else if (String(artifactType).toLowerCase() === "lakehouse") {
      const result = await fetchLakehouseTables(accessToken, workspaceId, artifactId);
      entities = result.entities;
      sqlEndpoint = result.sqlEndpoint;
      allDiagnostics.push(...result.diagnostics);
      if (result.diagnostics.length > 0 || result.sqlEndpoint) {
        isPartial = true;
      }
    } else if (String(artifactType).toLowerCase() === "warehouse") {
      const result = await fetchWarehouseMetadata(
        accessToken,
        workspaceId,
        artifactId,
        artifactDisplayName,
        sqlAccessToken
      );
      entities = result.entities;
      sqlEndpoint = result.sqlEndpoint;
      allDiagnostics.push(...result.diagnostics);
      if (result.diagnostics.length > 0 || !result.sqlEndpoint) {
        isPartial = true;
      }
    } else {
      allDiagnostics.push(
        `Unsupported artifact type '${artifactType}'. Only 'Lakehouse' and 'Warehouse' are supported.`
      );
      isPartial = true;
    }

    // Cross-artifact usage
    const usages = deriveUsages(artifactId, lineageLinks, allArtifacts);

    return {
      artifactId,
      artifactDisplayName,
      artifactType,
      workspaceId,
      workspaceName,
      sqlEndpoint,
      entities,
      usages,
      analyzedAt,
      isPartial,
      diagnostics: allDiagnostics,
    };
  }
}

module.exports = LakehouseAnalyzerService;
