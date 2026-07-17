import type { CreateExtractionRequest, ExtractionRun } from "../../domain/extractionTypes";
import type { NotebookInputTables, TableRow } from "../notebookPorted/types";
import { ensureAllNotebookTables } from "../notebookPorted/tableContracts";

function makeSeedArtifactRows(run: ExtractionRun): TableRow[] {
  const workspaceId = run.workspaceIds[0] ?? "workspace-demo";
  const datasetId = `sm_${run.id.slice(0, 8)}`;
  const reportId = `report_${run.id.slice(0, 8)}`;

  return [
    {
      id: datasetId,
      type: "SemanticModel",
      display_name: "Seed Semantic Model",
      workspace_id: workspaceId,
    },
    {
      id: reportId,
      type: "Report",
      display_name: "Seed Report",
      workspace_id: workspaceId,
    },
    {
      id: run.lakehouseId || `lakehouse_${run.id.slice(0, 8)}`,
      type: "Lakehouse",
      display_name: "Seed Lakehouse",
      workspace_id: workspaceId,
    },
  ];
}

function makeSeedDatasetRows(run: ExtractionRun): {
  tables: TableRow[];
  columns: TableRow[];
  measures: TableRow[];
  dependencies: TableRow[];
  reportMetadata: TableRow[];
  reportPages: TableRow[];
  reportVisuals: TableRow[];
  reportSemanticObjects: TableRow[];
} {
  const workspaceId = run.workspaceIds[0] ?? "workspace-demo";
  const datasetId = `sm_${run.id.slice(0, 8)}`;
  const reportId = `report_${run.id.slice(0, 8)}`;
  const tableName = "Sales";
  const tablePk = `${tableName}-${datasetId}`;
  const columnName = "Amount";
  const columnPk = `${tableName}-${columnName}-${datasetId}`;
  const measureName = "Total Sales";
  const measurePk = `${tableName}-${measureName}-${datasetId}`;
  const pageName = "Overview";
  const pagePk = `${pageName}-${reportId}`;
  const visualPk = `VisualContainer1-${pageName}-${reportId}`;

  return {
    tables: [
      { table_pk: tablePk, name: tableName, table_name: tableName, dataset_id: datasetId, workspace_id: workspaceId },
    ],
    columns: [
      { column_pk: columnPk, table_name: tableName, column_name: columnName, dataset_id: datasetId, workspace_id: workspaceId },
    ],
    measures: [
      { measure_pk: measurePk, table_name: tableName, measure_name: measureName, dataset_id: datasetId, workspace_id: workspaceId },
    ],
    dependencies: [
      {
        dependency_pk: `dep_${run.id.slice(0, 8)}`,
        object_type: "measure",
        table_name: tableName,
        object_name: measureName,
        referenced_object_type: "column",
        referenced_table: tableName,
        referenced_object: columnName,
        dataset_id: datasetId,
        workspace_id: workspaceId,
        parent_node: measureName,
      },
    ],
    reportMetadata: [
      { report_id: reportId, report_name: "Seed Report", dataset_id: datasetId, workspace_id: workspaceId },
    ],
    reportPages: [
      { page_pk: pagePk, report_id: reportId, page_name: pageName, page_display_name: pageName, dataset_id: datasetId, workspace_id: workspaceId },
    ],
    reportVisuals: [
      {
        visual_pk: visualPk,
        report_id: reportId,
        page_name: pageName,
        visual_name: "VisualContainer1",
        title: "Sales Chart",
        display_type: "clusteredColumnChart",
        dataset_id: datasetId,
        workspace_id: workspaceId,
      },
    ],
    reportSemanticObjects: [
      {
        semantic_object_pk: `so_${run.id.slice(0, 8)}`,
        report_id: reportId,
        visual_fk: visualPk,
        object_type: "measure",
        table_name: tableName,
        object_name: measureName,
        report_source: "uses_measure",
        workspace_id: workspaceId,
      },
    ],
  };
}

export function collectNativeRawTables(run: ExtractionRun, request: CreateExtractionRequest): NotebookInputTables {
  const seedTables = (request.options?.nativeSeedTables as NotebookInputTables | undefined) || {};
  const tables = ensureAllNotebookTables(seedTables);

  const hasAnySeedData = Object.values(tables).some((rows) => rows.length > 0);
  if (hasAnySeedData) {
    return tables;
  }

  const workspaceId = run.workspaceIds[0] ?? "workspace-demo";
  const seedArtifacts = makeSeedArtifactRows(run);
  const seedDataset = makeSeedDatasetRows(run);
  const lakehouseId = run.lakehouseId || `lakehouse_${run.id.slice(0, 8)}`;

  tables.t_fabric_artifacts = seedArtifacts;
  tables.t_dataset_tables = seedDataset.tables;
  tables.t_dataset_columns = seedDataset.columns;
  tables.t_dataset_measures = seedDataset.measures;
  tables.t_dataset_dependencies = seedDataset.dependencies;
  tables.t_report_metadata = seedDataset.reportMetadata;
  tables.t_report_pages = seedDataset.reportPages;
  tables.t_report_visuals = seedDataset.reportVisuals;
  tables.t_report_semantic_objects = seedDataset.reportSemanticObjects;
  tables.t_lakehouse_metadata = [
    { id: lakehouseId, lakehouse_id: lakehouseId, display_name: "Seed Lakehouse", workspace_id: workspaceId },
  ];
  tables.t_lakehouses_meta = [
    { lakehouse_id: lakehouseId, lakehouse_name: "Seed Lakehouse", workspace_id: workspaceId },
  ];
  tables.t_lakehouse_tables = [
    { lakehouse_table_pk: `Sales-${lakehouseId}`, lakehouse_id: lakehouseId, table_name: "Sales", workspace_id: workspaceId },
  ];
  tables.t_direct_lake_sources = [
    { dataset_id: `sm_${run.id.slice(0, 8)}`, workspace_id: workspaceId, itemname: "Seed Lakehouse" },
  ];

  return tables;
}
