/**
 * Unified definition for the Lineage Workbench item.
 * All lineage-related state — extraction config, lineage graph, and requirements —
 * live here so users interact with a single workload element.
 */
export interface LineageWorkbenchExtractionConfig {
  targetWorkspaces?: string[];
  targetWorkspaceNames?: string[];
  targetWorkspaceTypes?: string[];
  workspaceReportExtractionWarnings?: string[];
  targetLakehouseId?: string;
  targetLakehouseDisplayName?: string;
  targetLakehouseWorkspaceId?: string;
  targetEnvironmentId?: string;
  targetEnvironmentDisplayName?: string;
  targetEnvironmentWorkspaceId?: string;
  targetPipelineId?: string;
  targetPipelineDisplayName?: string;
  artifactTypes?: string[];
  lastRunAt?: string;
  lastRunStatus?: "idle" | "running" | "success" | "error";
  lastRunMessage?: string;
  
  // Notebook deployment configuration
  notebooks?: {
    createNewLakehouse?: boolean;
    newLakehouseName?: string;
  };
  
  // Azure OpenAI configuration for query explanation
  azureOpenAI?: {
    enabled?: boolean;
    endpoint?: string;
    apiKey?: string;
    deploymentName?: string;
    maxTokens?: number;
    temperature?: number;
  };
}

export interface LineageWorkbenchItemDefinition {
  /** Extraction pipeline configuration */
  extraction?: LineageWorkbenchExtractionConfig;
  /** Lineage graph + viewer state + requirements — all in one place */
  lineage?: any;
}
