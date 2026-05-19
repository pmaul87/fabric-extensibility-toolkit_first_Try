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

    const incoming = neighborsOf(dependencyEdgesOnly.incoming, "from");
    const outgoing = neighborsOf(dependencyEdgesOnly.outgoing, "to");
    const all = [...incoming, ...outgoing];

    const byType = (type: string) => all.filter((n) => n.entityType === type);

    return {
      connectedColumns: { label: t("LineageDetail_Columns", "Connected columns"), nodes: byType("column") },
      connectedMeasures: { label: t("LineageDetail_Measures", "Connected measures"), nodes: byType("measure") },
      connectedVisuals: { label: t("LineageDetail_Visuals", "Connected visuals"), nodes: byType("visual") },
      connectedReports: { label: t("LineageDetail_Reports", "Connected reports"), nodes: byType("report") },
      directNeighbors: { label: t("LineageDetail_Neighbors", "All direct neighbors"), nodes: all },
      usedBy: { label: t("LineageDetail_UsedBy", "Used by"), nodes: incoming },
      uses: { label: t("LineageDetail_Uses", "Uses"), nodes: outgoing },
      filteredBy: { label: t("LineageDetail_FilteredBy", "Filtered by"), nodes: [] }, // Will be populated below
    };
  }, [selectedNode, nodeEdges, nodeById, t]);

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

  // Active related list based on clicked metric chip
  const activeRelated = activeMetric && (rel as any)[activeMetric];
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

      {/* ── Dependencies card ── */}
      {(nodeEdges.incomingRelationships.length > 0 || nodeEdges.outgoingRelationships.length > 0 || 
        nodeEdges.incomingDependencies.length > 0 || nodeEdges.outgoingDependencies.length > 0) && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>{t("LineageDetail_Dependencies", "Dependencies")}</div>
          <div className={styles.grid}>
            {nodeEdges.incomingRelationships.length > 0 && (
              <div>
                <div className={styles.fieldLabel}>{t("LineageDetail_IncomingRelationships", "Incoming Relationships")}</div>
                <div className={styles.fieldValue}>{nodeEdges.incomingRelationships.length}</div>
              </div>
            )}
            {nodeEdges.outgoingRelationships.length > 0 && (
              <div>
                <div className={styles.fieldLabel}>{t("LineageDetail_OutgoingRelationships", "Outgoing Relationships")}</div>
                <div className={styles.fieldValue}>{nodeEdges.outgoingRelationships.length}</div>
              </div>
            )}
            {nodeEdges.incomingDependencies.length > 0 && (
              <div>
                <div className={styles.fieldLabel}>{t("LineageDetail_IncomingDependencies", "Used By")}</div>
                <div className={styles.fieldValue}>{nodeEdges.incomingDependencies.length}</div>
              </div>
            )}
            {nodeEdges.outgoingDependencies.length > 0 && (
              <div>
                <div className={styles.fieldLabel}>{t("LineageDetail_OutgoingDependencies", "Depends On")}</div>
                <div className={styles.fieldValue}>{nodeEdges.outgoingDependencies.length}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Connected elements ── */}
      {(nodeEdges.incoming.length > 0 || nodeEdges.outgoing.length > 0) && (
        <div className={styles.relatedPanel}>
          <div className={styles.relatedPanelHeader}>
            <Text weight="semibold">{t("LineageDetail_ConnectedElements", "Connected Elements")}</Text>
            <Badge>{nodeEdges.incoming.length + nodeEdges.outgoing.length}</Badge>
          </div>
          {nodeEdges.incoming.length > 0 && (
            <div className={styles.relatedGroup}>
              <div className={styles.relatedGroupLabel}>{t("LineageDetail_IncomingConnections", "Incoming ({count})", { count: nodeEdges.incoming.length })}</div>
              {nodeEdges.incoming.map((edge, index) => {
                const node = nodeById.get(edge.fromNodeId);
                if (!node) return null;
                return (
                  <button
                    key={`incoming-${edge.edgeId}-${index}`}
                    className={styles.relatedItem}
                    onClick={() => onNodeSelect?.(node.nodeId)}
                  >
                    <span className={styles.relatedItemName}>{node.displayName}</span>
                    <Badge size="small" appearance="outline">{edge.edgeType}</Badge>
                  </button>
                );
              })}
            </div>
          )}
          {nodeEdges.outgoing.length > 0 && (
            <div className={styles.relatedGroup}>
              <div className={styles.relatedGroupLabel}>{t("LineageDetail_OutgoingConnections", "Outgoing ({count})", { count: nodeEdges.outgoing.length })}</div>
              {nodeEdges.outgoing.map((edge, index) => {
                const node = nodeById.get(edge.toNodeId);
                if (!node) return null;
                return (
                  <button
                    key={`outgoing-${edge.edgeId}-${index}`}
                    className={styles.relatedItem}
                    onClick={() => onNodeSelect?.(node.nodeId)}
                  >
                    <span className={styles.relatedItemName}>{node.displayName}</span>
                    <Badge size="small" appearance="outline">{edge.edgeType}</Badge>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

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
      {((): null => {
        console.log("[LineageDetail] Rendering metrics grid:", {
          hasRel: !!rel,
          hasFilteredBy: !!rel.filteredBy,
          filteredByCount: rel.filteredBy?.nodes?.length || 0,
          filteredByLabel: rel.filteredBy?.label,
          willShowMetricChip: !!(rel.filteredBy && rel.filteredBy.nodes.length > 0)
        });
        return null;
      })()}
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
        {rel.filteredBy && rel.filteredBy.nodes.length > 0 && (
          <MetricChip label={rel.filteredBy.label} count={rel.filteredBy.nodes.length} metricKey="filteredBy" />
        )}
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

      {/* ── Direct neighbors list (always visible) ── */}
      {rel.directNeighbors.nodes.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            {t("LineageDetail_DirectConnections", "Direct connections")} ({rel.directNeighbors.nodes.length})
          </div>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalXS }}>
            {t("LineageDetail_ConnectionsHint", "Click a node to navigate to it in the graph")}
          </Text>
          
          {(() => {
            const grouped = new Map<string, LineageViewerNode[]>();
            for (const n of rel.directNeighbors.nodes) {
              if (!grouped.has(n.entityType)) grouped.set(n.entityType, []);
              grouped.get(n.entityType)!.push(n);
            }
            return Array.from(grouped.entries()).map(([entityType, groupNodes]) => (
              <div key={entityType} className={styles.relatedGroup}>
                <div className={styles.relatedGroupLabel}>
                  {getEntityTypeLabel(entityType)} ({groupNodes.length})
                </div>
                {groupNodes.map((node) => (
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
            ));
          })()}
        </div>
      )}

      {/* ── Used by list (incoming dependencies) ── */}
      {rel.usedBy && rel.usedBy.nodes.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            {t("LineageDetail_UsedBy", "Used by")} ({rel.usedBy.nodes.length})
          </div>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalXS }}>
            {t("LineageDetail_UsedByHint", "Nodes that depend on or reference this node")}
          </Text>
          
          {(() => {
            const grouped = new Map<string, LineageViewerNode[]>();
            for (const n of rel.usedBy.nodes) {
              if (!grouped.has(n.entityType)) grouped.set(n.entityType, []);
              grouped.get(n.entityType)!.push(n);
            }
            return Array.from(grouped.entries()).map(([entityType, groupNodes]) => (
              <div key={entityType} className={styles.relatedGroup}>
                <div className={styles.relatedGroupLabel}>
                  {getEntityTypeLabel(entityType)} ({groupNodes.length})
                </div>
                {groupNodes.map((node) => (
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
            ));
          })()}
        </div>
      )}

      {/* ── Uses list (outgoing dependencies) ── */}
      {rel.uses && rel.uses.nodes.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            {t("LineageDetail_Uses", "Uses")} ({rel.uses.nodes.length})
          </div>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalXS }}>
            {t("LineageDetail_UsesHint", "Nodes that this node depends on or references")}
          </Text>
          
          {(() => {
            const grouped = new Map<string, LineageViewerNode[]>();
            for (const n of rel.uses.nodes) {
              if (!grouped.has(n.entityType)) grouped.set(n.entityType, []);
              grouped.get(n.entityType)!.push(n);
            }
            return Array.from(grouped.entries()).map(([entityType, groupNodes]) => (
              <div key={entityType} className={styles.relatedGroup}>
                <div className={styles.relatedGroupLabel}>
                  {getEntityTypeLabel(entityType)} ({groupNodes.length})
                </div>
                {groupNodes.map((node) => (
                  <button
                    key={node.nodeId}
                    type="button"
                    className={`${styles.relatedItem}${node.nodeId === selectedNodeId ? ` ${styles.relatedItemSelected}` : ""}` }
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
            ));
          })()}
        </div>
      )}

      {/* ── Filtered by list (tables that filter this table via active relationships) ── */}
      {rel.filteredBy && rel.filteredBy.nodes.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            {t("LineageDetail_FilteredBy", "Filtered by")} ({rel.filteredBy.nodes.length})
          </div>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalXS }}>
            {t("LineageDetail_FilteredByHint", "Tables that apply filters to this element or its dependencies through active relationships (BothDirections or OneDirection with ToCardinality=One)")}
          </Text>
          
          {(() => {
            const grouped = new Map<string, LineageViewerNode[]>();
            for (const n of rel.filteredBy.nodes) {
              if (!grouped.has(n.entityType)) grouped.set(n.entityType, []);
              grouped.get(n.entityType)!.push(n);
            }
            return Array.from(grouped.entries()).map(([entityType, groupNodes]) => (
              <div key={entityType} className={styles.relatedGroup}>
                <div className={styles.relatedGroupLabel}>
                  {getEntityTypeLabel(entityType)} ({groupNodes.length})
                </div>
                {groupNodes.map((node) => (
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
            ));
          })()}
        </div>
      )}

      {/* ── Table Relationships (for table nodes only) ── */}
      {selectedNode?.entityType === "table" && (tableRelationships.asFrom.length > 0 || tableRelationships.asTo.length > 0) && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            {t("LineageDetail_TableRelationships", "Relationships")} ({tableRelationships.asFrom.length + tableRelationships.asTo.length})
          </div>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalM }}>
            {t("LineageDetail_TableRelationshipsHint", "All relationships where this table participates")}
          </Text>

          {/* Relationships where this table is the FROM table */}
          {tableRelationships.asFrom.length > 0 && (
            <div style={{ marginBottom: tokens.spacingVerticalL }}>
              <div className={styles.relatedGroupLabel}>
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
              <div className={styles.relatedGroupLabel}>
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
      )}

      {/* ── Related nodes panel (shown when a metric chip is active) ── */}
      {activeRelated && activeRelated.nodes.length > 0 && activeMetric !== "directNeighbors" && activeMetric !== "usedBy" && activeMetric !== "uses" && (
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
