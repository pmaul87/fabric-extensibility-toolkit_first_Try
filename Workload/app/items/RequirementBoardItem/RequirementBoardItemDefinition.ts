export type RequirementStatus = "backlog" | "todo" | "in-progress" | "review" | "done";
export type RequirementPriority = "low" | "medium" | "high" | "critical";

export interface Requirement {
  id: string;
  title: string;
  description?: string;
  status: RequirementStatus;
  priority: RequirementPriority;
  /** Node IDs from the linked LineageViewer item (e.g. "measure:sales_total") */
  linkedNodeIds: string[];
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RequirementBoardItemDefinition {
  requirements: Requirement[];
  /** Fabric item GUID of the LineageViewer item this board is linked to */
  linkedLineageViewerItemId?: string;
}

export const KANBAN_COLUMNS: { id: RequirementStatus; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "To Do" },
  { id: "in-progress", label: "In Progress" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

export const PRIORITY_CONFIG: Record<
  RequirementPriority,
  { label: string; color: "danger" | "warning" | "informative" | "subtle" }
> = {
  critical: { label: "Critical", color: "danger" },
  high: { label: "High", color: "warning" },
  medium: { label: "Medium", color: "informative" },
  low: { label: "Low", color: "subtle" },
};
