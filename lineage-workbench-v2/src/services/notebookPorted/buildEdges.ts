import type { NotebookInputTables, NotebookPipelineResult, TableRow } from "./types";
import { dedupeById, getRows, hashId, rowText, text } from "./helpers";

type Edge = NotebookPipelineResult["edges"][number];

function objectKeyByType(objectType: unknown, tableName: unknown, objectName: unknown, datasetId: unknown): string {
  const type = (text(objectType) || "").toLowerCase();
  const table = text(tableName) || "";
  const object = text(objectName) || "";
  const dataset = text(datasetId) || "";

  if (type.includes("table")) return `${table}-${dataset}`;
  if (type.includes("column")) return `${table}-${object}-${dataset}`;
  if (type.includes("measure")) return `${table}-${object}-${dataset}`;
  return `${table}-${object}-${dataset}`;
}

function createEdge(input: {
  edgeId?: string;
  fromNodeId?: string;
  toNodeId?: string;
  edgeType?: string;
  workspaceId?: string;
  datasetId?: string;
}): Edge | undefined {
  const edgeId = text(input.edgeId);
  const fromNodeId = text(input.fromNodeId);
  const toNodeId = text(input.toNodeId);
  if (!edgeId || !fromNodeId || !toNodeId) return undefined;

  return {
    edgeId,
    fromNodeId,
    toNodeId,
    edgeType: text(input.edgeType) || "depends_on",
    workspaceId: text(input.workspaceId),
    datasetId: text(input.datasetId),
  };
}

export function buildEdgesFromTables(tables: NotebookInputTables): Edge[] {
  const edges: Edge[] = [];

  const dependencies = getRows(tables, "t_dataset_dependencies").filter((row) => {
    const objectName = rowText(row, "object_name");
    const parentNode = rowText(row, "parent_node");
    return !objectName || !parentNode || objectName === parentNode;
  });

  for (const row of dependencies) {
    const objectKey = objectKeyByType(
      row.object_type,
      row.table_name,
      row.object_name,
      row.dataset_id
    );
    const referencedObjectKey = objectKeyByType(
      row.referenced_object_type,
      row.referenced_table,
      row.referenced_object,
      row.dataset_id
    );

    const edge = createEdge({
      edgeId: rowText(row, "dependency_pk") || hashId("edge", ["dep", referencedObjectKey, objectKey]),
      fromNodeId: referencedObjectKey,
      toNodeId: objectKey,
      edgeType: rowText(row, "object_type") || "dependency",
      datasetId: rowText(row, "dataset_id"),
      workspaceId: rowText(row, "workspace_id"),
    });

    if (edge) edges.push(edge);
  }

  const reportMetadata = getRows(tables, "t_report_metadata");
  const datasetByReportId = new Map<string, string>();
  for (const row of reportMetadata) {
    const reportId = rowText(row, "report_id");
    const datasetId = rowText(row, "dataset_id");
    if (reportId && datasetId) datasetByReportId.set(reportId, datasetId);
  }

  const reportSemanticObjects = getRows(tables, "t_report_semantic_objects");
  for (const row of reportSemanticObjects) {
    const reportId = rowText(row, "report_id");
    const datasetId = rowText(row, "dataset_id") || (reportId ? datasetByReportId.get(reportId) : undefined);
    const objectKey = objectKeyByType(
      row.object_type,
      row.table_name,
      row.object_name,
      datasetId
    );

    const edge = createEdge({
      edgeId: rowText(row, "semantic_object_pk") || hashId("edge", ["semantic", objectKey, row.visual_fk]),
      fromNodeId: objectKey,
      toNodeId: rowText(row, "visual_fk"),
      edgeType: rowText(row, "report_source") || "uses",
      datasetId,
      workspaceId: rowText(row, "workspace_id"),
    });

    if (edge) edges.push(edge);
  }

  const datasetTables = getRows(tables, "t_dataset_tables");
  const lakehousesMeta = getRows(tables, "t_lakehouses_meta");
  const lakehouseTables = getRows(tables, "t_lakehouse_tables");
  const directLakeSources = getRows(tables, "t_direct_lake_sources");

  const datasetTableRowsByDataset = new Map<string, TableRow[]>();
  for (const row of datasetTables) {
    const datasetId = rowText(row, "dataset_id");
    if (!datasetId) continue;
    const set = datasetTableRowsByDataset.get(datasetId) || [];
    set.push(row);
    datasetTableRowsByDataset.set(datasetId, set);
  }

  const lakehouseByWorkspaceAndName = new Map<string, TableRow>();
  for (const row of lakehousesMeta) {
    const workspaceId = rowText(row, "workspace_id");
    const lakehouseName = rowText(row, "lakehouse_name");
    if (workspaceId && lakehouseName) {
      lakehouseByWorkspaceAndName.set(`${workspaceId}|${lakehouseName}`, row);
    }
  }

  const lakehouseTablesByLakehouseAndName = new Map<string, TableRow>();
  for (const row of lakehouseTables) {
    const lakehouseId = rowText(row, "lakehouse_id");
    const tableName = rowText(row, "table_name");
    if (lakehouseId && tableName) {
      lakehouseTablesByLakehouseAndName.set(`${lakehouseId}|${tableName}`, row);
    }
  }

  for (const source of directLakeSources) {
    const datasetId = rowText(source, "dataset_id");
    if (!datasetId) continue;

    const datasetRows = datasetTableRowsByDataset.get(datasetId) || [];
    for (const datasetRow of datasetRows) {
      const workspaceId = rowText(source, "workspace_id") || rowText(datasetRow, "workspace_id");
      const itemName = rowText(source, "itemname");
      if (!workspaceId || !itemName) continue;

      const lakehouseMeta = lakehouseByWorkspaceAndName.get(`${workspaceId}|${itemName}`);
      const lakehouseId = rowText(lakehouseMeta || {}, "lakehouse_id");
      const tableName = rowText(datasetRow, "name", "table_name");
      if (!lakehouseId || !tableName) continue;

      const lhTable = lakehouseTablesByLakehouseAndName.get(`${lakehouseId}|${tableName}`);
      const fromNodeId = rowText(lhTable || {}, "lakehouse_table_pk");
      const toNodeId = rowText(datasetRow, "table_pk");
      if (!fromNodeId || !toNodeId) continue;

      const edge = createEdge({
        edgeId: `${tableName}-${lakehouseId}-directlake`,
        fromNodeId,
        toNodeId,
        edgeType: "Directlake Table",
        datasetId,
        workspaceId,
      });

      if (edge) edges.push(edge);
    }
  }

  const shortcuts = getRows(tables, "t_lakehouse_shortcuts");
  for (const row of shortcuts) {
    const shortcutName = rowText(row, "shortcut_name");
    const lakehouseId = rowText(row, "lakehouse_id");
    const sourceItemId = rowText(row, "source_item_id");
    if (!shortcutName || !lakehouseId || !sourceItemId) continue;

    const edge = createEdge({
      edgeId: `${shortcutName}-${lakehouseId}`,
      fromNodeId: `${shortcutName}-${sourceItemId}`,
      toNodeId: `${shortcutName}-${lakehouseId}`,
      edgeType: "Shortcut",
      workspaceId: rowText(row, "workspace_id"),
    });

    if (edge) edges.push(edge);
  }

  return dedupeById(edges, "edgeId");
}
