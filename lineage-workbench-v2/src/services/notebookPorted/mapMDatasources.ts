import type { NotebookInputTables, NotebookPipelineResult } from "./types";
import { getRows, hashId, lower, normalizeEntityType, rowText, text } from "./helpers";

type Node = NotebookPipelineResult["nodes"][number];
type Edge = NotebookPipelineResult["edges"][number];

const GUID_PATTERN = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/g;
const QUOTED_PATTERN = /"([^"\r\n]{3,})"|([^\r\n]{3,})/g;

function classifySourceKind(queryText: string): string {
  const q = queryText.toLowerCase();
  if (q.includes("lakehouse")) return "lakehouse";
  if (q.includes("warehouse") || q.includes("datawarehouse")) return "warehouse";
  if (q.includes("sql.database") || q.includes("sql endpoint") || q.includes("sqlendpoint")) return "sql_endpoint";
  if (q.includes("dataflow")) return "dataflow";
  if (q.includes("notebook")) return "notebook";
  return "datasource";
}

function extractTokens(queryText: string): { ids: Set<string>; quoted: Set<string> } {
  const ids = new Set<string>();
  const quoted = new Set<string>();

  for (const m of queryText.matchAll(GUID_PATTERN)) {
    ids.add(m[0].toLowerCase());
  }

  for (const m of queryText.matchAll(QUOTED_PATTERN)) {
    const token = text(m[1] || m[2]);
    if (token) quoted.add(token.toLowerCase());
  }

  return { ids, quoted };
}

function allowedTypesForKind(sourceKind: string): Set<string> {
  if (sourceKind === "lakehouse") return new Set(["lakehouse"]);
  if (sourceKind === "warehouse") return new Set(["warehouse", "mirroredwarehouse"]);
  if (sourceKind === "sql_endpoint") return new Set(["lakehouse", "warehouse", "mirroredwarehouse", "sqlendpoint"]);
  if (sourceKind === "notebook") return new Set(["notebook"]);
  if (sourceKind === "dataflow") return new Set(["dataflow", "dataflowgen2"]);
  return new Set();
}

export function mapMDatasources(
  tables: NotebookInputTables,
  existingNodes: Node[]
): { nodes: Node[]; edges: Edge[] } {
  const partitions = getRows(tables, "t_dataset_partitions");
  if (partitions.length === 0) {
    return { nodes: [], edges: [] };
  }

  const artifacts = getRows(tables, "t_fabric_artifacts");
  const datasetTables = getRows(tables, "t_dataset_tables");

  const tablePkByDatasetAndTable = new Map<string, string>();
  for (const row of datasetTables) {
    const datasetId = lower(row.dataset_id);
    const tableName = lower(row.name || row.table_name);
    const tablePk = text(row.table_pk);
    if (datasetId && tableName && tablePk) {
      tablePkByDatasetAndTable.set(`${datasetId}|${tableName}`, tablePk);
    }
  }

  const artifactById = new Map<string, Record<string, unknown>>();
  const artifactsByNameToken = new Map<string, Record<string, unknown>>();
  for (const row of artifacts) {
    const idNorm = lower(row.id);
    const displayNorm = lower(row.display_name);
    const nameNorm = lower(row.name);
    if (idNorm) artifactById.set(idNorm, row);
    if (displayNorm && !artifactsByNameToken.has(displayNorm)) artifactsByNameToken.set(displayNorm, row);
    if (nameNorm && !artifactsByNameToken.has(nameNorm)) artifactsByNameToken.set(nameNorm, row);
  }

  const artifactNodeById = new Map<string, string>();
  for (const node of existingNodes) {
    if (node.nodeId && node.nodeId.includes("-") === false) {
      artifactNodeById.set(node.nodeId.toLowerCase(), node.nodeId);
    }
  }

  const newNodes: Node[] = [];
  const newEdges: Edge[] = [];
  const seenNodeIds = new Set(existingNodes.map((n) => n.nodeId));

  for (const row of partitions) {
    const datasetId = text(row.dataset_id);
    const workspaceId = text(row.workspace_id);
    const tableName = text(row.table_name);
    const partitionName = text(row.partition_name);
    const queryText = text(row.query) || text(row.source) || "";

    if (!datasetId || !tableName) continue;

    const sourceKind = classifySourceKind(queryText);
    const allowedTypes = allowedTypesForKind(sourceKind);
    const { ids, quoted } = extractTokens(queryText);

    let artifactMatch: Record<string, unknown> | undefined;
    for (const idToken of ids) {
      const candidate = artifactById.get(idToken);
      if (!candidate) continue;
      const typeNorm = lower(candidate.type);
      if (allowedTypes.size === 0 || (typeNorm && allowedTypes.has(typeNorm))) {
        artifactMatch = candidate;
        break;
      }
    }

    if (!artifactMatch) {
      for (const token of quoted) {
        const candidate = artifactsByNameToken.get(token);
        if (!candidate) continue;
        const typeNorm = lower(candidate.type);
        if (allowedTypes.size === 0 || (typeNorm && allowedTypes.has(typeNorm))) {
          artifactMatch = candidate;
          break;
        }
      }
    }

    const tablePk =
      tablePkByDatasetAndTable.get(`${datasetId.toLowerCase()}|${tableName.toLowerCase()}`) ||
      `${tableName}|${datasetId}`;

    let toNodeId: string;
    let nodeType = sourceKind;
    let displayName = partitionName || tableName;

    if (artifactMatch) {
      const artifactId = text(artifactMatch.id);
      if (artifactId) {
        toNodeId = artifactNodeById.get(artifactId.toLowerCase()) || artifactId;
      } else {
        toNodeId = hashId("datasource", [datasetId, tableName, partitionName, queryText.slice(0, 400)]);
      }
      displayName = text(artifactMatch.display_name) || text(artifactMatch.name) || displayName;
      nodeType = normalizeEntityType(artifactMatch.type);
    } else {
      toNodeId = hashId("datasource", [datasetId, tableName, partitionName, queryText.slice(0, 400)]);
    }

    if (!seenNodeIds.has(toNodeId) && !artifactMatch) {
      seenNodeIds.add(toNodeId);
      newNodes.push({
        nodeId: toNodeId,
        parentNodeId: datasetId,
        displayName: displayName || "Datasource",
        entityType: nodeType || "datasource",
        datasetId,
        workspaceId,
      });
    }

    newEdges.push({
      edgeId: hashId("edge", [tablePk, toNodeId, partitionName || "", sourceKind]),
      fromNodeId: tablePk,
      toNodeId,
      edgeType: `m_query_source:${sourceKind}`,
      datasetId,
      workspaceId,
    });
  }

  return { nodes: newNodes, edges: newEdges };
}
