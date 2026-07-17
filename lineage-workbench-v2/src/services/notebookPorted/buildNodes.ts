import type { NotebookInputTables, NotebookPipelineResult, TableRow } from "./types";
import { dedupeById, getRows, normalizeEntityType, rowText, text } from "./helpers";

type Node = NotebookPipelineResult["nodes"][number];

function createNode(input: {
  nodeId?: string;
  parentNodeId?: string;
  displayName?: string;
  entityType?: string;
  workspaceId?: string;
  datasetId?: string;
}): Node | undefined {
  const nodeId = text(input.nodeId);
  if (!nodeId) return undefined;

  return {
    nodeId,
    parentNodeId: text(input.parentNodeId),
    displayName: text(input.displayName) || nodeId,
    entityType: text(input.entityType) || "unknown",
    workspaceId: text(input.workspaceId),
    datasetId: text(input.datasetId),
  };
}

function visualDisplayName(row: TableRow): string {
  const visualType = rowText(row, "display_type", "type", "visual_type") || "Visual";
  const title = rowText(row, "title", "visual_title", "display_name", "visual_name", "name");
  return title ? `${visualType}: ${title}` : visualType;
}

export function buildNodesFromTables(tables: NotebookInputTables, workspaceFallback?: string): {
  nodes: Node[];
  dimensions: NotebookPipelineResult["dimensions"];
} {
  const nodes: Node[] = [];

  const artifacts = getRows(tables, "t_fabric_artifacts");
  for (const row of artifacts) {
    nodes.push(
      createNode({
        nodeId: rowText(row, "id"),
        displayName: rowText(row, "display_name", "name", "id"),
        entityType: normalizeEntityType(rowText(row, "type")),
        workspaceId: rowText(row, "workspace_id") || workspaceFallback,
      }) || ({} as Node)
    );
  }

  const datasetTables = getRows(tables, "t_dataset_tables");
  for (const row of datasetTables) {
    const tablePk = rowText(row, "table_pk") || `${rowText(row, "name", "table_name") || "table"}-${rowText(row, "dataset_id") || "unknown"}`;
    nodes.push(
      createNode({
        nodeId: tablePk,
        parentNodeId: rowText(row, "dataset_id"),
        displayName: rowText(row, "name", "table_name", "table_pk"),
        entityType: "table",
        workspaceId: rowText(row, "workspace_id") || workspaceFallback,
        datasetId: rowText(row, "dataset_id"),
      }) || ({} as Node)
    );
  }

  const datasetColumns = getRows(tables, "t_dataset_columns");
  for (const row of datasetColumns) {
    const columnPk = rowText(row, "column_pk") || `${rowText(row, "table_name") || "table"}-${rowText(row, "column_name") || "column"}-${rowText(row, "dataset_id") || "unknown"}`;
    nodes.push(
      createNode({
        nodeId: columnPk,
        parentNodeId: `${rowText(row, "table_name") || "table"}-${rowText(row, "dataset_id") || "unknown"}`,
        displayName: rowText(row, "column_name", "column_pk"),
        entityType: "column",
        workspaceId: rowText(row, "workspace_id") || workspaceFallback,
        datasetId: rowText(row, "dataset_id"),
      }) || ({} as Node)
    );
  }

  const datasetMeasures = getRows(tables, "t_dataset_measures");
  for (const row of datasetMeasures) {
    const measurePk = rowText(row, "measure_pk") || `${rowText(row, "table_name") || "table"}-${rowText(row, "measure_name") || "measure"}-${rowText(row, "dataset_id") || "unknown"}`;
    nodes.push(
      createNode({
        nodeId: measurePk,
        parentNodeId: `${rowText(row, "table_name") || "table"}-${rowText(row, "dataset_id") || "unknown"}`,
        displayName: rowText(row, "measure_name", "measure_pk"),
        entityType: "measure",
        workspaceId: rowText(row, "workspace_id") || workspaceFallback,
        datasetId: rowText(row, "dataset_id"),
      }) || ({} as Node)
    );
  }

  const reports = getRows(tables, "t_report_metadata");
  for (const row of reports) {
    nodes.push(
      createNode({
        nodeId: rowText(row, "report_id"),
        displayName: rowText(row, "report_name", "report_id"),
        entityType: "report",
        workspaceId: rowText(row, "workspace_id") || workspaceFallback,
        datasetId: rowText(row, "dataset_id"),
      }) || ({} as Node)
    );
  }

  const pages = getRows(tables, "t_report_pages");
  for (const row of pages) {
    const pagePk = rowText(row, "page_pk") || `${rowText(row, "page_name") || "page"}-${rowText(row, "report_id") || "unknown"}`;
    nodes.push(
      createNode({
        nodeId: pagePk,
        parentNodeId: rowText(row, "report_id"),
        displayName: rowText(row, "page_display_name", "page_name", "page_pk"),
        entityType: "page",
        workspaceId: rowText(row, "workspace_id") || workspaceFallback,
        datasetId: rowText(row, "dataset_id"),
      }) || ({} as Node)
    );
  }

  const visuals = getRows(tables, "t_report_visuals");
  for (const row of visuals) {
    const visualPk = rowText(row, "visual_pk") || `${rowText(row, "visual_name") || "visual"}-${rowText(row, "page_name") || "page"}-${rowText(row, "report_id") || "unknown"}`;
    nodes.push(
      createNode({
        nodeId: visualPk,
        parentNodeId: `${rowText(row, "page_name") || "page"}-${rowText(row, "report_id") || "unknown"}`,
        displayName: visualDisplayName(row),
        entityType: "visual",
        workspaceId: rowText(row, "workspace_id") || workspaceFallback,
        datasetId: rowText(row, "dataset_id"),
      }) || ({} as Node)
    );
  }

  const lakehouses = getRows(tables, "t_lakehouse_metadata");
  for (const row of lakehouses) {
    nodes.push(
      createNode({
        nodeId: rowText(row, "id", "lakehouse_id"),
        displayName: rowText(row, "display_name", "name", "id"),
        entityType: "lakehouse",
        workspaceId: rowText(row, "workspace_id") || workspaceFallback,
      }) || ({} as Node)
    );
  }

  const lakehouseTables = getRows(tables, "t_lakehouse_tables");
  for (const row of lakehouseTables) {
    nodes.push(
      createNode({
        nodeId: rowText(row, "lakehouse_table_pk"),
        parentNodeId: rowText(row, "lakehouse_id"),
        displayName: rowText(row, "table_name", "lakehouse_table_pk"),
        entityType: "lakehouse_table",
        workspaceId: rowText(row, "workspace_id") || workspaceFallback,
      }) || ({} as Node)
    );
  }

  const warehouses = getRows(tables, "t_warehouse_metadata");
  for (const row of warehouses) {
    nodes.push(
      createNode({
        nodeId: rowText(row, "id", "warehouse_id"),
        displayName: rowText(row, "display_name", "name", "id"),
        entityType: "warehouse",
        workspaceId: rowText(row, "workspace_id") || workspaceFallback,
      }) || ({} as Node)
    );
  }

  const warehouseTables = getRows(tables, "t_warehouse_tables");
  for (const row of warehouseTables) {
    nodes.push(
      createNode({
        nodeId: rowText(row, "warehouse_table_pk"),
        parentNodeId: rowText(row, "warehouse_id"),
        displayName: rowText(row, "table_name", "warehouse_table_pk"),
        entityType: "warehouse_table",
        workspaceId: rowText(row, "workspace_id") || workspaceFallback,
      }) || ({} as Node)
    );
  }

  const validNodes = nodes.filter((node) => Boolean(node.nodeId));

  return {
    nodes: dedupeById(validNodes, "nodeId"),
    dimensions: {
      reports,
      pages,
      visuals,
      semanticModels: artifacts.filter((a) => normalizeEntityType(a.type) === "semantic_model"),
      tables: datasetTables,
      columns: datasetColumns,
      measures: datasetMeasures,
      relationships: getRows(tables, "t_dataset_relations"),
      lakehouses,
      warehouses,
      smDependencies: getRows(tables, "t_dataset_dependencies"),
      workspaceArtifacts: artifacts,
      columnLineage: getRows(tables, "t_column_lineage"),
    },
  };
}
