/**
 * InsightWorkbenchItemDefinition.ts
 *
 * Domain model and persisted definition schema for the Insight Workbench item.
 * This information is stored in Fabric as Item definition.
 * It will be returned once the item definition is loaded.
 *
 * The definition is intentionally typed to support future runtime AI additions
 * without requiring a refactor of the core schema.
 */

// ---------------------------------------------------------------------------
// 1 – Metadata Explorer
// ---------------------------------------------------------------------------

/** Known Fabric artifact types — extensible union. */
export type FabricArtifactType =
  | 'Dataset'
  | 'Warehouse'
  | 'Lakehouse'
  | 'Report'
  | 'Dashboard'
  | 'Dataflow'
  | 'Notebook'
  | 'MLModel'
  | 'Pipeline'
  | string; // extensible

export interface FabricArtifact {
  id: string;
  displayName: string;
  type: FabricArtifactType;
  workspaceId: string;
  workspaceName?: string;
  description?: string;
  /** ISO 8601 last-modified timestamp */
  modifiedAt?: string;
  accessLevel?: 'Admin' | 'Member' | 'Contributor' | 'Viewer' | 'None';
}

export interface MetadataExplorerState {
  /** Last search query entered by the user */
  searchQuery?: string;
  /** Active type filters (empty = show all) */
  typeFilters?: FabricArtifactType[];
  /** Active workspace ID filters (empty = show all) */
  workspaceFilters?: string[];
  /** Current grouping mode */
  groupBy?: 'type' | 'workspace' | 'none';
  /** Persisted artifact catalog used by metadata-driven views */
  artifactCatalog?: MetadataArtifactCatalogState;
}

export interface PersistedExplorerArtifact {
  id: string;
  displayName: string;
  type: FabricArtifactType;
  workspaceId: string;
  workspaceName: string;
  description?: string;
  accessLevel?: 'Admin' | 'Member' | 'Contributor' | 'Viewer' | 'None';
  createdByDisplayName?: string;
  createdByUserPrincipalName?: string;
  discoveredAtUtc?: string;
  lastSyncAtUtc?: string;
}

export interface MetadataArtifactCatalogState {
  artifacts: PersistedExplorerArtifact[];
  lastRefreshedAtUtc?: string;
  source?: 'manual-refresh' | 'view-load';
}

// ---------------------------------------------------------------------------
// 2 – Semantic Model Analyzer
// ---------------------------------------------------------------------------

export type SemanticEntityType = 'Table' | 'Measure' | 'Column' | 'Relationship';

export interface SemanticEntity {
  id: string;
  displayName: string;
  type: SemanticEntityType;
  /** Parent artifact (semantic model) ID */
  artifactId: string;
  /** For columns: parent table ID */
  parentId?: string;
  description?: string;
  dataType?: string;
  expression?: string; // for measures
}

export interface SemanticDependency {
  sourceId: string;
  targetId: string;
  dependencyType?: string;
}

export interface SemanticEntityTmdlHistoryEntry {
  id: string;
  timestampUtc: string;
  modelId: string;
  workspaceId: string;
  entityType: string;
  entityName: string;
  tableName: string | null;
  content: string;
}

export interface SemanticAnalyzerState {
  /** Currently selected semantic model artifact ID */
  selectedArtifactId?: string;
  /** Active entity type filter */
  entityTypeFilter?: SemanticEntityType[];
  /** Current view mode */
  viewMode?: 'table' | 'graph';
  /** Persisted TMDL snapshots keyed by semantic entity identity */
  tmdlHistoryEntries?: SemanticEntityTmdlHistoryEntry[];
}

// ---------------------------------------------------------------------------
// 3 – Lineage and Dependency Graph
// ---------------------------------------------------------------------------

export interface LineageNode {
  id: string;
  displayName: string;
  type: FabricArtifactType | SemanticEntityType;
  workspaceId: string;
  workspaceName?: string;
}

