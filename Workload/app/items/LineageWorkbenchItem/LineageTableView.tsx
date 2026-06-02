
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Text, makeStyles, tokens, RadioGroup, Radio, Input } from "@fluentui/react-components";
import { ChevronDownRegular, ChevronRightRegular, SearchRegular } from "@fluentui/react-icons";

const useStyles = makeStyles({
  root: {
    padding: tokens.spacingVerticalL,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
    height: "100%",
    overflow: "auto",
  },
  searchBox: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
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
    parentNodeId?: string;
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
  const [searchQuery, setSearchQuery] = useState("");
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
      parentNodeId?: string;
      depth?: number;
      reportId?: string;
      datasetId?: string;
      modelName?: string;
      objectName?: string;
    }
    
    // Filter nodes based on search query
    const query = searchQuery.toLowerCase().trim();
    const filteredNodes = query
      ? nodes.filter(n =>
          n.displayName.toLowerCase().includes(query) ||
          n.entityType.toLowerCase().includes(query)
        )
      : nodes;
    
    if (groupingMode === "type") {
      // Group by entityType
      const typeMap = new Map<string, GroupedItem[]>();
      for (const node of filteredNodes) {
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
      const nodeById = new Map(filteredNodes.map((node) => [node.nodeId, node]));
      const childrenByParentId = new Map<string, GroupedItem[]>();

      for (const node of filteredNodes) {
        if (!node.parentNodeId) {
          continue;
        }
        if (!childrenByParentId.has(node.parentNodeId)) {
          childrenByParentId.set(node.parentNodeId, []);
        }
        childrenByParentId.get(node.parentNodeId)!.push(node);
      }

      const roots = filteredNodes.filter((node) => !node.parentNodeId || !nodeById.has(node.parentNodeId));
      const typePriority = new Map<string, number>([
        ["report", 0],
        ["semantic_model", 1],
        ["page", 2],
        ["table", 3],
      ]);
      roots.sort((a, b) => {
        const pA = typePriority.get(a.entityType) ?? 9;
        const pB = typePriority.get(b.entityType) ?? 9;
        if (pA !== pB) return pA - pB;
        return a.displayName.localeCompare(b.displayName);
      });

      const flattenHierarchy = (rootNode: GroupedItem): GroupedItem[] => {
        const output: GroupedItem[] = [];
        const walk = (current: GroupedItem, depth: number): void => {
          output.push({ ...current, depth });
          const children = [...(childrenByParentId.get(current.nodeId) ?? [])].sort((a, b) => a.displayName.localeCompare(b.displayName));
          for (const child of children) {
            walk(child, depth + 1);
          }
        };
        walk(rootNode, 0);
        return output;
      };

      return roots.map((rootNode) => ({
        groupType: rootNode.entityType,
        groupId: rootNode.nodeId,
        groupDisplayName: rootNode.displayName,
        nodes: flattenHierarchy(rootNode),
      }));
    }
  }, [nodes, groupingMode, searchQuery]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(groupedNodes.map((group) => group.groupId))
  );
  
  const [collapsedSecondLevelNodes, setCollapsedSecondLevelNodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCollapsedGroups(new Set(groupedNodes.map((group) => group.groupId)));
  }, [groupedNodes]);

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
  
  const toggleSecondLevelNode = (nodeId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setCollapsedSecondLevelNodes((previous) => {
      const next = new Set(previous);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
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
      <div className={styles.searchBox}>
        <SearchRegular style={{ color: tokens.colorNeutralForeground3 }} />
        <Input
          placeholder={t("LineageWorkbench_SearchPlaceholder", "Search nodes...")}
          value={searchQuery}
          onChange={(_, data) => setSearchQuery(data.value)}
          style={{ flex: 1 }}
        />
        {searchQuery && (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {groupedNodes.reduce((sum, g) => sum + g.nodes.length, 0)} result{groupedNodes.reduce((sum, g) => sum + g.nodes.length, 0) !== 1 ? 's' : ''}
          </Text>
        )}
      </div>
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
                  : group.groupType === "semantic_model"
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
            const isParentNode = idx === 0;
            const indentDepth = node.depth ?? 0;
            
            // Determine if this node has children (next node has greater depth)
            const nextNode = group.nodes[idx + 1];
            const hasChildren = nextNode && (nextNode.depth ?? 0) > indentDepth;
            const isCollapsed = collapsedSecondLevelNodes.has(node.nodeId);
            
            // Skip rendering if this node's parent is collapsed
            if (indentDepth > 0) {
              // Find the parent by looking backwards for a node with depth = indentDepth - 1
              for (let i = idx - 1; i >= 0; i--) {
                const potentialParent = group.nodes[i];
                const parentDepth = potentialParent.depth ?? 0;
                if (parentDepth === indentDepth - 1) {
                  // This is the direct parent
                  if (collapsedSecondLevelNodes.has(potentialParent.nodeId)) {
                    return null; // Skip rendering this node
                  }
                  break;
                } else if (parentDepth < indentDepth - 1) {
                  // We've gone too far back, no direct parent found
                  break;
                }
              }
            }

            return (
              <div
                key={node.nodeId}
                className={`${styles.row} ${selectedNodeId && node.nodeId === selectedNodeId ? styles.selectedRow : ""}`}
                onClick={() => onNodeSelect?.(node.nodeId)}
                style={indentDepth > 0 ? { paddingLeft: `calc(${tokens.spacingHorizontalM} + ${indentDepth * 20}px)` } : undefined}
              >
                <div className={styles.nameCell}>
                  <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXXS }}>
                    {hasChildren && (
                      <span
                        onClick={(e) => toggleSecondLevelNode(node.nodeId, e)}
                        style={{ cursor: "pointer", display: "flex", alignItems: "center" }}
                      >
                        {isCollapsed ? (
                          <ChevronRightRegular fontSize={14} />
                        ) : (
                          <ChevronDownRegular fontSize={14} />
                        )}
                      </span>
                    )}
                    {!hasChildren && <span style={{ width: "14px" }} />}
                    <Text className={styles.nodeName}>{node.displayName}</Text>
                  </div>
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
