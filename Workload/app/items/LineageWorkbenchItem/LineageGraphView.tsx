import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Handle,
  Position,
  MarkerType,
  BackgroundVariant,
  Panel,
} from "@xyflow/react";
import type { Node, Edge, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronRightFilled, SaveRegular, TargetArrowRegular } from "@fluentui/react-icons";
import { Switch, Text, tokens, Button } from "@fluentui/react-components";
import dagre from "dagre";
import { toPng } from "html-to-image";

// ─── Lineage graph types (inlined from original LineageViewerItemDefinition) ──

export interface LineageViewerNode {
  nodeId: string;
  displayName: string;
  entityType: "report" | "page" | "visual" | "semantic_model" | "semantic_object" | "table" | "column" | "measure" | "dataflow" | "notebook" | "lakehouse" | "warehouse" | "unknown";
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
  semantic_model: {
    bg: "var(--colorPaletteLavenderBackground2, #f0e8ff)",
    border: "var(--colorPaletteLavenderBorderActive, #6b4eff)",
    typeLabel: "Semantic Model",
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

// Table-based color palette generator

const TABLE_COLORS = [
  { bg: "#e3f2fd", border: "#1976d2" }, // Blue
  { bg: "#f3e5f5", border: "#7b1fa2" }, // Purple
  { bg: "#e8f5e9", border: "#388e3c" }, // Green
  { bg: "#fff3e0", border: "#f57c00" }, // Orange
  { bg: "#fce4ec", border: "#c2185b" }, // Pink
  { bg: "#e0f2f1", border: "#00796b" }, // Teal
  { bg: "#fff9c4", border: "#f9a825" }, // Yellow
  { bg: "#f1f8e9", border: "#689f38" }, // Light Green
  { bg: "#e1f5fe", border: "#0288d1" }, // Light Blue
  { bg: "#fce4ec", border: "#e91e63" }, // Deep Pink
  { bg: "#ede7f6", border: "#5e35b1" }, // Deep Purple
  { bg: "#e0f7fa", border: "#0097a7" }, // Cyan
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

function getTableColor(tableName: string): { bg: string; border: string } {
  const hash = hashString(tableName);
  return TABLE_COLORS[hash % TABLE_COLORS.length];
}

// Centrality calculation

// Network Intelligence Functions

interface NetworkMetrics {
  degreeCentrality: number;
  betweennessCentrality: number;
  upstreamCount: number;
  downstreamCount: number;
  depth: number;
}

function calculateNetworkMetrics(
  nodes: LineageViewerNode[],
  edges: LineageViewerEdge[],
  depthByNodeId: Map<string, number>
): Map<string, NetworkMetrics> {
  const metrics = new Map<string, NetworkMetrics>();
  const adjacency = new Map<string, Set<string>>();
  const upstreamMap = new Map<string, Set<string>>();
  const downstreamMap = new Map<string, Set<string>>();
  
  // Build adjacency lists
  for (const edge of edges) {
    if (!adjacency.has(edge.fromNodeId)) adjacency.set(edge.fromNodeId, new Set());
    if (!adjacency.has(edge.toNodeId)) adjacency.set(edge.toNodeId, new Set());
    adjacency.get(edge.fromNodeId)!.add(edge.toNodeId);
    adjacency.get(edge.toNodeId)!.add(edge.fromNodeId);
    
    if (!upstreamMap.has(edge.toNodeId)) upstreamMap.set(edge.toNodeId, new Set());
    upstreamMap.get(edge.toNodeId)!.add(edge.fromNodeId);
    
    if (!downstreamMap.has(edge.fromNodeId)) downstreamMap.set(edge.fromNodeId, new Set());
    downstreamMap.get(edge.fromNodeId)!.add(edge.toNodeId);
  }
  
  // Calculate betweenness centrality (simplified - count shortest paths through node)
  const betweenness = new Map<string, number>();
  for (const node of nodes) {
    betweenness.set(node.nodeId, 0);
  }
  
  // For each pair of nodes, find shortest path and increment betweenness for intermediate nodes
  for (const source of nodes) {
    const distances = new Map<string, number>();
    const predecessors = new Map<string, Set<string>>();
    const queue = [source.nodeId];
    distances.set(source.nodeId, 0);
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDist = distances.get(current)!;
      
      const neighbors = adjacency.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (!distances.has(neighbor)) {
          distances.set(neighbor, currentDist + 1);
          queue.push(neighbor);
          predecessors.set(neighbor, new Set([current]));
        } else if (distances.get(neighbor) === currentDist + 1) {
          predecessors.get(neighbor)!.add(current);
        }
      }
    }
    
    // Backtrack to count paths through each node
    for (const [target] of distances) {
      if (target === source.nodeId) continue;
      const preds = predecessors.get(target);
      if (preds) {
        for (const pred of preds) {
          if (pred !== source.nodeId) {
            betweenness.set(pred, (betweenness.get(pred) || 0) + 1);
          }
        }
      }
    }
  }
  
  // Assemble metrics for each node
  for (const node of nodes) {
    const degree = adjacency.get(node.nodeId)?.size || 0;
    const between = betweenness.get(node.nodeId) || 0;
    const upstream = upstreamMap.get(node.nodeId)?.size || 0;
    const downstream = downstreamMap.get(node.nodeId)?.size || 0;
    const depth = depthByNodeId.get(node.nodeId) || 0;
    
    metrics.set(node.nodeId, {
      degreeCentrality: degree,
      betweennessCentrality: between,
      upstreamCount: upstream,
      downstreamCount: downstream,
      depth,
    });
  }
  
  return metrics;
}

function findCriticalPath(
  startNodeId: string,
  endNodeId: string,
  edges: LineageViewerEdge[]
): Set<string> {
  const pathNodes = new Set<string>();
  const adjacency = new Map<string, Set<string>>();
  
  // Build adjacency list
  for (const edge of edges) {
    if (!adjacency.has(edge.fromNodeId)) adjacency.set(edge.fromNodeId, new Set());
    adjacency.get(edge.fromNodeId)!.add(edge.toNodeId);
  }
  
  // BFS to find shortest path
  const queue: { node: string; path: string[] }[] = [{ node: startNodeId, path: [startNodeId] }];
  const visited = new Set<string>([startNodeId]);
  
  while (queue.length > 0) {
    const { node, path } = queue.shift()!;
    
    if (node === endNodeId) {
      path.forEach(n => pathNodes.add(n));
      return pathNodes;
    }
    
    const neighbors = adjacency.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ node: neighbor, path: [...path, neighbor] });
      }
    }
  }
  
  return pathNodes;
}

