import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory, useLocation } from "react-router-dom";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { Badge, Button, Dropdown, Field, Link, Option, Spinner, Text } from "@fluentui/react-components";
import { ItemEditorDefaultView } from "../../../../components/ItemEditor";
import { useViewNavigation } from "../../../../components/ItemEditor";
import {
  InsightWorkbenchItemDefinition,
  LineageGraphState,
  MetadataArtifactCatalogState,
  PersistedLineageLink,
} from "../../InsightWorkbenchItemDefinition";
import { ItemWithDefinition } from "../../../../controller/ItemCRUDController";
import { MetadataExplorerClient } from "../../../../clients/MetadataExplorerClient";
import { ExplorerArtifact, LineageLink, formatApiError } from "../../../../services/MetadataService";
import { navigateToItem } from "../../../../controller/NavigationController";
import { Item } from "../../../../clients/FabricPlatformTypes";
import { deserializeArtifactCatalog, serializeArtifactCatalog } from "../../services/MetadataArtifactCatalogStorage";
import "../../InsightWorkbenchItem.scss";

const QUERY_PARAM_LINEAGE_ROOT_NODE_ID = "lineageRootNodeId";

interface LineageGraphViewProps {
  workloadClient: WorkloadClientAPI;
  item?: ItemWithDefinition<InsightWorkbenchItemDefinition>;
  lineageState?: LineageGraphState;
  onLineageStateChange?: (nextState: LineageGraphState) => void;
  artifactCatalog?: MetadataArtifactCatalogState;
  onArtifactCatalogChange?: (nextCatalog: MetadataArtifactCatalogState) => void;
}

interface ArtifactNode {
  id: string;
  artifact: ExplorerArtifact;
}

interface ArtifactEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationshipType: LineageLink["relationshipType"];
}

function buildArtifactGraphFallback(artifacts: ExplorerArtifact[], links: LineageLink[]): {
  nodes: ArtifactNode[];
  edges: ArtifactEdge[];
  selectableRootNodeIds: string[];
} {
  const nodes: ArtifactNode[] = artifacts.map((artifact) => ({
    id: `${artifact.workspaceId}:${artifact.id}`,
    artifact,
  }));

  const nodeIdByCompositeKey = new Map(nodes.map((node) => [node.id, node.id]));
  const edges: ArtifactEdge[] = [];
  const edgeIds = new Set<string>();

  for (const link of links) {
    const sourceId = nodeIdByCompositeKey.get(`${link.sourceWorkspaceId}:${link.sourceArtifactId}`);
    const targetId = nodeIdByCompositeKey.get(`${link.targetWorkspaceId}:${link.targetArtifactId}`);
    if (!sourceId || !targetId) {
      continue;
    }

    const edgeId = `${link.relationshipType}:${sourceId}:${targetId}`;
    if (edgeIds.has(edgeId)) {
      continue;
    }

    edgeIds.add(edgeId);
    edges.push({
      id: edgeId,
      sourceId,
      targetId,
      relationshipType: link.relationshipType,
    });
  }

  const linkedNodeIds = new Set<string>();
  for (const edge of edges) {
    linkedNodeIds.add(edge.sourceId);
    linkedNodeIds.add(edge.targetId);
  }

  const selectableRootNodeIds = nodes
    .filter((node) => linkedNodeIds.has(node.id))
    .sort((left, right) => {
      const leftText = `${left.artifact.displayName} (${left.artifact.type})`;
      const rightText = `${right.artifact.displayName} (${right.artifact.type})`;
      return leftText.localeCompare(rightText);
    })
    .map((node) => node.id);

  return { nodes, edges, selectableRootNodeIds };
}