export interface LineageEdge {
  id: string;
  sourceId: string;
  targetId: string;
  /** The nature of the relationship */
  relationshipType?: 'dataflow' | 'refresh' | 'query' | 'embed' | string;
}

export interface LineageGraphState {
  /** Root node to start traversal from */
  rootNodeId?: string;
  /** Traversal direction */
  direction?: 'upstream' | 'downstream' | 'both';
  /** Current view mode */
  viewMode?: 'table' | 'graph';
  /** Maximum traversal depth */
  maxDepth?: number;
  /** Persisted lineage links to avoid reloading unchanged dependency maps */
  cachedLinks?: PersistedLineageLink[];
  /** Persisted permission summary associated with cached links */
  cachedPermissionSummary?: PersistedLineagePermissionSummary;
  /** Last time lineage data was refreshed */
  lastRefreshedAtUtc?: string;
  source?: 'manual-refresh' | 'view-load';
}

export interface PersistedLineagePermissionSummary {
  accessiblePathCount: number;
  partiallyBlockedPathCount: number;
  blockedPathCount: number;
}

export interface PersistedLineageLink {
  sourceWorkspaceId: string;
  sourceArtifactId: string;
  targetWorkspaceId: string;
  targetArtifactId: string;
  relationshipType: string;
  confidence?: 'exact' | 'inferred';
  confidenceNote?: string;
  permission?: {
    sourceAccessLevel?: 'Admin' | 'Member' | 'Contributor' | 'Viewer' | 'None';
    targetAccessLevel?: 'Admin' | 'Member' | 'Contributor' | 'Viewer' | 'None';
    traversalBlocked?: boolean;
    blockReason?: 'NoAccess' | 'CrossWorkspacePermissionGap' | 'InsufficientRole' | 'Unknown';
  };
}

export interface ReportScannerCachedDefinition {
  workspaceId: string;
  reportId: string;
  fetchedAtUtc?: string;
  definition: {
    format?: string;
    parts: Array<{
      path: string;
      payload: string;
      payloadType: string;
    }>;
  };
  source?: string;
  operationStatus?: string;
  attempts?: number;
}

export interface ReportScannerState {
  selectedReportKey?: string;
  cachedDefinitions?: ReportScannerCachedDefinition[];
  lastRefreshedAtUtc?: string;
}

// ---------------------------------------------------------------------------
// 4 – Requirements Board
// ---------------------------------------------------------------------------

export type RequirementStatus = 'Backlog' | 'InProgress' | 'InReview' | 'Done';

export interface RequirementLink {
  id: string;
  /** 'artifact' | 'semantic' | 'lineage' */
  linkType: 'artifact' | 'semantic' | 'lineage';
  entityId: string;
  workspaceId?: string;
  entityType?: string;
  entityDisplayName?: string;
}

export type TicketProposalStatus = 'draft' | 'proposed' | 'approved' | 'applied' | 'rejected';

export interface TmdlChangeContext {
  objectType: 'Model' | 'Table' | 'Column' | 'Measure' | 'Relationship' | 'Hierarchy' | 'Role' | string;
  objectName: string;
  tableName?: string;
  beforeTmdl?: string;
  afterTmdl?: string;
}

export interface TicketTmdlProposal {
  id: string;
  title: string;
  status: TicketProposalStatus;
  mode: 'proposal';
  createdAtUtc: string;
  createdBy?: string;
  updatedAtUtc?: string;
  summary?: string;
  changeSet: TmdlChangeContext[];
  mcpSuggested?: boolean;
}

export interface TicketEvidenceLink {
  id: string;
  label: string;
  url?: string;
  notes?: string;
  artifactId?: string;
  workspaceId?: string;
  addedAtUtc?: string;
}

export type TicketAuditAction =
  | 'ticket-created'
  | 'ticket-updated'
  | 'ticket-moved'
  | 'proposal-created'
  | 'proposal-updated'
  | 'proposal-approved'
  | 'proposal-rejected'
  | 'proposal-applied'
  | 'evidence-linked'
  | 'artifact-linked'
  | 'semantic-linked'
  | 'lineage-linked'
  | 'comment-added';

