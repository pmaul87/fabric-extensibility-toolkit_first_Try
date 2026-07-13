# Lineage Workbench for Microsoft Fabric

Lineage Workbench is a custom Fabric workload item that helps teams extract technical lineage, inspect dependencies, and track implementation requirements in one place.

This repository contains the full workload implementation, including setup wizards, extraction notebooks, lineage graph views, and requirement ticket management.

## What This App Does

- Guided setup for Lakehouse, Environment, and Notebook deployment.
- Automated lineage extraction from Fabric artifacts.
- Interactive lineage exploration with detail-side dependency views.
- Column-level query step visibility.
- Requirement tickets linked to lineage nodes.

## Quick Start

### 1. Prerequisites

- Node.js
- PowerShell 7
- .NET SDK
- VS Code
- Microsoft Fabric tenant and workspace
- Entra app (existing or created via setup scripts)

Detailed prerequisites: [docs/Project_Setup.md](docs/Project_Setup.md)

### 2. Setup

```powershell
cd scripts\Setup
.\Setup.ps1 -WorkloadName "Org.InsightWorkbench"
```

### 3. Start Development Mode

```powershell
cd scripts\Run
.\StartDevServer.ps1
.\StartDevGateway.ps1
```

After startup, open the workload in Fabric Workload Hub.

## Product Walkthrough

This section is structured for screenshots you can add later.

### 1. Set up Lakehouse and Notebooks

In the **Extraction** view of Lineage Workbench:

1. Click **Select/Create Lakehouse** and either create a new lakehouse or choose an existing one.
2. Click **Select/Create Environment** and configure semantic-link dependencies.
3. Click **Deploy Extraction Notebooks** to deploy:
   - `Extract_Datasets_and_Reports`
   - `Extract_Datasources_from_SemanticModels`
4. Click **Workspaces to Extract** and select one or more workspaces.
5. Click **Run Extraction**.

Screenshot placeholder:

```md
![Setup Lakehouse and Notebooks](docs/images/01-setup-lakehouse-notebooks.png)
```

### 2. Open Lineage Explorer and Select a Node

In the **Lineage** view:

1. Open the lineage explorer panel.
2. Select any node (dataset, table, column, report, visual, etc.).
3. The selected node becomes the context for detail analysis.

Screenshot placeholder:

```md
![Lineage Explorer Node Selection](docs/images/02-lineage-explorer-node-selection.png)
```

### 3. See Related Nodes in Detail View and Graph

After selecting a node:

1. The detail panel shows related upstream/downstream nodes.
2. The graph highlights connected nodes and relationships.
3. Use depth/direction controls to refine visible dependencies.

Screenshot placeholder:

```md
![Related Nodes in Detail and Graph](docs/images/03-related-nodes-detail-graph.png)
```

### 4. Showcase Query Steps for Columns

For a selected column-related node:

1. Open the detail view section showing transformation/query lineage.
2. Inspect query steps that produced or transformed the selected field.
3. Use this to validate impact before making semantic model changes.

Screenshot placeholder:

```md
![Query Steps for Columns](docs/images/04-query-steps-columns.png)
```

### 5. Requirement Tickets (In Progress)

In the **Requirements** view:

1. Create and edit requirement tickets directly from the integrated board.
2. Link tickets to lineage nodes for impact-aware planning.
3. Track status via Kanban columns (Backlog, To Do, In Progress, Review, Done).

Current status note:

- Requirement tracking is functional and integrated.
- Full enterprise workflow features (governance/compliance automation, advanced reporting, and lifecycle controls) are still under active implementation.

Screenshot placeholder:

```md
![Requirement Tickets Board](docs/images/05-requirement-tickets.png)
```

## Recommended Additional Section

### Troubleshooting

Common issues and fixes:

- **Notebook run fails with language metadata errors**
  - Redeploy notebooks from the setup wizard.
- **Extraction parameters fail to parse**
  - Ensure workspaces are selected and extraction is launched from the current wizard flow.
- **Changes not persisted**
  - Requirements now auto-save. If not visible after reload, verify save permissions in the target workspace.

## Repository Structure

- `Workload/app/items/LineageWorkbenchItem/` - Main integrated item (Extraction, Lineage, Requirements)
- `Workload/notebooks/` - Extraction notebooks
- `Workload/Manifest/` - Workload/item manifest metadata
- `scripts/Setup/` - Environment setup scripts
- `scripts/Run/` - Local run scripts
- `docs/` - Supporting documentation

## Publishing Notes

Before publishing:

1. Verify manifest metadata under `Workload/Manifest/`.
2. Build the manifest package.
3. Validate in a test tenant.

See: [docs/Project_Setup.md](docs/Project_Setup.md)

## License

See [LICENSE](LICENSE).
