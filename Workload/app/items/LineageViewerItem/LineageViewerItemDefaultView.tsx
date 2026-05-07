import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Card,
  Dropdown,
  Field,
  Input,
  Option,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Button,
  Divider,
} from "@fluentui/react-components";
import { ChevronDown20Regular, ChevronUp20Regular } from "@fluentui/react-icons";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { ItemEditorDefaultView } from "../../components/ItemEditor";
import { ItemWithDefinition } from "../../controller/ItemCRUDController";
import {
  LineageEdgeDirection,
  LineageViewerEdge,
  LineageViewerItemDefinition,
  LineageViewerNode,
} from "./LineageViewerItemDefinition";
import { LineageGraphView } from "./LineageGraphView";
import "./LineageViewerItem.scss";

interface LineageViewerItemDefaultViewProps {
  workloadClient: WorkloadClientAPI;
  item?: ItemWithDefinition<LineageViewerItemDefinition>;
  definition: LineageViewerItemDefinition;
  onDefinitionChange: (next: LineageViewerItemDefinition) => void;
}

const SAMPLE_GRAPH: LineageViewerItemDefinition["graphSnapshot"] = {
  generatedAtUtc: new Date().toISOString(),
  source: "mock",
  nodes: [
    { nodeId: "measure:sales_total", displayName: "Sales.Total Sales", entityType: "measure", datasetId: "sales-model", tableName: "Sales", objectName: "Total Sales" },
    { nodeId: "column:sales_amount", displayName: "Sales.Amount", entityType: "column", datasetId: "sales-model", tableName: "Sales", objectName: "Amount" },
    { nodeId: "column:date_year", displayName: "Date.Year", entityType: "column", datasetId: "sales-model", tableName: "Date", objectName: "Year" },
    { nodeId: "visual:profit_by_year", displayName: "Profit by Year", entityType: "visual", datasetId: "sales-model", objectName: "Profit by Year" },
    { nodeId: "report:sales_overview", displayName: "Sales Overview", entityType: "report", datasetId: "sales-model", objectName: "Sales Overview" },
  ],
  edges: [
    { edgeId: "e1", fromNodeId: "column:sales_amount", toNodeId: "measure:sales_total", edgeType: "measure_depends_on_column", datasetId: "sales-model" },
    { edgeId: "e2", fromNodeId: "column:date_year", toNodeId: "measure:sales_total", edgeType: "measure_depends_on_column", datasetId: "sales-model" },
    { edgeId: "e3", fromNodeId: "measure:sales_total", toNodeId: "visual:profit_by_year", edgeType: "used_by_visual", datasetId: "sales-model" },
    { edgeId: "e4", fromNodeId: "visual:profit_by_year", toNodeId: "report:sales_overview", edgeType: "contained_in_report", datasetId: "sales-model" },
  ],
};

function traverseGraph(
  nodes: LineageViewerNode[],
  edges: LineageViewerEdge[],
  rootNodeId: string,
  maxDepth: number,
  direction: LineageEdgeDirection
): { depthByNodeId: Map<string, number>; visibleEdges: LineageViewerEdge[] } {
  const outgoing = new Map<string, LineageViewerEdge[]>();
  const incoming = new Map<string, LineageViewerEdge[]>();

  for (const edge of edges) {
    const outList = outgoing.get(edge.fromNodeId) ?? [];
    outList.push(edge);
    outgoing.set(edge.fromNodeId, outList);

    const inList = incoming.get(edge.toNodeId) ?? [];
    inList.push(edge);
    incoming.set(edge.toNodeId, inList);
  }

  const depthByNodeId = new Map<string, number>();
  const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId: rootNodeId, depth: 0 }];
  depthByNodeId.set(rootNodeId, 0);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    if (current.depth >= maxDepth) {
      continue;
    }

    const nextEdges: LineageViewerEdge[] = [];
    if (direction === "downstream" || direction === "both") {
      nextEdges.push(...(outgoing.get(current.nodeId) ?? []));
    }
    if (direction === "upstream" || direction === "both") {
      nextEdges.push(...(incoming.get(current.nodeId) ?? []));
    }

    for (const edge of nextEdges) {
      const nextNodeId = edge.fromNodeId === current.nodeId ? edge.toNodeId : edge.fromNodeId;
      if (!depthByNodeId.has(nextNodeId)) {
        depthByNodeId.set(nextNodeId, current.depth + 1);
        queue.push({ nodeId: nextNodeId, depth: current.depth + 1 });
      }
    }
  }

  const visibleEdges = edges.filter((edge) => depthByNodeId.has(edge.fromNodeId) && depthByNodeId.has(edge.toNodeId));
  return { depthByNodeId, visibleEdges };
}

