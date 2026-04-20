export const VIEW = {
  EMPTY: 'empty',
  HUB: 'hub',
  METADATA_EXPLORER: 'metadata-explorer',
  SEMANTIC_ANALYZER: 'semantic-analyzer',
  SEMANTIC_ANALYZER_DETAIL: 'semantic-analyzer-detail',
  LINEAGE_GRAPH: 'lineage-graph',
  REPORT_SCANNER: 'report-scanner',
  REQUIREMENTS_BOARD: 'requirements-board',
  LAKEHOUSE_ANALYZER: 'lakehouse-analyzer',
  STORAGE_SETTINGS: 'storage-settings',
} as const;

export type InsightWorkbenchView = typeof VIEW[keyof typeof VIEW];
