import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Card,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  Option,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Button,
  Divider,
} from "@fluentui/react-components";
import {
  ChevronDown20Regular,
  ChevronUp20Regular,
  CheckmarkCircle20Filled,
  Database20Regular,
  DocumentText20Regular,
  FolderOpen20Regular,
  Globe20Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { ItemEditorDefaultView } from "../../components/ItemEditor";
import { ItemWithDefinition } from "../../controller/ItemCRUDController";
import {
  LineageEdgeDirection,
  LineageViewerEdge,
  LineageViewerItemDefinition,
  LineageViewerNode,
} from "./LineageViewerItemDefinition";
import { LineageGraphView } from "./LineageGraphView";
import "./LineageViewerItem.scss";

interface LineageViewerItemDefaultViewProps {
  workloadClient: WorkloadClientAPI;
  item?: ItemWithDefinition<LineageViewerItemDefinition>;
  definition: LineageViewerItemDefinition;
  onDefinitionChange: (next: LineageViewerItemDefinition) => void;
}

const SAMPLE_GRAPH: LineageViewerItemDefinition["graphSnapshot"] = {
  generatedAtUtc: new Date().toISOString(),
  source: "mock",
  nodes: [
    {
      nodeId: "measure:sales_total",
      displayName: "Sales.Total Sales",
      entityType: "measure",
      datasetId: "sales-model",
      modelName: "Sales Semantic Model",
      modelDataType: "decimal",
      modelFormat: "#,0.00",
      modelExpressionLanguage: "DAX",
      tableName: "Sales",
      objectName: "Total Sales",
      dataType: "decimal",
      formatString: "$#,0.00",
      expression: "SUM ( Sales[Amount] )",
    },
    {
      nodeId: "measure:profit_margin",
      displayName: "Sales.Profit Margin %",
      entityType: "measure",
      datasetId: "sales-model",
      modelName: "Sales Semantic Model",
      modelDataType: "decimal",
      modelFormat: "#,0.00",
      modelExpressionLanguage: "DAX",
      tableName: "Sales",
      objectName: "Profit Margin %",
      dataType: "percentage",
      formatString: "0.00%",
      expression: "DIVIDE ( [Total Profit], [Total Sales] )",
    },
    {
      nodeId: "column:sales_amount",
      displayName: "Sales.Amount",
      entityType: "column",
      datasetId: "sales-model",
      modelName: "Sales Semantic Model",
      modelDataType: "decimal",
      modelFormat: "#,0.00",
      modelExpressionLanguage: "DAX",
      tableName: "Sales",
      objectName: "Amount",
      dataType: "decimal",
      formatString: "$#,0.00",
      expression: "Source column from Sales table",
    },
    {
      nodeId: "column:date_year",
      displayName: "Date.Year",
      entityType: "column",
      datasetId: "sales-model",
      modelName: "Sales Semantic Model",
      modelDataType: "whole number",
      modelFormat: "General Number",
      modelExpressionLanguage: "DAX",
      tableName: "Date",
      objectName: "Year",
      dataType: "whole number",
      formatString: "0",
      expression: "Source column from Date table",
    },
    {
      nodeId: "table:sales",
      displayName: "Sales",
      entityType: "table",
      datasetId: "sales-model",
      modelName: "Sales Semantic Model",
      modelDataType: "mixed",
      modelFormat: "Tabular",
      modelExpressionLanguage: "DAX",
      objectName: "Sales",
    },
    {
      nodeId: "dataflow:sales_ingestion",
      displayName: "Sales ERP Ingestion",
      entityType: "dataflow",
      datasetId: "sales-model",
      modelName: "Sales Semantic Model",
      objectName: "Sales ERP Ingestion",
      expression: "Power Query dataflow staging sales, product, and customer entities",
    },
    {
      nodeId: "lakehouse:sales_foundation",
      displayName: "Sales Foundation Lakehouse",
      entityType: "lakehouse",
      datasetId: "sales-model",
      modelName: "Sales Semantic Model",
      objectName: "Sales Foundation Lakehouse",
      expression: "Bronze/Silver sales entities persisted as Delta tables",
    },
    {
      nodeId: "warehouse:sales_curated",
      displayName: "Sales Curated Warehouse",
      entityType: "warehouse",
      datasetId: "sales-model",
      modelName: "Sales Semantic Model",
      objectName: "Sales Curated Warehouse",
      expression: "Conformed star schema serving semantic model consumption",
    },
    {
      nodeId: "notebook:sales_enrichment",
      displayName: "Sales Enrichment Notebook",
      entityType: "notebook",
      datasetId: "sales-model",
      modelName: "Sales Semantic Model",
      objectName: "Sales Enrichment Notebook",
      expression: "PySpark notebook applying business rules and anomaly flags",
    },
    {
      nodeId: "table:inventory",
      displayName: "Inventory",
      entityType: "table",
      datasetId: "inventory-model",
      modelName: "Inventory Semantic Model",
      modelDataType: "mixed",
      modelFormat: "Tabular",
      modelExpressionLanguage: "DAX",
      objectName: "Inventory",
    },
    {
      nodeId: "visual:profit_by_year",
      displayName: "Profit by Year",
      entityType: "visual",
      datasetId: "sales-model",
      modelName: "Sales Semantic Model",
      objectName: "Profit by Year",
      reportId: "report_sales_overview",
      reportPageName: "Executive Summary",
      visualType: "columnChart",
    },
    {
      nodeId: "visual:sales_kpi",
      displayName: "Sales KPI Card",
      entityType: "visual",
      datasetId: "sales-model",
      modelName: "Sales Semantic Model",
      objectName: "Sales KPI Card",
      reportId: "report_sales_overview",
      reportPageName: "Executive Summary",
      visualType: "card",
    },
    {
      nodeId: "report:sales_overview",
      displayName: "Sales Overview",
      entityType: "report",
      datasetId: "sales-model",
      modelName: "Sales Semantic Model",
      objectName: "Sales Overview",
      reportId: "report_sales_overview",
      reportPageName: "Executive Summary",
      expression: "Pages: Executive Summary, Regional Breakdown",
    },
    {
      nodeId: "report:finance_pack",
      displayName: "Finance Performance Pack",
      entityType: "report",
      datasetId: "sales-model",
      modelName: "Sales Semantic Model",
      objectName: "Finance Performance Pack",
      reportId: "report_finance_pack",
      reportPageName: "Finance KPI",
      expression: "Pages: Finance KPI, Forecast",
    },
    {
      nodeId: "column:inventory_stock",
      displayName: "Inventory.Stock On Hand",
      entityType: "column",
      datasetId: "inventory-model",
      modelName: "Inventory Semantic Model",
      modelDataType: "whole number",
      modelFormat: "General Number",
      modelExpressionLanguage: "DAX",
      tableName: "Inventory",
      objectName: "Stock On Hand",
      dataType: "whole number",
      formatString: "0",
      expression: "Source column from Inventory table",
    },
    {
      nodeId: "measure:inventory_turnover",
      displayName: "Inventory.Turnover Rate",
      entityType: "measure",
      datasetId: "inventory-model",
      modelName: "Inventory Semantic Model",
      modelDataType: "decimal",
      modelFormat: "#,0.00",
      modelExpressionLanguage: "DAX",
      tableName: "Inventory",
      objectName: "Turnover Rate",
      dataType: "decimal",
      formatString: "0.00",
      expression: "DIVIDE ( [COGS], AVERAGE ( Inventory[Stock On Hand] ) )",
    },
    {
      nodeId: "visual:stock_trend",
      displayName: "Stock Trend",
      entityType: "visual",
      datasetId: "inventory-model",
      modelName: "Inventory Semantic Model",
      objectName: "Stock Trend",
      reportId: "report_supply_chain",
      reportPageName: "Stock Trend",
      visualType: "lineChart",
    },
    {
      nodeId: "report:supply_chain",
      displayName: "Supply Chain Health",
      entityType: "report",
      datasetId: "inventory-model",
      modelName: "Inventory Semantic Model",
      objectName: "Supply Chain Health",
      reportId: "report_supply_chain",
      reportPageName: "Stock Trend",
      expression: "Pages: Stock Trend, Exceptions",
    },
  ],
  edges: [
    { edgeId: "e1", fromNodeId: "column:sales_amount", toNodeId: "measure:sales_total", edgeType: "measure_depends_on_column", datasetId: "sales-model" },
    { edgeId: "e2", fromNodeId: "column:date_year", toNodeId: "measure:sales_total", edgeType: "measure_depends_on_column", datasetId: "sales-model" },
    { edgeId: "e3", fromNodeId: "measure:sales_total", toNodeId: "visual:profit_by_year", edgeType: "used_by_visual", datasetId: "sales-model" },
    { edgeId: "e4", fromNodeId: "visual:profit_by_year", toNodeId: "report:sales_overview", edgeType: "contained_in_report", datasetId: "sales-model" },
    { edgeId: "e5", fromNodeId: "measure:sales_total", toNodeId: "visual:sales_kpi", edgeType: "used_by_visual", datasetId: "sales-model" },
    { edgeId: "e6", fromNodeId: "measure:profit_margin", toNodeId: "visual:sales_kpi", edgeType: "used_by_visual", datasetId: "sales-model" },
    { edgeId: "e7", fromNodeId: "visual:sales_kpi", toNodeId: "report:sales_overview", edgeType: "contained_in_report", datasetId: "sales-model" },
    { edgeId: "e8", fromNodeId: "visual:profit_by_year", toNodeId: "report:finance_pack", edgeType: "contained_in_report", datasetId: "sales-model" },
    { edgeId: "e9", fromNodeId: "column:sales_amount", toNodeId: "table:sales", edgeType: "column_in_table", datasetId: "sales-model" },
    { edgeId: "e10", fromNodeId: "measure:profit_margin", toNodeId: "table:sales", edgeType: "measure_in_table", datasetId: "sales-model" },
    { edgeId: "e10b", fromNodeId: "table:sales", toNodeId: "measure:sales_total", edgeType: "table_contains_measure", datasetId: "sales-model" },
    { edgeId: "e10c", fromNodeId: "dataflow:sales_ingestion", toNodeId: "lakehouse:sales_foundation", edgeType: "dataflow_writes_lakehouse", datasetId: "sales-model" },
    { edgeId: "e10d", fromNodeId: "lakehouse:sales_foundation", toNodeId: "warehouse:sales_curated", edgeType: "lakehouse_feeds_warehouse", datasetId: "sales-model" },
    { edgeId: "e10e", fromNodeId: "warehouse:sales_curated", toNodeId: "notebook:sales_enrichment", edgeType: "warehouse_used_by_notebook", datasetId: "sales-model" },
    { edgeId: "e10f", fromNodeId: "notebook:sales_enrichment", toNodeId: "table:sales", edgeType: "notebook_updates_table", datasetId: "sales-model" },
    { edgeId: "e11", fromNodeId: "column:inventory_stock", toNodeId: "measure:inventory_turnover", edgeType: "measure_depends_on_column", datasetId: "inventory-model" },
    { edgeId: "e12", fromNodeId: "measure:inventory_turnover", toNodeId: "visual:stock_trend", edgeType: "used_by_visual", datasetId: "inventory-model" },
    { edgeId: "e13", fromNodeId: "visual:stock_trend", toNodeId: "report:supply_chain", edgeType: "contained_in_report", datasetId: "inventory-model" },
    { edgeId: "e14", fromNodeId: "column:inventory_stock", toNodeId: "table:inventory", edgeType: "column_in_table", datasetId: "inventory-model" },
    { edgeId: "e15", fromNodeId: "measure:inventory_turnover", toNodeId: "table:inventory", edgeType: "measure_in_table", datasetId: "inventory-model" },
  ],
};

const MOCK_WORKSPACES: Array<{ id: string; name: string }> = [
  { id: "ws-sales", name: "Sales Analytics" },
  { id: "ws-supply", name: "Supply Chain" },
];

const MODEL_WORKSPACE_MAP: Record<string, string> = {
  "sales-model": "ws-sales",
  "inventory-model": "ws-supply",
};

const FILTERABLE_ENTITY_TYPES: Array<{ value: LineageViewerNode["entityType"]; label: string }> = [
  { value: "report", label: "Report" },
  { value: "visual", label: "Visual" },
  { value: "notebook", label: "Notebook" },
  { value: "warehouse", label: "Warehouse" },
  { value: "lakehouse", label: "Lakehouse" },
  { value: "dataflow", label: "Dataflow" },
  { value: "measure", label: "Measure" },
  { value: "column", label: "Column" },
  { value: "table", label: "Table" },
  { value: "semantic_object", label: "Semantic object" },
  { value: "unknown", label: "Unknown" },
];

const DEFAULT_ENTITY_TYPES: LineageViewerNode["entityType"][] = FILTERABLE_ENTITY_TYPES.map((item) => item.value);
const MAX_DEPTH_OPTION = 4;

const LEGACY_DEFAULT_ENTITY_TYPES: LineageViewerNode["entityType"][] = [
  "report",
  "visual",
  "measure",
  "column",
  "table",
  "semantic_object",
  "unknown",
];

function isLegacyDefaultEntitySelection(selectedEntityTypes: LineageViewerNode["entityType"][]): boolean {
  const selected = new Set(selectedEntityTypes);
  return selected.size === LEGACY_DEFAULT_ENTITY_TYPES.length
    && LEGACY_DEFAULT_ENTITY_TYPES.every((entityType) => selected.has(entityType));
}

function resolveGraphSnapshot(
  snapshot: LineageViewerItemDefinition["graphSnapshot"] | undefined
): NonNullable<LineageViewerItemDefinition["graphSnapshot"]> {
  if (!snapshot) {
    return SAMPLE_GRAPH;
  }

  // Keep API/delta payloads intact; only enrich old mock snapshots with newly added demo artifacts.
  if (snapshot.source !== "mock") {
    return snapshot;
  }

  const existingNodeIds = new Set(snapshot.nodes.map((node) => node.nodeId));
  const existingEdgeIds = new Set(snapshot.edges.map((edge) => edge.edgeId));

  const missingNodes = SAMPLE_GRAPH.nodes.filter((node) => !existingNodeIds.has(node.nodeId));
  const missingEdges = SAMPLE_GRAPH.edges.filter((edge) => !existingEdgeIds.has(edge.edgeId));

  if (missingNodes.length === 0 && missingEdges.length === 0) {
    return snapshot;
  }

  return {
    ...snapshot,
    nodes: [...snapshot.nodes, ...missingNodes],
    edges: [...snapshot.edges, ...missingEdges],
  };
}

type RelatedObjectKey =
  | "incoming"
  | "outgoing"
  | "directNeighbors"
  | "connectedVisuals"
  | "connectedMeasures"
  | "connectedColumns"
  | "connectedReports"
  | "connectedTables";

const LINEAGE_ENTITY_ORDER = ["report", "visual", "notebook", "warehouse", "lakehouse", "dataflow", "table", "measure", "column", "semantic_object", "unknown"] as const;

function sortNodesByDisplayName(nodes: LineageViewerNode[]): LineageViewerNode[] {
  return [...nodes].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function orderEntityTypes(types: string[]): string[] {
  const remaining = types.filter((type) => !LINEAGE_ENTITY_ORDER.includes(type as typeof LINEAGE_ENTITY_ORDER[number])).sort();
  return [...LINEAGE_ENTITY_ORDER.filter((type) => types.includes(type)), ...remaining];
}

function getEntityTypeLabel(entityType: string): string {
  return FILTERABLE_ENTITY_TYPES.find((item) => item.value === entityType)?.label ?? entityType.replace(/_/g, " ");
}

function traverseGraph(
  nodes: LineageViewerNode[],
  edges: LineageViewerEdge[],
  rootNodeId: string,
  maxDepth: number,
  direction: LineageEdgeDirection
): { depthByNodeId: Map<string, number>; visibleEdges: LineageViewerEdge[] } {
  const outgoing = new Map<string, LineageViewerEdge[]>();
  const incoming = new Map<string, LineageViewerEdge[]>();

  for (const edge of edges) {
    const outList = outgoing.get(edge.fromNodeId) ?? [];
    outList.push(edge);
    outgoing.set(edge.fromNodeId, outList);

    const inList = incoming.get(edge.toNodeId) ?? [];
    inList.push(edge);
    incoming.set(edge.toNodeId, inList);
  }

  const depthByNodeId = new Map<string, number>();
  const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId: rootNodeId, depth: 0 }];
  depthByNodeId.set(rootNodeId, 0);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    if (current.depth >= maxDepth) {
      continue;
    }

    const nextEdges: LineageViewerEdge[] = [];
    if (direction === "downstream" || direction === "both") {
      nextEdges.push(...(outgoing.get(current.nodeId) ?? []));
    }
    if (direction === "upstream" || direction === "both") {
      nextEdges.push(...(incoming.get(current.nodeId) ?? []));
    }

    for (const edge of nextEdges) {
      const nextNodeId = edge.fromNodeId === current.nodeId ? edge.toNodeId : edge.fromNodeId;
      if (!depthByNodeId.has(nextNodeId)) {
        depthByNodeId.set(nextNodeId, current.depth + 1);
        queue.push({ nodeId: nextNodeId, depth: current.depth + 1 });
      }
    }
  }

  const visibleEdges = edges.filter((edge) => depthByNodeId.has(edge.fromNodeId) && depthByNodeId.has(edge.toNodeId));
  return { depthByNodeId, visibleEdges };
}

