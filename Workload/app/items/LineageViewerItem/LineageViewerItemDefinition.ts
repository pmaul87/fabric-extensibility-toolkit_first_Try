export type LineageEdgeDirection = "upstream" | "downstream" | "both";

export interface LineageViewerNode {
  nodeId: string;
  displayName: string;
  entityType: "report" | "visual" | "semantic_object" | "table" | "column" | "measure" | "unknown";
  datasetId?: string;
  tableName?: string;
  objectName?: string;
  objectSubtype?: string;
}

export interface LineageViewerEdge {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: string;
  datasetId?: string;
  reportId?: string;
  evidence?: string;
}

export interface LineageViewerGraphSnapshot {
  generatedAtUtc?: string;
  source?: "mock" | "delta" | "api";
  nodes: LineageViewerNode[];
  edges: LineageViewerEdge[];
}

export interface LineageViewerItemDefinition {
  graphSnapshot?: LineageViewerGraphSnapshot;
  focusNodeId?: string;
  searchText?: string;
  maxDepth?: number;
  direction?: LineageEdgeDirection;
}
