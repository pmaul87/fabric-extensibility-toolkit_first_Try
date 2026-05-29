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
    if (!selectedNode) return [] as Array<{ label: string; value?: string }>;

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
          m.model_id === selectedNode.datasetId || 
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
          m.model_id === selectedNode.datasetId || 
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
          { label: t("LineageDetail_URL", "URL"), value: visualDetails?.url || visualDetails?.URL || visualDetails?.link },
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
          m.model_id === selectedNode.datasetId || m.uid === selectedNode.datasetId
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
          (t.table_name === selectedNode.tableName && t.model_id === selectedNode.datasetId)
        );
        const modelDetails = dimensions?.semanticModels?.find((m: any) => 
          m.model_id === selectedNode.datasetId || 
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
    if (!selectedNode) return [] as Array<{ key: string; label: string; value: string; isCode?: boolean }>;

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
      },
      {
        key: "name",
        label: t("LineageDetail_Name", "Name"),
        value: selectedNode.displayName,
      },
      ...typeSpecificFields
        .filter((field) => !!field.value && field.label !== t("LineageDetail_Expression", "Expression")) // Exclude expression from inline display
        .map((field, index) => ({
          key: `meta-${index}-${field.label}`,
          label: field.label,
          value: field.value!,
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
    if (!selectedNode || !showAllConnections) return { upstream: [] as LineageViewerNode[], downstream: [] as LineageViewerNode[] };

    const computeTransitive = (startNodeId: string, direction: "upstream" | "downstream"): LineageViewerNode[] => {
      const visited = new Set<string>();
      const queue = [startNodeId];
      const results: LineageViewerNode[] = [];

      while (queue.length > 0) {
        const currentNodeId = queue.shift()!;
        if (visited.has(currentNodeId)) continue;
        visited.add(currentNodeId);

        // Skip the starting node itself
        if (currentNodeId !== startNodeId) {
          const currentNode = nodeById.get(currentNodeId);
          if (currentNode) {
            results.push(currentNode);
          }
        }

        // Find edges in the specified direction
        const relevantEdges = edges.filter(e => {
          if (e.edgeType !== "dependency" && e.edgeType !== "relationship") return false;
          return direction === "upstream" 
            ? e.toNodeId === currentNodeId 
            : e.fromNodeId === currentNodeId;
        });

        // Add neighbors to queue
        for (const edge of relevantEdges) {
          const nextNodeId = direction === "upstream" ? edge.fromNodeId : edge.toNodeId;
          if (!visited.has(nextNodeId)) {
            queue.push(nextNodeId);
          }
        }
      }

      return results;
    };

    return {
      upstream: computeTransitive(selectedNode.nodeId, "upstream"),
      downstream: computeTransitive(selectedNode.nodeId, "downstream"),
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
    if (!selectedNode || !dimensions?.smRelationships) {
      console.log("[LineageDetail] No filteredBy data:", { 
        hasSelectedNode: !!selectedNode, 
        hasDimensions: !!dimensions,
        hasSmRelationships: !!dimensions?.smRelationships 
      });
      return [];
    }

    const smRelationships = Array.isArray(dimensions.smRelationships) ? dimensions.smRelationships : [];
    const smTables = Array.isArray(dimensions.smTables) ? dimensions.smTables : [];
    const nodeModelId = selectedNode.datasetId;

    console.log("[LineageDetail] Processing filteredBy for:", { 
      nodeId: selectedNode.nodeId,
      entityType: selectedNode.entityType,
      tableName: selectedNode.tableName,
      nodeModelId,
      totalRelationships: smRelationships.length,
      totalTables: smTables.length
    });

    if (!nodeModelId) {
      console.log("[LineageDetail] Missing model ID");
      return [];
    }

    // Debug: log sample table object to see structure
    if (smTables.length > 0) {
      console.log("[LineageDetail filteredBy] Sample smTables object:", smTables[0]);
      console.log("[LineageDetail filteredBy] smTables properties:", Object.keys(smTables[0]));
    }

    // Build lookup map: table ID -> table name
    const tableIdToName = new Map<string, string>();
    smTables.forEach((table: any, idx: number) => {
      if (table.model_id === nodeModelId) {
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
    if (tableIdToName.size === 0 && dimensions.smColumns) {
      console.log("[LineageDetail] Table ID->name map empty, attempting column-based matching...");
      
      const smColumns = Array.isArray(dimensions.smColumns) ? dimensions.smColumns : [];
      
      // Debug: log sample column object
      if (smColumns.length > 0) {
        console.log("[LineageDetail] Sample smColumns object:", smColumns[0]);
        console.log("[LineageDetail] smColumns properties:", Object.keys(smColumns[0]));
        console.log("[LineageDetail] Total columns:", smColumns.length);
      }
      
      const columnToTable = new Map<string, string>(); // column_id -> table_name
      
      smColumns.forEach((col: any, idx: number) => {
        if (col.model_id === nodeModelId) {
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
        if (rel.model_id === nodeModelId) {
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
      });
      
      console.log("[LineageDetail] After column-based matching, table ID->name map size:", tableIdToName.size);
    }

    // Build a map of filtering relationships: table -> tables that filter it
    const filteringMap = new Map<string, Set<string>>();
    
    // Debug: log sample relationship to see actual property names
    if (smRelationships.length > 0) {
      console.log("[LineageDetail] Sample relationship object:", smRelationships[0]);
      console.log("[LineageDetail] Relationship properties:", Object.keys(smRelationships[0]));
    }
    
    let activeRelCount = 0;
    let matchingFilterCount = 0;
    
    smRelationships.forEach((rel: any) => {
      // Debug first few relationships
      if (activeRelCount < 3) {
        console.log("[LineageDetail] Processing relationship:", {
          name: rel.name,
          model_id: rel.model_id,
          fromtable: rel.fromtable,
          totable: rel.totable,
          isactive: rel.isactive,
          crossfilteringbehavior: rel.crossfilteringbehavior,
          tocardinality: rel.tocardinality,
          allProps: Object.keys(rel)
        });
      }
      
      if (rel.model_id !== nodeModelId) return;

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
        
        const fromLookupSuccess = tableIdToName.has(fromTableId);
        const toLookupSuccess = tableIdToName.has(toTableId);
        
        if (matchingFilterCount <= 3) {
          console.log(`[LineageDetail filteredBy] Matching filtering relationship #${matchingFilterCount}:`, {
            fromTableId,
            toTableId,
            fromTableName,
            toTableName,
            fromLookupSuccess,
            toLookupSuccess,
            crossFilterDir,
            toCard
          });
        }
        
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
      tablesToCheck.add(selectedNode.tableName);
      console.log("[LineageDetail] Checking table:", selectedNode.tableName);
    } else if (selectedNode.entityType === "column" || selectedNode.entityType === "measure") {
      // For columns/measures, inherit filtering from their parent table
      if (selectedNode.tableName) {
        tablesToCheck.add(selectedNode.tableName);
        console.log("[LineageDetail] Column/Measure inheriting filtering from parent table:", selectedNode.tableName);
      }
      
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
              tablesToCheck.add(depNode.tableName);
              console.log("[LineageDetail] Adding dependent table:", depNode.tableName);
            }
            // If this node depends on a column/measure, check their parent table too
            else if ((depNode.entityType === "column" || depNode.entityType === "measure") && depNode.tableName) {
              tablesToCheck.add(depNode.tableName);
              console.log("[LineageDetail] Adding parent table of dependent column/measure:", depNode.tableName);
            }
            
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
      } else {
        console.log(`[LineageDetail] Table "${tableName}" has no filters`);
      }
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
        if (!node) {
          console.log(`[LineageDetail] Could not find node for table "${tableName}" with ID "${tableNodeId}"`);
        }
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
    if (!selectedNode || selectedNode.entityType !== "table" || !dimensions?.smRelationships) {
      return { asFrom: [], asTo: [] };
    }

    const smRelationships = Array.isArray(dimensions.smRelationships) ? dimensions.smRelationships : [];
    const smTables = Array.isArray(dimensions.smTables) ? dimensions.smTables : [];
    const nodeModelId = selectedNode.datasetId;
    const tableName = selectedNode.tableName || selectedNode.displayName;

    if (!nodeModelId) {
      return { asFrom: [], asTo: [] };
    }

    // Debug: log sample table object to see structure
    if (smTables.length > 0) {
      console.log("[LineageDetail] Sample smTables object:", smTables[0]);
      console.log("[LineageDetail] smTables properties:", Object.keys(smTables[0]));
      console.log("[LineageDetail] Total tables:", smTables.length);
    }

    // Build lookup map: table ID -> table name
    // NOTE: smTables may not have table_id, we need to check what field contains the GUID
    const tableIdToName = new Map<string, string>();
    const tableNameToId = new Map<string, string>();
    
    smTables.forEach((table: any, idx: number) => {
      if (table.model_id === nodeModelId) {
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
    });

    console.log("[LineageDetail] Table ID lookup map size:", tableIdToName.size);
    if (tableIdToName.size > 0) {
      console.log("[LineageDetail] Sample table mappings:", 
        Array.from(tableIdToName.entries()).slice(0, 5)
      );
    }

    // If direct table ID mapping failed and we have columns, try column-based matching
    if (tableIdToName.size === 0 && dimensions.smColumns) {
      console.log("[LineageDetail relationships] Table ID->name map empty, attempting column-based matching...");
      
      const smColumns = Array.isArray(dimensions.smColumns) ? dimensions.smColumns : [];
      
      // Debug: log sample column object
      if (smColumns.length > 0) {
        console.log("[LineageDetail relationships] Sample smColumns object:", smColumns[0]);
        console.log("[LineageDetail relationships] smColumns properties:", Object.keys(smColumns[0]));
        console.log("[LineageDetail relationships] Total columns:", smColumns.length);
      }
      
      const columnToTable = new Map<string, string>(); // column_id -> table_name
      
      smColumns.forEach((col: any, idx: number) => {
        if (col.model_id === nodeModelId) {
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
        if (rel.model_id === nodeModelId) {
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
      });
      
      console.log("[LineageDetail relationships] After column-based matching, table ID->name map size:", tableIdToName.size);
    }

    const asFrom: any[] = [];
    const asTo: any[] = [];

    smRelationships.forEach((rel: any, idx: number) => {
      if (rel.model_id !== nodeModelId) return;

      // Get table IDs (these are GUIDs)
      const fromTableId = rel.fromtable || rel.from_table;
      const toTableId = rel.totable || rel.to_table;

      // Look up actual table names
      const fromTableName = tableIdToName.get(fromTableId) || fromTableId;
      const toTableName = tableIdToName.get(toTableId) || toTableId;
      
      const fromLookupSuccess = tableIdToName.has(fromTableId);
      const toLookupSuccess = tableIdToName.has(toTableId);

      if (idx < 3) {
        console.log(`[LineageDetail] Processing relationship #${idx}:`, {
          name: rel.name,
          fromTableId,
          toTableId,
          fromTableName,
          toTableName,
          fromLookupSuccess,
          toLookupSuccess,
          isactive: rel.isactive,
          crossfilteringbehavior: rel.crossfilteringbehavior,
          fromcardinality: rel.fromcardinality,
          tocardinality: rel.tocardinality,
          currentTableName: tableName
        });
      }

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
    });

    console.log("[LineageDetail] Table relationships computed:", {
      tableName,
      asFromCount: asFrom.length,
      asToCount: asTo.length
    });

    return { asFrom, asTo };
  }, [selectedNode, dimensions]);

  // Update relations with filteredBy data
  const relationsWithFilteredBy = useMemo(() => {
    const result = {
      ...relations,
      filteredBy: { label: t("LineageDetail_FilteredBy", "Filtered by"), nodes: filteredByRelations },
    };
    
    console.log("[LineageDetail] relationsWithFilteredBy computed:", {
      hasFilteredBy: !!result.filteredBy,
      filteredByCount: result.filteredBy?.nodes?.length || 0,
      filteredByLabel: result.filteredBy?.label
    });
    
    return result;
  }, [relations, filteredByRelations, t]);

  const rel = relationsWithFilteredBy;

  // Helper function to render connection items with expand capability
  const renderConnectionItem = (node: LineageViewerNode, depth: number = 0) => {
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
            <span className={styles.connectionItemName} title={node.displayName}>
              {node.displayName}
            </span>
            {node.tableName && (
              <span className={styles.connectionItemSubLabel}>{node.tableName}</span>
            )}
          </button>
        </div>
        
        {/* Expanded downstream items */}
        {isExpanded && downstream.length > 0 && (
          <div style={{ marginTop: tokens.spacingVerticalXXS }}>
            {downstream.map(downstreamNode => renderConnectionItem(downstreamNode, depth + 1))}
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

      {/* ── Connected elements ── */}
      {(nodeEdges.incoming.length > 0 || nodeEdges.outgoing.length > 0) && (
        <Accordion className={styles.accordionPanel} collapsible>
          <AccordionItem value="connected-elements">
            <AccordionHeader>
              <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS }}>
                <Text weight="semibold">{t("LineageDetail_ConnectedElements", "Connected Elements")}</Text>
                <Badge>{nodeEdges.incoming.length + nodeEdges.outgoing.length}</Badge>
              </div>
            </AccordionHeader>
            <AccordionPanel>
              <div className={styles.accordionContent}>
          {nodeEdges.outgoing.length > 0 && (
            <div className={styles.connectionGroup}>
              <div className={styles.connectionGroupLabel}>{t("LineageDetail_IncomingConnections", "Incoming ({count})", { count: nodeEdges.outgoing.length })}</div>
              {nodeEdges.outgoing.map((edge, index) => {
                const node = nodeById.get(edge.toNodeId);
                if (!node) return null;
                return (
                  <button
                    key={`incoming-${edge.edgeId}-${index}`}
                    className={styles.connectionItem}
                    onClick={() => onNodeSelect?.(node.nodeId)}
                  >
                    <span className={styles.connectionItemName}>{node.displayName}</span>
                    <Badge size="small" appearance="outline">{edge.edgeType}</Badge>
                  </button>
                );
              })}
            </div>
          )}
          {nodeEdges.incoming.length > 0 && (
            <div className={styles.connectionGroup}>
              <div className={styles.connectionGroupLabel}>{t("LineageDetail_OutgoingConnections", "Outgoing ({count})", { count: nodeEdges.incoming.length })}</div>
              {nodeEdges.incoming.map((edge, index) => {
                const node = nodeById.get(edge.fromNodeId);
                if (!node) return null;
                return (
                  <button
                    key={`outgoing-${edge.edgeId}-${index}`}
                    className={styles.connectionItem}
                    onClick={() => onNodeSelect?.(node.nodeId)}
                  >
                    <span className={styles.connectionItemName}>{node.displayName}</span>
                    <Badge size="small" appearance="outline">{edge.edgeType}</Badge>
                  </button>
                );
              })}
            </div>
          )}
              </div>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      )}

      {/* ── Main properties card ── */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>{t("LineageDetail_SelectedInfo", "Selected info")}</div>
        <div className={styles.badgeList}>
          {selectedInfoCards.map((card, idx) => (
            <React.Fragment key={card.key}>
              <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXXS }}>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>{card.label}:</Text>
                <Text size={200} weight="semibold" title={card.value}>
                  {card.value}
                </Text>
              </div>
              {idx < selectedInfoCards.length - 1 && <span className={styles.badgeSeparator}>•</span>}
            </React.Fragment>
          ))}
        </div>
      </div>

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



      {/* ── Connection Depth Toggle ── */}
      {(rel.usedBy.nodes.length > 0 || rel.uses.nodes.length > 0) && (
        <div className={styles.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalS }}>
            <div>
              <Text weight="semibold" size={300}>{t("LineageDetail_ConnectionDepth", "Connection Depth")}</Text>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginTop: tokens.spacingVerticalXXS, display: "block" }}>
                {showAllConnections 
                  ? t("LineageDetail_ShowingAll", "Showing all transitive upstream/downstream dependencies")
                  : t("LineageDetail_ShowingDirect", "Showing only direct connections")}
              </Text>
            </div>
            <Switch
              checked={showAllConnections}
              onChange={(_, data) => setShowAllConnections(data.checked)}
              label={t("LineageDetail_ShowAll", "Show all")}
            />
          </div>
        </div>
      )}

      {/* ── Direct neighbors list (always visible) ── */}
      {rel.directNeighbors.nodes.length > 0 && (
        <Accordion className={styles.accordionPanel} collapsible>
          <AccordionItem value="direct-neighbors">
            <AccordionHeader>
              <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS }}>
                <Text weight="semibold">
                  {showAllConnections 
                    ? t("LineageDetail_AllConnections", "All connections") 
                    : t("LineageDetail_DirectConnections", "Direct connections")}
                </Text>
                <Badge>{rel.directNeighbors.nodes.length}</Badge>
              </div>
            </AccordionHeader>
            <AccordionPanel>
              <div className={styles.accordionContent}>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalS, padding: tokens.spacingHorizontalM }}>
                {showAllConnections
                  ? t("LineageDetail_AllConnectionsHint", "All transitive upstream and downstream dependencies. Click to navigate.")
                  : t("LineageDetail_ConnectionsHint", "Click a node to navigate to it in the graph")}
              </Text>
          
          {(() => {
            const grouped = new Map<string, LineageViewerNode[]>();
            for (const n of rel.directNeighbors.nodes) {
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

      {/* ── Used by list (incoming dependencies) ── */}
      {rel.usedBy && rel.usedBy.nodes.length > 0 && (
        <Accordion className={styles.accordionPanel} collapsible>
          <AccordionItem value="used-by">
            <AccordionHeader>
              <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS }}>
                <Text weight="semibold">{rel.usedBy.label}</Text>
                <Badge>{rel.usedBy.nodes.length}</Badge>
              </div>
            </AccordionHeader>
            <AccordionPanel>
              <div className={styles.accordionContent}>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalS, padding: tokens.spacingHorizontalM }}>
                {showAllConnections
                  ? t("LineageDetail_AllUsedByHint", "All nodes that transitively depend on or reference this node")
                  : t("LineageDetail_UsedByHint", "Nodes that depend on or reference this node")}
              </Text>
          
          {(() => {
            const grouped = new Map<string, LineageViewerNode[]>();
            for (const n of rel.usedBy.nodes) {
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

      {/* ── Uses list (outgoing dependencies) ── */}
      {rel.uses && rel.uses.nodes.length > 0 && (
        <Accordion className={styles.accordionPanel} collapsible>
          <AccordionItem value="uses">
            <AccordionHeader>
              <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS }}>
                <Text weight="semibold">{rel.uses.label}</Text>
                <Badge>{rel.uses.nodes.length}</Badge>
              </div>
            </AccordionHeader>
            <AccordionPanel>
              <div className={styles.accordionContent}>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalS, padding: tokens.spacingHorizontalM }}>
                {showAllConnections
                  ? t("LineageDetail_AllUsesHint", "All nodes that this node transitively depends on or references")
                  : t("LineageDetail_UsesHint", "Nodes that this node depends on or references")}
              </Text>
          
          {(() => {
            const grouped = new Map<string, LineageViewerNode[]>();
            for (const n of rel.uses.nodes) {
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
