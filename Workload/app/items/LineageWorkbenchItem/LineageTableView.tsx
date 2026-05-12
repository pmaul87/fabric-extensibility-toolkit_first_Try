
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Text, makeStyles, tokens, RadioGroup, Radio } from "@fluentui/react-components";
import { ChevronDownRegular, ChevronRightRegular } from "@fluentui/react-icons";

const useStyles = makeStyles({
  root: {
    padding: tokens.spacingVerticalL,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
    height: "100%",
    overflow: "auto",
  },
  groupingToggle: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalM,
  },
  tableHeader: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr",
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
  groupHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    position: "sticky",
    top: "36px",
    zIndex: 1,
    cursor: "pointer",
  },
  groupHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    minWidth: 0,
  },
  groupHeaderRight: {
    display: "flex",
    alignItems: "center",
  },
  groupTypeBadge: {
    marginRight: tokens.spacingHorizontalXS,
    textTransform: "uppercase",
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase100,
    letterSpacing: "0.04em",
  },
  groupLabel: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    textTransform: "none",
    letterSpacing: "0.04em",
  },
  headerCell: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    textTransform: "uppercase",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr",
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    alignItems: "center",
    cursor: "pointer",
    transition: "background-color 0.2s",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground3,
    },
  },
  selectedRow: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  nameCell: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    minWidth: 0,
  },
  nodeName: {
    fontWeight: tokens.fontWeightSemibold,
    wordBreak: "break-word",
  },
  nodeId: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    wordBreak: "break-all",
  },
  empty: {
    padding: tokens.spacingVerticalXXL,
    textAlign: "center",
    color: tokens.colorNeutralForeground2,
  },
});

interface LineageTableViewProps {
  nodes: Array<{
    nodeId: string;
    displayName: string;
    entityType: string;
    reportId?: string;
    datasetId?: string;
    modelName?: string;
    objectName?: string;
  }>;
  edges: Array<{ fromNodeId: string; toNodeId: string }>;
  selectedNodeId?: string;
  onNodeSelect?: (nodeId: string) => void;
}