export function LineageViewerItemDefaultView(props: LineageViewerItemDefaultViewProps) {
  const { t } = useTranslation();
  const { definition, onDefinitionChange } = props;

  const graphSnapshot = definition.graphSnapshot ?? SAMPLE_GRAPH;
  const nodes = graphSnapshot?.nodes ?? [];
  const edges = graphSnapshot?.edges ?? [];

  const selectedNodeId = definition.focusNodeId ?? (nodes[0]?.nodeId ?? "");
  const direction = definition.direction ?? "both";
  const maxDepth = definition.maxDepth ?? 2;
  const searchText = definition.searchText ?? "";

  const selectedNode = nodes.find((n) => n.nodeId === selectedNodeId);

  const filteredNodes = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    if (!search) {
      return nodes;
    }
    return nodes.filter((node) => {
      const haystack = `${node.displayName} ${node.entityType} ${node.tableName ?? ""} ${node.objectName ?? ""}`.toLowerCase();
      return haystack.includes(search);
    });
  }, [nodes, searchText]);

  const traversal = useMemo(() => {
    if (!selectedNodeId) {
      return { depthByNodeId: new Map<string, number>(), visibleEdges: [] as LineageViewerEdge[] };
    }
    return traverseGraph(nodes, edges, selectedNodeId, maxDepth, direction);
  }, [nodes, edges, selectedNodeId, maxDepth, direction]);

  const visibleNodeIds = traversal.depthByNodeId;
  const visibleNodes = filteredNodes
    .filter((node) => visibleNodeIds.has(node.nodeId))
    .sort((a, b) => (visibleNodeIds.get(a.nodeId) ?? 99) - (visibleNodeIds.get(b.nodeId) ?? 99));

  const nodeById = new Map(nodes.map((node) => [node.nodeId, node]));

  // Details table toggle
  const [showDetails, setShowDetails] = useState(false);

  return (
    <ItemEditorDefaultView
      left={{
        title: t("LineageViewer_FilterPanel", "Dependency Filters"),
        width: 320,
        minWidth: 280,
        collapsible: true,
        content: (
          <div className="lineage-viewer-panel">
            <Card className="lineage-viewer-card">
              <Text weight="semibold" size={400}>{t("LineageViewer_Filter_Title", "Analyze Dependencies")}</Text>
              <Text className="lineage-viewer-muted">
                {t("LineageViewer_Filter_Description", "Select a root object and trace impact across visuals and semantic model entities.")}
              </Text>
            </Card>

            <Field label={t("LineageViewer_Search", "Search objects")}>
              <Input
                value={searchText}
                onChange={(_, data) => onDefinitionChange({ ...definition, searchText: data.value })}
                placeholder={t("LineageViewer_Search_Placeholder", "Sales, Profit, Date, visual name...")}
              />
            </Field>

            <Field label={t("LineageViewer_Root", "Root object")}>
              <Dropdown
                value={selectedNode?.displayName ?? ""}
                selectedOptions={selectedNodeId ? [selectedNodeId] : []}
                onOptionSelect={(_, data) => {
                  const nodeId = String(data.optionValue ?? "");
                  onDefinitionChange({ ...definition, focusNodeId: nodeId });
                }}
              >
                {filteredNodes.map((node) => (
                  <Option key={node.nodeId} value={node.nodeId}>
                    {node.displayName}
                  </Option>
                ))}
              </Dropdown>
            </Field>

            <Field label={t("LineageViewer_Direction", "Direction")}>
              <Dropdown
                value={direction}
                selectedOptions={[direction]}
                onOptionSelect={(_, data) => {
                  const value = (data.optionValue as LineageEdgeDirection) || "both";
                  onDefinitionChange({ ...definition, direction: value });
                }}
              >
                <Option value="upstream">{t("LineageViewer_Direction_Upstream", "Upstream")}</Option>
                <Option value="downstream">{t("LineageViewer_Direction_Downstream", "Downstream")}</Option>
                <Option value="both">{t("LineageViewer_Direction_Both", "Both")}</Option>
              </Dropdown>
            </Field>

            <Field label={t("LineageViewer_Depth", "Max depth")}>
              <Dropdown
                value={String(maxDepth)}
                selectedOptions={[String(maxDepth)]}
                onOptionSelect={(_, data) => {
                  const value = Number(data.optionValue ?? 2);
                  onDefinitionChange({ ...definition, maxDepth: value });
                }}
              >
                <Option value="1">1</Option>
                <Option value="2">2</Option>
                <Option value="3">3</Option>
                <Option value="4">4</Option>
              </Dropdown>
            </Field>

            <Card className="lineage-viewer-card">
              <Text weight="semibold">{t("LineageViewer_Summary", "Summary")}</Text>
              <div className="lineage-viewer-badge-row">
                <Badge appearance="filled" color="brand">{visibleNodes.length} {t("LineageViewer_Nodes", "nodes")}</Badge>
                <Badge appearance="filled" color="informative">{traversal.visibleEdges.length} {t("LineageViewer_Edges", "edges")}</Badge>
                <Badge appearance="outline">{graphSnapshot?.source ?? "sample"}</Badge>
              </div>
            </Card>

            {/* Legend */}
            <Card className="lineage-viewer-card">
              <Text weight="semibold" size={300}>{t("LineageViewer_Legend", "Legend")}</Text>
              <div className="lineage-viewer-legend">
                {([
                  { type: "report", label: "Report" },
                  { type: "visual", label: "Visual" },
                  { type: "measure", label: "Measure" },
                  { type: "column", label: "Column" },
                  { type: "table", label: "Table" },
                ] as const).map(({ type, label }) => (
                  <div key={type} className={`lineage-viewer-legend-item lineage-viewer-legend--${type}`}>
                    <span className="lineage-viewer-legend-dot" />
                    <Text size={200}>{label}</Text>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ),
      }}
      center={{
        ariaLabel: t("LineageViewer_Main", "Lineage dependency view"),
        content: (
          <div className="lineage-viewer-main">
            {/* Graph canvas */}
            <div className="lineage-graph-canvas">
              <LineageGraphView
                nodes={visibleNodes}
                edges={traversal.visibleEdges}
                focusNodeId={selectedNodeId}
                depthByNodeId={visibleNodeIds}
                onNodeClick={(nodeId) => onDefinitionChange({ ...definition, focusNodeId: nodeId })}
              />
            </div>

            {/* Collapsible details table */}
            <Divider />
            <div className="lineage-viewer-details-header">
              <Text weight="semibold" size={300}>
                {t("LineageViewer_Details", "Dependency details")}
                {" "}
                <Badge appearance="tint" size="small">{traversal.visibleEdges.length}</Badge>
              </Text>
              <Button
                appearance="transparent"
                size="small"
                icon={showDetails ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
                onClick={() => setShowDetails((v) => !v)}
              >
                {showDetails ? t("LineageViewer_Collapse", "Collapse") : t("LineageViewer_Expand", "Expand")}
              </Button>
            </div>

            {showDetails && (
              <Table aria-label={t("LineageViewer_Edges_Table", "Dependency edges table")} size="small">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>{t("LineageViewer_Col_From", "From")}</TableHeaderCell>
                    <TableHeaderCell>{t("LineageViewer_Col_To", "To")}</TableHeaderCell>
                    <TableHeaderCell>{t("LineageViewer_Col_EdgeType", "Dependency")}</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {traversal.visibleEdges.map((edge) => (
                    <TableRow key={edge.edgeId}>
                      <TableCell>{nodeById.get(edge.fromNodeId)?.displayName ?? edge.fromNodeId}</TableCell>
                      <TableCell>{nodeById.get(edge.toNodeId)?.displayName ?? edge.toNodeId}</TableCell>
                      <TableCell>
                        <Badge appearance="outline" size="small">
                          {edge.edgeType.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        ),
      }}
    />
  );
}