function LineageGraphContent({
  workloadClient,
  lineageState,
  onLineageStateChange,
  artifactCatalog,
  onArtifactCatalogChange,
}: {
  workloadClient: WorkloadClientAPI;
  lineageState?: LineageGraphState;
  onLineageStateChange?: (nextState: LineageGraphState) => void;
  artifactCatalog?: MetadataArtifactCatalogState;
  onArtifactCatalogChange?: (nextCatalog: MetadataArtifactCatalogState) => void;
}) {
  const { t } = useTranslation();
  const history = useHistory();
  const location = useLocation();
  const { goBack } = useViewNavigation();
  const metadataClient = useMemo(() => new MetadataExplorerClient(workloadClient), [workloadClient]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [, setArtifacts] = useState<ExplorerArtifact[]>([]);
  const [, setLineageLinks] = useState<LineageLink[]>([]);
  const [graph, setGraph] = useState<{ nodes: ArtifactNode[]; edges: ArtifactEdge[] }>({ nodes: [], edges: [] });
  const [selectableRootNodeIds, setSelectableRootNodeIds] = useState<string[]>([]);
  const [permissionSummary, setPermissionSummary] = useState<{
    accessiblePathCount: number;
    partiallyBlockedPathCount: number;
    blockedPathCount: number;
  }>({
    accessiblePathCount: 0,
    partiallyBlockedPathCount: 0,
    blockedPathCount: 0,
  });
  const [selectedRootNodeId, setSelectedRootNodeId] = useState<string>("");
  const cachedArtifacts = useMemo(() => deserializeArtifactCatalog(artifactCatalog), [artifactCatalog]);
  const cachedLineageLinks = useMemo(
    () => (lineageState?.cachedLinks ?? []) as LineageLink[],
    [lineageState?.cachedLinks]
  );

  const deepLinkRootNodeId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get(QUERY_PARAM_LINEAGE_ROOT_NODE_ID) ?? undefined;
  }, [location.search]);

  const syncLineageDeepLink = useCallback((nextRootNodeId: string | null) => {
    const params = new URLSearchParams(location.search);

    if (nextRootNodeId) {
      params.set(QUERY_PARAM_LINEAGE_ROOT_NODE_ID, nextRootNodeId);
    } else {
      params.delete(QUERY_PARAM_LINEAGE_ROOT_NODE_ID);
    }

    const nextSearch = params.toString();
    const currentSearch = location.search.startsWith("?")
      ? location.search.slice(1)
      : location.search;

    if (nextSearch === currentSearch) {
      return;
    }

    history.replace({
      pathname: location.pathname,
      search: nextSearch.length > 0 ? `?${nextSearch}` : "",
    });
  }, [history, location.pathname, location.search]);

  const loadLineage = useCallback(async (forceRefresh: boolean = false) => {
    setIsLoading(true);
    setErrorText(null);

    try {
      if (!forceRefresh && cachedArtifacts.length > 0 && cachedLineageLinks.length > 0) {
        setArtifacts(cachedArtifacts);
        setLineageLinks(cachedLineageLinks);
        const fallbackGraph = buildArtifactGraphFallback(cachedArtifacts, cachedLineageLinks);
        setGraph({ nodes: fallbackGraph.nodes, edges: fallbackGraph.edges });
        setSelectableRootNodeIds(fallbackGraph.selectableRootNodeIds);
        setPermissionSummary(
          lineageState?.cachedPermissionSummary ?? {
            accessiblePathCount: 0,
            partiallyBlockedPathCount: 0,
            blockedPathCount: 0,
          }
        );
        return;
      }

      const artifactsToUse = cachedArtifacts.length > 0
        ? cachedArtifacts
        : (await metadataClient.loadArtifacts({ includeTrace: false, maxArtifacts: 0 })).artifacts;
      setArtifacts(artifactsToUse);
      if (cachedArtifacts.length === 0) {
        onArtifactCatalogChange?.(serializeArtifactCatalog(artifactsToUse, "view-load"));
      }

      const lineageResponse = await metadataClient.loadLineageLinksWithPermissions({
        artifacts: artifactsToUse,
      });
      setLineageLinks(lineageResponse.links);
      setPermissionSummary(lineageResponse.permissionSummary);

      if (lineageResponse.graph) {
        setGraph({
          nodes: lineageResponse.graph.nodes,
          edges: lineageResponse.graph.edges,
        });
        setSelectableRootNodeIds(lineageResponse.graph.selectableRootNodeIds);
      } else {
        const fallbackGraph = buildArtifactGraphFallback(artifactsToUse, lineageResponse.links);
        setGraph({ nodes: fallbackGraph.nodes, edges: fallbackGraph.edges });
        setSelectableRootNodeIds(fallbackGraph.selectableRootNodeIds);
      }

      onLineageStateChange?.({
        ...(lineageState ?? {}),
        cachedLinks: lineageResponse.links as PersistedLineageLink[],
        cachedPermissionSummary: lineageResponse.permissionSummary,
        lastRefreshedAtUtc: new Date().toISOString(),
        source: forceRefresh ? "manual-refresh" : "view-load",
      });
    } catch (error) {
      setErrorText(
        `${t(
          "InsightWorkbench_LineageGraph_LoadError",
          "Failed to load artifacts for lineage analysis."
        )} ${formatApiError(error)}`
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    cachedArtifacts,
    cachedLineageLinks,
    lineageState,
    metadataClient,
    onArtifactCatalogChange,
    onLineageStateChange,
    t,
  ]);

  useEffect(() => {
    void loadLineage();
  }, [loadLineage]);

  const nodeById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes]
  );

  const selectableRoots = useMemo(() => {
    return selectableRootNodeIds
      .map((nodeId) => nodeById.get(nodeId))
      .filter((node): node is ArtifactNode => Boolean(node));
  }, [nodeById, selectableRootNodeIds]);

  useEffect(() => {
    if (selectedRootNodeId) {
      return;
    }

    if (selectableRoots.length > 0) {
      setSelectedRootNodeId(selectableRoots[0].id);
    }
  }, [selectedRootNodeId, selectableRoots]);

  useEffect(() => {
    if (!deepLinkRootNodeId || selectableRoots.length === 0) {
      return;
    }

    if (selectedRootNodeId === deepLinkRootNodeId) {
      return;
    }

    const requestedRoot = selectableRoots.find((node) => node.id === deepLinkRootNodeId);
    if (requestedRoot) {
      setSelectedRootNodeId(requestedRoot.id);
    }
  }, [deepLinkRootNodeId, selectableRoots, selectedRootNodeId]);

  useEffect(() => {
    syncLineageDeepLink(selectedRootNodeId || null);
  }, [selectedRootNodeId, syncLineageDeepLink]);

  const selectedRoot = selectedRootNodeId ? nodeById.get(selectedRootNodeId) : undefined;

  const directUpstream = useMemo(() => {
    if (!selectedRoot) {
      return [] as Array<{ node: ArtifactNode; relationshipType: LineageLink["relationshipType"] }>;
    }

    return graph.edges
      .filter((edge) => edge.targetId === selectedRoot.id)
      .map((edge) => ({
        node: nodeById.get(edge.sourceId),
        relationshipType: edge.relationshipType,
      }))
      .filter(
        (entry): entry is { node: ArtifactNode; relationshipType: LineageLink["relationshipType"] } =>
          Boolean(entry.node)
      );
  }, [graph.edges, nodeById, selectedRoot]);

  const directDownstream = useMemo(() => {
    if (!selectedRoot) {
      return [] as Array<{ node: ArtifactNode; relationshipType: LineageLink["relationshipType"] }>;
    }

    return graph.edges
      .filter((edge) => edge.sourceId === selectedRoot.id)
      .map((edge) => ({
        node: nodeById.get(edge.targetId),
        relationshipType: edge.relationshipType,
      }))
      .filter(
        (entry): entry is { node: ArtifactNode; relationshipType: LineageLink["relationshipType"] } =>
          Boolean(entry.node)
      );
  }, [graph.edges, nodeById, selectedRoot]);

  const openArtifact = useCallback(
    async (artifact: ExplorerArtifact) => {
      const itemToOpen: Item = {
        id: artifact.id,
        type: artifact.type,
        displayName: artifact.displayName,
        description: artifact.description,
        workspaceId: artifact.workspaceId,
      };
      await navigateToItem(workloadClient, itemToOpen);
    },
    [workloadClient]
  );

  return (
    <div className="insight-workbench-view insight-workbench-lineage-minimal">
      <div className="insight-workbench-lineage-header">
        <div>
          <h2 className="insight-workbench-section-title">
            {t("InsightWorkbench_LineageGraph_Label", "Lineage & Dependency Graph")}
          </h2>
          <Text>
            {t(
              "InsightWorkbench_LineageGraph_Minimal_Intro",
              "Minimal lineage view focused on direct dependencies: report → dataset → lakehouse."
            )}
          </Text>
        </div>
        <Button appearance="subtle" onClick={goBack}>
          {t("InsightWorkbench_BackToHub", "← Back to Hub")}
        </Button>
      </div>

      <div className="insight-workbench-lineage-controls">
        <Field label={t("InsightWorkbench_LineageGraph_Control_Root", "Traversal root")}>
          <Dropdown
            selectedOptions={[selectedRootNodeId || "none"]}
            value={
              selectedRoot
                ? `${selectedRoot.artifact.displayName} (${selectedRoot.artifact.type})`
                : t("InsightWorkbench_LineageGraph_Control_Root_None", "All entities")
            }
            onOptionSelect={(_, data) => {
              const next = data.optionValue ?? "";
              setSelectedRootNodeId(next === "none" ? "" : next);
            }}
          >
            <Option value="none">{t("InsightWorkbench_LineageGraph_Control_Root_None", "All entities")}</Option>
            {selectableRoots.map((node) => (
              <Option key={node.id} value={node.id}>
                {`${node.artifact.displayName} (${node.artifact.type}) • ${node.artifact.workspaceName}`}
              </Option>
            ))}
          </Dropdown>
        </Field>
        <Button appearance="secondary" onClick={(): void => {
          void loadLineage(true);
        }}>
          {t("InsightWorkbench_LineageGraph_Refresh", "Refresh")}
        </Button>
      </div>

      {isLoading ? (
        <div className="insight-workbench-lineage-loading">
          <Spinner label={t("InsightWorkbench_LineageGraph_Loading", "Loading lineage...")} />
        </div>
      ) : errorText ? (
        <div className="insight-workbench-lineage-error">
          <Text>{errorText}</Text>
          <Button appearance="primary" onClick={(): void => {
            void loadLineage(true);
          }}>
            {t("InsightWorkbench_LineageGraph_Retry", "Retry")}
          </Button>
        </div>
      ) : (
        <>
          <div className="insight-workbench-lineage-summary">
            <Badge appearance="filled">{`${graph.nodes.length} ${t("InsightWorkbench_LineageGraph_Nodes", "nodes")}`}</Badge>
            <Badge appearance="outline">{`${graph.edges.length} ${t("InsightWorkbench_LineageGraph_Edges", "edges")}`}</Badge>
            <Badge appearance="tint">{`${permissionSummary.accessiblePathCount} ${t("InsightWorkbench_LineageGraph_AccessiblePaths", "accessible paths")}`}</Badge>
            <Badge appearance="outline">{`${permissionSummary.partiallyBlockedPathCount} ${t("InsightWorkbench_LineageGraph_PartialBlockedPaths", "partially blocked")}`}</Badge>
            <Badge appearance="outline">{`${permissionSummary.blockedPathCount} ${t("InsightWorkbench_LineageGraph_BlockedPaths", "blocked")}`}</Badge>
            {lineageState?.lastRefreshedAtUtc ? (
              <Badge appearance="outline">
                {t("InsightWorkbench_LineageGraph_LastRefreshed", "Refreshed {{time}}", {
                  time: new Date(lineageState.lastRefreshedAtUtc).toLocaleString(),
                })}
              </Badge>
            ) : null}
          </div>

          {selectedRoot ? (
            <div className="insight-workbench-lineage-flow">
              <section className="insight-workbench-lineage-column">
                <Text weight="semibold">{t("InsightWorkbench_LineageGraph_Minimal_Upstream", "Upstream")}</Text>
                {directUpstream.length === 0 ? (
                  <Text>{t("InsightWorkbench_LineageGraph_Minimal_EmptyUpstream", "No direct upstream artifacts.")}</Text>
                ) : (
                  <div className="insight-workbench-lineage-card-list">
                    {directUpstream.map((entry) => (
                      <div key={`${entry.node.id}:${entry.relationshipType}`} className="insight-workbench-lineage-card">
                        <Link onClick={(): void => {
                          void openArtifact(entry.node.artifact);
                        }}>
                          {entry.node.artifact.displayName}
                        </Link>
                        <Text>{`${entry.node.artifact.type} • ${entry.node.artifact.workspaceName}`}</Text>
                        <Badge appearance="outline">{entry.relationshipType}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="insight-workbench-lineage-column insight-workbench-lineage-column--center">
                <Text weight="semibold">{t("InsightWorkbench_LineageGraph_Minimal_Selected", "Selected")}</Text>
                <div className="insight-workbench-lineage-card">
                  <Link onClick={(): void => {
                    void openArtifact(selectedRoot.artifact);
                  }}>
                    {selectedRoot.artifact.displayName}
                  </Link>
                  <Text>{`${selectedRoot.artifact.type} • ${selectedRoot.artifact.workspaceName}`}</Text>
                </div>
              </section>

              <section className="insight-workbench-lineage-column">
                <Text weight="semibold">{t("InsightWorkbench_LineageGraph_Minimal_Downstream", "Downstream")}</Text>
                {directDownstream.length === 0 ? (
                  <Text>{t("InsightWorkbench_LineageGraph_Minimal_EmptyDownstream", "No direct downstream artifacts.")}</Text>
                ) : (
                  <div className="insight-workbench-lineage-card-list">
                    {directDownstream.map((entry) => (
                      <div key={`${entry.node.id}:${entry.relationshipType}`} className="insight-workbench-lineage-card">
                        <Link onClick={(): void => {
                          void openArtifact(entry.node.artifact);
                        }}>
                          {entry.node.artifact.displayName}
                        </Link>
                        <Text>{`${entry.node.artifact.type} • ${entry.node.artifact.workspaceName}`}</Text>
                        <Badge appearance="outline">{entry.relationshipType}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="insight-workbench-lineage-empty">
              <Text>
                {t(
                  "InsightWorkbench_LineageGraph_EmptyArtifacts",
                  "No artifacts were discovered. Verify workspace access and refresh."
                )}
              </Text>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function LineageGraphView({
  workloadClient,
  lineageState,
  onLineageStateChange,
  artifactCatalog,
  onArtifactCatalogChange,
}: LineageGraphViewProps) {
  return (
    <ItemEditorDefaultView
      center={{
        content: (
          <LineageGraphContent
            workloadClient={workloadClient}
            lineageState={lineageState}
            onLineageStateChange={onLineageStateChange}
            artifactCatalog={artifactCatalog}
            onArtifactCatalogChange={onArtifactCatalogChange}
          />
        ),
      }}
    />
  );
}
