/**
 * InsightWorkbenchNavKeys.ts
 *
 * Shared sessionStorage key constants used for cross-view jump navigation
 * within the Insight Workbench item. Centralised here to avoid magic-string
 * duplication across view files.
 */

/** Written by Report Scanner before navigating to Semantic Analyzer. */
export const NAV_JUMP_SEMANTIC_ANALYZER = "InsightWorkbench.SemanticAnalyzer.JumpField";

/** Written by Semantic Analyzer before navigating to Report Scanner. */
export const NAV_JUMP_REPORT_SCANNER = "InsightWorkbench.ReportScanner.JumpReport";

/** Written by Metadata Explorer before navigating to Lakehouse Analyzer. */
export const NAV_JUMP_LAKEHOUSE_ANALYZER = "InsightWorkbench.LakehouseAnalyzer.JumpArtifact";

/** Written by analyzers before navigating to Storage Settings snapshot history. */
export const NAV_OPEN_STORAGE_HISTORY = "InsightWorkbench.StorageSettings.OpenHistory";