export interface TicketAuditEntry {
  id: string;
  ticketId: string;
  action: TicketAuditAction;
  timestampUtc: string;
  actor?: string;
  proposalId?: string;
  details?: string;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  text: string;
  author?: string;
  createdAtUtc: string;
}

export interface RequirementCard {
  id: string;
  ticketNumber: number;
  name: string;
  /** Legacy compatibility for early prototype cards */
  title?: string;
  description?: string;
  status: RequirementStatus;
  developer?: string;
  dataOwner?: string;
  requestor?: string;
  /** Assigned user — populated from workspace role assignments */
  assignedUser?: { id: string; displayName: string };
  /** Project / initiative grouping */
  project?: string;
  /** Legacy compatibility */
  assignee?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Critical';
  createdAt?: string;
  updatedAt?: string;
  /** Links to Fabric metadata, semantic entities, or lineage nodes */
  links?: RequirementLink[];
  /** Proposal-mode semantic model changes with before/after TMDL context */
  tmdlProposals?: TicketTmdlProposal[];
  /** Ticket-level evidence supporting proposed changes */
  evidenceLinks?: TicketEvidenceLink[];
  /** Auditable activity linked to ticket operations */
  auditTrail?: TicketAuditEntry[];
  /** Discussion comments on this ticket */
  comments?: TicketComment[];
  /** Free-form tags */
  tags?: string[];
}

export interface RequirementsBoardAssistantStub {
  provider: 'mcp';
  status: 'planned' | 'configured';
  serverName?: string;
  endpoint?: string;
  promptTemplate?: string;
  lastPreparedAt?: string;
}

export interface RequirementsBoardState {
  cards: RequirementCard[];
  nextTicketNumber?: number;
  /** Column order override (defaults: Backlog → InProgress → InReview → Done) */
  columnOrder?: RequirementStatus[];
  assistantStub?: RequirementsBoardAssistantStub;
}

export interface RequirementsBoardStorageSettings {
  mode?: 'default' | 'custom';
  /** OneLake path relative to item root, should start with Files/ */
  oneLakeFilePath?: string;
}

// ---------------------------------------------------------------------------
// Unified OneLake persistence settings (new — replaces per-section ad-hoc paths)
// ---------------------------------------------------------------------------

/**
 * Metadata about a persisted snapshot (used for version comparison).
 * The actual snapshot content lives in OneLake; this is just the index entry.
 */
export interface StorageSnapshotMeta {
  /** Unique snapshot ID (UUID) */
  id: string;
  /** ISO 8601 timestamp when the snapshot was written */
  savedAtUtc: string;
  /** Which section this snapshot covers */
  section: 'metadata' | 'semantic' | 'lineage' | 'reports' | 'all';
  /** Human-readable label, e.g. "Before Q2 refactor" */
  label?: string;
  /** OneLake relative file path for the snapshot JSON */
  filePath: string;
  /** Schema version of the snapshot content */
  schemaVersion: string;
}

/**
 * Metadata entry for a raw entity content snapshot (TMDL file or report JSON).
 * These are separate from section-state snapshots and store the actual artifact
 * content (e.g. full model TMDL or Power BI report definition JSON).
 */
export interface EntitySnapshotMeta {
  /** Unique snapshot ID (UUID) */
  id: string;
  /** 'tmdl' for semantic model TMDL files, 'report' for report definition JSON */
  entityType: 'tmdl' | 'report';
  /** Artifact ID (semantic model ID or report ID) */
  entityId: string;
  /** Workspace the artifact belongs to */
  workspaceId: string;
  /** Human-readable artifact display name */
  displayName: string;
  /** ISO 8601 timestamp when the snapshot was written */
  savedAtUtc: string;
  /** OneLake relative file path for the snapshot content */
  filePath: string;
  /** Optional human-readable label */
  label?: string;
}

/**
 * Per-section storage location within the bound OneLake folder.
 * Each section writes to `<rootFolder>/<sectionSubfolder>/`.
 */
