import type { GraphSnapshot } from "../../contracts/lineageSnapshot";
import type { NotebookInputTables } from "./types";
import { dedupeById } from "./helpers";
import { buildNodesFromTables } from "./buildNodes";
import { buildEdgesFromTables } from "./buildEdges";
import { mapMDatasources } from "./mapMDatasources";

export function buildSnapshotFromNotebookPipeline(
  inputTables: NotebookInputTables,
  workspaceFallback?: string
): GraphSnapshot {
  const { nodes: baseNodes, dimensions } = buildNodesFromTables(inputTables, workspaceFallback);
  const baseEdges = buildEdgesFromTables(inputTables);
  const mQuery = mapMDatasources(inputTables, baseNodes);

  const nodes = dedupeById([...baseNodes, ...mQuery.nodes], "nodeId");
  const edges = dedupeById([...baseEdges, ...mQuery.edges], "edgeId");

  return {
    generatedAtUtc: new Date().toISOString(),
    nodes,
    edges,
    dimensions,
  };
}
