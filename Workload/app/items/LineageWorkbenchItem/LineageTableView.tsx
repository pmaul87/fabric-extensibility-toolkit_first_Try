import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Text, makeStyles, tokens } from "@fluentui/react-components";

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
      {nodes.map((node) => (
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
    </div>
  );
}