export function LineageTableView({
  nodes,
  edges,
  selectedNodeId,
  onNodeSelect,
}: LineageTableViewProps) {
  // Grouping mode: "parent" (default) or "type"
  const [groupingMode, setGroupingMode] = useState<"parent" | "type">("parent");
  const { t } = useTranslation();
  const styles = useStyles();

  const degreeByNode = useMemo(() => {
    const map = new Map<string, number>();
    for (const edge of edges) {
      const from = edge.fromNodeId || "";
      const to = edge.toNodeId || "";
      if (from) {
        map.set(from, (map.get(from) ?? 0) + 1);
      }
      if (to) {
        map.set(to, (map.get(to) ?? 0) + 1);
      }
    }
    return map;
  }, [edges]);

  const groupedNodes = useMemo(() => {
    interface GroupedItem {
      nodeId: string;
      displayName: string;
      entityType: string;
      reportId?: string;
      datasetId?: string;
      modelName?: string;
      objectName?: string;
      parentId?: string;
      parentDisplayName?: string;
    }
    
    if (groupingMode === "type") {
      // Group by entityType
      const typeMap = new Map<string, GroupedItem[]>();
      for (const node of nodes) {
        if (!typeMap.has(node.entityType)) typeMap.set(node.entityType, []);
        typeMap.get(node.entityType)!.push(node);
      }
      return Array.from(typeMap.entries()).map(([type, items]) => ({
        groupType: type,
        groupId: type,
        groupDisplayName: type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " "),
        nodes: items.sort((a, b) => a.displayName.localeCompare(b.displayName)),
      }));
    } else {
      // Group by parent (report/dataset)
      const reportNodes = new Map<string, GroupedItem[]>();
      const datasetNodes = new Map<string, GroupedItem[]>();
      const orphanNodes: GroupedItem[] = [];
      const reportNodeIdByRawId = new Map<string, string>();

      // Build mapping from raw report id -> report node id so children can resolve to real report nodes.
      for (const node of nodes) {
        if (node.entityType === "report") {
          reportNodeIdByRawId.set(node.nodeId, node.nodeId);
          if (node.reportId) {
            reportNodeIdByRawId.set(node.reportId, node.nodeId);
          }
        }
      }

      for (const node of nodes) {
        // Visuals/pages belong to reports
        if ((node.entityType === "visual" || node.entityType === "page") && node.reportId) {
          const resolvedReportGroupId = reportNodeIdByRawId.get(node.reportId) ?? node.reportId;
          if (!reportNodes.has(resolvedReportGroupId)) {
            reportNodes.set(resolvedReportGroupId, []);
          }
          reportNodes.get(resolvedReportGroupId)!.push({
            ...node,
            parentId: resolvedReportGroupId,
          });
        }
        // Tables/Columns/Measures belong to datasets
        else if ((node.entityType === "table" || node.entityType === "column" || node.entityType === "measure") && node.datasetId) {
          if (!datasetNodes.has(node.datasetId)) {
            datasetNodes.set(node.datasetId, []);
          }
          datasetNodes.get(node.datasetId)!.push({
            ...node,
            parentId: node.datasetId,
          });
        }
        // Reports and other items
        else if (node.entityType === "report") {
          if (!reportNodes.has(node.nodeId)) {
            reportNodes.set(node.nodeId, []);
          }
        }
        // Orphan nodes
        else {
          orphanNodes.push(node);
        }
      }

      const groups: Array<{
        groupType: "report" | "dataset" | "orphan";
        groupId: string;
        groupDisplayName: string;
        nodes: GroupedItem[];
      }> = [];

      // Add report groups
      for (const [reportId, reportChildren] of reportNodes.entries()) {
        const reportNode = nodes.find(n => n.nodeId === reportId);
        const reportName = reportNode?.displayName || reportChildren[0]?.objectName || reportChildren[0]?.displayName || reportId;
        if (reportNode) {
          groups.push({
            groupType: "report",
            groupId: reportId,
            groupDisplayName: reportName,
            nodes: [reportNode, ...reportChildren.sort((a, b) => a.displayName.localeCompare(b.displayName))],
          });
        } else if (reportChildren.length > 0) {
          groups.push({
            groupType: "report",
            groupId: reportId,
            groupDisplayName: reportName,
            nodes: reportChildren.sort((a, b) => a.displayName.localeCompare(b.displayName)),
          });
        }
      }

      // Add dataset groups
      for (const [datasetId, datasetChildren] of datasetNodes.entries()) {
        const modelName = datasetChildren.find((n) => n.modelName?.trim())?.modelName?.trim();
        groups.push({
          groupType: "dataset",
          groupId: datasetId,
          groupDisplayName: modelName || datasetId,
          nodes: datasetChildren.sort((a, b) => a.displayName.localeCompare(b.displayName)),
        });
      }

      // Add orphan group if there are any
      if (orphanNodes.length > 0) {
        groups.push({
          groupType: "orphan",
          groupId: "orphan",
          groupDisplayName: "Other",
          nodes: orphanNodes.sort((a, b) => a.displayName.localeCompare(b.displayName)),
        });
      }

      return groups;
    }
  }, [nodes, groupingMode]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(groupedNodes.map((group) => group.groupId))
  );

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  if (nodes.length === 0) {
    return (
      <div className={styles.empty}>
        <Text>{t("LineageWorkbench_Table_Empty", "No nodes to display")}</Text>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.groupingToggle}>
        <RadioGroup
          layout="horizontal"
          value={groupingMode}
          onChange={(_, data) => setGroupingMode(data.value as "parent" | "type")}
        >
          <Radio value="parent" label={t("LineageWorkbench_GroupByParent", "Group by Parent")} />
          <Radio value="type" label={t("LineageWorkbench_GroupByType", "Group by Type")} />
        </RadioGroup>
      </div>
      <div className={styles.tableHeader}>
        <Text className={styles.headerCell}>{t("LineageWorkbench_Lineage_Column_Name", "Node")}</Text>
        <Text className={styles.headerCell}>{t("LineageWorkbench_Lineage_Column_Type", "Type")}</Text>
        <Text className={styles.headerCell}>{t("LineageWorkbench_Lineage_Column_Connections", "Connections")}</Text>
      </div>
      {groupedNodes.map((group) => (
        <React.Fragment key={group.groupId}>
          <div
            className={styles.groupHeader}
            onClick={() => toggleGroup(group.groupId)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleGroup(group.groupId);
              }
            }}
            role="button"
            tabIndex={0}
            aria-expanded={!collapsedGroups.has(group.groupId)}
          >
            <div className={styles.groupHeaderLeft}>
              {collapsedGroups.has(group.groupId) ? (
                <ChevronRightRegular fontSize={14} />
              ) : (
                <ChevronDownRegular fontSize={14} />
              )}
              {/* Group type badge */}
              <Badge className={styles.groupTypeBadge} appearance="outline" size="small">
                {group.groupType === "report"
                  ? t("LineageWorkbench_GroupType_Report", "Report")
                  : group.groupType === "dataset"
                  ? t("LineageWorkbench_GroupType_SemanticModel", "Semantic Model")
                  : group.groupType === "orphan"
                  ? t("LineageWorkbench_GroupType_Other", "Other")
                  : group.groupType.charAt(0).toUpperCase() + group.groupType.slice(1).replace(/_/g, " ")}
              </Badge>
              <Text className={styles.groupLabel}>{group.groupDisplayName}</Text>
            </div>
            <div className={styles.groupHeaderRight}>
              <Badge appearance="tint" size="small">{group.nodes.length}</Badge>
            </div>
          </div>
          {!collapsedGroups.has(group.groupId) && group.nodes.map((node, idx) => {
            // For report groups, show parent report with special styling, then children with indent
            const isParentNode = group.groupType === "report" && idx === 0;
            const isChildNode = group.groupType === "report" && idx > 0;

            return (
              <div
                key={node.nodeId}
                className={`${styles.row} ${selectedNodeId && node.nodeId === selectedNodeId ? styles.selectedRow : ""}`}
                onClick={() => onNodeSelect?.(node.nodeId)}
                style={isChildNode ? { paddingLeft: `calc(${tokens.spacingHorizontalM} + 24px)` } : undefined}
              >
                <div className={styles.nameCell}>
                  <Text className={styles.nodeName}>{node.displayName}</Text>
                  <Text className={styles.nodeId}>{node.nodeId}</Text>
                </div>
                <Badge appearance="outline" color={isParentNode ? "important" : "informative"}>
                  {node.entityType}
                </Badge>
                <Text>{degreeByNode.get(node.nodeId) ?? 0}</Text>
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}
