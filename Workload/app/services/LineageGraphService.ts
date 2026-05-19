/**
 * LineageGraphService - Reads extraction results from OneLake and builds the lineage graph model.
 *
 * Reads JSON files written by the extraction notebooks from:
 *   /Files/lineage/raw/semantic_model/{id}.json
 *   /Files/lineage/raw/report/{id}.json
 *   /Files/lineage/raw/notebook/{id}.json
 *
 * Transforms the raw JSON into LineageViewerNode[] and LineageViewerEdge[] for visualization.
 */

import type { OneLakeStorageClientItemWrapper } from "../clients/OneLakeStorageClient";
import type { LineageViewerNode, LineageViewerEdge } from "../items/LineageWorkbenchItem/LineageGraphView";

// ---------------------------------------------------------------------------
// Types for extracted JSON files (matching notebook output structure)
// ---------------------------------------------------------------------------

interface ExtractedSemanticModel {
  id: string;
  displayName: string;
  description?: string;
  tables: ExtractedTable[];
}

interface ExtractedTable {
  name: string;
  columns: ExtractedColumn[];
  measures: ExtractedMeasure[];
}

interface ExtractedColumn {
  name: string;
  dataType?: string;
  expression?: string;
}

interface ExtractedMeasure {
  name: string;
  expression?: string;
  formatString?: string;
}

interface ExtractedReport {
  id: string;
  displayName: string;
  semanticModelId?: string;
  pages: ExtractedPage[];
}

interface ExtractedPage {
  name: string;
  displayName: string;
  visuals: ExtractedVisual[];
}

interface ExtractedVisual {
  name: string;
  type: string;
}

interface ExtractedNotebook {
  id: string;
  displayName: string;
  cells?: Array<{
    type: string;
    source: string;
  }>;
}

// ---------------------------------------------------------------------------
// LineageGraphService
// ---------------------------------------------------------------------------

export class LineageGraphService {
  private itemWrapper: OneLakeStorageClientItemWrapper;

  constructor(itemWrapper: OneLakeStorageClientItemWrapper) {
    this.itemWrapper = itemWrapper;
  }

  /**
   * Load the complete lineage graph from OneLake extraction results.
   * Returns nodes and edges ready for visualization.
   */
  async loadGraph(): Promise<{
    nodes: LineageViewerNode[];
    edges: LineageViewerEdge[];
  }> {
    const nodes: LineageViewerNode[] = [];
    const edges: LineageViewerEdge[] = [];

    // Load each artifact type
    const semanticModels = await this.loadSemanticModels();
    const reports = await this.loadReports();
    const notebooks = await this.loadNotebooks();

    // Transform semantic models
    for (const model of semanticModels) {
      nodes.push({
        nodeId: `semantic_model:${model.id}`,
        displayName: model.displayName,
        entityType: "semantic_model",
        modelName: model.displayName,
      });

      for (const table of model.tables) {
        const tableId = `table:${model.id}:${table.name}`;
        nodes.push({
          nodeId: tableId,
          displayName: table.name,
          entityType: "table",
          modelName: model.displayName,
          tableName: table.name,
        });

        // Edge: semantic_model -> table
        edges.push({
          edgeId: `sm_table:${model.id}:${table.name}`,
          fromNodeId: `semantic_model:${model.id}`,
          toNodeId: tableId,
          edgeType: "contains",
        });

        for (const column of table.columns) {
          const columnId = `column:${model.id}:${table.name}:${column.name}`;
          nodes.push({
            nodeId: columnId,
            displayName: column.name,
            entityType: "column",
            tableName: table.name,
            dataType: column.dataType,
            expression: column.expression,
          });

          // Edge: table -> column
          edges.push({
            edgeId: `table_column:${model.id}:${table.name}:${column.name}`,
            fromNodeId: tableId,
            toNodeId: columnId,
            edgeType: "contains",
          });
        }

        for (const measure of table.measures) {
          const measureId = `measure:${model.id}:${table.name}:${measure.name}`;
          nodes.push({
            nodeId: measureId,
            displayName: measure.name,
            entityType: "measure",
            tableName: table.name,
            expression: measure.expression,
            formatString: measure.formatString,
          });

          // Edge: table -> measure
          edges.push({
            edgeId: `table_measure:${model.id}:${table.name}:${measure.name}`,
            fromNodeId: tableId,
            toNodeId: measureId,
            edgeType: "contains",
          });
        }
      }
    }

    // Transform reports
    for (const report of reports) {
      nodes.push({
        nodeId: `report:${report.id}`,
        displayName: report.displayName,
        entityType: "report",
        reportId: report.id,
      });

      // Edge: report -> semantic_model (if connected)
      if (report.semanticModelId) {
        edges.push({
          edgeId: `report_sm:${report.id}:${report.semanticModelId}`,
          fromNodeId: `report:${report.id}`,
          toNodeId: `semantic_model:${report.semanticModelId}`,
          edgeType: "dependency",
        });
      }

      for (const page of report.pages) {
        const pageId = `page:${report.id}:${page.name}`;
        nodes.push({
          nodeId: pageId,
          displayName: page.displayName,
          entityType: "page",
          reportId: report.id,
        });

        // Edge: report -> page
        edges.push({
          edgeId: `report_page:${report.id}:${page.name}`,
          fromNodeId: `report:${report.id}`,
          toNodeId: pageId,
          edgeType: "contains",
        });

        for (const visual of page.visuals) {
          const visualId = `visual:${report.id}:${page.name}:${visual.name}`;
          nodes.push({
            nodeId: visualId,
            displayName: visual.name,
            entityType: "visual",
            visualType: visual.type,
          });

          // Edge: page -> visual
          edges.push({
            edgeId: `page_visual:${report.id}:${page.name}:${visual.name}`,
            fromNodeId: pageId,
            toNodeId: visualId,
            edgeType: "contains",
          });
        }
      }
    }

    // Transform notebooks
    for (const notebook of notebooks) {
      nodes.push({
        nodeId: `notebook:${notebook.id}`,
        displayName: notebook.displayName,
        entityType: "notebook",
      });
    }

    return { nodes, edges };
  }