// ÔöÇÔöÇÔöÇ Node dimensions ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

const NODE_W = 210;

// ÔöÇÔöÇÔöÇ Custom node data shape ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

export interface LineageNodeData extends Record<string, unknown> {
  label: string;
  subLabel?: string;
  entityType: string;
  tableName?: string;
  isFocus: boolean;
  isRelated: boolean;
  isDirectUpstream: boolean;
  isDirectDownstream: boolean;
  depth: number;
  isGroupNode?: boolean;
  isExpanded?: boolean;
  childCount?: number;
  degreeCentrality?: number;
  betweennessCentrality?: number;
  upstreamCount?: number;
  downstreamCount?: number;
  useTableColors?: boolean;
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

  // Determine base colors (table-based or entity-type based)
  let baseColor = pal;
  if (data.useTableColors && data.tableName && !isGroupNode) {
    const tableColor = getTableColor(data.tableName);
    baseColor = { bg: tableColor.bg, border: tableColor.border, typeLabel: pal.typeLabel };
  }

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
            : baseColor.bg;
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
            : baseColor.border;
  const accentColor = isFocus ? "#fff" : nodeBorder;
  
  // Build enhanced tooltip content with network metrics
  const tooltipLines = [
    data.label,
    data.subLabel ? `Table: ${data.subLabel}` : null,
    data.depth !== undefined ? `Depth: ${data.depth}` : null,
    data.upstreamCount !== undefined ? `↑ Upstream: ${data.upstreamCount}` : null,
    data.downstreamCount !== undefined ? `↓ Downstream: ${data.downstreamCount}` : null,
    data.degreeCentrality !== undefined ? `Connections: ${data.degreeCentrality}` : null,
    data.betweennessCentrality !== undefined && data.betweennessCentrality > 0 
      ? `Betweenness: ${data.betweennessCentrality}` 
      : null,
  ].filter(Boolean);
  const tooltipContent = tooltipLines.join('\\n');

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
      title={tooltipContent}
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

// ─── Dagre auto-layout ────────────────────────────────────────────────────────

/**
 * Apply Dagre hierarchical layout algorithm to position nodes automatically.
 * This creates a clean, layered visualization that minimizes edge crossings.
 */
function applyDagreLayout(
  nodes: LineageFlowNode[],
  edges: Edge[],
  direction: "TB" | "LR" = "TB"
): LineageFlowNode[] {
  const dagreGraph = new dagre.graphlib.Graph();
  
  // Configure graph for hierarchical layout
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction, // TB = top-to-bottom, LR = left-to-right
    align: "UL", // Align nodes to upper-left
    nodesep: 100, // Horizontal spacing between nodes
    edgesep: 50, // Spacing between edges
    ranksep: 150, // Vertical spacing between layers
    marginx: 50,
    marginy: 50,
  });

  // Add nodes to Dagre graph with rank constraints for better grouping
  for (const node of nodes) {
    const width = node.style?.width as number || NODE_W;
    const height = node.style?.height as number || 60;
    const data = node.data as LineageNodeData;
    
    // Assign rank based on entity type for column-based grouping
    let rank: number | undefined = undefined;
    if (data.entityType === "semantic_model") {
      rank = 0; // Leftmost column
    } else if (data.entityType === "table") {
      rank = 1; // Middle column
    } else if (data.entityType === "column" || data.entityType === "measure") {
      rank = 2; // Rightmost column
    }
    // Reports, visuals, notebooks get auto-assigned based on connections
    
    dagreGraph.setNode(node.id, { width, height, rank });
  }

  // Add edges to Dagre graph
  for (const edge of edges) {
    dagreGraph.setEdge(edge.source, edge.target);
  }

  // Run Dagre layout algorithm
  dagre.layout(dagreGraph);

  // Apply calculated positions to nodes
  return nodes.map((node) => {
    const dagreNode = dagreGraph.node(node.id);
    if (!dagreNode) return node;

    // Dagre positions are centered, ReactFlow positions are top-left
    const width = node.style?.width as number || NODE_W;
    const height = node.style?.height as number || 60;

    return {
      ...node,
      position: {
        x: dagreNode.x - width / 2,
        y: dagreNode.y - height / 2,
      },
    };
  });
}

