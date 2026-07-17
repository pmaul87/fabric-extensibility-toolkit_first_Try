import type { NotebookInputTables, TableRow } from "./types";

export const NOTEBOOK_TABLES = [
  // Notebook 1: Extract raw metadata
  "t_fabric_artifacts",
  "t_dataset_columns",
  "t_dataset_tables",
  "t_dataset_measures",
  "t_dataset_relations",
  "t_dataset_dependencies",
  "t_dataset_partitions",
  "t_report_metadata",
  "t_report_pages",
  "t_report_visuals",
  "t_report_semantic_objects",
  "t_lakehouse_metadata",
  "t_lakehouse_tables",
  "t_lakehouse_columns",
  "t_warehouse_metadata",
  "t_warehouse_tables",
  "t_warehouse_columns",
  "t_direct_lake_sources",
  "t_lakehouses_meta",
  "t_lakehouse_shortcuts",
  "t_column_lineage",
  // Notebook 2/3/4 materialized outputs
  "v_nodes",
  "v_edges",
  "t_mquery_datasource_mappings",
] as const;

export type NotebookTableName = (typeof NOTEBOOK_TABLES)[number];

export function ensureAllNotebookTables(input?: NotebookInputTables): NotebookInputTables {
  const output: NotebookInputTables = {};

  for (const tableName of NOTEBOOK_TABLES) {
    const rows = input?.[tableName];
    output[tableName] = Array.isArray(rows) ? rows : [];
  }

  if (input) {
    for (const [tableName, rows] of Object.entries(input)) {
      if (!(tableName in output)) {
        output[tableName] = Array.isArray(rows) ? rows : [];
      }
    }
  }

  return output;
}

export function mergeNotebookTables(base: NotebookInputTables, patch: NotebookInputTables): NotebookInputTables {
  const merged = ensureAllNotebookTables(base);
  for (const [tableName, rows] of Object.entries(patch)) {
    merged[tableName] = Array.isArray(rows) ? rows : [];
  }
  return merged;
}

export function withRows(tables: NotebookInputTables, tableName: NotebookTableName, rows: TableRow[]): NotebookInputTables {
  return {
    ...tables,
    [tableName]: rows,
  };
}