  /**
   * Load all semantic model JSON files from OneLake
   */
  private async loadSemanticModels(): Promise<ExtractedSemanticModel[]> {
    try {
      const metadata = await this.itemWrapper.getPathMetadata("Files/lineage/raw/semantic_model/", false, false);
      const models: ExtractedSemanticModel[] = [];

      for (const pathInfo of metadata.paths) {
        if (!pathInfo.isDirectory && pathInfo.name.endsWith(".json")) {
          const filePath = `Files/lineage/raw/semantic_model/${pathInfo.name}`;
          const content = await this.itemWrapper.readFileAsText(filePath);
          const model = JSON.parse(content) as ExtractedSemanticModel;
          models.push(model);
        }
      }

      return models;
    } catch (err) {
      console.warn("Failed to load semantic models from OneLake:", err);
      return [];
    }
  }

  /**
   * Load all report JSON files from OneLake
   */
  private async loadReports(): Promise<ExtractedReport[]> {
    try {
      const metadata = await this.itemWrapper.getPathMetadata("Files/lineage/raw/report/", false, false);
      const reports: ExtractedReport[] = [];

      for (const pathInfo of metadata.paths) {
        if (!pathInfo.isDirectory && pathInfo.name.endsWith(".json")) {
          const filePath = `Files/lineage/raw/report/${pathInfo.name}`;
          const content = await this.itemWrapper.readFileAsText(filePath);
          const report = JSON.parse(content) as ExtractedReport;
          reports.push(report);
        }
      }

      return reports;
    } catch (err) {
      console.warn("Failed to load reports from OneLake:", err);
      return [];
    }
  }

  /**
   * Load all notebook JSON files from OneLake
   */
  private async loadNotebooks(): Promise<ExtractedNotebook[]> {
    try {
      const metadata = await this.itemWrapper.getPathMetadata("Files/lineage/raw/notebook/", false, false);
      const notebooks: ExtractedNotebook[] = [];

      for (const pathInfo of metadata.paths) {
        if (!pathInfo.isDirectory && pathInfo.name.endsWith(".json")) {
          const filePath = `Files/lineage/raw/notebook/${pathInfo.name}`;
          const content = await this.itemWrapper.readFileAsText(filePath);
          const notebook = JSON.parse(content) as ExtractedNotebook;
          notebooks.push(notebook);
        }
      }

      return notebooks;
    } catch (err) {
      console.warn("Failed to load notebooks from OneLake:", err);
      return [];
    }
  }
}
