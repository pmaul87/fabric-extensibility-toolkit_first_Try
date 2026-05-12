import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
  BackgroundVariant,
} from "@xyflow/react";
import type { Node, Edge, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { ChevronRightFilled } from "@fluentui/react-icons";

// ─── Lineage graph types (inlined from original LineageViewerItemDefinition) ──

export interface LineageViewerNode {
  nodeId: string;
  displayName: string;
  entityType: "report" | "page" | "visual" | "semantic_object" | "table" | "column" | "measure" | "dataflow" | "notebook" | "lakehouse" | "warehouse" | "unknown";
  datasetId?: string;
  modelName?: string;
  tableName?: string;
  objectName?: string;
  objectSubtype?: string;
  dataType?: string;
  expression?: string;
  formatString?: string;
  reportId?: string;
  visualType?: string;
  parentNodeId?: string;
  isGroupNode?: boolean;
}

export interface LineageViewerEdge {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: string;
  datasetId?: string;
  reportId?: string;
  evidence?: string;
}

// ÔöÇÔöÇÔöÇ Entity-type colour palette (Fabric CSS tokens + palette fallbacks) ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

interface EntityPalette {
  bg: string;
  border: string;
  typeLabel: string;
}

const PALETTE: Record<string, EntityPalette> = {
  report: {
    bg: "var(--colorBrandBackground2, #cce4f6)",
    border: "var(--colorBrandStroke1, #0078d4)",
    typeLabel: "Report",
  },
  page: {
    bg: "var(--colorPaletteBlueBackground2, #e7f1fb)",
    border: "var(--colorPaletteBlueBorderActive, #005a9e)",
    typeLabel: "Page",
  },
  visual: {
    bg: "var(--colorPalettePurpleBackground2, #ede8f8)",
    border: "var(--colorPalettePurpleBorderActive, #7c3aed)",
    typeLabel: "Visual",
  },
  measure: {
    bg: "var(--colorPaletteGreenBackground2, #e6f4ea)",
    border: "var(--colorPaletteGreenBorderActive, #2d7d32)",
    typeLabel: "Measure",
  },
  column: {
    bg: "var(--colorPaletteTealBackground2, #e0f2f1)",
    border: "var(--colorPaletteTealBorderActive, #00796b)",
    typeLabel: "Column",
  },
  table: {
    bg: "var(--colorPaletteMarigoldBackground2, #fff3cd)",
    border: "var(--colorPaletteMarigoldBorderActive, #c67a00)",
    typeLabel: "Table",
  },
  dataflow: {
    bg: "var(--colorPaletteBerryBackground2, #fbe5ef)",
    border: "var(--colorPaletteBerryBorderActive, #a4262c)",
    typeLabel: "Dataflow",
  },
  notebook: {
    bg: "var(--colorPaletteCornflowerBackground2, #e8efff)",
    border: "var(--colorPaletteCornflowerBorderActive, #4f6bed)",
    typeLabel: "Notebook",
  },
  lakehouse: {
    bg: "var(--colorPaletteSeafoamBackground2, #e2f3ef)",
    border: "var(--colorPaletteSeafoamBorderActive, #0f766e)",
    typeLabel: "Lakehouse",
  },
  warehouse: {
    bg: "var(--colorPaletteDarkOrangeBackground2, #ffe8d1)",
    border: "var(--colorPaletteDarkOrangeBorderActive, #b75d00)",
    typeLabel: "Warehouse",
  },
  semantic_object: {
    bg: "var(--colorPalettePeachBackground2, #fdf0e8)",
    border: "var(--colorPalettePeachBorderActive, #d4662a)",
    typeLabel: "Object",
  },
  unknown: {
    bg: "var(--colorNeutralBackground2, #f5f5f5)",
    border: "var(--colorNeutralStroke1, #bdbdbd)",
    typeLabel: "Unknown",
  },
  group: {
    bg: "var(--colorNeutralBackground1, #ffffff)",
    border: "var(--colorBrandStroke1, #0078d4)",
    typeLabel: "Group",
  },
};

const palette = (type: string): EntityPalette => PALETTE[type] ?? PALETTE.unknown;

// ÔöÇÔöÇÔöÇ Node dimensions for dagre ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

const NODE_W = 210;
const NODE_H = 64;

// ÔöÇÔöÇÔöÇ Custom node data shape ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

export interface LineageNodeData extends Record<string, unknown> {
  label: string;
  subLabel?: string;
  entityType: string;
  isFocus: boolean;
  isRelated: boolean;
  isDirectUpstream: boolean;
  isDirectDownstream: boolean;
  depth: number;
  isGroupNode?: boolean;
  isExpanded?: boolean;
  childCount?: number;
  onToggleExpanded?: (nodeId: string) => void;
}

type LineageFlowNode = Node<LineageNodeData, "lineageNode">;

// ÔöÇÔöÇÔöÇ Custom node renderer ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

function LineageNodeComponent({ data, id }: NodeProps<LineageFlowNode>) {
  const pal = palette(data.entityType);
  const isFocus = data.isFocus;
  const isRelated = data.isRelated;
  const isDirectUpstream = data.isDirectUpstream;
  const isDirectDownstream = data.isDirectDownstream;
  const isGroupNode = data.isGroupNode;
  const relatedBg = "var(--colorPaletteLavenderBackground2, #f0e8ff)";
  const relatedBorder = "var(--colorPaletteLavenderBorderActive, #6b4eff)";
  const upstreamBg = "var(--colorPaletteRedBackground2, #fde7e9)";
  const upstreamBorder = "var(--colorPaletteRedBorderActive, #d13438)";
  const downstreamBg = "var(--colorPaletteGreenBackground2, #e6f4ea)";
  const downstreamBorder = "var(--colorPaletteGreenBorderActive, #2d7d32)";
  const bidirectionalBg = "var(--colorPaletteDarkOrangeBackground2, #ffe8d1)";
  const bidirectionalBorder = "var(--colorPaletteDarkOrangeBorderActive, #b75d00)";

  const nodeBg = isFocus
    ? "var(--colorBrandBackground, #0078d4)"
    : isDirectUpstream && isDirectDownstream
      ? bidirectionalBg
      : isDirectUpstream
        ? upstreamBg
        : isDirectDownstream
          ? downstreamBg
          : isRelated
            ? relatedBg
            : pal.bg;
  const nodeBorder = isFocus
    ? "var(--colorBrandBackground, #0078d4)"
    : isDirectUpstream && isDirectDownstream
      ? bidirectionalBorder
      : isDirectUpstream
        ? upstreamBorder
        : isDirectDownstream
          ? downstreamBorder
          : isRelated
            ? relatedBorder
            : pal.border;
  const accentColor = isFocus ? "#fff" : nodeBorder;

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    data.onToggleExpanded?.(id);
  };

  return (
    <div
      style={{
        background: nodeBg,
        border: `2px solid ${nodeBorder}`,
        borderRadius: "var(--borderRadiusMedium, 6px)",
        padding: isGroupNode ? "12px" : "8px 12px",
        width: isGroupNode ? 240 : NODE_W,
        fontFamily: "var(--fontFamilyBase, 'Segoe UI', sans-serif)",
        boxShadow: isFocus
          ? "0 4px 16px rgba(0,120,212,0.35)"
          : isGroupNode
            ? "0 2px 8px rgba(0,0,0,0.1)"
            : "0 1px 4px rgba(0,0,0,0.08)",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      {isGroupNode ? (
        <>
          <Handle type="target" position={Position.Left} style={{ background: accentColor, border: "none" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
            <button
              onClick={handleExpandClick}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 20,
                height: 20,
              }}
              title={data.isExpanded ? "Collapse group" : "Expand group"}
            >
              <ChevronRightFilled
                style={{
                  color: accentColor,
                  transform: data.isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                  fontSize: 16,
                }}
              />
            </button>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: isFocus ? "rgba(255,255,255,0.75)" : accentColor,
                }}
              >
                {pal.typeLabel}
              </div>

              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: isFocus ? "#ffffff" : "var(--colorNeutralForeground1, #1a1a1a)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 160,
                }}
                title={data.label}
              >
                {data.label}
              </div>

              {data.childCount !== undefined && (
                <div
                  style={{
                    fontSize: 10,
                    color: isFocus ? "rgba(255,255,255,0.65)" : "var(--colorNeutralForeground3, #757575)",
                  }}
                >
                  {data.childCount} items
                </div>
              )}
            </div>
          </div>

          <Handle type="source" position={Position.Right} style={{ background: accentColor, border: "none" }} />
        </>
      ) : (
        <>
          <Handle type="target" position={Position.Left} style={{ background: accentColor, border: "none" }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {/* entity-type pill */}
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: isFocus ? "rgba(255,255,255,0.75)" : accentColor,
              }}
            >
              {pal.typeLabel}
            </div>

            {/* primary label */}
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: isFocus ? "#ffffff" : "var(--colorNeutralForeground1, #1a1a1a)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: NODE_W - 24,
              }}
              title={data.label}
            >
              {data.label}
            </div>

            {/* sub-label (table name) */}
            {data.subLabel && (
              <div
                style={{
                  fontSize: 11,
                  color: isFocus ? "rgba(255,255,255,0.65)" : "var(--colorNeutralForeground3, #757575)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={data.subLabel}
              >
                {data.subLabel}
              </div>
            )}
          </div>

          <Handle type="source" position={Position.Right} style={{ background: accentColor, border: "none" }} />
        </>
      )}
    </div>
  );
}

