import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Button,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ArrowRight16Regular, Add16Regular } from "@fluentui/react-icons";
import { LineageViewerEdge, LineageViewerNode } from "./LineageGraphView";
import type { Requirement } from "../RequirementBoardItem";
import { RequirementDialog } from "../RequirementBoardItem";

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  root: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    overflowY: "auto",
    height: "100%",
    fontFamily: "var(--fontFamilyBase, 'Segoe UI', sans-serif)",
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

  // ── Object card ──────────────────────────────────────────────────────────
  card: {
    background: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
  },
  cardTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    marginBottom: "2px",
  },

  // ── Property grid ────────────────────────────────────────────────────────
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    "@media (max-width: 1300px)": {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    },
  },
  fieldWide: {
    gridColumn: "1 / -1",
  },
  fieldLabel: {
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "2px",
  },
  fieldValue: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    wordBreak: "break-word",
  },
  fieldMuted: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    fontStyle: "italic",
  },

  // ── Metric chip ──────────────────────────────────────────────────────────
  metricChip: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalXS}`,
    background: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: "pointer",
    userSelect: "none",
  },
  metricValue: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorBrandForeground1,
  },
  metricLabel: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
  },
  infoCardsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalXS}`,
    "@media (max-width: 1300px)": {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    },
  },
  infoCardButton: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: "2px",
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground1,
    cursor: "default",
    textAlign: "left",
  },
  infoCardLabel: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    fontWeight: tokens.fontWeightSemibold,
  },
  infoCardPreview: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitLineClamp: "2",
    WebkitBoxOrient: "vertical",
    lineHeight: "1.25",
    minHeight: "2.5em",
  },

  // ── Related panel ────────────────────────────────────────────────────────
  relatedPanel: {
    background: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: "hidden",
  },
  relatedPanelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground2,
  },
  relatedGroup: {
    display: "flex",
    flexDirection: "column",
  },
  relatedGroupLabel: {
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalM}`,
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: tokens.colorNeutralForeground3,
    background: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  relatedItem: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    cursor: "pointer",
    userSelect: "none",
    background: "transparent",
    border: "none",
    width: "100%",
    textAlign: "left",
  },
  relatedItemSelected: {
    background: "var(--colorBrandBackground2, #cce4f6)",
  },
  relatedItemName: {
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightMedium,
    color: tokens.colorNeutralForeground1,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  relatedItemSub: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
  },
  // ── Section divider ───────────────────────────────────────────────────────
  divider: {
    height: "1px",
    background: tokens.colorNeutralStroke2,
    margin: `${tokens.spacingVerticalXS} 0`,
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEntityTypeLabel(entityType: string): string {
  const labels: Record<string, string> = {
    report: "Reports",
    visual: "Visuals",
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
  requirementsCount,
  onOpenRequirementsBoard,
  onCreateRequirement,
  onNodeSelect,
}: LineageDetailViewProps) {
  const { t } = useTranslation();
  const styles = useStyles();

  const [activeMetric, setActiveMetric] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

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
      case "measure":
        return [
          { label: t("LineageDetail_Table", "Table"), value: selectedNode.tableName },
          { label: t("LineageDetail_ObjectName", "Object"), value: selectedNode.objectName },
          { label: t("LineageDetail_Format", "Format"), value: selectedNode.formatString },
          { label: t("LineageDetail_Expression", "Expression"), value: selectedNode.expression ?? inferredExpression },
          { label: t("LineageDetail_DataType", "Data type"), value: selectedNode.dataType },
          ...common,
        ];
      case "column":
        return [
          { label: t("LineageDetail_Table", "Table"), value: selectedNode.tableName },
          { label: t("LineageDetail_ObjectName", "Object"), value: selectedNode.objectName },
          { label: t("LineageDetail_DataType", "Data type"), value: selectedNode.dataType },
          { label: t("LineageDetail_Format", "Format"), value: selectedNode.formatString },
          { label: t("LineageDetail_Expression", "Expression"), value: selectedNode.expression ?? inferredExpression },
          ...common,
        ];
      case "visual":
        return [
          { label: t("LineageDetail_VisualType", "Visual type"), value: selectedNode.visualType },
          { label: t("LineageDetail_ReportId", "Report ID"), value: selectedNode.reportId },
          ...common,
        ];
      case "report":
        return [
          { label: t("LineageDetail_ReportId", "Report ID"), value: selectedNode.reportId },
          ...common,
        ];
      case "table":
        return [
          { label: t("LineageDetail_Table", "Table"), value: selectedNode.tableName ?? selectedNode.displayName },
          { label: t("LineageDetail_ObjectName", "Object"), value: selectedNode.objectName },
          ...common,
        ];
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
        .filter((field) => !!field.value)
        .map((field, index) => ({
          key: `meta-${index}-${field.label}`,
          label: field.label,
          value: field.value!,
        })),
    ];
  }, [selectedNode, typeSpecificFields, t]);

  const nodeEdges = useMemo(() => {
    if (!selectedNodeId) return { incoming: [] as LineageViewerEdge[], outgoing: [] as LineageViewerEdge[] };
    return {
      incoming: edges.filter((e) => e.toNodeId === selectedNodeId),
      outgoing: edges.filter((e) => e.fromNodeId === selectedNodeId),
    };
  }, [selectedNodeId, edges]);

  // Classify related nodes by relationship category
  const relations = useMemo(() => {
    if (!selectedNode) return {};

    const neighborsOf = (edgeList: LineageViewerEdge[], side: "from" | "to") =>
      edgeList
        .map((e) => nodeById.get(side === "from" ? e.fromNodeId : e.toNodeId))
        .filter((n): n is LineageViewerNode => n !== undefined);

    const incoming = neighborsOf(nodeEdges.incoming, "from");
    const outgoing = neighborsOf(nodeEdges.outgoing, "to");
    const all = [...incoming, ...outgoing];

    const byType = (type: string) => all.filter((n) => n.entityType === type);

    return {
      connectedColumns: { label: t("LineageDetail_Columns", "Connected columns"), nodes: byType("column") },
      connectedMeasures: { label: t("LineageDetail_Measures", "Connected measures"), nodes: byType("measure") },
      connectedVisuals: { label: t("LineageDetail_Visuals", "Connected visuals"), nodes: byType("visual") },
      connectedReports: { label: t("LineageDetail_Reports", "Connected reports"), nodes: byType("report") },
      directNeighbors: { label: t("LineageDetail_Neighbors", "All direct neighbors"), nodes: all },
    };
  }, [selectedNode, nodeEdges, nodeById, t]);

  // Active related list based on clicked metric chip
  const activeRelated = activeMetric && (relations as any)[activeMetric];
  const activeRelatedGroups = useMemo(() => {
    if (!activeRelated) return [];
    const grouped = new Map<string, LineageViewerNode[]>();
    for (const n of activeRelated.nodes) {
      if (!grouped.has(n.entityType)) grouped.set(n.entityType, []);
      grouped.get(n.entityType)!.push(n);
    }
    return Array.from(grouped.entries()).map(([entityType, nodes]) => ({ entityType, nodes }));
  }, [activeRelated]);

  if (!selectedNode) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>
          {t("LineageWorkbench_Detail_NoSelection", "Select a node in the graph or table to view details")}
        </div>
      </div>
    );
  }

  function MetricChip({
    label,
    count,
    metricKey,
  }: {
    label: string;
    count: number;
    metricKey: string;
  }) {
    const isActive = activeMetric === metricKey;
    return (
      <div
        className={styles.metricChip}
        style={isActive ? {
          backgroundColor: "var(--colorPaletteLavenderBackground2, #f0e8ff)",
          borderColor: "var(--colorPaletteLavenderBorderActive, #6b4eff)",
        } : undefined}
        onClick={() => setActiveMetric(isActive ? null : metricKey)}
        title={`Click to see ${label}`}
      >
        <div className={styles.metricValue}>{count}</div>
        <div className={styles.metricLabel}>{label}</div>
      </div>
    );
  }

  const rel = relations as {
    connectedColumns: { label: string; nodes: LineageViewerNode[] };
    connectedMeasures: { label: string; nodes: LineageViewerNode[] };
    connectedVisuals: { label: string; nodes: LineageViewerNode[] };
    connectedReports: { label: string; nodes: LineageViewerNode[] };
    directNeighbors: { label: string; nodes: LineageViewerNode[] };
  };

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

      {/* ── Main properties card ── */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>{t("LineageDetail_SelectedObject", "Selected object info")}</div>
        <div className={styles.infoCardsGrid}>
          {selectedInfoCards.map((card) => (
            <div key={card.key} className={styles.infoCardButton} title={card.value}>
              <span className={styles.infoCardLabel}>{card.label}</span>
              <span className={styles.infoCardPreview}>{card.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Entity-type metrics grid ── */}
      <div className={styles.grid}>
        {(selectedNode.entityType === "measure" || selectedNode.entityType === "visual") && (
          <MetricChip label={rel.connectedColumns.label} count={rel.connectedColumns.nodes.length} metricKey="connectedColumns" />
        )}
        {(selectedNode.entityType === "visual" || selectedNode.entityType === "column" || selectedNode.entityType === "table") && (
          <MetricChip label={rel.connectedMeasures.label} count={rel.connectedMeasures.nodes.length} metricKey="connectedMeasures" />
        )}
        {(selectedNode.entityType === "report" || selectedNode.entityType === "measure") && (
          <MetricChip label={rel.connectedVisuals.label} count={rel.connectedVisuals.nodes.length} metricKey="connectedVisuals" />
        )}
        {selectedNode.entityType === "visual" && (
          <MetricChip label={rel.connectedReports.label} count={rel.connectedReports.nodes.length} metricKey="connectedReports" />
        )}
        <MetricChip label={rel.directNeighbors.label} count={rel.directNeighbors.nodes.length} metricKey="directNeighbors" />
      </div>

      {/* ── Edge type breakdown ── */}
      {(nodeEdges.incoming.length > 0 || nodeEdges.outgoing.length > 0) && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>{t("LineageDetail_EdgeTypes", "Dependency types")}</div>
          <div className={styles.grid}>
            {Array.from(
              new Set([...nodeEdges.incoming, ...nodeEdges.outgoing].map((e) => e.edgeType))
            ).map((edgeType) => (
              <div key={edgeType}>
                <div className={styles.fieldLabel}>{edgeType.replace(/_/g, " ")}</div>
                <Badge appearance="outline" size="small" color="informative">
                  {[...nodeEdges.incoming, ...nodeEdges.outgoing].filter((e) => e.edgeType === edgeType).length}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Related nodes panel (shown when a metric chip is active) ── */}
      {activeRelated && activeRelated.nodes.length > 0 && (
        <div className={styles.relatedPanel}>
          <div className={styles.relatedPanelHeader}>
            <div>
              <Text weight="semibold" size={300}>{activeRelated.label}</Text>
              <br />
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                {t("LineageDetail_RelatedHint", "Click a node to navigate to it")}
              </Text>
            </div>
            <Badge appearance="tint" size="medium">{activeRelated.nodes.length}</Badge>
          </div>

          {activeRelatedGroups.map((group) => (
            <div key={group.entityType} className={styles.relatedGroup}>
              <div className={styles.relatedGroupLabel}>
                {getEntityTypeLabel(group.entityType)} ({group.nodes.length})
              </div>
              {group.nodes.map((node) => (
                <button
                  key={node.nodeId}
                  type="button"
                  className={`${styles.relatedItem}${node.nodeId === selectedNodeId ? ` ${styles.relatedItemSelected}` : ""}`}
                  onClick={() => onNodeSelect?.(node.nodeId)}
                >
                  <span className={styles.relatedItemName} title={node.displayName}>
                    {node.displayName}
                  </span>
                  {node.tableName && (
                    <span className={styles.relatedItemSub}>{node.tableName}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
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
