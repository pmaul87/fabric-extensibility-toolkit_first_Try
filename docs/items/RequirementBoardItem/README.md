# RequirementBoardItem

RequirementBoardItem provides a Kanban-style planning surface for lineage remediation and feature delivery.

## Why It Exists

- Track requirements by delivery status: Backlog, To Do, In Progress, Review, Done.
- Link requirements to lineage nodes by node ID.
- Navigate directly between Requirement Board and Lineage Viewer.

## Data Model

Persisted definition fields:

- requirements: Requirement[]
- linkedLineageViewerItemId?: string

Each requirement stores:

- id
- title
- description?
- status
- priority
- linkedNodeIds[]
- tags?
- createdAt
- updatedAt

## Cross-Item Deep Links

This item supports URL hash deep links for fast context transfer:

- Open node in Lineage Viewer from Requirement Board:
  - /LineageViewerItem-editor/{lineageItemId}#focus={nodeId}
- Create requirement from a Lineage node:
  - /RequirementBoardItem-editor/{boardItemId}#create={nodeId}

Hash behavior:

- #focus={nodeId} is consumed by LineageViewerItem and clears hash after processing.
- #create={nodeId} is consumed by RequirementBoardItem and opens a pre-filled create dialog.

## UX Guardrails

- Item link dialogs validate item GUID format before save/apply.
- "Show in Lineage" appears when a requirement has linked nodes and the board is connected to a Lineage Viewer item.
- "Create requirement for this node" appears in Lineage Viewer when a Requirement Board is connected.

## Developer Notes

- Keep ItemEditor + Ribbon patterns aligned with existing workload components.
- Use getWorkloadItem/saveWorkloadItem from ItemCRUDController for item-level persistence.
- Do not store view-only state in the persisted definition.
