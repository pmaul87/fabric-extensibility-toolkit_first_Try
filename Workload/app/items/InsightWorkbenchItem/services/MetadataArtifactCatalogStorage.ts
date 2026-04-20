import type { ExplorerArtifact } from "../../../services/MetadataService";
import type { WorkspaceRole } from "../../../clients/FabricPlatformTypes";
import type {
  MetadataArtifactCatalogState,
  PersistedExplorerArtifact,
} from "../InsightWorkbenchItemDefinition";

function toIsoString(value: Date | string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  return value.toISOString();
}

export function serializeArtifactCatalog(
  artifacts: ExplorerArtifact[],
  source: MetadataArtifactCatalogState["source"]
): MetadataArtifactCatalogState {
  const serializedArtifacts: PersistedExplorerArtifact[] = artifacts.map((artifact) => ({
    id: artifact.id,
    displayName: artifact.displayName,
    type: artifact.type,
    workspaceId: artifact.workspaceId,
    workspaceName: artifact.workspaceName,
    description: artifact.description,
    accessLevel: artifact.accessLevel,
    createdByDisplayName: artifact.createdByDisplayName,
    createdByUserPrincipalName: artifact.createdByUserPrincipalName,
    discoveredAtUtc: toIsoString(artifact.discoveredAt),
    lastSyncAtUtc: toIsoString(artifact.lastSyncAt),
  }));

  return {
    artifacts: serializedArtifacts,
    lastRefreshedAtUtc: new Date().toISOString(),
    source,
  };
}

export function deserializeArtifactCatalog(
  catalog: MetadataArtifactCatalogState | undefined
): ExplorerArtifact[] {
  return (catalog?.artifacts ?? []).map((artifact) => ({
    id: artifact.id,
    displayName: artifact.displayName,
    type: artifact.type,
    workspaceId: artifact.workspaceId,
    workspaceName: artifact.workspaceName,
    description: artifact.description,
    accessLevel: artifact.accessLevel === "None" ? undefined : artifact.accessLevel as WorkspaceRole,
    createdByDisplayName: artifact.createdByDisplayName,
    createdByUserPrincipalName: artifact.createdByUserPrincipalName,
    discoveredAt: artifact.discoveredAtUtc ? new Date(artifact.discoveredAtUtc) : undefined,
    lastSyncAt: artifact.lastSyncAtUtc ? new Date(artifact.lastSyncAtUtc) : undefined,
  }));
}