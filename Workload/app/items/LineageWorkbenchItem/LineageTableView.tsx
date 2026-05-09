import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Text, makeStyles, tokens } from "@fluentui/react-components";
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
  groupLabel: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    textTransform: "uppercase",
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
  nodes: Array<{ nodeId: string; displayName: string; entityType: string }>;
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
    const groups = new Map<string, Array<{ nodeId: string; displayName: string; entityType: string }>>();
    for (const node of nodes) {
      const key = node.entityType || "unknown";
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(node);
    }

    return Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([entityType, grouped]) => ({
        entityType,
        nodes: [...grouped].sort((a, b) => a.displayName.localeCompare(b.displayName)),
      }));
  }, [nodes]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(groupedNodes.map((group) => group.entityType))
  );

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
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
      <div className={styles.tableHeader}>
        <Text className={styles.headerCell}>{t("LineageWorkbench_Lineage_Column_Name", "Node")}</Text>
        <Text className={styles.headerCell}>{t("LineageWorkbench_Lineage_Column_Type", "Type")}</Text>
        <Text className={styles.headerCell}>{t("LineageWorkbench_Lineage_Column_Connections", "Connections")}</Text>
      </div>
      {groupedNodes.map((group) => (
        <React.Fragment key={group.entityType}>
          <div
            className={styles.groupHeader}
            onClick={() => toggleGroup(group.entityType)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleGroup(group.entityType);
              }
            }}
            role="button"
            tabIndex={0}
            aria-expanded={!collapsedGroups.has(group.entityType)}
          >
            <div className={styles.groupHeaderLeft}>
              {collapsedGroups.has(group.entityType) ? (
                <ChevronRightRegular fontSize={14} />
              ) : (
                <ChevronDownRegular fontSize={14} />
              )}
              <Text className={styles.groupLabel}>{group.entityType}</Text>
            </div>
            <div className={styles.groupHeaderRight}>
              <Badge appearance="tint" size="small">{group.nodes.length}</Badge>
            </div>
          </div>
          {!collapsedGroups.has(group.entityType) && group.nodes.map((node) => (
            <div
              key={node.nodeId}
              className={`${styles.row} ${selectedNodeId && node.nodeId === selectedNodeId ? styles.selectedRow : ""}`}
              onClick={() => onNodeSelect?.(node.nodeId)}
            >
              <div className={styles.nameCell}>
                <Text className={styles.nodeName}>{node.displayName}</Text>
                <Text className={styles.nodeId}>{node.nodeId}</Text>
              </div>
              <Badge appearance="outline" color="informative">
                {node.entityType}
              </Badge>
              <Text>{degreeByNode.get(node.nodeId) ?? 0}</Text>
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}
