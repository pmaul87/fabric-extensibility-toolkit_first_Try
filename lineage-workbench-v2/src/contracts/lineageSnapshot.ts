export interface LineageNode {
  nodeId: string;
  displayName: string;
  entityType: string;
  parentNodeId?: string;
  workspaceId?: string;
  datasetId?: string;
}

export interface LineageEdge {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: string;
  workspaceId?: string;
  datasetId?: string;
}

export interface LineageDimensions {
  reports: unknown[];
  pages: unknown[];
  visuals: unknown[];
  semanticModels: unknown[];
  tables: unknown[];
  columns: unknown[];
  measures: unknown[];
  relationships: unknown[];
  lakehouses: unknown[];
  warehouses: unknown[];
  smDependencies: unknown[];
  workspaceArtifacts: unknown[];
  columnLineage: unknown[];
}

export interface GraphSnapshot {
  generatedAtUtc: string;
  nodes: LineageNode[];
  edges: LineageEdge[];
  dimensions: LineageDimensions;
}