function buildLayout(
  lvNodes: LineageViewerNode[],
  lvEdges: LineageViewerEdge[],
  focusNodeId: string | undefined,
  depthByNodeId: Map<string, number>,
  highlightedNodeIds: Set<string>,
  highlightedEdgeIds: Set<string>,
  expandedGroups: Set<string>,
  onToggleGroup: (groupId: string) => void,
  useTableColors: boolean,
  networkMetrics: Map<string, NetworkMetrics>,
  criticalPathNodes: Set<string>
): { nodes: LineageFlowNode[]; edges: Edge[] } {
  // ── Build hierarchical structure: Semantic Model → Table → Column/Measure ──
  
  const syntheticGroupNodes: LineageViewerNode[] = [];
  const allNodes = [...lvNodes];
  
  // Create semantic model group nodes if they don't exist
  const modelNodeIds = new Set(lvNodes.filter(n => n.entityType === "semantic_model").map(n => n.nodeId));
  const datasetIds = new Set(lvNodes.filter(n => n.datasetId).map(n => n.datasetId!));
  
  for (const datasetId of datasetIds) {
    const modelNodeId = `sm:${datasetId}`;
    if (!modelNodeIds.has(modelNodeId)) {
      const modelName = lvNodes.find(n => n.datasetId === datasetId && n.modelName)?.modelName || `Model ${datasetId}`;
      syntheticGroupNodes.push({
        nodeId: modelNodeId,
        displayName: modelName,
        entityType: "semantic_model",
        datasetId: datasetId,
        isGroupNode: true,
      });
    }
  }
  
  allNodes.push(...syntheticGroupNodes);

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

  // ── Create flat node list for Dagre (hierarchical layout) ────────────────
  const nodes: LineageFlowNode[] = [];
  
  for (const node of allNodes) {
    const isFocus = node.nodeId === focusNodeId;
    const isRelated = highlightedNodeIds.has(node.nodeId) && node.nodeId !== focusNodeId;
    const isDirectUpstream = directUpstreamNodeIds.has(node.nodeId);
    const isDirectDownstream = directDownstreamNodeIds.has(node.nodeId);
    const depth = depthByNodeId.get(node.nodeId) ?? 0;
    const metrics = networkMetrics.get(node.nodeId);
    
    // Calculate node dimensions based on type
    let width = NODE_W;
    let height = 60;
    
    if (node.entityType === "semantic_model") {
      width = 280;
      height = 80;
    } else if (node.entityType === "table") {
      width = 240;
      height = 70;
    } else if (node.entityType === "column" || node.entityType === "measure") {
      width = 220;
      height = 55;
    }
    
    nodes.push({
      id: node.nodeId,
      type: "lineageNode",
      position: { x: 0, y: 0 }, // Will be calculated by Dagre
      style: {
        width,
        height,
      },
      data: {
        label: node.displayName,
        subLabel: node.tableName || node.dataType || undefined,
        entityType: node.entityType,
        tableName: node.tableName,
        isFocus: isFocus || criticalPathNodes.has(node.nodeId),
        isRelated,
        isDirectUpstream,
        isDirectDownstream,
        depth,
        isGroupNode: node.isGroupNode,
        childCount: undefined,
        degreeCentrality: metrics?.degreeCentrality,
        betweennessCentrality: metrics?.betweennessCentrality,
        upstreamCount: metrics?.upstreamCount,
        downstreamCount: metrics?.downstreamCount,
        useTableColors,
        onToggleExpanded: onToggleGroup,
      },
    });
  }

  // ── Create edges (only between visible nodes) ────────────────────────────
  const visibleNodeIds = new Set(allNodes.map(n => n.nodeId));
  const edges: Edge[] = lvEdges
    .filter(e => visibleNodeIds.has(e.fromNodeId) && visibleNodeIds.has(e.toNodeId))
    .map((e) => {
      const isHighlighted = highlightedEdgeIds.has(e.edgeId);
      const isUpstreamEdge = directUpstreamEdgeIds.has(e.edgeId);
      const isDownstreamEdge = directDownstreamEdgeIds.has(e.edgeId);
      
      // Enhanced edge styling for better visibility
      const edgeColor = isUpstreamEdge
        ? "var(--colorPaletteRedBorderActive, #d13438)"
        : isDownstreamEdge
          ? "var(--colorPaletteGreenBorderActive, #2d7d32)"
          : isHighlighted
            ? "var(--colorPaletteLavenderBorderActive, #6b4eff)"
            : e.edgeType === "relationship"
              ? "var(--colorBrandStroke1, #0078d4)"
              : e.edgeType === "contains"
                ? "var(--colorNeutralStroke2, #c4c4c4)"
                : "var(--colorNeutralStroke1, #9e9e9e)";
      
      const edgeWidth = isUpstreamEdge || isDownstreamEdge ? 3 : isHighlighted ? 2.5 : e.edgeType === "contains" ? 1.5 : 2;
      const isAnimated = isUpstreamEdge || isDownstreamEdge;
      
      // Different stroke patterns for different edge types
      let strokeDasharray: string | undefined = undefined;
      if (e.edgeType === "dependency") {
        strokeDasharray = "5,5"; // Dashed for dependencies
      } else if (e.edgeType === "contains") {
        strokeDasharray = "2,3"; // Dotted for containment
      }
      // Solid line for relationships (no dasharray)

      return {
        id: e.edgeId,
        source: e.fromNodeId,
        target: e.toNodeId,
        type: "smoothstep",
        animated: isAnimated,
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
        style: { 
          stroke: edgeColor, 
          strokeWidth: edgeWidth,
          strokeDasharray,
        },
        label: e.edgeType === "relationship" ? "relationship" : e.edgeType === "contains" ? "contains" : "dependency",
        labelStyle: { 
          fontSize: 10, 
          fill: isHighlighted ? edgeColor : "var(--colorNeutralForeground3, #757575)",
          fontWeight: isHighlighted ? 600 : 400,
        },
        labelBgStyle: { fill: "var(--colorNeutralBackground1, #fff)", fillOpacity: 0.9 },
        labelBgPadding: [6, 4] as [number, number],
        labelBgBorderRadius: 4,
      };
    });

  // ── Apply Dagre hierarchical layout (left-to-right flow) ─────────────────
  const layoutedNodes = applyDagreLayout(nodes, edges, "LR");

  return { nodes: layoutedNodes, edges };
}

