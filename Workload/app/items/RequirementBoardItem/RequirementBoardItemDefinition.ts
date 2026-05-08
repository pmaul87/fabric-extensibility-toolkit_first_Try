export type RequirementStatus = "backlog" | "todo" | "in-progress" | "review" | "done";
export type RequirementPriority = "low" | "medium" | "high" | "critical";
export type RequirementScope =
  | "change"
  | "create"
  | "delete"
  | "investigate"
  | "validate"
  | "document"
  | "migrate"
  | "review"
  | "other";

export interface RequirementUser {
  displayName: string;
  email?: string;
}

export interface Requirement {
  id: string;
  title: string;
  description?: string;
  scope?: RequirementScope;
  status: RequirementStatus;
  priority: RequirementPriority;
  /** Node IDs from the linked LineageViewer item (e.g. "measure:sales_total") */
  linkedNodeIds: string[];
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: RequirementUser;
  assignedTo?: RequirementUser[];
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

export const SCOPE_CONFIG: Record<
  RequirementScope,
  { label: string; description: string }
> = {
  change:      { label: "Change",       description: "Modify an existing element's logic, format, or behaviour" },
  create:      { label: "Create",       description: "Add a new element to the semantic model or pipeline" },
  delete:      { label: "Delete",       description: "Remove an element that is no longer needed" },
  investigate: { label: "Investigate",  description: "Research or analyse an element before deciding on action" },
  validate:    { label: "Validate",     description: "Verify correctness, accuracy, or completeness" },
  document:    { label: "Document",     description: "Add or improve documentation for an element" },
  migrate:     { label: "Migrate",      description: "Move data or logic to a different location or technology" },
  review:      { label: "Review",       description: "Peer or governance review required" },
  other:       { label: "Other",        description: "None of the above — describe in the details" },
};
