// Removed: import type { LineageViewerItemDefinition } from "../LineageViewerItem/LineageViewerItemDefinition";

/**
 * Unified definition for the Lineage Workbench item.
 * All lineage-related state — extraction config, lineage graph, and requirements —
 * live here so users interact with a single workload element.
 */
export interface LineageWorkbenchExtractionConfig {
  targetWorkspaces?: string[];
  targetLakehouseId?: string;
  artifactTypes?: string[];
  lastRunAt?: string;
  lastRunStatus?: "idle" | "running" | "success" | "error";
  lastRunMessage?: string;
}

export interface LineageWorkbenchItemDefinition {
  /** Extraction pipeline configuration */
  extraction?: LineageWorkbenchExtractionConfig;
  /** Lineage graph + viewer state + requirements — all in one place */
  lineage?: any;
}
