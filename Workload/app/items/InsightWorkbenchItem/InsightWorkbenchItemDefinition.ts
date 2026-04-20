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

export interface SemanticAnalyzerState {
  /** Currently selected semantic model artifact ID */
  selectedArtifactId?: string;
  /** Active entity type filter */
  entityTypeFilter?: SemanticEntityType[];
  /** Current view mode */
  viewMode?: 'table' | 'graph';
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
}

// ---------------------------------------------------------------------------
// 4 – Requirements Board
// ---------------------------------------------------------------------------

export type RequirementStatus = 'Backlog' | 'InProgress' | 'InReview' | 'Done';

export interface RequirementLink {
  /** 'artifact' | 'semantic' | 'lineage' */
  linkType: 'artifact' | 'semantic' | 'lineage';
  entityId: string;
  entityDisplayName?: string;
}

export interface RequirementCard {
  id: string;
  title: string;
  description?: string;
  status: RequirementStatus;
  assignee?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Critical';
  createdAt?: string;
  updatedAt?: string;
  /** Links to Fabric metadata, semantic entities, or lineage nodes */
  links?: RequirementLink[];
  /** Free-form tags */
  tags?: string[];
}

export interface RequirementsBoardState {
  cards: RequirementCard[];
  /** Column order override (defaults: Backlog → InProgress → InReview → Done) */
  columnOrder?: RequirementStatus[];
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
  requirementsBoard?: RequirementsBoardState;
}