// ─── Inner component (needs to be inside ReactFlowProvider) ──────────────────

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

// ─── Legend Component ─────────────────────────────────────────────────────────

interface LegendProps {
  useTableColors: boolean;
  onToggleColorMode: () => void;
}

function GraphLegend({ useTableColors, onToggleColorMode }: LegendProps) {
  return (
    <Panel position="top-right" style={{ margin: 10 }}>
      <div
        style={{
          background: tokens.colorNeutralBackground1,
          border: `1px solid ${tokens.colorNeutralStroke2}`,
          borderRadius: tokens.borderRadiusMedium,
          padding: "12px",
          fontSize: "11px",
          fontFamily: tokens.fontFamilyBase,
          minWidth: "200px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        <div style={{ marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Text weight="semibold" size={300}>Legend</Text>
        </div>
        
        {/* Color Mode Toggle */}
        <div style={{ marginBottom: "12px", padding: "8px", background: tokens.colorNeutralBackground2, borderRadius: tokens.borderRadiusSmall }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <Switch 
              checked={useTableColors} 
              onChange={onToggleColorMode}
              label="Table-based colors"
            />
          </div>
          <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
            {useTableColors ? "Grouped by table" : "Grouped by type"}
          </Text>
        </div>

        {/* Edge Types */}
        <div style={{ marginBottom: "8px" }}>
          <Text weight="semibold" size={200} style={{ display: "block", marginBottom: "6px" }}>Edge Types</Text>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "40px", height: "2px", background: tokens.colorBrandStroke1 }} />
              <Text size={100}>Relationship</Text>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "40px", height: "2px", background: tokens.colorNeutralStroke1, backgroundImage: "repeating-linear-gradient(90deg, currentColor, currentColor 5px, transparent 5px, transparent 10px)" }} />
              <Text size={100}>Dependency</Text>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "40px", height: "2px", background: tokens.colorNeutralStroke2, backgroundImage: "repeating-linear-gradient(90deg, currentColor, currentColor 2px, transparent 2px, transparent 5px)" }} />
              <Text size={100}>Contains</Text>
            </div>
          </div>
        </div>

        {/* Highlight States */}
        <div>
          <Text weight="semibold" size={200} style={{ display: "block", marginBottom: "6px" }}>Highlights</Text>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "16px", height: "16px", background: "var(--colorBrandBackground, #0078d4)", border: "2px solid var(--colorBrandBackground, #0078d4)", borderRadius: "3px" }} />
              <Text size={100}>Selected</Text>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "16px", height: "16px", background: "var(--colorPaletteRedBackground2, #fde7e9)", border: "2px solid var(--colorPaletteRedBorderActive, #d13438)", borderRadius: "3px" }} />
              <Text size={100}>Upstream</Text>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "16px", height: "16px", background: "var(--colorPaletteGreenBackground2, #e6f4ea)", border: "2px solid var(--colorPaletteGreenBorderActive, #2d7d32)", borderRadius: "3px" }} />
              <Text size={100}>Downstream</Text>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
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
  const expandedGroups = externalExpandedGroups ?? new Set<string>();
  const [useTableColors, setUseTableColors] = useState(true);
  const { getNode, setCenter } = useReactFlow();

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [criticalPathMode, setCriticalPathMode] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  
  const effectiveHighlightedNodeIds = highlightedNodeIds ?? new Set<string>();
  const effectiveHighlightedEdgeIds = highlightedEdgeIds ?? new Set<string>();
  
  // Calculate network metrics (replaces simple centrality)
  const networkMetrics = useMemo(() => 
    calculateNetworkMetrics(lvNodes, lvEdges, depthByNodeId), 
    [lvNodes, lvEdges, depthByNodeId]
  );
  
  // Find critical path nodes if mode is active
  const criticalPathNodes = useMemo(() => {
    if (criticalPathMode.start && criticalPathMode.end) {
      return findCriticalPath(criticalPathMode.start, criticalPathMode.end, lvEdges);
    }
    return new Set<string>();
  }, [criticalPathMode, lvEdges]);
  


  const handleToggleGroup = useCallback((groupId: string) => {
    externalOnToggleGroup?.(groupId);
  }, [externalOnToggleGroup]);
  
  const handleToggleColorMode = useCallback(() => {
    setUseTableColors(prev => !prev);
  }, []);
  
  // Context menu handlers
  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }, []);
  
  const handleContextMenuAction = useCallback((action: string, nodeId: string) => {
    switch (action) {
      case "focus":
        onNodeClick?.(nodeId);
        break;
      case "trace-start":
        setCriticalPathMode({ start: nodeId, end: null });
        break;
      case "trace-end":
        if (criticalPathMode.start) {
          setCriticalPathMode({ start: criticalPathMode.start, end: nodeId });
        }
        break;
      case "clear-trace":
        setCriticalPathMode({ start: null, end: null });
        break;
    }
    setContextMenu(null);
  }, [onNodeClick, criticalPathMode]);
  
  // Export to PNG
  const handleExportPNG = useCallback(async () => {
    if (!reactFlowWrapper.current) return;
    try {
      const dataUrl = await toPng(reactFlowWrapper.current, {
        backgroundColor: "#ffffff",
        filter: (node) => {
          // Exclude controls and minimap from export
          return !node.classList?.contains('react-flow__controls') && 
                 !node.classList?.contains('react-flow__minimap');
        },
      });
      const link = document.createElement("a");
      link.download = `lineage-graph-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to export PNG:", err);
    }
  }, []);

  const layout = useMemo(
    () => buildLayout(lvNodes, lvEdges, focusNodeId, depthByNodeId, effectiveHighlightedNodeIds, effectiveHighlightedEdgeIds, expandedGroups, handleToggleGroup, useTableColors, networkMetrics, criticalPathNodes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lvNodes, lvEdges, focusNodeId, depthByNodeId, effectiveHighlightedNodeIds, effectiveHighlightedEdgeIds, expandedGroups, handleToggleGroup, useTableColors, networkMetrics, criticalPathNodes]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);

  useEffect(() => {
    const { nodes: n, edges: e } = buildLayout(lvNodes, lvEdges, focusNodeId, depthByNodeId, effectiveHighlightedNodeIds, effectiveHighlightedEdgeIds, expandedGroups, handleToggleGroup, useTableColors, networkMetrics, criticalPathNodes);
    setNodes(n);
    setEdges(e);
  }, [lvNodes, lvEdges, focusNodeId, depthByNodeId, effectiveHighlightedNodeIds, effectiveHighlightedEdgeIds, expandedGroups, handleToggleGroup, setNodes, setEdges, useTableColors, networkMetrics, criticalPathNodes]);

  // Center view on selected node
  useEffect(() => {
    if (focusNodeId) {
      const node = getNode(focusNodeId);
      if (node?.position) {
        setCenter(node.position.x + (node.width ?? 200) / 2, node.position.y + (node.height ?? 80) / 2, { zoom: 1.2, duration: 400 });
      }
    }
  }, [focusNodeId, getNode, setCenter, nodes]);

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
    <div ref={reactFlowWrapper} style={{ width: "100%", height: "100%", position: "relative" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={handleNodeContextMenu}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.01 }}
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
            if (d.useTableColors && d.tableName) return getTableColor(d.tableName).border;
            return palette(d.entityType).border;
          }}
          maskColor="rgba(255,255,255,0.55)"
          style={{
            background: "var(--colorNeutralBackground1, #fff)",
            border: "1px solid var(--colorNeutralStroke2, #e0e0e0)",
            borderRadius: "var(--borderRadiusMedium, 6px)",
          }}
        />
        
        {/* Export and Trace Panel */}
        <Panel position="top-left" style={{ margin: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", background: "var(--colorNeutralBackground1, #fff)", padding: 8, borderRadius: "var(--borderRadiusMedium, 6px)", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
            <Button
              icon={<SaveRegular />}
              onClick={handleExportPNG}
              title="Export to PNG"
              size="small"
            />
            {criticalPathMode.start && (
              <Button
                icon={<TargetArrowRegular />}
                onClick={() => setCriticalPathMode({ start: null, end: null })}
                title="Clear trace"
                size="small"
                appearance="subtle"
              >
                {criticalPathMode.end ? "Clear" : "Select end node"}
              </Button>
            )}
          </div>
        </Panel>
        
        <GraphLegend useTableColors={useTableColors} onToggleColorMode={handleToggleColorMode} />
      </ReactFlow>
      
      {/* Context Menu */}
      {contextMenu && (
        <div
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 1000,
            background: "var(--colorNeutralBackground1, #fff)",
            border: "1px solid var(--colorNeutralStroke2, #e0e0e0)",
            borderRadius: "var(--borderRadiusMedium, 6px)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            minWidth: 180,
          }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <div style={{ padding: 4 }}>
            <button
              onClick={() => handleContextMenuAction("focus", contextMenu.nodeId)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: 13,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--colorNeutralBackground2, #fafafa)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "none"}
            >
              Focus on this node
            </button>
            <button
              onClick={() => handleContextMenuAction("trace-start", contextMenu.nodeId)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: 13,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--colorNeutralBackground2, #fafafa)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "none"}
            >
              Trace from here...
            </button>
            {criticalPathMode.start && (
              <button
                onClick={() => handleContextMenuAction("trace-end", contextMenu.nodeId)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  fontSize: 13,
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--colorNeutralBackground2, #fafafa)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "none"}
              >
                ...to here
              </button>
            )}
            {criticalPathMode.start && (
              <button
                onClick={() => handleContextMenuAction("clear-trace", contextMenu.nodeId)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  borderTop: "1px solid var(--colorNeutralStroke2, #e0e0e0)",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--colorNeutralBackground2, #fafafa)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "none"}
              >
                Clear trace
              </button>
            )}
          </div>
        </div>
      )}
    </div>
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
