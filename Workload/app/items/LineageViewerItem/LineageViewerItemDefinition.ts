export type LineageEdgeDirection = "upstream" | "downstream" | "both";

export interface LineageViewerNode {
  nodeId: string;
  displayName: string;
  entityType: "report" | "visual" | "semantic_object" | "table" | "column" | "measure" | "dataflow" | "notebook" | "lakehouse" | "warehouse" | "unknown";
  datasetId?: string;
  modelName?: string;
  modelDataType?: string;
  modelFormat?: string;
  modelExpressionLanguage?: string;
  tableName?: string;
  objectName?: string;
  objectSubtype?: string;
  dataType?: string;
  formatString?: string;
  expression?: string;
  reportId?: string;
  reportPageName?: string;
  visualType?: string;
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
  selectedModelId?: string;
  selectedReportNodeId?: string;
  selectedEntityTypes?: LineageViewerNode["entityType"][];
  maxDepth?: number;
  direction?: LineageEdgeDirection;
}
