import React, { useCallback, useEffect, useMemo } from "react";
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
import { LineageViewerEdge, LineageViewerNode } from "./LineageViewerItemDefinition";

// ─── Entity-type colour palette (Fabric CSS tokens + palette fallbacks) ──────

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
};

const palette = (type: string): EntityPalette => PALETTE[type] ?? PALETTE.unknown;

// ─── Node dimensions for dagre ───────────────────────────────────────────────

const NODE_W = 210;
const NODE_H = 64;

// ─── Custom node data shape ──────────────────────────────────────────────────

export interface LineageNodeData extends Record<string, unknown> {
  label: string;
  subLabel?: string;
  entityType: string;
  isFocus: boolean;
  isRelated: boolean;
  depth: number;
}

type LineageFlowNode = Node<LineageNodeData, "lineageNode">;

// ─── Custom node renderer ────────────────────────────────────────────────────

function LineageNodeComponent({ data }: NodeProps<LineageFlowNode>) {
  const pal = palette(data.entityType);
  const isFocus = data.isFocus;
  const isRelated = data.isRelated;
  const relatedBg = "var(--colorPaletteLavenderBackground2, #f0e8ff)";
  const relatedBorder = "var(--colorPaletteLavenderBorderActive, #6b4eff)";
  const nodeBg = isFocus ? "var(--colorBrandBackground, #0078d4)" : isRelated ? relatedBg : pal.bg;
  const nodeBorder = isFocus ? "var(--colorBrandBackground, #0078d4)" : isRelated ? relatedBorder : pal.border;
  const accentColor = isFocus ? "#fff" : isRelated ? relatedBorder : pal.border;

  return (
    <div
      style={{
        background: nodeBg,
        border: `2px solid ${nodeBorder}`,
        borderRadius: "var(--borderRadiusMedium, 6px)",
        padding: "8px 12px",
        width: NODE_W,
        fontFamily: "var(--fontFamilyBase, 'Segoe UI', sans-serif)",
        boxShadow: isFocus
          ? "0 4px 16px rgba(0,120,212,0.35)"
          : "0 1px 4px rgba(0,0,0,0.08)",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
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
    </div>
  );
}

const NODE_TYPES = { lineageNode: LineageNodeComponent };

// ─── Dagre auto-layout ───────────────────────────────────────────────────────

function buildLayout(
  lvNodes: LineageViewerNode[],
  lvEdges: LineageViewerEdge[],
  focusNodeId: string | undefined,
  depthByNodeId: Map<string, number>,
  highlightedNodeIds: Set<string>,
  highlightedEdgeIds: Set<string>
): { nodes: LineageFlowNode[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 50, ranksep: 80, marginx: 32, marginy: 32 });

  for (const n of lvNodes) {
    g.setNode(n.nodeId, { width: NODE_W, height: NODE_H });
  }
  for (const e of lvEdges) {
    g.setEdge(e.fromNodeId, e.toNodeId);
  }
  dagre.layout(g);

  const nodes: LineageFlowNode[] = lvNodes.map((n) => {
    const pos = g.node(n.nodeId);
    return {
      id: n.nodeId,
      type: "lineageNode",
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: {
        label: n.displayName,
        subLabel: n.tableName ?? undefined,
        entityType: n.entityType,
        isFocus: n.nodeId === focusNodeId,
        isRelated: highlightedNodeIds.has(n.nodeId) && n.nodeId !== focusNodeId,
        depth: depthByNodeId.get(n.nodeId) ?? 0,
      },
    };
  });

  const edges: Edge[] = lvEdges.map((e) => {
    const isHighlighted = highlightedEdgeIds.has(e.edgeId);
    const edgeColor = isHighlighted
      ? "var(--colorPaletteLavenderBorderActive, #6b4eff)"
      : "var(--colorNeutralStroke1, #9e9e9e)";

    return {
      id: e.edgeId,
      source: e.fromNodeId,
      target: e.toNodeId,
      type: "smoothstep",
      animated: false,
      markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
      style: { stroke: edgeColor, strokeWidth: isHighlighted ? 2.2 : 1.5 },
      label: e.edgeType.replace(/_/g, " "),
      labelStyle: { fontSize: 9, fill: isHighlighted ? edgeColor : "var(--colorNeutralForeground3, #757575)" },
      labelBgStyle: { fill: "var(--colorNeutralBackground1, #fff)", fillOpacity: 0.85 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 3,
    };
  });

  return { nodes, edges };
}

// ─── Inner component (needs to be inside ReactFlowProvider) ─────────────────

interface LineageGraphViewProps {
  nodes: LineageViewerNode[];
  edges: LineageViewerEdge[];
  focusNodeId?: string;
  depthByNodeId: Map<string, number>;
  highlightedNodeIds?: Set<string>;
  highlightedEdgeIds?: Set<string>;
  onNodeClick?: (nodeId: string) => void;
}

function LineageGraphInner({
  nodes: lvNodes,
  edges: lvEdges,
  focusNodeId,
  depthByNodeId,
  highlightedNodeIds,
  highlightedEdgeIds,
  onNodeClick,
}: LineageGraphViewProps) {
  const effectiveHighlightedNodeIds = highlightedNodeIds ?? new Set<string>();
  const effectiveHighlightedEdgeIds = highlightedEdgeIds ?? new Set<string>();

  const layout = useMemo(
    () => buildLayout(lvNodes, lvEdges, focusNodeId, depthByNodeId, effectiveHighlightedNodeIds, effectiveHighlightedEdgeIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lvNodes, lvEdges, focusNodeId, depthByNodeId, effectiveHighlightedNodeIds, effectiveHighlightedEdgeIds]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);

  useEffect(() => {
    const { nodes: n, edges: e } = buildLayout(lvNodes, lvEdges, focusNodeId, depthByNodeId, effectiveHighlightedNodeIds, effectiveHighlightedEdgeIds);
    setNodes(n);
    setEdges(e);
  }, [lvNodes, lvEdges, focusNodeId, depthByNodeId, effectiveHighlightedNodeIds, effectiveHighlightedEdgeIds, setNodes, setEdges]);

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
      fitViewOptions={{ padding: 0.25 }}
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

// ─── Public export (wraps with provider) ─────────────────────────────────────

export function LineageGraphView(props: LineageGraphViewProps) {
  return (
    <ReactFlowProvider>
      <LineageGraphInner {...props} />
    </ReactFlowProvider>
  );
}