function collectReachableNodeIds(seedNodeIds: string[], edges: LineageViewerEdge[]): Set<string> {
  const connected = new Set<string>();
  if (seedNodeIds.length === 0) {
    return connected;
  }

  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const out = adjacency.get(edge.fromNodeId) ?? [];
    out.push(edge.toNodeId);
    adjacency.set(edge.fromNodeId, out);

    const back = adjacency.get(edge.toNodeId) ?? [];
    back.push(edge.fromNodeId);
    adjacency.set(edge.toNodeId, back);
  }

  const queue = [...seedNodeIds];
  for (const seed of seedNodeIds) {
    connected.add(seed);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!connected.has(neighbor)) {
        connected.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return connected;
}

export function LineageViewerItemDefaultView(props: LineageViewerItemDefaultViewProps) {
  const { t } = useTranslation();
  const { definition, onDefinitionChange } = props;

  const resetFilters = () => {
    onDefinitionChange({
      ...definition,
      searchText: "",
      selectedModelId: "all",
      selectedReportNodeId: "all",
      selectedEntityTypes: FILTERABLE_ENTITY_TYPES.map((item) => item.value),
      focusNodeId: undefined,
      direction: "both",
      maxDepth: MAX_DEPTH_OPTION,
    });
  };

  const graphSnapshot = useMemo(() => resolveGraphSnapshot(definition.graphSnapshot), [definition.graphSnapshot]);
  const nodes = graphSnapshot?.nodes ?? [];
  const edges = graphSnapshot?.edges ?? [];

  const selectedNodeId = definition.focusNodeId ?? "";
  const direction = definition.direction ?? "both";
  const maxDepth = definition.maxDepth ?? MAX_DEPTH_OPTION;
  const searchText = definition.searchText ?? "";
  const selectedModelId = definition.selectedModelId ?? "all";
  const selectedReportNodeId = definition.selectedReportNodeId ?? "all";
  const selectedEntityTypes = useMemo(() => {
    const currentSelection = definition.selectedEntityTypes;
    if (currentSelection && currentSelection.length > 0) {
      if (isLegacyDefaultEntitySelection(currentSelection)) {
        return DEFAULT_ENTITY_TYPES;
      }
      return currentSelection;
    }
    return DEFAULT_ENTITY_TYPES;
  }, [definition.selectedEntityTypes]);
  const selectedEntityTypeSet = new Set<LineageViewerNode["entityType"]>(selectedEntityTypes);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [scopeDraftModelId, setScopeDraftModelId] = useState(selectedModelId);
  const [scopeDraftReportNodeId, setScopeDraftReportNodeId] = useState(selectedReportNodeId);
  const [scopeDraftWorkspaceId, setScopeDraftWorkspaceId] = useState("all");
  const [itemSearchText, setItemSearchText] = useState("");
  const [activeRelatedObjectKey, setActiveRelatedObjectKey] = useState<RelatedObjectKey | null>(null);

  const modelCards = useMemo(() => {
    const modelMap = new Map<string, { id: string; displayName: string; nodeCount: number }>();
    for (const node of nodes) {
      if (node.datasetId) {
        const existing = modelMap.get(node.datasetId);
        if (existing) {
          existing.nodeCount++;
        } else {
          modelMap.set(node.datasetId, {
            id: node.datasetId,
            displayName: node.modelName ?? node.datasetId,
            nodeCount: 1,
          });
        }
      }
    }
    return Array.from(modelMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [nodes]);

  const reportOptions = useMemo(
    () => nodes.filter((node) => node.entityType === "report").sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [nodes]
  );

  const selectedWorkspaceName = scopeDraftWorkspaceId === "all"
    ? t("LineageViewer_AllWorkspaces", "All workspaces")
    : (MOCK_WORKSPACES.find((workspace) => workspace.id === scopeDraftWorkspaceId)?.name ?? scopeDraftWorkspaceId);

  const showAllScopeOption = ["all workspaces", "all scope", "all"].some((term) => term.includes(itemSearchText.toLowerCase()));

  const filteredScopeModels = useMemo(() => {
    const search = itemSearchText.toLowerCase();
    return modelCards.filter((model) => {
      const workspaceId = MODEL_WORKSPACE_MAP[model.id] ?? "ws-sales";
      const workspaceMatch = scopeDraftWorkspaceId === "all" || workspaceId === scopeDraftWorkspaceId;
      const textMatch = !search || model.displayName.toLowerCase().includes(search) || model.id.toLowerCase().includes(search);
      return workspaceMatch && textMatch;
    });
  }, [itemSearchText, modelCards, scopeDraftWorkspaceId]);

  const filteredScopeReports = useMemo(() => {
    const search = itemSearchText.toLowerCase();
    return reportOptions.filter((reportNode) => {
      const workspaceId = MODEL_WORKSPACE_MAP[reportNode.datasetId ?? ""] ?? "ws-sales";
      const workspaceMatch = scopeDraftWorkspaceId === "all" || workspaceId === scopeDraftWorkspaceId;
      const textMatch = !search
        || reportNode.displayName.toLowerCase().includes(search)
        || (reportNode.modelName ?? "").toLowerCase().includes(search);
      return workspaceMatch && textMatch;
    });
  }, [itemSearchText, reportOptions, scopeDraftWorkspaceId]);

  const visibleScopeItemCount = (showAllScopeOption ? 1 : 0) + filteredScopeModels.length + filteredScopeReports.length;

  useEffect(() => {
    if (selectedModelId === "all" && selectedReportNodeId === "all") {
      setScopeDialogOpen(true);
    }
  }, [selectedModelId, selectedReportNodeId]);

  const selectedModelDisplayName = selectedModelId === "all" ? t("LineageViewer_ModelFilter_All", "All models") : selectedModelId;
  const selectedReportDisplayName = selectedReportNodeId === "all"
    ? t("LineageViewer_ReportFilter_All", "All reports")
    : (nodes.find((node) => node.nodeId === selectedReportNodeId)?.displayName ?? selectedReportNodeId);

  const reportScopeNodeIds = useMemo(() => {
    if (selectedReportNodeId === "all") {
      return undefined;
    }
    return collectReachableNodeIds([selectedReportNodeId], edges);
  }, [selectedReportNodeId, edges]);

  const scopedNodes = useMemo(
    () =>
      nodes.filter((node) => {
        const modelMatch = selectedModelId === "all" || node.datasetId === selectedModelId;
        const reportMatch = !reportScopeNodeIds || reportScopeNodeIds.has(node.nodeId);
        const entityMatch = selectedEntityTypeSet.has(node.entityType);
        return modelMatch && reportMatch && entityMatch;
      }),
    [nodes, selectedModelId, reportScopeNodeIds, selectedEntityTypeSet]
  );

  const filteredNodes = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    if (!search) {
      return scopedNodes;
    }
    return scopedNodes.filter((node) => {
      const haystack = `${node.displayName} ${node.entityType} ${node.tableName ?? ""} ${node.objectName ?? ""} ${node.datasetId ?? ""}`.toLowerCase();
      return haystack.includes(search);
    });
  }, [scopedNodes, searchText]);

  const activeNodeIdSet = useMemo(() => new Set(filteredNodes.map((node) => node.nodeId)), [filteredNodes]);
  const filteredEdges = useMemo(
    () => edges.filter((edge) => activeNodeIdSet.has(edge.fromNodeId) && activeNodeIdSet.has(edge.toNodeId)),
    [edges, activeNodeIdSet]
  );
  const effectiveSelectedNodeId = activeNodeIdSet.has(selectedNodeId) ? selectedNodeId : "";
  const selectedNode = filteredNodes.find((n) => n.nodeId === effectiveSelectedNodeId);

  const traversal = useMemo(() => {
    if (!effectiveSelectedNodeId) {
      const allVisibleDepth = new Map<string, number>();
      for (const node of filteredNodes) {
        allVisibleDepth.set(node.nodeId, 0);
      }
      return { depthByNodeId: allVisibleDepth, visibleEdges: [] as LineageViewerEdge[] };
    }

    return traverseGraph(filteredNodes, filteredEdges, effectiveSelectedNodeId, maxDepth, direction);
  }, [filteredNodes, filteredEdges, effectiveSelectedNodeId, maxDepth, direction]);

  const visibleNodeIds = traversal.depthByNodeId;
  const highlightedNodeIds = useMemo(() => {
    const highlights = new Set<string>();
    if (!effectiveSelectedNodeId) {
      return highlights;
    }

    for (const nodeId of visibleNodeIds.keys()) {
      if (nodeId !== effectiveSelectedNodeId) {
        highlights.add(nodeId);
      }
    }

    return highlights;
  }, [visibleNodeIds, effectiveSelectedNodeId]);

  const highlightedEdgeIds = useMemo(() => {
    if (!effectiveSelectedNodeId) {
      return new Set<string>();
    }
    return new Set(traversal.visibleEdges.map((edge) => edge.edgeId));
  }, [effectiveSelectedNodeId, traversal.visibleEdges]);

  const nodeById = new Map(nodes.map((node) => [node.nodeId, node]));

  const modelSummary = useMemo(() => {
    if (selectedModelId === "all") {
      return undefined;
    }

    const modelNodes = nodes.filter((node) => node.datasetId === selectedModelId);
    if (modelNodes.length === 0) {
      return undefined;
    }

    const exemplar = modelNodes.find((node) => node.modelName || node.modelDataType || node.modelFormat || node.modelExpressionLanguage) ?? modelNodes[0];

    return {
      modelId: selectedModelId,
      modelName: exemplar.modelName,
      modelDataType: exemplar.modelDataType,
      modelFormat: exemplar.modelFormat,
      modelExpressionLanguage: exemplar.modelExpressionLanguage,
      tableCount: modelNodes.filter((node) => node.entityType === "table").length,
      measureCount: modelNodes.filter((node) => node.entityType === "measure").length,
      columnCount: modelNodes.filter((node) => node.entityType === "column").length,
      reportCount: modelNodes.filter((node) => node.entityType === "report").length,
      visualCount: modelNodes.filter((node) => node.entityType === "visual").length,
    };
  }, [nodes, selectedModelId]);

  const selectedNodeEdges = useMemo(() => {
    if (!selectedNode) {
      return [] as LineageViewerEdge[];
    }
    return edges.filter((edge) => edge.fromNodeId === selectedNode.nodeId || edge.toNodeId === selectedNode.nodeId);
  }, [edges, selectedNode]);

  const selectedNodeRelations = useMemo(() => {
    const empty = {
      incoming: [] as LineageViewerNode[],
      outgoing: [] as LineageViewerNode[],
      directNeighbors: [] as LineageViewerNode[],
      connectedVisuals: [] as LineageViewerNode[],
      connectedMeasures: [] as LineageViewerNode[],
      connectedColumns: [] as LineageViewerNode[],
      connectedReports: [] as LineageViewerNode[],
      connectedTables: [] as LineageViewerNode[],
    };

    if (!selectedNode) {
      return empty;
    }

    const incoming = new Map<string, LineageViewerNode>();
    const outgoing = new Map<string, LineageViewerNode>();
    const neighbors = new Map<string, LineageViewerNode>();

    for (const edge of selectedNodeEdges) {
      const neighborId = edge.fromNodeId === selectedNode.nodeId ? edge.toNodeId : edge.fromNodeId;
      const neighbor = nodeById.get(neighborId);
      if (!neighbor) {
        continue;
      }

      neighbors.set(neighbor.nodeId, neighbor);
      if (edge.fromNodeId === selectedNode.nodeId) {
        outgoing.set(neighbor.nodeId, neighbor);
      }
      if (edge.toNodeId === selectedNode.nodeId) {
        incoming.set(neighbor.nodeId, neighbor);
      }
    }

    const directNeighbors = sortNodesByDisplayName([...neighbors.values()]);
    return {
      incoming: sortNodesByDisplayName([...incoming.values()]),
      outgoing: sortNodesByDisplayName([...outgoing.values()]),
      directNeighbors,
      connectedVisuals: directNeighbors.filter((node) => node.entityType === "visual"),
      connectedMeasures: directNeighbors.filter((node) => node.entityType === "measure"),
      connectedColumns: directNeighbors.filter((node) => node.entityType === "column"),
      connectedReports: directNeighbors.filter((node) => node.entityType === "report"),
      connectedTables: directNeighbors.filter((node) => node.entityType === "table"),
    };
  }, [nodeById, selectedNode, selectedNodeEdges]);

  const relatedObjectOptions = useMemo(() => [
    {
      key: "incoming" as const,
      label: t("LineageViewer_Detail_Incoming", "Incoming dependencies"),
      nodes: selectedNodeRelations.incoming,
    },
    {
      key: "outgoing" as const,
      label: t("LineageViewer_Detail_Outgoing", "Outgoing dependencies"),
      nodes: selectedNodeRelations.outgoing,
    },
    {
      key: "directNeighbors" as const,
      label: t("LineageViewer_Detail_DirectNeighbors", "Direct neighbors"),
      nodes: selectedNodeRelations.directNeighbors,
    },
    {
      key: "connectedVisuals" as const,
      label: t("LineageViewer_Detail_UsedByVisuals", "Used by visuals"),
      nodes: selectedNodeRelations.connectedVisuals,
    },
    {
      key: "connectedMeasures" as const,
      label: t("LineageViewer_Detail_UsedByMeasures", "Used by measures"),
      nodes: selectedNodeRelations.connectedMeasures,
    },
    {
      key: "connectedColumns" as const,
      label: t("LineageViewer_Detail_ReferencedColumns", "Referenced columns"),
      nodes: selectedNodeRelations.connectedColumns,
    },
    {
      key: "connectedReports" as const,
      label: t("LineageViewer_Detail_HostReports", "Host reports"),
      nodes: selectedNodeRelations.connectedReports,
    },
    {
      key: "connectedTables" as const,
      label: t("LineageViewer_Detail_ConnectedTables", "Connected tables"),
      nodes: selectedNodeRelations.connectedTables,
    },
  ], [selectedNodeRelations, t]);

  const activeRelatedObject = relatedObjectOptions.find((option) => option.key === activeRelatedObjectKey) ?? null;

  const activeRelatedObjectGroups = useMemo(() => {
    if (!activeRelatedObject) {
      return [] as Array<{ entityType: string; nodes: LineageViewerNode[] }>;
    }

    const grouped = new Map<string, LineageViewerNode[]>();
    for (const node of activeRelatedObject.nodes) {
      const existing = grouped.get(node.entityType) ?? [];
      existing.push(node);
      grouped.set(node.entityType, existing);
    }

    return orderEntityTypes([...grouped.keys()]).map((entityType) => ({
      entityType,
      nodes: sortNodesByDisplayName(grouped.get(entityType) ?? []),
    }));
  }, [activeRelatedObject]);

  useEffect(() => {
    setActiveRelatedObjectKey(null);
  }, [selectedNode?.nodeId]);

  const selectedNodeDepth = selectedNode ? (visibleNodeIds.get(selectedNode.nodeId) ?? 0) : undefined;

  // Details table toggle
  const [showGraph, setShowGraph] = useState(true);
  const [showDetails, setShowDetails] = useState(true);
  const [showTable, setShowTable] = useState(false);

  const focusNode = (nodeId: string) => {
    const nextFocusNodeId = definition.focusNodeId === nodeId ? undefined : nodeId;
    onDefinitionChange({ ...definition, focusNodeId: nextFocusNodeId });
    if (nextFocusNodeId) {
      setShowDetails(true);
    }
  };

  const renderRelatedMetric = (label: string, key: RelatedObjectKey, relatedNodes: LineageViewerNode[]) => (
    <div>
      <Text size={200} className="lineage-viewer-muted">{label}</Text>
      {relatedNodes.length > 0 ? (
        <button
          type="button"
          className={`lineage-viewer-detail-link${activeRelatedObjectKey === key ? " active" : ""}`}
          onClick={() => setActiveRelatedObjectKey((current) => current === key ? null : key)}
        >
          {relatedNodes.length}
        </button>
      ) : (
        <Text size={300}>0</Text>
      )}
    </div>
  );

  return (
    <>
      <ItemEditorDefaultView
      left={{
        title: t("LineageViewer_FilterPanel", "Dependency Filters"),
        width: 320,
        minWidth: 280,
        collapsible: true,
        content: (
          <div className="lineage-viewer-panel">
            <Card className="lineage-viewer-card">
              <Text weight="semibold" size={400}>{t("LineageViewer_Filter_Title", "Analyze Dependencies")}</Text>
              <Text className="lineage-viewer-muted">
                {t("LineageViewer_Filter_Description", "Select a root object and trace impact across visuals and semantic model entities.")}
              </Text>
              <div className="lineage-viewer-scope-row">
                <Badge appearance="outline">{selectedModelDisplayName}</Badge>
                <Badge appearance="outline">{selectedReportDisplayName}</Badge>
              </div>
              <div className="lineage-viewer-filter-actions">
                <Button
                  appearance="secondary"
                  size="small"
                  onClick={() => {
                    setScopeDraftModelId(selectedModelId);
                    setScopeDraftReportNodeId(selectedReportNodeId);
                    setScopeDialogOpen(true);
                  }}
                >
                  {t("LineageViewer_SelectScope", "Select model/report")}
                </Button>
                <Button appearance="subtle" size="small" onClick={resetFilters}>
                  {t("LineageViewer_ResetFilters", "Reset filters")}
                </Button>
              </div>
            </Card>

            <Field label={t("LineageViewer_Search", "Search objects")}>
              <Input
                value={searchText}
                onChange={(_, data) => onDefinitionChange({ ...definition, searchText: data.value })}
                placeholder={t("LineageViewer_Search_Placeholder", "Sales, Profit, Date, visual name...")}
              />
            </Field>

            <Field label={t("LineageViewer_ObjectTypeFilter", "Object types")}> 
              <div className="lineage-viewer-type-filter-grid">
                {FILTERABLE_ENTITY_TYPES.map((entityType) => (
                  <Button
                    key={entityType.value}
                    size="small"
                    appearance={selectedEntityTypeSet.has(entityType.value) ? "primary" : "secondary"}
                    className="lineage-viewer-type-filter-button"
                    onClick={() => {
                      const next = new Set(selectedEntityTypes);
                      if (selectedEntityTypeSet.has(entityType.value)) {
                        if (next.size === 1) {
                          return;
                        }
                        next.delete(entityType.value);
                      } else {
                        next.add(entityType.value);
                      }
                      onDefinitionChange({
                        ...definition,
                        selectedEntityTypes: Array.from(next),
                        focusNodeId: undefined,
                      });
                    }}
                  >
                    {entityType.label}
                  </Button>
                ))}
              </div>
            </Field>

            <Field label={t("LineageViewer_Root", "Root object")}>
              <Dropdown
                value={selectedNode?.displayName ?? ""}
                selectedOptions={effectiveSelectedNodeId ? [effectiveSelectedNodeId] : []}
                onOptionSelect={(_, data) => {
                  const nodeId = String(data.optionValue ?? "");
                  onDefinitionChange({ ...definition, focusNodeId: nodeId });
                }}
              >
                {filteredNodes.map((node) => (
                  <Option key={node.nodeId} value={node.nodeId}>
                    {node.displayName}
                  </Option>
                ))}
              </Dropdown>
            </Field>

            <Field label={t("LineageViewer_Direction", "Direction")}>
              <Dropdown
                value={direction}
                selectedOptions={[direction]}
                onOptionSelect={(_, data) => {
                  const value = (data.optionValue as LineageEdgeDirection) || "both";
                  onDefinitionChange({ ...definition, direction: value });
                }}
              >
                <Option value="upstream">{t("LineageViewer_Direction_Upstream", "Upstream")}</Option>
                <Option value="downstream">{t("LineageViewer_Direction_Downstream", "Downstream")}</Option>
                <Option value="both">{t("LineageViewer_Direction_Both", "Both")}</Option>
              </Dropdown>
            </Field>

            <Field label={t("LineageViewer_Depth", "Max depth")}>
              <Dropdown
                value={String(maxDepth)}
                selectedOptions={[String(maxDepth)]}
                onOptionSelect={(_, data) => {
                  const value = Number(data.optionValue ?? MAX_DEPTH_OPTION);
                  onDefinitionChange({ ...definition, maxDepth: value });
                }}
              >
                <Option value="1">1</Option>
                <Option value="2">2</Option>
                <Option value="3">3</Option>
                <Option value="4">4</Option>
              </Dropdown>
            </Field>

            <Card className="lineage-viewer-card">
              <Text weight="semibold">{t("LineageViewer_Summary", "Summary")}</Text>
              <div className="lineage-viewer-badge-row">
                <Badge appearance="filled" color="brand">{filteredNodes.length} {t("LineageViewer_Nodes", "nodes")}</Badge>
                <Badge appearance="filled" color="informative">{filteredEdges.length} {t("LineageViewer_Edges", "edges")}</Badge>
                <Badge appearance="outline">{graphSnapshot?.source ?? "sample"}</Badge>
              </div>
            </Card>

            {modelSummary && (
              <Card className="lineage-viewer-card">
                <Text weight="semibold">{t("LineageViewer_ModelMetadata", "Model metadata")}</Text>
                <div className="lineage-viewer-object-grid">
                  <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Model_Name", "Model name")}</Text><Text size={300}>{modelSummary.modelName ?? modelSummary.modelId}</Text></div>
                  <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Model_DataType", "Model data type")}</Text><Text size={300}>{modelSummary.modelDataType ?? "-"}</Text></div>
                  <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Model_Format", "Default format")}</Text><Text size={300}>{modelSummary.modelFormat ?? "-"}</Text></div>
                  <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Model_Expression", "Expression language")}</Text><Text size={300}>{modelSummary.modelExpressionLanguage ?? "-"}</Text></div>
                  <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Model_Tables", "Tables")}</Text><Text size={300}>{modelSummary.tableCount}</Text></div>
                  <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Model_Measures", "Measures")}</Text><Text size={300}>{modelSummary.measureCount}</Text></div>
                  <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Model_Columns", "Columns")}</Text><Text size={300}>{modelSummary.columnCount}</Text></div>
                  <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Model_Reports", "Reports")}</Text><Text size={300}>{modelSummary.reportCount}</Text></div>
                  <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Model_Visuals", "Visuals")}</Text><Text size={300}>{modelSummary.visualCount}</Text></div>
                </div>
              </Card>
            )}

            {/* Legend */}
            <Card className="lineage-viewer-card">
              <Text weight="semibold" size={300}>{t("LineageViewer_Legend", "Legend")}</Text>
              <div className="lineage-viewer-legend">
                {([
                  { type: "report", label: "Report" },
                  { type: "visual", label: "Visual" },
                  { type: "measure", label: "Measure" },
                  { type: "column", label: "Column" },
                  { type: "table", label: "Table" },
                ] as const).map(({ type, label }) => (
                  <div key={type} className={`lineage-viewer-legend-item lineage-viewer-legend--${type}`}>
                    <span className="lineage-viewer-legend-dot" />
                    <Text size={200}>{label}</Text>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ),
      }}
      center={{
        ariaLabel: t("LineageViewer_Main", "Lineage dependency view"),
        content: (
          <div className="lineage-viewer-main">
            {/* ── Section: Visual graph ── */}
            <div className="lineage-viewer-section-header">
              <Text weight="semibold" size={300}>{t("LineageViewer_Section_Visual", "Visual")}</Text>
              <Button
                appearance="transparent"
                size="small"
                icon={showGraph ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
                onClick={() => setShowGraph((v) => !v)}
              >
                {showGraph ? t("LineageViewer_Collapse", "Collapse") : t("LineageViewer_Expand", "Expand")}
              </Button>
            </div>
            {showGraph && (
              <div className="lineage-graph-canvas">
                <LineageGraphView
                  nodes={filteredNodes}
                  edges={filteredEdges}
                  focusNodeId={effectiveSelectedNodeId}
                  depthByNodeId={visibleNodeIds}
                  highlightedNodeIds={highlightedNodeIds}
                  highlightedEdgeIds={highlightedEdgeIds}
                  onNodeClick={focusNode}
                />
              </div>
            )}

            {/* ── Section: Table ── */}
            <Divider />
            <div className="lineage-viewer-section-header">
              <Text weight="semibold" size={300}>
                {t("LineageViewer_Section_Table", "Table")}
                {" "}
                <Badge appearance="tint" size="small">{filteredNodes.length}</Badge>
              </Text>
              <Button
                appearance="transparent"
                size="small"
                icon={showTable ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
                onClick={() => setShowTable((v) => !v)}
              >
                {showTable ? t("LineageViewer_Collapse", "Collapse") : t("LineageViewer_Expand", "Expand")}
              </Button>
            </div>

            {showTable && (() => {
              const grouped = new Map<string, typeof filteredNodes>();
              for (const node of filteredNodes) {
                const key = node.entityType;
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key)!.push(node);
              }
              const sortedKeys = orderEntityTypes([...grouped.keys()]);
              return (
                <Table aria-label={t("LineageViewer_Nodes_Table", "Objects table")} size="small">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>{t("LineageViewer_Col_Name", "Name")}</TableHeaderCell>
                      <TableHeaderCell>{t("LineageViewer_Col_Type", "Type")}</TableHeaderCell>
                      <TableHeaderCell>{t("LineageViewer_Col_Model", "Model")}</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedKeys.flatMap((type) => [
                      <TableRow key={`group-${type}`} className="lineage-viewer-table-group-row">
                        <TableCell colSpan={3}>
                          <Text size={100} weight="semibold" className="lineage-viewer-muted" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            {type}
                            {" "}
                            <Badge appearance="tint" size="extra-small">{grouped.get(type)!.length}</Badge>
                          </Text>
                        </TableCell>
                      </TableRow>,
                      ...grouped.get(type)!.map((node) => (
                        <TableRow
                          key={node.nodeId}
                          className={`lineage-viewer-table-node-row${node.nodeId === effectiveSelectedNodeId ? " selected" : ""}${highlightedNodeIds.has(node.nodeId) ? " related" : ""}`}
                          onClick={() => focusNode(node.nodeId)}
                        >
                          <TableCell>{node.displayName}</TableCell>
                          <TableCell>
                            <Badge appearance="outline" size="small">{node.entityType}</Badge>
                          </TableCell>
                          <TableCell>{node.datasetId ?? "-"}</TableCell>
                        </TableRow>
                      )),
                    ])}
                  </TableBody>
                </Table>
              );
            })()}

            {/* ── Section: Details ── */}
            <Divider />
            <div className="lineage-viewer-section-header">
              <Text weight="semibold" size={300}>{t("LineageViewer_Section_Details", "Details")}</Text>
              <Button
                appearance="transparent"
                size="small"
                icon={showDetails ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
                onClick={() => setShowDetails((v) => !v)}
              >
                {showDetails ? t("LineageViewer_Collapse", "Collapse") : t("LineageViewer_Expand", "Expand")}
              </Button>
            </div>
            {showDetails && selectedNode && (
              <Card className="lineage-viewer-card lineage-viewer-object-card">
                <Text weight="semibold" size={300}>{t("LineageViewer_ObjectDetails", "Selected object details")}</Text>
                <div className="lineage-viewer-object-grid">
                  <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Detail_Type", "Type")}</Text><Text size={300}>{selectedNode.entityType}</Text></div>
                  <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Detail_Name", "Name")}</Text><Text size={300}>{selectedNode.displayName}</Text></div>
                  <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Detail_Model", "Semantic model")}</Text><Text size={300}>{selectedNode.datasetId ?? "-"}</Text></div>
                  <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Detail_Depth", "Current graph depth")}</Text><Text size={300}>{selectedNodeDepth ?? "-"}</Text></div>
                  <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Detail_DataType", "Data type")}</Text><Text size={300}>{selectedNode.dataType ?? selectedNode.modelDataType ?? "-"}</Text></div>
                  <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Detail_Format", "Format")}</Text><Text size={300}>{selectedNode.formatString ?? selectedNode.modelFormat ?? "-"}</Text></div>
                  <div className="lineage-viewer-object-wide"><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Detail_Expression", "Expression")}</Text><Text size={300}>{selectedNode.expression ?? "-"}</Text></div>
                  {renderRelatedMetric(t("LineageViewer_Detail_Incoming", "Incoming dependencies"), "incoming", selectedNodeRelations.incoming)}
                  {renderRelatedMetric(t("LineageViewer_Detail_Outgoing", "Outgoing dependencies"), "outgoing", selectedNodeRelations.outgoing)}
                </div>

                {selectedNode.entityType === "measure" && (
                  <div className="lineage-viewer-object-grid lineage-viewer-object-grid--type">
                    <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Detail_Table", "Table")}</Text><Text size={300}>{selectedNode.tableName ?? "-"}</Text></div>
                    {renderRelatedMetric(t("LineageViewer_Detail_ReferencedColumns", "Referenced columns"), "connectedColumns", selectedNodeRelations.connectedColumns)}
                    {renderRelatedMetric(t("LineageViewer_Detail_UsedByVisuals", "Used by visuals"), "connectedVisuals", selectedNodeRelations.connectedVisuals)}
                  </div>
                )}

                {selectedNode.entityType === "column" && (
                  <div className="lineage-viewer-object-grid lineage-viewer-object-grid--type">
                    <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Detail_Table", "Table")}</Text><Text size={300}>{selectedNode.tableName ?? "-"}</Text></div>
                    <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Detail_ColumnDataType", "Column data type")}</Text><Text size={300}>{selectedNode.dataType ?? "-"}</Text></div>
                    <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Detail_ColumnFormat", "Column format")}</Text><Text size={300}>{selectedNode.formatString ?? "-"}</Text></div>
                    <div className="lineage-viewer-object-wide"><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Detail_ColumnExpression", "Column expression")}</Text><Text size={300}>{selectedNode.expression ?? "-"}</Text></div>
                    {renderRelatedMetric(t("LineageViewer_Detail_UsedByMeasures", "Used by measures"), "connectedMeasures", selectedNodeRelations.connectedMeasures)}
                    {renderRelatedMetric(t("LineageViewer_Detail_DirectNeighbors", "Direct neighbors"), "directNeighbors", selectedNodeRelations.directNeighbors)}
                  </div>
                )}

                {selectedNode.entityType === "visual" && (
                  <div className="lineage-viewer-object-grid lineage-viewer-object-grid--type">
                    {renderRelatedMetric(t("LineageViewer_Detail_ConsumedMeasures", "Consumed measures"), "connectedMeasures", selectedNodeRelations.connectedMeasures)}
                    {renderRelatedMetric(t("LineageViewer_Detail_HostReports", "Host reports"), "connectedReports", selectedNodeRelations.connectedReports)}
                    {renderRelatedMetric(t("LineageViewer_Detail_DirectNeighbors", "Direct neighbors"), "directNeighbors", selectedNodeRelations.directNeighbors)}
                  </div>
                )}

                {selectedNode.entityType === "report" && (
                  <div className="lineage-viewer-object-grid lineage-viewer-object-grid--type">
                    <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Detail_ReferencedModels", "Referenced models")}</Text><Text size={300}>{selectedNode.datasetId ? 1 : 0}</Text></div>
                    <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Detail_ReportId", "Report id")}</Text><Text size={300}>{selectedNode.reportId ?? "-"}</Text></div>
                    <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Detail_ReportPage", "Primary page")}</Text><Text size={300}>{selectedNode.reportPageName ?? "-"}</Text></div>
                    <div><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Detail_ReportVisualTypes", "Visual types")}</Text><Text size={300}>{Array.from(new Set(selectedNodeEdges.map((edge) => {
                      const neighborId = edge.fromNodeId === selectedNode.nodeId ? edge.toNodeId : edge.fromNodeId;
                      return nodeById.get(neighborId)?.visualType;
                    }).filter(Boolean) as string[])).join(", ") || "-"}</Text></div>
                    <div className="lineage-viewer-object-wide"><Text size={200} className="lineage-viewer-muted">{t("LineageViewer_Detail_ReportMetadata", "Report metadata")}</Text><Text size={300}>{selectedNode.expression ?? "-"}</Text></div>
                    {renderRelatedMetric(t("LineageViewer_Detail_ContainedVisuals", "Contained visuals"), "connectedVisuals", selectedNodeRelations.connectedVisuals)}
                    {renderRelatedMetric(t("LineageViewer_Detail_ReferencedMeasures", "Referenced measures"), "connectedMeasures", selectedNodeRelations.connectedMeasures)}
                  </div>
                )}

                {selectedNode.entityType === "table" && (
                  <div className="lineage-viewer-object-grid lineage-viewer-object-grid--type">
                    {renderRelatedMetric(t("LineageViewer_Detail_ConnectedColumns", "Connected columns"), "connectedColumns", selectedNodeRelations.connectedColumns)}
                    {renderRelatedMetric(t("LineageViewer_Detail_ConnectedMeasures", "Connected measures"), "connectedMeasures", selectedNodeRelations.connectedMeasures)}
                    {renderRelatedMetric(t("LineageViewer_Detail_DirectNeighbors", "Direct neighbors"), "directNeighbors", selectedNodeRelations.directNeighbors)}
                  </div>
                )}

                {activeRelatedObject && activeRelatedObject.nodes.length > 0 && (
                  <div className="lineage-viewer-related-panel">
                    <div className="lineage-viewer-related-panel-header">
                      <div>
                        <Text weight="semibold" size={300}>{activeRelatedObject.label}</Text>
                        <Text size={200} className="lineage-viewer-muted">
                          {t("LineageViewer_RelatedObjects_Description", "Select an object to focus the graph and refresh details.")}
                        </Text>
                      </div>
                      <Badge appearance="tint" size="medium">{activeRelatedObject.nodes.length}</Badge>
                    </div>
                    <div className="lineage-viewer-related-groups">
                      {activeRelatedObjectGroups.map((group) => (
                        <div key={group.entityType} className="lineage-viewer-related-group">
                          <Text size={100} weight="semibold" className="lineage-viewer-muted lineage-viewer-related-group-label">
                            {getEntityTypeLabel(group.entityType)}
                          </Text>
                          <div className="lineage-viewer-related-list">
                            {group.nodes.map((node) => (
                              <button
                                type="button"
                                key={node.nodeId}
                                className={`lineage-viewer-related-item${node.nodeId === effectiveSelectedNodeId ? " selected" : ""}`}
                                onClick={() => focusNode(node.nodeId)}
                              >
                                <div className="lineage-viewer-related-item-copy">
                                  <Text size={200} weight="medium">{node.displayName}</Text>
                                  <Text size={100} className="lineage-viewer-muted">
                                    {[getEntityTypeLabel(node.entityType), node.datasetId ?? node.tableName ?? ""].filter(Boolean).join(" • ")}
                                  </Text>
                                </div>
                                <Badge appearance="outline" size="small">{getEntityTypeLabel(node.entityType)}</Badge>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )}

            {showDetails && !selectedNode && (
              <Text size={200} className="lineage-viewer-muted">{t("LineageViewer_NoSelection", "Select a node in the graph to see details.")}</Text>
            )}

          </div>
        ),
      }}
      />
      <Dialog
        open={scopeDialogOpen}
        onOpenChange={(_, data) => {
          if (!data.open) {
            setItemSearchText("");
            setScopeDraftWorkspaceId("all");
          }
          setScopeDialogOpen(data.open);
        }}
      >
        <DialogSurface className="lineage-viewer-scope-dialog-surface">
          <DialogBody>
            <DialogTitle>{t("LineageViewer_SelectScope_Title", "Choose lineage scope")}</DialogTitle>
            <DialogContent>
              <div className="lineage-viewer-scope-browser">
                {/* ── Left: workspace list ── */}
                <div className="lineage-viewer-scope-workspaces">
                  <Text size={200} weight="semibold" className="lineage-viewer-scope-panel-label">
                    {t("LineageViewer_Workspaces", "Workspaces")}
                  </Text>
                  <div className="lineage-viewer-scope-workspace-list">
                    <button
                      type="button"
                      className={`lineage-viewer-scope-ws-item${scopeDraftWorkspaceId === "all" ? " selected" : ""}`}
                      onClick={() => setScopeDraftWorkspaceId("all")}
                    >
                      <Globe20Regular className="lineage-viewer-scope-ws-icon" />
                      <Text size={200} truncate block>{t("LineageViewer_AllWorkspaces", "All workspaces")}</Text>
                    </button>
                    {MOCK_WORKSPACES.map((ws) => (
                      <button
                        type="button"
                        key={ws.id}
                        className={`lineage-viewer-scope-ws-item${scopeDraftWorkspaceId === ws.id ? " selected" : ""}`}
                        onClick={() => setScopeDraftWorkspaceId(ws.id)}
                      >
                        <FolderOpen20Regular className="lineage-viewer-scope-ws-icon" />
                        <Text size={200} truncate block>{ws.name}</Text>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Right: catalog browser ── */}
                <div className="lineage-viewer-scope-items-panel">
                  <div className="lineage-viewer-scope-items-topbar">
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <Text weight="semibold" size={400}>{t("LineageViewer_ScopeCatalog_Title", "Browse lineage scope")}</Text>
                      <Text size={200} className="lineage-viewer-muted">
                        {t("LineageViewer_ScopeCatalog_Description", "Select a model or report from the current workspace selection.")}
                      </Text>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <Input
                        placeholder={t("LineageViewer_SearchItems", "Search models and reports...")}
                        value={itemSearchText}
                        onChange={(_, d) => setItemSearchText(d.value)}
                        contentBefore={<Search20Regular />}
                        size="medium"
                        className="lineage-viewer-scope-items-search"
                      />
                      <Badge appearance="tint" size="large" style={{ whiteSpace: "nowrap" }}>{visibleScopeItemCount} items</Badge>
                    </div>
                  </div>

                  <div className="lineage-viewer-scope-current-workspace">
                    <Text size={100} weight="semibold" className="lineage-viewer-muted">
                      {t("LineageViewer_Col_Workspace", "Workspace")}
                    </Text>
                    <Text size={200}>{selectedWorkspaceName}</Text>
                  </div>

                  <div className="lineage-viewer-scope-catalog">
                    {showAllScopeOption && (
                      <div className="lineage-viewer-scope-section">
                        <Text size={100} weight="semibold" className="lineage-viewer-muted lineage-viewer-scope-section-title">
                          {t("LineageViewer_ScopeSection_QuickAccess", "Quick access")}
                        </Text>
                        <button
                          type="button"
                          className={`lineage-viewer-scope-catalog-item${scopeDraftModelId === "all" && scopeDraftReportNodeId === "all" ? " selected" : ""}`}
                          onClick={() => { setScopeDraftModelId("all"); setScopeDraftReportNodeId("all"); }}
                        >
                          <div className="lineage-viewer-scope-catalog-main">
                            <Globe20Regular className="lineage-viewer-scope-item-icon lineage-viewer-scope-item-icon--all" />
                            <div className="lineage-viewer-scope-catalog-copy">
                              <Text size={200} weight="medium" className="lineage-viewer-scope-item-name">{t("LineageViewer_AllScope", "All models & reports")}</Text>
                              <div className="lineage-viewer-scope-catalog-meta">
                                <Badge appearance="outline" size="small">{t("LineageViewer_TypeAll", "All")}</Badge>
                                <Text size={100} className="lineage-viewer-muted">{t("LineageViewer_AllWorkspaces", "All workspaces")}</Text>
                              </div>
                            </div>
                          </div>
                          {scopeDraftModelId === "all" && scopeDraftReportNodeId === "all" && (
                            <CheckmarkCircle20Filled className="lineage-viewer-scope-item-check" />
                          )}
                        </button>
                      </div>
                    )}

                    <div className="lineage-viewer-scope-section">
                      <Text size={100} weight="semibold" className="lineage-viewer-muted lineage-viewer-scope-section-title">
                        {t("LineageViewer_ScopeSection_Models", "Semantic models")}
                      </Text>
                      {filteredScopeModels.length > 0 ? filteredScopeModels.map((model) => {
                        const workspaceId = MODEL_WORKSPACE_MAP[model.id] ?? "ws-sales";
                        const workspaceName = MOCK_WORKSPACES.find((workspace) => workspace.id === workspaceId)?.name ?? workspaceId;
                        return (
                          <button
                            type="button"
                            key={model.id}
                            className={`lineage-viewer-scope-catalog-item${scopeDraftModelId === model.id ? " selected" : ""}`}
                            onClick={() => { setScopeDraftModelId(model.id); setScopeDraftReportNodeId("all"); }}
                          >
                            <div className="lineage-viewer-scope-catalog-main">
                              <Database20Regular className="lineage-viewer-scope-item-icon lineage-viewer-scope-item-icon--model" />
                              <div className="lineage-viewer-scope-catalog-copy">
                                <Text size={200} weight="medium" className="lineage-viewer-scope-item-name">{model.displayName}</Text>
                                <div className="lineage-viewer-scope-catalog-meta">
                                  <Badge appearance="outline" size="small">{t("LineageViewer_TypeModel", "Semantic model")}</Badge>
                                  <Text size={100} className="lineage-viewer-muted">{workspaceName}</Text>
                                  <Text size={100} className="lineage-viewer-muted">{model.nodeCount} {t("LineageViewer_Nodes", "nodes")}</Text>
                                </div>
                              </div>
                            </div>
                            {scopeDraftModelId === model.id && (
                              <CheckmarkCircle20Filled className="lineage-viewer-scope-item-check" />
                            )}
                          </button>
                        );
                      }) : (
                        <Text size={200} className="lineage-viewer-muted lineage-viewer-scope-empty-state">
                          {t("LineageViewer_ScopeSection_Models_Empty", "No semantic models match the current filters.")}
                        </Text>
                      )}
                    </div>

                    <div className="lineage-viewer-scope-section">
                      <Text size={100} weight="semibold" className="lineage-viewer-muted lineage-viewer-scope-section-title">
                        {t("LineageViewer_ScopeSection_Reports", "Reports")}
                      </Text>
                      {filteredScopeReports.length > 0 ? filteredScopeReports.map((reportNode) => {
                        const workspaceId = MODEL_WORKSPACE_MAP[reportNode.datasetId ?? ""] ?? "ws-sales";
                        const workspaceName = MOCK_WORKSPACES.find((workspace) => workspace.id === workspaceId)?.name ?? workspaceId;
                        return (
                          <button
                            type="button"
                            key={reportNode.nodeId}
                            className={`lineage-viewer-scope-catalog-item${scopeDraftReportNodeId === reportNode.nodeId ? " selected" : ""}`}
                            onClick={() => {
                              const modelId = reportNode.datasetId ?? "all";
                              setScopeDraftModelId(modelId);
                              setScopeDraftReportNodeId(reportNode.nodeId);
                            }}
                          >
                            <div className="lineage-viewer-scope-catalog-main">
                              <DocumentText20Regular className="lineage-viewer-scope-item-icon lineage-viewer-scope-item-icon--report" />
                              <div className="lineage-viewer-scope-catalog-copy">
                                <Text size={200} weight="medium" className="lineage-viewer-scope-item-name">{reportNode.displayName}</Text>
                                <div className="lineage-viewer-scope-catalog-meta">
                                  <Badge appearance="outline" size="small">{t("LineageViewer_TypeReport", "Report")}</Badge>
                                  <Text size={100} className="lineage-viewer-muted">{workspaceName}</Text>
                                  <Text size={100} className="lineage-viewer-muted">{reportNode.modelName ?? reportNode.datasetId ?? ""}</Text>
                                </div>
                              </div>
                            </div>
                            {scopeDraftReportNodeId === reportNode.nodeId && (
                              <CheckmarkCircle20Filled className="lineage-viewer-scope-item-check" />
                            )}
                          </button>
                        );
                      }) : (
                        <Text size={200} className="lineage-viewer-muted lineage-viewer-scope-empty-state">
                          {t("LineageViewer_ScopeSection_Reports_Empty", "No reports match the current filters.")}
                        </Text>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="subtle" onClick={() => setScopeDialogOpen(false)}>
                {t("LineageViewer_Cancel", "Cancel")}
              </Button>
              <Button
                appearance="primary"
                onClick={() => {
                  onDefinitionChange({
                    ...definition,
                    selectedModelId: scopeDraftModelId,
                    selectedReportNodeId: scopeDraftReportNodeId,
                    focusNodeId: undefined,
                  });
                  setItemSearchText("");
                  setScopeDraftWorkspaceId("all");
                  setScopeDialogOpen(false);
                }}
              >
                {t("LineageViewer_Apply", "Apply")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
