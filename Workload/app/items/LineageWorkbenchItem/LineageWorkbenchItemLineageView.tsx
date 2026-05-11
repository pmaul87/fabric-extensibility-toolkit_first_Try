import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import {
  Button,
  Input,
  MessageBar,
  MessageBarBody,
  Select,
  Text,
  Radio,
  RadioGroup,
  makeStyles,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ChevronLeftFilled,
  ChevronRightFilled,
  ChevronDownRegular,
  ChevronRightRegular,
  SearchRegular,
  SettingsRegular,
  FilterRegular,
  DataTrendingRegular,
  TableRegular,
  InfoRegular,
} from "@fluentui/react-icons";

import { OneLakeLineageStorage } from "../../clients/lineage/OneLakeLineageStorage";
import { LineageGraphView, LineageViewerNode, LineageViewerEdge } from "./LineageGraphView";
import { LineageTableView } from "./LineageTableView";
import { LineageDetailView } from "./LineageDetailView";
import type { Requirement } from "../RequirementBoardItem";

// ─── Styles ───────────────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = 260;
const DEFAULT_GRAPH_NODE_LIMIT = 120;
type ExploreLayoutMode = "stacked" | "side-by-side" | "top-bottom";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "row",
    height: "100%",
    width: "100%",
    overflow: "hidden",
  },

  // ── Left sidebar ──────────────────────────────────────────────────────────
  sidebar: {
    display: "flex",
    flexDirection: "column",
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground2,
    flexShrink: 0,
    overflow: "hidden",
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    minHeight: "44px",
    flexShrink: 0,
  },
  sidebarTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
  },
  sidebarContent: {
    flex: 1,
    overflowY: "auto",
    padding: tokens.spacingVerticalM,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },

  // ── Sidebar section accordion ─────────────────────────────────────────────
  sidebarSection: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
  },
  sidebarSectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    cursor: "pointer",
    padding: `${tokens.spacingVerticalXS} 0`,
    color: tokens.colorNeutralForeground2,
    userSelect: "none",
  },
  sidebarSectionLabel: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    flex: 1,
  },
  sidebarSectionBody: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalS,
  },

  // ── Stats grid ────────────────────────────────────────────────────────────
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: tokens.spacingHorizontalS,
  },
  statItem: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: tokens.spacingVerticalXS,
    background: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  statValue: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorBrandForeground1,
  },
  statLabel: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
  },

  // ── Collapsed sidebar rail ────────────────────────────────────────────────
  sidebarRail: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: `${tokens.spacingVerticalM} 0`,
    gap: tokens.spacingVerticalS,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground2,
    width: "44px",
    flexShrink: 0,
  },

  // ── Main content ──────────────────────────────────────────────────────────
  mainContent: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: tokens.colorNeutralBackground1,
  },

  // ── Collapsible panel ─────────────────────────────────────────────────────
  panel: {
    display: "flex",
    flexDirection: "column",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: "hidden",
    flexShrink: 0,
  },
  panelFill: {
    flex: 1,
    minHeight: "0",
  },
  panelFixed: {
    minHeight: "220px",
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    background: tokens.colorNeutralBackground2,
    cursor: "pointer",
    userSelect: "none",
    flexShrink: 0,
  },
  panelHeaderTitle: {
    flex: 1,
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
  },
  panelHeaderMeta: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  panelBody: {
    flex: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  graphHint: {
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground3,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
  },
  graphHintText: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
  },
  graphEmptyBody: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.spacingVerticalXL,
    textAlign: "center",
  },
  splitExplore: {
    flex: 1,
    minHeight: "280px",
    display: "flex",
    overflow: "hidden",
  },
  splitExploreHorizontal: {
    flexDirection: "row",
  },
  splitExploreVertical: {
    flexDirection: "column",
  },
  splitPane: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
    flex: 1,
    overflow: "hidden",
  },
  splitPaneHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  splitDividerVertical: {
    width: "1px",
    background: tokens.colorNeutralStroke2,
    flexShrink: 0,
  },
  splitDividerHorizontal: {
    height: "1px",
    background: tokens.colorNeutralStroke2,
    flexShrink: 0,
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNodeId(node: any): string {
  return String(node?.nodeId ?? node?.node_id ?? "");
}
function getDisplayName(node: any): string {
  return String(
    node?.displayName
      ?? node?.display_name
      ?? node?.reportName
      ?? node?.report_name
      ?? node?.modelName
      ?? node?.model_name
      ?? node?.objectName
      ?? node?.object_name
      ?? node?.name
      ?? node?.title
      ?? getNodeId(node)
  );
}
function getEntityType(node: any): string {
  return String(node?.entityType ?? node?.entity_type ?? "unknown");
}
function getFrom(edge: any): string {
  return String(edge?.fromNodeId ?? edge?.from_node_id ?? "");
}
function getTo(edge: any): string {
  return String(edge?.toNodeId ?? edge?.to_node_id ?? "");
}

function createMockSnapshot() {
  return {
    generatedAtUtc: new Date().toISOString(),
    nodes: [
      { nodeId: "report:sales_overview", displayName: "Sales Overview", entityType: "report" },
      { nodeId: "visual:sales_overview|kpi_card", displayName: "KPI Card", entityType: "visual" },
      { nodeId: "measure:sales|total_sales", displayName: "Total Sales", entityType: "measure" },
      { nodeId: "table:sales", displayName: "Sales", entityType: "table" },
      { nodeId: "column:sales|amount", displayName: "Sales.Amount", entityType: "column" },
    ],
    edges: [
      { fromNodeId: "report:sales_overview", toNodeId: "visual:sales_overview|kpi_card" },
      { fromNodeId: "visual:sales_overview|kpi_card", toNodeId: "measure:sales|total_sales" },
      { fromNodeId: "table:sales", toNodeId: "column:sales|amount" },
      { fromNodeId: "column:sales|amount", toNodeId: "measure:sales|total_sales" },
    ],
  };
}

// ─── SidebarSection ───────────────────────────────────────────────────────────

interface SidebarSectionProps {
  label: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function SidebarSection({ label, icon, defaultOpen = true, children }: SidebarSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const styles = useStyles();
  return (
    <div className={styles.sidebarSection}>
      <div className={styles.sidebarSectionHeader} onClick={() => setOpen((v) => !v)}>
        {icon}
        <span className={styles.sidebarSectionLabel}>{label}</span>
        {open ? <ChevronDownRegular fontSize={14} /> : <ChevronRightRegular fontSize={14} />}
      </div>
      {open && <div className={styles.sidebarSectionBody}>{children}</div>}
    </div>
  );
}

// ─── CollapsiblePanel ─────────────────────────────────────────────────────────

interface CollapsiblePanelProps {
  title: string;
  icon: React.ReactNode;
  meta?: string;
  expanded: boolean;
  onToggle: () => void;
  /** fill remaining height when true */
  fillHeight?: boolean;
  children: React.ReactNode;
}

function CollapsiblePanel({
  title,
  icon,
  meta,
  expanded,
  onToggle,
  fillHeight = false,
  children,
}: CollapsiblePanelProps) {
  const styles = useStyles();

  const panelExtra = expanded ? (fillHeight ? styles.panelFill : styles.panelFixed) : "";

  return (
    <div className={`${styles.panel}${panelExtra ? ` ${panelExtra}` : ""}`}>
      <div className={styles.panelHeader} onClick={onToggle}>
        {icon}
        <span className={styles.panelHeaderTitle}>{title}</span>
        {meta && <span className={styles.panelHeaderMeta}>{meta}</span>}
        {expanded ? <ChevronDownRegular fontSize={16} /> : <ChevronRightRegular fontSize={16} />}
      </div>
      {expanded && <div className={styles.panelBody}>{children}</div>}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

interface LineageWorkbenchItemLineageViewProps {
  workloadClient: WorkloadClientAPI;
  workspaceId?: string;
  targetLakehouseId?: string;
  lineage: any;
  onLineageChange: (next: any) => void;
  onOpenRequirementsBoard?: () => void;
}

export function LineageWorkbenchItemLineageView({
  workloadClient,
  workspaceId,
  targetLakehouseId,
  lineage,
  onLineageChange,
  onOpenRequirementsBoard,
}: LineageWorkbenchItemLineageViewProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const hasHydratedActualGraphRef = useRef(false);

  // ── Layout state ──────────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tableExpanded, setTableExpanded] = useState(true);
  const [graphExpanded, setGraphExpanded] = useState(false);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // ── Filter state ──────────────────────────────────────────────────────────
  const [searchText, setSearchText] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [graphScope, setGraphScope] = useState<"focused" | "full">("focused");
  const [graphNodeLimit, setGraphNodeLimit] = useState<number>(DEFAULT_GRAPH_NODE_LIMIT);
  const [exploreLayout, setExploreLayout] = useState<ExploreLayoutMode>("stacked");

  // ── Data source ───────────────────────────────────────────────────────────
  const dataSourceMode = lineage?.dataSourceMode === "mock" ? "mock" : "actual";

  useEffect((): void | (() => void) => {
    if (dataSourceMode !== "actual") {
      return;
    }
    if (hasHydratedActualGraphRef.current) {
      return;
    }
    if (!workspaceId || !targetLakehouseId) {
      return;
    }
    if (lineage?.graphSnapshot?.nodes?.length || lineage?.graphSnapshot?.edges?.length) {
      hasHydratedActualGraphRef.current = true;
      return;
    }

    let cancelled = false;
    const loadActualGraph = async (): Promise<void> => {
      try {
        const storage = new OneLakeLineageStorage(workloadClient);
        storage.initializeForItem(targetLakehouseId, workspaceId);
        const loadedGraph = await storage.loadLineageGraph(workspaceId);
        const snapshot = loadedGraph?.graphSnapshot ?? loadedGraph;
        if (cancelled || !snapshot) {
          return;
        }

        hasHydratedActualGraphRef.current = true;
        onLineageChange({
          ...(lineage ?? {}),
          dataSourceMode: "actual",
          graphSnapshot: snapshot,
        });
      } catch (error) {
        console.warn("Unable to hydrate actual lineage graph from lakehouse:", error);
      }
    };

    loadActualGraph();
    return () => {
      cancelled = true;
    };
  }, [dataSourceMode, workspaceId, targetLakehouseId, workloadClient, lineage, onLineageChange]);

  const activeSnapshot = useMemo(() => {
    if (dataSourceMode === "mock") {
      return lineage?.mockGraphSnapshot ?? createMockSnapshot();
    }
    return lineage?.graphSnapshot ?? { nodes: [], edges: [] };
  }, [dataSourceMode, lineage]);

  // ── Node & edge normalization ─────────────────────────────────────────────
  const nodes: LineageViewerNode[] = useMemo(() => {
    const raw = activeSnapshot?.nodes ?? [];
    return raw
      .map((n: any) => ({
        nodeId: getNodeId(n),
        displayName: getDisplayName(n),
        entityType: getEntityType(n) as LineageViewerNode["entityType"],
        tableName: n?.tableName ?? n?.table_name ?? undefined,
        datasetId: n?.datasetId ?? n?.dataset_id ?? undefined,
        modelName: n?.modelName ?? n?.model_name ?? undefined,
        objectName: n?.objectName ?? n?.object_name ?? undefined,
        objectSubtype: n?.objectSubtype ?? n?.object_subtype ?? undefined,
        dataType: n?.dataType ?? n?.data_type ?? undefined,
        expression:
          n?.expression
          ?? n?.daxExpression
          ?? n?.dax_expression
          ?? n?.measureExpression
          ?? n?.measure_expression
          ?? n?.columnExpression
          ?? n?.column_expression
          ?? n?.expressionText
          ?? n?.expression_text
          ?? n?.formula
          ?? n?.["Measure Expression"]
          ?? n?.["Column Expression"]
          ?? undefined,
        formatString:
          n?.formatString
          ?? n?.format_string
          ?? n?.format
          ?? n?.formatText
          ?? n?.format_text
          ?? n?.formatStringExpression
          ?? n?.format_string_expression
          ?? n?.["Format String"]
          ?? undefined,
        reportId: n?.reportId ?? n?.report_id ?? undefined,
        visualType: n?.visualType ?? n?.visual_type ?? undefined,
      }))
      .filter((n: LineageViewerNode) => n.nodeId !== "");
  }, [activeSnapshot]);

  const edges: LineageViewerEdge[] = useMemo(() => {
    const raw = activeSnapshot?.edges ?? [];
    return raw.map((e: any, idx: number) => ({
      edgeId: e?.edgeId ?? e?.edge_id ?? `edge-${idx}-${getFrom(e)}-${getTo(e)}`,
      fromNodeId: getFrom(e),
      toNodeId: getTo(e),
      edgeType: e?.edgeType ?? e?.edge_type ?? "dependency",
      datasetId: e?.datasetId ?? e?.dataset_id ?? undefined,
      reportId: e?.reportId ?? e?.report_id ?? undefined,
      evidence: e?.evidence ?? undefined,
    }));
  }, [activeSnapshot]);

  const entityTypes = useMemo(() => {
    const set = new Set<string>();
    for (const node of nodes) set.add(node.entityType);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [nodes]);

  // ── Filtered results ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    return nodes.filter((node) => {
      if (entityFilter !== "all" && node.entityType !== entityFilter) return false;
      if (!search) return true;
      return `${node.displayName} ${node.nodeId} ${node.entityType}`.toLowerCase().includes(search);
    });
  }, [nodes, searchText, entityFilter]);

  const filteredEdges: LineageViewerEdge[] = useMemo(() => {
    const ids = new Set(filtered.map((n) => n.nodeId));
    return edges.filter((e) => ids.has(e.fromNodeId) && ids.has(e.toNodeId));
  }, [edges, filtered]);

  const {
    graphNodes,
    graphEdges,
    hiddenNodeCount,
    hiddenEdgeCount,
    requiresSelection,
  } = useMemo(() => {
    if (filtered.length === 0) {
      return {
        graphNodes: [] as LineageViewerNode[],
        graphEdges: [] as LineageViewerEdge[],
        hiddenNodeCount: 0,
        hiddenEdgeCount: 0,
        requiresSelection: false,
      };
    }

    if (graphScope === "full") {
      const limitedNodes = [...filtered]
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .slice(0, graphNodeLimit);
      const limitedNodeIds = new Set(limitedNodes.map((n) => n.nodeId));
      const limitedEdges = filteredEdges.filter((e) => limitedNodeIds.has(e.fromNodeId) && limitedNodeIds.has(e.toNodeId));

      return {
        graphNodes: limitedNodes,
        graphEdges: limitedEdges,
        hiddenNodeCount: Math.max(0, filtered.length - limitedNodes.length),
        hiddenEdgeCount: Math.max(0, filteredEdges.length - limitedEdges.length),
        requiresSelection: false,
      };
    }

    const selectedInFilter = selectedNodeId && filtered.some((n) => n.nodeId === selectedNodeId);
    if (!selectedInFilter) {
      return {
        graphNodes: [] as LineageViewerNode[],
        graphEdges: [] as LineageViewerEdge[],
        hiddenNodeCount: filtered.length,
        hiddenEdgeCount: filteredEdges.length,
        requiresSelection: true,
      };
    }

    const adjacency = new Map<string, string[]>();
    for (const edge of filteredEdges) {
      if (!adjacency.has(edge.fromNodeId)) adjacency.set(edge.fromNodeId, []);
      if (!adjacency.has(edge.toNodeId)) adjacency.set(edge.toNodeId, []);
      adjacency.get(edge.fromNodeId)!.push(edge.toNodeId);
      adjacency.get(edge.toNodeId)!.push(edge.fromNodeId);
    }

    const visited = new Set<string>([selectedNodeId]);
    const queue: string[] = [selectedNodeId];
    while (queue.length > 0 && visited.size < graphNodeLimit) {
      const current = queue.shift()!;
      const neighbors = adjacency.get(current) ?? [];
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
        if (visited.size >= graphNodeLimit) break;
      }
    }

    const limitedNodes = filtered.filter((n) => visited.has(n.nodeId));
    const limitedEdges = filteredEdges.filter((e) => visited.has(e.fromNodeId) && visited.has(e.toNodeId));
    return {
      graphNodes: limitedNodes,
      graphEdges: limitedEdges,
      hiddenNodeCount: Math.max(0, filtered.length - limitedNodes.length),
      hiddenEdgeCount: Math.max(0, filteredEdges.length - limitedEdges.length),
      requiresSelection: false,
    };
  }, [filtered, filteredEdges, graphNodeLimit, graphScope, selectedNodeId]);

  // ── BFS highlight map ─────────────────────────────────────────────────────
  const { depthByNodeId, highlightedNodeIds, highlightedEdgeIds } = useMemo(() => {
    const depthMap = new Map<string, number>();
    const hlNodes = new Set<string>();
    const hlEdges = new Set<string>();
    if (!selectedNodeId) return { depthByNodeId: depthMap, highlightedNodeIds: hlNodes, highlightedEdgeIds: hlEdges };

    depthMap.set(selectedNodeId, 0);
    const queue: string[] = [selectedNodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const d = depthMap.get(current)!;
      for (const e of filteredEdges) {
        if (e.fromNodeId === current && !depthMap.has(e.toNodeId)) {
          depthMap.set(e.toNodeId, d + 1);
          hlNodes.add(e.toNodeId);
          hlEdges.add(e.edgeId);
          queue.push(e.toNodeId);
        }
        if (e.toNodeId === current && !depthMap.has(e.fromNodeId)) {
          depthMap.set(e.fromNodeId, d + 1);
          hlNodes.add(e.fromNodeId);
          hlEdges.add(e.edgeId);
          queue.push(e.fromNodeId);
        }
      }
    }
    return { depthByNodeId: depthMap, highlightedNodeIds: hlNodes, highlightedEdgeIds: hlEdges };
  }, [selectedNodeId, filteredEdges]);

  // ── Empty state text ──────────────────────────────────────────────────────
  const emptyMessage =
    dataSourceMode === "actual" && !targetLakehouseId
      ? t(
          "LineageWorkbench_Lineage_Empty_Actual_MissingLakehouse",
          "Actual data mode requires a saved OneLake Lakehouse ID. Open Extract, enter the lakehouse item ID, and save the workbench before loading real lineage data."
        )
      : dataSourceMode === "actual"
      ? t("LineageWorkbench_Lineage_Empty_Actual", "No actual graph snapshot is stored on this item yet. The workbench is trying to load it from the target lakehouse.")
      : t("LineageWorkbench_Lineage_Empty", "No graph nodes available. Run extraction first.");

  // In stacked mode, expanded panels split available space evenly.
  const stackedSharedHeight = exploreLayout === "stacked";
  const graphFills = graphExpanded && (stackedSharedHeight || (!tableExpanded && !detailExpanded));
  const tableFills = tableExpanded && (stackedSharedHeight || (!graphExpanded && !detailExpanded));
  const detailFills = detailExpanded && (stackedSharedHeight || (!graphExpanded && !tableExpanded));

  const handleCreateRequirement = (requirement: Requirement) => {
    onLineageChange({
      ...(lineage ?? {}),
      requirements: [...(lineage?.requirements ?? []), requirement],
    });
    if (!detailExpanded) {
      setDetailExpanded(true);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={styles.root}>
      {/* ── Left sidebar ── */}
      {sidebarOpen ? (
        <div className={styles.sidebar} style={{ width: SIDEBAR_WIDTH }}>
          <div className={styles.sidebarHeader}>
            <Text className={styles.sidebarTitle}>
              {t("LineageWorkbench_Sidebar_Title", "Filters & Settings")}
            </Text>
            <Tooltip content={t("LineageWorkbench_Sidebar_Collapse", "Collapse panel")} relationship="label">
              <Button
                appearance="subtle"
                size="small"
                icon={<ChevronLeftFilled />}
                onClick={() => setSidebarOpen(false)}
              />
            </Tooltip>
          </div>

          <div className={styles.sidebarContent}>
            {/* Settings section */}
            <SidebarSection
              label={t("LineageWorkbench_Section_Settings", "Settings")}
              icon={<SettingsRegular fontSize={14} />}
            >
              <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
                {t("LineageWorkbench_DataSource", "Data source")}
              </Text>
              <RadioGroup
                layout="vertical"
                value={dataSourceMode}
                onChange={(_, data) => {
                  const nextMode = data.value === "mock" ? "mock" : "actual";
                  if (nextMode === dataSourceMode) return;
                  onLineageChange({
                    ...(lineage ?? {}),
                    dataSourceMode: nextMode,
                    mockGraphSnapshot: lineage?.mockGraphSnapshot ?? createMockSnapshot(),
                  });
                }}
              >
                <Radio value="actual" label={t("LineageWorkbench_Lineage_Mode_Actual", "Actual data")} />
                <Radio value="mock" label={t("LineageWorkbench_Lineage_Mode_Mock", "Mock data")} />
              </RadioGroup>

              <Text size={200} style={{ color: tokens.colorNeutralForeground2, marginTop: tokens.spacingVerticalXS }}>
                {t("LineageWorkbench_GraphDensity", "Graph density")}
              </Text>
              <RadioGroup
                layout="vertical"
                value={graphScope}
                onChange={(_, data) => {
                  const next = data.value === "full" ? "full" : "focused";
                  setGraphScope(next);
                  if (next === "focused" && !selectedNodeId && filtered.length > 0) {
                    setSelectedNodeId(filtered[0].nodeId);
                  }
                }}
              >
                <Radio
                  value="focused"
                  label={t("LineageWorkbench_GraphScope_Focused", "Focused neighborhood")}
                />
                <Radio
                  value="full"
                  label={t("LineageWorkbench_GraphScope_Full", "Full graph (limited)")}
                />
              </RadioGroup>

              <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
                {t("LineageWorkbench_GraphNodeLimit", "Max nodes in graph view")}
              </Text>
              <Select
                value={String(graphNodeLimit)}
                onChange={(_, data) => setGraphNodeLimit(Number(data.value) || DEFAULT_GRAPH_NODE_LIMIT)}
                size="small"
              >
                {[80, 120, 200, 350, 500].map((limit) => (
                  <option key={limit} value={String(limit)}>{limit}</option>
                ))}
              </Select>

              <Text size={200} style={{ color: tokens.colorNeutralForeground2, marginTop: tokens.spacingVerticalXS }}>
                {t("LineageWorkbench_ExploreLayout", "Table + Graph layout")}
              </Text>
              <RadioGroup
                layout="vertical"
                value={exploreLayout}
                onChange={(_, data) => {
                  const value = String(data.value);
                  const next: ExploreLayoutMode =
                    value === "side-by-side" || value === "top-bottom" ? value : "stacked";
                  setExploreLayout(next);
                }}
              >
                <Radio value="stacked" label={t("LineageWorkbench_ExploreLayout_Stacked", "Stacked panels")} />
                <Radio value="side-by-side" label={t("LineageWorkbench_ExploreLayout_SideBySide", "Side by side")} />
                <Radio value="top-bottom" label={t("LineageWorkbench_ExploreLayout_TopBottom", "Top and bottom")} />
              </RadioGroup>
            </SidebarSection>

            {/* Stats section */}
            <SidebarSection
              label={t("LineageWorkbench_Section_Stats", "Stats")}
              icon={<DataTrendingRegular fontSize={14} />}
            >
              <div className={styles.statsGrid}>
                <div className={styles.statItem}>
                  <Text className={styles.statValue}>{nodes.length}</Text>
                  <Text className={styles.statLabel}>{t("LineageWorkbench_Stat_Nodes", "Nodes")}</Text>
                </div>
                <div className={styles.statItem}>
                  <Text className={styles.statValue}>{edges.length}</Text>
                  <Text className={styles.statLabel}>{t("LineageWorkbench_Stat_Edges", "Edges")}</Text>
                </div>
                <div className={styles.statItem}>
                  <Text className={styles.statValue}>{entityTypes.length}</Text>
                  <Text className={styles.statLabel}>{t("LineageWorkbench_Stat_Types", "Types")}</Text>
                </div>
                <div className={styles.statItem}>
                  <Text className={styles.statValue}>{filtered.length}</Text>
                  <Text className={styles.statLabel}>{t("LineageWorkbench_Stat_Visible", "Visible")}</Text>
                </div>
              </div>
            </SidebarSection>

            {/* Filters section */}
            <SidebarSection
              label={t("LineageWorkbench_Section_Filters", "Filters")}
              icon={<FilterRegular fontSize={14} />}
            >
              <Input
                contentBefore={<SearchRegular />}
                placeholder={t("LineageWorkbench_Search", "Search nodes...")}
                value={searchText}
                onChange={(_, data) => setSearchText(data.value)}
                size="small"
              />
              <Select
                value={entityFilter}
                onChange={(_, data) => setEntityFilter(data.value)}
                size="small"
              >
                <option value="all">{t("LineageWorkbench_AllTypes", "All types")}</option>
                {entityTypes.map((et) => (
                  <option key={et} value={et}>{et}</option>
                ))}
              </Select>
              <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                {t("LineageWorkbench_Showing", "Showing")} {filtered.length} / {nodes.length}
              </Text>
            </SidebarSection>
          </div>
        </div>
      ) : (
        /* ── Collapsed rail ── */
        <div className={styles.sidebarRail}>
          <Tooltip content={t("LineageWorkbench_Sidebar_Expand", "Expand panel")} relationship="label">
            <Button
              appearance="subtle"
              size="small"
              icon={<ChevronRightFilled />}
              onClick={() => setSidebarOpen(true)}
            />
          </Tooltip>
          <Tooltip content={t("LineageWorkbench_Section_Filters", "Filters")} relationship="label">
            <Button appearance="subtle" size="small" icon={<FilterRegular />} onClick={() => setSidebarOpen(true)} />
          </Tooltip>
          <Tooltip content={t("LineageWorkbench_Section_Settings", "Settings")} relationship="label">
            <Button appearance="subtle" size="small" icon={<SettingsRegular />} onClick={() => setSidebarOpen(true)} />
          </Tooltip>
        </div>
      )}

      {/* ── Main content: three collapsible panels stacked vertically ── */}
      <div className={styles.mainContent}>
        {nodes.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              padding: "40px",
              textAlign: "center",
            }}
          >
            <Text style={{ color: tokens.colorNeutralForeground3, maxWidth: 480 }}>
              {emptyMessage}
            </Text>
          </div>
        ) : (
          <>
            {exploreLayout === "stacked" ? (
              <>
                {/* Table panel */}
                <CollapsiblePanel
                  title={t("LineageWorkbench_Panel_Table", "Table")}
                  icon={<TableRegular fontSize={16} />}
                  meta={
                    selectedNodeId
                      ? t("LineageWorkbench_NodeSelected", "Node selected")
                      : undefined
                  }
                  expanded={tableExpanded}
                  onToggle={() => setTableExpanded((v) => !v)}
                  fillHeight={tableFills}
                >
                  <LineageTableView
                    nodes={filtered}
                    edges={filteredEdges}
                    selectedNodeId={selectedNodeId}
                    onNodeSelect={(id) => {
                      setSelectedNodeId(id);
                      if (!detailExpanded) setDetailExpanded(true);
                    }}
                  />
                </CollapsiblePanel>

                {/* Graph panel */}
                <CollapsiblePanel
                  title={t("LineageWorkbench_Panel_Graph", "Graph")}
                  icon={<DataTrendingRegular fontSize={16} />}
                  meta={`${graphNodes.length}/${filtered.length} nodes · ${graphEdges.length}/${filteredEdges.length} edges`}
                  expanded={graphExpanded}
                  onToggle={() => setGraphExpanded((v) => !v)}
                  fillHeight={graphFills}
                >
                  {(hiddenNodeCount > 0 || hiddenEdgeCount > 0) && (
                    <div className={styles.graphHint}>
                      <Text className={styles.graphHintText}>
                        {t(
                          "LineageWorkbench_GraphHint",
                          "Large graph mode: {{hiddenNodes}} nodes and {{hiddenEdges}} edges are hidden to reduce visual noise.",
                          { hiddenNodes: hiddenNodeCount, hiddenEdges: hiddenEdgeCount }
                        )}
                      </Text>
                    </div>
                  )}

                  {requiresSelection ? (
                    <div className={styles.graphEmptyBody}>
                      <Text style={{ color: tokens.colorNeutralForeground3, maxWidth: 460 }}>
                        {t(
                          "LineageWorkbench_GraphRequiresSelection",
                          "Focused neighborhood mode is enabled. Select a node in the table to render a local subgraph."
                        )}
                      </Text>
                    </div>
                  ) : (
                    <LineageGraphView
                      nodes={graphNodes}
                      edges={graphEdges}
                      focusNodeId={selectedNodeId || undefined}
                      depthByNodeId={depthByNodeId}
                      highlightedNodeIds={highlightedNodeIds}
                      highlightedEdgeIds={highlightedEdgeIds}
                      expandedGroups={expandedGroups}
                      onToggleGroup={(groupId) => {
                        setExpandedGroups(prev => {
                          const next = new Set(prev);
                          if (next.has(groupId)) {
                            next.delete(groupId);
                          } else {
                            next.add(groupId);
                          }
                          return next;
                        });
                      }}
                      onNodeClick={(id) => {
                        setSelectedNodeId(id);
                        if (!detailExpanded) setDetailExpanded(true);
                      }}
                    />
                  )}
                </CollapsiblePanel>
              </>
            ) : (
              <CollapsiblePanel
                title={t("LineageWorkbench_Panel_Explore", "Explore")}
                icon={<DataTrendingRegular fontSize={16} />}
                meta={`${graphNodes.length}/${filtered.length} nodes · ${graphEdges.length}/${filteredEdges.length} edges`}
                expanded={tableExpanded || graphExpanded}
                onToggle={() => {
                  const next = !(tableExpanded || graphExpanded);
                  setTableExpanded(next);
                  setGraphExpanded(next);
                }}
                fillHeight
              >
                {dataSourceMode === "actual" && !targetLakehouseId && (
                  <div className={styles.graphHint}>
                    <MessageBar intent="warning">
                      <MessageBarBody>
                        {t(
                          "LineageWorkbench_Lineage_MissingLakehouse_Warning",
                          "Real lineage data is disabled until a OneLake Lakehouse ID is configured and saved in the Extract view."
                        )}
                      </MessageBarBody>
                    </MessageBar>
                  </div>
                )}
                <div
                  className={`${styles.splitExplore} ${
                    exploreLayout === "side-by-side" ? styles.splitExploreHorizontal : styles.splitExploreVertical
                  }`}
                >
                  <div className={styles.splitPane}>
                    <div className={styles.splitPaneHeader}>
                      <span>{t("LineageWorkbench_Panel_Table", "Table")}</span>
                      <span>{filtered.length}</span>
                    </div>
                    <LineageTableView
                      nodes={filtered}
                      edges={filteredEdges}
                      selectedNodeId={selectedNodeId}
                      onNodeSelect={(id) => {
                        setSelectedNodeId(id);
                        if (!detailExpanded) setDetailExpanded(true);
                      }}
                    />
                  </div>

                  <div className={exploreLayout === "side-by-side" ? styles.splitDividerVertical : styles.splitDividerHorizontal} />

                  <div className={styles.splitPane}>
                    <div className={styles.splitPaneHeader}>
                      <span>{t("LineageWorkbench_Panel_Graph", "Graph")}</span>
                      <span>{`${graphNodes.length}/${filtered.length}`}</span>
                    </div>

                    {(hiddenNodeCount > 0 || hiddenEdgeCount > 0) && (
                      <div className={styles.graphHint}>
                        <Text className={styles.graphHintText}>
                          {t(
                            "LineageWorkbench_GraphHint",
                            "Large graph mode: {{hiddenNodes}} nodes and {{hiddenEdges}} edges are hidden to reduce visual noise.",
                            { hiddenNodes: hiddenNodeCount, hiddenEdges: hiddenEdgeCount }
                          )}
                        </Text>
                      </div>
                    )}

                    {requiresSelection ? (
                      <div className={styles.graphEmptyBody}>
                        <Text style={{ color: tokens.colorNeutralForeground3, maxWidth: 460 }}>
                          {t(
                            "LineageWorkbench_GraphRequiresSelection",
                            "Focused neighborhood mode is enabled. Select a node in the table to render a local subgraph."
                          )}
                        </Text>
                      </div>
                    ) : (
                      <LineageGraphView
                        nodes={graphNodes}
                        edges={graphEdges}
                        focusNodeId={selectedNodeId || undefined}
                        depthByNodeId={depthByNodeId}
                        highlightedNodeIds={highlightedNodeIds}
                        highlightedEdgeIds={highlightedEdgeIds}
                        expandedGroups={expandedGroups}
                        onToggleGroup={(groupId) => {
                          setExpandedGroups(prev => {
                            const next = new Set(prev);
                            if (next.has(groupId)) {
                              next.delete(groupId);
                            } else {
                              next.add(groupId);
                            }
                            return next;
                          });
                        }}
                        onNodeClick={(id) => {
                          setSelectedNodeId(id);
                          if (!detailExpanded) setDetailExpanded(true);
                        }}
                      />
                    )}
                  </div>
                </div>
              </CollapsiblePanel>
            )}

            {/* Details panel */}
            <CollapsiblePanel
              title={t("LineageWorkbench_Panel_Details", "Details")}
              icon={<InfoRegular fontSize={16} />}
              meta={
                selectedNodeId
                  ? nodes.find((n) => n.nodeId === selectedNodeId)?.displayName
                  : t("LineageWorkbench_NoSelection", "No node selected")
              }
              expanded={detailExpanded}
              onToggle={() => setDetailExpanded((v) => !v)}
              fillHeight={detailFills}
            >
              <LineageDetailView
                nodes={filtered}
                edges={filteredEdges}
                selectedNodeId={selectedNodeId}
                requirementsCount={lineage?.requirements?.length ?? 0}
                onOpenRequirementsBoard={onOpenRequirementsBoard}
                onCreateRequirement={handleCreateRequirement}
                onNodeSelect={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  setGraphExpanded(true);
                }}
              />
            </CollapsiblePanel>
          </>
        )}
      </div>
    </div>
  );
}