export interface InsightWorkbenchStorageSectionPaths {
  /** Subfolder for artifact catalog snapshots. Default: "metadata" */
  metadata?: string;
  /** Subfolder for semantic model snapshots. Default: "semantic" */
  semantic?: string;
  /** Subfolder for lineage graph snapshots. Default: "lineage" */
  lineage?: string;
  /** Subfolder for report scanner snapshots. Default: "reports" */
  reports?: string;
  /** Subfolder for requirements board tickets. Default: "tickets" */
  tickets?: string;
}

/**
 * Optional SQL mirror configuration for Insight Workbench operational querying.
 * OneLake remains the primary item-content store; SQL is an opt-in mirror for
 * T-SQL querying and backend persistence scenarios.
 */
export interface InsightWorkbenchSqlWarehouseSettings {
  /** Whether SQL mirror mode is enabled. */
  enabled: boolean;
  /** Fabric SQL Database / Warehouse server name, e.g. xyz.database.fabric.microsoft.com */
  server?: string;
  /** Database / Warehouse name */
  database?: string;
  /** Optional schema hint for future table placement. */
  schema?: string;
  /** Persist report-scanner scan results into SQL when backend runtime config is active. */
  persistReportScanner?: boolean;
  /** Persist Insight Workbench section and entity snapshots into SQL when enabled. */
  persistSnapshots?: boolean;
}

/**
 * Top-level OneLake persistence settings for the entire Insight Workbench item.
 * Stored in `requirementsBoard` section of the item definition for backward compat,
 * but controls all sections.
 */
export interface InsightWorkbenchStorageSettings {
  /**
   * Whether OneLake persistence is enabled.
   * When false the workbench uses item-definition state only (prior behavior).
   */
  enabled: boolean;
  /**
   * Root OneLake folder path relative to the item root. MUST start with "Files/".
   * Example: "Files/insight-workbench-data"
   */
  rootFolderPath?: string;
  /** Override subfolders per section. Uses defaults when not specified. */
  sectionPaths?: InsightWorkbenchStorageSectionPaths;
  /**
   * Maximum number of snapshots to retain per section before pruning oldest.
   * Default: 20
   */
  maxSnapshotsPerSection?: number;
  /** Whether to auto-snapshot on every save (default: true when enabled) */
  autoSnapshot?: boolean;
  /** Optional SQL mirror configuration for T-SQL querying and operational persistence. */
  sqlWarehouse?: InsightWorkbenchSqlWarehouseSettings;
}

// ---------------------------------------------------------------------------
// 5 – Lakehouse / Warehouse Analyzer
// ---------------------------------------------------------------------------

export interface LakehouseAnalyzerState {
  /** Last selected artifact ID */
  selectedArtifactId?: string;
  /** Last selected workspace ID for the artifact */
  selectedWorkspaceId?: string;
  /** Active entity-type tab filter */
  activeEntityTab?: string;
}

// ---------------------------------------------------------------------------
// Root persisted definition
// ---------------------------------------------------------------------------

/**
 * The top-level definition that is serialized in Fabric item storage.
 * Each capability area has its own sub-state so saves are idempotent.
 */
export interface InsightWorkbenchItemDefinition {
  /** Schema version — bump on breaking changes */
  schemaVersion?: string;
  metadataExplorer?: MetadataExplorerState;
  semanticAnalyzer?: SemanticAnalyzerState;
  lineageGraph?: LineageGraphState;
  reportScanner?: ReportScannerState;
  requirementsBoard?: RequirementsBoardState;
  requirementsBoardStorage?: RequirementsBoardStorageSettings;
  lakehouseAnalyzer?: LakehouseAnalyzerState;
  /** Unified OneLake persistence settings — supersedes requirementsBoardStorage */
  oneLakeStorage?: InsightWorkbenchStorageSettings;
  /** Index of persisted snapshots. Content lives in OneLake; this is lightweight ref data. */
  snapshotIndex?: StorageSnapshotMeta[];
}