const NODE_TYPES = { lineageNode: LineageNodeComponent };

// ÔöÇÔöÇÔöÇ Dagre auto-layout ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

function buildLayout(
  lvNodes: LineageViewerNode[],
  lvEdges: LineageViewerEdge[],
  focusNodeId: string | undefined,
  depthByNodeId: Map<string, number>,
  highlightedNodeIds: Set<string>,
  highlightedEdgeIds: Set<string>,
  expandedGroups: Set<string>,
  onToggleGroup: (groupId: string) => void
): { nodes: LineageFlowNode[]; edges: Edge[] } {
  // ── Derive parent-child relationships ──────────────────────────────────────
  const childrenByParentId = new Map<string, string[]>();
  const groupNodeIds = new Set<string>();
  const syntheticGroupNodes: LineageViewerNode[] = [];

  // 1. Reports are natural group nodes
  const reportIds = new Set<string>();
  const reportNodeIdByRawId = new Map<string, string>();
  for (const node of lvNodes) {
    if (node.entityType === "report") {
      groupNodeIds.add(node.nodeId);
      reportIds.add(node.nodeId);
      reportNodeIdByRawId.set(node.nodeId, node.nodeId);
      if (node.reportId) {
        reportNodeIdByRawId.set(node.reportId, node.nodeId);
      }
    }
  }

  // 2. Create synthetic groups for semantic models (dataset-based)
  const datasetGroupIds = new Map<string, string>(); // datasetId -> groupId
  const datasetGroupNames = new Map<string, string>(); // datasetId -> model name
  const datasetsWithContent = new Set<string>();
  
  for (const node of lvNodes) {
    if ((node.entityType === "table" || node.entityType === "column" || node.entityType === "measure") && node.datasetId) {
      datasetsWithContent.add(node.datasetId);
      const candidateName = node.modelName?.trim();
      if (candidateName && !datasetGroupNames.has(node.datasetId)) {
        datasetGroupNames.set(node.datasetId, candidateName);
      }
      if (!datasetGroupIds.has(node.datasetId)) {
        const groupId = `semantic_model:${node.datasetId}`;
        datasetGroupIds.set(node.datasetId, groupId);
        groupNodeIds.add(groupId);
        const groupName = datasetGroupNames.get(node.datasetId) || `Semantic Model (${node.datasetId})`;
        
        // Create synthetic semantic model node
        syntheticGroupNodes.push({
          nodeId: groupId,
          displayName: groupName,
          entityType: "semantic_object",
          datasetId: node.datasetId,
          isGroupNode: true,
        });
      }
    }
  }

  // 3. Map children to parents
  for (const node of lvNodes) {
    let parentId: string | undefined;

    // Visuals/pages belong to Reports
    if ((node.entityType === "visual" || node.entityType === "page") && node.reportId) {
      parentId = reportNodeIdByRawId.get(node.reportId) ?? node.reportId;
    }
    // Tables/Columns/Measures belong to their Semantic Model
    else if ((node.entityType === "table" || node.entityType === "column" || node.entityType === "measure") && node.datasetId) {
      parentId = datasetGroupIds.get(node.datasetId);
    }

    if (parentId && groupNodeIds.has(parentId)) {
      if (!childrenByParentId.has(parentId)) {
        childrenByParentId.set(parentId, []);
      }
      childrenByParentId.get(parentId)!.push(node.nodeId);
      node.parentNodeId = parentId;
    }
  }

  // ── Filter visible nodes based on group expansion ──────────────────────────
  const visibleNodeIds = new Set<string>();
  const allNodes = [...lvNodes, ...syntheticGroupNodes];
  
  for (const node of allNodes) {
    // Always show real group nodes (reports, semantic_objects)
    if (groupNodeIds.has(node.nodeId) && !node.isGroupNode) {
      visibleNodeIds.add(node.nodeId);
      continue;
    }

    // Always show synthetic group nodes
    if (node.isGroupNode) {
      visibleNodeIds.add(node.nodeId);
      continue;
    }

    // Show orphan nodes (those without parents)
    if (!node.parentNodeId) {
      visibleNodeIds.add(node.nodeId);
      continue;
    }

    // Show children only if their parent group is expanded
    if (expandedGroups.has(node.parentNodeId)) {
      visibleNodeIds.add(node.nodeId);
    }
  }

  // ── Build directional highlight info ──────────────────────────────────────
  const directUpstreamNodeIds = new Set<string>();
  const directDownstreamNodeIds = new Set<string>();
  const directUpstreamEdgeIds = new Set<string>();
  const directDownstreamEdgeIds = new Set<string>();

  if (focusNodeId) {
    for (const edge of lvEdges) {
      if (edge.toNodeId === focusNodeId) {
        directUpstreamNodeIds.add(edge.fromNodeId);
        directUpstreamEdgeIds.add(edge.edgeId);
      }
      if (edge.fromNodeId === focusNodeId) {
        directDownstreamNodeIds.add(edge.toNodeId);
        directDownstreamEdgeIds.add(edge.edgeId);
      }
    }
  }

  // ── Layout nodes ──────────────────────────────────────────────────────────
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 50, ranksep: 80, marginx: 32, marginy: 32 });

  for (const n of allNodes) {
    if (visibleNodeIds.has(n.nodeId)) {
      const isGroup = groupNodeIds.has(n.nodeId);
      g.setNode(n.nodeId, { width: isGroup ? 240 : NODE_W, height: NODE_H });
    }
  }
  for (const e of lvEdges) {
    if (visibleNodeIds.has(e.fromNodeId) && visibleNodeIds.has(e.toNodeId)) {
      g.setEdge(e.fromNodeId, e.toNodeId);
    }
  }
  dagre.layout(g);

  // ── Create flow nodes ─────────────────────────────────────────────────────
  const nodes: LineageFlowNode[] = allNodes
    .filter(n => visibleNodeIds.has(n.nodeId))
    .map((n) => {
      const pos = g.node(n.nodeId);
      const isGroup = groupNodeIds.has(n.nodeId);
      const childCount = childrenByParentId.get(n.nodeId)?.length ?? 0;
      return {
        id: n.nodeId,
        type: "lineageNode",
        position: { x: pos.x - (isGroup ? 240 / 2 : NODE_W / 2), y: pos.y - NODE_H / 2 },
        data: {
          label: n.displayName,
          subLabel: n.tableName ?? undefined,
          entityType: n.entityType,
          isFocus: n.nodeId === focusNodeId,
          isRelated: highlightedNodeIds.has(n.nodeId) && n.nodeId !== focusNodeId,
          isDirectUpstream: directUpstreamNodeIds.has(n.nodeId),
          isDirectDownstream: directDownstreamNodeIds.has(n.nodeId),
          depth: depthByNodeId.get(n.nodeId) ?? 0,
          isGroupNode: isGroup,
          isExpanded: expandedGroups.has(n.nodeId),
          childCount: isGroup ? childCount : undefined,
          onToggleExpanded: isGroup ? onToggleGroup : undefined,
        },
      };
    });

  // ── Create edges (only between visible nodes) ────────────────────────────
  const edges: Edge[] = lvEdges
    .filter(e => visibleNodeIds.has(e.fromNodeId) && visibleNodeIds.has(e.toNodeId))
    .map((e) => {
      const isHighlighted = highlightedEdgeIds.has(e.edgeId);
      const isUpstreamEdge = directUpstreamEdgeIds.has(e.edgeId);
      const isDownstreamEdge = directDownstreamEdgeIds.has(e.edgeId);
      const edgeColor = isUpstreamEdge
        ? "var(--colorPaletteRedBorderActive, #d13438)"
        : isDownstreamEdge
          ? "var(--colorPaletteGreenBorderActive, #2d7d32)"
          : isHighlighted
            ? "var(--colorPaletteLavenderBorderActive, #6b4eff)"
            : "var(--colorNeutralStroke1, #9e9e9e)";
      const edgeWidth = isUpstreamEdge || isDownstreamEdge ? 2.6 : isHighlighted ? 2.2 : 1.5;

      return {
        id: e.edgeId,
        source: e.fromNodeId,
        target: e.toNodeId,
        type: "smoothstep",
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
        style: { stroke: edgeColor, strokeWidth: edgeWidth },
        label: e.edgeType.replace(/_/g, " "),
        labelStyle: { fontSize: 9, fill: isHighlighted ? edgeColor : "var(--colorNeutralForeground3, #757575)" },
        labelBgStyle: { fill: "var(--colorNeutralBackground1, #fff)", fillOpacity: 0.85 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
      };
    });

  return { nodes, edges };
}

