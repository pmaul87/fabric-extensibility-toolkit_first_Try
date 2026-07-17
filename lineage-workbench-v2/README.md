# Lineage Workbench V2

Notebook-free extraction service for a parallel migration from the legacy notebook pipeline.

## Purpose

This service is the "v2 sidecar" extraction engine. It runs independently from the legacy workload so both paths can run in parallel while parity and performance are validated.

## API (initial)

- `GET /health` - health probe
- `POST /api/v2/lineage/input-tables` - stage raw notebook-equivalent tables and get `inputTableSetId`
- `POST /api/v2/lineage/extractions` - create extraction run
- `GET /api/v2/lineage/extractions/:id` - get run status
- `GET /api/v2/lineage/extractions/:id/result` - get snapshot result
- `POST /api/v2/lineage/extractions/:id/cancel` - cancel run

Extraction snapshots are persisted through a pluggable `snapshotStore`.

- Default provider: local file store (`data/snapshots/{runId}.json`)
- OneLake provider currently fails fast until implemented (no fallback)

Provider configuration (env vars):

- `SNAPSHOT_STORE_PROVIDER=file|onelake` (default `file`)
- `ONELAKE_WORKSPACE_ID` (stub metadata only)
- `ONELAKE_ITEM_ID` (stub metadata only)
- `ONELAKE_BASE_PATH` (default `Files/lineage/snapshots`, stub metadata only)

## Notebook Logic Port (in progress)

The v2 collector now includes a TypeScript port of the notebook transformation stages:

- Build nodes from raw metadata tables (`v_nodes` equivalent)
- Build dependency/report/direct-lake/shortcut edges (`v_edges` equivalent)
- Map M-query datasources into extra nodes/edges

And now includes complete table-contract coverage for all notebook stages (1-4) without executing notebooks at runtime.

Runtime path is now:

1. Resolve input tables from either staged input (`inputTableSetId`) or inline `inputTables`
2. If no staged/inline tables are provided, try live Fabric raw-table collection (`nativeCollection.enabled=true`)
3. If live collection is unavailable, the extraction fails fast (no native fallback)
4. Run TypeScript pipeline to build `v_nodes`, `v_edges`, and final graph snapshot

To use this path, include `options.inputTables` in the extraction request payload directly, or stage them first and pass `options.inputTableSetId`.

```json
{
   "workspaceIds": ["<workspace-id>"],
   "artifactTypes": ["report", "semantic_model"],
   "options": {
      "graphScope": "focused",
      "graphNodeLimit": 500,
      "inputTables": {
         "t_fabric_artifacts": [{ "id": "...", "type": "SemanticModel", "display_name": "Model A", "workspace_id": "..." }],
         "t_dataset_tables": [{ "table_pk": "Sales-ds1", "name": "Sales", "dataset_id": "ds1", "workspace_id": "..." }],
         "t_dataset_columns": [],
         "t_dataset_measures": [],
         "t_report_metadata": [],
         "t_report_pages": [],
         "t_report_visuals": [],
         "t_dataset_dependencies": [],
         "t_report_semantic_objects": [],
         "t_dataset_partitions": []
      }
   }
}
```

If no `inputTables` are provided, you must enable live collection and provide a token. Otherwise the API returns `v2_input_required` or `fabric_access_token_required`.

### Full notebook table contract coverage

The v2 TypeScript pipeline now includes contracts for all tables used across notebooks 1-4:

- `t_fabric_artifacts`
- `t_dataset_columns`
- `t_dataset_tables`
- `t_dataset_measures`
- `t_dataset_relations`
- `t_dataset_dependencies`
- `t_dataset_partitions`
- `t_report_metadata`
- `t_report_pages`
- `t_report_visuals`
- `t_report_semantic_objects`
- `t_lakehouse_metadata`
- `t_lakehouse_tables`
- `t_lakehouse_columns`
- `t_warehouse_metadata`
- `t_warehouse_tables`
- `t_warehouse_columns`
- `t_direct_lake_sources`
- `t_lakehouses_meta`
- `t_lakehouse_shortcuts`
- `t_column_lineage`
- `v_nodes`
- `v_edges`
- `t_mquery_datasource_mappings`

### Live collection options

You can enable live Fabric item collection (workspace items and report metadata seed rows) by setting extraction options:

```json
{
   "options": {
      "nativeCollection": {
         "enabled": true,
         "fabricApiBaseUrl": "https://api.fabric.microsoft.com",
         "fabricAccessToken": "<aad-token>"
      }
   }
}
```

Or use environment variables on the v2 service:

- `FABRIC_API_BASE_URL`
- `FABRIC_ACCESS_TOKEN`

### Two-step staged extraction flow

1. Stage input tables:

```json
{
   "inputTables": {
      "t_fabric_artifacts": [],
      "t_dataset_tables": [],
      "t_dataset_columns": []
   }
}
```

Response includes `inputTableSetId`.

2. Start extraction referencing staged set:

```json
{
   "workspaceIds": ["<workspace-id>"],
   "artifactTypes": ["report", "semantic_model"],
   "options": {
      "inputTableSetId": "<from-step-1>",
      "graphScope": "focused",
      "graphNodeLimit": 500
   }
}
```

## Run locally

```bash
npm install
npm run dev
```

Default port is `7071`.

## End-to-end tests

Run:

```bash
npm run test:e2e
```

Current e2e scenarios:

1. Stage input tables -> run extraction -> poll status -> fetch graph result
2. Run extraction without staged/live input -> API fails fast with `v2_input_required` (no fallback)

## Frontend Engine Switch (legacy repo)

In the legacy workload frontend, set:

- `LINEAGE_ENGINE=legacy` (default): calls existing `/api/lakehouse/lineage-graph`
- `LINEAGE_ENGINE=v2`: runs asynchronous extraction flow via `/api/v2/lineage/extractions/*`

## First-week implementation backlog

1. Replace mock builder with real collector modules:
   - workspace artifact collector
   - semantic model collector
   - report definition collector
   - lakehouse/warehouse collector
2. Build contract parity test harness against legacy snapshots.
3. Add persistence adapter (`snapshotStore`) for OneLake JSON snapshots.
4. Add extraction metrics and run logs (`duration`, `warnings`, `error buckets`).
5. Add feature-flag integration contract for frontend (`engine=legacy|v2`).

## Notes

- Current implementation is intentionally minimal and deterministic to unblock parallel path wiring.
- Keep output shape aligned with current `graphSnapshot` contract used by Lineage Workbench UI.
