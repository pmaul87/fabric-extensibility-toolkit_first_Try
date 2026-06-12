import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Button,
  Text,
  makeStyles,
  tokens,
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Switch,
} from "@fluentui/react-components";
import { 
  ArrowRight16Regular, 
  Add16Regular, 
  ChevronRight16Regular, 
  ChevronDown16Regular 
} from "@fluentui/react-icons";
import { LineageViewerEdge, LineageViewerNode } from "./LineageGraphView";
import type { Requirement } from "../RequirementBoardItem";
import { RequirementDialog } from "../RequirementBoardItem";

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  root: {
    padding: tokens.spacingVerticalM,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    overflowY: "auto",
    height: "100%",
    fontFamily: tokens.fontFamilyBase,
  },
  empty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase300,
    textAlign: "center",
  },

  // ── Cards (Section Containers) ──────────────────────────────────────────────
  card: {
    background: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalM,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  cardTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    marginBottom: tokens.spacingVerticalXXS,
  },

  // ── Inline Badge List ────────────────────────────────────────────────────────
  badgeList: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalXS,
    alignItems: "center",
  },
  badgeSeparator: {
    color: tokens.colorNeutralForeground4,
    fontSize: tokens.fontSizeBase200,
  },

  // ── Accordion Panels ─────────────────────────────────────────────────────────
  accordionPanel: {
    background: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  accordionContent: {
    minHeight: "200px",
    maxHeight: "500px",
    overflowY: "auto",
    overflowX: "hidden",
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },

  // ── Connection List ──────────────────────────────────────────────────────────
  connectionGroup: {
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusSmall,
    overflow: "hidden",
  },
  connectionGroupLabel: {
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    background: tokens.colorNeutralBackground2,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  connectionItem: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    flexShrink: 0,
    gap: tokens.spacingHorizontalS,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke3}`,
    cursor: "pointer",
    userSelect: "none",
    background: "transparent",
    border: "none",
    width: "100%",
    textAlign: "left",
    transition: "background-color 0.1s ease",
    ":hover": {
      background: tokens.colorNeutralBackground2Hover,
    },
    ":active": {
      background: tokens.colorNeutralBackground2Pressed,
    },
  },
  connectionItemSelected: {
    background: tokens.colorBrandBackground2,
  },
  connectionItemName: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightMedium,
    color: tokens.colorNeutralForeground1,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  connectionItemSubLabel: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    marginTop: tokens.spacingVerticalXXS,
  },

  // ── Expression Code Block ────────────────────────────────────────────────────
  expressionBlock: {
    background: tokens.colorNeutralBackground3,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusSmall,
    padding: tokens.spacingVerticalM,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: "300px",
    overflowY: "auto",
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEntityTypeLabel(entityType: string): string {
  const labels: Record<string, string> = {
    report: "Reports",
    page: "Pages",
    visual: "Visuals",
    semantic_model: "Semantic Models",
    measure: "Measures",
    column: "Columns",
    table: "Tables",
    dataflow: "Dataflows",
    notebook: "Notebooks",
    lakehouse: "Lakehouses",
    warehouse: "Warehouses",
    semantic_object: "Semantic Objects",
    unknown: "Unknown",
  };
  return labels[entityType] ?? entityType;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface LineageDetailViewProps {
  selectedNodeId?: string;
  nodes: LineageViewerNode[];
  edges: LineageViewerEdge[];
  dimensions?: any;
  requirementsCount?: number;
  onOpenRequirementsBoard?: () => void;
  onCreateRequirement?: (requirement: Requirement) => void;
  onNodeSelect?: (nodeId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LineageDetailView({
  selectedNodeId,
  nodes,
  edges,
  dimensions,
  requirementsCount,
  onOpenRequirementsBoard,
  onCreateRequirement,
  onNodeSelect,
}: LineageDetailViewProps) {
  const { t } = useTranslation();
  const styles = useStyles();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [showAllConnections, setShowAllConnections] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const toggleNodeExpansion = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const nodeById = useMemo(() => {
    const m = new Map<string, LineageViewerNode>();
    for (const n of nodes) m.set(n.nodeId, n);
    return m;
  }, [nodes]);

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : undefined;

  const inferredExpression = useMemo(() => {
    if (!selectedNodeId) {
      return undefined;
    }

    const evidence = edges.find((edge) => {
      if (edge.toNodeId !== selectedNodeId) {
        return false;
      }
      if (!edge.edgeType.includes("depends_on")) {
        return false;
      }
      return !!edge.evidence?.trim();
    })?.evidence;

    return evidence?.trim() || undefined;
  }, [selectedNodeId, edges]);

  const typeSpecificFields = useMemo(() => {
    if (!selectedNode) return [] as Array<{ label: string; value?: string; isLink?: boolean }>;

    const common = [
      { label: t("LineageDetail_ObjectSubtype", "Subtype"), value: selectedNode.objectSubtype },
    ];

    switch (selectedNode.entityType) {
      case "measure": {
        // Match measure_pk directly with node_id (no transformation needed)
        const measureDetails = dimensions?.measures?.find((m: any) => 
          m.measure_pk === selectedNode.nodeId || 
          m.uid === selectedNode.nodeId || 
          (m.measure_name === selectedNode.displayName && m.table === selectedNode.tableName)
        );
        const modelDetails = dimensions?.semanticModels?.find((m: any) => 
          m.dataset_id === selectedNode.datasetId || 
          m.uid === selectedNode.datasetId || 
          m.model_pk === selectedNode.datasetId
        );
        
        // Try multiple field name variations for expression and format
        const expression = selectedNode.expression ?? inferredExpression ?? 
          measureDetails?.expression ?? measureDetails?.Expression ?? 
          measureDetails?.measure_expression ?? measureDetails?.measureExpression;
        const format = selectedNode.formatString ?? 
          measureDetails?.formatstring ?? measureDetails?.formatString ?? 
          measureDetails?.format_string ?? measureDetails?.format;
        
        console.log("[LineageDetail] Measure metadata lookup:", {
          nodeId: selectedNode.nodeId,
          searchingFor: { measure_pk: selectedNode.nodeId, uid: selectedNode.nodeId, measure_name: selectedNode.displayName, table: selectedNode.tableName },
          totalMeasuresInDimensions: dimensions?.measures?.length || 0,
          sampleMeasure: dimensions?.measures?.[0],
          foundMeasureDetails: !!measureDetails,
          measureFields: measureDetails ? Object.keys(measureDetails) : [],
          measureDetailsRaw: measureDetails,
          foundModelDetails: !!modelDetails,
          workspace_name: modelDetails?.workspace_name,
          description: measureDetails?.description,
          expression,
          format,
        });
        
        // Check KPI status
        const isKPI = !!(measureDetails?.kpistatus || measureDetails?.kpi_status || measureDetails?.isKPI);
        
        return [
          { label: t("LineageDetail_Table", "Table"), value: selectedNode.tableName },
          { label: t("LineageDetail_Model", "Model"), value: modelDetails?.model_name || modelDetails?.displayName || selectedNode.datasetId },
          { label: t("LineageDetail_Workspace", "Workspace"), value: modelDetails?.workspace_name },
          { label: t("LineageDetail_ObjectName", "Object"), value: selectedNode.objectName || measureDetails?.name },
          { label: t("LineageDetail_DataType", "Data type"), value: selectedNode.dataType || measureDetails?.datatype },
          { label: t("LineageDetail_Format", "Format"), value: format },
          { label: t("LineageDetail_Expression", "Expression"), value: expression },
          { label: t("LineageDetail_DisplayFolder", "Display folder"), value: measureDetails?.displayfolder || measureDetails?.display_folder },
          { label: t("LineageDetail_IsKPI", "Is KPI"), value: isKPI ? "Yes" : undefined },
          { label: t("LineageDetail_Hidden", "Hidden"), value: measureDetails?.ishidden ? "Yes" : "No" },
          { label: t("LineageDetail_Description", "Description"), value: measureDetails?.description },
          ...common,
        ];
      }
      case "column": {
        // Match column_pk directly with node_id (no transformation needed)
        const columnDetails = dimensions?.columns?.find((c: any) => 
          c.column_pk === selectedNode.nodeId || 
          c.uid === selectedNode.nodeId || 
          (c.column_name === selectedNode.displayName && c.table === selectedNode.tableName)
        );
        const modelDetails = dimensions?.semanticModels?.find((m: any) => 
          m.dataset_id === selectedNode.datasetId || 
          m.uid === selectedNode.datasetId || 
          m.model_pk === selectedNode.datasetId
        );
        
        // Try multiple field name variations for expression and format
        const expression = selectedNode.expression ?? inferredExpression ?? 
          columnDetails?.expression ?? columnDetails?.Expression ?? 
          columnDetails?.column_expression ?? columnDetails?.columnExpression;
        const format = selectedNode.formatString ?? 
          columnDetails?.formatstring ?? columnDetails?.formatString ?? 
          columnDetails?.format_string ?? columnDetails?.format;
        
        console.log("[LineageDetail] Column metadata lookup:", {
          nodeId: selectedNode.nodeId,
          selectedNodeFields: Object.keys(selectedNode),
          selectedNodeFull: selectedNode,
          searchingFor: { 
            column_pk: selectedNode.nodeId, 
            uid: selectedNode.nodeId, 
            column_name: selectedNode.displayName, 
            table: selectedNode.tableName 
          },
          totalColumnsInDimensions: dimensions?.columns?.length || 0,
          sampleColumn: dimensions?.columns?.[0],
          sampleColumnFields: dimensions?.columns?.[0] ? Object.keys(dimensions.columns[0]) : [],
          foundColumnDetails: !!columnDetails,
          columnFields: columnDetails ? Object.keys(columnDetails) : [],
          columnDetailsRaw: columnDetails,
          expression,
          format,
        });
        
        // Check if calculated column
        const isCalculated = !!(expression || columnDetails?.type === "Calculated" || columnDetails?.column_type === "Calculated");
        
        return [
          { label: t("LineageDetail_Table", "Table"), value: selectedNode.tableName },
          { label: t("LineageDetail_Model", "Model"), value: modelDetails?.model_name || modelDetails?.displayName || selectedNode.datasetId },
          { label: t("LineageDetail_Workspace", "Workspace"), value: modelDetails?.workspace_name },
          { label: t("LineageDetail_ObjectName", "Object"), value: selectedNode.objectName || columnDetails?.name },
          { label: t("LineageDetail_ColumnType", "Column type"), value: isCalculated ? "Calculated" : "Data" },
          { label: t("LineageDetail_DataType", "Data type"), value: selectedNode.dataType || columnDetails?.datatype },
          { label: t("LineageDetail_Format", "Format"), value: format },
          { label: t("LineageDetail_DataCategory", "Data category"), value: columnDetails?.datacategory || columnDetails?.data_category },
          { label: t("LineageDetail_Expression", "Expression"), value: expression },
          { label: t("LineageDetail_SourceColumn", "Source column"), value: columnDetails?.sourcecolumn || columnDetails?.source_column },
          { label: t("LineageDetail_Aggregation", "Aggregation"), value: columnDetails?.summarizebydefault !== false ? (columnDetails?.aggregation || columnDetails?.defaultaggregation || "Sum") : "None" },
          { label: t("LineageDetail_SortOrder", "Sort by column"), value: columnDetails?.sortbycolumn || columnDetails?.sortbycolumnid },
          { label: t("LineageDetail_DisplayFolder", "Display folder"), value: columnDetails?.displayfolder || columnDetails?.display_folder },
          { label: t("LineageDetail_Hidden", "Hidden"), value: columnDetails?.ishidden ? "Yes" : "No" },
          { label: t("LineageDetail_Description", "Description"), value: columnDetails?.description },
          ...common,
        ];
      }
      case "visual": {
        // Lookup visual details from dimensions using multiple matching strategies
        // Strategy 1: Match by primary key field
        let visualDetails = dimensions?.visuals?.find((v: any) => 
          v.visual_pk === selectedNode.nodeId
        );
        
        // Strategy 2: Match by uid/LineageTag (same as node enrichment)
        if (!visualDetails) {
          visualDetails = dimensions?.visuals?.find((v: any) => {
            const uid = v.LineageTag || v.lineageTag || v.lineage_tag || v.uid || v.data_uid || v.visual_uid;
            return uid === selectedNode.nodeId;
          });
        }
        
        // Strategy 3: Match by composite key (visual_name + report_id + page_name)
        if (!visualDetails && selectedNode.visualId) {
          visualDetails = dimensions?.visuals?.find((v: any) => {
            const visualName = v.visual_name || v.visualName || v.name;
            const reportId = v.report_id || v.reportId;
            const pageName = v.page_name || v.pageName;
            return visualName === selectedNode.visualId && 
                   reportId === selectedNode.reportId &&
                   (!selectedNode.pageId || pageName === selectedNode.pageId);
          });
        }
        
        // Debug logging for visual lookup
        console.log("[LineageDetailView] Visual lookup:", {
          nodeId: selectedNode.nodeId,
          visualId: selectedNode.visualId,
          reportId: selectedNode.reportId,
          pageId: selectedNode.pageId,
          availableVisuals: dimensions?.visuals?.length || 0,
          sampleVisual: dimensions?.visuals?.[0],
          sampleVisualFields: dimensions?.visuals?.[0] ? Object.keys(dimensions.visuals[0]) : [],
          matchedVisual: visualDetails,
          visualDetailKeys: visualDetails ? Object.keys(visualDetails) : "No match",
        });
        
        const pageDetails = dimensions?.pages?.find((p: any) => {
          const pageName = p.page_name || p.pageName || p.name;
          const reportId = p.report_id || p.reportId;
          return pageName === selectedNode.pageId && reportId === selectedNode.reportId;
        });
        
        const reportDetails = dimensions?.reports?.find((r: any) => 
          r.report_pk === selectedNode.reportId ||
          r.report_id === selectedNode.reportId || 
          r.uid === selectedNode.reportId ||
          r.LineageTag === selectedNode.reportId
        );
        
        return [
          { label: t("LineageDetail_VisualType", "Visual type"), value: visualDetails?.display_type || visualDetails?.type || visualDetails?.visual_type || selectedNode.visualType },
          { label: t("LineageDetail_Page", "Page"), value: visualDetails?.Page_display_name || visualDetails?.page_display_name || pageDetails?.page_display_name || pageDetails?.Page_display_name || pageDetails?.displayName || selectedNode.pageId },
          { label: t("LineageDetail_Report", "Report"), value: reportDetails?.report_name || reportDetails?.displayName || selectedNode.reportId },
          { label: t("LineageDetail_Workspace", "Workspace"), value: reportDetails?.workspace_name },
          { label: t("LineageDetail_VisualTitle", "Visual title"), value: visualDetails?.title || visualDetails?.visual_title || visualDetails?.display_name },
          { label: t("LineageDetail_VisualName", "Visual name"), value: visualDetails?.visual_name || visualDetails?.name || selectedNode.visualId },
          { label: t("LineageDetail_Hidden", "Hidden"), value: visualDetails?.hidden !== undefined ? (visualDetails.hidden ? "Yes" : "No") : "N/A" },
          { label: t("LineageDetail_URL", "URL"), value: visualDetails?.url || visualDetails?.URL || visualDetails?.link, isLink: true },
          { label: t("LineageDetail_ReportId", "Report ID"), value: selectedNode.reportId },
          ...common,
        ];
      }
      case "report": {
        // Match report using multiple strategies
        let reportDetails = dimensions?.reports?.find((r: any) => 
          r.report_pk === selectedNode.nodeId
        );
        
        if (!reportDetails) {
          reportDetails = dimensions?.reports?.find((r: any) => {
            const uid = r.LineageTag || r.lineageTag || r.lineage_tag || r.uid || r.data_uid || r.report_uid;
            return uid === selectedNode.nodeId;
          });
        }
        
        if (!reportDetails && selectedNode.reportId) {
          reportDetails = dimensions?.reports?.find((r: any) => 
            r.report_id === selectedNode.reportId || r.reportId === selectedNode.reportId
          );
        }
        const modelDetails = dimensions?.semanticModels?.find((m: any) => 
          m.dataset_id === selectedNode.datasetId || m.uid === selectedNode.datasetId
        );
        return [
          { label: t("LineageDetail_ReportId", "Report ID"), value: selectedNode.reportId || reportDetails?.report_id },
          { label: t("LineageDetail_Workspace", "Workspace"), value: reportDetails?.workspace_name },
          { label: t("LineageDetail_Dataset", "Dataset"), value: modelDetails?.model_name || modelDetails?.displayName || selectedNode.datasetId },
          { label: t("LineageDetail_Pages", "Pages"), value: reportDetails?.page_count?.toString() },
          { label: t("LineageDetail_Visuals", "Total visuals"), value: reportDetails?.visual_count?.toString() },
          { label: t("LineageDetail_Description", "Description"), value: reportDetails?.description },
          ...common,
        ];
      }
      case "page": {
        // Match page using multiple strategies
        let pageDetails = dimensions?.pages?.find((p: any) => 
          p.page_pk === selectedNode.nodeId
        );
        
        if (!pageDetails) {
          pageDetails = dimensions?.pages?.find((p: any) => {
            const uid = p.LineageTag || p.lineageTag || p.lineage_tag || p.uid || p.data_uid || p.page_uid;
            return uid === selectedNode.nodeId;
          });
        }
        
        if (!pageDetails && selectedNode.pageId) {
          pageDetails = dimensions?.pages?.find((p: any) => {
            const pageName = p.page_name || p.pageName || p.name;
            const reportId = p.report_id || p.reportId;
            return pageName === selectedNode.pageId && reportId === selectedNode.reportId;
          });
        }
        const reportDetails = dimensions?.reports?.find((r: any) => 
          r.report_id === selectedNode.reportId || 
          r.uid === selectedNode.reportId || 
          r.report_pk === selectedNode.reportId
        );
        return [
          { label: t("LineageDetail_PageNumber", "Page number"), value: selectedNode.pageNumber?.toString() || pageDetails?.page_number?.toString() },
          { label: t("LineageDetail_Report", "Report"), value: reportDetails?.report_name || reportDetails?.displayName || selectedNode.reportId },
          { label: t("LineageDetail_Workspace", "Workspace"), value: reportDetails?.workspace_name },
          { label: t("LineageDetail_Visuals", "Visuals on page"), value: pageDetails?.visual_count?.toString() },
          { label: t("LineageDetail_ReportId", "Report ID"), value: selectedNode.reportId },
          ...common,
        ];
      }
      case "table": {
        // Match table_pk directly with node_id (no transformation needed)
        const tableDetails = dimensions?.tables?.find((t: any) => 
          t.table_pk === selectedNode.nodeId || 
          t.uid === selectedNode.nodeId || 
          (t.table_name === selectedNode.tableName && t.dataset_id === selectedNode.datasetId)
        );
        const modelDetails = dimensions?.semanticModels?.find((m: any) => 
          m.dataset_id === selectedNode.datasetId || 
          m.uid === selectedNode.datasetId || 
          m.model_pk === selectedNode.datasetId
        );
        
        console.log("[LineageDetail] Table metadata lookup:", {
          nodeId: selectedNode.nodeId,
          foundTableDetails: !!tableDetails,
          tableFields: tableDetails ? Object.keys(tableDetails) : [],
          tableDetailsRaw: tableDetails,
        });
        
        // Storage mode
        const storageMode = tableDetails?.mode || tableDetails?.storage_mode || tableDetails?.storagemode;
        
        // Check if calculated table
        const isCalculated = !!(tableDetails?.type === "Calculated" || tableDetails?.table_type === "Calculated" || tableDetails?.expression);
        
        return [
          { label: t("LineageDetail_Table", "Table"), value: selectedNode.tableName ?? selectedNode.displayName },
          { label: t("LineageDetail_Model", "Model"), value: modelDetails?.model_name || modelDetails?.displayName || selectedNode.datasetId },
          { label: t("LineageDetail_Workspace", "Workspace"), value: modelDetails?.workspace_name },
          { label: t("LineageDetail_TableType", "Table type"), value: isCalculated ? "Calculated" : "Data" },
          { label: t("LineageDetail_Source", "Source"), value: tableDetails?.sourcetype || tableDetails?.source_type },
          { label: t("LineageDetail_StorageMode", "Storage mode"), value: storageMode },
          { label: t("LineageDetail_Columns", "Column count"), value: tableDetails?.column_count?.toString() },
          { label: t("LineageDetail_Measures", "Measure count"), value: tableDetails?.measure_count?.toString() },
          { label: t("LineageDetail_RowCount", "Row count"), value: tableDetails?.row_count?.toLocaleString() || tableDetails?.rowcount?.toLocaleString() },
          { label: t("LineageDetail_Partitions", "Partitions"), value: tableDetails?.partition_count?.toString() || tableDetails?.partitioncount?.toString() },
          { label: t("LineageDetail_RefreshPolicy", "Refresh policy"), value: tableDetails?.refreshpolicy || tableDetails?.refresh_policy },
          { label: t("LineageDetail_DisplayFolder", "Display folder"), value: tableDetails?.displayfolder || tableDetails?.display_folder },
          { label: t("LineageDetail_Hidden", "Hidden"), value: tableDetails?.ishidden ? "Yes" : "No" },
          { label: t("LineageDetail_ObjectName", "Object"), value: selectedNode.objectName },
          { label: t("LineageDetail_Description", "Description"), value: tableDetails?.description },
          ...common,
        ];
      }
      default:
        return [
          { label: t("LineageDetail_ObjectName", "Object"), value: selectedNode.objectName },
          ...common,
          { label: t("LineageDetail_DataType", "Data type"), value: selectedNode.dataType },
        ];
    }
  }, [selectedNode, inferredExpression, t]);

  const selectedInfoCards = useMemo(() => {
    if (!selectedNode) return [] as Array<{ key: string; label: string; value: string; isCode?: boolean; isLink?: boolean }>;

    console.log("[LineageDetail] Building selectedInfoCards:", {
      entityType: selectedNode.entityType,
      nodeId: selectedNode.nodeId,
      typeSpecificFieldsCount: typeSpecificFields.length,
      typeSpecificFields: typeSpecificFields.map(f => ({ label: f.label, hasValue: !!f.value, value: f.value })),
      hasDimensions: !!dimensions,
      dimensionKeys: dimensions ? Object.keys(dimensions) : [],
    });

    return [
      {
        key: "type",
        label: t("LineageDetail_Type", "Type"),
        value: getEntityTypeLabel(selectedNode.entityType),
        isLink: false,
      },
      {
        key: "name",
        label: t("LineageDetail_Name", "Name"),
        value: selectedNode.displayName,
        isLink: false,
      },
      ...typeSpecificFields
        .filter((field) => !!field.value && field.label !== t("LineageDetail_Expression", "Expression")) // Exclude expression from inline display
        .map((field, index) => ({
          key: `meta-${index}-${field.label}`,
          label: field.label,
          value: field.value!,
          isLink: field.isLink || false,
        })),
    ];
  }, [selectedNode, typeSpecificFields, t]);

  const nodeEdges = useMemo(() => {
    if (!selectedNodeId) return { 
      incoming: [] as LineageViewerEdge[], 
      outgoing: [] as LineageViewerEdge[],
      incomingRelationships: [] as LineageViewerEdge[],
      outgoingRelationships: [] as LineageViewerEdge[],
      incomingDependencies: [] as LineageViewerEdge[],
      outgoingDependencies: [] as LineageViewerEdge[],
    };
    const incoming = edges.filter((e) => e.toNodeId === selectedNodeId);
    const outgoing = edges.filter((e) => e.fromNodeId === selectedNodeId);
    
    console.log("[LineageDetail] Node edges for", selectedNodeId, ":", {
      incomingCount: incoming.length,
      outgoingCount: outgoing.length,
      totalEdges: edges.length,
      sampleIncoming: incoming.slice(0, 3),
      sampleOutgoing: outgoing.slice(0, 3),
    });
    
    return {
      incoming,
      outgoing,
      incomingRelationships: incoming.filter((e) => e.edgeType === "relationship"),
      outgoingRelationships: outgoing.filter((e) => e.edgeType === "relationship"),
      incomingDependencies: incoming.filter((e) => e.edgeType === "dependency"),
      outgoingDependencies: outgoing.filter((e) => e.edgeType === "dependency"),
    };
  }, [selectedNodeId, edges]);

  // Get downstream dependencies for a specific node (for expansion)
  const getNodeDownstream = (startNodeId: string): LineageViewerNode[] => {
    const visited = new Set<string>();
    const queue = [startNodeId];
    const result: LineageViewerNode[] = [];
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      
      // Find all edges where this node is the source (downstream dependencies)
      const outgoing = edges.filter(e => 
        e.fromNodeId === currentId && 
        (e.edgeType === "dependency" || e.edgeType === "relationship")
      );
      
      for (const edge of outgoing) {
        if (!visited.has(edge.toNodeId)) {
          const targetNode = nodeById.get(edge.toNodeId);
          if (targetNode && targetNode.nodeId !== startNodeId) {
            result.push(targetNode);
            queue.push(edge.toNodeId);
          }
        }
      }
    }
    
    return result;
  };

  // Compute all transitive upstream/downstream connections using BFS
  const allTransitiveConnections = useMemo(() => {
    if (!selectedNode || !showAllConnections) return { upstream: [] as LineageViewerNode[], downstream: [] as LineageViewerNode[], degreeMap: new Map<string, number>() };

    const computeTransitive = (startNodeId: string, direction: "upstream" | "downstream"): { nodes: LineageViewerNode[], degreeMap: Map<string, number> } => {
      const visited = new Set<string>();
      const queue: { nodeId: string, degree: number }[] = [{ nodeId: startNodeId, degree: 0 }];
      const results: LineageViewerNode[] = [];
      const degreeMap = new Map<string, number>();

      while (queue.length > 0) {
        const { nodeId: currentNodeId, degree: currentDegree } = queue.shift()!;
        if (visited.has(currentNodeId)) continue;
        visited.add(currentNodeId);

        // Skip the starting node itself
        if (currentNodeId !== startNodeId) {
          const currentNode = nodeById.get(currentNodeId);
          if (currentNode) {
            results.push(currentNode);
            degreeMap.set(currentNodeId, currentDegree);
          }
        }

        // Find edges in the specified direction.
        // "Show all" should traverse the full lineage graph, not only dependency/relationship edges.
        const relevantEdges = edges.filter((e) =>
          direction === "upstream" ? e.toNodeId === currentNodeId : e.fromNodeId === currentNodeId,
        );

        // Add neighbors to queue with incremented degree
        for (const edge of relevantEdges) {
          const nextNodeId = direction === "upstream" ? edge.fromNodeId : edge.toNodeId;
          if (!visited.has(nextNodeId)) {
            queue.push({ nodeId: nextNodeId, degree: currentDegree + 1 });
          }
        }
      }

      return { nodes: results, degreeMap };
    };

    const upstreamResult = computeTransitive(selectedNode.nodeId, "upstream");
    const downstreamResult = computeTransitive(selectedNode.nodeId, "downstream");
    const combinedDegreeMap = new Map([...upstreamResult.degreeMap, ...downstreamResult.degreeMap]);

    return {
      upstream: upstreamResult.nodes,
      downstream: downstreamResult.nodes,
      degreeMap: combinedDegreeMap,
    };
  }, [selectedNode, showAllConnections, nodeById, edges]);

  // Classify related nodes by relationship category
  const relations = useMemo(() => {
    if (!selectedNode) return {};

    // Only include dependency and relationship edges, exclude structural "contains" edges
    const dependencyEdgesOnly = {
      incoming: nodeEdges.incoming.filter(e => e.edgeType === "dependency" || e.edgeType === "relationship"),
      outgoing: nodeEdges.outgoing.filter(e => e.edgeType === "dependency" || e.edgeType === "relationship"),
    };

    const neighborsOf = (edgeList: LineageViewerEdge[], side: "from" | "to") =>
      edgeList
        .map((e) => nodeById.get(side === "from" ? e.fromNodeId : e.toNodeId))
        .filter((n): n is LineageViewerNode => n !== undefined);

    // Use transitive connections if showAllConnections is true
    const incoming = showAllConnections ? allTransitiveConnections.upstream : neighborsOf(dependencyEdgesOnly.incoming, "from");
    const outgoing = showAllConnections ? allTransitiveConnections.downstream : neighborsOf(dependencyEdgesOnly.outgoing, "to");
    const all = [...incoming, ...outgoing];

    const byType = (type: string) => all.filter((n) => n.entityType === type);

    return {
      connectedColumns: { label: t("LineageDetail_Columns", "Connected columns"), nodes: byType("column") },
      connectedMeasures: { label: t("LineageDetail_Measures", "Connected measures"), nodes: byType("measure") },
      connectedVisuals: { label: t("LineageDetail_Visuals", "Connected visuals"), nodes: byType("visual") },
      connectedReports: { label: t("LineageDetail_Reports", "Connected reports"), nodes: byType("report") },
      directNeighbors: { label: showAllConnections ? t("LineageDetail_AllConnections", "All connections") : t("LineageDetail_Neighbors", "All direct neighbors"), nodes: all },
      usedBy: { label: showAllConnections ? t("LineageDetail_AllUsedBy", "All used by (transitive)") : t("LineageDetail_UsedBy", "Used by"), nodes: incoming },
      uses: { label: showAllConnections ? t("LineageDetail_AllUses", "All uses (transitive)") : t("LineageDetail_Uses", "Uses"), nodes: outgoing },
      filteredBy: { label: t("LineageDetail_FilteredBy", "Filtered by"), nodes: [] }, // Will be populated below
    };
  }, [selectedNode, nodeEdges, nodeById, t, showAllConnections, allTransitiveConnections]);

  // Calculate "Filtered by" relationships
  const filteredByRelations = useMemo(() => {
    if (!selectedNode || !dimensions?.relationships) {      return [];
    }

    const smRelationships = Array.isArray(dimensions.relationships) ? dimensions.relationships : [];
    const smTables = Array.isArray(dimensions.tables) ? dimensions.tables : [];
    const nodeModelId = selectedNode.datasetId;    if (!nodeModelId) {      return [];
    }

    // Debug: log sample table object to see structure
    if (smTables.length > 0) {      console.log("[LineageDetail filteredBy] smTables properties:", Object.keys(smTables[0]));
    }

    // Build lookup map: table ID -> table name
    const tableIdToName = new Map<string, string>();
    smTables.forEach((table: any, idx: number) => {
      if (table.dataset_id === nodeModelId) {
        // LineageTag is the field that contains the GUID
        const tableId = table.lineagetag || table.LineageTag;
        const name = table.name || table.tablename || table.table_name;
        
        if (idx < 2) {
          console.log(`[LineageDetail filteredBy] Processing table #${idx}:`, {
            LineageTag: table.LineageTag,
            lineagetag: table.lineagetag,
            name: table.name,
            resolved_tableId: tableId,
            resolved_name: name,
            allKeys: Object.keys(table)
          });
        }
        
        if (tableId && name) {
          tableIdToName.set(tableId, name);
        }
      }
    });

    console.log("[LineageDetail] Built table ID->name map:", {
      size: tableIdToName.size,
      sample: Array.from(tableIdToName.entries()).slice(0, 3),
      hasColumns: !!dimensions.smColumns
    });

    // If direct table ID mapping failed and we have columns, try column-based matching
    if (tableIdToName.size === 0 && dimensions.columns) {      const smColumns = Array.isArray(dimensions.columns) ? dimensions.columns : [];
      
      // Debug: log sample column object
      if (smColumns.length > 0) {        console.log("[LineageDetail] smColumns properties:", Object.keys(smColumns[0]));      }
      
      const columnToTable = new Map<string, string>(); // column_id -> table_name
      
      smColumns.forEach((col: any, idx: number) => {
        if (col.dataset_id === nodeModelId) {
          // LineageTag is the field that contains the GUID
          const colId = col.lineagetag || col.LineageTag;
          const colTableName = col.tablename || col.table_name || col.table;
          
          if (idx < 2) {
            console.log(`[LineageDetail] Processing column #${idx}:`, {
              LineageTag: col.LineageTag,
              lineagetag: col.lineagetag,
              tablename: col.tablename,
              table_name: col.table_name,
              table: col.table,
              resolved_colId: colId,
              resolved_tableName: colTableName,
              allKeys: Object.keys(col)
            });
          }
          
          if (colId && colTableName) {
            columnToTable.set(colId, colTableName);
          }
        }
      });
      
      console.log("[LineageDetail] Built column->table map:", {
        size: columnToTable.size,
        sample: Array.from(columnToTable.entries()).slice(0, 3)
      });
      
      // Now map relationship table IDs via their referenced columns
      smRelationships.forEach((rel: any) => {
        if (rel.dataset_id === nodeModelId) {
          const fromColId = rel.fromcolumn || rel.from_column;
          const toColId = rel.tocolumn || rel.to_column;
          const fromTableId = rel.fromtable || rel.from_table;
          const toTableId = rel.totable || rel.to_table;
          
          if (fromColId && !tableIdToName.has(fromTableId)) {
            const tableName = columnToTable.get(fromColId);
            if (tableName) {
              tableIdToName.set(fromTableId, tableName);
            }
          }
          
          if (toColId && !tableIdToName.has(toTableId)) {
            const tableName = columnToTable.get(toColId);
            if (tableName) {
              tableIdToName.set(toTableId, tableName);
            }
          }
        }
      });    }

    // Build a map of filtering relationships: table -> tables that filter it
    const filteringMap = new Map<string, Set<string>>();
    
    // Debug: log sample relationship to see actual property names
    if (smRelationships.length > 0) {      console.log("[LineageDetail] Relationship properties:", Object.keys(smRelationships[0]));
    }
    
    let activeRelCount = 0;
    let matchingFilterCount = 0;
    
    smRelationships.forEach((rel: any) => {
      // Debug first few relationships
      if (activeRelCount < 3) {
        console.log("[LineageDetail] Processing relationship:", {
          name: rel.name,
          dataset_id: rel.dataset_id,
          fromtable: rel.fromtable,
          totable: rel.totable,
          isactive: rel.isactive,
          crossfilteringbehavior: rel.crossfilteringbehavior,
          tocardinality: rel.tocardinality,
          allProps: Object.keys(rel)
        });
      }
      
      if (rel.dataset_id !== nodeModelId) return;

      // Check if relationship is active (handle both number and string)
      const isActive = rel.isactive === 1 || rel.isactive === "1" || rel.isactive === true;
      if (!isActive) return;
      
      activeRelCount++;

      // Check cross-filter direction (use crossfilteringbehavior as primary)
      const crossFilterDir = (rel.crossfilteringbehavior || rel.crossfilterdirection || rel.cross_filter_direction || "").toLowerCase();
      const toCard = (rel.tocardinality || rel.to_cardinality || "").toLowerCase();

      // Criteria: BothDirections OR (OneDirection AND ToCardinality is One)
      const isBothDirections = crossFilterDir === "bothdirections" || crossFilterDir === "both";
      const isOneDirectionWithOne = 
        (crossFilterDir === "onedirection" || crossFilterDir === "singledirection") && 
        (toCard === "one" || toCard === "1");

      if (isBothDirections || isOneDirectionWithOne) {
        matchingFilterCount++;
        
        // Get table IDs and look up actual names
        const fromTableId = rel.fromtable || rel.from_table;
        const toTableId = rel.totable || rel.to_table;
        const fromTableName = tableIdToName.get(fromTableId) || fromTableId;
        const toTableName = tableIdToName.get(toTableId) || toTableId;
        
        // In Power BI relationships:
        // - fromTable is the "many" side (fact table)
        // - toTable is the "one" side (dimension table)
        // - The dimension (toTable) FILTERS the fact (fromTable)
        // So: fromTable is filtered BY toTable
        if (fromTableName && toTableName) {
          if (!filteringMap.has(fromTableName)) {
            filteringMap.set(fromTableName, new Set());
          }
          filteringMap.get(fromTableName)!.add(toTableName);
        }
      }
    });

    console.log("[LineageDetail] Built filtering map:", {
      totalRelationships: smRelationships.length,
      activeRelationships: activeRelCount,
      matchingFilters: matchingFilterCount,
      mapSize: filteringMap.size,
      sample: Array.from(filteringMap.entries()).slice(0, 3).map(([table, filters]) => ({
        table,
        filteredBy: Array.from(filters)
      }))
    });

    // Determine which tables to check based on node type
    const tablesToCheck = new Set<string>();
    
    if (selectedNode.entityType === "table" && selectedNode.tableName) {
      // For table nodes, check direct filtering
      tablesToCheck.add(selectedNode.tableName);    } else if (selectedNode.entityType === "column" || selectedNode.entityType === "measure") {
      // For columns/measures, inherit filtering from their parent table
      if (selectedNode.tableName) {
        tablesToCheck.add(selectedNode.tableName);      }
      
      // Also check all tables this node transitively depends on via dependency edges
      const visited = new Set<string>();
      const queue = [selectedNode.nodeId];
      
      while (queue.length > 0) {
        const currentNodeId = queue.shift()!;
        if (visited.has(currentNodeId)) continue;
        visited.add(currentNodeId);
        
        // Find all outgoing dependencies (what this node depends on)
        const dependencies = edges.filter(e => 
          e.fromNodeId === currentNodeId && 
          (e.edgeType === "dependency" || e.edgeType === "relationship")
        );
        
        for (const dep of dependencies) {
          const depNode = nodeById.get(dep.toNodeId);
          if (depNode) {
            // If this node depends on a table, check that table's filtering
            if (depNode.entityType === "table" && depNode.tableName) {
              tablesToCheck.add(depNode.tableName);            }
            // If this node depends on a column/measure, check their parent table too
            else if ((depNode.entityType === "column" || depNode.entityType === "measure") && depNode.tableName) {
              tablesToCheck.add(depNode.tableName);            }
            
            // Continue BFS traversal
            if (!visited.has(depNode.nodeId)) {
              queue.push(depNode.nodeId);
            }
          }
        }
      }
    }

    console.log("[LineageDetail] Tables to check for filtering:", {
      tables: Array.from(tablesToCheck),
      availableInMap: Array.from(filteringMap.keys())
    });

    // Collect all tables that filter any of the tables we're checking
    const filteringTableNames = new Set<string>();
    
    for (const tableName of tablesToCheck) {
      const filters = filteringMap.get(tableName);
      if (filters) {
        console.log(`[LineageDetail] Table "${tableName}" is filtered by:`, Array.from(filters));
        filters.forEach(f => filteringTableNames.add(f));
      } else {      }
    }

    console.log("[LineageDetail] All filtering tables found:", {
      count: filteringTableNames.size,
      tables: Array.from(filteringTableNames)
    });

    // Map table names to nodes
    const filteringNodes = Array.from(filteringTableNames)
      .map(tableName => {
        const tableNodeId = `table:${nodeModelId}|${tableName}`;
        const node = nodeById.get(tableNodeId);
        if (!node) {        }
        return node;
      })
      .filter((n: LineageViewerNode | undefined): n is LineageViewerNode => n !== undefined);
    
    console.log("[LineageDetail] FINAL Filtered by nodes:", {
      nodeCount: filteringNodes.length,
      nodes: filteringNodes.map((n: LineageViewerNode) => ({
        id: n.nodeId,
        name: n.displayName,
        tableName: n.tableName
      }))
    });

    return filteringNodes;
  }, [selectedNode, dimensions, edges, nodeById]);

  // Table relationships - show all relationships this table participates in
  const tableRelationships = useMemo(() => {
    if (!selectedNode || selectedNode.entityType !== "table" || !dimensions?.relationships) {
      return { asFrom: [], asTo: [] };
    }

    const smRelationships = Array.isArray(dimensions.relationships) ? dimensions.relationships : [];
    const smTables = Array.isArray(dimensions.tables) ? dimensions.tables : [];
    const nodeModelId = selectedNode.datasetId;
    const tableName = selectedNode.tableName || selectedNode.displayName;

    if (!nodeModelId) {
      return { asFrom: [], asTo: [] };
    }

    // Debug: log sample table object to see structure
    if (smTables.length > 0) {      console.log("[LineageDetail] smTables properties:", Object.keys(smTables[0]));    }

    // Build lookup map: table ID -> table name
    // NOTE: smTables may not have table_id, we need to check what field contains the GUID
    const tableIdToName = new Map<string, string>();
    const tableNameToId = new Map<string, string>();
    
    smTables.forEach((table: any, idx: number) => {
      if (table.dataset_id === nodeModelId) {
        // LineageTag is the field that contains the GUID
        const tableId = table.lineagetag || table.LineageTag;
        const name = table.name || table.tablename || table.table_name;
        
        if (idx < 3) {
          console.log(`[LineageDetail] Processing table #${idx}:`, {
            LineageTag: table.LineageTag,
            lineagetag: table.lineagetag,
            name: table.name,
            resolved_tableId: tableId,
            resolved_name: name,
            allKeys: Object.keys(table)
          });
        }
        
        if (tableId && name) {
          tableIdToName.set(tableId, name);
          tableNameToId.set(name, tableId);
        } else if (name) {
          // If we have a name but no ID, store it for potential column-based matching
          tableNameToId.set(name, name);
        }
      }
    });    if (tableIdToName.size > 0) {
      console.log("[LineageDetail] Sample table mappings:", 
        Array.from(tableIdToName.entries()).slice(0, 5)
      );
    }

    // If direct table ID mapping failed and we have columns, try column-based matching
    if (tableIdToName.size === 0 && dimensions.columns) {      const smColumns = Array.isArray(dimensions.columns) ? dimensions.columns : [];
      
      // Debug: log sample column object
      if (smColumns.length > 0) {        console.log("[LineageDetail relationships] smColumns properties:", Object.keys(smColumns[0]));      }
      
      const columnToTable = new Map<string, string>(); // column_id -> table_name
      
      smColumns.forEach((col: any, idx: number) => {
        if (col.dataset_id === nodeModelId) {
          // LineageTag is the field that contains the GUID
          const colId = col.lineagetag || col.LineageTag;
          const colTableName = col.tablename || col.table_name || col.table;
          
          if (idx < 2) {
            console.log(`[LineageDetail relationships] Processing column #${idx}:`, {
              LineageTag: col.LineageTag,
              lineagetag: col.lineagetag,
              tablename: col.tablename,
              table_name: col.table_name,
              table: col.table,
              resolved_colId: colId,
              resolved_tableName: colTableName,
              allKeys: Object.keys(col)
            });
          }
          
          if (colId && colTableName) {
            columnToTable.set(colId, colTableName);
          }
        }
      });
      
      console.log("[LineageDetail relationships] Built column->table map:", {
        size: columnToTable.size,
        sample: Array.from(columnToTable.entries()).slice(0, 3)
      });
      
      // Now map relationship table IDs via their referenced columns
      smRelationships.forEach((rel: any) => {
        if (rel.dataset_id === nodeModelId) {
          const fromColId = rel.fromcolumn || rel.from_column;
          const toColId = rel.tocolumn || rel.to_column;
          const fromTableId = rel.fromtable || rel.from_table;
          const toTableId = rel.totable || rel.to_table;
          
          if (fromColId && !tableIdToName.has(fromTableId)) {
            const colTableName = columnToTable.get(fromColId);
            if (colTableName) {
              tableIdToName.set(fromTableId, colTableName);
            }
          }
          
          if (toColId && !tableIdToName.has(toTableId)) {
            const colTableName = columnToTable.get(toColId);
            if (colTableName) {
              tableIdToName.set(toTableId, colTableName);
            }
          }
        }
      });    }

    const asFrom: any[] = [];
    const asTo: any[] = [];

    smRelationships.forEach((rel: any, idx: number) => {
      if (rel.dataset_id !== nodeModelId) return;

      // Get table IDs (these are GUIDs)
      const fromTableId = rel.fromtable || rel.from_table;
      const toTableId = rel.totable || rel.to_table;

      // Look up actual table names
      const fromTableName = tableIdToName.get(fromTableId) || fromTableId;
      const toTableName = tableIdToName.get(toTableId) || toTableId;

      // Check if this table is the "from" table
      if (fromTableName === tableName) {
        asFrom.push({
          name: rel.name || `${fromTableName} → ${toTableName}`,
          fromTable: fromTableName,
          toTable: toTableName,
          isActive: rel.isactive === 1 || rel.isactive === "1" || rel.isactive === true,
          crossFilterDirection: rel.crossfilteringbehavior || rel.crossfilterdirection || rel.cross_filter_direction || "None",
          fromCardinality: rel.fromcardinality || rel.from_cardinality || "Unknown",
          toCardinality: rel.tocardinality || rel.to_cardinality || "Unknown",
        });
      }

      // Check if this table is the "to" table
      if (toTableName === tableName) {
        asTo.push({
          name: rel.name || `${fromTableName} → ${toTableName}`,
          fromTable: fromTableName,
          toTable: toTableName,
          isActive: rel.isactive === 1 || rel.isactive === "1" || rel.isactive === true,
          crossFilterDirection: rel.crossfilteringbehavior || rel.crossfilterdirection || rel.cross_filter_direction || "None",
          fromCardinality: rel.fromcardinality || rel.from_cardinality || "Unknown",
          toCardinality: rel.tocardinality || rel.to_cardinality || "Unknown",
        });
      }
    });    return { asFrom, asTo };
  }, [selectedNode, dimensions]);

  // Update relations with filteredBy data
  const relationsWithFilteredBy = useMemo(() => {
    const result = {
      ...relations,
      filteredBy: { label: t("LineageDetail_FilteredBy", "Filtered by"), nodes: filteredByRelations },
    };    return result;
  }, [relations, filteredByRelations, t]);

  const rel = relationsWithFilteredBy;

  // Node relationships - show relationships for tables and columns (via parent table)
  const nodeRelationships = useMemo(() => {
    // Only show for tables and columns
    if (!selectedNode || (selectedNode.entityType !== "table" && selectedNode.entityType !== "column")) {
      return [];
    }

    if (!dimensions?.relationships) {
      return [];
    }

    const smRelationships = Array.isArray(dimensions.relationships) ? dimensions.relationships : [];
    const smColumns = Array.isArray(dimensions.columns) ? dimensions.columns : [];
    const nodeModelId = selectedNode.datasetId;

    // For columns, use parent table name; for tables, use the node's own name
    const lookupTableName = selectedNode.entityType === "column" 
      ? selectedNode.tableName 
      : selectedNode.displayName;

    if (!nodeModelId || !lookupTableName) {
      return [];
    }

    // Build lookup map: table ID -> table name from columns
    const tableIdToName = new Map<string, string>();
    smColumns.forEach((col: any) => {
      if (col.dataset_id === nodeModelId) {
        const colId = col.lineagetag || col.LineageTag;
        const colTableName = col.tablename || col.table_name || col.table;
        if (colId && colTableName) {
          // Also try to infer table IDs from relationship references
          if (!tableIdToName.has(colTableName)) {
            tableIdToName.set(colTableName, colTableName);
          }
        }
      }
    });

    // Extract relationships involving this table
    const relationships: any[] = [];

    smRelationships.forEach((rel: any) => {
      if (rel.dataset_id !== nodeModelId) return;

      // Get table IDs
      const fromTableId = rel.fromtable || rel.from_table;
      const toTableId = rel.totable || rel.to_table;
      const fromColId = rel.fromcolumn || rel.from_column;
      const toColId = rel.tocolumn || rel.to_column;

      // Resolve table names from column references
      let fromTableName = tableIdToName.get(fromTableId);
      let toTableName = tableIdToName.get(toTableId);

      // If not found by table ID, try to resolve from columns
      if (!fromTableName && fromColId) {
        const fromCol = smColumns.find((c: any) => 
          (c.lineagetag === fromColId || c.LineageTag === fromColId) && c.dataset_id === nodeModelId
        );
        fromTableName = fromCol?.tablename || fromCol?.table_name || fromCol?.table;
      }

      if (!toTableName && toColId) {
        const toCol = smColumns.find((c: any) => 
          (c.lineagetag === toColId || c.LineageTag === toColId) && c.dataset_id === nodeModelId
        );
        toTableName = toCol?.tablename || toCol?.table_name || toCol?.table;
      }

      // Check if this relationship involves the lookup table
      if (fromTableName === lookupTableName || toTableName === lookupTableName) {
        const isActive = rel.isactive === 1 || rel.isactive === "1" || rel.isactive === true;
        const crossFilterDir = rel.crossfilteringbehavior || rel.crossfilterdirection || rel.cross_filter_direction || "None";
        const fromCard = rel.fromcardinality || rel.from_cardinality || "Unknown";
        const toCard = rel.tocardinality || rel.to_cardinality || "Unknown";

        relationships.push({
          name: rel.name || `${fromTableName} → ${toTableName}`,
          fromTable: fromTableName || fromTableId,
          toTable: toTableName || toTableId,
          isActive,
          crossFilterDirection: crossFilterDir,
          fromCardinality: fromCard,
          toCardinality: toCard,
          direction: fromTableName === lookupTableName ? "outgoing" : "incoming",
        });
      }
    });

    return relationships;
  }, [selectedNode, dimensions]);

  // Helper function to render connection items with expand capability
  const renderConnectionItem = (node: LineageViewerNode, depth: number = 0, degree?: number) => {
    const isExpanded = expandedNodes.has(node.nodeId);
    const downstream = isExpanded ? getNodeDownstream(node.nodeId) : [];
    const hasDownstream = downstream.length > 0;
    const isSelected = node.nodeId === selectedNodeId;
    
    return (
      <div key={node.nodeId} style={{ marginLeft: depth > 0 ? `${depth * 20}px` : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXXS }}>
          {/* Expand/collapse button */}
          {depth === 0 && hasDownstream && (
            <Button
              appearance="transparent"
              size="small"
              icon={isExpanded ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                toggleNodeExpansion(node.nodeId);
              }}
              style={{ minWidth: "24px", padding: "4px" }}
            />
          )}
          {depth === 0 && !hasDownstream && (
            <div style={{ width: "24px" }} />
          )}
          
          {/* Connection item button */}
          <button
            type="button"
            className={`${styles.connectionItem}${isSelected ? ` ${styles.connectionItemSelected}` : ""}`}
            onClick={() => onNodeSelect?.(node.nodeId)}
            style={{ flex: 1 }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", flex: 1, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS, width: "100%" }}>
                <span className={styles.connectionItemName} title={node.displayName}>
                  {node.displayName}
                </span>
                {degree !== undefined && showAllConnections && (
                  <Badge size="small" appearance="outline" style={{ flexShrink: 0 }}>
                    {degree === 1 ? "direct" : `${degree} hops`}
                  </Badge>
                )}
              </div>
              {node.tableName && (
                <span className={styles.connectionItemSubLabel}>{node.tableName}</span>
              )}
            </div>
          </button>
        </div>
        
        {/* Expanded downstream items */}
        {isExpanded && downstream.length > 0 && (
          <div style={{ marginTop: tokens.spacingVerticalXXS }}>
            {downstream.map(downstreamNode => renderConnectionItem(downstreamNode, depth + 1, degree))}
          </div>
        )}
      </div>
    );
  };

  if (!selectedNode) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>
          {t("LineageWorkbench_Detail_NoSelection", "Select a node in the graph or table to view details")}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalS }}>
          <div>
            <div className={styles.cardTitle}>{t("LineageDetail_Requirements_Title", "Requirements")}</div>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {t("LineageDetail_Requirements_Count", "{{count}} linked tickets in board", { count: requirementsCount ?? 0 })}
            </Text>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS }}>
            <Button
              size="small"
              appearance="subtle"
              icon={<ArrowRight16Regular />}
              iconPosition="after"
              onClick={() => onOpenRequirementsBoard?.()}
            >
              {t("LineageDetail_OpenRequirementsBoard", "Open board")}
            </Button>
            <Button
              size="small"
              appearance="primary"
              icon={<Add16Regular />}
              onClick={() => setCreateDialogOpen(true)}
            >
              {t("LineageDetail_CreateTicket", "Create ticket")}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Upstream & Downstream Connections ── */}
      {(nodeEdges.incoming.length > 0 || nodeEdges.outgoing.length > 0) && (
        <>
          {/* Connection Depth Toggle */}
          <div className={styles.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalS }}>
              <div>
                <Text weight="semibold" size={300}>{t("LineageDetail_ConnectionDepth", "Connection Depth")}</Text>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginTop: tokens.spacingVerticalXXS, display: "block" }}>
                  {showAllConnections 
                    ? t("LineageDetail_ShowingAll", "Showing all transitive upstream/downstream dependencies")
                    : t("LineageDetail_ShowingDirect", "Showing only neighbors")}
                </Text>
              </div>
              <Switch
                checked={!showAllConnections}
                onChange={(_, data) => setShowAllConnections(!data.checked)}
                label={t("LineageDetail_ShowOnlyNeighbors", "Show only neighbors")}
              />
            </div>
          </div>

          {/* Upstream (incoming) connections */}
          {(() => {
            const upstreamNodes = showAllConnections ? allTransitiveConnections.upstream : nodeEdges.incoming
              .map(e => nodeById.get(e.fromNodeId))
              .filter((n): n is LineageViewerNode => n !== undefined);
            
            if (upstreamNodes.length === 0) return null;
            
            const grouped = new Map<string, LineageViewerNode[]>();
            for (const n of upstreamNodes) {
              if (!grouped.has(n.entityType)) grouped.set(n.entityType, []);
              grouped.get(n.entityType)!.push(n);
            }
            
            return (
              <Accordion className={styles.accordionPanel} collapsible>
                <AccordionItem value="upstream">
                  <AccordionHeader>
                    <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS }}>
                      <Text weight="semibold">
                        {showAllConnections 
                          ? t("LineageDetail_AllUpstream", "All Upstream (transitive)")
                          : t("LineageDetail_Upstream", "Upstream")}
                      </Text>
                      <Badge>{upstreamNodes.length}</Badge>
                    </div>
                  </AccordionHeader>
                  <AccordionPanel>
                    <div className={styles.accordionContent}>
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalS, padding: tokens.spacingHorizontalM }}>
                        {showAllConnections
                          ? t("LineageDetail_AllUpstreamHint", "All nodes that this node transitively depends on")
                          : t("LineageDetail_UpstreamHint", "Nodes that this node directly depends on")}
                      </Text>
                      {Array.from(grouped.entries()).map(([entityType, groupNodes]) => (
                        <div key={entityType} className={styles.connectionGroup}>
                          <div className={styles.connectionGroupLabel}>
                            {getEntityTypeLabel(entityType)} ({groupNodes.length})
                          </div>
                          {groupNodes.map((node) => {
                            const degree = allTransitiveConnections.degreeMap.get(node.nodeId);
                            return renderConnectionItem(node, 0, degree);
                          })}
                        </div>
                      ))}
                    </div>
                  </AccordionPanel>
                </AccordionItem>
              </Accordion>
            );
          })()}

          {/* Downstream (outgoing) connections */}
          {(() => {
            const downstreamNodes = showAllConnections ? allTransitiveConnections.downstream : nodeEdges.outgoing
              .map(e => nodeById.get(e.toNodeId))
              .filter((n): n is LineageViewerNode => n !== undefined);
            
            if (downstreamNodes.length === 0) return null;
            
            const grouped = new Map<string, LineageViewerNode[]>();
            for (const n of downstreamNodes) {
              if (!grouped.has(n.entityType)) grouped.set(n.entityType, []);
              grouped.get(n.entityType)!.push(n);
            }
            
            return (
              <Accordion className={styles.accordionPanel} collapsible>
                <AccordionItem value="downstream">
                  <AccordionHeader>
                    <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS }}>
                      <Text weight="semibold">
                        {showAllConnections 
                          ? t("LineageDetail_AllDownstream", "All Downstream (transitive)")
                          : t("LineageDetail_Downstream", "Downstream")}
                      </Text>
                      <Badge>{downstreamNodes.length}</Badge>
                    </div>
                  </AccordionHeader>
                  <AccordionPanel>
                    <div className={styles.accordionContent}>
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalS, padding: tokens.spacingHorizontalM }}>
                        {showAllConnections
                          ? t("LineageDetail_AllDownstreamHint", "All nodes that transitively depend on this node")
                          : t("LineageDetail_DownstreamHint", "Nodes that directly depend on this node")}
                      </Text>
                      {Array.from(grouped.entries()).map(([entityType, groupNodes]) => (
                        <div key={entityType} className={styles.connectionGroup}>
                          <div className={styles.connectionGroupLabel}>
                            {getEntityTypeLabel(entityType)} ({groupNodes.length})
                          </div>
                          {groupNodes.map((node) => {
                            const degree = allTransitiveConnections.degreeMap.get(node.nodeId);
                            return renderConnectionItem(node, 0, degree);
                          })}
                        </div>
                      ))}
                    </div>
                  </AccordionPanel>
                </AccordionItem>
              </Accordion>
            );
          })()}
        </>
      )}

      {/* ── Main properties card ── */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>{t("LineageDetail_SelectedInfo", "Selected info")}</div>
        <div className={styles.badgeList}>
          {selectedInfoCards.map((card, idx) => (
            <React.Fragment key={card.key}>
              <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXXS }}>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>{card.label}:</Text>
                {card.isLink && card.value ? (
                  <a 
                    href={card.value} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      e.preventDefault();
                      window.open(card.value, '_blank', 'noopener,noreferrer');
                    }}
                    style={{ 
                      color: tokens.colorBrandForeground1, 
                      textDecoration: "none",
                      fontSize: tokens.fontSizeBase200,
                      fontWeight: tokens.fontWeightSemibold,
                      cursor: "pointer"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.textDecoration = "underline"}
                    onMouseLeave={(e) => e.currentTarget.style.textDecoration = "none"}
                  >
                    {card.value}
                  </a>
                ) : (
                  <Text size={200} weight="semibold" title={card.value}>
                    {card.value}
                  </Text>
                )}
              </div>
              {idx < selectedInfoCards.length - 1 && <span className={styles.badgeSeparator}>•</span>}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── Visual Preview (canvas-based page layout) ── */}
      {(() => {
        // Only show for visual nodes
        if (selectedNode.entityType !== "visual") return false;
        
        // Extract pageId and reportId from nodeId if not directly available
        // NodeId format: reportId|pageId|visualId
        let pageId = selectedNode.pageId;
        let reportId = selectedNode.reportId;
        let visualId = selectedNode.visualId;
        
        if (!pageId || !reportId) {
          const parts = selectedNode.nodeId.split("|");
          if (parts.length >= 3) {
            reportId = reportId || parts[0];
            pageId = pageId || parts[1];
            visualId = visualId || parts[2];
          }
        }
        
        console.log("[LineageDetail] Visual Preview Check:", {
          entityType: selectedNode.entityType,
          pageId,
          reportId,
          visualId,
          hasDimensions: !!dimensions,
          hasVisuals: !!dimensions?.visuals,
          visualsCount: dimensions?.visuals?.length || 0,
          selectedNode: {
            nodeId: selectedNode.nodeId,
            displayName: selectedNode.displayName,
            visualId: selectedNode.visualId,
            pageId: selectedNode.pageId,
            reportId: selectedNode.reportId,
          }
        });
        
        if (!pageId || !reportId || !dimensions?.visuals) {
          console.log("[LineageDetail] Visual Preview SKIPPED - missing data");
          return false;
        }
        
        // Filter visuals for this page
        const pageVisuals = dimensions.visuals.filter((v: any) => {
          const vPageName = v.page_name || v.pageName || v.Page_display_name || v.page_display_name;
          const vReportId = v.report_id || v.reportId || v.report_pk;
          return vPageName === pageId && vReportId === reportId;
        });
        
        console.log("[LineageDetail] Visual Preview Filtering:", {
          totalVisuals: dimensions.visuals.length,
          matchingPageVisuals: pageVisuals.length,
          searchingFor: { pageId, reportId },
          sampleVisual: dimensions.visuals[0],
          visualKeys: dimensions.visuals[0] ? Object.keys(dimensions.visuals[0]) : [],
        });
        
        return pageVisuals.length > 0;
      })() && (() => {
        // Extract IDs again for rendering
        let pageId = selectedNode.pageId;
        let reportId = selectedNode.reportId;
        let visualId = selectedNode.visualId;
        
        if (!pageId || !reportId) {
          const parts = selectedNode.nodeId.split("|");
          if (parts.length >= 3) {
            reportId = reportId || parts[0];
            pageId = pageId || parts[1];
            visualId = visualId || parts[2];
          }
        }
        
        const pageVisuals = dimensions.visuals.filter((v: any) => {
          const vPageName = v.page_name || v.pageName || v.Page_display_name || v.page_display_name;
          const vReportId = v.report_id || v.reportId || v.report_pk;
          return vPageName === pageId && vReportId === reportId;
        });
        
        // Calculate canvas dimensions based on visual positions
        let maxX = 0;
        let maxY = 0;
        pageVisuals.forEach((v: any) => {
          const x = parseFloat(v.x || 0);
          const y = parseFloat(v.y || 0);
          const w = parseFloat(v.width || 0);
          const h = parseFloat(v.height || 0);
          maxX = Math.max(maxX, x + w);
          maxY = Math.max(maxY, y + h);
        });
        
        // Use standard report page dimensions if we don't have valid coordinates
        const canvasWidth = maxX > 0 ? maxX : 1280;
        const canvasHeight = maxY > 0 ? maxY : 720;
        const scale = 0.5; // Scale down for display
        
        return (
          <Accordion className={styles.accordionPanel} collapsible>
            <AccordionItem value="visual-preview">
              <AccordionHeader>
                <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS }}>
                  <Text weight="semibold">{t("LineageDetail_PageLayout", "Page Layout")}</Text>
                  <Badge>{pageVisuals.length}</Badge>
                </div>
              </AccordionHeader>
              <AccordionPanel>
                <div className={styles.accordionContent}>
                  <div style={{ 
                    width: "100%", 
                    height: `${canvasHeight * scale + 20}px`,
                    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
                    borderRadius: tokens.borderRadiusSmall,
                    overflow: "auto",
                    backgroundColor: tokens.colorNeutralBackground3,
                    padding: tokens.spacingVerticalM,
                  }}>
                    <div style={{
                      position: "relative",
                      width: `${canvasWidth * scale}px`,
                      height: `${canvasHeight * scale}px`,
                      backgroundColor: tokens.colorNeutralBackground1,
                      border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
                    }}>
                {pageVisuals.map((visual: any, idx: number) => {
                  const x = parseFloat(visual.x || 0) * scale;
                  const y = parseFloat(visual.y || 0) * scale;
                  const w = parseFloat(visual.width || 100) * scale;
                  const h = parseFloat(visual.height || 100) * scale;
                  const visualName = visual.visual_name || visual.name || `Visual ${idx + 1}`;
                  const visualType = visual.display_type || visual.type || visual.visual_type || "unknown";
                  
                  // Check if this is the selected visual
                  const isSelected = 
                    (visual.visual_name || visual.name) === visualId ||
                    (visual.LineageTag || visual.lineageTag) === visualId ||
                    visual.LineageTag === selectedNode.nodeId;
                  
                  return (
                    <div
                      key={idx}
                      style={{
                        position: "absolute",
                        left: `${x}px`,
                        top: `${y}px`,
                        width: `${w}px`,
                        height: `${h}px`,
                        border: isSelected 
                          ? `3px solid ${tokens.colorBrandStroke1}` 
                          : `1px solid ${tokens.colorNeutralStroke2}`,
                        backgroundColor: isSelected 
                          ? tokens.colorBrandBackground2 
                          : tokens.colorNeutralBackground2,
                        borderRadius: tokens.borderRadiusSmall,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: tokens.fontSizeBase100,
                        color: tokens.colorNeutralForeground2,
                        textAlign: "center",
                        padding: tokens.spacingVerticalXXS,
                        overflow: "hidden",
                        boxShadow: isSelected ? tokens.shadow8 : tokens.shadow4,
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                      title={`${visualName} (${visualType})`}
                    >
                      <div style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "2px",
                      }}>
                        <Text size={100} weight={isSelected ? "semibold" : "regular"}>
                          {visualType}
                        </Text>
                        {w > 60 && h > 30 && (
                          <Text size={100} style={{ fontSize: "9px", opacity: 0.7 }}>
                            {visualName.length > 15 ? visualName.substring(0, 15) + "..." : visualName}
                          </Text>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginTop: tokens.spacingVerticalS }}>
              {t("LineageDetail_PageLayoutHint", "Showing {{count}} visuals on page '{{page}}'", { 
                count: pageVisuals.length, 
                page: pageId 
              })}
            </Text>
          </div>
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
        );
      })()}

      {/* ── Expression card (for measures and columns with expressions) ── */}
      {(() => {
        // Get expression from typeSpecificFields since it already checks all field variations
        const expressionField = typeSpecificFields.find(f => f.label === t("LineageDetail_Expression", "Expression"));
        const expressionValue = expressionField?.value;
        const shouldShow = (selectedNode.entityType === "measure" || selectedNode.entityType === "column") && !!expressionValue;
        
        console.log("[LineageDetail] Expression card check:", {
          entityType: selectedNode.entityType,
          hasExpression: !!selectedNode.expression,
          expression: selectedNode.expression,
          hasInferredExpression: !!inferredExpression,
          inferredExpression,
          expressionFromField: expressionValue,
          shouldShow,
          allFields: Object.keys(selectedNode),
        });
        return shouldShow;
      })() && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>{t("LineageDetail_Expression", "Expression")}</div>
          <div className={styles.expressionBlock}>
            {typeSpecificFields.find(f => f.label === t("LineageDetail_Expression", "Expression"))?.value}
          </div>
        </div>
      )}

      {/* ── Query Steps (Column Transformation History) ── */}
      {(() => {
        // Only show for columns
        if (selectedNode.entityType !== "column") return null;
        
        const columnLineage = dimensions?.columnLineage || [];
        
        // Debug logging - ALWAYS log to help diagnose issues
        console.log("[LineageDetailView] Query Steps Debug:", {
          totalColumnLineageRecords: columnLineage.length,
          hasDimensionsObject: !!dimensions,
          dimensionsKeys: dimensions ? Object.keys(dimensions) : [],
          columnLineageType: Array.isArray(columnLineage) ? 'array' : typeof columnLineage,
          selectedNodeInfo: {
            displayName: selectedNode.displayName,
            tableName: selectedNode.tableName,
            datasetId: selectedNode.datasetId,
            entityType: selectedNode.entityType,
          },
          sampleColumnLineageRecord: columnLineage[0] || "NO DATA",
          allColumnLineageColumns: columnLineage[0] ? Object.keys(columnLineage[0]) : [],
        });
        
        if (columnLineage.length === 0) {
          console.warn("[LineageDetailView] Query Steps - No columnLineage data available. Check backend logs for 't_dataset_column_lineage' table query.");
          return null;
        }
        
        // Match by final_column_name and dataset_id (or table name)
        const steps = columnLineage.filter((step: any) => {
          const matchesColumn = step.final_column_name === selectedNode.displayName || 
                              step.column_name_at_step === selectedNode.displayName;
          const matchesTable = step.power_bi_table_name === selectedNode.tableName;
          const matchesModel = !selectedNode.datasetId || step.dataset_id === selectedNode.datasetId;
          
          // Log each step's matching criteria for first 3 records
          if (columnLineage.indexOf(step) < 3) {
            console.log(`[LineageDetailView] Query Steps - Testing step ${columnLineage.indexOf(step)}:`, {
              stepData: {
                final_column_name: step.final_column_name,
                column_name_at_step: step.column_name_at_step,
                power_bi_table_name: step.power_bi_table_name,
                dataset_id: step.dataset_id,
              },
              matches: {
                matchesColumn,
                matchesTable,
                matchesModel,
                overall: matchesColumn && matchesTable && matchesModel,
              },
            });
          }
          
          return matchesColumn && matchesTable && matchesModel;
        });
        
        // Sort by step_order (descending, so most recent step is first)
        steps.sort((a: any, b: any) => (b.step_order || 0) - (a.step_order || 0));
        
        if (steps.length === 0) {
          console.log("[LineageDetailView] Query Steps - No matching steps found for this column");
          return null;
        }
        
        console.log("[LineageDetailView] Query Steps - Found matching steps:", steps.length);
        
        return (
          <Accordion className={styles.accordionPanel} collapsible>
            <AccordionItem value="query-steps">
              <AccordionHeader>
                <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS }}>
                  <Text weight="semibold">{t("LineageDetail_QuerySteps", "Query Steps")}</Text>
                  <Badge>{steps.length}</Badge>
                </div>
              </AccordionHeader>
              <AccordionPanel>
                <div className={styles.accordionContent}>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalS, padding: tokens.spacingHorizontalM }}>
                    {t("LineageDetail_QueryStepsHint", "Power Query M transformation steps applied to this column")}
                  </Text>
                  {steps.map((step: any, index: number) => (
                    <div key={index} className={styles.card} style={{ marginBottom: tokens.spacingVerticalS }}>
                      {/* Row 1: All info in one line */}
                      <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS, marginBottom: step.step_expression ? tokens.spacingVerticalS : 0, flexWrap: "wrap" }}>
                        {step.affects_entire_table && (
                          <Badge size="small" appearance="filled" color="warning">
                            {t("LineageDetail_AffectsTable", "Affects entire table")}
                          </Badge>
                        )}
                        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                          {step.step_name || `Step ${step.step_order || index + 1}`}
                        </Text>
                        {step.transformation_function && (
                          <>
                            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>•</Text>
                            <Text size={200} weight="semibold">
                              {step.transformation_function}
                            </Text>
                          </>
                        )}
                        {step.column_name_at_step && step.column_name_at_step !== step.final_column_name && (
                          <>
                            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>•</Text>
                            <Text size={200}>
                              {step.column_name_at_step}
                            </Text>
                          </>
                        )}
                        {step.column_created_here && (
                          <Badge size="small" appearance="filled" color="success">
                            {t("LineageDetail_CreatedHere", "Column created here")}
                          </Badge>
                        )}
                        <Badge size="small" appearance="outline" style={{ marginLeft: "auto" }}>
                          {step.step_order || index + 1}
                        </Badge>
                      </div>
                      
                      {/* Row 2: Expression only */}
                      {step.step_expression && (
                        <div className={styles.expressionBlock} style={{ maxHeight: "200px" }}>
                          {step.step_expression}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
        );
      })()}

      {/* ── Relationships (for tables and columns) ── */}
      {nodeRelationships.length > 0 && (
        <Accordion className={styles.accordionPanel} collapsible>
          <AccordionItem value="relationships">
            <AccordionHeader>
              <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS }}>
                <Text weight="semibold">{t("LineageDetail_Relationships", "Relationships")}</Text>
                <Badge>{nodeRelationships.length}</Badge>
              </div>
            </AccordionHeader>
            <AccordionPanel>
              <div className={styles.accordionContent}>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalS, padding: tokens.spacingHorizontalM }}>
                  {selectedNode.entityType === "column"
                    ? t("LineageDetail_RelationshipsColumnHint", "Relationships involving the parent table of this column")
                    : t("LineageDetail_RelationshipsTableHint", "Relationships where this table is involved")}
                </Text>
                {nodeRelationships.map((relationship: any, idx: number) => (
                  <div key={idx} className={styles.card} style={{ marginBottom: tokens.spacingVerticalS }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS }}>
                      {/* Relationship name and direction */}
                      <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS, flexWrap: "wrap" }}>
                        <Text weight="semibold" size={300}>
                          {relationship.fromTable}
                        </Text>
                        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>→</Text>
                        <Text weight="semibold" size={300}>
                          {relationship.toTable}
                        </Text>
                        {!relationship.isActive && (
                          <Badge size="small" appearance="outline" color="danger">
                            {t("LineageDetail_Inactive", "Inactive")}
                          </Badge>
                        )}
                      </div>

                      {/* Relationship details */}
                      <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXXS }}>
                          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                            {t("LineageDetail_Multiplicity", "Multiplicity")}:
                          </Text>
                          <Badge size="small" appearance="outline">
                            {relationship.fromCardinality} : {relationship.toCardinality}
                          </Badge>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXXS }}>
                          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                            {t("LineageDetail_CrossFilter", "Cross filter")}:
                          </Text>
                          <Badge size="small" appearance="outline">
                            {relationship.crossFilterDirection}
                          </Badge>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXXS }}>
                          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                            {t("LineageDetail_Direction", "Direction")}:
                          </Text>
                          <Badge size="small" appearance="outline">
                            {relationship.direction === "outgoing" ? "↗" : "↙"} {relationship.direction}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      )}

      {/* ── Filtered by list (tables that filter this table via active relationships) ── */}
      {rel.filteredBy && rel.filteredBy.nodes.length > 0 && (
        <Accordion className={styles.accordionPanel} collapsible>
          <AccordionItem value="filtered-by">
            <AccordionHeader>
              <Text weight="semibold">{t("LineageDetail_FilteredBy", "Filtered by")} ({rel.filteredBy.nodes.length})</Text>
            </AccordionHeader>
            <AccordionPanel>
              <div className={styles.accordionContent}>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalS, padding: tokens.spacingHorizontalM }}>
                {t("LineageDetail_FilteredByHint", "Tables that apply filters to this element or its dependencies through active relationships (BothDirections or OneDirection with ToCardinality=One)")}
              </Text>
          
          {(() => {
            const grouped = new Map<string, LineageViewerNode[]>();
            for (const n of rel.filteredBy.nodes) {
              if (!grouped.has(n.entityType)) grouped.set(n.entityType, []);
              grouped.get(n.entityType)!.push(n);
            }
            return Array.from(grouped.entries()).map(([entityType, groupNodes]) => (
              <div key={entityType} className={styles.connectionGroup}>
                <div className={styles.connectionGroupLabel}>
                  {getEntityTypeLabel(entityType)} ({groupNodes.length})
                </div>
                {groupNodes.map((node) => renderConnectionItem(node, 0))}
              </div>
            ));
          })()}
              </div>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      )}

      {/* ── Table Relationships (for table nodes only) ── */}
      {selectedNode?.entityType === "table" && (tableRelationships.asFrom.length > 0 || tableRelationships.asTo.length > 0) && (
        <Accordion className={styles.accordionPanel} collapsible>
          <AccordionItem value="table-relationships">
            <AccordionHeader>
              <Text weight="semibold">{t("LineageDetail_TableRelationships", "Relationships")} ({tableRelationships.asFrom.length + tableRelationships.asTo.length})</Text>
            </AccordionHeader>
            <AccordionPanel>
              <div className={styles.accordionContent}>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalM, padding: tokens.spacingHorizontalM }}>
                {t("LineageDetail_TableRelationshipsHint", "All relationships where this table participates")}
              </Text>

          {/* Relationships where this table is the FROM table */}
          {tableRelationships.asFrom.length > 0 && (
            <div style={{ marginBottom: tokens.spacingVerticalL }}>
              <div className={styles.connectionGroupLabel}>
                {t("LineageDetail_AsFromTable", "As FROM table")} ({tableRelationships.asFrom.length})
              </div>
              {tableRelationships.asFrom.map((rel: any, idx: number) => (
                <div key={`from-${idx}`} className={styles.card} style={{ 
                  marginTop: tokens.spacingVerticalS, 
                  padding: tokens.spacingHorizontalM,
                  backgroundColor: tokens.colorNeutralBackground3
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS }}>
                    <Text weight="semibold" size={300}>
                      {rel.fromTable} → {rel.toTable}
                    </Text>
                    <div style={{ display: "flex", gap: tokens.spacingHorizontalM, flexWrap: "wrap" }}>
                      <div>
                        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                          {t("LineageDetail_RelName", "Name")}: 
                        </Text>
                        <Text size={200}> {rel.name}</Text>
                      </div>
                      <div>
                        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                          {t("LineageDetail_RelActive", "Active")}: 
                        </Text>
                        <Badge 
                          appearance="tint" 
                          size="small" 
                          color={rel.isActive ? "success" : "danger"}
                        >
                          {rel.isActive ? "Yes" : "No"}
                        </Badge>
                      </div>
                      <div>
                        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                          {t("LineageDetail_RelCrossFilter", "Cross-filter")}: 
                        </Text>
                        <Text size={200}> {rel.crossFilterDirection}</Text>
                      </div>
                      <div>
                        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                          {t("LineageDetail_RelCardinality", "Cardinality")}: 
                        </Text>
                        <Text size={200}> {rel.fromCardinality} → {rel.toCardinality}</Text>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Relationships where this table is the TO table */}
          {tableRelationships.asTo.length > 0 && (
            <div>
              <div className={styles.connectionGroupLabel}>
                {t("LineageDetail_AsToTable", "As TO table")} ({tableRelationships.asTo.length})
              </div>
              {tableRelationships.asTo.map((rel: any, idx: number) => (
                <div key={`to-${idx}`} className={styles.card} style={{ 
                  marginTop: tokens.spacingVerticalS, 
                  padding: tokens.spacingHorizontalM,
                  backgroundColor: tokens.colorNeutralBackground3
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS }}>
                    <Text weight="semibold" size={300}>
                      {rel.fromTable} → {rel.toTable}
                    </Text>
                    <div style={{ display: "flex", gap: tokens.spacingHorizontalM, flexWrap: "wrap" }}>
                      <div>
                        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                          {t("LineageDetail_RelName", "Name")}: 
                        </Text>
                        <Text size={200}> {rel.name}</Text>
                      </div>
                      <div>
                        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                          {t("LineageDetail_RelActive", "Active")}: 
                        </Text>
                        <Badge 
                          appearance="tint" 
                          size="small" 
                          color={rel.isActive ? "success" : "danger"}
                        >
                          {rel.isActive ? "Yes" : "No"}
                        </Badge>
                      </div>
                      <div>
                        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                          {t("LineageDetail_RelCrossFilter", "Cross-filter")}: 
                        </Text>
                        <Text size={200}> {rel.crossFilterDirection}</Text>
                      </div>
                      <div>
                        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                          {t("LineageDetail_RelCardinality", "Cardinality")}: 
                        </Text>
                        <Text size={200}> {rel.fromCardinality} → {rel.toCardinality}</Text>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
              </div>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      )}

      <RequirementDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        nodes={nodes}
        initialTitle={selectedNode ? `Review lineage impact: ${selectedNode.displayName}` : undefined}
        initialLinkedNodeIds={selectedNode ? [selectedNode.nodeId] : []}
        currentUser={{ displayName: "Current User", email: "" }}
        onSave={(req) => {
          onCreateRequirement?.(req);
          setCreateDialogOpen(false);
        }}
      />
    </div>
  );
}