// ÔöÇÔöÇÔöÇ Inner component (needs to be inside ReactFlowProvider) ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

interface LineageGraphViewProps {
  nodes: LineageViewerNode[];
  edges: LineageViewerEdge[];
  focusNodeId?: string;
  depthByNodeId: Map<string, number>;
  highlightedNodeIds?: Set<string>;
  highlightedEdgeIds?: Set<string>;
  expandedGroups?: Set<string>;
  onToggleGroup?: (groupId: string) => void;
  onNodeClick?: (nodeId: string) => void;
}

function LineageGraphInner({
  nodes: lvNodes,
  edges: lvEdges,
  focusNodeId,
  depthByNodeId,
  highlightedNodeIds,
  highlightedEdgeIds,
  expandedGroups: externalExpandedGroups,
  onToggleGroup: externalOnToggleGroup,
  onNodeClick,
}: LineageGraphViewProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(externalExpandedGroups ?? new Set<string>());
  
  const effectiveHighlightedNodeIds = highlightedNodeIds ?? new Set<string>();
  const effectiveHighlightedEdgeIds = highlightedEdgeIds ?? new Set<string>();

  const handleToggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
    externalOnToggleGroup?.(groupId);
  }, [externalOnToggleGroup]);

  const layout = useMemo(
    () => buildLayout(lvNodes, lvEdges, focusNodeId, depthByNodeId, effectiveHighlightedNodeIds, effectiveHighlightedEdgeIds, expandedGroups, handleToggleGroup),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lvNodes, lvEdges, focusNodeId, depthByNodeId, effectiveHighlightedNodeIds, effectiveHighlightedEdgeIds, expandedGroups, handleToggleGroup]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);

  useEffect(() => {
    const { nodes: n, edges: e } = buildLayout(lvNodes, lvEdges, focusNodeId, depthByNodeId, effectiveHighlightedNodeIds, effectiveHighlightedEdgeIds, expandedGroups, handleToggleGroup);
    setNodes(n);
    setEdges(e);
  }, [lvNodes, lvEdges, focusNodeId, depthByNodeId, effectiveHighlightedNodeIds, effectiveHighlightedEdgeIds, expandedGroups, handleToggleGroup, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_evt: React.MouseEvent, node: Node) => {
      onNodeClick?.(node.id);
    },
    [onNodeClick]
  );

  if (lvNodes.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--colorNeutralForeground3, #757575)",
          fontFamily: "var(--fontFamilyBase, 'Segoe UI', sans-serif)",
          fontSize: 14,
        }}
      >
        No nodes to display. Select a root object and adjust filters.
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.15}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
      style={{ background: "var(--colorNeutralBackground2, #fafafa)" }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        color="var(--colorNeutralStroke2, #e0e0e0)"
        gap={18}
        size={1}
      />
      <Controls
        style={{
          background: "var(--colorNeutralBackground1, #fff)",
          border: "1px solid var(--colorNeutralStroke2, #e0e0e0)",
          borderRadius: "var(--borderRadiusMedium, 6px)",
        }}
      />
      <MiniMap
        nodeColor={(node) => {
          const d = node.data as LineageNodeData;
          if (d.isFocus) return "var(--colorBrandBackground, #0078d4)";
          if (d.isDirectUpstream && d.isDirectDownstream) return "var(--colorPaletteDarkOrangeBorderActive, #b75d00)";
          if (d.isDirectUpstream) return "var(--colorPaletteRedBorderActive, #d13438)";
          if (d.isDirectDownstream) return "var(--colorPaletteGreenBorderActive, #2d7d32)";
          if (d.isRelated) return "var(--colorPaletteLavenderBorderActive, #6b4eff)";
          return palette(d.entityType).border;
        }}
        maskColor="rgba(255,255,255,0.55)"
        style={{
          background: "var(--colorNeutralBackground1, #fff)",
          border: "1px solid var(--colorNeutralStroke2, #e0e0e0)",
          borderRadius: "var(--borderRadiusMedium, 6px)",
        }}
      />
    </ReactFlow>
  );
}

// ÔöÇÔöÇÔöÇ Public export (wraps with provider) ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

export function LineageGraphView(props: LineageGraphViewProps) {
  return (
    <ReactFlowProvider>
      <LineageGraphInner {...props} />
    </ReactFlowProvider>
  );
}
