import type { CreateExtractionRequest, ExtractionRun } from "../../domain/extractionTypes";
import type { NotebookInputTables, TableRow } from "../notebookPorted/types";
import { ensureAllNotebookTables } from "../notebookPorted/tableContracts";

type FabricItem = {
  id?: string;
  type?: string;
  displayName?: string;
  name?: string;
  workspaceId?: string;
  objectId?: string;
  datasetId?: string;
  semanticModelId?: string;
};

function hasRows(tables: NotebookInputTables): boolean {
  return Object.values(tables).some((rows) => Array.isArray(rows) && rows.length > 0);
}

function normalizeItemsPayload(payload: unknown): FabricItem[] {
  if (!payload || typeof payload !== "object") return [];
  const maybe = payload as Record<string, unknown>;

  if (Array.isArray(maybe.value)) return maybe.value as FabricItem[];
  if (Array.isArray(maybe.items)) return maybe.items as FabricItem[];
  if (Array.isArray(maybe.data)) return maybe.data as FabricItem[];
  if (Array.isArray(payload)) return payload as FabricItem[];

  return [];
}

async function fetchWorkspaceItems(baseUrl: string, token: string, workspaceId: string): Promise<FabricItem[]> {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/v1/workspaces/${encodeURIComponent(workspaceId)}/items`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Workspace items fetch failed (${response.status}) for ${workspaceId}: ${body}`);
  }

  const json = (await response.json()) as unknown;
  return normalizeItemsPayload(json);
}

export async function collectLiveFabricRawTables(
  run: ExtractionRun,
  request: CreateExtractionRequest
): Promise<NotebookInputTables | undefined> {
  const nativeCollection = request.options?.nativeCollection;
  const enabled = nativeCollection?.enabled ?? false;
  if (!enabled) {
    return undefined;
  }

  const baseUrl = (nativeCollection?.fabricApiBaseUrl || process.env.FABRIC_API_BASE_URL || "https://api.fabric.microsoft.com").trim();
  const token = (nativeCollection?.fabricAccessToken || process.env.FABRIC_ACCESS_TOKEN || "").trim();

  if (!token) {
    console.warn(
      "[lineage-workbench-v2] Live Fabric raw-table collection enabled but no access token provided. " +
        "Set options.nativeCollection.fabricAccessToken or FABRIC_ACCESS_TOKEN."
    );
    return undefined;
  }

  const tables = ensureAllNotebookTables();

  for (const workspaceId of run.workspaceIds) {
    const items = await fetchWorkspaceItems(baseUrl, token, workspaceId);

    const artifactRows: TableRow[] = items.map((item) => ({
      id: item.id || item.objectId,
      type: item.type,
      display_name: item.displayName || item.name,
      name: item.name || item.displayName,
      workspace_id: workspaceId,
    }));
    tables.t_fabric_artifacts.push(...artifactRows);

    const reportRows: TableRow[] = items
      .filter((item) => String(item.type || "").toLowerCase() === "report")
      .map((item) => ({
        report_id: item.id || item.objectId,
        report_name: item.displayName || item.name,
        dataset_id: item.datasetId || item.semanticModelId,
        workspace_id: workspaceId,
      }));
    tables.t_report_metadata.push(...reportRows);

    const lakehouseRows: TableRow[] = items
      .filter((item) => String(item.type || "").toLowerCase() === "lakehouse")
      .map((item) => ({
        id: item.id || item.objectId,
        lakehouse_id: item.id || item.objectId,
        display_name: item.displayName || item.name,
        name: item.name || item.displayName,
        workspace_id: workspaceId,
      }));
    tables.t_lakehouse_metadata.push(...lakehouseRows);

    const warehouseRows: TableRow[] = items
      .filter((item) => {
        const t = String(item.type || "").toLowerCase();
        return t === "warehouse" || t === "mirroredwarehouse";
      })
      .map((item) => ({
        id: item.id || item.objectId,
        warehouse_id: item.id || item.objectId,
        display_name: item.displayName || item.name,
        name: item.name || item.displayName,
        workspace_id: workspaceId,
      }));
    tables.t_warehouse_metadata.push(...warehouseRows);
  }

  if (!hasRows(tables)) {
    return undefined;
  }

  return tables;
}
