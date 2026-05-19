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
  Spinner,
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
  splitTablePane: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
    flex: "0 0 35%",
    maxWidth: "500px",
    overflow: "hidden",
  },
  splitGraphPane: {
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
  resizeHandle: {
    height: "6px",
    background: tokens.colorNeutralBackground2,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    cursor: "ns-resize",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    ":hover": {
      background: tokens.colorBrandBackground2,
    },
    ":active": {
      background: tokens.colorBrandBackground,
    },
  },
  resizeHandleLine: {
    width: "40px",
    height: "2px",
    background: tokens.colorNeutralStroke1,
    borderRadius: "1px",
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockSnapshot() {
  return {
    generatedAtUtc: new Date().toISOString(),
    nodes: [
      { nodeId: "sm:mock_model", displayName: "Sales Model", entityType: "semantic_model" },
      { nodeId: "table:mock_model|Sales", displayName: "Sales", entityType: "table" },
      { nodeId: "table:mock_model|Date", displayName: "Date", entityType: "table" },
      { nodeId: "col:mock_model|Sales|Amount", displayName: "Amount", entityType: "column" },
      { nodeId: "measure:mock_model|Sales|Total Sales", displayName: "Total Sales", entityType: "measure" },
    ],
    edges: [
      { fromNodeId: "table:mock_model|Sales", toNodeId: "table:mock_model|Date", edgeType: "relationship" },
      { fromNodeId: "measure:mock_model|Sales|Total Sales", toNodeId: "col:mock_model|Sales|Amount", edgeType: "dependency" },
    ],
    dimensions: {
      semanticModels: [{ model_id: "mock_model", model_name: "Sales Model" }],
      smTables: [
        { model_id: "mock_model", name: "Sales", ishidden: false },
        { model_id: "mock_model", name: "Date", ishidden: false },
      ],
      smColumns: [{ model_id: "mock_model", table: "Sales", name: "Amount", datatype: "decimal" }],
      smMeasures: [{ model_id: "mock_model", table: "Sales", name: "Total Sales", expression: "SUM(Sales[Amount])" }],
      smRelationships: [{ model_id: "mock_model", name: "Sales_Date", fromtable: "Sales", totable: "Date" }],
      smDependencies: [{ model_id: "mock_model", objectname: "Total Sales", objecttype: "Measure", tablename: "Sales", referencedobjectname: "Amount", referencedobjecttype: "Column", referencedtablename: "Sales" }],
    },
  };
}

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
  /** custom height in pixels (overrides fillHeight) */
  customHeight?: number;
  children: React.ReactNode;
}

function CollapsiblePanel({
  title,
  icon,
  meta,
  expanded,
  onToggle,
  fillHeight = false,
  customHeight,
  children,
}: CollapsiblePanelProps) {
  const styles = useStyles();

  const panelExtra = expanded ? (fillHeight ? styles.panelFill : styles.panelFixed) : "";
  const panelStyle = customHeight && expanded ? { height: `${customHeight}px`, flex: "0 0 auto" } : undefined;

  return (
    <div className={`${styles.panel}${panelExtra ? ` ${panelExtra}` : ""}`} style={panelStyle}>
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

// ─── ResizeHandle ─────────────────────────────────────────────────────────────

interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
}

function ResizeHandle({ onMouseDown }: ResizeHandleProps) {
  const styles = useStyles();
  return (
    <div className={styles.resizeHandle} onMouseDown={onMouseDown}>
      <div className={styles.resizeHandleLine} />
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

interface LineageWorkbenchItemLineageViewProps {
  workloadClient: WorkloadClientAPI;
  workspaceId?: string;
  targetLakehouseId?: string;
  sqlEndpoint?: string;
  lineage: any;
  onLineageChange: (next: any) => void;
  onOpenRequirementsBoard?: () => void;
}

export function LineageWorkbenchItemLineageView({
  workloadClient,
  workspaceId,
  targetLakehouseId,
  sqlEndpoint,
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
  const [loadError, setLoadError] = useState<string>("");
  
  // ── Resizable panel heights ──────────────────────────────────────────────
  const [tableHeight, setTableHeight] = useState<number>(300);
  const [graphHeight, setGraphHeight] = useState<number>(400);
  const [detailHeight, setDetailHeight] = useState<number>(350);

  // ── Resize handlers ───────────────────────────────────────────────────────
  const handleResizeStart = (panel: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = 
      panel === "table" ? tableHeight :
      panel === "graph" ? graphHeight :
      detailHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      const newHeight = Math.max(150, startHeight + delta); // Minimum 150px
      
      if (panel === "table") {
        setTableHeight(newHeight);
      } else if (panel === "graph") {
        setGraphHeight(newHeight);
      } else if (panel === "detail") {
        setDetailHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // ── Filter state ──────────────────────────────────────────────────────────
  const [searchText, setSearchText] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [graphScope, setGraphScope] = useState<"focused" | "full">("focused");
  const [graphNodeLimit, setGraphNodeLimit] = useState<number>(DEFAULT_GRAPH_NODE_LIMIT);
  const [graphDisplayMode, setGraphDisplayMode] = useState<"highlight" | "filter">("filter");
  const [exploreLayout, setExploreLayout] = useState<ExploreLayoutMode>("side-by-side");
  const [isLoadingGraph, setIsLoadingGraph] = useState(false);

  // ── Data source ───────────────────────────────────────────────────────────
  const dataSourceMode = lineage?.dataSourceMode === "mock" ? "mock" : "actual";

  // Check if we should be loading data (to prevent showing empty state prematurely)
  const shouldLoadData = useMemo(() => {
    if (dataSourceMode !== "actual") return false;
    if (hasHydratedActualGraphRef.current) return false;
    if (!targetLakehouseId) return false;
    const hasDimensionData = 
      lineage?.graphSnapshot?.dimensions?.semanticModels?.length > 0 ||
      lineage?.graphSnapshot?.dimensions?.smTables?.length > 0;
    if (hasDimensionData) return false;
    return true;
  }, [dataSourceMode, targetLakehouseId, lineage?.graphSnapshot?.dimensions]);

  useEffect((): void | (() => void) => {
    console.log("[LineageView] Data loading effect running:", {
      dataSourceMode,
      hasHydrated: hasHydratedActualGraphRef.current,
      workspaceId: workspaceId || "MISSING",
      targetLakehouseId: targetLakehouseId || "MISSING",
      hasExistingNodes: !!lineage?.graphSnapshot?.nodes?.length,
      hasExistingEdges: !!lineage?.graphSnapshot?.edges?.length,
    });

    if (dataSourceMode !== "actual") {
      console.log("[LineageView] Skipping load: not in actual mode");
      return;
    }
    if (hasHydratedActualGraphRef.current) {
      console.log("[LineageView] Skipping load: already hydrated");
      return;
    }
    if (!targetLakehouseId) {
      console.log("[LineageView] Skipping load: missing targetLakehouseId");
      return;
    }
    // Check if we have semantic model dimension data (new format)
    const hasDimensionData = 
      lineage?.graphSnapshot?.dimensions?.semanticModels?.length > 0 ||
      lineage?.graphSnapshot?.dimensions?.smTables?.length > 0;
    if (hasDimensionData) {
      console.log("[LineageView] Skipping load: existing dimension data found");
      hasHydratedActualGraphRef.current = true;
      return;
    }

    console.log("[LineageView] Starting API call to load graph...");
    let cancelled = false;
    setLoadError(""); // Clear any previous errors
    setIsLoadingGraph(true);
    const loadActualGraph = async (): Promise<void> => {
      try {
        const storage = new OneLakeLineageStorage(workloadClient);
        storage.initializeForItem(targetLakehouseId, workspaceId);
        const loadedGraph = await storage.loadLineageGraph(workspaceId, sqlEndpoint);
        const snapshot = loadedGraph?.graphSnapshot ?? loadedGraph;
        if (cancelled || !snapshot) {
          return;
        }

        hasHydratedActualGraphRef.current = true;
        console.log("[LineageView] Loaded graph snapshot:", {
          hasNodes: !!snapshot?.nodes?.length,
          hasEdges: !!snapshot?.edges?.length,
          hasDimensions: !!snapshot?.dimensions,
          semanticModelCount: snapshot?.dimensions?.semanticModels?.length || 0,
          smTableCount: snapshot?.dimensions?.smTables?.length || 0,
          smColumnCount: snapshot?.dimensions?.smColumns?.length || 0,
          smMeasureCount: snapshot?.dimensions?.smMeasures?.length || 0,
        });
        onLineageChange({
          ...(lineage ?? {}),
          dataSourceMode: "actual",
          graphSnapshot: snapshot,
        });
      } catch (error) {
        console.warn("Unable to hydrate actual lineage graph from lakehouse:", error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        // Provide user-friendly error messages
        if (errorMsg.includes("lakehouseId is required") || 
            errorMsg.includes("Lakehouse ID is missing")) {
          setLoadError(
            t("LineageWorkbench_Error_MissingLakehouseId", 
              "Lakehouse ID is not configured. Go to Extract view, enter your Lakehouse ID, and save the workbench.")
          );
        } else if (errorMsg.includes("Lakehouse SQL endpoint is not available")) {
          setLoadError(
            t("LineageWorkbench_Error_NoSqlEndpoint", 
              "The lakehouse does not have a SQL endpoint available. Ensure you have a Lakehouse item with Delta tables.")
          );
        } else if (errorMsg.includes("Could not determine workspace ID")) {
          setLoadError(
            t("LineageWorkbench_Error_CannotResolveWorkspace", 
              "Could not determine workspace from lakehouse ID. Please ensure the lakehouse exists and you have access to it.")
          );
        } else {
          setLoadError(
            t("LineageWorkbench_Error_LoadFailed", 
              "Failed to load lineage data: {{error}}", { error: errorMsg })
          );
        }
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
    return lineage?.graphSnapshot ?? { 
      nodes: [], 
      edges: [], 
      dimensions: {
        semanticModels: [],
        smTables: [],
        smColumns: [],
        smMeasures: [],
        smRelationships: [],
        smDependencies: [],
      }
    };
  }, [dataSourceMode, lineage]);

  // ── Node & edge normalization ─────────────────────────────────────────────
  // Builds the graph at runtime from the semantic model dimension tables.
  const nodes: LineageViewerNode[] = useMemo(() => {
    const dimensions = activeSnapshot?.dimensions ?? {};
    const smModels = Array.isArray(dimensions?.semanticModels) ? dimensions.semanticModels : [];
    const smTables = Array.isArray(dimensions?.smTables) ? dimensions.smTables : [];
    const smColumns = Array.isArray(dimensions?.smColumns) ? dimensions.smColumns : [];
    const smMeasures = Array.isArray(dimensions?.smMeasures) ? dimensions.smMeasures : [];

    console.log("[LineageView] Building nodes from dimensions:", {
      modelsCount: smModels.length,
      tablesCount: smTables.length,
      columnsCount: smColumns.length,
      measuresCount: smMeasures.length,
    });

    // Deduplicate dimension data using Map (dimension tables may have duplicate rows)
    const uniqueModels = new Map<string, any>();
    const uniqueTables = new Map<string, any>();
    const uniqueColumns = new Map<string, any>();
    const uniqueMeasures = new Map<string, any>();

    for (const model of smModels) {
      if (model.model_id) {
        uniqueModels.set(model.model_id, model);
      }
    }

    for (const table of smTables) {
      if (table.model_id && table.name) {
        const key = `${table.model_id}|${table.name}`;
        uniqueTables.set(key, table);
      }
    }

    for (const col of smColumns) {
      if (col.model_id && col.table && col.name) {
        const key = `${col.model_id}|${col.table}|${col.name}`;
        uniqueColumns.set(key, col);
      }
    }

    for (const measure of smMeasures) {
      if (measure.model_id && measure.table && measure.name) {
        const key = `${measure.model_id}|${measure.table}|${measure.name}`;
        uniqueMeasures.set(key, measure);
      }
    }

    console.log("[LineageView] After deduplication:", {
      uniqueModels: uniqueModels.size,
      uniqueTables: uniqueTables.size,
      uniqueColumns: uniqueColumns.size,
      uniqueMeasures: uniqueMeasures.size,
    });

    const result: LineageViewerNode[] = [];

    for (const model of uniqueModels.values()) {
      result.push({
        nodeId: `sm:${model.model_id}`,
        displayName: model.model_name || model.dataset_name || `Model (${model.model_id})`,
        entityType: "semantic_model",
        isGroupNode: true,
        datasetId: model.model_id,
        modelName: model.model_name,
      });
    }

    for (const table of uniqueTables.values()) {
      result.push({
        nodeId: `table:${table.model_id}|${table.name}`,
        displayName: table.name,
        entityType: "table",
        tableName: table.name,
        datasetId: table.model_id,
        parentNodeId: `sm:${table.model_id}`,
        objectSubtype: table.ishidden ? "hidden" : undefined,
      });
    }

    for (const col of uniqueColumns.values()) {
      result.push({
        nodeId: `col:${col.model_id}|${col.table}|${col.name}`,
        displayName: col.name,
        entityType: "column",
        tableName: col.table,
        datasetId: col.model_id,
        dataType: col.datatype || undefined,
        expression: col.expression || undefined,
        objectName: col.name,
        objectSubtype: col.ishidden ? "hidden" : undefined,
        parentNodeId: `table:${col.model_id}|${col.table}`,
      });
    }

    for (const measure of uniqueMeasures.values()) {
      result.push({
        nodeId: `measure:${measure.model_id}|${measure.table}|${measure.name}`,
        displayName: measure.name,
        entityType: "measure",
        tableName: measure.table,
        datasetId: measure.model_id,
        expression: measure.expression || undefined,
        formatString: measure.formatstring || undefined,
        objectName: measure.name,
        parentNodeId: `table:${measure.model_id}|${measure.table}`,
      });
    }

    return result;
  }, [activeSnapshot]);

  const edges: LineageViewerEdge[] = useMemo(() => {
    const dimensions = activeSnapshot?.dimensions ?? {};
    const smRelationships = Array.isArray(dimensions?.smRelationships) ? dimensions.smRelationships : [];
    const smDependencies = Array.isArray(dimensions?.smDependencies) ? dimensions.smDependencies : [];
    const smColumns = Array.isArray(dimensions?.smColumns) ? dimensions.smColumns : [];
    const smMeasures = Array.isArray(dimensions?.smMeasures) ? dimensions.smMeasures : [];

    // Deduplicate relationships and dependencies
    const uniqueRelationships = new Map<string, any>();
    const uniqueDependencies = new Map<string, any>();

    for (const rel of smRelationships) {
      if (rel.model_id && rel.fromtable && rel.totable) {
        const relName = rel.name || `${rel.fromtable}_${rel.totable}`;
        const key = `${rel.model_id}|${relName}`;
        uniqueRelationships.set(key, rel);
      }
    }

    for (const dep of smDependencies) {
      if (dep.model_id && dep.objectname && dep.referencedobjectname) {
        const depFrom = dep.fullobjectname || dep.objectname;
        const depTo = dep.referencedfullobjectname || dep.referencedobjectname;
        const key = `${dep.model_id}|${depFrom}|${depTo}|${dep.objecttype}|${dep.referencedobjecttype}`;
        uniqueDependencies.set(key, dep);
      }
    }

    console.log("[LineageView] Building edges from dimensions:", {
      relationshipsCount: smRelationships.length,
      dependenciesCount: smDependencies.length,
      uniqueRelationships: uniqueRelationships.size,
      uniqueDependencies: uniqueDependencies.size,
    });

    const result: LineageViewerEdge[] = [];

    for (const rel of uniqueRelationships.values()) {
      const relName = rel.name || `${rel.fromtable}_${rel.totable}`;
      result.push({
        edgeId: `rel:${rel.model_id}|${relName}`,
        fromNodeId: `table:${rel.model_id}|${rel.fromtable}`,
        toNodeId: `table:${rel.model_id}|${rel.totable}`,
        edgeType: "relationship",
        datasetId: rel.model_id,
      });
    }

    let skippedDeps = 0;
    let createdDeps = 0;
    for (const dep of uniqueDependencies.values()) {
      const objectType = String(dep.objecttype || "").toLowerCase();
      const refType = String(dep.referencedobjecttype || "").toLowerCase();

      const fromNodeId =
        objectType === "measure" ? `measure:${dep.model_id}|${dep.tablename}|${dep.objectname}`
        : objectType === "column" ? `col:${dep.model_id}|${dep.tablename}|${dep.objectname}`
        : objectType === "table" ? `table:${dep.model_id}|${dep.objectname}`
        : null;

      const toNodeId =
        refType === "measure" ? `measure:${dep.model_id}|${dep.referencedtablename}|${dep.referencedobjectname}`
        : refType === "column" ? `col:${dep.model_id}|${dep.referencedtablename}|${dep.referencedobjectname}`
        : refType === "table" ? `table:${dep.model_id}|${dep.referencedobjectname}`
        : null;

      if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) {
        skippedDeps++;
        if (skippedDeps <= 3) {
          console.log("[LineageView] Skipped dependency:", {
            objectType,
            refType,
            fromNodeId,
            toNodeId,
            dep,
          });
        }
        continue;
      }

      createdDeps++;
      if (createdDeps <= 3) {
        console.log("[LineageView] Created dependency edge:", {
          fromNodeId,
          toNodeId,
          objectType,
          refType,
        });
      }
      result.push({
        edgeId: `dep:${fromNodeId}→${toNodeId}`,
        fromNodeId,
        toNodeId,
        edgeType: "dependency",
        datasetId: dep.model_id,
      });
    }

    console.log("[LineageView] Dependency edge summary:", {
      uniqueDependencies: uniqueDependencies.size,
      createdDeps,
      skippedDeps,
      totalEdges: result.length,
    });

    // Add structural "contains" edges: table → column and table → measure
    let containsEdges = 0;
    const uniqueColumns = new Map<string, any>();
    const uniqueMeasures = new Map<string, any>();
    
    for (const col of smColumns) {
      if (col.model_id && col.table && col.name) {
        const key = `${col.model_id}|${col.table}|${col.name}`;
        uniqueColumns.set(key, col);
      }
    }
    
    for (const measure of smMeasures) {
      if (measure.model_id && measure.table && measure.name) {
        const key = `${measure.model_id}|${measure.table}|${measure.name}`;
        uniqueMeasures.set(key, measure);
      }
    }
    
    for (const col of uniqueColumns.values()) {
      const tableNodeId = `table:${col.model_id}|${col.table}`;
      const colNodeId = `col:${col.model_id}|${col.table}|${col.name}`;
      result.push({
        edgeId: `contains:${tableNodeId}→${colNodeId}`,
        fromNodeId: tableNodeId,
        toNodeId: colNodeId,
        edgeType: "contains",
        datasetId: col.model_id,
      });
      containsEdges++;
    }
    
    for (const measure of uniqueMeasures.values()) {
      const tableNodeId = `table:${measure.model_id}|${measure.table}`;
      const measureNodeId = `measure:${measure.model_id}|${measure.table}|${measure.name}`;
      result.push({
        edgeId: `contains:${tableNodeId}→${measureNodeId}`,
        fromNodeId: tableNodeId,
        toNodeId: measureNodeId,
        edgeType: "contains",
        datasetId: measure.model_id,
      });
      containsEdges++;
    }
    
    console.log("[LineageView] Added containment edges:", {
      containsEdges,
      totalEdgesWithContains: result.length,
    });

    return result;
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
      let limitedNodes = [...filtered]
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .slice(0, graphNodeLimit);
      
      // IMPORTANT: Always include parent semantic model containers when their children are visible
      const limitedNodeIds = new Set(limitedNodes.map((n) => n.nodeId));
      const parentIds = new Set<string>();
      for (const node of limitedNodes) {
        if (node.parentNodeId && !limitedNodeIds.has(node.parentNodeId)) {
          parentIds.add(node.parentNodeId);
        }
      }
      
      // Add parent nodes from full nodes list
      for (const parentId of parentIds) {
        const parentNode = nodes.find(n => n.nodeId === parentId);
        if (parentNode) {
          limitedNodes.push(parentNode);
          limitedNodeIds.add(parentId);
        }
      }
      
      // For full mode, use filtered edges (both endpoints must be in filtered set)
      const limitedEdges = filteredEdges.filter((e) => limitedNodeIds.has(e.fromNodeId) && limitedNodeIds.has(e.toNodeId));

      return {
        graphNodes: limitedNodes,
        graphEdges: limitedEdges,
        hiddenNodeCount: Math.max(0, filtered.length - limitedNodes.length),
        hiddenEdgeCount: Math.max(0, filteredEdges.length - limitedEdges.length),
        requiresSelection: false,
      };
    }

    // Focused mode: show selected node + all connected nodes (regardless of filter)
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

    // Build adjacency map from ALL edges (not just filtered ones)
    const adjacency = new Map<string, string[]>();
    for (const edge of edges) {
      if (!adjacency.has(edge.fromNodeId)) adjacency.set(edge.fromNodeId, []);
      if (!adjacency.has(edge.toNodeId)) adjacency.set(edge.toNodeId, []);
      adjacency.get(edge.fromNodeId)!.push(edge.toNodeId);
      adjacency.get(edge.toNodeId)!.push(edge.fromNodeId);
    }

    // BFS traversal through ALL nodes (not just filtered ones)
    // In filter mode, limit to 2 hops (direct neighbors + their neighbors)
    const maxDepth = graphDisplayMode === "filter" ? 2 : Infinity;
    const visited = new Set<string>([selectedNodeId]);
    const depthMap = new Map<string, number>([[selectedNodeId, 0]]);
    const queue: string[] = [selectedNodeId];
    
    while (queue.length > 0 && visited.size < graphNodeLimit) {
      const current = queue.shift()!;
      const currentDepth = depthMap.get(current) || 0;
      
      // Skip if we've reached max depth
      if (currentDepth >= maxDepth) continue;
      
      const neighbors = adjacency.get(current) ?? [];
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        depthMap.set(neighbor, currentDepth + 1);
        queue.push(neighbor);
        if (visited.size >= graphNodeLimit) break;
      }
    }
    
    console.log("[LineageView] Filter mode BFS:", {
      mode: graphDisplayMode,
      maxDepth,
      visitedCount: visited.size,
      selectedNode: selectedNodeId,
    });

    // In filter mode, only show visited nodes. In highlight mode, show all filtered nodes
    let limitedNodes = graphDisplayMode === "filter" 
      ? nodes.filter((n) => visited.has(n.nodeId))  // Filter: only visited nodes
      : filtered;  // Highlight: show all filtered nodes but highlight visited ones
    
    // IMPORTANT: Always include parent semantic model containers when their children are visible
    const limitedNodeIds = new Set(limitedNodes.map(n => n.nodeId));
    const parentIds = new Set<string>();
    for (const node of limitedNodes) {
      if (node.parentNodeId && !limitedNodeIds.has(node.parentNodeId)) {
        parentIds.add(node.parentNodeId);
      }
    }
    
    // Add parent nodes from full nodes list
    for (const parentId of parentIds) {
      const parentNode = nodes.find(n => n.nodeId === parentId);
      if (parentNode) {
        limitedNodes.push(parentNode);
      }
    }
    
    // In filter mode, only include edges between visited nodes. In highlight mode, use filtered edges
    const limitedEdges = graphDisplayMode === "filter"
      ? edges.filter((e) => visited.has(e.fromNodeId) && visited.has(e.toNodeId))
      : filteredEdges;
    
    return {
      graphNodes: limitedNodes,
      graphEdges: limitedEdges,
      hiddenNodeCount: Math.max(0, nodes.length - limitedNodes.length),
      hiddenEdgeCount: Math.max(0, edges.length - limitedEdges.length),
      requiresSelection: false,
    };
  }, [filtered, filteredEdges, nodes, edges, graphNodeLimit, graphScope, selectedNodeId, graphDisplayMode]);

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
      // Use ALL edges for BFS traversal, not just filtered edges
      for (const e of edges) {
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
  }, [selectedNodeId, edges]);

  // ── Empty state configuration ─────────────────────────────────────────────
  const emptyStateConfig = useMemo(() => {
    if (dataSourceMode === "actual" && !targetLakehouseId) {
      return {
        title: t("LineageWorkbench_Lineage_Empty_Title_NoLakehouse", "Lakehouse Not Configured"),
        message: t(
          "LineageWorkbench_Lineage_Empty_Actual_MissingLakehouse",
          "Actual data mode requires a saved OneLake Lakehouse ID. Open Extract, enter the lakehouse item ID, and save the workbench before loading real lineage data."
        ),
        icon: "info" as const,
      };
    }
    if (dataSourceMode === "actual" && targetLakehouseId && !isLoadingGraph) {
      return {
        title: t("LineageWorkbench_Lineage_Empty_Title_NoData", "No Data Found"),
        message: t(
          "LineageWorkbench_Lineage_Empty_Actual",
          "No semantic models found in the target lakehouse. Go to the Extract tab and click 'Run Extraction' to populate lineage data from your workspace."
        ),
        hint: t(
          "LineageWorkbench_Lineage_Empty_Hint",
          "The extraction process will scan your workspace for Power BI semantic models, reports, and other artifacts, then store the lineage metadata in Delta tables."
        ),
        icon: "empty" as const,
      };
    }
    return {
      title: t("LineageWorkbench_Lineage_Empty_Title_Generic", "No Graph Data"),
      message: t("LineageWorkbench_Lineage_Empty", "No graph nodes available. Run extraction first."),
      icon: "empty" as const,
    };
  }, [dataSourceMode, targetLakehouseId, isLoadingGraph, t]);

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

              <Text size={200} style={{ color: tokens.colorNeutralForeground2, marginTop: tokens.spacingVerticalXS }}>
                {t("LineageWorkbench_GraphDisplayMode", "Display mode")}
              </Text>
              <RadioGroup
                layout="vertical"
                value={graphDisplayMode}
                onChange={(_, data) => {
                  setGraphDisplayMode(data.value === "filter" ? "filter" : "highlight");
                }}
              >
                <Radio
                  value="highlight"
                  label={t("LineageWorkbench_GraphDisplayMode_Highlight", "Highlight connected")}
                />
                <Radio
                  value="filter"
                  label={t("LineageWorkbench_GraphDisplayMode_Filter", "Filter to connected only")}
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
        {loadError && (
          <MessageBar intent="error">
            <MessageBarBody>
              {loadError}
            </MessageBarBody>
          </MessageBar>
        )}
        
        {nodes.length === 0 && (isLoadingGraph || shouldLoadData) ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              padding: "40px",
              textAlign: "center",
              gap: tokens.spacingVerticalL,
            }}
          >
            <Spinner size="extra-large" />
            <div style={{ display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS, maxWidth: 520 }}>
              <Text size={500} weight="semibold" style={{ color: tokens.colorNeutralForeground1 }}>
                {t("LineageWorkbench_Loading_Title", "Loading Lineage Graph")}
              </Text>
              <Text style={{ color: tokens.colorNeutralForeground3 }}>
                {t("LineageWorkbench_Loading_Message", "Fetching semantic models, tables, columns, measures, and relationships from the lakehouse...")}
              </Text>
            </div>
          </div>
        ) : nodes.length === 0 && !isLoadingGraph && !shouldLoadData ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              padding: "40px",
              textAlign: "center",
              gap: tokens.spacingVerticalL,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS, maxWidth: 520 }}>
              <Text size={500} weight="semibold" style={{ color: tokens.colorNeutralForeground1 }}>
                {emptyStateConfig.title}
              </Text>
              <Text style={{ color: tokens.colorNeutralForeground3 }}>
                {emptyStateConfig.message}
              </Text>
              {emptyStateConfig.hint && (
                <Text size={200} style={{ color: tokens.colorNeutralForeground4, fontStyle: "italic" }}>
                  {emptyStateConfig.hint}
                </Text>
              )}
            </div>
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
                  customHeight={tableExpanded && !tableFills ? tableHeight : undefined}
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
                
                {tableExpanded && graphExpanded && !tableFills && (
                  <ResizeHandle onMouseDown={handleResizeStart("table")} />
                )}

                {/* Graph panel */}
                <CollapsiblePanel
                  title={t("LineageWorkbench_Panel_Graph", "Graph")}
                  icon={<DataTrendingRegular fontSize={16} />}
                  meta={`${graphNodes.length}/${filtered.length} nodes · ${graphEdges.length}/${filteredEdges.length} edges`}
                  expanded={graphExpanded}
                  onToggle={() => setGraphExpanded((v) => !v)}
                  fillHeight={graphFills}
                  customHeight={graphExpanded && !graphFills ? graphHeight : undefined}
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
                      isLoading={isLoadingGraph}
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
                
                {graphExpanded && detailExpanded && !graphFills && (
                  <ResizeHandle onMouseDown={handleResizeStart("graph")} />
                )}
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
                  <div className={styles.splitTablePane}>
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

                  <div className={styles.splitGraphPane}>
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
                        isLoading={isLoadingGraph}
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
              customHeight={detailExpanded && !detailFills ? detailHeight : undefined}
            >
              <LineageDetailView
                nodes={nodes}
                edges={edges}
                dimensions={activeSnapshot?.dimensions}
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
