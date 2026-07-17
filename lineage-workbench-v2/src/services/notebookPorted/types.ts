export type TableRow = Record<string, unknown>;

export type NotebookInputTables = Record<string, TableRow[]>;

export interface NotebookPipelineResult {
  nodes: Array<{
    nodeId: string;
    displayName: string;
    entityType: string;
    parentNodeId?: string;
    workspaceId?: string;
    datasetId?: string;
  }>;
  edges: Array<{
    edgeId: string;
    fromNodeId: string;
    toNodeId: string;
    edgeType: string;
    workspaceId?: string;
    datasetId?: string;
  }>;
  dimensions: {
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
  };
}
